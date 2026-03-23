import { z } from "zod";

import type { CompiledProductionPlan } from "./prompt-compiler";
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

export const videoFactoryRetryPolicyReasonSchema = z.enum([
  "default",
  "memory_more_patience",
  "memory_fail_fast",
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
    narration: compiledProductionPlan.defaultsSnapshot.providerFallbacks.narration[0] ?? "elevenlabs",
    visuals: selectedVisualProvider,
    captions: "assemblyai",
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

function chooseVisualProvider(input: {
  currentOrder: string[];
  summaries: ProviderBenchmarkSummary[];
  similarJobCount: number;
}) {
  const baselineProvider = input.currentOrder[0];
  if (!baselineProvider || input.similarJobCount < MEMORY_MIN_SIMILAR_JOB_COUNT) {
    return {
      selectedVisualProvider: baselineProvider ?? "runway-gen4",
      visualProviderOrder: input.currentOrder,
      source: "default" as const,
      note: "Historical evidence is too thin to change the default visual provider order.",
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
      visualProviderOrder: input.currentOrder,
      source: "default" as const,
      note: "The current primary visual provider lacks enough similar-job history to justify a switch.",
    };
  }

  const qualifyingAlternatives = input.currentOrder
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
      visualProviderOrder: input.currentOrder,
      source: "default" as const,
      note: "No alternate visual provider has enough clearly better similar-job evidence to override the defaults.",
    };
  }

  return {
    selectedVisualProvider: preferredSummary.provider,
    visualProviderOrder: reorderVisualProviders({
      currentOrder: input.currentOrder,
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
}): VideoFactoryStageRetryPolicy {
  const summary = benchmarkForStageProvider(
    input.summaries,
    input.stage,
    input.providerId,
  );
  if (!summary || summary.runCount < MEMORY_MIN_RETRY_SAMPLE_COUNT) {
    return buildDefaultRetryPolicy({
      stage: input.stage,
      providerId: input.providerId,
    });
  }

  if (
    summary.retryRate >= 0.35 &&
    summary.successRate >= 0.7 &&
    summary.failureRate <= 0.2
  ) {
    return videoFactoryStageRetryPolicySchema.parse({
      stage: input.stage,
      providerId: input.providerId,
      maxRetries: 3,
      baseDelayMs: 5000,
      reason: "memory_more_patience",
      evidenceRunCount: summary.runCount,
      note: `Historical ${input.stage} runs for ${input.providerId} usually recover after retries, so the retry window is widened conservatively.`,
    });
  }

  if (
    summary.failureRate >= 0.5 &&
    summary.successRate <= 0.5 &&
    summary.acceptanceRate <= 0.25
  ) {
    return videoFactoryStageRetryPolicySchema.parse({
      stage: input.stage,
      providerId: input.providerId,
      maxRetries: 1,
      baseDelayMs: 2000,
      reason: "memory_fail_fast",
      evidenceRunCount: summary.runCount,
      note: `Historical ${input.stage} runs for ${input.providerId} rarely recover, so retries are reduced to fail faster and avoid repeated spend.`,
    });
  }

  return videoFactoryStageRetryPolicySchema.parse({
    ...buildDefaultRetryPolicy({
      stage: input.stage,
      providerId: input.providerId,
    }),
    evidenceRunCount: summary.runCount,
    note: `Historical ${input.stage} performance for ${input.providerId} is stable, so the default retry policy remains in place.`,
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
}): VideoFactorySelectionDecision {
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
    retryPolicies: VIDEO_FACTORY_EXECUTION_STAGES.map((stage) =>
      chooseRetryPolicy({
        stage,
        providerId: selectedProviders[stage],
        summaries: benchmarks.summaries,
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
