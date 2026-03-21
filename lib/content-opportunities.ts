import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { listSignalsWithFallback } from "@/lib/airtable";
import { buildAudienceMemoryState } from "@/lib/audience-memory";
import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { buildAttributionInsights, buildAttributionRecordsFromInputs } from "@/lib/attribution";
import { buildCampaignAllocationState } from "@/lib/campaign-allocation";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { buildGrowthMemory, type GrowthMemoryState } from "@/lib/growth-memory";
import { applySelectedHookSelection, buildHookSet } from "@/lib/hook-engine";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { buildMessageAngles } from "@/lib/message-angles";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { syncFounderOverrideState } from "@/lib/founder-overrides";
import { listPatternBundles, indexBundleSummariesByPatternId } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { buildRevenueSignalsFromInputs } from "@/lib/revenue-signals";
import { buildRevenueSignalInsights } from "@/lib/revenue-signals";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import {
  buildVideoBrief,
  type VideoBrief,
  videoBriefSchema,
} from "@/lib/video-briefs";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { buildWeeklyPostingPack } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";
import type { PostingPlatform } from "@/lib/posting-memory";

const CONTENT_OPPORTUNITY_STORE_PATH = path.join(process.cwd(), "data", "content-opportunities.json");

export const CONTENT_OPPORTUNITY_TYPES = [
  "pain_point_opportunity",
  "campaign_support_opportunity",
  "audience_opportunity",
  "commercial_opportunity",
  "evergreen_opportunity",
] as const;

export const CONTENT_OPPORTUNITY_STATUSES = [
  "open",
  "approved_for_production",
  "dismissed",
] as const;

export const CONTENT_OPPORTUNITY_PRIORITIES = ["high", "medium", "low"] as const;
export const CONTENT_OPPORTUNITY_FOUNDER_SELECTION_STATUSES = [
  "pending",
  "angle-selected",
  "hook-selected",
  "approved",
] as const;

export type ContentOpportunityType = (typeof CONTENT_OPPORTUNITY_TYPES)[number];
export type ContentOpportunityStatus = (typeof CONTENT_OPPORTUNITY_STATUSES)[number];
export type ContentOpportunityPriority = (typeof CONTENT_OPPORTUNITY_PRIORITIES)[number];
export type ContentOpportunityFounderSelectionStatus =
  (typeof CONTENT_OPPORTUNITY_FOUNDER_SELECTION_STATUSES)[number];

export interface ContentOpportunitySourceRef {
  signalId: string;
  sourceTitle: string;
  href: string;
  clusterId: string | null;
}

export interface ContentOpportunityMemoryContext {
  bestCombo: string | null;
  weakCombo: string | null;
  revenuePattern: string | null;
  audienceCue: string | null;
  caution: string | null;
}

export interface ContentOpportunity {
  opportunityId: string;
  signalId: string;
  title: string;
  opportunityType: ContentOpportunityType;
  status: ContentOpportunityStatus;
  priority: ContentOpportunityPriority;
  source: ContentOpportunitySourceRef;
  primaryPainPoint: string;
  teacherLanguage: string[];
  recommendedAngle: string;
  recommendedHookDirection: string;
  recommendedFormat: "text" | "carousel" | "short_video" | "multi_asset";
  recommendedPlatforms: PostingPlatform[];
  whyNow: string;
  commercialPotential: "high" | "medium" | "low";
  trustRisk: "low" | "medium" | "high";
  riskSummary: string | null;
  suggestedNextStep: string;
  supportingSignals: string[];
  memoryContext: ContentOpportunityMemoryContext;
  sourceSignalIds: string[];
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  dismissedAt: string | null;
  founderSelectionStatus: ContentOpportunityFounderSelectionStatus;
  selectedAngleId: string | null;
  selectedHookId: string | null;
  selectedVideoBrief: VideoBrief | null;
  operatorNotes: string | null;
}

export interface ContentOpportunityState {
  generatedAt: string;
  openCount: number;
  approvedCount: number;
  dismissedCount: number;
  topSummary: string[];
  opportunities: ContentOpportunity[];
}

