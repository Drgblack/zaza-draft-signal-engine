import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { listSignalsWithFallback } from "@/lib/signal-repository";
import { buildAudienceMemoryState } from "@/lib/audience-memory";
import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { evaluateAutonomyPolicy, type AutonomyPolicyDecision, type AutonomyRiskLevel } from "@/lib/autonomy-policy";
import { buildAttributionInsights, buildAttributionRecordsFromInputs } from "@/lib/attribution";
import { buildCampaignAllocationState } from "@/lib/campaign-allocation";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { buildGrowthMemory, type GrowthMemoryState } from "@/lib/growth-memory";
import {
  applySelectedHookSelection,
  buildHookSet,
  generateHookSets,
  hookSetSchema,
  type HookSet,
} from "@/lib/hook-engine";
import {
  type GrowthIntelligence,
} from "@/lib/strategic-intelligence-types";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { resolveActiveABTestResult } from "@/lib/factory-ab-tests";
import {
  assessAutoApproveOpportunity,
  findLinkedBatchRenderJobForOpportunity,
  getActiveAutoApproveConfig,
} from "@/lib/factory-batch-control";
import {
  buildMessageAngles,
  generateMessageAngles,
  messageAngleSchema,
  type MessageAngle,
} from "@/lib/message-angles";
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
import { resolveCaptionProviderId } from "@/lib/providers/caption-provider";
import { resolveNarrationProviderId } from "@/lib/providers/narration-provider";
import {
  buildProductionPackage,
  type ProductionPackage,
} from "@/lib/production-packages";
import {
  narrationSpecSchema,
  type NarrationSpec,
} from "@/lib/narration-specs";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import {
  createMockRenderedAsset,
  createPendingAssetReview,
  assetReviewStateSchema,
  renderedAssetSchema,
  type AssetReviewState,
  type RenderedAsset,
} from "@/lib/rendered-assets";
import { orchestrateCompiledVideoGeneration } from "@/lib/generation-orchestrator";
import {
  productionDefaultsSnapshotEquals,
  type ProductionDefaults,
} from "@/lib/production-defaults";
import {
  createRenderJob,
  type RenderProvider,
  renderJobSchema,
  type RenderJob,
} from "@/lib/render-jobs";
import {
  appendPerformanceSignals,
  buildProductionOutcomeMetadata,
  buildAssetAcceptedPerformanceSignal,
  buildAssetDiscardedPerformanceSignal,
  buildAssetGeneratedPerformanceSignal,
  buildAssetRegeneratedPerformanceSignal,
  buildAssetRejectedPerformanceSignal,
  buildBriefApprovedPerformanceSignal,
  performanceSignalSchema,
  type PerformanceSignal,
} from "@/lib/performance-signals";
import { buildRevenueSignalsFromInputs } from "@/lib/revenue-signals";
import { buildRevenueSignalInsights } from "@/lib/revenue-signals";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import {
  buildVideoGenerationRequest,
  type VideoGenerationRequest,
  videoGenerationRequestSchema,
} from "@/lib/video-generation";
import {
  buildVideoBrief,
  VIDEO_BRIEF_CONTENT_TYPES,
  validateVideoBrief,
  type VideoBrief,
  videoBriefSchema,
} from "@/lib/video-briefs";
import {
  buildVideoPrompt,
  type VideoPrompt,
  videoPromptSchema,
} from "@/lib/video-prompts";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { buildWeeklyPostingPack } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";
import { syncPhaseEArtifactsForProductionPackage } from "@/lib/phase-e-orchestration";
import {
  buildVideoFactoryThumbnailSpec,
  upsertVideoFactoryThumbnailSpec,
} from "@/lib/video-factory-thumbnail-specs";
import {
  createDraftVideoFactoryLifecycle,
  transitionVideoFactoryLifecycle,
  videoFactoryLifecycleSchema,
  type VideoFactoryLifecycle,
  type VideoFactoryStatus,
} from "@/lib/video-factory-state";
import {
  buildCostEstimate,
  costEstimateSchema,
  buildJobCostRecord,
  evaluateVideoFactoryDailySpendGuard,
  evaluateVideoFactoryBudgetGuard,
  getVideoFactoryMaxRegenerationsPerBrief,
  jobCostRecordSchema,
  videoFactoryBudgetGuardSchema,
  type CostEstimate,
  type VideoFactoryDailySpendGuard,
  type JobCostRecord,
  type VideoFactoryBudgetGuard,
} from "@/lib/video-factory-cost";
import { persistVideoFactoryArtifacts } from "@/lib/video-factory-artifact-storage";
import { syncVideoFactoryLanguageMemoryFromReview } from "@/lib/video-factory-language-memory";
import {
  ensureFactoryPublishOutcomePlaceholder,
  getFactoryPublishOutcome,
} from "@/lib/video-factory-publish-outcomes";
import {
  lifecycleStatusForQualityFailure,
  isRetryableQualityCheckResult,
  qualityCheckResultSchema,
  runVideoFactoryQualityChecks,
  summarizeQualityCheckFailures,
  type QualityCheckResult,
} from "@/lib/video-factory-quality-checks";
import {
  executeWithRetry,
  VideoFactoryRetryExecutionError,
  VideoFactoryRetryableError,
  summarizeVideoFactoryRetryStates,
  videoFactoryRetryStateSchema,
  type VideoFactoryRetryState,
} from "@/lib/video-factory-retry";
import {
  appendFactoryRunLedgerEntry,
  buildFactoryRunLedgerEntry,
  factoryRunLedgerEntrySchema,
  updateFactoryRunLedgerOutcome,
  type FactoryRunLedgerEntry,
} from "@/lib/video-factory-run-ledger";
import { buildLearningRecordId, upsertLearningRecord } from "@/lib/learning-loop";
import {
  buildContentOpportunityLearningMetadata,
  buildContentOpportunityLearningSignature,
} from "@/lib/content-opportunity-learning-service";
import {
  applyPhaseEIntelligence,
  buildOpportunityGrowthIntelligence,
} from "@/lib/content-opportunity-intelligence-service";
import {
  CONTENT_OPPORTUNITY_SKIP_REASONS,
  CONTENT_OPPORTUNITY_STATUSES,
} from "@/lib/content-opportunity-shared";
import {
  appendFactoryComparisonRecord,
  factoryComparisonRecordSchema,
  maybeBuildFactoryComparisonRecord,
  updateFactoryComparisonDecision,
  updateFactoryComparisonRecordForRenderJob,
  type FactoryComparisonRecord,
} from "@/lib/video-factory-comparisons";
import {
  appendVideoFactoryAttemptLineage,
  buildVideoFactoryAttemptLineage,
  videoFactoryAttemptLineageSchema,
  type VideoFactoryAttemptLineage,
} from "@/lib/video-factory-lineage";
import { summarizeVideoFactoryProviderFailure } from "@/lib/video-factory-provider-errors";
import { resolveVideoFactoryLearningPolicy } from "@/lib/video-factory-learning-policy";
import {
  compileVideoBriefForProduction,
  type CompiledProductionPlan,
} from "@/lib/prompt-compiler";
import {
  applyBudgetControlThresholds,
  applyVideoFactorySelectionDecision,
  buildVideoFactorySelectionDecision,
} from "@/lib/video-factory-selection";
import {
  buildVideoFactoryIdempotencyKey,
  getActiveVideoFactoryRenderVersion,
  isVideoFactoryLifecycleActive,
  resolveVideoFactoryDuplicateRunDecision,
  VideoFactoryActiveRunError,
} from "@/lib/video-factory-idempotency";
import {
  deriveStructuredReasonsFromLegacyRegenerationReason,
  normalizeFactoryReviewReasonCodes,
  type FactoryReviewReasonCode,
} from "@/lib/video-factory-review-reasons";
import type { PostingPlatform } from "@/lib/posting-memory";

const CONTENT_OPPORTUNITY_STORE_PATH = path.join(process.cwd(), "data", "content-opportunities.json");
const CURRENT_RENDER_VERSION = "phase-c-render-v1";
const ENABLE_FORMAT_INTELLIGENCE = true;

