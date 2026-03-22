import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  evaluateAutonomyPolicy,
  type AutonomyPolicyDecisionType,
} from "@/lib/autonomy-policy";
import { applyFounderVoiceToText } from "@/lib/founder-voice";
import {
  buildInfluencerGraphState,
  recordInfluencerInteraction,
  type InfluencerGraphRow,
} from "@/lib/influencer-graph";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";

const SAFE_REPLY_STORE_PATH = path.join(process.cwd(), "data", "safe-replies.json");

export const SAFE_REPLY_TYPES = [
  "thank_you",
  "simple_acknowledgement",
  "clarification",
  "soft_follow_up",
  "manual_review_required",
] as const;

export const SAFE_REPLY_RISK_LEVELS = ["low", "medium", "high"] as const;

export const SAFE_REPLY_ELIGIBILITY_STATES = [
  "safe_to_stage",
  "review_required",
  "blocked",
] as const;

export const SAFE_REPLY_STATUSES = [
  "suggested",
  "staged",
  "approved",
  "dismissed",
] as const;

export type SafeReplyType = (typeof SAFE_REPLY_TYPES)[number];
export type SafeReplyRiskLevel = (typeof SAFE_REPLY_RISK_LEVELS)[number];
export type SafeReplyEligibility = (typeof SAFE_REPLY_ELIGIBILITY_STATES)[number];
export type SafeReplyStatus = (typeof SAFE_REPLY_STATUSES)[number];

export const safeReplyStoreEntrySchema = z.object({
  replyId: z.string().trim().min(1),
  influencerId: z.string().trim().min(1),
  sourceInteractionId: z.string().trim().min(1),
  signalId: z.string().trim().nullable().default(null),
  status: z.enum(SAFE_REPLY_STATUSES).default("suggested"),
  editedReply: z.string().trim().nullable().default(null),
  classificationLoggedAt: z.string().trim().nullable().default(null),
  stagedAt: z.string().trim().nullable().default(null),
  approvedAt: z.string().trim().nullable().default(null),
  dismissedAt: z.string().trim().nullable().default(null),
  updatedAt: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
});

const safeReplyStoreSchema = z.object({
  entries: z.array(safeReplyStoreEntrySchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export const safeReplyActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("stage_reply"),
    replyId: z.string().trim().min(1),
    replyText: z.string().trim().nullable().optional(),
  }),
  z.object({
    action: z.literal("approve_reply"),
    replyId: z.string().trim().min(1),
    replyText: z.string().trim().nullable().optional(),
  }),
  z.object({
    action: z.literal("dismiss_reply"),
    replyId: z.string().trim().min(1),
  }),
]);

export interface SafeReplyItem {
  replyId: string;
  influencerId: string;
  influencerName: string;
  platform: string;
  relationshipStage: string;
  signalId: string | null;
  sourceInteractionId: string;
  sourceMessage: string | null;
  sourceContext: string | null;
  receivedAt: string;
  replyType: SafeReplyType;
  replyEligibility: SafeReplyEligibility;
  replyRiskLevel: SafeReplyRiskLevel;
  blockReasons: string[];
  policyDecision: AutonomyPolicyDecisionType;
  policySummary: string;
  suggestedReply: string | null;
  toneLabel: string;
  followUpSuggestion: string | null;
  status: SafeReplyStatus;
  stagedAt: string | null;
  approvedAt: string | null;
  dismissedAt: string | null;
  openReplyHref: string;
}

export interface SafeReplySummary {
  lowRiskReadyCount: number;
  stagedCount: number;
  reviewRequiredCount: number;
  blockedCount: number;
  totalOpenCount: number;
}

export interface SafeReplyState {
  rows: SafeReplyItem[];
  summary: SafeReplySummary;
}

type SafeReplyStoreEntry = z.infer<typeof safeReplyStoreEntrySchema>;
let inMemorySafeReplyStore = safeReplyStoreSchema.parse({
  entries: [],
  updatedAt: null,
});

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

function buildReplyId(influencerId: string, sourceInteractionId: string) {
  return `safe-reply:${influencerId}:${sourceInteractionId}`;
}