const contentOpportunitySourceRefSchema = z.object({
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  href: z.string().trim().min(1),
  clusterId: z.string().trim().nullable().default(null),
});

const contentOpportunityMemoryContextSchema = z.object({
  bestCombo: z.string().trim().nullable().default(null),
  weakCombo: z.string().trim().nullable().default(null),
  revenuePattern: z.string().trim().nullable().default(null),
  audienceCue: z.string().trim().nullable().default(null),
  caution: z.string().trim().nullable().default(null),
});

const contentOpportunitySchema = z.object({
  opportunityId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  opportunityType: z.enum(CONTENT_OPPORTUNITY_TYPES),
  status: z.enum(CONTENT_OPPORTUNITY_STATUSES),
  priority: z.enum(CONTENT_OPPORTUNITY_PRIORITIES),
  source: contentOpportunitySourceRefSchema,
  primaryPainPoint: z.string().trim().min(1),
  teacherLanguage: z.array(z.string().trim().min(1)).max(4),
  recommendedAngle: z.string().trim().min(1),
  recommendedHookDirection: z.string().trim().min(1),
  recommendedFormat: z.enum(["text", "carousel", "short_video", "multi_asset"]),
  recommendedPlatforms: z.array(z.enum(["x", "linkedin", "reddit"])).min(1).max(3),
  whyNow: z.string().trim().min(1),
  commercialPotential: z.enum(["high", "medium", "low"]),
  trustRisk: z.enum(["low", "medium", "high"]),
  riskSummary: z.string().trim().nullable().default(null),
  suggestedNextStep: z.string().trim().min(1),
  supportingSignals: z.array(z.string().trim().min(1)).max(6),
  memoryContext: contentOpportunityMemoryContextSchema,
  sourceSignalIds: z.array(z.string().trim().min(1)).min(1).max(6),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  approvedAt: z.string().trim().nullable().default(null),
  dismissedAt: z.string().trim().nullable().default(null),
  founderSelectionStatus: z
    .enum(CONTENT_OPPORTUNITY_FOUNDER_SELECTION_STATUSES)
    .default("pending"),
  selectedAngleId: z.string().trim().nullable().default(null),
  selectedHookId: z.string().trim().nullable().default(null),
  selectedVideoBrief: videoBriefSchema.nullable().default(null),
  operatorNotes: z.string().trim().nullable().default(null),
});

const contentOpportunityStateSchema = z.object({
  generatedAt: z.string().trim().min(1),
  openCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  dismissedCount: z.number().int().nonnegative(),
  topSummary: z.array(z.string().trim().min(1)).max(6).default([]),
  opportunities: z.array(contentOpportunitySchema).max(80),
});

const contentOpportunityStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  opportunities: z.array(contentOpportunitySchema).max(120).default([]),
});

export const contentOpportunityActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve_for_production"),
    opportunityId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("dismiss"),
    opportunityId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("reopen"),
    opportunityId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("update_notes"),
    opportunityId: z.string().trim().min(1),
    notes: z.string(),
  }),
  z.object({
    action: z.literal("update_founder_selection"),
    opportunityId: z.string().trim().min(1),
    selectedAngleId: z.string().trim().nullable(),
    selectedHookId: z.string().trim().nullable(),
  }),
]);

export const contentOpportunityRefreshRequestSchema = z.object({
  refresh: z.literal(true).default(true),
});

export type ContentOpportunityActionRequest = z.infer<typeof contentOpportunityActionRequestSchema>;

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function stableOpportunityId(signalId: string) {
  return `content-opportunity:${signalId}`;
}

function priorityWeight(priority: ContentOpportunityPriority) {
  switch (priority) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
    default:
      return 2;
  }
}

function statusWeight(status: ContentOpportunityStatus) {
  switch (status) {
    case "open":
      return 0;
    case "approved_for_production":
      return 1;
    case "dismissed":
    default:
      return 2;
  }
}

function sortOpportunities(opportunities: ContentOpportunity[]) {
  return [...opportunities].sort(
    (left, right) =>
      statusWeight(left.status) - statusWeight(right.status) ||
      priorityWeight(left.priority) - priorityWeight(right.priority) ||
      left.title.localeCompare(right.title),
  );
}

