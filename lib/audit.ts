import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { getCopilotGuidance, type CopilotActionKey } from "@/lib/copilot";
import type { OperatorTuningSettings } from "@/lib/tuning";
import { mockAuditEventsSeed } from "@/lib/mock-data";
import type { SignalRecord, SignalScoringResult } from "@/types/signal";

const AUDIT_STORE_PATH = path.join(process.cwd(), "data", "signal-audit-events.json");
const MAX_EVENTS_PER_SIGNAL = 50;

export const AUDIT_EVENT_TYPES = [
  "INGESTED",
  "SCORED",
  "RECOMMENDED_ACTION",
  "PATTERN_CANDIDATE_DETECTED",
  "PATTERN_GAP_DETECTED",
  "PATTERN_SUGGESTED",
  "SCENARIO_ANGLE_ADDED",
  "INTERPRETATION_RUN",
  "INTERPRETATION_SAVED",
  "GENERATION_RUN",
  "GENERATION_SAVED",
  "ASSETS_GENERATED",
  "ASSET_SELECTED",
  "IMAGE_GENERATED",
  "PUBLISH_PREP_GENERATED",
  "PUBLISH_PREP_EDITED",
  "SITE_LINK_SELECTED",
  "PUBLISH_LINK_UPDATED",
  "HOOK_SELECTED",
  "CTA_SELECTED",
  "REPURPOSING_GENERATED",
  "REPURPOSED_OUTPUT_EDITED",
  "REPURPOSED_OUTPUT_SELECTED",
  "STATUS_CHANGED",
  "OPERATOR_OVERRIDE",
  "FEEDBACK_ADDED",
  "PATTERN_CREATED",
  "PATTERN_CREATED_FROM_GAP",
  "PATTERN_RETIRED",
  "PATTERN_REACTIVATED",
  "PATTERN_BUNDLE_CREATED",
  "PATTERN_ASSIGNED_TO_BUNDLE",
  "PATTERN_REMOVED_FROM_BUNDLE",
  "PATTERN_APPLIED",
  "PATTERN_FEEDBACK_ADDED",
  "PATTERN_UPDATED",
  "PLAYBOOK_GAP_DETECTED",
  "PLAYBOOK_CARD_CREATED",
  "PLAYBOOK_CARD_CREATED_FROM_GAP",
  "PLAYBOOK_CARD_UPDATED",
  "PLAYBOOK_CARD_RETIRED",
  "PLAYBOOK_PACK_CREATED",
  "PLAYBOOK_PACK_USED",
  "NARRATIVE_SEQUENCE_CREATED",
  "NARRATIVE_SEQUENCE_STEP_ASSIGNED",
  "NARRATIVE_SEQUENCE_REFERENCED",
  "EDITORIAL_CONFIDENCE_SNAPSHOT",
  "AUTO_INTERPRETED",
  "AUTO_GENERATED",
  "AUTO_HELD_FOR_REVIEW",
  "AUTO_PROMOTED_TO_APPROVAL_QUEUE",
  "AUTO_REPAIR_ATTEMPTED",
  "AUTO_REPAIR_PROMOTED",
  "AUTO_REPAIR_FAILED",
  "DUPLICATE_CLUSTER_CREATED",
  "DUPLICATE_CLUSTER_CONFIRMED",
  "DUPLICATE_CLUSTER_REJECTED",
  "EVERGREEN_CANDIDATE_IDENTIFIED",
  "EVERGREEN_RESURFACED",
  "EVERGREEN_SUPPRESSED",
  "EVERGREEN_APPROVED_FOR_REUSE",
  "CAMPAIGN_CREATED",
  "CAMPAIGN_UPDATED",
  "WEEKLY_PLAN_CREATED",
  "WEEKLY_PLAN_UPDATED",
  "WEEKLY_PLAN_AUTO_DRAFTED",
  "WEEKLY_PLAN_DRAFT_ACCEPTED",
  "WEEKLY_PLAN_DRAFT_EDITED",
  "WEEKLY_PLAN_DRAFT_DISMISSED",
  "WEEKLY_RECAP_GENERATED",
  "OPTIMISATION_PROPOSAL_GENERATED",
  "GROWTH_DIRECTOR_SUMMARY_GENERATED",
  "GROWTH_SCORECARD_COMPUTED",
  "WEEKLY_POSTING_PACK_GENERATED",
  "WEEKLY_POSTING_PACK_ITEM_REMOVED",
  "WEEKLY_POSTING_PACK_ITEM_APPROVED",
  "WEEKLY_EXECUTION_AUTOPILOT_RUN",
  "WEEKLY_EXECUTION_ITEM_STAGED",
  "WEEKLY_EXECUTION_ITEM_BLOCKED",
  "WEEKLY_EXECUTION_ORDER_ASSIGNED",
  "EXECUTION_CHAIN_STARTED",
  "EXECUTION_CHAIN_COMPLETED",
  "EXECUTION_CHAIN_ABORTED",
  "SOURCE_CHANGE_PROPOSED",
  "SOURCE_CHANGE_APPROVED",
  "SOURCE_CHANGE_DISMISSED",
  "CONFLICT_DETECTED",
  "CONFLICT_RESOLVED",
  "CONFLICT_ACTION_APPLIED",
  "QUEUE_ITEM_MARKED_STALE",
  "QUEUE_ITEM_MOVED_TO_EVERGREEN_LATER",
  "QUEUE_ITEM_SUPPRESSED",
  "QUEUE_ITEM_REFRESH_REQUESTED",
  "QUEUE_TRIAGE_ASSIGNED",
  "QUEUE_TRIAGE_CHANGED",
  "QUEUE_TRIAGE_SUPPRESSED",
  "OPERATOR_TASK_CREATED",
  "OPERATOR_TASK_COMPLETED",
  "OPERATOR_TASK_DISMISSED",
  "OPERATOR_TASK_AUTO_CLOSED",
  "CONTENT_CONTEXT_ASSIGNED",
  "CONTEXT_AUTO_ASSIGNED",
  "TUNING_PRESET_CHANGED",
  "TUNING_SETTING_UPDATED",
  "TUNING_RESET_TO_DEFAULTS",
  "FINAL_REVIEW_STARTED",
  "FINAL_DRAFT_EDITED",
  "FINAL_DRAFT_MARKED_READY",
  "FINAL_DRAFT_MARKED_SKIP",
  "FINAL_REVIEW_COMPLETED",
  "APPROVAL_PACKAGE_EVALUATED",
  "APPROVAL_PACKAGE_COMPLETED",
  "PACKAGE_AUTOFILL_APPLIED",
  "PRE_REVIEW_REPAIR_APPLIED",
  "PRE_REVIEW_REPAIR_SKIPPED",
  "PRE_REVIEW_REPAIR_BLOCKED",
  "CTA_DESTINATION_SELF_HEAL_APPLIED",
  "CTA_DESTINATION_SELF_HEAL_SKIPPED",
  "CTA_DESTINATION_SELF_HEAL_BLOCKED",
  "CTA_AUTOFILLED",
  "DESTINATION_AUTOFILLED",
  "ASSET_DIRECTION_AUTOFILLED",
  "EXPECTED_OUTCOME_RANKING_COMPUTED",
  "CONVERSION_INTENT_ASSIGNED",
  "CONFIDENCE_ASSIGNED",
  "FATIGUE_WARNING_SHOWN",
  "DESTINATION_INSIGHT_COMPUTED",
  "HYPOTHESIS_GENERATED",
  "FOLLOW_UP_TASK_CREATED",
  "FOLLOW_UP_TASK_COMPLETED",
  "FOLLOW_UP_TASK_DISMISSED",
  "BATCH_APPROVAL_PREP_CREATED",
  "BATCH_ITEM_APPROVED",
  "BATCH_ITEM_HELD",
  "BATCH_ITEM_SKIPPED",
  "BATCH_ITEM_CONVERTED_TO_EXPERIMENT",
  "REVIEW_MACRO_APPLIED",
  "FOUNDER_VOICE_APPLIED",
  "OUTREACH_MESSAGE_GENERATED",
  "INFLUENCER_ADDED",
  "INTERACTION_RECORDED",
  "SAFE_REPLY_CLASSIFIED",
  "SAFE_REPLY_STAGED",
  "SAFE_REPLY_APPROVED",
  "SAFE_REPLY_DISMISSED",
  "EXPERIMENT_CREATED",
  "EXPERIMENT_PROPOSED",
  "EXPERIMENT_PROPOSAL_CONFIRMED",
  "EXPERIMENT_PROPOSAL_DISMISSED",
  "EXPERIMENT_AUTOPILOT_V2_CREATED",
  "EXPERIMENT_AUTOPILOT_V2_BLOCKED",
  "EXPERIMENT_AUTOPILOT_V2_DISMISSED",
  "EXPERIMENT_AUTOPILOT_V2_ACCEPTED",
  "EXPERIMENT_VARIANT_ASSIGNED",
  "EXPERIMENT_CLOSED",
  "DIGEST_VIEWED",
  "EDIT_PATTERN_LEARNED",
  "EDIT_SUGGESTION_APPLIED",
  "BORDERLINE_REVIEW_OPENED",
  "BORDERLINE_RESOLVED",
  "POST_LOGGED",
  "POST_URL_ADDED",
  "POST_NOTE_ADDED",
  "POSTING_PACKAGE_STAGED",
  "POSTING_PACKAGE_UPDATED",
  "POSTING_PACKAGE_CANCELED",
  "POSTING_CONFIRMED_MANUALLY",
  "SAFE_POSTING_ELIGIBILITY_COMPUTED",
  "SAFE_POSTING_INITIATED",
  "SAFE_POSTING_CONFIRMED",
  "SAFE_POSTING_COMPLETED",
  "SAFE_POSTING_FAILED",
  "SAFE_POSTING_BLOCKED",
  "AUTONOMY_POLICY_EVALUATED",
  "AUTONOMY_POLICY_BLOCKED_ACTION",
  "AUTONOMY_POLICY_ALLOWED_ACTION",
  "AUTONOMY_POLICY_SUGGESTED_ONLY",
  "AUTONOMY_SCORECARD_COMPUTED",
  "EXCEPTION_ITEM_CREATED",
  "EXCEPTION_ITEM_RESOLVED",
  "STRATEGIC_DECISION_PROPOSED",
  "STRATEGIC_DECISION_REFERENCED",
  "DISTRIBUTION_PREPARED",
  "ZAZA_CONNECT_EXPORT_CREATED",
  "ZAZA_CONNECT_CONTEXT_IMPORTED",
  "ZAZA_CONNECT_BRIDGE_REFERENCED",
  "ATTRIBUTION_RECORDED",
  "REVENUE_SIGNAL_RECORDED",
  "AUDIENCE_MEMORY_UPDATED",
  "OUTCOME_RECORDED",
  "OUTCOME_UPDATED",
  "STRATEGIC_OUTCOME_RECORDED",
  "STRATEGIC_OUTCOME_UPDATED",
] as const;

