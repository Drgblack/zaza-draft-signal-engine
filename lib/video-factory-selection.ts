import { z } from "zod";

import type { CompiledProductionPlan } from "./prompt-compiler";
import { resolveCaptionProviderId } from "./providers/caption-provider";
import { resolveNarrationProviderId } from "./providers/narration-provider";
import type { GrowthIntelligence } from "./strategic-intelligence-types";
import {
  getVideoFactoryCostHardStopThresholdUsd,
  getVideoFactoryCostWarningThresholdUsd,
} from "./video-factory-cost";
import {
  buildFactoryProviderBenchmarkCollection,
  type ProviderBenchmarkSummary,
} from "./video-factory-provider-benchmarks";
import { VIDEO_FACTORY_EXECUTION_STAGES } from "./video-factory-lineage";
import type { FactoryReviewReasonCode } from "./video-factory-review-reasons";

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 3000;

const MEMORY_MIN_SIMILAR_JOB_COUNT = 3;
const MEMORY_MIN_RETRY_SAMPLE_COUNT = 4;
const MEMORY_VISUAL_ACCEPTANCE_LIFT = 0.15;
const MEMORY_VISUAL_RETRY_TOLERANCE = 0.1;
const MEMORY_VISUAL_COST_TOLERANCE_MULTIPLIER = 1.15;
const DEFAULT_AUTO_APPROVE_THRESHOLD = 85;

const VISUAL_PROVIDER_COST_RANK: Record<string, number> = {
  "kling-2": 0,
  "runway-gen4": 1,
  "veo-3": 2,
};