function firstSentence(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return normalized.split(/(?<=[.!?])\s+/)[0]?.trim() ?? normalized;
}

function toTeacherLanguage(candidate: ApprovalQueueCandidate) {
  const rows: string[] = [];
  uniquePush(rows, firstSentence(candidate.signal.rawExcerpt));
  uniquePush(rows, firstSentence(candidate.signal.manualSummary));
  uniquePush(rows, firstSentence(candidate.signal.sourceTitle));
  uniquePush(rows, firstSentence(candidate.signal.teacherPainPoint));
  return rows.slice(0, 3);
}

function toRecommendedFormat(candidate: ApprovalQueueCandidate): ContentOpportunity["recommendedFormat"] {
  if (
    candidate.distributionPriority.distributionStrategy === "multi" &&
    candidate.signal.suggestedFormatPriority === "Multi-format"
  ) {
    return "multi_asset";
  }

  if (candidate.signal.suggestedFormatPriority === "Carousel") {
    return "carousel";
  }

  if (
    candidate.signal.suggestedFormatPriority === "Video" ||
    candidate.packageAutofill.notes.some(
      (note) =>
        (note.field === "asset_direction" || note.field === "asset_selection") &&
        note.value.toLowerCase().includes("video"),
    )
  ) {
    return "short_video";
  }

  return "text";
}

function toCommercialPotential(candidate: ApprovalQueueCandidate): ContentOpportunity["commercialPotential"] {
  if (
    candidate.expectedOutcome.expectedOutcomeTier === "high" ||
    candidate.revenueAmplifierMatch?.revenueStrength === "high"
  ) {
    return "high";
  }

  if (
    candidate.expectedOutcome.expectedOutcomeTier === "medium" ||
    candidate.revenueAmplifierMatch?.revenueStrength === "medium"
  ) {
    return "medium";
  }

  return "low";
}

function toPriority(candidate: ApprovalQueueCandidate): ContentOpportunityPriority {
  if (
    candidate.triage.triageState === "approve_ready" &&
    candidate.commercialRisk.highestSeverity !== "high" &&
    candidate.expectedOutcome.expectedOutcomeTier === "high"
  ) {
    return "high";
  }

  if (
    candidate.triage.triageState === "repairable" ||
    candidate.expectedOutcome.expectedOutcomeTier === "medium"
  ) {
    return "medium";
  }

  return "low";
}

function toOpportunityType(candidate: ApprovalQueueCandidate): ContentOpportunityType {
  if (candidate.revenueAmplifierMatch?.revenueStrength === "high") {
    return "commercial_opportunity";
  }

  if (candidate.signal.campaignId && candidate.hypothesis.objective.toLowerCase().includes("campaign")) {
    return "campaign_support_opportunity";
  }

  if (candidate.stale.state === "stale_but_reusable") {
    return "evergreen_opportunity";
  }

  if (candidate.signal.audienceSegmentId) {
    return "audience_opportunity";
  }

  return "pain_point_opportunity";
}

function buildRecommendedHookDirection(candidate: ApprovalQueueCandidate) {
  const hook = normalizeText(candidate.signal.hookTemplateUsed)?.replace(/\.$/, "");
  const platform = candidate.distributionPriority.primaryPlatform === "linkedin"
    ? "LinkedIn"
    : candidate.distributionPriority.primaryPlatform === "reddit"
      ? "Reddit"
      : "X";
  const posture = candidate.conversionIntent.posture.replaceAll("_", " ");

  return hook
    ? `Lead with "${hook}" and keep the opening ${posture} for ${platform}.`
    : `Lead with the core tension quickly and keep the opening ${posture} for ${platform}.`;
}

function buildWhyNow(candidate: ApprovalQueueCandidate, growthMemory: GrowthMemoryState) {
  const reasons: string[] = [];
  uniquePush(reasons, candidate.expectedOutcome.expectedOutcomeReasons[0]);
  uniquePush(reasons, candidate.triage.reason);
  uniquePush(reasons, candidate.revenueAmplifierMatch?.reason);
  uniquePush(reasons, growthMemory.topNotes[0]);
  return reasons[0] ?? "This signal is currently strong enough to justify content production review.";
}