export const AUDIT_ACTORS = ["system", "operator"] as const;

const auditMetadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const auditMetadataSchema = z.record(z.string(), auditMetadataValueSchema).optional();

export const auditEventSchema = z.object({
  id: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
  eventType: z.enum(AUDIT_EVENT_TYPES),
  actor: z.enum(AUDIT_ACTORS),
  summary: z.string().trim().min(1),
  metadata: auditMetadataSchema,
});

const auditStoreSchema = z.record(z.string(), z.array(auditEventSchema));

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export type AuditActor = (typeof AUDIT_ACTORS)[number];
export type AuditEvent = z.infer<typeof auditEventSchema>;

export interface AuditEventInput {
  signalId: string;
  eventType: AuditEventType;
  actor: AuditActor;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
}

function sortEvents(events: AuditEvent[]): AuditEvent[] {
  return [...events].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

function buildSeedAuditStore(): Record<string, AuditEvent[]> {
  const store: Record<string, AuditEvent[]> = {};

  for (const event of mockAuditEventsSeed) {
    const parsed = auditEventSchema.parse(event);
    store[parsed.signalId] = [...(store[parsed.signalId] ?? []), parsed];
  }

  return Object.fromEntries(Object.entries(store).map(([signalId, events]) => [signalId, sortEvents(events)]));
}

function mergeAuditStores(
  baseStore: Record<string, AuditEvent[]>,
  persistedStore: Record<string, AuditEvent[]>,
): Record<string, AuditEvent[]> {
  const merged: Record<string, AuditEvent[]> = {};
  const signalIds = new Set([...Object.keys(baseStore), ...Object.keys(persistedStore)]);

  for (const signalId of signalIds) {
    const deduped = new Map<string, AuditEvent>();

    for (const event of [...(baseStore[signalId] ?? []), ...(persistedStore[signalId] ?? [])]) {
      deduped.set(event.id, event);
    }

    merged[signalId] = sortEvents(Array.from(deduped.values()));
  }

  return merged;
}

async function readPersistedAuditStore(): Promise<Record<string, AuditEvent[]>> {
  try {
    const raw = await readFile(AUDIT_STORE_PATH, "utf8");
    return auditStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function readAuditStore(): Promise<Record<string, AuditEvent[]>> {
  return mergeAuditStores(buildSeedAuditStore(), await readPersistedAuditStore());
}

async function writeAuditStore(store: Record<string, AuditEvent[]>): Promise<void> {
  await mkdir(path.dirname(AUDIT_STORE_PATH), { recursive: true });
  await writeFile(AUDIT_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildEvent(input: AuditEventInput): AuditEvent {
  return auditEventSchema.parse({
    id: crypto.randomUUID(),
    signalId: input.signalId,
    timestamp: new Date().toISOString(),
    eventType: input.eventType,
    actor: input.actor,
    summary: input.summary,
    metadata: input.metadata,
  });
}

function dedupeConsecutiveEvents(existing: AuditEvent[], next: AuditEvent): boolean {
  const previous = existing[existing.length - 1];
  if (!previous) {
    return false;
  }

  return (
    previous.eventType === next.eventType &&
    previous.actor === next.actor &&
    previous.summary === next.summary
  );
}

export async function appendAuditEvents(inputs: AuditEventInput[]): Promise<void> {
  if (inputs.length === 0) {
    return;
  }

  const store = await readPersistedAuditStore();

  for (const input of inputs) {
    const next = buildEvent(input);
    const current = sortEvents(store[input.signalId] ?? []);

    if (dedupeConsecutiveEvents(current, next)) {
      continue;
    }

    store[input.signalId] = [...current, next].slice(-MAX_EVENTS_PER_SIGNAL);
  }

  await writeAuditStore(store);
}

export async function appendAuditEventsSafe(inputs: AuditEventInput[]): Promise<void> {
  try {
    await appendAuditEvents(inputs);
  } catch (error) {
    console.error("Audit logging failed", error);
  }
}

export async function getAuditEvents(signalId: string): Promise<AuditEvent[]> {
  const store = await readAuditStore();
  return sortEvents(store[signalId] ?? []);
}

export async function listAuditEvents(options?: {
  signalIds?: string[];
}): Promise<AuditEvent[]> {
  const store = await readAuditStore();
  const allowedSignalIds = options?.signalIds ? new Set(options.signalIds) : null;

  return Object.entries(store)
    .filter(([signalId]) => (allowedSignalIds ? allowedSignalIds.has(signalId) : true))
    .flatMap(([, events]) => events)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

export function buildRecommendationEvent(
  signal: SignalRecord,
  tuning?: OperatorTuningSettings,
): AuditEventInput {
  const guidance = getCopilotGuidance(signal, tuning);

  return {
    signalId: signal.recordId,
    eventType: "RECOMMENDED_ACTION",
    actor: "system",
    summary: `Recommended action: ${guidance.nextAction}`,
    metadata: {
      actionKey: guidance.actionKey,
      readiness: guidance.readiness,
      tone: guidance.tone,
      blockerCount: guidance.blockers.length,
      reason: guidance.reason,
    },
  };
}

export function buildScoredEvent(signal: SignalRecord, scoring: SignalScoringResult): AuditEventInput {
  return {
    signalId: signal.recordId,
    eventType: "SCORED",
    actor: "system",
    summary: `Scored ${scoring.keepRejectRecommendation} with ${scoring.qualityGateResult} gate and ${scoring.reviewPriority.toLowerCase()} priority.`,
    metadata: {
      relevance: scoring.signalRelevanceScore,
      novelty: scoring.signalNoveltyScore,
      urgency: scoring.signalUrgencyScore,
      brandFit: scoring.brandFitScore,
      trust: scoring.sourceTrustScore,
      recommendation: scoring.keepRejectRecommendation,
      qualityGate: scoring.qualityGateResult,
      reviewPriority: scoring.reviewPriority,
    },
  };
}

export function buildOperatorOverrideEvent(
  signal: SignalRecord,
  actualAction: CopilotActionKey,
  tuning?: OperatorTuningSettings,
): AuditEventInput | null {
  const guidance = getCopilotGuidance(signal, tuning);

  if (guidance.actionKey === "none" || guidance.actionKey === actualAction) {
    return null;
  }

  return {
    signalId: signal.recordId,
    eventType: "OPERATOR_OVERRIDE",
    actor: "operator",
    summary: `Operator chose ${actualAction.replaceAll("_", " ")} while guidance suggested ${guidance.nextAction.toLowerCase()}.`,
    metadata: {
      recommendedAction: guidance.actionKey,
      actualAction,
      reason: guidance.reason,
    },
  };
}