function buildTopicHint(row: InfluencerGraphRow) {
  const topicSource = `${row.latestInteraction?.message ?? ""} ${row.latestInteraction?.context ?? ""}`.toLowerCase();
  if (topicSource.includes("parent")) {
    return "parent communication";
  }
  if (topicSource.includes("teacher")) {
    return "teacher communication";
  }
  if (topicSource.includes("behaviour")) {
    return "behaviour documentation";
  }
  if (topicSource.includes("founder")) {
    return "founder notes";
  }
  return "the day-to-day wording around it";
}

function analyzeReply(row: InfluencerGraphRow): Omit<SafeReplyItem,
  | "replyId"
  | "influencerId"
  | "influencerName"
  | "platform"
  | "relationshipStage"
  | "signalId"
  | "sourceInteractionId"
  | "receivedAt"
  | "status"
  | "stagedAt"
  | "approvedAt"
  | "dismissedAt"
  | "openReplyHref"> {
  const inboundMessage = normalizeText(row.latestInteraction?.message);
  const inboundContext = normalizeText(row.latestInteraction?.context);
  const combined = `${inboundMessage ?? ""} ${inboundContext ?? ""}`.toLowerCase();
  const blockReasons: string[] = [];

  if (!inboundMessage) {
    blockReasons.push("Inbound message is too thin to classify safely.");
  }

  if (
    /\b(refund|payment|billing|invoice|price|pricing|subscription|trial)\b/i.test(combined)
  ) {
    blockReasons.push("Payment or commercial language requires manual review.");
  }

  if (/\b(legal|lawyer|policy|compliance|gdpr|safeguarding)\b/i.test(combined)) {
    blockReasons.push("Legal or policy language requires manual review.");
  }

  if (
    /\b(angry|upset|frustrated|disappointed|terrible|harm|fraud|misleading|unacceptable|complaint|issue|problem)\b/i.test(
      combined,
    )
  ) {
    blockReasons.push("Emotionally charged or complaint language is not safe to automate.");
  }

  if (/\b(support|bug|broken|error|account|login|unable to access)\b/i.test(combined)) {
    blockReasons.push("Support-style replies must stay manual.");
  }

  const hasQuestion = combined.includes("?") || /\b(what|how|why|when|do you mean|can you)\b/i.test(combined);
  const isThanks = /\b(thanks|thank you|appreciate)\b/i.test(combined);
  const isAcknowledgement = /\b(makes sense|good point|agree|helpful|useful|fair point)\b/i.test(combined);
  const wantsNextStep = /\b(compare notes|chat|connect|follow up|collab|collaboration|next step|exchange)\b/i.test(combined);

  let replyType: SafeReplyType = "manual_review_required";
  let replyRiskLevel: SafeReplyRiskLevel = "medium";

  if (blockReasons.length === 0 && wantsNextStep) {
    replyType = "soft_follow_up";
    replyRiskLevel = "low";
  } else if (blockReasons.length === 0 && hasQuestion) {
    replyType = "clarification";
    replyRiskLevel = "low";
  } else if (blockReasons.length === 0 && isThanks) {
    replyType = "thank_you";
    replyRiskLevel = "low";
  } else if (blockReasons.length === 0 && isAcknowledgement) {
    replyType = "simple_acknowledgement";
    replyRiskLevel = "low";
  }

  const policy = evaluateAutonomyPolicy({
    actionType: "suggest_reply",
    ambiguityRisk: replyRiskLevel,
    relationshipKnown: Boolean(row.latestInteraction?.interactionId),
  });
  const replyEligibility: SafeReplyEligibility =
    policy.decision === "allow"
      ? "safe_to_stage"
      : policy.decision === "suggest_only"
        ? "review_required"
        : "blocked";
  const combinedBlockReasons =
    replyEligibility === "blocked"
      ? [...new Set([...blockReasons, ...policy.reasons])]
      : replyEligibility === "review_required"
        ? policy.reasons
        : [];

  const name = firstName(row.influencer.name);
  const topicHint = buildTopicHint(row);
  let suggestedReply: string | null = null;
  let followUpSuggestion: string | null = null;

  if (replyEligibility === "safe_to_stage") {
    switch (replyType) {
      case "thank_you":
        suggestedReply = `Thanks, ${name}. I appreciate the note.`;
        break;
      case "simple_acknowledgement":
        suggestedReply = `That makes sense, ${name}. I appreciate you saying it plainly.`;
        break;
      case "clarification":
        suggestedReply = `That makes sense. When I say ${topicHint}, I mean the day-to-day wording and judgement around it, not a bigger dramatic claim.`;
        followUpSuggestion = "If they ask for more, answer with one concrete example only.";
        break;
      case "soft_follow_up":
        suggestedReply = `Thanks, ${name}. That feels aligned. If useful, I’d be glad to compare notes on a small practical next step.`;
        followUpSuggestion = "Keep the next step small and practical, not a hard collaboration ask.";
        break;
      default:
        suggestedReply = null;
    }
  }

  return {
    sourceMessage: inboundMessage,
    sourceContext: inboundContext,
    replyType,
    replyEligibility,
    replyRiskLevel,
    blockReasons: combinedBlockReasons,
    policyDecision: policy.decision,
    policySummary: policy.summary,
    suggestedReply: suggestedReply ? applyFounderVoiceToText(suggestedReply, "founder_voice_on") : null,
    toneLabel: replyEligibility === "safe_to_stage" ? "Founder voice · calm and low-pressure" : "Manual review required",
    followUpSuggestion,
  };
}