function buildSupportingSignals(candidate: ApprovalQueueCandidate, growthMemory: GrowthMemoryState) {
  const signals: string[] = [];
  uniquePush(signals, candidate.expectedOutcome.expectedOutcomeReasons[0]);
  uniquePush(signals, candidate.expectedOutcome.positiveSignals[0]);
  uniquePush(signals, candidate.hypothesis.keyLevers[0]);
  uniquePush(signals, candidate.revenueAmplifierMatch?.supportingSignals[0]);
  uniquePush(signals, candidate.distributionPriority.reason);
  uniquePush(signals, growthMemory.topNotes[0]);
  uniquePush(signals, candidate.commercialRisk.supportingSignals[0]);
  return signals.slice(0, 4);
}

function buildSuggestedNextStep(candidate: ApprovalQueueCandidate) {
  if (candidate.commercialRisk.highestSeverity === "high") {
    return "Review risk flags before using this as a production input.";
  }

  if (candidate.preReviewRepair.repairs.length > 0) {
    return "Review the repaired package and approve it as a production-ready concept if it still feels clean.";
  }

  if (candidate.distributionPriority.distributionStrategy === "multi") {
    return "Review as a high-value multi-platform concept and decide whether it should enter production this week.";
  }

  if (candidate.signal.suggestedFormatPriority === "Video") {
    return "Review as a short-form concept and approve it for production if the angle still feels teacher-safe.";
  }

  return "Approve for production or leave it in the queue for later use.";
}

function buildTitle(candidate: ApprovalQueueCandidate) {
  return (
    normalizeText(candidate.signal.contentAngle) ??
    normalizeText(candidate.signal.teacherPainPoint) ??
    normalizeText(candidate.signal.sourceTitle) ??
    "Content opportunity"
  );
}

function normalizeFounderSelectionStatus(input: {
  existingStatus: ContentOpportunityFounderSelectionStatus;
  selectedAngleId: string | null;
  selectedHookId: string | null;
}) {
  if (input.existingStatus === "approved") {
    return "approved" as const;
  }

  if (input.selectedHookId) {
    return "hook-selected" as const;
  }

  if (input.selectedAngleId) {
    return "angle-selected" as const;
  }

  return "pending" as const;
}

function normalizeFounderSelection(
  opportunity: ContentOpportunity,
): Pick<
  ContentOpportunity,
  "founderSelectionStatus" | "selectedAngleId" | "selectedHookId" | "selectedVideoBrief"
> {
  const existingStatus = opportunity.founderSelectionStatus ?? "pending";
  const selectedAngleId = normalizeText(opportunity.selectedAngleId);
  const selectedHookId = normalizeText(opportunity.selectedHookId);

  if (!selectedAngleId) {
    return {
      founderSelectionStatus:
        existingStatus === "approved" ? "approved" : "pending",
      selectedAngleId: null,
      selectedHookId: null,
      selectedVideoBrief: null,
    };
  }

  try {
    const angles = buildMessageAngles(opportunity);
    const angle = angles.find((item) => item.id === selectedAngleId);

    if (!angle) {
      return {
        founderSelectionStatus:
          existingStatus === "approved" ? "approved" : "pending",
        selectedAngleId: null,
        selectedHookId: null,
        selectedVideoBrief: null,
      };
    }

    if (!selectedHookId) {
      return {
        founderSelectionStatus:
          existingStatus === "approved" ? "approved" : "angle-selected",
        selectedAngleId: angle.id,
        selectedHookId: null,
        selectedVideoBrief: null,
      };
    }

    const hookSet = buildHookSet(opportunity, angle);
    const hook = hookSet.variants.find((item) => item.id === selectedHookId);

    if (!hook) {
      return {
        founderSelectionStatus:
          existingStatus === "approved" ? "approved" : "angle-selected",
        selectedAngleId: angle.id,
        selectedHookId: null,
        selectedVideoBrief: null,
      };
    }

    const selectedHookSet = applySelectedHookSelection(hookSet, hook.id);

    return {
      founderSelectionStatus: normalizeFounderSelectionStatus({
        existingStatus,
        selectedAngleId: angle.id,
        selectedHookId: hook.id,
      }),
      selectedAngleId: angle.id,
      selectedHookId: hook.id,
      selectedVideoBrief: buildVideoBrief(opportunity, angle, selectedHookSet),
    };
  } catch {
    return {
      founderSelectionStatus:
        existingStatus === "approved" ? "approved" : "pending",
      selectedAngleId: null,
      selectedHookId: null,
      selectedVideoBrief: null,
    };
  }
}