const VISUAL_PROVIDER_QUALITY_RANK: Record<string, number> = {
  "runway-gen4": 0,
  "veo-3": 1,
  "kling-2": 2,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export const videoFactoryExecutionPriorityBiasSchema = z.enum([
  "default",
  "expedite",
  "conservative",
]);

export const videoFactoryExecutionProviderBiasSchema = z.enum([
  "default",
  "quality_favor",
  "cost_favor",
]);

export const videoFactoryExecutionBudgetModeSchema = z.enum([
  "default",
  "invest",
  "tight",
]);

export const videoFactoryRetryPolicyReasonSchema = z.enum([
  "default",
  "memory_more_patience",
  "memory_fail_fast",
  "growth_more_patience",
  "growth_fail_fast",
]);

export const videoFactoryStageRetryPolicySchema = z.object({
  stage: z.enum(VIDEO_FACTORY_EXECUTION_STAGES),
  providerId: z.string().trim().min(1),
  maxRetries: z.number().int().min(0),
  baseDelayMs: z.number().int().min(0),
  reason: videoFactoryRetryPolicyReasonSchema,
  evidenceRunCount: z.number().int().min(0),
  note: z.string().trim().min(1),
});

export const videoFactorySelectionDecisionSchema = z.object({
  appliedAt: z.string().trim().min(1),
  similarJobCount: z.number().int().min(0),
  selectedVisualProvider: z.string().trim().min(1),
  visualProviderOrder: z.array(z.string().trim().min(1)).min(1),
  visualDecisionSource: z.enum(["default", "memory"]),
  visualDecisionNote: z.string().trim().min(1),
  queuePriority: z.enum(["normal", "high"]),
  priorityBias: videoFactoryExecutionPriorityBiasSchema,
  providerBias: videoFactoryExecutionProviderBiasSchema,
  budgetMode: videoFactoryExecutionBudgetModeSchema,
  warningThresholdMultiplier: z.number().positive(),
  hardStopThresholdMultiplier: z.number().positive(),
  autoApproveThresholdDelta: z.number().int(),
  growthDecisionNote: z.string().trim().min(1),
  retryPolicies: z.array(videoFactoryStageRetryPolicySchema).length(
    VIDEO_FACTORY_EXECUTION_STAGES.length,
  ),
});

export type VideoFactoryStageRetryPolicy = z.infer<
  typeof videoFactoryStageRetryPolicySchema
>;
export type VideoFactorySelectionDecision = z.infer<
  typeof videoFactorySelectionDecisionSchema
>;
export type VideoFactoryExecutionPriorityBias = z.infer<
  typeof videoFactoryExecutionPriorityBiasSchema
>;
export type VideoFactoryExecutionBudgetMode = z.infer<
  typeof videoFactoryExecutionBudgetModeSchema
>;

type GrowthExecutionInfluence = {
  queuePriority: "normal" | "high";
  priorityBias: VideoFactoryExecutionPriorityBias;
  providerBias: z.infer<typeof videoFactoryExecutionProviderBiasSchema>;
  retryAdjustment: -1 | 0 | 1;
  budgetMode: VideoFactoryExecutionBudgetMode;
  warningThresholdMultiplier: number;
  hardStopThresholdMultiplier: number;
  autoApproveThresholdDelta: number;
  note: string;
};

type MinimalHistoricalOpportunity = {
  selectedVideoBrief?: {
    format?: string | null;
    durationSec?: number | null;
  } | null;
  generationState?: {
    renderJob?: {
      compiledProductionPlan?: {
        trustAssessment?: {
          status?: string | null;
        } | null;
        defaultsSnapshot?: {
          aspectRatio?: string | null;
          resolution?: string | null;
        } | null;
      } | null;
    } | null;
    runLedger: Array<{
      renderJobId?: string | null;
      providerSet: {
        narrationProvider?: string | null;
        visualProviders?: string[];
        captionProvider?: string | null;
        compositionProvider?: string | null;
      };
      estimatedCost?: {
        narrationCostUsd: number;
        visualsCostUsd: number;
        transcriptionCostUsd: number;
        compositionCostUsd: number;
      } | null;
      actualCost?: {
        narrationActualUsd: number;
        visualsActualUsd: number;
        transcriptActualUsd: number;
        compositionActualUsd: number;
      } | null;
      retryState?: {
        retryCount?: number | null;
        retryStage?: string | null;
      } | null;
      decisionStructuredReasons?: FactoryReviewReasonCode[];
      terminalOutcome:
        | "review_pending"
        | "accepted"
        | "rejected"
        | "discarded"
        | "failed"
        | "failed_permanent";
      failureStage?: string | null;
    }>;
    attemptLineage: Array<{
      renderJobId?: string | null;
      costEstimate?: {
        narrationCostUsd: number;
        visualsCostUsd: number;
        transcriptionCostUsd: number;
        compositionCostUsd: number;
      } | null;
      actualCost?: {
        narrationActualUsd: number;
        visualsActualUsd: number;
        transcriptActualUsd: number;
        compositionActualUsd: number;
      } | null;
      retryState?: {
        retryCount?: number | null;
        retryStage?: string | null;
      } | null;
      providerExecutions: Array<{
        stage: (typeof VIDEO_FACTORY_EXECUTION_STAGES)[number];
        providerId: string;
        startedAt: string;
        completedAt?: string | null;
        retryState?: {
          retryCount?: number | null;
          retryStage?: string | null;
        } | null;
      }>;
    }>;
  } | null;
};

function selectedProviderIds(
  compiledProductionPlan: CompiledProductionPlan,
  selectedVisualProvider: string,
) {
  return {
    narration: resolveNarrationProviderId(
      compiledProductionPlan.defaultsSnapshot.providerFallbacks.narration[0] ?? null,
    ),
    visuals: selectedVisualProvider,
    captions: resolveCaptionProviderId(
      compiledProductionPlan.defaultsSnapshot.providerFallbacks.captions[0] ?? null,
    ),
    composition: "ffmpeg",
  } as const;
}

function buildDefaultRetryPolicy(input: {
  stage: (typeof VIDEO_FACTORY_EXECUTION_STAGES)[number];
  providerId: string;
  note?: string;
}): VideoFactoryStageRetryPolicy {
  return videoFactoryStageRetryPolicySchema.parse({
    stage: input.stage,
    providerId: input.providerId,
    maxRetries: DEFAULT_MAX_RETRIES,
    baseDelayMs: DEFAULT_BASE_DELAY_MS,
    reason: "default",
    evidenceRunCount: 0,
    note: input.note ?? "Historical evidence is too weak; keeping the default retry policy.",
  });
}

function benchmarkForStageProvider(
  summaries: ProviderBenchmarkSummary[],
  stage: (typeof VIDEO_FACTORY_EXECUTION_STAGES)[number],
  providerId: string,
) {
  return (
    summaries.find(
      (summary) => summary.stage === stage && summary.provider === providerId,
    ) ?? null
  );
}

function reorderVisualProviders(input: {
  currentOrder: string[];
  preferredProvider: string;
}) {
  const withoutPreferred = input.currentOrder.filter(
    (providerId) => providerId !== input.preferredProvider,
  );
  return [input.preferredProvider, ...withoutPreferred];
}

function rankedProviderOrder(input: {
  currentOrder: string[];
  ranking: Record<string, number>;
}) {
  return [...input.currentOrder].sort(
    (left, right) =>
      (input.ranking[left] ?? Number.MAX_SAFE_INTEGER) -
        (input.ranking[right] ?? Number.MAX_SAFE_INTEGER) ||
      input.currentOrder.indexOf(left) - input.currentOrder.indexOf(right),
  );
}

function deriveGrowthExecutionInfluence(
  growthIntelligence?: GrowthIntelligence | null,
): GrowthExecutionInfluence {
  const executionPriority = growthIntelligence?.executionPriority ?? 50;
  const strategicValue = growthIntelligence?.strategicValue ?? 50;
  const learningValue = growthIntelligence?.learningValue ?? 50;
  const riskLevel = growthIntelligence?.riskLevel ?? "medium";
  const executionPath = growthIntelligence?.executionPath ?? null;

  if (
    riskLevel === "high" ||
    executionPriority < 45 ||
    executionPath === "hold" ||
    executionPath === "review"
  ) {
    return {
      queuePriority: "normal",
      priorityBias: "conservative",
      providerBias: "cost_favor",
      retryAdjustment: -1,
      budgetMode: "tight",
      warningThresholdMultiplier: 0.85,
      hardStopThresholdMultiplier: 0.9,
      autoApproveThresholdDelta: 10,
      note: "Growth intelligence marks this run as lower-priority or higher-risk, so execution is biased toward cheaper providers, tighter spend, and faster failure.",
    };
  }

  if (
    executionPath === "video_factory" &&
    riskLevel === "low" &&
    (executionPriority >= 80 || strategicValue >= 80)
  ) {
    return {
      queuePriority: "high",
      priorityBias: "expedite",
      providerBias:
        strategicValue >= 85 || learningValue >= 75
          ? "quality_favor"
          : "default",
      retryAdjustment: learningValue >= 70 ? 1 : 0,
      budgetMode: strategicValue >= 85 ? "invest" : "default",
      warningThresholdMultiplier: strategicValue >= 85 ? 1.15 : 1,
      hardStopThresholdMultiplier: strategicValue >= 85 ? 1.2 : 1,
      autoApproveThresholdDelta: -5,
      note: "Growth intelligence marks this run as strategically important, so execution is prioritized with more patience and a slightly wider spend envelope.",
    };
  }

  if (learningValue >= 75) {
    return {
      queuePriority: executionPriority >= 70 ? "high" : "normal",
      priorityBias: executionPriority >= 70 ? "expedite" : "default",
      providerBias: "quality_favor",
      retryAdjustment: 1,
      budgetMode: "default",
      warningThresholdMultiplier: 1,
      hardStopThresholdMultiplier: 1,
      autoApproveThresholdDelta: 0,
      note: "Growth intelligence emphasizes learning value, so execution keeps quality-biased providers and allows one extra retry where evidence supports recovery.",
    };
  }

  return {
    queuePriority: executionPriority >= 75 ? "high" : "normal",
    priorityBias: executionPriority >= 75 ? "expedite" : "default",
    providerBias: "default",
    retryAdjustment: 0,
    budgetMode: "default",
    warningThresholdMultiplier: 1,
    hardStopThresholdMultiplier: 1,
    autoApproveThresholdDelta: 0,
    note: "Growth intelligence leaves execution strategy near the default path.",
  };
}

function applyGrowthProviderBias(input: {
  currentOrder: string[];
  influence: GrowthExecutionInfluence;
}) {
  if (input.influence.providerBias === "cost_favor") {
    return rankedProviderOrder({
      currentOrder: input.currentOrder,
      ranking: VISUAL_PROVIDER_COST_RANK,
    });
  }

  if (input.influence.providerBias === "quality_favor") {
    return rankedProviderOrder({
      currentOrder: input.currentOrder,
      ranking: VISUAL_PROVIDER_QUALITY_RANK,
    });
  }

  return input.currentOrder;
}

function chooseVisualProvider(input: {
  currentOrder: string[];
  summaries: ProviderBenchmarkSummary[];
  similarJobCount: number;
  growthInfluence: GrowthExecutionInfluence;
}) {
  const biasedCurrentOrder = applyGrowthProviderBias({
    currentOrder: input.currentOrder,
    influence: input.growthInfluence,
  });
  const baselineProvider = biasedCurrentOrder[0];
  if (!baselineProvider || input.similarJobCount < MEMORY_MIN_SIMILAR_JOB_COUNT) {
    return {
      selectedVisualProvider: baselineProvider ?? "runway-gen4",
      visualProviderOrder: biasedCurrentOrder,
      source: "default" as const,
      note: `${input.growthInfluence.note} Historical evidence is too thin to change the execution-biased visual provider order further.`,
    };
  }

  const baselineSummary = benchmarkForStageProvider(
    input.summaries,
    "visuals",
    baselineProvider,
  );
  if (!baselineSummary || baselineSummary.runCount < MEMORY_MIN_SIMILAR_JOB_COUNT) {
    return {
      selectedVisualProvider: baselineProvider,
      visualProviderOrder: biasedCurrentOrder,
      source: "default" as const,
      note: `${input.growthInfluence.note} The current primary visual provider lacks enough similar-job history to justify a memory-driven switch.`,
    };
  }

  const qualifyingAlternatives = biasedCurrentOrder
    .slice(1)
    .map((providerId) =>
      benchmarkForStageProvider(input.summaries, "visuals", providerId),
    )
    .filter((summary): summary is ProviderBenchmarkSummary => Boolean(summary))
    .filter(
      (summary) =>
        summary.runCount >= MEMORY_MIN_SIMILAR_JOB_COUNT &&
        summary.acceptanceRate >=
          baselineSummary.acceptanceRate + MEMORY_VISUAL_ACCEPTANCE_LIFT &&
        summary.failureRate <= baselineSummary.failureRate &&
        summary.retryRate <= baselineSummary.retryRate + MEMORY_VISUAL_RETRY_TOLERANCE &&
        (baselineSummary.averageActualCostUsd === null ||
          summary.averageActualCostUsd === null ||
          summary.averageActualCostUsd <=
            baselineSummary.averageActualCostUsd *
              MEMORY_VISUAL_COST_TOLERANCE_MULTIPLIER),
    )
    .sort(
      (left, right) =>
        right.acceptanceRate - left.acceptanceRate ||
        left.failureRate - right.failureRate ||
        (left.averageActualCostUsd ?? Number.POSITIVE_INFINITY) -
          (right.averageActualCostUsd ?? Number.POSITIVE_INFINITY),
    );

  const preferredSummary = qualifyingAlternatives[0];
  if (!preferredSummary) {
    return {
      selectedVisualProvider: baselineProvider,
      visualProviderOrder: biasedCurrentOrder,
      source: "default" as const,
      note: `${input.growthInfluence.note} No alternate visual provider has enough clearly better similar-job evidence to override the execution-biased defaults.`,
    };
  }

  return {
    selectedVisualProvider: preferredSummary.provider,
    visualProviderOrder: reorderVisualProviders({
      currentOrder: biasedCurrentOrder,
      preferredProvider: preferredSummary.provider,
    }),
    source: "memory" as const,
    note: `Promoting ${preferredSummary.provider} for visuals based on stronger similar-job acceptance with no reliability regression.`,
  };
}

function chooseRetryPolicy(input: {
  stage: (typeof VIDEO_FACTORY_EXECUTION_STAGES)[number];
  providerId: string;
  summaries: ProviderBenchmarkSummary[];
  growthInfluence: GrowthExecutionInfluence;
}): VideoFactoryStageRetryPolicy {
  const summary = benchmarkForStageProvider(
    input.summaries,
    input.stage,
    input.providerId,
  );
  const basePolicy =
    !summary || summary.runCount < MEMORY_MIN_RETRY_SAMPLE_COUNT
      ? buildDefaultRetryPolicy({
          stage: input.stage,
          providerId: input.providerId,
        })
      : summary.retryRate >= 0.35 &&
          summary.successRate >= 0.7 &&
          summary.failureRate <= 0.2
        ? videoFactoryStageRetryPolicySchema.parse({
            stage: input.stage,
            providerId: input.providerId,
            maxRetries: 3,
            baseDelayMs: 5000,
            reason: "memory_more_patience",
            evidenceRunCount: summary.runCount,
            note: `Historical ${input.stage} runs for ${input.providerId} usually recover after retries, so the retry window is widened conservatively.`,
          })
        : summary.failureRate >= 0.5 &&
            summary.successRate <= 0.5 &&
            summary.acceptanceRate <= 0.25
          ? videoFactoryStageRetryPolicySchema.parse({
              stage: input.stage,
              providerId: input.providerId,
              maxRetries: 1,
              baseDelayMs: 2000,
              reason: "memory_fail_fast",
              evidenceRunCount: summary.runCount,
              note: `Historical ${input.stage} runs for ${input.providerId} rarely recover, so retries are reduced to fail faster and avoid repeated spend.`,
            })
          : videoFactoryStageRetryPolicySchema.parse({
              ...buildDefaultRetryPolicy({
                stage: input.stage,
                providerId: input.providerId,
              }),
              evidenceRunCount: summary.runCount,
              note: `Historical ${input.stage} performance for ${input.providerId} is stable, so the default retry policy remains in place.`,
            });

  if (input.growthInfluence.retryAdjustment === 0) {
    return basePolicy;
  }

  const adjustedMaxRetries = clamp(
    basePolicy.maxRetries + input.growthInfluence.retryAdjustment,
    0,
    4,
  );
  if (adjustedMaxRetries === basePolicy.maxRetries) {
    return basePolicy;
  }

  return videoFactoryStageRetryPolicySchema.parse({
    ...basePolicy,
    maxRetries: adjustedMaxRetries,
    reason:
      input.growthInfluence.retryAdjustment > 0
        ? "growth_more_patience"
        : "growth_fail_fast",
    note:
      input.growthInfluence.retryAdjustment > 0
        ? `${basePolicy.note} Growth intelligence widens retry depth for this run's execution priority and learning value.`
        : `${basePolicy.note} Growth intelligence tightens retry depth for this run's risk and cost posture.`,
  });
}

function isSimilarHistoricalOpportunity(
  opportunity: MinimalHistoricalOpportunity,
  input: {
    compiledProductionPlan: CompiledProductionPlan;
    briefFormat: string;
    briefDurationSec: number;
  },
) {
  const renderJobPlan = opportunity.generationState?.renderJob?.compiledProductionPlan;
  const selectedVideoBrief = opportunity.selectedVideoBrief;
  if (!renderJobPlan || !selectedVideoBrief) {
    return false;
  }

  return (
    selectedVideoBrief.format === input.briefFormat &&
    selectedVideoBrief.durationSec === input.briefDurationSec &&
    renderJobPlan.trustAssessment?.status ===
      input.compiledProductionPlan.trustAssessment.status &&
    renderJobPlan.defaultsSnapshot?.aspectRatio ===
      input.compiledProductionPlan.defaultsSnapshot.aspectRatio &&
    renderJobPlan.defaultsSnapshot?.resolution ===
      input.compiledProductionPlan.defaultsSnapshot.resolution
  );
}

function similarHistoricalOpportunities(
  opportunities: MinimalHistoricalOpportunity[],
  input: {
    compiledProductionPlan: CompiledProductionPlan;
    briefFormat: string;
    briefDurationSec: number;
  },
) {
  return opportunities.filter((opportunity) =>
    isSimilarHistoricalOpportunity(opportunity, input),
  );
}

export function buildVideoFactorySelectionDecision(input: {
  compiledProductionPlan: CompiledProductionPlan;
  briefFormat: string;
  briefDurationSec: number;
  historicalOpportunities: MinimalHistoricalOpportunity[];
  appliedAt: string;
  growthIntelligence?: GrowthIntelligence | null;
}): VideoFactorySelectionDecision {
  const growthInfluence = deriveGrowthExecutionInfluence(
    input.growthIntelligence ?? null,
  );
  const similarJobs = similarHistoricalOpportunities(
    input.historicalOpportunities,
    {
      compiledProductionPlan: input.compiledProductionPlan,
      briefFormat: input.briefFormat,
      briefDurationSec: input.briefDurationSec,
    },
  );
  const benchmarks = buildFactoryProviderBenchmarkCollection({
    opportunities: similarJobs,
    generatedAt: input.appliedAt,
  });
  const visualDecision = chooseVisualProvider({
    currentOrder: input.compiledProductionPlan.defaultsSnapshot.providerFallbacks.visuals,
    summaries: benchmarks.summaries,
    similarJobCount: similarJobs.length,
    growthInfluence,
  });
  const selectedProviders = selectedProviderIds(
    input.compiledProductionPlan,
    visualDecision.selectedVisualProvider,
  );

  return videoFactorySelectionDecisionSchema.parse({
    appliedAt: input.appliedAt,
    similarJobCount: similarJobs.length,
    selectedVisualProvider: visualDecision.selectedVisualProvider,
    visualProviderOrder: visualDecision.visualProviderOrder,
    visualDecisionSource: visualDecision.source,
    visualDecisionNote: visualDecision.note,
    queuePriority: growthInfluence.queuePriority,
    priorityBias: growthInfluence.priorityBias,
    providerBias: growthInfluence.providerBias,
    budgetMode: growthInfluence.budgetMode,
    warningThresholdMultiplier: growthInfluence.warningThresholdMultiplier,
    hardStopThresholdMultiplier: growthInfluence.hardStopThresholdMultiplier,
    autoApproveThresholdDelta: growthInfluence.autoApproveThresholdDelta,
    growthDecisionNote: growthInfluence.note,
    retryPolicies: VIDEO_FACTORY_EXECUTION_STAGES.map((stage) =>
      chooseRetryPolicy({
        stage,
        providerId: selectedProviders[stage],
        summaries: benchmarks.summaries,
        growthInfluence,
      }),
    ),
  });
}

export function applyVideoFactorySelectionDecision(input: {
  compiledProductionPlan: CompiledProductionPlan;
  decision: VideoFactorySelectionDecision;
}): CompiledProductionPlan {
  return {
    ...input.compiledProductionPlan,
    defaultsSnapshot: {
      ...input.compiledProductionPlan.defaultsSnapshot,
      providerFallbacks: {
        ...input.compiledProductionPlan.defaultsSnapshot.providerFallbacks,
        visuals: input.decision.visualProviderOrder,
      },
    },
  };
}

export function retryPolicyForStage(
  decision: VideoFactorySelectionDecision | null | undefined,
  stage: (typeof VIDEO_FACTORY_EXECUTION_STAGES)[number],
) {
  return (
    decision?.retryPolicies.find((policy) => policy.stage === stage) ?? null
  );
}

export function applyBudgetControlThresholds(input: {
  decision: Pick<
    VideoFactorySelectionDecision,
    "warningThresholdMultiplier" | "hardStopThresholdMultiplier"
  > | null | undefined;
  warningThresholdUsd?: number | null;
  hardStopThresholdUsd?: number | null;
}) {
  const baseWarningThresholdUsd =
    input.warningThresholdUsd ?? getVideoFactoryCostWarningThresholdUsd();
  const baseHardStopThresholdUsd =
    input.hardStopThresholdUsd ?? getVideoFactoryCostHardStopThresholdUsd();
  return {
    warningThresholdUsd:
      typeof baseWarningThresholdUsd === "number" && input.decision
        ? Number(
            (
              baseWarningThresholdUsd * input.decision.warningThresholdMultiplier
            ).toFixed(2),
          )
        : baseWarningThresholdUsd ?? null,
    hardStopThresholdUsd:
      typeof baseHardStopThresholdUsd === "number" && input.decision
        ? Number(
            (
              baseHardStopThresholdUsd * input.decision.hardStopThresholdMultiplier
            ).toFixed(2),
          )
        : baseHardStopThresholdUsd ?? null,
  };
}

export function queuePriorityForGrowthIntelligence(
  growthIntelligence?: GrowthIntelligence | null,
) {
  return deriveGrowthExecutionInfluence(growthIntelligence).queuePriority;
}

export function adjustAutoApproveConfidenceThreshold(input: {
  baseThreshold?: number;
  growthIntelligence?: GrowthIntelligence | null;
}) {
  const influence = deriveGrowthExecutionInfluence(input.growthIntelligence ?? null);
  const baseThreshold = input.baseThreshold ?? DEFAULT_AUTO_APPROVE_THRESHOLD;
  return clamp(baseThreshold + influence.autoApproveThresholdDelta, 0, 100);
}