export const CONTENT_OPPORTUNITY_TYPES = [
  "pain_point_opportunity",
  "campaign_support_opportunity",
  "audience_opportunity",
  "commercial_opportunity",
  "evergreen_opportunity",
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
export type ContentOpportunitySkipReason =
  (typeof CONTENT_OPPORTUNITY_SKIP_REASONS)[number];

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

export interface ContentOpportunityGenerationState {
  videoBriefApprovedAt: string | null;
  videoBriefApprovedBy: string | null;
  factoryLifecycle: VideoFactoryLifecycle | null;
  latestCostEstimate: CostEstimate | null;
  latestActualCost: JobCostRecord | null;
  latestBudgetGuard: VideoFactoryBudgetGuard | null;
  latestQualityCheck: QualityCheckResult | null;
  latestRetryState: VideoFactoryRetryState | null;
  runLedger: FactoryRunLedgerEntry[];
  comparisonRecords: FactoryComparisonRecord[];
  attemptLineage: VideoFactoryAttemptLineage[];
  narrationSpec: NarrationSpec | null;
  videoPrompt: VideoPrompt | null;
  generationRequest: VideoGenerationRequest | null;
  renderJob: RenderJob | null;
  renderedAsset: RenderedAsset | null;
  assetReview: AssetReviewState | null;
  performanceSignals: PerformanceSignal[];
}

export interface ContentOpportunityHookRankingItem {
  hook: string;
  score: number;
}

export interface ContentOpportunityPerformanceDrivers {
  hookStrength?: number;
  stakes?: number;
  viewerConnection?: number;
  generalistAppeal?: number;
  perspectiveShift?: number;
  authenticityFit?: number;
  brandAlignment?: number;
  conversionPotential?: number;
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
  painPointCategory: string | null;
  teacherLanguage: string[];
  recommendedAngle: string;
  recommendedHookDirection: string;
  recommendedFormat: "text" | "carousel" | "short_video" | "multi_asset";
  recommendedPlatforms: PostingPlatform[];
  whyNow: string;
  commercialPotential: "high" | "medium" | "low";
  trustRisk: "low" | "medium" | "high";
  riskSummary: string | null;
  confidence: number | null;
  historicalCostAvg: number | null;
  historicalApprovalRate: number | null;
  suggestedNextStep: string;
  skipReason: ContentOpportunitySkipReason | null;
  hookOptions: string[] | null;
  hookRanking: ContentOpportunityHookRankingItem[] | null;
  performanceDrivers: ContentOpportunityPerformanceDrivers | null;
  intendedViewerEffect: string | null;
  suggestedCTA: string | null;
  productionComplexity: "low" | "medium" | "high" | null;
  growthIntelligence: GrowthIntelligence | null;
  supportingSignals: string[];
  memoryContext: ContentOpportunityMemoryContext;
  sourceSignalIds: string[];
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  dismissedAt: string | null;
  messageAngles: MessageAngle[];
  hookSets: HookSet[];
  founderSelectionStatus: ContentOpportunityFounderSelectionStatus;
  selectedAngleId: string | null;
  selectedHookId: string | null;
  selectedVideoBrief: VideoBrief | null;
  generationState: ContentOpportunityGenerationState | null;
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

export interface ContentOpportunityVideoGenerationActionResult {
  state: ContentOpportunityState;
  jobId: string | null;
  estimatedCostUsd: number | null;
  regenerationCount: number;
  budgetRemaining: number;
  budgetExhausted: boolean;
}

export class VideoFactoryDailyCapExceededError extends Error {
  readonly dailySpendGuard: VideoFactoryDailySpendGuard;
  readonly state: ContentOpportunityState;
  readonly jobId: string | null;
  readonly estimatedCostUsd: number | null;
  readonly regenerationCount: number;
  readonly budgetRemaining: number;

  constructor(input: {
    message: string;
    dailySpendGuard: VideoFactoryDailySpendGuard;
    state: ContentOpportunityState;
    jobId: string | null;
    estimatedCostUsd: number | null;
    regenerationCount: number;
    budgetRemaining: number;
  }) {
    super(input.message);
    this.name = "VideoFactoryDailyCapExceededError";
    this.dailySpendGuard = input.dailySpendGuard;
    this.state = input.state;
    this.jobId = input.jobId;
    this.estimatedCostUsd = input.estimatedCostUsd;
    this.regenerationCount = input.regenerationCount;
    this.budgetRemaining = input.budgetRemaining;
  }
}

export class VideoFactoryRegenerationBudgetExceededError extends Error {
  readonly state: ContentOpportunityState;
  readonly jobId: string | null;
  readonly estimatedCostUsd: number | null;
  readonly regenerationCount: number;
  readonly budgetRemaining: number;

  constructor(input: {
    message: string;
    state: ContentOpportunityState;
    jobId: string | null;
    estimatedCostUsd: number | null;
    regenerationCount: number;
    budgetRemaining: number;
  }) {
    super(input.message);
    this.name = "VideoFactoryRegenerationBudgetExceededError";
    this.state = input.state;
    this.jobId = input.jobId;
    this.estimatedCostUsd = input.estimatedCostUsd;
    this.regenerationCount = input.regenerationCount;
    this.budgetRemaining = input.budgetRemaining;
  }
}

export class VideoFactoryAutonomyPolicyError extends Error {
  readonly state: ContentOpportunityState;
  readonly reason: string;
  readonly riskLevel: AutonomyRiskLevel;
  readonly jobId: string | null;
  readonly estimatedCostUsd: number | null;
  readonly regenerationCount: number;
  readonly budgetRemaining: number;

  constructor(input: {
    message: string;
    state: ContentOpportunityState;
    reason: string;
    riskLevel: AutonomyRiskLevel;
    jobId: string | null;
    estimatedCostUsd: number | null;
    regenerationCount: number;
    budgetRemaining: number;
  }) {
    super(input.message);
    this.name = "VideoFactoryAutonomyPolicyError";
    this.state = input.state;
    this.reason = input.reason;
    this.riskLevel = input.riskLevel;
    this.jobId = input.jobId;
    this.estimatedCostUsd = input.estimatedCostUsd;
    this.regenerationCount = input.regenerationCount;
    this.budgetRemaining = input.budgetRemaining;
  }
}

function contentOpportunityAutonomyType(input: {
  opportunity: ContentOpportunity;
  isRegenerate: boolean;
}) {
  if (input.isRegenerate) {
    return "experimental" as const;
  }

  return input.opportunity.opportunityType === "campaign_support_opportunity"
    ? ("campaign" as const)
    : ("reactive" as const);
}

function contentOpportunitySeverityScore(priority: ContentOpportunityPriority) {
  if (priority === "high") {
    return 3;
  }

  if (priority === "medium") {
    return 2;
  }

  return 1;
}

function contentOpportunityConfidenceScore(opportunity: ContentOpportunity) {
  if (opportunity.trustRisk === "low" && opportunity.commercialPotential === "high") {
    return 0.85;
  }

  if (opportunity.trustRisk === "medium") {
    return 0.6;
  }

  if (opportunity.trustRisk === "low") {
    return 0.7;
  }

  return 0.35;
}

function roundOpportunityMetric(value: number) {
  return Math.round(value * 10000) / 10000;
}

function derivePainPointCategory(
  opportunity: Pick<
    ContentOpportunity,
    "title" | "primaryPainPoint" | "teacherLanguage" | "recommendedAngle" | "riskSummary"
  >,
) {
  const haystack = normalizeText(
    [
      opportunity.title,
      opportunity.primaryPainPoint,
      ...opportunity.teacherLanguage,
      opportunity.recommendedAngle,
      opportunity.riskSummary,
    ].join(" "),
  )?.toLowerCase();

  if (!haystack) {
    return "teacher-communication";
  }

  if (
    haystack.includes("parent") ||
    haystack.includes("email") ||
    haystack.includes("message")
  ) {
    return "parent-communication";
  }

  if (
    haystack.includes("report card") ||
    haystack.includes("grading") ||
    haystack.includes("comment")
  ) {
    return "assessment-feedback";
  }

  if (
    haystack.includes("behaviour") ||
    haystack.includes("behavior") ||
    haystack.includes("classroom management")
  ) {
    return "behavior-management";
  }

  if (
    haystack.includes("planning") ||
    haystack.includes("workload") ||
    haystack.includes("time") ||
    haystack.includes("burnout")
  ) {
    return "teacher-workload";
  }

  if (
    haystack.includes("leader") ||
    haystack.includes("admin") ||
    haystack.includes("principal")
  ) {
    return "school-leadership";
  }

  return "teacher-communication";
}

function deriveOpportunityConfidence(input: {
  opportunity: ContentOpportunity;
  performanceDrivers?: ContentOpportunityPerformanceDrivers | null;
}) {
  const performanceDrivers = input.performanceDrivers ?? {};
  const scoredDrivers = Object.values(performanceDrivers).filter(
    (value): value is number => typeof value === "number",
  );
  const averageDriverScore =
    scoredDrivers.length > 0
      ? scoredDrivers.reduce((sum, value) => sum + value, 0) / scoredDrivers.length
      : null;
  let confidence = contentOpportunityConfidenceScore(input.opportunity);

  if (averageDriverScore !== null) {
    confidence += (averageDriverScore - 3) * 0.06;
  }

  if ((input.opportunity.growthIntelligence?.executionPriority ?? 0) >= 75) {
    confidence += 0.05;
  }

  if (input.opportunity.trustRisk === "high") {
    confidence = Math.min(confidence, 0.58);
  }

  return roundOpportunityMetric(Math.max(0, Math.min(1, confidence)));
}

function extractHistoricalActualCostUsd(opportunity: ContentOpportunity) {
  const directCost = opportunity.generationState?.latestActualCost?.actualCostUsd;
  if (typeof directCost === "number") {
    return directCost;
  }

  const ledgerCosts = opportunity.generationState?.runLedger
    .map((entry) => entry.actualCost?.actualCostUsd ?? null)
    .filter((value): value is number => typeof value === "number");

  if (!ledgerCosts || ledgerCosts.length === 0) {
    return null;
  }

  return roundOpportunityMetric(
    ledgerCosts.reduce((sum, value) => sum + value, 0) / ledgerCosts.length,
  );
}

function extractHistoricalApprovalOutcome(opportunity: ContentOpportunity) {
  const terminalOutcome =
    opportunity.generationState?.runLedger.at(-1)?.terminalOutcome ??
    opportunity.generationState?.assetReview?.status ??
    null;

  if (!terminalOutcome) {
    return null;
  }

  if (terminalOutcome === "accepted") {
    return 1;
  }

  if (
    terminalOutcome === "rejected" ||
    terminalOutcome === "discarded" ||
    terminalOutcome === "failed" ||
    terminalOutcome === "failed_permanent"
  ) {
    return 0;
  }

  return null;
}

function buildHistoricalOpportunityMetrics(
  opportunity: ContentOpportunity,
  historicalUniverse: ContentOpportunity[],
) {
  const painPointCategory =
    opportunity.painPointCategory ?? derivePainPointCategory(opportunity);
  const peers = historicalUniverse.filter((candidate) => {
    if (candidate.opportunityId === opportunity.opportunityId) {
      return false;
    }

    const candidateCategory =
      candidate.painPointCategory ?? derivePainPointCategory(candidate);

    return (
      candidateCategory === painPointCategory ||
      candidate.opportunityType === opportunity.opportunityType
    );
  });
  const costValues = peers
    .map((peer) => extractHistoricalActualCostUsd(peer))
    .filter((value): value is number => typeof value === "number");
  const approvalOutcomes = peers
    .map((peer) => extractHistoricalApprovalOutcome(peer))
    .filter((value): value is 0 | 1 => value === 0 || value === 1);

  return {
    historicalCostAvg:
      costValues.length > 0
        ? roundOpportunityMetric(
            costValues.reduce((sum, value) => sum + value, 0) / costValues.length,
          )
        : null,
    historicalApprovalRate:
      approvalOutcomes.length > 0
        ? roundOpportunityMetric(
            approvalOutcomes.reduce<number>((sum, value) => sum + value, 0) /
              approvalOutcomes.length,
          )
        : null,
  };
}

function enrichOpportunityPhaseEFields(
  opportunity: ContentOpportunity,
  historicalUniverse: ContentOpportunity[] = [],
): ContentOpportunity {
  const painPointCategory =
    opportunity.painPointCategory ?? derivePainPointCategory(opportunity);
  const historicalMetrics =
    historicalUniverse.length > 0
      ? buildHistoricalOpportunityMetrics(
          {
            ...opportunity,
            painPointCategory,
          },
          historicalUniverse,
        )
      : {
          historicalCostAvg: opportunity.historicalCostAvg ?? null,
          historicalApprovalRate: opportunity.historicalApprovalRate ?? null,
        };

  return contentOpportunitySchema.parse({
    ...opportunity,
    painPointCategory,
    confidence:
      opportunity.confidence ??
      deriveOpportunityConfidence({
        opportunity: {
          ...opportunity,
          painPointCategory,
        },
        performanceDrivers: opportunity.performanceDrivers,
      }),
    historicalCostAvg:
      opportunity.historicalCostAvg ?? historicalMetrics.historicalCostAvg ?? null,
    historicalApprovalRate:
      opportunity.historicalApprovalRate ??
      historicalMetrics.historicalApprovalRate ??
      null,
  });
}

function evaluateContentOpportunityVideoAutonomyPolicy(input: {
  opportunity: ContentOpportunity;
  generationState: ContentOpportunityGenerationState | null;
  isRegenerate: boolean;
  retryCount: number;
  costEstimateUsd: number | null;
  lifecycleState: string | null;
}): AutonomyPolicyDecision {
  return evaluateAutonomyPolicy({
    actionType: input.isRegenerate
      ? "auto_regenerate_video_factory"
      : "auto_run_video_factory",
    contentType: contentOpportunityAutonomyType({
      opportunity: input.opportunity,
      isRegenerate: input.isRegenerate,
    }),
    confidenceScore: contentOpportunityConfidenceScore(input.opportunity),
    severityScore: contentOpportunitySeverityScore(input.opportunity.priority),
    retryCount: input.retryCount,
    costEstimateUsd:
      input.costEstimateUsd ??
      input.generationState?.latestCostEstimate?.estimatedTotalUsd ??
      null,
    platformTarget: input.opportunity.recommendedPlatforms[0] ?? null,
    lifecycleState:
      input.lifecycleState ??
      input.generationState?.factoryLifecycle?.status ??
      null,
    riskLevel: input.opportunity.trustRisk,
    missingCriticalMetadata:
      !input.opportunity.selectedVideoBrief ||
      !input.opportunity.approvedAt ||
      !(input.opportunity.recommendedPlatforms[0] ?? null),
  });
}

export async function assertAutoProceedAllowedForQueuedContentOpportunityVideoGeneration(input: {
  opportunityId: string;
}) {
  const store = await readPersistedStore();
  const opportunity = store.opportunities.find(
    (item) => item.opportunityId === input.opportunityId,
  );
  if (!opportunity) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedOpportunity = normalizePersistedOpportunity(opportunity);
  const generationState = normalizedOpportunity.generationState;
  const retryCount =
    generationState?.latestRetryState?.retryCount ??
    generationState?.renderJob?.retryState?.retryCount ??
    0;

  if (retryCount <= 0) {
    return null;
  }

  const decision = evaluateContentOpportunityVideoAutonomyPolicy({
    opportunity: normalizedOpportunity,
    generationState,
    isRegenerate: Boolean(generationState?.renderJob?.regenerationReason),
    retryCount,
    costEstimateUsd:
      generationState?.renderJob?.costEstimate?.estimatedTotalUsd ??
      generationState?.latestCostEstimate?.estimatedTotalUsd ??
      null,
    lifecycleState: generationState?.factoryLifecycle?.status ?? null,
  });

  if (decision.requireReview) {
    const state = summarizeState(
      store.opportunities.map((item) => normalizePersistedOpportunity(item)),
    );
    const maxRegenerationsPerBrief = getVideoFactoryMaxRegenerationsPerBrief();
    const regenerationCount = Math.max(
      0,
      (generationState?.runLedger.length ?? 1) - 1,
    );
    throw new VideoFactoryAutonomyPolicyError({
      message: decision.reason,
      state,
      reason: decision.reason,
      riskLevel: decision.riskLevel,
      jobId: generationState?.renderJob?.id ?? null,
      estimatedCostUsd:
        generationState?.renderJob?.costEstimate?.estimatedTotalUsd ??
        generationState?.latestCostEstimate?.estimatedTotalUsd ??
        null,
      regenerationCount,
      budgetRemaining: Math.max(0, maxRegenerationsPerBrief - regenerationCount),
    });
  }

  return decision;
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

const contentOpportunityHookRankingItemSchema = z.object({
  hook: z.string().trim().min(1),
  score: z.number(),
});

const contentOpportunityPerformanceDriversSchema = z.object({
  hookStrength: z.number().optional(),
  stakes: z.number().optional(),
  viewerConnection: z.number().optional(),
  generalistAppeal: z.number().optional(),
  perspectiveShift: z.number().optional(),
  authenticityFit: z.number().optional(),
  brandAlignment: z.number().optional(),
  conversionPotential: z.number().optional(),
});

const contentOpportunityGrowthIntelligenceSchema = z.object({
  executionPriority: z.number().optional(),
  strategicValue: z.number().optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  learningValue: z.number().optional(),
  campaignFit: z.number().optional(),
  channelFit: z.record(z.string(), z.number()).optional(),
  executionPath: z
    .enum(["video_factory", "campaigns", "connect", "hold", "review"])
    .optional(),
  expectedOutcome: z.string().trim().nullable().optional(),
  reasoning: z.string().trim().nullable().optional(),
});

export const contentOpportunityGenerationStateSchema = z.object({
  videoBriefApprovedAt: z.string().trim().nullable().default(null),
  videoBriefApprovedBy: z.string().trim().nullable().default(null),
  factoryLifecycle: videoFactoryLifecycleSchema.nullable().default(null),
  latestCostEstimate: costEstimateSchema.nullable().default(null),
  latestActualCost: jobCostRecordSchema.nullable().default(null),
  latestBudgetGuard: videoFactoryBudgetGuardSchema.nullable().default(null),
  latestQualityCheck: qualityCheckResultSchema.nullable().default(null),
  latestRetryState: videoFactoryRetryStateSchema.nullable().default(null),
  runLedger: z.array(factoryRunLedgerEntrySchema).default([]),
  comparisonRecords: z.array(factoryComparisonRecordSchema).default([]),
  attemptLineage: z.array(videoFactoryAttemptLineageSchema).default([]),
  narrationSpec: narrationSpecSchema.nullable().default(null),
  videoPrompt: videoPromptSchema.nullable().default(null),
  generationRequest: videoGenerationRequestSchema.nullable().default(null),
  renderJob: renderJobSchema.nullable().default(null),
  renderedAsset: renderedAssetSchema.nullable().default(null),
  assetReview: assetReviewStateSchema.nullable().default(null),
  performanceSignals: z.array(performanceSignalSchema).default([]),
});

const contentOpportunitySkipReasonSchema = z.preprocess((value) => {
  const normalized =
    typeof value === "string" ? normalizeText(value)?.toLowerCase() ?? null : value;

  if (!normalized) {
    return null;
  }

  if (
    typeof normalized === "string" &&
    CONTENT_OPPORTUNITY_SKIP_REASONS.includes(
      normalized as ContentOpportunitySkipReason,
    )
  ) {
    return normalized;
  }

  return "other";
}, z.enum(CONTENT_OPPORTUNITY_SKIP_REASONS).nullable());

export const contentOpportunitySchema = z.object({
  opportunityId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  opportunityType: z.enum(CONTENT_OPPORTUNITY_TYPES),
  status: z.enum(CONTENT_OPPORTUNITY_STATUSES),
  priority: z.enum(CONTENT_OPPORTUNITY_PRIORITIES),
  source: contentOpportunitySourceRefSchema,
  primaryPainPoint: z.string().trim().min(1),
  painPointCategory: z.string().trim().nullable().default(null),
  teacherLanguage: z.array(z.string().trim().min(1)).max(4),
  recommendedAngle: z.string().trim().min(1),
  recommendedHookDirection: z.string().trim().min(1),
  recommendedFormat: z.enum(["text", "carousel", "short_video", "multi_asset"]),
  recommendedPlatforms: z.array(z.enum(["x", "linkedin", "reddit"])).min(1).max(3),
  whyNow: z.string().trim().min(1),
  commercialPotential: z.enum(["high", "medium", "low"]),
  trustRisk: z.enum(["low", "medium", "high"]),
  riskSummary: z.string().trim().nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
  historicalCostAvg: z.number().nonnegative().nullable().default(null),
  historicalApprovalRate: z.number().min(0).max(1).nullable().default(null),
  suggestedNextStep: z.string().trim().min(1),
  skipReason: contentOpportunitySkipReasonSchema.default(null),
  hookOptions: z.array(z.string().trim().min(1)).nullable().default(null),
  hookRanking: z.array(contentOpportunityHookRankingItemSchema).nullable().default(null),
  performanceDrivers: contentOpportunityPerformanceDriversSchema.nullable().default(null),
  intendedViewerEffect: z.string().trim().nullable().default(null),
  suggestedCTA: z.string().trim().nullable().default(null),
  productionComplexity: z.enum(["low", "medium", "high"]).nullable().default(null),
  growthIntelligence: contentOpportunityGrowthIntelligenceSchema.nullable().default(null),
  supportingSignals: z.array(z.string().trim().min(1)).max(6),
  memoryContext: contentOpportunityMemoryContextSchema,
  sourceSignalIds: z.array(z.string().trim().min(1)).min(1).max(6),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  approvedAt: z.string().trim().nullable().default(null),
  dismissedAt: z.string().trim().nullable().default(null),
  messageAngles: z.array(messageAngleSchema).max(3).default([]),
  hookSets: z.array(hookSetSchema).max(3).default([]),
  founderSelectionStatus: z
    .enum(CONTENT_OPPORTUNITY_FOUNDER_SELECTION_STATUSES)
    .default("pending"),
  selectedAngleId: z.string().trim().nullable().default(null),
  selectedHookId: z.string().trim().nullable().default(null),
  selectedVideoBrief: videoBriefSchema.nullable().default(null),
  generationState: contentOpportunityGenerationStateSchema.nullable().default(null),
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
    skipReason: z.enum(CONTENT_OPPORTUNITY_SKIP_REASONS).nullable().optional(),
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
  z.object({
    action: z.literal("select_message_angle"),
    opportunityId: z.string().trim().min(1),
    angleId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("select_hook_option"),
    opportunityId: z.string().trim().min(1),
    angleId: z.string().trim().min(1),
    hookId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("save_video_brief_draft"),
    opportunityId: z.string().trim().min(1),
    briefDraft: z.object({
      title: z.string(),
      hook: z.string(),
      goal: z.string(),
      structure: z.array(
        z.object({
          order: z.number().int().min(1).max(4),
          purpose: z.string(),
          guidance: z.string(),
          suggestedOverlay: z.string().nullable().optional(),
        }),
      ).min(3).max(4),
      overlayLines: z.array(z.string()).min(2).max(4),
      cta: z.string(),
      contentType: z.enum(VIDEO_BRIEF_CONTENT_TYPES).nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal("approve_video_brief"),
    opportunityId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("approve_video_brief_for_generation"),
    opportunityId: z.string().trim().min(1),
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

function resolveOpportunityMessageAngles(
  opportunity: ContentOpportunity,
  options?: {
    regenerate?: boolean;
    createdAt?: string;
  },
): MessageAngle[] {
  if (!options?.regenerate) {
    const existingAngles = opportunity.messageAngles
      ?.map((angle) => messageAngleSchema.safeParse(angle))
      .filter((result): result is { success: true; data: MessageAngle } => result.success)
      .map((result) => result.data);

    if (existingAngles && existingAngles.length > 0) {
      return buildMessageAngles({
        ...opportunity,
        messageAngles: existingAngles,
      });
    }
  }

  return generateMessageAngles(opportunity, options?.createdAt);
}

function resolveOpportunityHookSets(
  opportunity: ContentOpportunity,
  options?: {
    regenerate?: boolean;
    createdAt?: string;
    angleId?: string | null;
  },
): HookSet[] {
  const angleId = normalizeText(options?.angleId);
  const messageAngles = resolveOpportunityMessageAngles(opportunity, {
    regenerate: false,
  });
  const eligibleAngles = angleId
    ? messageAngles.filter((angle) => angle.id === angleId)
    : messageAngles;

  if (!options?.regenerate) {
    const existingHookSets = opportunity.hookSets
      ?.map((hookSet) => hookSetSchema.safeParse(hookSet))
      .filter((result): result is { success: true; data: HookSet } => result.success)
      .map((result) => result.data)
      .filter((hookSet) =>
        eligibleAngles.some((angle) => angle.id === hookSet.angleId),
      );

    if (
      existingHookSets &&
      existingHookSets.length >= eligibleAngles.length &&
      eligibleAngles.length > 0
    ) {
      return existingHookSets
        .sort((left, right) => left.angleId.localeCompare(right.angleId))
        .slice(0, eligibleAngles.length);
    }
  }

  if (eligibleAngles.length === 0) {
    return [];
  }

  return generateHookSets(
    {
      ...opportunity,
      messageAngles,
    },
    eligibleAngles,
  );
}

function mergePersistedVideoBriefDraft(
  nextBrief: VideoBrief | null,
  existingBrief: VideoBrief | null | undefined,
): VideoBrief | null {
  if (!nextBrief) {
    return null;
  }

  if (!existingBrief || existingBrief.id !== nextBrief.id) {
    return nextBrief;
  }

  return videoBriefSchema.parse({
    ...nextBrief,
    title: existingBrief.title ?? nextBrief.title,
    hook: existingBrief.hook ?? nextBrief.hook,
    format: existingBrief.format ?? nextBrief.format,
    durationSec: existingBrief.durationSec ?? nextBrief.durationSec,
    goal: existingBrief.goal ?? nextBrief.goal,
    tone: existingBrief.tone ?? nextBrief.tone,
    structure:
      existingBrief.structure?.length &&
      existingBrief.structure.length === nextBrief.structure.length
        ? existingBrief.structure
        : nextBrief.structure,
    visualDirection: existingBrief.visualDirection ?? nextBrief.visualDirection,
    overlayLines:
      existingBrief.overlayLines?.length &&
      existingBrief.overlayLines.length >= 2
        ? existingBrief.overlayLines
        : nextBrief.overlayLines,
    cta: existingBrief.cta ?? nextBrief.cta,
    productionNotes:
      existingBrief.productionNotes?.length
        ? existingBrief.productionNotes
        : nextBrief.productionNotes,
    finalScriptTrustScore:
      existingBrief.finalScriptTrustScore ?? nextBrief.finalScriptTrustScore ?? null,
    contentType: existingBrief.contentType ?? nextBrief.contentType ?? null,
  });
}

function buildPersistedVideoBrief(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
  existingBrief?: VideoBrief | null,
) {
  const rebuiltBrief = buildVideoBrief(opportunity, angle, hookSet);
  const mergedDraft = mergePersistedVideoBriefDraft(rebuiltBrief, existingBrief);

  return validateVideoBrief(
    opportunity,
    angle,
    hookSet,
    mergedDraft ?? rebuiltBrief,
  );
}

function resolveSelectedAngle(
  opportunity: ContentOpportunity,
  angleId: string | null | undefined,
) {
  const normalizedAngleId = normalizeText(angleId);
  if (!normalizedAngleId) {
    return null;
  }

  const angles = resolveOpportunityMessageAngles(opportunity, {
    regenerate: false,
  });

  return angles.find((item) => item.id === normalizedAngleId) ?? null;
}

function resolveSelectedHookSet(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookId?: string | null,
) {
  const baseHookSet =
    resolveOpportunityHookSets(opportunity, {
      angleId: angle.id,
    })[0] ?? buildHookSet(opportunity, angle);

  return applySelectedHookSelection(baseHookSet, normalizeText(hookId));
}

function applyCompiledPlanToVideoBrief(
  brief: VideoBrief | null,
  compiledProductionPlan: Pick<
    CompiledProductionPlan,
    "finalScriptTrustAssessment"
  > | null | undefined,
): VideoBrief | null {
  if (!brief) {
    return null;
  }

  return videoBriefSchema.parse({
    ...brief,
    finalScriptTrustScore:
      compiledProductionPlan?.finalScriptTrustAssessment?.score ??
      brief.finalScriptTrustScore ??
      null,
  });
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
    const angle = resolveSelectedAngle(opportunity, selectedAngleId);

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

    const hookSet = resolveSelectedHookSet(opportunity, angle, selectedHookId);
    const persistedHookText = normalizeText(opportunity.selectedVideoBrief?.hook);
    const hook =
      hookSet.variants.find((item) => item.id === selectedHookId) ??
      (persistedHookText
        ? hookSet.variants.find(
            (item) => normalizeText(item.text) === persistedHookText,
          ) ?? null
        : null);

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
    const rebuiltBrief = buildPersistedVideoBrief(
      opportunity,
      angle,
      selectedHookSet,
      opportunity.selectedVideoBrief,
    );

    return {
      founderSelectionStatus: normalizeFounderSelectionStatus({
        existingStatus,
        selectedAngleId: angle.id,
        selectedHookId: hook.id,
      }),
      selectedAngleId: angle.id,
      selectedHookId: hook.id,
      selectedVideoBrief: rebuiltBrief,
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

export function buildAutoApprovedOpportunity(
  opportunity: ContentOpportunity,
  approvedAt: string,
): ContentOpportunity | null {
  try {
    const messageAngles = resolveOpportunityMessageAngles(opportunity, {
      regenerate: true,
      createdAt: approvedAt,
    });
    const hookSets = resolveOpportunityHookSets(
      {
        ...opportunity,
        messageAngles,
      },
      {
        regenerate: true,
      },
    );
    const angle = messageAngles[0] ?? null;
    if (!angle) {
      return null;
    }

    const hookSet =
      hookSets.find((item) => item.angleId === angle.id) ?? buildHookSet(opportunity, angle);
    const selectedHook = hookSet.variants[0] ?? null;
    if (!selectedHook) {
      return null;
    }

    const selectedVideoBrief = buildPersistedVideoBrief(
      opportunity,
      angle,
      applySelectedHookSelection(hookSet, selectedHook.id),
      opportunity.selectedVideoBrief,
    );

    return contentOpportunitySchema.parse({
      ...opportunity,
      status: "approved_for_production",
      messageAngles,
      hookSets,
      founderSelectionStatus: "approved",
      selectedAngleId: angle.id,
      selectedHookId: selectedHook.id,
      selectedVideoBrief,
      approvedAt,
      dismissedAt: null,
      updatedAt: approvedAt,
    });
  } catch {
    return null;
  }
}

export async function autoApproveContentOpportunity(input: {
  opportunityId: string;
  approvedAt?: string;
  approvedBy?: string | null;
}) {
  const timestamp = input.approvedAt ?? new Date().toISOString();
  const approvedBy = normalizeText(input.approvedBy) ?? "batch-auto-approve";
  const store = await readPersistedStore();
  const current = store.opportunities.find(
    (item) => item.opportunityId === input.opportunityId,
  );
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const autoApproved = buildAutoApprovedOpportunity(
    normalizePersistedOpportunity(current),
    timestamp,
  );
  if (!autoApproved) {
    throw new Error("Content opportunity could not be auto-approved.");
  }

  const state = await updateOpportunity(input.opportunityId, () => ({
    ...autoApproved,
    updatedAt: timestamp,
    generationState: autoApproved.generationState,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_APPROVED" as const,
      actor: "system",
      summary: `Auto-approved content opportunity "${current.title}" for production.`,
      metadata: {
        autoApproved: true,
        approvedBy,
        videoBriefId: autoApproved.selectedVideoBrief?.id ?? null,
      },
    },
  ]);

  return state;
}

function normalizeGenerationState(
  opportunity: ContentOpportunity,
): ContentOpportunityGenerationState | null {
  const generationState = opportunity.generationState;
  if (!generationState) {
    return null;
  }

  if (
    opportunity.status !== "approved_for_production" ||
    opportunity.founderSelectionStatus !== "approved" ||
    !opportunity.selectedVideoBrief
  ) {
    return null;
  }

  try {
    const normalizedState = contentOpportunityGenerationStateSchema.parse(generationState);
    const hasBriefApproval = Boolean(
      normalizedState.videoBriefApprovedAt && normalizedState.videoBriefApprovedBy,
    );
    const hasPartialBriefApproval =
      Boolean(normalizedState.videoBriefApprovedAt) !==
      Boolean(normalizedState.videoBriefApprovedBy);
    const hasGenerationArtifacts = Boolean(
      normalizedState.factoryLifecycle ||
      normalizedState.narrationSpec ||
      normalizedState.videoPrompt ||
      normalizedState.generationRequest ||
      normalizedState.renderJob ||
      normalizedState.renderedAsset ||
      normalizedState.assetReview,
    );
    const approvedBrief = opportunity.selectedVideoBrief;

      if (hasPartialBriefApproval || (!hasBriefApproval && hasGenerationArtifacts)) {
        return null;
      }

      if (!hasBriefApproval && !hasGenerationArtifacts) {
        return null;
      }

      if (
        normalizedState.factoryLifecycle &&
        normalizedState.factoryLifecycle.videoBriefId !== approvedBrief.id
      ) {
        return null;
      }

      if (
        normalizedState.narrationSpec &&
        (normalizedState.narrationSpec.opportunityId !== opportunity.opportunityId ||
          normalizedState.narrationSpec.videoBriefId !== approvedBrief.id)
      ) {
        return null;
      }

      if (
        normalizedState.videoPrompt &&
        (normalizedState.videoPrompt.opportunityId !== opportunity.opportunityId ||
          normalizedState.videoPrompt.videoBriefId !== approvedBrief.id)
      ) {
        return null;
      }

      if (
        normalizedState.generationRequest &&
        (normalizedState.generationRequest.opportunityId !== opportunity.opportunityId ||
          normalizedState.generationRequest.videoBriefId !== approvedBrief.id ||
          (normalizedState.narrationSpec &&
            normalizedState.generationRequest.narrationSpecId !== normalizedState.narrationSpec.id) ||
          (normalizedState.videoPrompt &&
            normalizedState.generationRequest.videoPromptId !== normalizedState.videoPrompt.id) ||
          (normalizedState.renderJob &&
            normalizedState.generationRequest.renderVersion !== normalizedState.renderJob.renderVersion) ||
          (normalizedState.renderJob &&
            normalizedState.generationRequest.idempotencyKey !== normalizedState.renderJob.idempotencyKey))
      ) {
        return null;
      }

      if (
        normalizedState.renderJob &&
        (!normalizedState.generationRequest ||
          normalizedState.renderJob.generationRequestId !== normalizedState.generationRequest.id)
      ) {
        return null;
      }

      if (
        normalizedState.renderJob?.compiledProductionPlan &&
        (normalizedState.renderJob.compiledProductionPlan.opportunityId !== opportunity.opportunityId ||
          normalizedState.renderJob.compiledProductionPlan.videoBriefId !== approvedBrief.id)
      ) {
        return null;
      }

      if (
        normalizedState.renderJob?.productionDefaultsSnapshot &&
        normalizedState.renderJob.compiledProductionPlan &&
        !productionDefaultsSnapshotEquals(
          normalizedState.renderJob.productionDefaultsSnapshot,
          normalizedState.renderJob.compiledProductionPlan.defaultsSnapshot,
        )
      ) {
        return null;
      }

      if (
        normalizedState.renderJob?.compiledProductionPlan &&
        normalizedState.narrationSpec &&
        normalizedState.renderJob.compiledProductionPlan.narrationSpec.id !==
          normalizedState.narrationSpec.id
      ) {
        return null;
      }

      if (
        normalizedState.renderedAsset &&
        (!normalizedState.renderJob ||
          normalizedState.renderedAsset.renderJobId !== normalizedState.renderJob.id)
      ) {
        return null;
      }

      if (
        normalizedState.factoryLifecycle &&
        normalizedState.factoryLifecycle.status === "review_pending" &&
        normalizedState.assetReview?.status !== "pending_review"
      ) {
        return null;
      }

      if (
        normalizedState.factoryLifecycle &&
        normalizedState.factoryLifecycle.status === "accepted" &&
        normalizedState.assetReview?.status !== "accepted"
      ) {
        return null;
      }

      if (
        normalizedState.factoryLifecycle &&
        normalizedState.factoryLifecycle.status === "rejected" &&
        normalizedState.assetReview?.status !== "rejected"
      ) {
        return null;
      }

      if (
        normalizedState.factoryLifecycle &&
        normalizedState.factoryLifecycle.status === "discarded" &&
        normalizedState.assetReview?.status !== "discarded"
      ) {
        return null;
      }

      if (
        normalizedState.assetReview &&
        (!normalizedState.renderedAsset ||
          normalizedState.assetReview.renderedAssetId !== normalizedState.renderedAsset.id)
      ) {
        return null;
      }

    return normalizedState;
  } catch {
    return null;
  }
}

function getGenerationContext(
  opportunity: ContentOpportunity,
  options?: {
    requireBriefApproval?: boolean;
    disallowExistingGeneration?: boolean;
  },
) {
  if (
    opportunity.status !== "approved_for_production" ||
    opportunity.founderSelectionStatus !== "approved"
  ) {
    throw new Error("Approve for production before using generation actions.");
  }

  if (
    !opportunity.selectedAngleId ||
    !opportunity.selectedHookId ||
    !opportunity.selectedVideoBrief
  ) {
    throw new Error("Select an angle and hook so a stable video brief exists first.");
  }

  const generationState = contentOpportunityGenerationStateSchema.parse(
    opportunity.generationState ?? {},
  );
  const briefApproved = Boolean(
    generationState.videoBriefApprovedAt && generationState.videoBriefApprovedBy,
  );
  const generationStarted = Boolean(
    generationState.factoryLifecycle ||
    generationState.generationRequest ||
    generationState.renderJob ||
    generationState.renderedAsset ||
    generationState.assetReview,
  );

  if (options?.requireBriefApproval && !briefApproved) {
    throw new Error("Approve the video brief for generation before starting a render.");
  }

  if (options?.disallowExistingGeneration && generationStarted) {
    throw new Error("This brief already has generation state. Review the current asset before running generation again.");
  }

  return {
    brief: opportunity.selectedVideoBrief,
    generationState,
    briefApproved,
    approvedAt: generationState.videoBriefApprovedAt,
    approvedBy: generationState.videoBriefApprovedBy,
  };
}

function hasExistingGenerationState(
  generationState: ContentOpportunityGenerationState,
) {
  return Boolean(
    generationState.generationRequest ||
      generationState.renderJob ||
      generationState.renderedAsset ||
      generationState.assetReview,
  );
}

function nextRenderVersion(input: {
  previousRenderVersion?: string | null;
  isRegenerate: boolean;
}) {
  if (!input.isRegenerate) {
    return CURRENT_RENDER_VERSION;
  }

  const previousRenderVersion = input.previousRenderVersion ?? null;
  if (!previousRenderVersion || previousRenderVersion === CURRENT_RENDER_VERSION) {
    return `${CURRENT_RENDER_VERSION}:attempt-2`;
  }

  const attemptMatch = previousRenderVersion.match(
    /^phase-c-render-v1:attempt-(\d+)$/,
  );
  if (!attemptMatch) {
    return `${CURRENT_RENDER_VERSION}:attempt-2`;
  }

  return `${CURRENT_RENDER_VERSION}:attempt-${Number(attemptMatch[1]) + 1}`;
}

function buildPerformanceSignalMetadata(input: {
  opportunity: ContentOpportunity;
  videoBriefId: string | null;
  provider?: string | null;
  renderVersion?: string | null;
  defaultsProfileId?: string | null;
  voiceId?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  trustStatus?: string | null;
  trustAdjusted?: boolean | null;
  extra?: Record<string, unknown>;
}) {
  return buildProductionOutcomeMetadata({
    angleId: input.opportunity.selectedAngleId,
    hookId: input.opportunity.selectedHookId,
    videoBriefId: input.videoBriefId,
    renderVersion: input.renderVersion,
    provider: input.provider,
    defaultsProfileId: input.defaultsProfileId,
    voiceId: input.voiceId,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    trustStatus: input.trustStatus,
    trustAdjusted: input.trustAdjusted,
    extra: input.extra,
  });
}

function buildFactoryLifecycleForQueuedAttempt(input: {
  currentLifecycle: VideoFactoryLifecycle | null;
  brief: VideoBrief;
  approvedAt: string | null;
  provider: RenderProvider;
  renderVersion: string;
  timestamp: string;
}) {
  const baseLifecycle =
    input.currentLifecycle &&
    input.currentLifecycle.videoBriefId === input.brief.id &&
    input.currentLifecycle.status === "draft"
      ? input.currentLifecycle
      : createDraftVideoFactoryLifecycle({
          videoBriefId: input.brief.id,
          createdAt: input.approvedAt ?? input.timestamp,
        });

  return transitionVideoFactoryLifecycle(baseLifecycle, "queued", {
    timestamp: input.timestamp,
    provider: input.provider,
    renderVersion: input.renderVersion,
  });
}

function isoDateKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function sumDailyFactorySpendUsedUsd(
  opportunities: ContentOpportunity[],
  dayKey: string,
) {
  return Math.round(
    opportunities.reduce((total, opportunity) => {
      const generationState = opportunity.generationState;
      if (!generationState) {
        return total;
      }

      const completedSpend = generationState.runLedger.reduce((ledgerTotal, entry) => {
        const completedAt = entry.actualCost?.completedAt ?? null;
        if (!completedAt || isoDateKey(completedAt) !== dayKey) {
          return ledgerTotal;
        }

        return ledgerTotal + (entry.actualCost?.actualCostUsd ?? 0);
      }, 0);
      const activeEstimatedSpend =
        generationState.renderJob?.actualCost ||
        !generationState.renderJob?.costEstimate ||
        !isVideoFactoryLifecycleActive(generationState.factoryLifecycle) ||
        isoDateKey(generationState.renderJob.costEstimate.estimatedAt) !== dayKey
          ? 0
          : generationState.renderJob.costEstimate.estimatedTotalUsd;

      return total + completedSpend + activeEstimatedSpend;
    }, 0) * 10000,
  ) / 10000;
}

function buildQueuedGenerationActionResult(
  state: ContentOpportunityState,
  opportunityId: string,
): ContentOpportunityVideoGenerationActionResult {
  const maxRegenerationsPerBrief = getVideoFactoryMaxRegenerationsPerBrief();
  const opportunity =
    state.opportunities.find((item) => item.opportunityId === opportunityId) ?? null;
  const runLedgerCount = opportunity?.generationState?.runLedger.length ?? 0;
  const activeAttemptCount =
    opportunity?.generationState?.renderJob &&
    isVideoFactoryLifecycleActive(opportunity.generationState.factoryLifecycle)
      ? runLedgerCount + 1
      : runLedgerCount;
  const regenerationCount = Math.max(0, activeAttemptCount - 1);
  const budgetRemaining = Math.max(
    0,
    maxRegenerationsPerBrief - regenerationCount,
  );

  return {
    state,
    jobId: opportunity?.generationState?.renderJob?.id ?? null,
    estimatedCostUsd:
      opportunity?.generationState?.latestCostEstimate?.estimatedTotalUsd ?? null,
    regenerationCount,
    budgetRemaining,
    budgetExhausted: budgetRemaining <= 0,
  };
}

function isPermanentFailureRetryState(
  retryState: VideoFactoryRetryState | null | undefined,
) {
  if (!retryState) {
    return true;
  }

  return retryState.exhausted || retryState.failureMode === "non_retryable";
}

function terminalFailureLifecycleStatus(
  retryState: VideoFactoryRetryState | null | undefined,
): Extract<VideoFactoryStatus, "failed" | "failed_permanent"> {
  return isPermanentFailureRetryState(retryState)
    ? "failed_permanent"
    : "failed";
}

function qualityFailureStageFromError(error: unknown) {
  const parsedQualityCheck = qualityCheckResultSchema.safeParse(
    error instanceof VideoFactoryRetryableError ? error.details : null,
  );

  return lifecycleStatusForQualityFailure(
    parsedQualityCheck.success
      ? parsedQualityCheck.data.failures[0]?.stage ?? "composition"
      : "composition",
  );
}

async function runContentOpportunityVideoGeneration(input: {
  opportunityId: string;
  provider?: RenderProvider;
  isRegenerate: boolean;
  preTriageConcern?: RenderJob["preTriageConcern"];
  regenerationReason?: RenderJob["regenerationReason"];
  regenerationReasonCodes?: FactoryReviewReasonCode[];
  regenerationNotes?: string | null;
  allowDailyCapOverride?: boolean;
  mode?: "enqueue_only" | "run_active" | "enqueue_and_run";
}) {
  const mode = input.mode ?? "enqueue_and_run";
  let provider = input.provider ?? "mock";
  let isRegenerateAttempt = input.isRegenerate;
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === input.opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  const {
    brief,
    approvedAt,
    approvedBy,
    generationState: currentGenerationState,
  } = getGenerationContext(normalizedCurrent, {
    requireBriefApproval: true,
  });
  let renderVersion =
    currentGenerationState.renderJob?.renderVersion ?? CURRENT_RENDER_VERSION;
  let attemptNumber = currentGenerationState.runLedger.length + 1;
  let factoryLifecycle =
    currentGenerationState.factoryLifecycle ??
    createDraftVideoFactoryLifecycle({
      videoBriefId: brief.id,
      createdAt: approvedAt ?? timestamp,
    });
  let queuedVideoPrompt: VideoPrompt | null = null;
  let generationRequest: VideoGenerationRequest | null = null;
  let queuedRenderJob: RenderJob | null = null;
  let replayedRequest = false;
  let attemptOpportunity = normalizedCurrent;
  let attemptBrief = brief;
  let attemptApprovedAt = approvedAt;
  let attemptApprovedBy = approvedBy;
  let currentStage: VideoFactoryStatus = "queued";
  let idempotencyKey: string | null = null;
  let resumeCompiledProductionPlan:
    | RenderJob["compiledProductionPlan"]
    | null = null;
  let resumeLifecycleStatus: VideoFactoryStatus | null = null;
  let queuedState = summarizeState(store.opportunities);
  let costEstimate: CostEstimate | null = null;
  let budgetGuard: VideoFactoryBudgetGuard | null = null;
  let baselineAttemptNumber: number | null = null;
  let baselineRenderJob: RenderJob | null = null;
  let baselineFactoryJobId: string | null = null;
  let baselineTerminalOutcome:
    | "review_pending"
    | "accepted"
    | "rejected"
    | "discarded"
    | "failed"
    | "failed_permanent"
    | null = null;
  const normalizedRegenerationReasonCodes = normalizeFactoryReviewReasonCodes(
    input.regenerationReasonCodes?.length
      ? input.regenerationReasonCodes
      : deriveStructuredReasonsFromLegacyRegenerationReason(
          input.regenerationReason ?? null,
        ),
  );
  const normalizedRegenerationNotes = normalizeText(input.regenerationNotes);
  const maxRegenerationsPerBrief = getVideoFactoryMaxRegenerationsPerBrief();
  const currentDayKey = isoDateKey(timestamp) ?? timestamp.slice(0, 10);
  const historicalOpportunities = store.opportunities.map((opportunity) =>
    normalizePersistedOpportunity(opportunity),
  );
  let productionDefaultsOverride: ProductionDefaults | null = null;
  const executionStageProviders: Record<
    "preparing" | "generating_narration" | "generating_visuals" | "generating_captions" | "composing",
    string
  > = {
    preparing: "prompt-compiler",
    generating_narration: resolveNarrationProviderId(null),
    generating_visuals: provider === "runway" ? "runway-gen4" : provider,
    generating_captions: resolveCaptionProviderId(null),
    composing: "ffmpeg",
  };
  const logExecutionEvent = (inputLog: {
    event:
      | "video_factory_stage_started"
      | "video_factory_stage_completed"
      | "video_factory_stage_failed";
    stage:
      | "preparing"
      | "generating_narration"
      | "generating_visuals"
      | "generating_captions"
      | "composing";
    provider: string;
    durationMs?: number | null;
    retryCount?: number | null;
    message?: string | null;
    category?: string | null;
  }) => {
    const payload = {
      event: inputLog.event,
      factoryJobId: factoryLifecycle.factoryJobId,
      renderVersion,
      attemptNumber,
      stage: inputLog.stage,
      provider: inputLog.provider,
      durationMs: inputLog.durationMs ?? null,
      retryCount: inputLog.retryCount ?? null,
      category: inputLog.category ?? null,
      message: inputLog.message ?? null,
      at: new Date().toISOString(),
    };
    const serialized = JSON.stringify(payload);
    if (inputLog.event === "video_factory_stage_failed") {
      console.error(serialized);
      return;
    }

    console.info(serialized);
  };

  if (mode !== "run_active") {
    queuedState = await updateOpportunity(input.opportunityId, (opportunity) => {
      const latestOpportunity = normalizePersistedOpportunity(opportunity);
      const {
        brief: latestBrief,
        approvedAt: latestApprovedAt,
        approvedBy: latestApprovedBy,
        generationState: latestGenerationState,
      } = getGenerationContext(latestOpportunity, {
        requireBriefApproval: true,
      });
      const latestGrowthIntelligence = buildOpportunityGrowthIntelligence(
        latestOpportunity,
        {
          preserveExisting: true,
        },
      );

      if (
        !input.isRegenerate &&
        hasExistingGenerationState(latestGenerationState) &&
        !isVideoFactoryLifecycleActive(latestGenerationState.factoryLifecycle)
      ) {
        throw new Error(
          "This brief already has generation state. Review the current asset before running generation again.",
        );
      }

      if (input.isRegenerate && !hasExistingGenerationState(latestGenerationState)) {
        throw new Error("A prior render attempt must exist before regeneration can be used.");
      }

      const requestedRenderVersion =
        getActiveVideoFactoryRenderVersion({
          lifecycle: latestGenerationState.factoryLifecycle,
          renderJob: latestGenerationState.renderJob,
        }) ??
        nextRenderVersion({
          previousRenderVersion: latestGenerationState.renderJob?.renderVersion,
          isRegenerate: input.isRegenerate,
        });
      const requestedIdempotencyKey = buildVideoFactoryIdempotencyKey({
        action: input.isRegenerate ? "regenerate" : "generate",
        opportunityId: latestOpportunity.opportunityId,
        videoBriefId: latestBrief.id,
        renderVersion: requestedRenderVersion,
        provider,
        preTriageConcern: input.preTriageConcern ?? null,
        regenerationReason: input.regenerationReason ?? null,
      });
      const duplicateDecision = resolveVideoFactoryDuplicateRunDecision({
        requestedAction: input.isRegenerate ? "regenerate" : "generate",
        requestedIdempotencyKey,
        lifecycle: latestGenerationState.factoryLifecycle,
        renderJob: latestGenerationState.renderJob,
        generationRequest: latestGenerationState.generationRequest,
      });

      if (duplicateDecision.type === "replay") {
        replayedRequest = true;
        renderVersion = duplicateDecision.renderVersion ?? requestedRenderVersion;
        idempotencyKey = requestedIdempotencyKey;
        factoryLifecycle =
          latestGenerationState.factoryLifecycle ??
          factoryLifecycle;
        return opportunity;
      }

      if (duplicateDecision.type === "conflict") {
        throw new VideoFactoryActiveRunError(duplicateDecision.message);
      }

      const nextRegenerationCount = input.isRegenerate
        ? latestGenerationState.runLedger.length
        : 0;
      const budgetRemaining = Math.max(
        0,
        maxRegenerationsPerBrief - nextRegenerationCount,
      );
      if (input.isRegenerate && nextRegenerationCount > maxRegenerationsPerBrief) {
        throw new VideoFactoryRegenerationBudgetExceededError({
          message: `You've generated this brief ${maxRegenerationsPerBrief} times already. Edit the brief or discard it before regenerating again.`,
          state: summarizeState(store.opportunities),
          jobId: latestGenerationState.renderJob?.id ?? null,
          estimatedCostUsd:
            latestGenerationState.latestCostEstimate?.estimatedTotalUsd ?? null,
          regenerationCount: maxRegenerationsPerBrief,
          budgetRemaining: 0,
        });
      }

      const baseQueuedCompiledProductionPlan = compileVideoBriefForProduction({
        opportunity: latestOpportunity,
        brief: latestBrief,
      });
      const queuedSelectionDecision = buildVideoFactorySelectionDecision({
        compiledProductionPlan: baseQueuedCompiledProductionPlan,
        briefFormat: latestBrief.format,
        briefDurationSec: latestBrief.durationSec,
        historicalOpportunities,
        appliedAt: timestamp,
        growthIntelligence: latestOpportunity.growthIntelligence ?? null,
      });
      const queuedCompiledProductionPlan = applyVideoFactorySelectionDecision({
        compiledProductionPlan: baseQueuedCompiledProductionPlan,
        decision: queuedSelectionDecision,
      });
      const queuedCostEstimate = buildCostEstimate({
        compiledProductionPlan: queuedCompiledProductionPlan,
        estimatedAt: timestamp,
      });
      const queuedBudgetThresholds = applyBudgetControlThresholds({
        decision: queuedSelectionDecision,
        warningThresholdUsd: undefined,
        hardStopThresholdUsd: undefined,
      });
      const queuedBudgetGuard = evaluateVideoFactoryBudgetGuard({
        estimatedCost: queuedCostEstimate,
        evaluatedAt: timestamp,
        warningThresholdUsd: queuedBudgetThresholds.warningThresholdUsd,
        hardStopThresholdUsd: queuedBudgetThresholds.hardStopThresholdUsd,
      });
      const dailySpendGuard = evaluateVideoFactoryDailySpendGuard({
        estimatedCostUsd: queuedCostEstimate.estimatedTotalUsd,
        dailySpendUsedUsd: sumDailyFactorySpendUsedUsd(
          historicalOpportunities,
          currentDayKey,
        ),
      });
      if (dailySpendGuard.status === "blocked" && !input.allowDailyCapOverride) {
        throw new VideoFactoryDailyCapExceededError({
          message:
            dailySpendGuard.message ??
            "Daily factory spend cap exceeded. Re-submit with override enabled to proceed.",
          dailySpendGuard,
          state: summarizeState(store.opportunities),
          jobId: null,
          estimatedCostUsd: queuedCostEstimate.estimatedTotalUsd,
          regenerationCount: nextRegenerationCount,
          budgetRemaining,
        });
      }

      renderVersion = requestedRenderVersion;
      attemptNumber = latestGenerationState.runLedger.length + 1;
      attemptOpportunity = {
        ...latestOpportunity,
        growthIntelligence: latestGrowthIntelligence,
      };
      attemptBrief = latestBrief;
      const learningPolicy = resolveVideoFactoryLearningPolicy({
        opportunities: historicalOpportunities,
        brief: latestBrief,
        requestedProvider: input.provider ?? null,
      });
      provider =
        input.provider ??
        learningPolicy.preferredProvider ??
        provider;
      productionDefaultsOverride = learningPolicy.defaultsSnapshot;
      attemptApprovedAt = latestApprovedAt;
      attemptApprovedBy = latestApprovedBy;
      baselineAttemptNumber =
        latestGenerationState.runLedger.at(-1)?.attemptNumber ??
        latestGenerationState.attemptLineage.length ??
        null;
      baselineRenderJob = latestGenerationState.renderJob;
      baselineFactoryJobId =
        latestGenerationState.factoryLifecycle?.factoryJobId ?? null;
      baselineTerminalOutcome =
        latestGenerationState.runLedger.at(-1)?.terminalOutcome ??
        (latestGenerationState.assetReview?.status === "pending_review"
          ? "review_pending"
          : latestGenerationState.assetReview?.status === "accepted" ||
              latestGenerationState.assetReview?.status === "rejected" ||
              latestGenerationState.assetReview?.status === "discarded"
            ? latestGenerationState.assetReview.status
          : latestGenerationState.factoryLifecycle?.status === "failed" ||
              latestGenerationState.factoryLifecycle?.status === "failed_permanent"
            ? latestGenerationState.factoryLifecycle.status
          : null);
      idempotencyKey = requestedIdempotencyKey;
      costEstimate = queuedCostEstimate;
      budgetGuard = queuedBudgetGuard;
      queuedVideoPrompt = buildVideoPrompt(latestOpportunity, latestBrief);
      generationRequest = buildVideoGenerationRequest({
        opportunity: latestOpportunity,
        brief: latestBrief,
        renderVersion,
        idempotencyKey: requestedIdempotencyKey,
        narrationSpecId: queuedCompiledProductionPlan.narrationSpec.id,
        videoPromptId: queuedVideoPrompt.id,
        approvedAt: latestApprovedAt!,
        approvedBy: latestApprovedBy!,
        status: "submitted",
      });
      factoryLifecycle = buildFactoryLifecycleForQueuedAttempt({
        currentLifecycle: latestGenerationState.factoryLifecycle,
        brief: latestBrief,
        approvedAt: latestApprovedAt,
        provider,
        renderVersion,
        timestamp,
      });
      const linkedBatch =
        findLinkedBatchRenderJobForOpportunity({
          opportunityId: latestOpportunity.opportunityId,
          statuses: ["approved", "queued", "running"],
        }) ?? null;
      queuedRenderJob = renderJobSchema.parse({
        ...createRenderJob({
          batchId: linkedBatch?.batchId ?? null,
          generationRequestId: generationRequest.id,
          idempotencyKey: requestedIdempotencyKey,
          provider,
          renderVersion,
          compiledProductionPlan: queuedCompiledProductionPlan,
          productionDefaultsSnapshot: queuedCompiledProductionPlan.defaultsSnapshot,
          preTriageConcern: input.preTriageConcern ?? null,
          regenerationReason: input.regenerationReason ?? null,
          regenerationReasonCodes: normalizedRegenerationReasonCodes,
          regenerationNotes: normalizedRegenerationNotes,
          costEstimate: queuedCostEstimate,
          budgetGuard: queuedBudgetGuard,
          abTest: resolveActiveABTestResult({
            opportunityId: latestOpportunity.opportunityId,
            brief: latestBrief,
            observedProvider: provider,
            observedDefaultsVersion:
              queuedCompiledProductionPlan.defaultsSnapshot.version ?? null,
            observedPromptOverrideEnabled: null,
            observedCaptionStylePreset:
              queuedCompiledProductionPlan.captionSpec.stylePreset ?? null,
            assignedAt: timestamp,
          }),
        }),
        submittedAt: timestamp,
      });
      const comparisonRecord = maybeBuildFactoryComparisonRecord({
        opportunityId: latestOpportunity.opportunityId,
        videoBriefId: latestBrief.id,
        includeRegenerate: input.isRegenerate,
        baselineAttemptNumber,
        baselineRenderJob,
        baselineFactoryJobId,
        baselineOutcome: baselineTerminalOutcome,
        comparisonAttemptNumber: attemptNumber,
        comparisonRenderJob: queuedRenderJob,
        comparisonFactoryJobId: factoryLifecycle.factoryJobId,
        createdAt: timestamp,
      });

      return {
        ...opportunity,
        growthIntelligence: latestGrowthIntelligence,
        selectedVideoBrief: applyCompiledPlanToVideoBrief(
          opportunity.selectedVideoBrief,
          queuedCompiledProductionPlan,
        ),
        generationState: contentOpportunityGenerationStateSchema.parse({
          ...latestGenerationState,
          videoBriefApprovedAt: latestApprovedAt,
          videoBriefApprovedBy: latestApprovedBy,
          factoryLifecycle,
          latestCostEstimate: queuedCostEstimate,
          latestActualCost: null,
          latestBudgetGuard: queuedBudgetGuard,
          latestQualityCheck: null,
          latestRetryState: null,
          narrationSpec: null,
          videoPrompt: queuedVideoPrompt,
          generationRequest,
          renderJob: queuedRenderJob,
          renderedAsset: null,
          assetReview: null,
          comparisonRecords: comparisonRecord
            ? appendFactoryComparisonRecord(
                latestGenerationState.comparisonRecords,
                comparisonRecord,
              )
            : latestGenerationState.comparisonRecords,
        }),
        updatedAt: timestamp,
      };
    });

    if (replayedRequest || mode === "enqueue_only") {
      return queuedState;
    }
  } else {
    if (
      !currentGenerationState.generationRequest ||
      !currentGenerationState.renderJob ||
      !currentGenerationState.videoPrompt ||
      !isVideoFactoryLifecycleActive(currentGenerationState.factoryLifecycle)
    ) {
      return summarizeState(store.opportunities);
    }

    if (
      currentGenerationState.renderJob.status === "completed" &&
      currentGenerationState.renderedAsset
    ) {
      return summarizeState(store.opportunities);
    }

    renderVersion =
      getActiveVideoFactoryRenderVersion({
        lifecycle: currentGenerationState.factoryLifecycle,
        renderJob: currentGenerationState.renderJob,
      }) ?? renderVersion;
    attemptNumber = currentGenerationState.runLedger.length + 1;
    queuedVideoPrompt = currentGenerationState.videoPrompt;
    generationRequest = currentGenerationState.generationRequest;
    queuedRenderJob = currentGenerationState.renderJob;
    isRegenerateAttempt = Boolean(currentGenerationState.renderJob.regenerationReason);
    factoryLifecycle = currentGenerationState.factoryLifecycle ?? factoryLifecycle;
    provider =
      currentGenerationState.renderJob.provider ??
      currentGenerationState.factoryLifecycle?.provider ??
      provider;
    idempotencyKey =
      currentGenerationState.renderJob.idempotencyKey ??
      currentGenerationState.generationRequest.idempotencyKey;
    resumeCompiledProductionPlan =
      currentGenerationState.renderJob.compiledProductionPlan ?? null;
    resumeLifecycleStatus = currentGenerationState.factoryLifecycle?.status ?? null;
    currentStage =
      currentGenerationState.factoryLifecycle?.status ??
      (currentGenerationState.latestRetryState?.retryStage as VideoFactoryStatus | null) ??
      currentStage;
  }

  if (!generationRequest || !queuedRenderJob || !queuedVideoPrompt || !idempotencyKey) {
    throw new Error("Unable to initialize a queued factory attempt.");
  }
  const activeGenerationRequest: VideoGenerationRequest = generationRequest!;
  const activeQueuedRenderJob: RenderJob = queuedRenderJob!;
  const activeQueuedVideoPrompt: VideoPrompt = queuedVideoPrompt!;

  try {
    const orchestration = await orchestrateCompiledVideoGeneration({
      opportunity: attemptOpportunity,
      brief: attemptBrief,
      provider,
      renderVersion,
      createdAt: timestamp,
      productionDefaultsOverride,
      historicalOpportunities: store.opportunities.map((opportunity) =>
        normalizePersistedOpportunity(opportunity),
      ),
      persistedCompiledProductionPlan: resumeCompiledProductionPlan,
      resumeLifecycleStatus,
      onCompiledPlan: async (compiledProductionPlan, selectionDecision) => {
        executionStageProviders.generating_narration = resolveNarrationProviderId(
          compiledProductionPlan.defaultsSnapshot.providerFallbacks.narration[0] ?? null,
        );
        executionStageProviders.generating_visuals =
          selectionDecision.selectedVisualProvider;
        executionStageProviders.generating_captions = resolveCaptionProviderId(
          compiledProductionPlan.defaultsSnapshot.providerFallbacks.captions[0] ?? null,
        );
        costEstimate = buildCostEstimate({
          compiledProductionPlan,
          estimatedAt: timestamp,
        });
        const budgetThresholds = applyBudgetControlThresholds({
          decision: selectionDecision,
          warningThresholdUsd: undefined,
          hardStopThresholdUsd: undefined,
        });
        budgetGuard = evaluateVideoFactoryBudgetGuard({
          estimatedCost: costEstimate,
          evaluatedAt: timestamp,
          warningThresholdUsd: budgetThresholds.warningThresholdUsd,
          hardStopThresholdUsd: budgetThresholds.hardStopThresholdUsd,
        });

        await updateOpportunity(input.opportunityId, (opportunity) => {
          const persistedGenerationState = contentOpportunityGenerationStateSchema.parse(
            opportunity.generationState ?? {},
          );
          const currentRenderJob = persistedGenerationState.renderJob;
          const nextRenderJob = currentRenderJob
            ? renderJobSchema.parse({
                ...currentRenderJob,
                compiledProductionPlan,
                productionDefaultsSnapshot: compiledProductionPlan.defaultsSnapshot,
                costEstimate,
                budgetGuard,
              })
            : null;

          return {
            ...opportunity,
            selectedVideoBrief: applyCompiledPlanToVideoBrief(
              opportunity.selectedVideoBrief,
              compiledProductionPlan,
            ),
            generationState: contentOpportunityGenerationStateSchema.parse({
              ...persistedGenerationState,
              latestCostEstimate: costEstimate,
              latestBudgetGuard: budgetGuard,
              comparisonRecords: nextRenderJob
                ? updateFactoryComparisonRecordForRenderJob(
                    persistedGenerationState.comparisonRecords,
                    {
                      comparisonRenderJob: nextRenderJob,
                      comparisonFactoryJobId:
                        persistedGenerationState.factoryLifecycle?.factoryJobId ?? null,
                      updatedAt: new Date().toISOString(),
                    },
                  )
                : persistedGenerationState.comparisonRecords,
              renderJob: nextRenderJob,
            }),
            updatedAt: new Date().toISOString(),
          };
        });

        if (budgetGuard.status === "blocked") {
          throw new VideoFactoryRetryableError(
            budgetGuard.hardStopMessage ?? "Factory run blocked by cost guard.",
            {
              retryable: false,
            },
          );
        }
      },
      onExecutionStageChange: async (status) => {
        currentStage = status;
        if (status !== "generated") {
          logExecutionEvent({
            event: "video_factory_stage_started",
            stage: status,
            provider: executionStageProviders[status],
          });
        }
      },
      onStageFailure: async (stageFailure) => {
        const providerFailure = summarizeVideoFactoryProviderFailure(stageFailure.error, {
          provider: stageFailure.provider,
          stage: stageFailure.stage,
        });
        logExecutionEvent({
          event: "video_factory_stage_failed",
          stage: stageFailure.stage,
          provider: stageFailure.provider,
          durationMs: stageFailure.durationMs,
          category: providerFailure.category,
          message: providerFailure.operatorSummary,
        });
      },
      onRetryScheduled: async (retryInput) => {
        currentStage = retryInput.stage;
        const providerFailure = summarizeVideoFactoryProviderFailure(
          retryInput.error,
          {
            provider: retryInput.provider,
            stage: retryInput.stage,
          },
        );
        factoryLifecycle = transitionVideoFactoryLifecycle(
          factoryLifecycle,
          "retry_queued",
          {
            timestamp: new Date().toISOString(),
            provider,
            renderVersion,
            failureStage: retryInput.stage,
            failureMessage: providerFailure.operatorSummary,
            retryState: retryInput.retryState,
          },
        );
        await updateOpportunity(input.opportunityId, (opportunity) => {
          const persistedGenerationState = contentOpportunityGenerationStateSchema.parse(
            opportunity.generationState ?? {},
          );
          const currentRenderJob = persistedGenerationState.renderJob;

          return {
            ...opportunity,
            generationState: contentOpportunityGenerationStateSchema.parse({
              ...persistedGenerationState,
              factoryLifecycle,
              latestRetryState: retryInput.retryState,
              renderJob: currentRenderJob
                ? renderJobSchema.parse({
                    ...currentRenderJob,
                    retryState: retryInput.retryState,
                    errorMessage: providerFailure.operatorSummary,
                    status: "rendering",
                    submittedAt:
                      currentRenderJob.submittedAt ?? new Date().toISOString(),
                  })
                : null,
            }),
            updatedAt: new Date().toISOString(),
          };
        });
      },
      onStageChange: async (status) => {
        factoryLifecycle = transitionVideoFactoryLifecycle(factoryLifecycle, status, {
          timestamp: new Date().toISOString(),
          provider,
          renderVersion,
        });
        await updateOpportunity(input.opportunityId, (opportunity) => {
          const persistedGenerationState = contentOpportunityGenerationStateSchema.parse(
            opportunity.generationState ?? {},
          );
          const currentRenderJob = persistedGenerationState.renderJob;

          return {
            ...opportunity,
            generationState: contentOpportunityGenerationStateSchema.parse({
              ...persistedGenerationState,
              factoryLifecycle,
              renderJob: currentRenderJob
                ? renderJobSchema.parse({
                    ...currentRenderJob,
                    status:
                      status === "preparing"
                        ? "submitted"
                        : status === "generated"
                          ? currentRenderJob.status
                          : "rendering",
                    submittedAt:
                      currentRenderJob.submittedAt ?? new Date().toISOString(),
                  })
                : null,
            }),
            updatedAt: new Date().toISOString(),
          };
        });
      },
    });
    for (const [stage, metric] of Object.entries(orchestration.stageExecutionMetrics)) {
      if (!metric) {
        continue;
      }

      logExecutionEvent({
        event: "video_factory_stage_completed",
        stage: stage as keyof typeof orchestration.stageExecutionMetrics,
        provider: metric.provider,
        durationMs: metric.durationMs,
        retryCount: metric.retryCount,
      });
    }
    const compiledProductionPlan = orchestration.compiledProductionPlan;
    const narrationSpec = orchestration.narrationSpec;
    const completedGenerationRequest = videoGenerationRequestSchema.parse({
      ...activeGenerationRequest,
      narrationSpecId: narrationSpec.id,
      videoPromptId: activeQueuedVideoPrompt.id,
      status: "completed" as const,
    });
    costEstimate ??= buildCostEstimate({
      compiledProductionPlan,
      estimatedAt: timestamp,
    });
    const finalBudgetThresholds = applyBudgetControlThresholds({
      decision: orchestration.selectionDecision,
      warningThresholdUsd: undefined,
      hardStopThresholdUsd: undefined,
    });
    budgetGuard ??= evaluateVideoFactoryBudgetGuard({
      estimatedCost: costEstimate,
      evaluatedAt: timestamp,
      warningThresholdUsd: finalBudgetThresholds.warningThresholdUsd,
      hardStopThresholdUsd: finalBudgetThresholds.hardStopThresholdUsd,
    });
    let qualityCheck: QualityCheckResult | null = null;
    let qualityCheckRetryState: VideoFactoryRetryState | null = null;

    try {
      const qualityCheckExecution = await executeWithRetry({
        stage: "quality_check",
        onRetryScheduled: async (retryInput) => {
          const failureStage = qualityFailureStageFromError(retryInput.error);
          currentStage = failureStage;
          factoryLifecycle = transitionVideoFactoryLifecycle(
            factoryLifecycle,
            "retry_queued",
            {
              timestamp: new Date().toISOString(),
              provider,
              renderVersion,
              failureStage,
              failureMessage:
                retryInput.error instanceof Error
                  ? retryInput.error.message
                  : "Quality check retry scheduled.",
              retryState: retryInput.retryState,
            },
          );
          await updateOpportunity(input.opportunityId, (opportunity) => {
            const persistedGenerationState = contentOpportunityGenerationStateSchema.parse(
              opportunity.generationState ?? {},
            );
            const currentRenderJob = persistedGenerationState.renderJob;

            return {
              ...opportunity,
              generationState: contentOpportunityGenerationStateSchema.parse({
                ...persistedGenerationState,
                factoryLifecycle,
                latestRetryState: retryInput.retryState,
                renderJob: currentRenderJob
                  ? renderJobSchema.parse({
                      ...currentRenderJob,
                      retryState: retryInput.retryState,
                      errorMessage:
                        retryInput.error instanceof Error
                          ? retryInput.error.message
                          : "Quality check retry scheduled.",
                    })
                  : null,
              }),
              updatedAt: new Date().toISOString(),
            };
          });
        },
        step: async () => {
          const result = runVideoFactoryQualityChecks({
            compiledProductionPlan,
            providerResults: orchestration.providerResults,
            checkedAt: timestamp,
          });

          if (!result.passed) {
            throw new VideoFactoryRetryableError(
              summarizeQualityCheckFailures(result),
              {
                retryable: isRetryableQualityCheckResult(result),
                details: result,
              },
            );
          }

          return result;
        },
      });

      qualityCheck = qualityCheckExecution.value;
      qualityCheckRetryState = qualityCheckExecution.retryState;
    } catch (error) {
      if (!(error instanceof VideoFactoryRetryExecutionError)) {
        throw error;
      }

      qualityCheckRetryState = error.retryState;
      const parsedQualityCheck = qualityCheckResultSchema.safeParse(error.details);
      if (parsedQualityCheck.success) {
        qualityCheck = parsedQualityCheck.data;
      } else {
        throw error;
      }
    }

    const attemptRetryState = summarizeVideoFactoryRetryStates([
      orchestration.stageRetryStates.preparing,
      orchestration.stageRetryStates.generating_narration,
      orchestration.stageRetryStates.generating_visuals,
      orchestration.stageRetryStates.generating_captions,
      orchestration.stageRetryStates.composing,
      qualityCheckRetryState,
    ]);
    if (!qualityCheck) {
      throw new Error("Quality check did not return a result.");
    }
    if (!costEstimate || !budgetGuard) {
      throw new Error("Cost metadata was not initialized for the factory attempt.");
    }
    const actualCost = buildJobCostRecord({
      jobId: activeQueuedRenderJob.id,
      estimatedCost: costEstimate,
      compiledProductionPlan,
      providerResults: orchestration.providerResults,
      completedAt: orchestration.renderJobInput.completedAt,
    });
    const renderJobBase = renderJobSchema.parse({
      ...activeQueuedRenderJob,
      provider: orchestration.renderJobInput.provider,
      renderVersion: orchestration.renderJobInput.renderVersion,
      compiledProductionPlan: orchestration.renderJobInput.compiledProductionPlan,
      productionDefaultsSnapshot: orchestration.renderJobInput.productionDefaultsSnapshot,
      costEstimate,
      actualCost,
      budgetGuard,
      qualityCheck,
      retryState: attemptRetryState,
    });
    const persistedArtifacts = await persistVideoFactoryArtifacts({
      opportunityId: attemptOpportunity.opportunityId,
      videoBriefId: attemptBrief.id,
      factoryJobId: factoryLifecycle.factoryJobId,
      attemptNumber,
      renderVersion,
      persistedAt: timestamp,
      providerResults: orchestration.providerResults,
    });
    const renderedAsset = createMockRenderedAsset({
      renderJobId: renderJobBase.id,
      ...orchestration.renderedAssetInput,
      url:
        persistedArtifacts.composedVideo.url ??
        orchestration.renderedAssetInput.url,
      thumbnailUrl:
        persistedArtifacts.thumbnail?.url ??
        orchestration.renderedAssetInput.thumbnailUrl ??
        null,
    });
    const attemptLineage = buildVideoFactoryAttemptLineage({
      factoryJobId: factoryLifecycle.factoryJobId,
      renderVersion,
      generationRequestId: completedGenerationRequest.id,
      renderJobId: renderJobBase.id,
      renderedAssetId: qualityCheck.passed ? renderedAsset.id : null,
      costEstimate,
      actualCost,
      budgetGuard,
      qualityCheck,
      retryState: attemptRetryState,
      stageRetryStates: {
        narration: orchestration.stageRetryStates.generating_narration,
        visuals: orchestration.stageRetryStates.generating_visuals,
        captions: orchestration.stageRetryStates.generating_captions,
        composition: orchestration.stageRetryStates.composing,
      },
      persistedArtifacts,
      createdAt: timestamp,
      narrationSpecId: compiledProductionPlan.narrationSpec.id,
      captionSpecId: compiledProductionPlan.captionSpec.id,
      compositionSpecId: compiledProductionPlan.compositionSpec.id,
      providerResults: orchestration.providerResults,
    });

    if (!qualityCheck.passed) {
      currentStage = lifecycleStatusForQualityFailure(qualityCheck.failures[0]?.stage ?? "composition");
      factoryLifecycle = transitionVideoFactoryLifecycle(
        factoryLifecycle,
        terminalFailureLifecycleStatus(attemptRetryState),
        {
        timestamp,
        provider,
        renderVersion,
        failureStage: currentStage,
        failureMessage: summarizeQualityCheckFailures(qualityCheck),
        retryState: attemptRetryState,
        },
      );
      const failedGenerationRequest = videoGenerationRequestSchema.parse({
        ...completedGenerationRequest,
        status: "failed",
      });
      const failedRenderJob = renderJobSchema.parse({
        ...renderJobBase,
        status: "failed",
        providerJobId: orchestration.renderJobInput.providerJobId,
        submittedAt:
          activeQueuedRenderJob.submittedAt ?? orchestration.renderJobInput.submittedAt,
        completedAt: timestamp,
        errorMessage: summarizeQualityCheckFailures(qualityCheck),
        retryState: attemptRetryState,
      });
      const failedLedgerEntry = buildFactoryRunLedgerEntry({
        opportunityId: attemptOpportunity.opportunityId,
        videoBriefId: attemptBrief.id,
        attemptNumber,
        lifecycle: factoryLifecycle,
        renderProvider: provider,
        generationRequestId: failedGenerationRequest.id,
        renderJobId: failedRenderJob.id,
        renderedAssetId: null,
        attemptLineage,
        estimatedCost: costEstimate,
        actualCost,
        budgetGuard,
        qualityCheck,
        retryState: attemptRetryState,
        regenerationReasonCodes: activeQueuedRenderJob.regenerationReasonCodes,
        regenerationNotes: activeQueuedRenderJob.regenerationNotes,
        growthExecutionPath:
          attemptOpportunity.growthIntelligence?.executionPath ?? null,
        growthExecutionPriority:
          attemptOpportunity.growthIntelligence?.executionPriority ?? null,
        growthRiskLevel: attemptOpportunity.growthIntelligence?.riskLevel ?? null,
        growthReasoning: attemptOpportunity.growthIntelligence?.reasoning ?? null,
      finalScriptTrustScore:
          compiledProductionPlan.finalScriptTrustAssessment?.score ?? null,
        finalScriptTrustStatus:
          compiledProductionPlan.finalScriptTrustAssessment?.status ?? null,
        abTest: failedRenderJob.abTest ?? activeQueuedRenderJob.abTest ?? null,
      });

      const failureState = await updateOpportunity(input.opportunityId, (opportunity) => {
        const persistedGenerationState = contentOpportunityGenerationStateSchema.parse(
          opportunity.generationState ?? {},
        );

        return {
          ...opportunity,
          selectedVideoBrief: applyCompiledPlanToVideoBrief(
            opportunity.selectedVideoBrief,
            failedRenderJob.compiledProductionPlan,
          ),
          generationState: contentOpportunityGenerationStateSchema.parse({
            ...persistedGenerationState,
            videoBriefApprovedAt: attemptApprovedAt,
            videoBriefApprovedBy: attemptApprovedBy,
            factoryLifecycle,
            latestCostEstimate: costEstimate,
            latestActualCost: actualCost,
            latestBudgetGuard: budgetGuard,
            latestQualityCheck: qualityCheck,
            latestRetryState: attemptRetryState,
            runLedger: appendFactoryRunLedgerEntry(
              persistedGenerationState.runLedger,
              failedLedgerEntry,
            ),
            comparisonRecords: updateFactoryComparisonDecision(
              updateFactoryComparisonRecordForRenderJob(
                persistedGenerationState.comparisonRecords,
                {
                  comparisonRenderJob: failedRenderJob,
                  comparisonFactoryJobId: factoryLifecycle.factoryJobId,
                  comparisonOutcome: "failed_permanent",
                  updatedAt: timestamp,
                },
              ),
              {
                comparisonRenderJobId: failedRenderJob.id,
                outcome: "failed_permanent",
                notes: summarizeQualityCheckFailures(qualityCheck),
                updatedAt: timestamp,
              },
            ),
            attemptLineage: appendVideoFactoryAttemptLineage(
              persistedGenerationState.attemptLineage,
              attemptLineage,
            ),
            narrationSpec,
            videoPrompt: activeQueuedVideoPrompt,
            generationRequest: failedGenerationRequest,
            renderJob: failedRenderJob,
            renderedAsset: null,
            assetReview: null,
          }),
          updatedAt: timestamp,
        };
      });
      await upsertLearningRecord({
        learningRecordId: buildLearningRecordId({
          inputSignature: buildContentOpportunityLearningSignature({
            opportunity: attemptOpportunity,
            actionType: isRegenerateAttempt
              ? "auto_regenerate_video_factory"
              : "auto_run_video_factory",
            provider,
            format: attemptBrief.format,
          }),
          stage: "generation",
          sourceId: failedGenerationRequest.id,
        }),
        inputSignature: buildContentOpportunityLearningSignature({
          opportunity: attemptOpportunity,
          actionType: isRegenerateAttempt
            ? "auto_regenerate_video_factory"
            : "auto_run_video_factory",
          provider,
          format: attemptBrief.format,
        }),
        outcome: "failed",
        retries: attemptRetryState?.retryCount ?? 0,
        cost: actualCost?.actualCostUsd ?? costEstimate?.estimatedTotalUsd ?? 0,
        timestamp,
        inputType: "video_factory",
        stage: "generation",
      actionType: isRegenerateAttempt
        ? "auto_regenerate_video_factory"
        : "auto_run_video_factory",
      sourceId: failedGenerationRequest.id,
      platform: attemptOpportunity.recommendedPlatforms[0] ?? null,
      provider,
      abTestConfigId: failedRenderJob.abTest?.configId ?? null,
      abTestDimension: failedRenderJob.abTest?.dimension ?? null,
      abTestVariant: failedRenderJob.abTest?.variant ?? null,
      ...buildContentOpportunityLearningMetadata({
        opportunity: attemptOpportunity,
        hook: attemptBrief.hook,
      }),
    });

      return failureState;
    }

    const renderJob = renderJobSchema.parse({
      ...renderJobBase,
      status: "completed",
      providerJobId: orchestration.renderJobInput.providerJobId,
      submittedAt:
        activeQueuedRenderJob.submittedAt ?? orchestration.renderJobInput.submittedAt,
      completedAt: orchestration.renderJobInput.completedAt,
      errorMessage: null,
    });
    const assetReview = createPendingAssetReview({
      renderedAssetId: renderedAsset.id,
    });
    factoryLifecycle = transitionVideoFactoryLifecycle(factoryLifecycle, "review_pending", {
      timestamp: new Date().toISOString(),
      provider,
      renderVersion,
      retryState: attemptRetryState,
    });
    const runLedgerEntry = buildFactoryRunLedgerEntry({
      opportunityId: attemptOpportunity.opportunityId,
      videoBriefId: attemptBrief.id,
      attemptNumber,
      lifecycle: factoryLifecycle,
      renderProvider: provider,
      generationRequestId: completedGenerationRequest.id,
      renderJobId: renderJob.id,
      renderedAssetId: renderedAsset.id,
      attemptLineage,
      estimatedCost: costEstimate,
      actualCost,
      budgetGuard,
      qualityCheck,
      retryState: attemptRetryState,
      regenerationReasonCodes: activeQueuedRenderJob.regenerationReasonCodes,
      regenerationNotes: activeQueuedRenderJob.regenerationNotes,
      growthExecutionPath: attemptOpportunity.growthIntelligence?.executionPath ?? null,
      growthExecutionPriority:
        attemptOpportunity.growthIntelligence?.executionPriority ?? null,
      growthRiskLevel: attemptOpportunity.growthIntelligence?.riskLevel ?? null,
      growthReasoning: attemptOpportunity.growthIntelligence?.reasoning ?? null,
      finalScriptTrustScore:
        compiledProductionPlan.finalScriptTrustAssessment?.score ?? null,
      finalScriptTrustStatus:
        compiledProductionPlan.finalScriptTrustAssessment?.status ?? null,
      abTest: renderJob.abTest ?? activeQueuedRenderJob.abTest ?? null,
    });
    const generationSignalMetadata = buildPerformanceSignalMetadata({
      opportunity: attemptOpportunity,
      videoBriefId: attemptBrief.id,
      provider,
      renderVersion,
      defaultsProfileId: compiledProductionPlan.defaultsSnapshot.id,
      voiceId: compiledProductionPlan.defaultsSnapshot.voiceId,
      aspectRatio: compiledProductionPlan.defaultsSnapshot.aspectRatio,
      resolution: compiledProductionPlan.defaultsSnapshot.resolution,
      trustStatus: compiledProductionPlan.trustAssessment.status,
      trustAdjusted: compiledProductionPlan.trustAssessment.adjusted,
      extra: {
        factoryLifecycleStatus: factoryLifecycle.status,
      },
    });
    const additionalPerformanceSignals = [
      buildAssetGeneratedPerformanceSignal({
        opportunityId: attemptOpportunity.opportunityId,
        videoBriefId: attemptBrief.id,
        renderedAssetId: renderedAsset.id,
        createdAt: timestamp,
        value: renderedAsset.durationSec ?? null,
        metadata: generationSignalMetadata,
      }),
      ...(isRegenerateAttempt
        ? [
            buildAssetRegeneratedPerformanceSignal({
              opportunityId: attemptOpportunity.opportunityId,
              videoBriefId: attemptBrief.id,
              renderedAssetId: renderedAsset.id,
              createdAt: timestamp,
              metadata: generationSignalMetadata,
            }),
          ]
        : []),
    ];

    const state = await updateOpportunity(input.opportunityId, (opportunity) => {
      const persistedGenerationState = contentOpportunityGenerationStateSchema.parse(
        opportunity.generationState ?? {},
      );

      return {
        ...opportunity,
        selectedVideoBrief: applyCompiledPlanToVideoBrief(
          opportunity.selectedVideoBrief,
          renderJob.compiledProductionPlan,
        ),
        generationState: contentOpportunityGenerationStateSchema.parse({
          ...persistedGenerationState,
          videoBriefApprovedAt: attemptApprovedAt,
          videoBriefApprovedBy: attemptApprovedBy,
          factoryLifecycle,
          latestCostEstimate: costEstimate,
          latestActualCost: actualCost,
          latestBudgetGuard: budgetGuard,
          latestQualityCheck: qualityCheck,
          latestRetryState: attemptRetryState,
          runLedger: appendFactoryRunLedgerEntry(
            persistedGenerationState.runLedger,
            runLedgerEntry,
          ),
          comparisonRecords: updateFactoryComparisonRecordForRenderJob(
            persistedGenerationState.comparisonRecords,
            {
              comparisonRenderJob: renderJob,
              comparisonFactoryJobId: factoryLifecycle.factoryJobId,
              comparisonOutcome: "review_pending",
              updatedAt: timestamp,
            },
          ),
          attemptLineage: appendVideoFactoryAttemptLineage(
            persistedGenerationState.attemptLineage,
            attemptLineage,
          ),
          narrationSpec,
          videoPrompt: activeQueuedVideoPrompt,
          generationRequest: completedGenerationRequest,
          renderJob,
          renderedAsset,
          assetReview,
          performanceSignals: appendPerformanceSignals(
            persistedGenerationState.performanceSignals,
            additionalPerformanceSignals,
          ),
        }),
        updatedAt: timestamp,
      };
    });
    await upsertLearningRecord({
      learningRecordId: buildLearningRecordId({
        inputSignature: buildContentOpportunityLearningSignature({
          opportunity: attemptOpportunity,
          actionType: isRegenerateAttempt
            ? "auto_regenerate_video_factory"
            : "auto_run_video_factory",
          provider,
          format: attemptBrief.format,
        }),
        stage: "generation",
        sourceId: completedGenerationRequest.id,
      }),
      inputSignature: buildContentOpportunityLearningSignature({
        opportunity: attemptOpportunity,
        actionType: isRegenerateAttempt
          ? "auto_regenerate_video_factory"
          : "auto_run_video_factory",
        provider,
        format: attemptBrief.format,
      }),
      outcome: "success",
      retries: attemptRetryState?.retryCount ?? 0,
      cost: actualCost?.actualCostUsd ?? costEstimate?.estimatedTotalUsd ?? 0,
      timestamp,
      inputType: "video_factory",
      stage: "generation",
      actionType: isRegenerateAttempt
        ? "auto_regenerate_video_factory"
        : "auto_run_video_factory",
      sourceId: completedGenerationRequest.id,
      platform: attemptOpportunity.recommendedPlatforms[0] ?? null,
      provider,
      abTestConfigId: renderJob.abTest?.configId ?? null,
      abTestDimension: renderJob.abTest?.dimension ?? null,
      abTestVariant: renderJob.abTest?.variant ?? null,
      ...buildContentOpportunityLearningMetadata({
        opportunity: attemptOpportunity,
        hook: attemptBrief.hook,
      }),
    });
    const actionEventType = isRegenerateAttempt
      ? ("CONTENT_OPPORTUNITY_VIDEO_REGENERATED" as const)
      : ("CONTENT_OPPORTUNITY_VIDEO_GENERATION_STARTED" as const);
    const actionSummary = isRegenerateAttempt
      ? `Regenerated video for content opportunity "${current.title}".`
      : `Started video generation for content opportunity "${current.title}".`;

    await appendAuditEventsSafe([
      {
        signalId: current.signalId,
        eventType: actionEventType,
        actor: "operator",
        summary: actionSummary,
        metadata: {
          provider,
          renderVersion,
          generationRequestId: completedGenerationRequest.id,
          compiledProductionPlanId: compiledProductionPlan.id,
          narrationSpecId: compiledProductionPlan.narrationSpec.id,
          scenePromptCount: compiledProductionPlan.scenePrompts.length,
          captionSpecId: compiledProductionPlan.captionSpec.id,
          compositionSpecId: compiledProductionPlan.compositionSpec.id,
          factoryJobId: factoryLifecycle.factoryJobId,
          factoryLifecycleStatus: factoryLifecycle.status,
          idempotencyKey,
        },
      },
      {
        signalId: current.signalId,
        eventType: "CONTENT_OPPORTUNITY_RENDER_COMPLETED" as const,
        actor: "operator",
        summary: `Completed render for content opportunity "${current.title}".`,
        metadata: {
          provider,
          renderVersion,
          renderJobId: renderJob.id,
          renderedAssetId: renderedAsset.id,
          actualCostUsd: actualCost.actualCostUsd,
          narrationProvider: orchestration.providerResults.narration.provider,
          narrationId: orchestration.providerResults.narration.id,
          visualProvider: orchestration.providerResults.sceneAssets[0]?.provider ?? "runway-gen4",
          sceneAssetCount: orchestration.providerResults.sceneAssets.length,
          captionProvider: orchestration.providerResults.captionTrack.provider,
          captionTrackId: orchestration.providerResults.captionTrack.id,
          compositionProvider: orchestration.providerResults.composedVideo.provider,
          composedVideoId: orchestration.providerResults.composedVideo.id,
          factoryJobId: factoryLifecycle.factoryJobId,
          factoryLifecycleStatus: factoryLifecycle.status,
          idempotencyKey,
        },
      },
    ]);

    return state;
  } catch (error) {
    const retryState =
      error instanceof VideoFactoryRetryExecutionError ? error.retryState : null;
    if (retryState?.retryStage) {
      currentStage = retryState.retryStage as VideoFactoryStatus;
    }
    const providerFailure = summarizeVideoFactoryProviderFailure(error, {
      provider:
        currentStage === "preparing" ||
        currentStage === "generating_narration" ||
        currentStage === "generating_visuals" ||
        currentStage === "generating_captions" ||
        currentStage === "composing"
          ? executionStageProviders[currentStage]
          : "factory",
      stage: currentStage,
    });
    const failureTimestamp = new Date().toISOString();
    const failedLifecycle = transitionVideoFactoryLifecycle(
      factoryLifecycle,
      terminalFailureLifecycleStatus(retryState),
      {
      timestamp: failureTimestamp,
      provider,
      renderVersion,
      failureStage: currentStage,
      failureMessage: providerFailure.operatorSummary,
      retryState,
      },
    );
    const failedLedgerEntry = buildFactoryRunLedgerEntry({
      opportunityId: attemptOpportunity.opportunityId,
      videoBriefId: attemptBrief.id,
      attemptNumber,
      lifecycle: failedLifecycle,
      renderProvider: provider,
      generationRequestId: activeGenerationRequest.id,
      renderJobId: activeQueuedRenderJob.id,
      estimatedCost: costEstimate,
      budgetGuard,
      retryState,
      regenerationReasonCodes: activeQueuedRenderJob.regenerationReasonCodes,
      regenerationNotes: activeQueuedRenderJob.regenerationNotes,
      growthExecutionPath: attemptOpportunity.growthIntelligence?.executionPath ?? null,
      growthExecutionPriority:
        attemptOpportunity.growthIntelligence?.executionPriority ?? null,
      growthRiskLevel: attemptOpportunity.growthIntelligence?.riskLevel ?? null,
      growthReasoning: attemptOpportunity.growthIntelligence?.reasoning ?? null,
      finalScriptTrustScore:
        activeQueuedRenderJob.compiledProductionPlan?.finalScriptTrustAssessment?.score ??
        null,
      finalScriptTrustStatus:
        activeQueuedRenderJob.compiledProductionPlan?.finalScriptTrustAssessment?.status ??
        null,
      abTest: activeQueuedRenderJob.abTest ?? null,
    });

    await updateOpportunity(input.opportunityId, (opportunity) => {
      const persistedGenerationState = contentOpportunityGenerationStateSchema.parse(
        opportunity.generationState ?? {},
      );
      const failedRenderJob = renderJobSchema.parse({
        ...activeQueuedRenderJob,
        costEstimate,
        budgetGuard,
        status: "failed",
        completedAt: failureTimestamp,
        errorMessage: providerFailure.operatorSummary,
        retryState,
      });

      return {
        ...opportunity,
        selectedVideoBrief: applyCompiledPlanToVideoBrief(
          opportunity.selectedVideoBrief,
          failedRenderJob.compiledProductionPlan,
        ),
        generationState: contentOpportunityGenerationStateSchema.parse({
          ...persistedGenerationState,
          videoBriefApprovedAt: attemptApprovedAt,
          videoBriefApprovedBy: attemptApprovedBy,
          factoryLifecycle: failedLifecycle,
          latestCostEstimate: costEstimate,
          latestActualCost: null,
          latestBudgetGuard: budgetGuard,
          latestRetryState: retryState,
          runLedger: appendFactoryRunLedgerEntry(
            persistedGenerationState.runLedger,
            failedLedgerEntry,
          ),
          comparisonRecords: updateFactoryComparisonDecision(
            updateFactoryComparisonRecordForRenderJob(
              persistedGenerationState.comparisonRecords,
              {
                comparisonRenderJob: failedRenderJob,
                comparisonFactoryJobId: failedLifecycle.factoryJobId,
                comparisonOutcome: "failed_permanent",
                updatedAt: failureTimestamp,
              },
            ),
            {
              comparisonRenderJobId: failedRenderJob.id,
              outcome: "failed_permanent",
              notes: providerFailure.operatorSummary,
              updatedAt: failureTimestamp,
            },
          ),
          generationRequest: videoGenerationRequestSchema.parse({
            ...activeGenerationRequest,
            status: "failed",
          }),
          renderJob: failedRenderJob,
        }),
        updatedAt: failureTimestamp,
      };
    });
    await upsertLearningRecord({
      learningRecordId: buildLearningRecordId({
        inputSignature: buildContentOpportunityLearningSignature({
          opportunity: attemptOpportunity,
          actionType: isRegenerateAttempt
            ? "auto_regenerate_video_factory"
            : "auto_run_video_factory",
          provider,
          format: attemptBrief.format,
        }),
        stage: "generation",
        sourceId: activeGenerationRequest.id,
      }),
      inputSignature: buildContentOpportunityLearningSignature({
        opportunity: attemptOpportunity,
        actionType: isRegenerateAttempt
          ? "auto_regenerate_video_factory"
          : "auto_run_video_factory",
        provider,
        format: attemptBrief.format,
      }),
      outcome: "failed",
      retries: retryState?.retryCount ?? 0,
      cost: costEstimate?.estimatedTotalUsd ?? 0,
      timestamp: failureTimestamp,
      inputType: "video_factory",
      stage: "generation",
      actionType: isRegenerateAttempt
        ? "auto_regenerate_video_factory"
        : "auto_run_video_factory",
      sourceId: activeGenerationRequest.id,
      platform: attemptOpportunity.recommendedPlatforms[0] ?? null,
      provider,
      abTestConfigId: activeQueuedRenderJob.abTest?.configId ?? null,
      abTestDimension: activeQueuedRenderJob.abTest?.dimension ?? null,
      abTestVariant: activeQueuedRenderJob.abTest?.variant ?? null,
      ...buildContentOpportunityLearningMetadata({
        opportunity: attemptOpportunity,
        hook: attemptBrief.hook,
      }),
    });

    throw error;
  }
}

function normalizePersistedOpportunity(opportunity: ContentOpportunity): ContentOpportunity {
  const founderSelection = normalizeFounderSelection(opportunity);
  const founderNormalizedOpportunity = applyStrategicIntelligence(
    {
      ...opportunity,
      ...founderSelection,
    },
    {
      preserveExisting: true,
    },
  );

  return enrichOpportunityPhaseEFields(
    contentOpportunitySchema.parse({
      ...founderNormalizedOpportunity,
      messageAngles: resolveOpportunityMessageAngles(founderNormalizedOpportunity),
      hookSets: resolveOpportunityHookSets(founderNormalizedOpportunity),
      painPointCategory: founderNormalizedOpportunity.painPointCategory ?? null,
      confidence: founderNormalizedOpportunity.confidence ?? null,
      historicalCostAvg: founderNormalizedOpportunity.historicalCostAvg ?? null,
      historicalApprovalRate: founderNormalizedOpportunity.historicalApprovalRate ?? null,
      skipReason: founderNormalizedOpportunity.skipReason ?? null,
      generationState: normalizeGenerationState(founderNormalizedOpportunity),
    }),
  );
}

function mergePersistedFields(
  nextOpportunity: ContentOpportunity,
  existingOpportunity: ContentOpportunity | undefined,
): ContentOpportunity {
  if (!existingOpportunity) {
    return normalizePersistedOpportunity(nextOpportunity);
  }

  const mergedOpportunity: ContentOpportunity = {
    ...nextOpportunity,
    status: existingOpportunity.status,
    createdAt: existingOpportunity.createdAt,
    approvedAt: existingOpportunity.approvedAt,
    dismissedAt: existingOpportunity.dismissedAt,
    messageAngles: existingOpportunity.messageAngles ?? nextOpportunity.messageAngles ?? [],
    hookSets: existingOpportunity.hookSets ?? nextOpportunity.hookSets ?? [],
    founderSelectionStatus: existingOpportunity.founderSelectionStatus ?? "pending",
    selectedAngleId: existingOpportunity.selectedAngleId ?? null,
    selectedHookId: existingOpportunity.selectedHookId ?? null,
    selectedVideoBrief: existingOpportunity.selectedVideoBrief ?? null,
    generationState: existingOpportunity.generationState ?? null,
    painPointCategory:
      nextOpportunity.painPointCategory ?? existingOpportunity.painPointCategory ?? null,
    confidence: nextOpportunity.confidence ?? existingOpportunity.confidence ?? null,
    historicalCostAvg:
      nextOpportunity.historicalCostAvg ?? existingOpportunity.historicalCostAvg ?? null,
    historicalApprovalRate:
      nextOpportunity.historicalApprovalRate ??
      existingOpportunity.historicalApprovalRate ??
      null,
    skipReason: nextOpportunity.skipReason ?? existingOpportunity.skipReason ?? null,
    hookOptions: existingOpportunity.hookOptions ?? nextOpportunity.hookOptions ?? null,
    hookRanking: existingOpportunity.hookRanking ?? nextOpportunity.hookRanking ?? null,
    performanceDrivers:
      existingOpportunity.performanceDrivers ?? nextOpportunity.performanceDrivers ?? null,
    intendedViewerEffect:
      existingOpportunity.intendedViewerEffect ?? nextOpportunity.intendedViewerEffect ?? null,
    suggestedCTA: existingOpportunity.suggestedCTA ?? nextOpportunity.suggestedCTA ?? null,
    productionComplexity:
      existingOpportunity.productionComplexity ?? nextOpportunity.productionComplexity ?? null,
    growthIntelligence:
      nextOpportunity.growthIntelligence ?? existingOpportunity.growthIntelligence ?? null,
    operatorNotes: existingOpportunity.operatorNotes,
  };

  return normalizePersistedOpportunity(mergedOpportunity);
}

function summarizeState(opportunities: ContentOpportunity[]) {
  const normalizedOpportunities = opportunities.map((opportunity) =>
    normalizePersistedOpportunity(opportunity),
  );
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

function applyStrategicIntelligence(
  opportunity: ContentOpportunity,
  options?: {
    signal?: ApprovalQueueCandidate["signal"];
    preserveExisting?: boolean;
    activeCampaignIds?: string[] | null;
    campaignsExist?: boolean;
  },
): ContentOpportunity {
  const contentIntelligenceOpportunity = applyPhaseEIntelligence(opportunity, {
    enabled: ENABLE_FORMAT_INTELLIGENCE,
    preserveExisting: options?.preserveExisting,
  });

  return {
    ...contentIntelligenceOpportunity,
    growthIntelligence: buildOpportunityGrowthIntelligence(
      contentIntelligenceOpportunity,
      options,
    ),
  };
}

function buildOpportunityFromCandidate(
  candidate: ApprovalQueueCandidate,
  growthMemory: GrowthMemoryState,
  now: Date,
  options?: {
    activeCampaignIds?: string[] | null;
    campaignsExist?: boolean;
  },
): ContentOpportunity {
  const baseOpportunity = contentOpportunitySchema.parse({
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
    painPointCategory: null,
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
    confidence: null,
    historicalCostAvg: null,
    historicalApprovalRate: null,
    suggestedNextStep: buildSuggestedNextStep(candidate),
    skipReason: null,
    hookOptions: null,
    hookRanking: null,
    performanceDrivers: null,
    intendedViewerEffect: null,
    suggestedCTA: null,
    productionComplexity: null,
    growthIntelligence: null,
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
    messageAngles: [],
    hookSets: [],
    founderSelectionStatus: "pending",
    selectedAngleId: null,
    selectedHookId: null,
    selectedVideoBrief: null,
    generationState: null,
    operatorNotes: null,
  });

  return applyStrategicIntelligence(baseOpportunity, {
    signal: candidate.signal,
    activeCampaignIds: options?.activeCampaignIds,
    campaignsExist: options?.campaignsExist,
  });
}

export function buildContentOpportunityState(input: {
  candidates: ApprovalQueueCandidate[];
  growthMemory: GrowthMemoryState;
  existing?: ContentOpportunity[] | null;
  now?: Date;
  activeCampaignIds?: string[] | null;
  campaignsExist?: boolean;
}): ContentOpportunityState {
  const now = input.now ?? new Date();
  const existingById = new Map((input.existing ?? []).map((item) => [item.opportunityId, item]));
  const historicalUniverse = (input.existing ?? []).map((item) =>
    normalizePersistedOpportunity(item),
  );
  const opportunities = input.candidates
    .filter((candidate) => candidate.triage.triageState !== "suppress")
    .filter((candidate) => candidate.signal.status !== "Posted" && candidate.signal.status !== "Archived")
    .map((candidate) => {
      const nextOpportunity = buildOpportunityFromCandidate(candidate, input.growthMemory, now, {
        activeCampaignIds: input.activeCampaignIds,
        campaignsExist: input.campaignsExist,
      });
      return enrichOpportunityPhaseEFields(
        mergePersistedFields(
          nextOpportunity,
          existingById.get(nextOpportunity.opportunityId),
        ),
        historicalUniverse,
      );
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
  activeCampaignIds?: string[] | null;
  campaignsExist?: boolean;
}) {
  const now = input.now ?? new Date();
  const store = await readPersistedStore();
  const nextState = buildContentOpportunityState({
    candidates: input.candidates,
    growthMemory: input.growthMemory,
    existing: store.opportunities,
    now,
    activeCampaignIds: input.activeCampaignIds,
    campaignsExist: input.campaignsExist,
  });
  const activeAutoApproveConfig = getActiveAutoApproveConfig();
  const todayKey = now.toISOString().slice(0, 10);
  let autoApprovedTodayCount = store.opportunities.filter(
    (opportunity) => opportunity.approvedAt?.startsWith(todayKey),
  ).length;
  let totalAutoApprovedCount = store.opportunities.filter(
    (opportunity) => opportunity.status === "approved_for_production",
  ).length;
  const nextOpportunities = activeAutoApproveConfig
    ? nextState.opportunities.map((opportunity) => {
        if (
          opportunity.status !== "open" ||
          opportunity.founderSelectionStatus !== "pending" ||
          opportunity.approvedAt
        ) {
          return opportunity;
        }

        const assessment = assessAutoApproveOpportunity({
          opportunity,
          config: activeAutoApproveConfig,
          autoApprovedTodayCount,
          totalAutoApprovedCount,
        });

        if (!assessment.eligible || assessment.heldForMandatoryReview) {
          return opportunity;
        }

        const autoApproved = buildAutoApprovedOpportunity(
          opportunity,
          now.toISOString(),
        );
        if (!autoApproved) {
          return opportunity;
        }

        autoApprovedTodayCount += 1;
        totalAutoApprovedCount += 1;
        return autoApproved;
      })
    : nextState.opportunities;
  const previousById = new Map(store.opportunities.map((item) => [item.opportunityId, item]));
  const auditEvents: AuditEventInput[] = [];

  for (const opportunity of nextOpportunities) {
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

    if (
      activeAutoApproveConfig &&
      previous?.status !== "approved_for_production" &&
      opportunity.status === "approved_for_production"
    ) {
      auditEvents.push({
        signalId: opportunity.signalId,
        eventType: "CONTENT_OPPORTUNITY_APPROVED" as const,
        actor: "system",
        summary: `Auto-approved content opportunity "${opportunity.title}" under active confidence rails.`,
        metadata: {
          autoApproved: true,
          configId: activeAutoApproveConfig.configId,
          confidence: opportunity.confidence,
        },
      });
    }
  }

  await writePersistedStore({
    updatedAt: now.toISOString(),
    opportunities: nextOpportunities,
  });
  await appendAuditEventsSafe(auditEvents);

  return summarizeState(nextOpportunities);
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
    return normalizePersistedOpportunity(updatedOpportunity);
  });
  await writePersistedStore({
    updatedAt: new Date().toISOString(),
    opportunities: nextOpportunities,
  });
  return summarizeState(nextOpportunities);
}

export async function approveContentOpportunity(opportunityId: string) {
  const timestamp = new Date().toISOString();
  let store = await readPersistedStore();
  let current = store.opportunities.find((item) => item.opportunityId === opportunityId);

  if (!current) {
    await refreshContentOpportunityStateFromSystem();
    store = await readPersistedStore();
    current = store.opportunities.find((item) => item.opportunityId === opportunityId);
  }

  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const state = await updateOpportunity(opportunityId, (opportunity) => {
    const messageAngles = resolveOpportunityMessageAngles(opportunity, {
      regenerate: true,
      createdAt: timestamp,
    });
    const hookSets = resolveOpportunityHookSets(
      {
        ...opportunity,
        messageAngles,
      },
      {
        regenerate: true,
      },
    );

    return {
      ...opportunity,
      status: "approved_for_production",
      messageAngles,
      hookSets,
      founderSelectionStatus: "pending",
      selectedAngleId: null,
      selectedHookId: null,
      selectedVideoBrief: null,
      generationState: null,
      approvedAt: timestamp,
      dismissedAt: null,
      updatedAt: timestamp,
    };
  });
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

export async function generateContentOpportunityMessageAngles(input: {
  opportunityId: string;
  regenerate?: boolean;
}) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find(
    (item) => item.opportunityId === input.opportunityId,
  );

  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  if (current.status !== "approved_for_production") {
    throw new Error(
      "Message angles are only available after the content opportunity is approved for production.",
    );
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  if (
    normalizedCurrent.messageAngles?.length &&
    !input.regenerate
  ) {
    return summarizeState(store.opportunities);
  }

  const nextAngles = resolveOpportunityMessageAngles(normalizedCurrent, {
    regenerate: true,
    createdAt: timestamp,
  });
  const state = await updateOpportunity(input.opportunityId, (opportunity) => ({
    ...opportunity,
    messageAngles: nextAngles,
    hookSets: [],
    selectedHookId: null,
    selectedVideoBrief: null,
    updatedAt: timestamp,
  }));

  return state;
}

export async function generateContentOpportunityHookSets(input: {
  opportunityId: string;
  angleId?: string | null;
  regenerate?: boolean;
}) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find(
    (item) => item.opportunityId === input.opportunityId,
  );

  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  if (current.status !== "approved_for_production") {
    throw new Error(
      "Hook sets are only available after the content opportunity is approved for production.",
    );
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  const angleId = normalizeText(input.angleId);
  const messageAngles = normalizedCurrent.messageAngles;
  const targetAngles = angleId
    ? messageAngles.filter((angle) => angle.id === angleId)
    : messageAngles;

  if (targetAngles.length === 0) {
    throw new Error("Message angle not found for this opportunity.");
  }

  const existingForTargets = normalizedCurrent.hookSets.filter((hookSet) =>
    targetAngles.some((angle) => angle.id === hookSet.angleId),
  );

  if (
    existingForTargets.length >= targetAngles.length &&
    !input.regenerate
  ) {
    return summarizeState(store.opportunities);
  }

  const regenerated = resolveOpportunityHookSets(
    {
      ...normalizedCurrent,
      messageAngles,
    },
    {
      regenerate: true,
      angleId,
      createdAt: timestamp,
    },
  );
  const state = await updateOpportunity(input.opportunityId, (opportunity) => {
    const retained = opportunity.hookSets.filter(
      (hookSet) => !regenerated.some((nextHookSet) => nextHookSet.angleId === hookSet.angleId),
    );

    return {
      ...opportunity,
      hookSets: [...retained, ...regenerated],
      updatedAt: timestamp,
    };
  });

  return state;
}

export async function dismissContentOpportunity(
  opportunityId: string,
  skipReason?: ContentOpportunitySkipReason | null,
) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }
  const normalizedSkipReason =
    typeof skipReason === "string" && skipReason.length > 0 ? skipReason : null;
  if (!normalizedSkipReason) {
    throw new Error("Dismiss requires a skip reason.");
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
    skipReason: normalizedSkipReason,
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_DISMISSED" as const,
      actor: "operator",
      summary: `Dismissed content opportunity "${current.title}".`,
      metadata: normalizedSkipReason
        ? {
            skipReason: normalizedSkipReason,
          }
        : undefined,
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
    generationState: null,
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

export async function selectContentOpportunityMessageAngle(input: {
  opportunityId: string;
  angleId: string;
}) {
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === input.opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  if (normalizedCurrent.status !== "approved_for_production") {
    throw new Error("Approve the content opportunity before selecting an angle.");
  }

  const angle = resolveSelectedAngle(normalizedCurrent, input.angleId);
  if (!angle) {
    throw new Error("Message angle not found for this opportunity.");
  }

  return updateContentOpportunityFounderSelection({
    opportunityId: input.opportunityId,
    selectedAngleId: angle.id,
    selectedHookId: null,
  });
}

export async function selectContentOpportunityHook(input: {
  opportunityId: string;
  angleId: string;
  hookId: string;
}) {
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === input.opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  if (normalizedCurrent.status !== "approved_for_production") {
    throw new Error("Approve the content opportunity before selecting a hook.");
  }

  const angle = resolveSelectedAngle(normalizedCurrent, input.angleId);
  if (!angle) {
    throw new Error("Message angle not found for this opportunity.");
  }

  const hookSet = resolveSelectedHookSet(normalizedCurrent, angle, input.hookId);
  const selectedHook =
    hookSet.variants.find((variant) => variant.id === input.hookId) ?? null;
  if (!selectedHook) {
    throw new Error("Hook option not found for this angle.");
  }

  return updateContentOpportunityFounderSelection({
    opportunityId: input.opportunityId,
    selectedAngleId: angle.id,
    selectedHookId: selectedHook.id,
  });
}

export async function saveContentOpportunityVideoBriefDraft(input: {
  opportunityId: string;
  briefDraft: {
    title: string;
    hook: string;
    goal: string;
    structure: Array<{
      order: number;
      purpose: string;
      guidance: string;
      suggestedOverlay?: string | null;
    }>;
    overlayLines: string[];
    cta: string;
    contentType?: VideoBrief["contentType"];
  };
}) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === input.opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  if (normalizedCurrent.status !== "approved_for_production") {
    throw new Error("Approve the content opportunity before saving a video brief.");
  }

  const angle = resolveSelectedAngle(normalizedCurrent, normalizedCurrent.selectedAngleId);
  if (!angle) {
    throw new Error("Select a message angle before saving the video brief.");
  }

  const selectedHookId = normalizeText(normalizedCurrent.selectedHookId);
  if (!selectedHookId) {
    throw new Error("Select a hook before saving the video brief.");
  }

  const selectedHookSet = resolveSelectedHookSet(
    normalizedCurrent,
    angle,
    selectedHookId,
  );
  const currentBrief = buildPersistedVideoBrief(
    normalizedCurrent,
    angle,
    selectedHookSet,
    normalizedCurrent.selectedVideoBrief,
  );
  const nextStructure = input.briefDraft.structure.map((beat, index) => ({
    order: beat.order,
    purpose:
      normalizeText(beat.purpose) ??
      currentBrief.structure[index]?.purpose ??
      `Beat ${index + 1}`,
    guidance:
      normalizeText(beat.guidance) ??
      currentBrief.structure[index]?.guidance ??
      "Keep the message grounded and usable.",
    suggestedOverlay:
      normalizeText(beat.suggestedOverlay) ??
      currentBrief.structure[index]?.suggestedOverlay ??
      undefined,
  }));
  const nextOverlayLines = input.briefDraft.overlayLines
    .map((line) => normalizeText(line))
    .filter((line): line is string => Boolean(line))
    .slice(0, 4);
  const savedBrief = validateVideoBrief(
    normalizedCurrent,
    angle,
    selectedHookSet,
    videoBriefSchema.parse({
      ...currentBrief,
      title: normalizeText(input.briefDraft.title) ?? currentBrief.title,
      hook: normalizeText(input.briefDraft.hook) ?? currentBrief.hook,
      goal: normalizeText(input.briefDraft.goal) ?? currentBrief.goal,
      structure:
        nextStructure.length >= 3 ? nextStructure : currentBrief.structure,
      overlayLines:
        nextOverlayLines.length >= 2
          ? nextOverlayLines
          : currentBrief.overlayLines,
      cta: normalizeText(input.briefDraft.cta) ?? currentBrief.cta,
      contentType: input.briefDraft.contentType ?? currentBrief.contentType ?? null,
      finalScriptTrustScore: currentBrief.finalScriptTrustScore ?? null,
    }),
  );

  const state = await updateOpportunity(input.opportunityId, (opportunity) => ({
    ...opportunity,
    founderSelectionStatus: "hook-selected",
    selectedAngleId: angle.id,
    selectedHookId,
    selectedVideoBrief: savedBrief,
    generationState: null,
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_FOUNDER_SELECTION_UPDATED" as const,
      actor: "operator",
      summary: `Saved a video brief draft for content opportunity "${current.title}".`,
      metadata: {
        founderSelectionStatus: "hook-selected",
        videoBriefId: savedBrief.id,
        angleId: angle.id,
        hookId: selectedHookId,
      },
    },
  ]);

  return state;
}

export async function approveContentOpportunityVideoBrief(opportunityId: string) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  if (normalizedCurrent.status !== "approved_for_production") {
    throw new Error("Approve the content opportunity before approving the video brief.");
  }

  const angle = resolveSelectedAngle(normalizedCurrent, normalizedCurrent.selectedAngleId);
  if (!angle) {
    throw new Error("Select a message angle before approving the video brief.");
  }

  const selectedHookId = normalizeText(normalizedCurrent.selectedHookId);
  if (!selectedHookId) {
    throw new Error("Select a hook before approving the video brief.");
  }

  const selectedHookSet = resolveSelectedHookSet(
    normalizedCurrent,
    angle,
    selectedHookId,
  );
  const persistedBrief = normalizedCurrent.selectedVideoBrief
    ? validateVideoBrief(
        normalizedCurrent,
        angle,
        selectedHookSet,
        normalizedCurrent.selectedVideoBrief,
      )
    : buildPersistedVideoBrief(
        normalizedCurrent,
        angle,
        selectedHookSet,
        null,
      );

  const state = await updateOpportunity(opportunityId, (opportunity) => ({
    ...opportunity,
    founderSelectionStatus: "approved",
    selectedAngleId: angle.id,
    selectedHookId,
    selectedVideoBrief: persistedBrief,
    generationState: null,
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_VIDEO_BRIEF_APPROVED_FOR_GENERATION" as const,
      actor: "operator",
      summary: `Approved a video brief draft for content opportunity "${current.title}".`,
      metadata: {
        videoBriefId: persistedBrief.id,
        angleId: angle.id,
        hookId: selectedHookId,
        founderSelectionStatus: "approved",
        builderApproval: true,
      },
    },
  ]);

  return state;
}

export async function approveContentOpportunityVideoBriefForGeneration(
  opportunityId: string,
) {
  const timestamp = new Date().toISOString();
  const approvedBy = "founder";
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  const { brief, generationState: currentGenerationState } = getGenerationContext(
    normalizedCurrent,
  );

  const state = await updateOpportunity(opportunityId, (opportunity) => ({
    ...opportunity,
    generationState: {
      ...currentGenerationState,
      videoBriefApprovedAt: timestamp,
      videoBriefApprovedBy: approvedBy,
      factoryLifecycle: createDraftVideoFactoryLifecycle({
        videoBriefId: brief.id,
        createdAt: timestamp,
      }),
      performanceSignals: appendPerformanceSignals(currentGenerationState.performanceSignals, [
        buildBriefApprovedPerformanceSignal({
          opportunityId: normalizedCurrent.opportunityId,
          videoBriefId: brief.id,
          createdAt: timestamp,
          metadata: buildPerformanceSignalMetadata({
            opportunity: normalizedCurrent,
            videoBriefId: brief.id,
            extra: {
              approvedBy,
            },
          }),
        }),
      ]),
    },
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_VIDEO_BRIEF_APPROVED_FOR_GENERATION" as const,
      actor: "operator",
      summary: `Approved video brief for generation on content opportunity "${current.title}".`,
      metadata: {
        approvedBy,
        videoBriefId: brief.id,
      },
    },
  ]);

  return state;
}

export async function generateContentOpportunityVideo(input: {
  opportunityId: string;
  provider?: RenderProvider;
  preTriageConcern?: RenderJob["preTriageConcern"];
  allowDailyCapOverride?: boolean;
}): Promise<ContentOpportunityVideoGenerationActionResult> {
  const state = await runContentOpportunityVideoGeneration({
    opportunityId: input.opportunityId,
    provider: input.provider,
    isRegenerate: false,
    preTriageConcern: input.preTriageConcern ?? null,
    allowDailyCapOverride: input.allowDailyCapOverride ?? false,
    mode: "enqueue_only",
  });

  return buildQueuedGenerationActionResult(state, input.opportunityId);
}

export async function regenerateContentOpportunityVideo(input: {
  opportunityId: string;
  provider?: RenderProvider;
  regenerationReason?: RenderJob["regenerationReason"];
  regenerationReasonCodes?: FactoryReviewReasonCode[];
  regenerationNotes?: string;
  allowDailyCapOverride?: boolean;
}): Promise<ContentOpportunityVideoGenerationActionResult> {
  const state = await runContentOpportunityVideoGeneration({
    opportunityId: input.opportunityId,
    provider: input.provider,
    isRegenerate: true,
    regenerationReason: input.regenerationReason ?? null,
    regenerationReasonCodes: input.regenerationReasonCodes ?? [],
    regenerationNotes: input.regenerationNotes ?? null,
    allowDailyCapOverride: input.allowDailyCapOverride ?? false,
    mode: "enqueue_only",
  });

  return buildQueuedGenerationActionResult(state, input.opportunityId);
}

export async function runQueuedContentOpportunityVideoGeneration(input: {
  opportunityId: string;
}) {
  return runContentOpportunityVideoGeneration({
    opportunityId: input.opportunityId,
    isRegenerate: false,
    mode: "run_active",
  });
}

export async function reviewContentOpportunityRenderedAsset(input: {
  opportunityId: string;
  status: "accepted" | "rejected";
  reviewNotes?: string;
  rejectionReason?: string;
  structuredReasons?: FactoryReviewReasonCode[];
}) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === input.opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  if (
    !normalizedCurrent.generationState?.renderedAsset ||
    !normalizedCurrent.generationState.assetReview
  ) {
    throw new Error("A rendered asset must exist before review can be updated.");
  }

  if (normalizedCurrent.generationState.assetReview.status !== "pending_review") {
    throw new Error("Only assets still pending review can be accepted or rejected.");
  }

  const nextReviewNotes = normalizeText(input.reviewNotes);
  const nextRejectionReason =
    input.status === "rejected" ? normalizeText(input.rejectionReason) : null;
  const nextStructuredReasons = normalizeFactoryReviewReasonCodes(
    input.structuredReasons,
  );
  const videoBriefId = normalizedCurrent.selectedVideoBrief?.id ?? null;
  const currentDefaultsSnapshot =
    normalizedCurrent.generationState.renderJob?.productionDefaultsSnapshot ??
    normalizedCurrent.generationState.renderJob?.compiledProductionPlan?.defaultsSnapshot ??
    null;
  const currentTrustAssessment =
    normalizedCurrent.generationState.renderJob?.compiledProductionPlan?.trustAssessment ??
    null;
  const performanceSignal =
    input.status === "accepted"
      ? buildAssetAcceptedPerformanceSignal({
          opportunityId: normalizedCurrent.opportunityId,
          videoBriefId,
          renderedAssetId: normalizedCurrent.generationState.renderedAsset.id,
          createdAt: timestamp,
          metadata: buildPerformanceSignalMetadata({
            opportunity: normalizedCurrent,
            videoBriefId,
            provider: normalizedCurrent.generationState.renderJob?.provider ?? null,
            renderVersion: normalizedCurrent.generationState.renderJob?.renderVersion ?? null,
            defaultsProfileId: currentDefaultsSnapshot?.id ?? null,
            voiceId: currentDefaultsSnapshot?.voiceId ?? null,
            aspectRatio: currentDefaultsSnapshot?.aspectRatio ?? null,
            resolution: currentDefaultsSnapshot?.resolution ?? null,
            trustStatus: currentTrustAssessment?.status ?? null,
            trustAdjusted: currentTrustAssessment?.adjusted ?? null,
            extra: {
            hasReviewNotes: Boolean(nextReviewNotes),
            structuredReasonCount: nextStructuredReasons.length,
            structuredReasons:
              nextStructuredReasons.length > 0
                ? nextStructuredReasons.join(",")
                : null,
            },
          }),
        })
      : buildAssetRejectedPerformanceSignal({
          opportunityId: normalizedCurrent.opportunityId,
          videoBriefId,
          renderedAssetId: normalizedCurrent.generationState.renderedAsset.id,
          createdAt: timestamp,
          metadata: buildPerformanceSignalMetadata({
            opportunity: normalizedCurrent,
            videoBriefId,
            provider: normalizedCurrent.generationState.renderJob?.provider ?? null,
            renderVersion: normalizedCurrent.generationState.renderJob?.renderVersion ?? null,
            defaultsProfileId: currentDefaultsSnapshot?.id ?? null,
            voiceId: currentDefaultsSnapshot?.voiceId ?? null,
            aspectRatio: currentDefaultsSnapshot?.aspectRatio ?? null,
            resolution: currentDefaultsSnapshot?.resolution ?? null,
            trustStatus: currentTrustAssessment?.status ?? null,
            trustAdjusted: currentTrustAssessment?.adjusted ?? null,
            extra: {
            hasReviewNotes: Boolean(nextReviewNotes),
            hasRejectionReason: Boolean(nextRejectionReason),
            structuredReasonCount: nextStructuredReasons.length,
            structuredReasons:
              nextStructuredReasons.length > 0
                ? nextStructuredReasons.join(",")
                : null,
            },
          }),
        });
  const state = await updateOpportunity(input.opportunityId, (opportunity) => ({
    ...opportunity,
    generationState: {
      ...contentOpportunityGenerationStateSchema.parse(opportunity.generationState ?? {}),
      factoryLifecycle: normalizedCurrent.generationState?.factoryLifecycle
        ? transitionVideoFactoryLifecycle(
            normalizedCurrent.generationState.factoryLifecycle,
            input.status,
            {
              timestamp,
              provider: normalizedCurrent.generationState.renderJob?.provider ?? null,
              renderVersion: normalizedCurrent.generationState.renderJob?.renderVersion ?? null,
            },
          )
        : null,
      runLedger: normalizedCurrent.generationState?.factoryLifecycle
        ? updateFactoryRunLedgerOutcome(
            normalizedCurrent.generationState.runLedger,
            {
              renderJobId: normalizedCurrent.generationState.renderJob?.id ?? null,
              renderedAssetId:
                normalizedCurrent.generationState.renderedAsset?.id ?? null,
              lifecycle: transitionVideoFactoryLifecycle(
                normalizedCurrent.generationState.factoryLifecycle,
                input.status,
                {
                  timestamp,
                  provider: normalizedCurrent.generationState.renderJob?.provider ?? null,
                  renderVersion:
                    normalizedCurrent.generationState.renderJob?.renderVersion ?? null,
                },
              ),
              decisionStructuredReasons: nextStructuredReasons,
              decisionNotes: nextReviewNotes,
            },
          )
        : normalizedCurrent.generationState?.runLedger ?? [],
      comparisonRecords: normalizedCurrent.generationState?.renderJob
        ? updateFactoryComparisonDecision(
            normalizedCurrent.generationState.comparisonRecords,
            {
              comparisonRenderJobId:
                normalizedCurrent.generationState.renderJob.id,
              outcome: input.status,
              structuredReasons: nextStructuredReasons,
              notes: nextReviewNotes,
              updatedAt: timestamp,
            },
          )
        : normalizedCurrent.generationState?.comparisonRecords ?? [],
      assetReview: {
        ...normalizedCurrent.generationState!.assetReview!,
        status: input.status,
        reviewedAt: timestamp,
        structuredReasons: nextStructuredReasons,
        reviewNotes: nextReviewNotes,
        rejectionReason: nextRejectionReason,
      },
      performanceSignals: appendPerformanceSignals(
        normalizedCurrent.generationState!.performanceSignals,
        [performanceSignal],
      ),
    },
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_ASSET_REVIEW_UPDATED" as const,
      actor: "operator",
      summary: `Updated render review for content opportunity "${current.title}".`,
      metadata: {
        reviewStatus: input.status,
        hasReviewNotes: Boolean(nextReviewNotes),
        hasRejectionReason: Boolean(nextRejectionReason),
        structuredReasons:
          nextStructuredReasons.length > 0
            ? nextStructuredReasons.join(",")
            : null,
      },
    },
  ]);

  const acceptedVideoBriefId =
    normalizedCurrent.selectedVideoBrief?.id ??
    normalizedCurrent.generationState.renderJob?.compiledProductionPlan?.videoBriefId ??
    normalizedCurrent.generationState.factoryLifecycle?.videoBriefId ??
    null;
  const acceptedRenderJobId = normalizedCurrent.generationState.renderJob?.id ?? null;

  if (
    input.status === "accepted" &&
    acceptedVideoBriefId &&
    acceptedRenderJobId
  ) {
    await ensureFactoryPublishOutcomePlaceholder({
      opportunityId: normalizedCurrent.opportunityId,
      videoBriefId: acceptedVideoBriefId,
      factoryJobId:
        normalizedCurrent.generationState.factoryLifecycle?.factoryJobId ?? null,
      renderJobId: acceptedRenderJobId,
      renderedAssetId: normalizedCurrent.generationState.renderedAsset.id,
      assetReviewId: normalizedCurrent.generationState.assetReview?.id ?? null,
      createdAt: timestamp,
    });
  }

  await syncVideoFactoryLanguageMemoryFromReview({
    opportunity: normalizePersistedOpportunity(
      state.opportunities.find((item) => item.opportunityId === input.opportunityId) ??
        current,
    ),
    reviewOutcome: input.status,
    reviewedAt: timestamp,
  });
  await upsertLearningRecord({
    learningRecordId: buildLearningRecordId({
      inputSignature: buildContentOpportunityLearningSignature({
        opportunity: normalizedCurrent,
        actionType: normalizedCurrent.generationState.renderJob?.regenerationReason
          ? "auto_regenerate_video_factory"
          : "auto_run_video_factory",
        provider: normalizedCurrent.generationState.renderJob?.provider ?? null,
        format: normalizedCurrent.selectedVideoBrief?.format ?? null,
      }),
      stage: "operator_review",
      sourceId: normalizedCurrent.generationState.renderedAsset.id,
    }),
    inputSignature: buildContentOpportunityLearningSignature({
      opportunity: normalizedCurrent,
      actionType: normalizedCurrent.generationState.renderJob?.regenerationReason
        ? "auto_regenerate_video_factory"
        : "auto_run_video_factory",
      provider: normalizedCurrent.generationState.renderJob?.provider ?? null,
      format: normalizedCurrent.selectedVideoBrief?.format ?? null,
    }),
    outcome: input.status === "accepted" ? "success" : "rejected",
    retries:
      normalizedCurrent.generationState.latestRetryState?.retryCount ??
      normalizedCurrent.generationState.renderJob?.retryState?.retryCount ??
      0,
    cost:
      normalizedCurrent.generationState.latestActualCost?.actualCostUsd ??
      normalizedCurrent.generationState.latestCostEstimate?.estimatedTotalUsd ??
      0,
    timestamp,
    inputType: "video_factory",
    stage: "operator_review",
    actionType: normalizedCurrent.generationState.renderJob?.regenerationReason
      ? "auto_regenerate_video_factory"
      : "auto_run_video_factory",
    sourceId: normalizedCurrent.generationState.renderedAsset.id,
    platform: normalizedCurrent.recommendedPlatforms[0] ?? null,
    provider: normalizedCurrent.generationState.renderJob?.provider ?? null,
    abTestConfigId:
      normalizedCurrent.generationState.renderJob?.abTest?.configId ?? null,
    abTestDimension:
      normalizedCurrent.generationState.renderJob?.abTest?.dimension ?? null,
    abTestVariant:
      normalizedCurrent.generationState.renderJob?.abTest?.variant ?? null,
    ...buildContentOpportunityLearningMetadata({
      opportunity: normalizedCurrent,
      hook: normalizedCurrent.selectedVideoBrief?.hook ?? null,
    }),
  });

  return state;
}

export async function discardContentOpportunityRenderedAsset(
  input: {
    opportunityId: string;
    reviewNotes?: string;
    structuredReasons?: FactoryReviewReasonCode[];
  },
) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find(
    (item) => item.opportunityId === input.opportunityId,
  );
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  const renderedAsset = normalizedCurrent.generationState?.renderedAsset;
  if (!renderedAsset) {
    throw new Error("A rendered asset must exist before it can be discarded.");
  }

  if (normalizedCurrent.generationState?.assetReview?.status === "discarded") {
    throw new Error("The current rendered asset has already been discarded.");
  }

  const nextAssetReview =
    normalizedCurrent.generationState?.assetReview ??
    createPendingAssetReview({
      renderedAssetId: renderedAsset.id,
    });
  const nextReviewNotes = normalizeText(input.reviewNotes);
  const nextStructuredReasons = normalizeFactoryReviewReasonCodes(
    input.structuredReasons,
  );
  const performanceSignal = buildAssetDiscardedPerformanceSignal({
    opportunityId: normalizedCurrent.opportunityId,
    videoBriefId: normalizedCurrent.selectedVideoBrief?.id ?? null,
    renderedAssetId: renderedAsset.id,
    createdAt: timestamp,
    metadata: buildPerformanceSignalMetadata({
      opportunity: normalizedCurrent,
      videoBriefId: normalizedCurrent.selectedVideoBrief?.id ?? null,
      provider: normalizedCurrent.generationState?.renderJob?.provider ?? null,
      renderVersion: normalizedCurrent.generationState?.renderJob?.renderVersion ?? null,
      defaultsProfileId:
        normalizedCurrent.generationState?.renderJob?.productionDefaultsSnapshot?.id ??
        normalizedCurrent.generationState?.renderJob?.compiledProductionPlan?.defaultsSnapshot.id ??
        null,
      voiceId:
        normalizedCurrent.generationState?.renderJob?.productionDefaultsSnapshot?.voiceId ??
        normalizedCurrent.generationState?.renderJob?.compiledProductionPlan?.defaultsSnapshot.voiceId ??
        null,
      aspectRatio:
        normalizedCurrent.generationState?.renderJob?.productionDefaultsSnapshot?.aspectRatio ??
        normalizedCurrent.generationState?.renderJob?.compiledProductionPlan?.defaultsSnapshot.aspectRatio ??
        null,
      resolution:
        normalizedCurrent.generationState?.renderJob?.productionDefaultsSnapshot?.resolution ??
        normalizedCurrent.generationState?.renderJob?.compiledProductionPlan?.defaultsSnapshot.resolution ??
        null,
      trustStatus:
        normalizedCurrent.generationState?.renderJob?.compiledProductionPlan?.trustAssessment.status ??
        null,
      trustAdjusted:
        normalizedCurrent.generationState?.renderJob?.compiledProductionPlan?.trustAssessment.adjusted ??
        null,
      extra: {
        renderJobId: normalizedCurrent.generationState?.renderJob?.id ?? null,
        hasReviewNotes: Boolean(nextReviewNotes),
        structuredReasonCount: nextStructuredReasons.length,
        structuredReasons:
          nextStructuredReasons.length > 0
            ? nextStructuredReasons.join(",")
            : null,
      },
    }),
  });

  const state = await updateOpportunity(input.opportunityId, (opportunity) => ({
    ...opportunity,
    generationState: {
      ...contentOpportunityGenerationStateSchema.parse(opportunity.generationState ?? {}),
      factoryLifecycle: normalizedCurrent.generationState?.factoryLifecycle
        ? transitionVideoFactoryLifecycle(
            normalizedCurrent.generationState.factoryLifecycle,
            "discarded",
            {
              timestamp,
              provider: normalizedCurrent.generationState?.renderJob?.provider ?? null,
              renderVersion: normalizedCurrent.generationState?.renderJob?.renderVersion ?? null,
            },
          )
        : null,
      runLedger: normalizedCurrent.generationState?.factoryLifecycle
        ? updateFactoryRunLedgerOutcome(
            normalizedCurrent.generationState.runLedger,
            {
              renderJobId: normalizedCurrent.generationState?.renderJob?.id ?? null,
              renderedAssetId: renderedAsset.id,
              lifecycle: transitionVideoFactoryLifecycle(
                normalizedCurrent.generationState.factoryLifecycle,
                "discarded",
                {
                  timestamp,
                  provider: normalizedCurrent.generationState?.renderJob?.provider ?? null,
                  renderVersion:
                    normalizedCurrent.generationState?.renderJob?.renderVersion ?? null,
                },
              ),
              decisionStructuredReasons: nextStructuredReasons,
              decisionNotes: nextReviewNotes,
            },
          )
        : normalizedCurrent.generationState?.runLedger ?? [],
      comparisonRecords: normalizedCurrent.generationState?.renderJob
        ? updateFactoryComparisonDecision(
            normalizedCurrent.generationState.comparisonRecords,
            {
              comparisonRenderJobId:
                normalizedCurrent.generationState.renderJob.id,
              outcome: "discarded",
              structuredReasons: nextStructuredReasons,
              notes: nextReviewNotes,
              updatedAt: timestamp,
            },
          )
        : normalizedCurrent.generationState?.comparisonRecords ?? [],
      assetReview: {
        ...nextAssetReview,
        status: "discarded" as const,
        reviewedAt: timestamp,
        structuredReasons: nextStructuredReasons,
        reviewNotes: nextReviewNotes,
        rejectionReason: null,
      },
      performanceSignals: appendPerformanceSignals(
        normalizedCurrent.generationState?.performanceSignals ?? [],
        [performanceSignal],
      ),
    },
    updatedAt: timestamp,
  }));
  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_ASSET_DISCARDED" as const,
      actor: "operator",
      summary: `Discarded rendered asset for content opportunity "${current.title}".`,
      metadata: {
        renderedAssetId: renderedAsset.id,
        renderJobId: normalizedCurrent.generationState?.renderJob?.id ?? null,
        hasReviewNotes: Boolean(nextReviewNotes),
        structuredReasons:
          nextStructuredReasons.length > 0
            ? nextStructuredReasons.join(",")
            : null,
      },
    },
  ]);

  await syncVideoFactoryLanguageMemoryFromReview({
    opportunity: normalizePersistedOpportunity(
      state.opportunities.find((item) => item.opportunityId === input.opportunityId) ??
        current,
    ),
    reviewOutcome: "discarded",
    reviewedAt: timestamp,
  });

  return state;
}

export async function updateContentOpportunityThumbnail(input: {
  opportunityId: string;
  action: "override" | "reset_generated";
  thumbnailUrl?: string | null;
}) {
  const timestamp = new Date().toISOString();
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === input.opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  const generationState = normalizedCurrent.generationState;
  const renderedAsset = generationState?.renderedAsset ?? null;
  if (!generationState || !renderedAsset) {
    throw new Error("A rendered asset must exist before its thumbnail can be updated.");
  }

  const normalizedThumbnailUrl = normalizeText(input.thumbnailUrl);
  if (input.action === "override" && !normalizedThumbnailUrl) {
    throw new Error("Thumbnail URL is required for a manual override.");
  }

  const currentRenderJobId = generationState.renderJob?.id ?? null;
  const currentRenderedAssetId = renderedAsset.id;
  const matchingAttempt =
    generationState.attemptLineage.find((attempt) => {
      if (currentRenderJobId && attempt.renderJobId === currentRenderJobId) {
        return true;
      }

      return attempt.renderedAssetId === currentRenderedAssetId;
    }) ??
    generationState.attemptLineage.at(-1) ??
    null;
  const existingGeneratedThumbnailArtifact =
    matchingAttempt?.thumbnailArtifact?.providerId === "manual-override"
      ? null
      : matchingAttempt?.thumbnailArtifact ?? null;
  const generatedThumbnailUrl =
    existingGeneratedThumbnailArtifact?.storage?.url ??
    existingGeneratedThumbnailArtifact?.imageUrl ??
    matchingAttempt?.composedVideoArtifact?.thumbnailUrl ??
    null;
  const nextThumbnailUrl =
    input.action === "override" ? normalizedThumbnailUrl : generatedThumbnailUrl;

  if (!nextThumbnailUrl) {
    throw new Error("No generated thumbnail is available to restore.");
  }

  const nextAttemptLineage = generationState.attemptLineage.map((attempt) => {
    const matchesCurrentAttempt =
      (currentRenderJobId && attempt.renderJobId === currentRenderJobId) ||
      attempt.renderedAssetId === currentRenderedAssetId;

    if (!matchesCurrentAttempt) {
      return attempt;
    }

    const existingThumbnailArtifact = attempt.thumbnailArtifact;
    return videoFactoryAttemptLineageSchema.parse({
      ...attempt,
      thumbnailArtifact: {
        artifactId:
          existingThumbnailArtifact?.artifactId ??
          `${attempt.renderJobId ?? attempt.attemptId}:artifact:thumbnail-image:manual-override`,
        artifactType: "thumbnail_image",
        renderJobId:
          attempt.renderJobId ?? generationState.renderJob?.id ?? renderedAsset.renderJobId,
        renderVersion:
          attempt.renderVersion ?? generationState.renderJob?.renderVersion ?? null,
        providerId:
          input.action === "override"
            ? "manual-override"
            : existingGeneratedThumbnailArtifact?.providerId ??
              attempt.composedVideoArtifact?.providerId ??
              "ffmpeg",
        imageUrl: nextThumbnailUrl,
        storage:
          input.action === "override"
            ? null
            : existingGeneratedThumbnailArtifact?.storage ?? null,
        createdAt: timestamp,
      },
    });
  });

  const state = await updateOpportunity(input.opportunityId, (opportunity) => ({
    ...opportunity,
    generationState: contentOpportunityGenerationStateSchema.parse({
      ...opportunity.generationState,
      attemptLineage: nextAttemptLineage,
      renderedAsset: renderedAssetSchema.parse({
        ...renderedAsset,
        thumbnailUrl: nextThumbnailUrl,
      }),
    }),
    updatedAt: timestamp,
  }));
  const updatedOpportunity = state.opportunities.find(
    (item) => item.opportunityId === input.opportunityId,
  );

  if (updatedOpportunity?.generationState?.renderedAsset) {
    await upsertVideoFactoryThumbnailSpec(
      buildVideoFactoryThumbnailSpec({
        opportunityId: updatedOpportunity.opportunityId,
        renderJobId: updatedOpportunity.generationState.renderJob?.id ?? null,
        renderedAssetId: updatedOpportunity.generationState.renderedAsset.id,
        source:
          input.action === "override" ? "manual_override" : "generated",
        imageUrl: nextThumbnailUrl,
        generatedImageUrl: generatedThumbnailUrl,
        providerId:
          input.action === "override"
            ? "manual-override"
            : existingGeneratedThumbnailArtifact?.providerId ??
              matchingAttempt?.composedVideoArtifact?.providerId ??
              "ffmpeg",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
  }

  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_ASSET_REVIEW_UPDATED" as const,
      actor: "operator",
      summary:
        input.action === "override"
          ? `Overrode thumbnail for content opportunity "${current.title}".`
          : `Reset thumbnail to generated output for content opportunity "${current.title}".`,
      metadata: {
        renderedAssetId: renderedAsset.id,
        renderJobId: generationState.renderJob?.id ?? null,
        thumbnailUrl: nextThumbnailUrl,
        thumbnailAction: input.action,
      },
    },
  ]);

  return state;
}

export async function exportContentOpportunityProductionPackage(
  opportunityId: string,
): Promise<ProductionPackage> {
  const store = await readPersistedStore();
  const current = store.opportunities.find((item) => item.opportunityId === opportunityId);
  if (!current) {
    throw new Error("Content opportunity not found.");
  }

  const normalizedCurrent = normalizePersistedOpportunity(current);
  const { brief } = getGenerationContext(normalizedCurrent, {
    requireBriefApproval: true,
  });
  const publishOutcome = normalizedCurrent.generationState?.renderedAsset
    ? await getFactoryPublishOutcome(
        normalizedCurrent.generationState.renderedAsset.id,
      )
    : null;
  const productionPackage = buildProductionPackage({
    opportunity: normalizedCurrent,
    publishOutcome,
  });
  if (normalizedCurrent.generationState?.renderedAsset?.thumbnailUrl) {
    const matchingAttempt =
      normalizedCurrent.generationState?.attemptLineage.find(
        (attempt) =>
          attempt.renderedAssetId ===
          normalizedCurrent.generationState?.renderedAsset?.id,
      ) ??
      normalizedCurrent.generationState?.attemptLineage.at(-1) ??
      null;
    await upsertVideoFactoryThumbnailSpec(
      buildVideoFactoryThumbnailSpec({
        opportunityId: normalizedCurrent.opportunityId,
        renderJobId: normalizedCurrent.generationState?.renderJob?.id ?? null,
        renderedAssetId:
          normalizedCurrent.generationState?.renderedAsset?.id ?? null,
        source:
          matchingAttempt?.thumbnailArtifact?.providerId === "manual-override"
            ? "manual_override"
            : "generated",
        imageUrl: normalizedCurrent.generationState.renderedAsset.thumbnailUrl,
        generatedImageUrl:
          matchingAttempt?.composedVideoArtifact?.thumbnailUrl ?? null,
        providerId:
          matchingAttempt?.thumbnailArtifact?.providerId ??
          matchingAttempt?.composedVideoArtifact?.providerId ??
          "ffmpeg",
        createdAt:
          matchingAttempt?.thumbnailArtifact?.createdAt ??
          productionPackage.createdAt,
        updatedAt: productionPackage.createdAt,
      }),
    );
  }
  await syncPhaseEArtifactsForProductionPackage({
    opportunity: normalizedCurrent,
    productionPackage,
  });

  await appendAuditEventsSafe([
    {
      signalId: current.signalId,
      eventType: "CONTENT_OPPORTUNITY_PRODUCTION_PACKAGE_EXPORTED" as const,
      actor: "operator",
      summary: `Exported production package for content opportunity "${current.title}".`,
      metadata: {
        videoBriefId: brief.id,
        hasRenderedAsset: Boolean(normalizedCurrent.generationState?.renderedAsset),
      },
    },
  ]);

  return productionPackage;
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
    activeCampaignIds: weeklyPlan.activeCampaignIds,
    campaignsExist: strategy.campaigns.some((campaign) => campaign.status === "active"),
  });
}