function mergePersistedFields(
  nextOpportunity: ContentOpportunity,
  existingOpportunity: ContentOpportunity | undefined,
): ContentOpportunity {
  if (!existingOpportunity) {
    return nextOpportunity;
  }

  const mergedOpportunity: ContentOpportunity = {
    ...nextOpportunity,
    status: existingOpportunity.status,
    createdAt: existingOpportunity.createdAt,
    approvedAt: existingOpportunity.approvedAt,
    dismissedAt: existingOpportunity.dismissedAt,
    founderSelectionStatus: existingOpportunity.founderSelectionStatus ?? "pending",
    selectedAngleId: existingOpportunity.selectedAngleId ?? null,
    selectedHookId: existingOpportunity.selectedHookId ?? null,
    selectedVideoBrief: existingOpportunity.selectedVideoBrief ?? null,
    operatorNotes: existingOpportunity.operatorNotes,
  };

  return {
    ...mergedOpportunity,
    ...normalizeFounderSelection(mergedOpportunity),
  };
}

function summarizeState(opportunities: ContentOpportunity[]) {
  const normalizedOpportunities = opportunities.map((opportunity) => ({
    ...opportunity,
    ...normalizeFounderSelection(opportunity),
  }));
  const open = normalizedOpportunities.filter((item) => item.status === "open");
  const approved = normalizedOpportunities.filter((item) => item.status === "approved_for_production");
  const dismissed = normalizedOpportunities.filter((item) => item.status === "dismissed");
  const topSummary: string[] = [];

  if (open.length > 0) {
    topSummary.push(`${open.length} content opportunit${open.length === 1 ? "y is" : "ies are"} open for production review.`);
  }
  if (open.filter((item) => item.priority === "high" && item.trustRisk !== "high").length > 0) {
    const readyCount = open.filter((item) => item.priority === "high" && item.trustRisk !== "high").length;
    topSummary.push(`${readyCount} high-priority opportunit${readyCount === 1 ? "y looks" : "ies look"} ready now.`);
  }
  if (open.filter((item) => item.trustRisk === "high").length > 0) {
    const flaggedCount = open.filter((item) => item.trustRisk === "high").length;
    topSummary.push(`${flaggedCount} opportunit${flaggedCount === 1 ? "y is" : "ies are"} flagged for trust-risk review before production use.`);
  }

  return contentOpportunityStateSchema.parse({
    generatedAt: new Date().toISOString(),
    openCount: open.length,
    approvedCount: approved.length,
    dismissedCount: dismissed.length,
    topSummary: topSummary.slice(0, 4),
    opportunities: sortOpportunities(normalizedOpportunities),
  });
}

async function readPersistedStore() {
  try {
    const raw = await readFile(CONTENT_OPPORTUNITY_STORE_PATH, "utf8");
    return contentOpportunityStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return contentOpportunityStoreSchema.parse({
        updatedAt: null,
        opportunities: [],
      });
    }

    throw error;
  }
}