async function readPersistedStore() {
  try {
    const raw = await readFile(SAFE_REPLY_STORE_PATH, "utf8");
    const store = safeReplyStoreSchema.parse(JSON.parse(raw));
    inMemorySafeReplyStore = store;
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemorySafeReplyStore;
    }
    throw error;
  }
}

async function writeStore(store: z.infer<typeof safeReplyStoreSchema>) {
  const parsed = safeReplyStoreSchema.parse(store);
  inMemorySafeReplyStore = parsed;

  try {
    await mkdir(path.dirname(SAFE_REPLY_STORE_PATH), { recursive: true });
    await writeFile(SAFE_REPLY_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("safe-replies", error);
      return;
    }

    throw error;
  }
}

function sortRows(rows: SafeReplyItem[]) {
  return [...rows].sort(
    (left, right) =>
      new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime() ||
      left.influencerName.localeCompare(right.influencerName),
  );
}

function buildSummary(rows: SafeReplyItem[]): SafeReplySummary {
  return {
    lowRiskReadyCount: rows.filter((row) => row.replyEligibility === "safe_to_stage" && row.status === "suggested").length,
    stagedCount: rows.filter((row) => row.status === "staged").length,
    reviewRequiredCount: rows.filter((row) => row.replyEligibility === "review_required").length,
    blockedCount: rows.filter((row) => row.replyEligibility === "blocked").length,
    totalOpenCount: rows.length,
  };
}

async function synchronizeStore(entries: SafeReplyStoreEntry[]) {
  const now = new Date().toISOString();
  await writeStore(
    safeReplyStoreSchema.parse({
      entries,
      updatedAt: now,
    }),
  );
}

async function ensureClassificationAudit(rows: SafeReplyItem[], storeEntries: SafeReplyStoreEntry[]) {
  const entryMap = new Map(storeEntries.map((entry) => [entry.replyId, entry]));
  const events: Parameters<typeof appendAuditEventsSafe>[0] = [];
  let changed = false;

  for (const row of rows) {
    const existing = entryMap.get(row.replyId);
    if (existing?.classificationLoggedAt) {
      continue;
    }

    const timestamp = new Date().toISOString();
    const nextEntry = safeReplyStoreEntrySchema.parse({
      replyId: row.replyId,
      influencerId: row.influencerId,
      sourceInteractionId: row.sourceInteractionId,
      signalId: row.signalId,
      status: existing?.status ?? "suggested",
      editedReply: existing?.editedReply ?? null,
      classificationLoggedAt: timestamp,
      stagedAt: existing?.stagedAt ?? null,
      approvedAt: existing?.approvedAt ?? null,
      dismissedAt: existing?.dismissedAt ?? null,
      updatedAt: timestamp,
      createdAt: existing?.createdAt ?? timestamp,
    });

    entryMap.set(row.replyId, nextEntry);
    changed = true;
    events.push({
      signalId: row.signalId ?? `influencer:${row.influencerId}`,
      eventType: "SAFE_REPLY_CLASSIFIED",
      actor: "system",
      summary: `Classified ${row.influencerName} reply as ${row.replyEligibility.replaceAll("_", " ")}.`,
      metadata: {
        influencerId: row.influencerId,
        replyType: row.replyType,
        riskLevel: row.replyRiskLevel,
        blockCount: row.blockReasons.length,
      },
    });
    events.push({
      signalId: row.signalId ?? `influencer:${row.influencerId}`,
      eventType: "AUTONOMY_POLICY_EVALUATED",
      actor: "system",
      summary: `Evaluated autonomy policy for ${row.influencerName} reply handling.`,
      metadata: {
        actionType: "suggest_reply",
        decision: row.policyDecision,
      },
    });
    events.push({
      signalId: row.signalId ?? `influencer:${row.influencerId}`,
      eventType:
        row.policyDecision === "allow"
          ? "AUTONOMY_POLICY_ALLOWED_ACTION"
          : row.policyDecision === "suggest_only"
            ? "AUTONOMY_POLICY_SUGGESTED_ONLY"
            : "AUTONOMY_POLICY_BLOCKED_ACTION",
      actor: "system",
      summary: `Reply handling is ${row.policyDecision.replaceAll("_", " ")} for ${row.influencerName}.`,
      metadata: {
        actionType: "suggest_reply",
        decision: row.policyDecision,
        reason: row.policySummary,
      },
    });
  }

  if (changed) {
    await synchronizeStore(Array.from(entryMap.values()));
  }
  if (events.length > 0) {
    await appendAuditEventsSafe(events);
  }
}

