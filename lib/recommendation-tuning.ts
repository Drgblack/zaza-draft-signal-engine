import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appendAuditEventsSafe, type AuditEvent } from "@/lib/audit";
import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { AttributionInsights } from "@/lib/attribution";
import type { AudienceMemoryState } from "@/lib/audience-memory";
import type { CampaignAllocationState } from "@/lib/campaign-allocation";
import type { ExceptionInboxState } from "@/lib/exception-inbox";
import type { GrowthScorecardSummary } from "@/lib/growth-scorecard";
import type { InfluencerGraphSummary } from "@/lib/influencer-graph";
import type { RevenueSignalInsights } from "@/lib/revenue-signals";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";
import type { SourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import type { WeeklyExecutionFlow } from "@/lib/weekly-execution";
import type { WeeklyRecap } from "@/lib/weekly-recap";

const RECOMMENDATION_TUNING_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "recommendation-tuning.json",
);

export const RECOMMENDATION_FAMILIES = [
  "campaign_focus",
  "evergreen_balance",
  "source_cleanup",
  "posting_priority",
  "outcome_completion",
  "experiment_pacing",
  "trust_stage_emphasis",
  "conversion_posture_shift",
  "outreach_focus",
  "queue_cleanup",
] as const;

export type RecommendationFamily = (typeof RECOMMENDATION_FAMILIES)[number];

export interface RecommendationTuningEntry {
  recommendationFamily: RecommendationFamily;
  currentWeight: number;
  baselineWeight: number;
  adjustmentReason: string;
  evidenceCount: number;
  lastAdjustedAt: string;
}

export interface RecommendationTuningState {
  generatedAt: string;
  entries: RecommendationTuningEntry[];
  elevatedFamilies: RecommendationTuningEntry[];
  reducedFamilies: RecommendationTuningEntry[];
  topNotes: string[];
}

const tuningEntrySchema = z.object({
  recommendationFamily: z.enum(RECOMMENDATION_FAMILIES),
  currentWeight: z.number(),
  baselineWeight: z.number(),
  adjustmentReason: z.string().trim().min(1),
  evidenceCount: z.number().int().min(0),
  lastAdjustedAt: z.string().trim().min(1),
});

const tuningStateSchema = z.object({
  generatedAt: z.string().trim().min(1),
  entries: z.array(tuningEntrySchema).length(RECOMMENDATION_FAMILIES.length),
  elevatedFamilies: z.array(tuningEntrySchema).max(RECOMMENDATION_FAMILIES.length),
  reducedFamilies: z.array(tuningEntrySchema).max(RECOMMENDATION_FAMILIES.length),
  topNotes: z.array(z.string().trim().min(1)).max(8),
});

type RecommendationTuningStore = {
  generatedAt: string;
  entries: RecommendationTuningEntry[];
};

const tuningStoreSchema = z.object({
  generatedAt: z.string().trim().min(1),
  entries: z.array(tuningEntrySchema).length(RECOMMENDATION_FAMILIES.length),
});

let inMemoryRecommendationTuningStore: RecommendationTuningStore | null = null;

function roundWeight(value: number) {
  return Math.round(value * 100) / 100;
}

function clampDelta(value: number) {
  return Math.max(-0.2, Math.min(0.25, roundWeight(value)));
}