async function writePersistedStore(store: z.infer<typeof contentOpportunityStoreSchema>) {
  await mkdir(path.dirname(CONTENT_OPPORTUNITY_STORE_PATH), { recursive: true });
  await writeFile(CONTENT_OPPORTUNITY_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildOpportunityFromCandidate(
  candidate: ApprovalQueueCandidate,
  growthMemory: GrowthMemoryState,
  now: Date,
): ContentOpportunity {
  return contentOpportunitySchema.parse({
    opportunityId: stableOpportunityId(candidate.signal.recordId),
    signalId: candidate.signal.recordId,
    title: buildTitle(candidate),
    opportunityType: toOpportunityType(candidate),
    status: "open",
    priority: toPriority(candidate),
    source: {
      signalId: candidate.signal.recordId,
      sourceTitle: candidate.signal.sourceTitle,
      href: `/signals/${candidate.signal.recordId}/review`,
      clusterId: candidate.signal.duplicateClusterId ?? null,
    },
    primaryPainPoint:
      normalizeText(candidate.signal.teacherPainPoint) ??
      normalizeText(candidate.signal.signalSubtype) ??
      normalizeText(candidate.signal.sourceTitle) ??
      "Teacher communication pressure",
    teacherLanguage: toTeacherLanguage(candidate),
    recommendedAngle:
      normalizeText(candidate.signal.contentAngle) ??
      normalizeText(candidate.hypothesis.objective) ??
      normalizeText(candidate.signal.teacherPainPoint) ??
      "Calm teacher-first messaging opportunity",
    recommendedHookDirection: buildRecommendedHookDirection(candidate),
    recommendedFormat: toRecommendedFormat(candidate),
    recommendedPlatforms: [
      candidate.distributionPriority.primaryPlatform,
      ...candidate.distributionPriority.secondaryPlatforms,
    ].slice(0, 3),
    whyNow: buildWhyNow(candidate, growthMemory),
    commercialPotential: toCommercialPotential(candidate),
    trustRisk: candidate.commercialRisk.highestSeverity ?? "low",
    riskSummary: candidate.commercialRisk.topRisk?.reason ?? null,
    suggestedNextStep: buildSuggestedNextStep(candidate),
    supportingSignals: buildSupportingSignals(candidate, growthMemory),
    memoryContext: {
      bestCombo: growthMemory.currentBestCombos[0]?.label ?? null,
      weakCombo: growthMemory.currentWeakCombos[0]?.label ?? null,
      revenuePattern: candidate.revenueAmplifierMatch?.label ?? null,
      audienceCue: growthMemory.audienceMemorySummary.headline,
      caution: growthMemory.cautionMemorySummary.headline,
    },
    sourceSignalIds: [candidate.signal.recordId],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    approvedAt: null,
    dismissedAt: null,
    founderSelectionStatus: "pending",
    selectedAngleId: null,
    selectedHookId: null,
    selectedVideoBrief: null,
    operatorNotes: null,
  });
}

export function buildContentOpportunityState(input: {
  candidates: ApprovalQueueCandidate[];
  growthMemory: GrowthMemoryState;
  existing?: ContentOpportunity[] | null;
  now?: Date;
}): ContentOpportunityState {
  const now = input.now ?? new Date();
  const existingById = new Map((input.existing ?? []).map((item) => [item.opportunityId, item]));
  const opportunities = input.candidates
    .filter((candidate) => candidate.triage.triageState !== "suppress")
    .filter((candidate) => candidate.signal.status !== "Posted" && candidate.signal.status !== "Archived")
    .map((candidate) => {
      const nextOpportunity = buildOpportunityFromCandidate(candidate, input.growthMemory, now);
      return mergePersistedFields(nextOpportunity, existingById.get(nextOpportunity.opportunityId));
    });

  return summarizeState(opportunities);
}

export async function listContentOpportunityState() {
  const store = await readPersistedStore();
  return summarizeState(store.opportunities);
}

export async function syncContentOpportunityState(input: {
  candidates: ApprovalQueueCandidate[];
  growthMemory: GrowthMemoryState;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = await readPersistedStore();
  const nextState = buildContentOpportunityState({
    candidates: input.candidates,
    growthMemory: input.growthMemory,
    existing: store.opportunities,
    now,
  });
  const previousById = new Map(store.opportunities.map((item) => [item.opportunityId, item]));
  const auditEvents: AuditEventInput[] = [];

  for (const opportunity of nextState.opportunities) {
    const previous = previousById.get(opportunity.opportunityId);
    const hasChanged =
      !previous ||
      previous.title !== opportunity.title ||
      previous.priority !== opportunity.priority ||
      previous.trustRisk !== opportunity.trustRisk ||
      previous.whyNow !== opportunity.whyNow ||
      previous.status !== opportunity.status;

    if (hasChanged) {
      auditEvents.push({
        signalId: opportunity.signalId,
        eventType: "CONTENT_OPPORTUNITY_REFRESHED" as const,
        actor: "system",
        summary: `Refreshed content opportunity for ${opportunity.title}.`,
        metadata: {
          status: opportunity.status,
          priority: opportunity.priority,
          trustRisk: opportunity.trustRisk,
        },
      });
    }
  }

  await writePersistedStore({
    updatedAt: now.toISOString(),
    opportunities: nextState.opportunities,
  });
  await appendAuditEventsSafe(auditEvents);

  return nextState;
}

async function updateOpportunity(
  opportunityId: string,
  updater: (opportunity: ContentOpportunity) => ContentOpportunity,
) {
  const store = await readPersistedStore();
  const nextOpportunities = store.opportunities.map((opportunity) => {
    if (opportunity.opportunityId !== opportunityId) {
      return opportunity;
    }

    const updatedOpportunity = updater(opportunity);
    return {
      ...updatedOpportunity,
      ...normalizeFounderSelection(updatedOpportunity),
    };
  });
  await writePersistedStore({
    updatedAt: new Date().toISOString(),
    opportunities: nextOpportunities,
  });
  return summarizeState(nextOpportunities);
}

export async function approveContentOpportunity(opportunityId: string) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const state = await updateOpportunity(opportunityId, (opportunity) => ({
    ...opportunity,
    status: "approved_for_production",
    founderSelectionStatus: "approved",
    approvedAt: timestamp,
    dismissedAt: null,
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_APPROVED" as const,
      actor: "operator",
      summary: `Approved content opportunity "${current.title}" for production.`,
    },
  ]);
  return state;
}

export async function dismissContentOpportunity(opportunityId: string) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const state = await updateOpportunity(opportunityId, (opportunity) => ({
    ...opportunity,
    status: "dismissed",
    founderSelectionStatus: normalizeFounderSelectionStatus({
      existingStatus: "pending",
      selectedAngleId: opportunity.selectedAngleId,
      selectedHookId: opportunity.selectedHookId,
    }),
    dismissedAt: timestamp,
    approvedAt: null,
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_DISMISSED" as const,
      actor: "operator",
      summary: `Dismissed content opportunity "${current.title}".`,
    },
  ]);
  return state;
}

export async function reopenContentOpportunity(opportunityId: string) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const state = await updateOpportunity(opportunityId, (opportunity) => ({
    ...opportunity,
    status: "open",
    founderSelectionStatus: normalizeFounderSelectionStatus({
      existingStatus: "pending",
      selectedAngleId: opportunity.selectedAngleId,
      selectedHookId: opportunity.selectedHookId,
    }),
    dismissedAt: null,
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_REOPENED" as const,
      actor: "operator",
      summary: `Reopened content opportunity "${current.title}".`,
    },
  ]);
  return state;
}