export async function buildSafeReplyState(): Promise<SafeReplyState> {
  const [graphState, persistedStore] = await Promise.all([
    buildInfluencerGraphState(),
    readPersistedStore(),
  ]);

  const entryMap = new Map(persistedStore.entries.map((entry) => [entry.replyId, entry]));

  const rows = graphState.rows
    .filter((row) => row.newReplyPending && row.latestInteraction?.interactionType === "reply_received")
    .map((row) => {
      const sourceInteractionId = row.latestInteraction?.interactionId ?? `${row.influencer.influencerId}:latest`;
      const replyId = buildReplyId(row.influencer.influencerId, sourceInteractionId);
      const analysis = analyzeReply(row);
      const persisted = entryMap.get(replyId);

      return {
        replyId,
        influencerId: row.influencer.influencerId,
        influencerName: row.influencer.name,
        platform: row.influencer.platform,
        relationshipStage: row.influencer.relationshipStage,
        signalId: row.latestInteraction?.signalId ?? null,
        sourceInteractionId,
        receivedAt: row.latestInteraction?.timestamp ?? row.influencer.updatedAt,
        status: persisted?.status ?? "suggested",
        stagedAt: persisted?.stagedAt ?? null,
        approvedAt: persisted?.approvedAt ?? null,
        dismissedAt: persisted?.dismissedAt ?? null,
        openReplyHref: row.latestInteraction?.signalId
          ? `/signals/${row.latestInteraction.signalId}/outreach`
          : "/influencers",
        ...analysis,
        suggestedReply: normalizeText(persisted?.editedReply) ?? analysis.suggestedReply,
      } satisfies SafeReplyItem;
    })
    .filter((row) => row.status !== "dismissed" && row.status !== "approved");

  const sortedRows = sortRows(rows);
  await ensureClassificationAudit(sortedRows, persistedStore.entries);

  return {
    rows: sortedRows,
    summary: buildSummary(sortedRows),
  };
}

async function getReplyOrThrow(replyId: string) {
  const [state, persistedStore] = await Promise.all([
    buildSafeReplyState(),
    readPersistedStore(),
  ]);
  const reply = state.rows.find((row) => row.replyId === replyId);
  if (!reply) {
    throw new Error("Safe reply suggestion not found.");
  }

  const entryMap = new Map(persistedStore.entries.map((entry) => [entry.replyId, entry]));
  return { reply, entryMap };
}