function normalize(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalize(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function countEvents(auditEvents: AuditEvent[], eventTypes: string[]) {
  const set = new Set(eventTypes);
  return auditEvents.filter((event) => set.has(event.eventType)).length;
}

function familyLabel(family: RecommendationFamily) {
  return family.replaceAll("_", " ");
}

function defaultReason(family: RecommendationFamily) {
  switch (family) {
    case "campaign_focus":
      return "Campaign signals are currently balanced, so campaign focus stays near baseline.";
    case "evergreen_balance":
      return "Evergreen pressure is not strong enough to justify changing recommendation emphasis.";
    case "source_cleanup":
      return "Source quality looks broadly stable, so source cleanup stays near baseline.";
    case "posting_priority":
      return "Posting urgency is stable, so execution emphasis stays near baseline.";
    case "outcome_completion":
      return "Outcome completion pressure is stable enough to stay near baseline.";
    case "experiment_pacing":
      return "Experiment load is balanced enough to keep pacing recommendations near baseline.";
    case "trust_stage_emphasis":
      return "Trust-stage evidence is stable, so trust emphasis stays near baseline.";
    case "conversion_posture_shift":
      return "Conversion posture pressure is stable enough to stay near baseline.";
    case "outreach_focus":
      return "Outreach pressure is modest, so outreach emphasis stays near baseline.";
    case "queue_cleanup":
    default:
      return "Queue cleanup pressure is stable enough to stay near baseline.";
  }
}

function buildEntry(input: {
  family: RecommendationFamily;
  delta: number;
  reason: string;
  evidenceCount: number;
  previous: RecommendationTuningEntry | null;
  nowIso: string;
}) {
  const baselineWeight = 1;
  const currentWeight = roundWeight(baselineWeight + clampDelta(input.delta));
  const previousWeight = input.previous?.currentWeight ?? baselineWeight;

  return {
    recommendationFamily: input.family,
    currentWeight,
    baselineWeight,
    adjustmentReason: input.reason || defaultReason(input.family),
    evidenceCount: input.evidenceCount,
    lastAdjustedAt:
      previousWeight !== currentWeight ? input.nowIso : input.previous?.lastAdjustedAt ?? input.nowIso,
  } satisfies RecommendationTuningEntry;
}

function topNotes(entries: RecommendationTuningEntry[]) {
  const notes: string[] = [];
  const elevated = [...entries]
    .filter((entry) => entry.currentWeight > entry.baselineWeight)
    .sort((left, right) => right.currentWeight - left.currentWeight)
    .slice(0, 2);
  const reduced = [...entries]
    .filter((entry) => entry.currentWeight < entry.baselineWeight)
    .sort((left, right) => left.currentWeight - right.currentWeight)
    .slice(0, 1);

  for (const entry of elevated) {
    uniquePush(
      notes,
      `${familyLabel(entry.recommendationFamily)} weight increased slightly because ${entry.adjustmentReason.toLowerCase()}`,
    );
  }
  for (const entry of reduced) {
    uniquePush(
      notes,
      `${familyLabel(entry.recommendationFamily)} weight eased slightly because ${entry.adjustmentReason.toLowerCase()}`,
    );
  }

  return notes.slice(0, 4);
}

async function readPersistedStore(): Promise<RecommendationTuningStore | null> {
  try {
    const raw = await readFile(RECOMMENDATION_TUNING_STORE_PATH, "utf8");
    const store = tuningStoreSchema.parse(JSON.parse(raw));
    inMemoryRecommendationTuningStore = store;
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryRecommendationTuningStore;
    }

    throw error;
  }
}

async function writePersistedStore(store: RecommendationTuningStore) {
  const parsed = tuningStoreSchema.parse(store);
  inMemoryRecommendationTuningStore = parsed;

  try {
    await mkdir(path.dirname(RECOMMENDATION_TUNING_STORE_PATH), { recursive: true });
    await writeFile(RECOMMENDATION_TUNING_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("recommendation-tuning", error);
      return;
    }

    throw error;
  }
}

export function getRecommendationWeight(
  state: RecommendationTuningState | null | undefined,
  family: RecommendationFamily | null | undefined,
) {
  if (!state || !family) {
    return 1;
  }

  return state.entries.find((entry) => entry.recommendationFamily === family)?.currentWeight ?? 1;
}

export function getRecommendationFamilyLabel(family: RecommendationFamily) {
  switch (family) {
    case "campaign_focus":
      return "Campaign focus";
    case "evergreen_balance":
      return "Evergreen balance";
    case "source_cleanup":
      return "Source cleanup";
    case "posting_priority":
      return "Posting priority";
    case "outcome_completion":
      return "Outcome completion";
    case "experiment_pacing":
      return "Experiment pacing";
    case "trust_stage_emphasis":
      return "Trust-stage emphasis";
    case "conversion_posture_shift":
      return "Conversion posture shift";
    case "outreach_focus":
      return "Outreach focus";
    case "queue_cleanup":
    default:
      return "Queue cleanup";
  }
}

export function getRecommendationFamilyForStrategicCategory(
  category: string,
): RecommendationFamily | null {
  switch (category) {
    case "campaign_focus":
      return "campaign_focus";
    case "evergreen_balance":
      return "evergreen_balance";
    case "source_quality":
      return "source_cleanup";
    case "experiment_pacing":
      return "experiment_pacing";
    case "outreach_focus":
      return "outreach_focus";
    case "conversion_pressure":
      return "conversion_posture_shift";
    case "funnel_mix":
      return "trust_stage_emphasis";
    default:
      return null;
  }
}

export function getRecommendationFamilyForResourceFocus(
  focusArea: string,
): RecommendationFamily | null {
  switch (focusArea) {
    case "review_queue":
      return "queue_cleanup";
    case "staging_and_posting":
      return "posting_priority";
    case "campaign_support":
      return "campaign_focus";
    case "source_quality":
      return "source_cleanup";
    case "experiment_resolution":
      return "experiment_pacing";
    case "outcome_completion":
      return "outcome_completion";
    case "evergreen_reuse":
      return "evergreen_balance";
    case "outreach":
      return "outreach_focus";
    default:
      return null;
  }
}

export function getRecommendationFamilyForOptimisation(input: {
  category: string;
  targetType: string;
  targetLabel: string;
}): RecommendationFamily | null {
  if (input.targetType === "source") {
    return "source_cleanup";
  }
  if (input.targetType === "destination" || input.targetType === "cta_style") {
    return "conversion_posture_shift";
  }
  if (input.targetType === "experiment") {
    return "experiment_pacing";
  }
  if (input.targetType === "weekly_mix" && input.targetLabel.toLowerCase().includes("evergreen")) {
    return "evergreen_balance";
  }
  if (input.targetType === "editorial_mode" && input.targetLabel.toLowerCase().includes("trust")) {
    return "trust_stage_emphasis";
  }
  if (input.targetType === "sequence_type" || input.targetType === "platform") {
    return "posting_priority";
  }
  return null;
}

export function inferRecommendationFamilyFromWorkflow(
  href: string,
  label?: string | null,
): RecommendationFamily | null {
  const normalizedHref = href.toLowerCase();
  const normalizedLabel = label?.toLowerCase() ?? "";

  if (normalizedHref.includes("/execution") || normalizedHref.includes("/posting")) {
    return "posting_priority";
  }
  if (normalizedHref.includes("/follow-up")) {
    return "outcome_completion";
  }
  if (normalizedHref.includes("/ingestion")) {
    return "source_cleanup";
  }
  if (normalizedHref.includes("/weekly-pack") || normalizedLabel.includes("evergreen")) {
    return normalizedLabel.includes("evergreen") ? "evergreen_balance" : "campaign_focus";
  }
  if (normalizedHref.includes("/campaign") || normalizedLabel.includes("campaign")) {
    return "campaign_focus";
  }
  if (normalizedHref.includes("/influencers") || normalizedHref.includes("/signals")) {
    return normalizedLabel.includes("outreach") || normalizedLabel.includes("relationship")
      ? "outreach_focus"
      : null;
  }
  if (normalizedHref.includes("/tasks") || normalizedHref.includes("/exceptions") || normalizedHref.includes("/review")) {
    return normalizedLabel.includes("trust")
      ? "trust_stage_emphasis"
      : normalizedLabel.includes("conversion")
        ? "conversion_posture_shift"
        : "queue_cleanup";
  }
  if (normalizedHref.includes("/experiments")) {
    return "experiment_pacing";
  }

  return null;
}

export function buildRecommendationTuningState(input: {
  auditEvents: AuditEvent[];
  approvalCandidates: ApprovalQueueCandidate[];
  weeklyExecution: WeeklyExecutionFlow;
  campaignAllocation: CampaignAllocationState;
  growthScorecard: GrowthScorecardSummary;
  weeklyRecap: WeeklyRecap;
  revenueInsights: RevenueSignalInsights;
  attributionInsights: AttributionInsights;
  sourceAutopilotState: SourceAutopilotV2State;
  audienceMemory: AudienceMemoryState;
  exceptionInbox: ExceptionInboxState;
  influencerGraphSummary: InfluencerGraphSummary;
  activeExperimentCount: number;
  previous?: RecommendationTuningStore | null;
  now?: Date;
}): RecommendationTuningState {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const previousEntries = new Map(
    (input.previous?.entries ?? []).map((entry) => [entry.recommendationFamily, entry]),
  );
  const trustFirstCount = input.approvalCandidates.filter(
    (candidate) => candidate.conversionIntent.posture === "trust_first",
  ).length;
  const conversionCount = input.approvalCandidates.filter(
    (candidate) =>
      candidate.conversionIntent.posture === "soft_conversion" ||
      candidate.conversionIntent.posture === "direct_conversion",
  ).length;
  const sourceApprovals = countEvents(input.auditEvents, ["SOURCE_CHANGE_APPROVED"]);
  const sourceDismissals = countEvents(input.auditEvents, ["SOURCE_CHANGE_DISMISSED"]);
  const evergreenActions = countEvents(input.auditEvents, [
    "EVERGREEN_RESURFACED",
    "EVERGREEN_APPROVED_FOR_REUSE",
  ]);
  const postingActions = countEvents(input.auditEvents, [
    "POSTING_CONFIRMED_MANUALLY",
    "SAFE_POSTING_COMPLETED",
  ]);
  const outcomeActions = countEvents(input.auditEvents, [
    "FOLLOW_UP_TASK_COMPLETED",
    "OUTCOME_RECORDED",
    "STRATEGIC_OUTCOME_RECORDED",
    "STRATEGIC_OUTCOME_UPDATED",
  ]);
  const experimentAccepts = countEvents(input.auditEvents, [
    "EXPERIMENT_PROPOSAL_CONFIRMED",
    "EXPERIMENT_AUTOPILOT_V2_ACCEPTED",
  ]);
  const experimentDismissals = countEvents(input.auditEvents, [
    "EXPERIMENT_PROPOSAL_DISMISSED",
    "EXPERIMENT_AUTOPILOT_V2_DISMISSED",
  ]);
  const outreachActions = countEvents(input.auditEvents, [
    "INTERACTION_RECORDED",
    "SAFE_REPLY_APPROVED",
  ]);
  const queueCleanupActions = countEvents(input.auditEvents, [
    "EXCEPTION_ITEM_RESOLVED",
    "DUPLICATE_CLUSTER_CONFIRMED",
  ]);
  const missingOutcomeCount =
    input.exceptionInbox.groups.find((group) => group.issueType === "missing_outcome")?.count ?? 0;
  const judgementCount =
    input.exceptionInbox.groups.find((group) => group.issueType === "needs_judgement")?.count ?? 0;
  const duplicateCount =
    input.exceptionInbox.groups.find((group) => group.issueType === "duplicate_unresolved")?.count ?? 0;
  const staleReusableCount = input.approvalCandidates.filter(
    (candidate) => candidate.triage.triageState === "stale_but_reusable",
  ).length;
  const sourcePressure =
    input.sourceAutopilotState.proposalSummary.openPauseCount +
    input.sourceAutopilotState.proposalSummary.openQueryRewriteCount;
  const underSupportedCampaignCount = input.campaignAllocation.underSupportedCount;
  const pausedCampaignCount = input.campaignAllocation.pausedCount;
  const experimentUnresolvedCount =
    input.exceptionInbox.groups.find((group) => group.issueType === "experiment_unresolved")?.count ?? 0;
  const outreachPressure =
    input.influencerGraphSummary.newRepliesPendingCount +
    input.influencerGraphSummary.followUpNeededCount;
  const hasOutcomeConcern = input.growthScorecard.topConcerns.some((item) => item.id === "outcome-gaps");
  const hasExecutionPositive = input.growthScorecard.topPositives.some((item) => item.id === "execution-ready");
  const hasCampaignConcern = input.growthScorecard.topConcerns.some((item) => item.id === "campaign-gap");
  const hasStaleConcern = input.growthScorecard.topConcerns.some((item) => item.id === "stale-pressure");

  const entries = RECOMMENDATION_FAMILIES.map((family) => {
    let delta = 0;
    let reason = defaultReason(family);
    let evidenceCount = 0;

    switch (family) {
      case "campaign_focus":
        evidenceCount = underSupportedCampaignCount + pausedCampaignCount;
        if (underSupportedCampaignCount > 0) {
          delta += 0.12 + (hasCampaignConcern ? 0.03 : 0);
          reason = `${underSupportedCampaignCount} active campaign${underSupportedCampaignCount === 1 ? "" : "s"} are under-supported in the current weekly mix.`;
        } else if (pausedCampaignCount > 0) {
          delta -= 0.06;
          reason = `${pausedCampaignCount} campaign${pausedCampaignCount === 1 ? "" : "s"} can stay lighter or paused, so campaign-focus recommendations can be less forceful.`;
        }
        break;
      case "evergreen_balance":
        evidenceCount = staleReusableCount + evergreenActions + input.weeklyRecap.reuseCandidates.length;
        if (staleReusableCount > 0 || input.weeklyRecap.reuseCandidates.length > 0) {
          delta += 0.1 + (evergreenActions > 0 ? 0.05 : 0);
          reason = `${staleReusableCount} reusable stale candidate${staleReusableCount === 1 ? "" : "s"} and ${input.weeklyRecap.reuseCandidates.length} recap reuse cue${input.weeklyRecap.reuseCandidates.length === 1 ? "" : "s"} suggest evergreen can carry more of the week.`;
        }
        break;
      case "source_cleanup":
        evidenceCount = sourcePressure + sourceApprovals + sourceDismissals;
        if (sourcePressure > 0) {
          delta += 0.12 + (sourceApprovals > sourceDismissals ? 0.05 : 0);
          reason = `${sourcePressure} open source proposal${sourcePressure === 1 ? "" : "s"} still indicate upstream noise.`;
        } else if (sourceDismissals > sourceApprovals && sourceDismissals > 0) {
          delta -= 0.05;
          reason = "Source cleanup recommendations have been dismissed more often than acted on recently.";
        }
        break;
      case "posting_priority":
        evidenceCount =
          input.weeklyExecution.stagedCount +
          input.weeklyExecution.readyToStageCount +
          postingActions;
        if (input.weeklyExecution.stagedCount > 0 || input.weeklyExecution.readyToStageCount > 0) {
          delta += 0.12 + (postingActions > 0 ? 0.04 : 0) + (hasExecutionPositive ? 0.02 : 0);
          reason = `${input.weeklyExecution.stagedCount} staged item${input.weeklyExecution.stagedCount === 1 ? "" : "s"} and ${input.weeklyExecution.readyToStageCount} ready-to-stage item${input.weeklyExecution.readyToStageCount === 1 ? "" : "s"} make posting urgency one of the fastest commercial levers.`;
        } else {
          delta -= 0.04;
          reason = "There is little staged execution ready right now, so posting-priority recommendations stay closer to baseline.";
        }
        break;
      case "outcome_completion":
        evidenceCount = missingOutcomeCount + outcomeActions;
        if (missingOutcomeCount > 0) {
          delta += 0.14 + (outcomeActions > 0 ? 0.03 : 0) + (hasOutcomeConcern ? 0.02 : 0);
          reason = `${missingOutcomeCount} missing outcome item${missingOutcomeCount === 1 ? "" : "s"} are still slowing learning and ranking quality.`;
        }
        break;
      case "experiment_pacing":
        evidenceCount = input.activeExperimentCount + experimentUnresolvedCount + experimentAccepts + experimentDismissals;
        if (input.activeExperimentCount >= 3 || experimentUnresolvedCount > 0) {
          delta += 0.1 + (experimentDismissals > experimentAccepts ? 0.03 : 0);
          reason = `${input.activeExperimentCount} active experiment${input.activeExperimentCount === 1 ? "" : "s"} and ${experimentUnresolvedCount} unresolved experiment item${experimentUnresolvedCount === 1 ? "" : "s"} keep pacing decisions important.`;
        } else if (experimentAccepts > experimentDismissals && experimentAccepts > 0) {
          delta -= 0.04;
          reason = "Experiment pacing looks healthier now that accepted tests are closing more cleanly.";
        }
        break;
      case "trust_stage_emphasis":
        evidenceCount = trustFirstCount + input.audienceMemory.segments.length;
        if (trustFirstCount >= Math.max(2, conversionCount) && input.audienceMemory.topNotes[0]) {
          delta += 0.1;
          reason = input.audienceMemory.topNotes[0];
        }
        break;
      case "conversion_posture_shift":
        evidenceCount =
          trustFirstCount +
          input.revenueInsights.highStrengthCount +
          input.attributionInsights.strongCount;
        if (
          trustFirstCount >= Math.max(2, conversionCount * 2) &&
          input.revenueInsights.highStrengthCount < Math.max(2, trustFirstCount)
        ) {
          delta += 0.1;
          reason = `${trustFirstCount} trust-first candidate${trustFirstCount === 1 ? "" : "s"} are available while strong commercial outcomes are still thin enough to justify soft-conversion nudges.`;
        } else if (input.revenueInsights.highStrengthCount >= 3) {
          delta -= 0.04;
          reason = "Current conversion-linked evidence is already healthier, so conversion-posture shift recommendations can stay lighter.";
        }
        break;
      case "outreach_focus":
        evidenceCount = outreachPressure + outreachActions;
        if (outreachPressure > 0) {
          delta += 0.09 + (outreachActions > 0 ? 0.04 : 0);
          reason =
            input.influencerGraphSummary.newRepliesPendingCount > 0
              ? `${input.influencerGraphSummary.newRepliesPendingCount} reply${input.influencerGraphSummary.newRepliesPendingCount === 1 ? "" : "ies"} are waiting and should keep outreach recommendations elevated.`
              : `${input.influencerGraphSummary.followUpNeededCount} relationship follow-up${input.influencerGraphSummary.followUpNeededCount === 1 ? "" : "s"} remain open.`;
        }
        break;
      case "queue_cleanup":
      default:
        evidenceCount = judgementCount + duplicateCount + queueCleanupActions;
        if (judgementCount > 0 || duplicateCount > 0) {
          delta += 0.11 + (queueCleanupActions > 0 ? 0.03 : 0) + (hasStaleConcern ? 0.02 : 0);
          reason = `${judgementCount} judgement-heavy item${judgementCount === 1 ? "" : "s"} and ${duplicateCount} duplicate issue${duplicateCount === 1 ? "" : "s"} keep queue cleanup high leverage.`;
        } else if (queueCleanupActions > 0) {
          delta -= 0.03;
          reason = "Recent queue-cleanup actions are landing, so cleanup emphasis can stay a little lighter.";
        }
        break;
    }

    return buildEntry({
      family,
      delta,
      reason,
      evidenceCount,
      previous: previousEntries.get(family) ?? null,
      nowIso,
    });
  });

  const sortedByWeight = [...entries].sort(
    (left, right) =>
      right.currentWeight - left.currentWeight ||
      right.evidenceCount - left.evidenceCount ||
      left.recommendationFamily.localeCompare(right.recommendationFamily),
  );

  const state = tuningStateSchema.parse({
    generatedAt: nowIso,
    entries: sortedByWeight,
    elevatedFamilies: sortedByWeight.filter((entry) => entry.currentWeight > entry.baselineWeight).slice(0, 4),
    reducedFamilies: [...sortedByWeight]
      .filter((entry) => entry.currentWeight < entry.baselineWeight)
      .sort((left, right) => left.currentWeight - right.currentWeight)
      .slice(0, 4),
    topNotes: topNotes(sortedByWeight),
  });

  return state;
}

export async function syncRecommendationTuningState(input: {
  auditEvents: AuditEvent[];
  approvalCandidates: ApprovalQueueCandidate[];
  weeklyExecution: WeeklyExecutionFlow;
  campaignAllocation: CampaignAllocationState;
  growthScorecard: GrowthScorecardSummary;
  weeklyRecap: WeeklyRecap;
  revenueInsights: RevenueSignalInsights;
  attributionInsights: AttributionInsights;
  sourceAutopilotState: SourceAutopilotV2State;
  audienceMemory: AudienceMemoryState;
  exceptionInbox: ExceptionInboxState;
  influencerGraphSummary: InfluencerGraphSummary;
  activeExperimentCount: number;
  now?: Date;
}): Promise<RecommendationTuningState> {
  const previous = await readPersistedStore();
  const state = buildRecommendationTuningState({
    ...input,
    previous,
  });

  const nextStore = tuningStoreSchema.parse({
    generatedAt: state.generatedAt,
    entries: state.entries,
  });
  await writePersistedStore(nextStore);

  const previousEntries = new Map(
    (previous?.entries ?? []).map((entry) => [entry.recommendationFamily, entry]),
  );
  const adjustedEntries = state.entries.filter((entry) => {
    const previousEntry = previousEntries.get(entry.recommendationFamily);
    return !previousEntry || previousEntry.currentWeight !== entry.currentWeight;
  });

  await appendAuditEventsSafe([
    {
      signalId: `recommendation-tuning:${state.generatedAt.slice(0, 10)}`,
      eventType: "RECOMMENDATION_TUNING_EVALUATED",
      actor: "system",
      summary: `Evaluated recommendation tuning across ${state.entries.length} recommendation families.`,
      metadata: {
        elevatedFamilies: state.elevatedFamilies.length,
        reducedFamilies: state.reducedFamilies.length,
        topFamily: state.entries[0]?.recommendationFamily ?? null,
      },
    },
    ...adjustedEntries.map((entry) => ({
      signalId: `recommendation-family:${entry.recommendationFamily}`,
      eventType: "RECOMMENDATION_WEIGHT_ADJUSTED" as const,
      actor: "system" as const,
      summary: `${getRecommendationFamilyLabel(entry.recommendationFamily)} weight adjusted to ${entry.currentWeight.toFixed(2)}.`,
      metadata: {
        family: entry.recommendationFamily,
        currentWeight: entry.currentWeight,
        baselineWeight: entry.baselineWeight,
        evidenceCount: entry.evidenceCount,
        reason: entry.adjustmentReason,
      },
    })),
  ]);

  return state;
}

export async function getStoredRecommendationTuningState(): Promise<RecommendationTuningState | null> {
  const store = await readPersistedStore();
  if (!store) {
    return null;
  }

  return tuningStateSchema.parse({
    generatedAt: store.generatedAt,
    entries: store.entries,
    elevatedFamilies: store.entries.filter((entry) => entry.currentWeight > entry.baselineWeight).slice(0, 4),
    reducedFamilies: [...store.entries]
      .filter((entry) => entry.currentWeight < entry.baselineWeight)
      .sort((left, right) => left.currentWeight - right.currentWeight)
      .slice(0, 4),
    topNotes: topNotes(store.entries),
  });
}