export async function updateContentOpportunityNotes(opportunityId: string, notes: string) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const nextNotes = normalizeText(notes);
  const state = await updateOpportunity(opportunityId, (opportunity) => ({
    ...opportunity,
    operatorNotes: nextNotes,
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_NOTES_UPDATED" as const,
      actor: "operator",
      summary: `Updated notes for content opportunity "${current.title}".`,
      metadata: {
        hasNotes: Boolean(nextNotes),
      },
    },
  ]);
  return state;
}

export async function updateContentOpportunityFounderSelection(input: {
  opportunityId: string;
  selectedAngleId: string | null;
  selectedHookId: string | null;
}) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === input.opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const nextSelectedAngleId = normalizeText(input.selectedAngleId);
  const nextSelectedHookId =
    nextSelectedAngleId && input.selectedHookId
      ? normalizeText(input.selectedHookId)
      : null;
  const nextFounderSelectionStatus = normalizeFounderSelectionStatus({
    existingStatus: current.founderSelectionStatus,
    selectedAngleId: nextSelectedAngleId,
    selectedHookId: nextSelectedHookId,
  });

  const state = await updateOpportunity(input.opportunityId, (opportunity) => ({
    ...opportunity,
    founderSelectionStatus: nextFounderSelectionStatus,
    selectedAngleId: nextSelectedAngleId,
    selectedHookId: nextSelectedHookId,
    selectedVideoBrief: null,
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_FOUNDER_SELECTION_UPDATED" as const,
      actor: "operator",
      summary: `Updated founder selection for content opportunity "${current.title}".`,
      metadata: {
        founderSelectionStatus: nextFounderSelectionStatus,
        hasAngle: Boolean(nextSelectedAngleId),
        hasHook: Boolean(nextSelectedHookId),
      },
    },
  ]);

  return state;
}