export async function stageSafeReply(replyId: string, replyText?: string | null): Promise<SafeReplyItem> {
  const { reply, entryMap } = await getReplyOrThrow(replyId);

  if (reply.replyEligibility !== "safe_to_stage") {
    throw new Error("Only low-risk replies can be staged.");
  }

  const now = new Date().toISOString();
  entryMap.set(
    reply.replyId,
    safeReplyStoreEntrySchema.parse({
      replyId: reply.replyId,
      influencerId: reply.influencerId,
      sourceInteractionId: reply.sourceInteractionId,
      signalId: reply.signalId,
      status: "staged",
      editedReply: normalizeText(replyText) ?? reply.suggestedReply,
      classificationLoggedAt: entryMap.get(reply.replyId)?.classificationLoggedAt ?? now,
      stagedAt: now,
      approvedAt: entryMap.get(reply.replyId)?.approvedAt ?? null,
      dismissedAt: null,
      updatedAt: now,
      createdAt: entryMap.get(reply.replyId)?.createdAt ?? now,
    }),
  );

  await synchronizeStore(Array.from(entryMap.values()));
  await appendAuditEventsSafe([
    {
      signalId: reply.signalId ?? `influencer:${reply.influencerId}`,
      eventType: "SAFE_REPLY_STAGED",
      actor: "operator",
      summary: `Staged low-risk reply for ${reply.influencerName}.`,
      metadata: {
        influencerId: reply.influencerId,
        replyType: reply.replyType,
      },
    },
  ]);

  const refreshed = await buildSafeReplyState();
  return refreshed.rows.find((row) => row.replyId === replyId) ?? {
    ...reply,
    status: "staged",
    suggestedReply: normalizeText(replyText) ?? reply.suggestedReply,
    stagedAt: now,
  };
}

export async function approveSafeReply(replyId: string, replyText?: string | null): Promise<SafeReplyItem | null> {
  const { reply, entryMap } = await getReplyOrThrow(replyId);

  if (reply.replyEligibility !== "safe_to_stage") {
    throw new Error("This reply requires manual judgement and cannot be approved from safe mode.");
  }

  const approvedReply = normalizeText(replyText) ?? reply.suggestedReply;
  if (!approvedReply) {
    throw new Error("No reply text is available to approve.");
  }

  await recordInfluencerInteraction({
    influencerId: reply.influencerId,
    interactionType: reply.replyType === "soft_follow_up" ? "follow_up_sent" : "message_sent",
    message: approvedReply,
    context: `Safe reply approved for ${reply.influencerName}.`,
    signalId: reply.signalId,
  });

  const now = new Date().toISOString();
  entryMap.set(
    reply.replyId,
    safeReplyStoreEntrySchema.parse({
      replyId: reply.replyId,
      influencerId: reply.influencerId,
      sourceInteractionId: reply.sourceInteractionId,
      signalId: reply.signalId,
      status: "approved",
      editedReply: approvedReply,
      classificationLoggedAt: entryMap.get(reply.replyId)?.classificationLoggedAt ?? now,
      stagedAt: entryMap.get(reply.replyId)?.stagedAt ?? null,
      approvedAt: now,
      dismissedAt: null,
      updatedAt: now,
      createdAt: entryMap.get(reply.replyId)?.createdAt ?? now,
    }),
  );

  await synchronizeStore(Array.from(entryMap.values()));
  await appendAuditEventsSafe([
    {
      signalId: reply.signalId ?? `influencer:${reply.influencerId}`,
      eventType: "SAFE_REPLY_APPROVED",
      actor: "operator",
      summary: `Approved safe reply for ${reply.influencerName}.`,
      metadata: {
        influencerId: reply.influencerId,
        replyType: reply.replyType,
      },
    },
  ]);

  return null;
}

export async function dismissSafeReply(replyId: string): Promise<void> {
  const { reply, entryMap } = await getReplyOrThrow(replyId);
  const now = new Date().toISOString();
  entryMap.set(
    reply.replyId,
    safeReplyStoreEntrySchema.parse({
      replyId: reply.replyId,
      influencerId: reply.influencerId,
      sourceInteractionId: reply.sourceInteractionId,
      signalId: reply.signalId,
      status: "dismissed",
      editedReply: entryMap.get(reply.replyId)?.editedReply ?? reply.suggestedReply,
      classificationLoggedAt: entryMap.get(reply.replyId)?.classificationLoggedAt ?? now,
      stagedAt: entryMap.get(reply.replyId)?.stagedAt ?? null,
      approvedAt: entryMap.get(reply.replyId)?.approvedAt ?? null,
      dismissedAt: now,
      updatedAt: now,
      createdAt: entryMap.get(reply.replyId)?.createdAt ?? now,
    }),
  );

  await synchronizeStore(Array.from(entryMap.values()));
  await appendAuditEventsSafe([
    {
      signalId: reply.signalId ?? `influencer:${reply.influencerId}`,
      eventType: "SAFE_REPLY_DISMISSED",
      actor: "operator",
      summary: `Dismissed safe reply suggestion for ${reply.influencerName}.`,
      metadata: {
        influencerId: reply.influencerId,
        replyType: reply.replyType,
      },
    },
  ]);
}