export async function refreshContentOpportunityStateFromSystem() {
  const [
    signalResult,
    feedbackEntries,
    patterns,
    playbookCards,
    bundles,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    duplicateClusters,
    strategy,
    tuning,
    experiments,
    founderOverrides,
  ] = await Promise.all([
    listSignalsWithFallback({ limit: 1000 }),
    listFeedbackEntries(),
    listPatterns(),
    listPlaybookCards(),
    listPatternBundles(),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
    listDuplicateClusters(),
    getCampaignStrategy(),
    getOperatorTuning(),
    listExperiments(),
    syncFounderOverrideState(),
  ]);

  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
  const cadence = buildCampaignCadenceSummary(signalResult.signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, signalResult.signals, postingEntries);
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: signalResult.signals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    signalResult.signals,
    feedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    undefined,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning.settings,
  );
  const confirmedClustersByCanonicalSignalId = indexConfirmedClusterByCanonicalSignalId(duplicateClusters);
  const visibleSignals = filterSignalsForActiveReviewQueue(signalResult.signals, duplicateClusters);
  const autonomousAssessments = visibleSignals.map((signal) => {
    const guidance = buildUnifiedGuidanceModel({
      signal,
      guidance: guidanceBySignalId[signal.recordId],
      context: "review",
      tuning: tuning.settings,
    });

    return {
      signal,
      guidance,
      assessment: assessAutonomousSignal(signal, guidance),
    };
  });

  const candidates = rankApprovalCandidates(
    autonomousAssessments.filter((item) => item.assessment.decision === "approval_ready"),
    32,
    {
      strategy,
      cadence,
      weeklyPlan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: signalResult.signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
      founderOverrides,
    },
  );

  const attributionRecords = buildAttributionRecordsFromInputs({
    postingEntries,
    strategicOutcomes,
    signals: signalResult.signals,
  });
  const revenueSignals = buildRevenueSignalsFromInputs({
    postingEntries,
    strategicOutcomes,
    signals: signalResult.signals,
  });
  const audienceMemory = buildAudienceMemoryState({
    strategy,
    signals: signalResult.signals,
    postingEntries,
    strategicOutcomes,
    attributionRecords,
    revenueSignals,
  });
  const evergreenSummary = buildEvergreenSummary({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    strategy,
    cadence,
    weeklyPlan,
    weeklyPlanState,
    bundles,
    maxCandidates: 5,
  });
  const weeklyPostingPack = await buildWeeklyPostingPack({
    approvalCandidates: candidates,
    evergreenSummary,
    strategy,
    weeklyPlan,
    weeklyPlanState,
    postingEntries,
  });
  const campaignAllocation = buildCampaignAllocationState({
    strategy,
    signals: signalResult.signals,
    weeklyPlan,
    weeklyPackSignalIds: weeklyPostingPack.items.map((item) => item.signalId),
    approvalCandidates: candidates,
    cadence,
    revenueSignals,
    audienceMemory,
  });
  const weeklyRecap = buildWeeklyRecap({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId,
  });
  const growthMemory = buildGrowthMemory({
    attributionInsights: buildAttributionInsights(attributionRecords),
    revenueInsights: buildRevenueSignalInsights(revenueSignals),
    audienceMemory,
    reuseCases: reuseMemoryCases,
    campaignAllocation,
    weeklyRecap,
    influencerGraph: null,
  });

  return syncContentOpportunityState({
    candidates,
    growthMemory,
  });
}
