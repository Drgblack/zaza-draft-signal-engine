import { z } from "zod";

import { VIDEO_FACTORY_EXECUTION_STAGES } from "./video-factory-lineage";
import { FACTORY_RUN_TERMINAL_OUTCOMES } from "./video-factory-run-ledger";
import { FACTORY_REVIEW_REASON_CODES } from "./video-factory-review-reasons";

export const providerBenchmarkReasonSummarySchema = z.object({
  reasonCode: z.enum(FACTORY_REVIEW_REASON_CODES),
  count: z.number().int().nonnegative(),
});

export const providerBenchmarkSummarySchema = z.object({
  provider: z.string().trim().min(1),
  stage: z.enum(VIDEO_FACTORY_EXECUTION_STAGES),
  runCount: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  retryRate: z.number().min(0).max(1),
  averageLatencyMs: z.number().nonnegative().nullable(),
  averageEstimatedCostUsd: z.number().nonnegative().nullable(),
  averageActualCostUsd: z.number().nonnegative().nullable(),
  acceptanceRate: z.number().min(0).max(1),
  rejectionRate: z.number().min(0).max(1),
  discardRate: z.number().min(0).max(1),
  failureRate: z.number().min(0).max(1),
  rejectionDiscardReasonsSummary: z
    .array(providerBenchmarkReasonSummarySchema)
    .default([]),
});

export const providerBenchmarkCollectionSchema = z.object({
  generatedAt: z.string().trim().min(1),
  summaries: z.array(providerBenchmarkSummarySchema).default([]),
});

export type ProviderBenchmarkSummary = z.infer<
  typeof providerBenchmarkSummarySchema
>;
export type ProviderBenchmarkCollection = z.infer<
  typeof providerBenchmarkCollectionSchema
>;

type BenchmarkStage = (typeof VIDEO_FACTORY_EXECUTION_STAGES)[number];
type BenchmarkOutcome = (typeof FACTORY_RUN_TERMINAL_OUTCOMES)[number];
type BenchmarkReasonCode = (typeof FACTORY_REVIEW_REASON_CODES)[number];

type MinimalRetryState = {
  retryCount?: number | null;
  retryStage?: string | null;
} | null;

type MinimalProviderExecution = {
  stage: BenchmarkStage;
  providerId: string;
  startedAt: string;
  completedAt?: string | null;
  retryState?: MinimalRetryState;
};

type MinimalAttemptLineage = {
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
  retryState?: MinimalRetryState;
  providerExecutions: MinimalProviderExecution[];
};

type MinimalRunLedgerEntry = {
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
  retryState?: MinimalRetryState;
  decisionStructuredReasons?: BenchmarkReasonCode[];
  terminalOutcome: BenchmarkOutcome;
  failureStage?: string | null;
};

type MinimalOpportunity = {
  generationState?: {
    runLedger: MinimalRunLedgerEntry[];
    attemptLineage: MinimalAttemptLineage[];
  } | null;
};

type BenchmarkAccumulator = {
  provider: string;
  stage: BenchmarkStage;
  runCount: number;
  successCount: number;
  retryCount: number;
  acceptedCount: number;
  rejectedCount: number;
  discardedCount: number;
  failedCount: number;
  latencyValuesMs: number[];
  estimatedCostValuesUsd: number[];
  actualCostValuesUsd: number[];
  reasonCounts: Map<BenchmarkReasonCode, number>;
};

function roundRate(value: number) {
  return Math.round(value * 10000) / 10000;
}

function roundNullableAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round((sum / values.length) * 10000) / 10000;
}

function buildAccumulatorKey(provider: string, stage: BenchmarkStage) {
  return `${stage}:${provider}`;
}

function getAccumulator(
  store: Map<string, BenchmarkAccumulator>,
  provider: string,
  stage: BenchmarkStage,
) {
  const key = buildAccumulatorKey(provider, stage);
  const existing = store.get(key);
  if (existing) {
    return existing;
  }

  const created: BenchmarkAccumulator = {
    provider,
    stage,
    runCount: 0,
    successCount: 0,
    retryCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    discardedCount: 0,
    failedCount: 0,
    latencyValuesMs: [],
    estimatedCostValuesUsd: [],
    actualCostValuesUsd: [],
    reasonCounts: new Map<BenchmarkReasonCode, number>(),
  };
  store.set(key, created);
  return created;
}

function getEstimatedCostForStage(
  stage: BenchmarkStage,
  ledgerEntry: MinimalRunLedgerEntry,
  attemptLineage: MinimalAttemptLineage | null,
) {
  const source = attemptLineage?.costEstimate ?? ledgerEntry.estimatedCost ?? null;
  if (!source) {
    return null;
  }

  switch (stage) {
    case "narration":
      return source.narrationCostUsd;
    case "visuals":
      return source.visualsCostUsd;
    case "captions":
      return source.transcriptionCostUsd;
    case "composition":
      return source.compositionCostUsd;
  }
}

function getActualCostForStage(
  stage: BenchmarkStage,
  ledgerEntry: MinimalRunLedgerEntry,
  attemptLineage: MinimalAttemptLineage | null,
) {
  const source = attemptLineage?.actualCost ?? ledgerEntry.actualCost ?? null;
  if (!source) {
    return null;
  }

  switch (stage) {
    case "narration":
      return source.narrationActualUsd;
    case "visuals":
      return source.visualsActualUsd;
    case "captions":
      return source.transcriptActualUsd;
    case "composition":
      return source.compositionActualUsd;
  }
}

function getProvidersForStage(
  stage: BenchmarkStage,
  ledgerEntry: MinimalRunLedgerEntry,
) {
  switch (stage) {
    case "narration":
      return ledgerEntry.providerSet.narrationProvider
        ? [ledgerEntry.providerSet.narrationProvider]
        : [];
    case "visuals":
      return Array.from(new Set(ledgerEntry.providerSet.visualProviders ?? []));
    case "captions":
      return ledgerEntry.providerSet.captionProvider
        ? [ledgerEntry.providerSet.captionProvider]
        : [];
    case "composition":
      return ledgerEntry.providerSet.compositionProvider
        ? [ledgerEntry.providerSet.compositionProvider]
        : [];
  }
}

function getGroupedExecutionStats(
  attemptLineage: MinimalAttemptLineage | null,
  stage: BenchmarkStage,
  provider: string,
) {
  const matchingExecutions =
    attemptLineage?.providerExecutions.filter(
      (execution) =>
        execution.stage === stage && execution.providerId === provider,
    ) ?? [];

  const latencyValuesMs = matchingExecutions
    .map((execution) => {
      if (!execution.completedAt) {
        return null;
      }

      const startedAt = new Date(execution.startedAt).getTime();
      const completedAt = new Date(execution.completedAt).getTime();
      const durationMs = completedAt - startedAt;
      return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null;
    })
    .filter((value): value is number => value !== null);

  const retryUsed = matchingExecutions.some(
    (execution) => (execution.retryState?.retryCount ?? 0) > 0,
  );

  return {
    averageLatencyMs: roundNullableAverage(latencyValuesMs),
    retryUsed,
  };
}

function recordReasonSummaries(
  accumulator: BenchmarkAccumulator,
  reasonCodes: BenchmarkReasonCode[] | undefined,
) {
  for (const reasonCode of reasonCodes ?? []) {
    accumulator.reasonCounts.set(
      reasonCode,
      (accumulator.reasonCounts.get(reasonCode) ?? 0) + 1,
    );
  }
}

function buildReasonSummaryRows(reasonCounts: Map<BenchmarkReasonCode, number>) {
  return Array.from(reasonCounts.entries())
    .map(([reasonCode, count]) =>
      providerBenchmarkReasonSummarySchema.parse({
        reasonCode,
        count,
      }),
    )
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.reasonCode.localeCompare(right.reasonCode),
    );
}

function attemptLineageByRenderJobId(opportunity: MinimalOpportunity) {
  return new Map(
    (opportunity.generationState?.attemptLineage ?? [])
      .filter((attempt): attempt is MinimalAttemptLineage & { renderJobId: string } =>
        typeof attempt.renderJobId === "string" && attempt.renderJobId.trim().length > 0,
      )
      .map((attempt) => [attempt.renderJobId, attempt] as const),
  );
}

export function buildFactoryProviderBenchmarkCollection(input: {
  opportunities: MinimalOpportunity[];
  generatedAt?: string;
}): ProviderBenchmarkCollection {
  const accumulators = new Map<string, BenchmarkAccumulator>();

  for (const opportunity of input.opportunities) {
    const runLedger = opportunity.generationState?.runLedger ?? [];
    const attemptByRenderJobId = attemptLineageByRenderJobId(opportunity);

    for (const ledgerEntry of runLedger) {
      const attemptLineage =
        ledgerEntry.renderJobId
          ? attemptByRenderJobId.get(ledgerEntry.renderJobId) ?? null
          : null;

      for (const stage of VIDEO_FACTORY_EXECUTION_STAGES) {
        const providers = getProvidersForStage(stage, ledgerEntry);

        for (const provider of providers) {
          const accumulator = getAccumulator(accumulators, provider, stage);
          const executionStats = getGroupedExecutionStats(
            attemptLineage,
            stage,
            provider,
          );
          const estimatedCost = getEstimatedCostForStage(
            stage,
            ledgerEntry,
            attemptLineage,
          );
          const actualCost = getActualCostForStage(
            stage,
            ledgerEntry,
            attemptLineage,
          );
          const retryUsed =
            executionStats.retryUsed ||
            (ledgerEntry.failureStage ===
              (stage === "narration"
                ? "generating_narration"
                : stage === "visuals"
                  ? "generating_visuals"
                  : stage === "captions"
                    ? "generating_captions"
                    : "composing") &&
              (ledgerEntry.retryState?.retryCount ?? 0) > 0) ||
            (attemptLineage?.retryState?.retryStage ===
              (stage === "narration"
                ? "generating_narration"
                : stage === "visuals"
                  ? "generating_visuals"
                  : stage === "captions"
                    ? "generating_captions"
                    : "composing") &&
              (attemptLineage.retryState?.retryCount ?? 0) > 0);
          const stageFailed =
            ledgerEntry.terminalOutcome === "failed" &&
            ledgerEntry.failureStage ===
              (stage === "narration"
                ? "generating_narration"
                : stage === "visuals"
                  ? "generating_visuals"
                  : stage === "captions"
                    ? "generating_captions"
                    : "composing");

          accumulator.runCount += 1;
          if (!stageFailed) {
            accumulator.successCount += 1;
          }
          if (retryUsed) {
            accumulator.retryCount += 1;
          }
          if (executionStats.averageLatencyMs !== null) {
            accumulator.latencyValuesMs.push(executionStats.averageLatencyMs);
          }
          if (estimatedCost !== null) {
            accumulator.estimatedCostValuesUsd.push(estimatedCost);
          }
          if (actualCost !== null) {
            accumulator.actualCostValuesUsd.push(actualCost);
          }

          switch (ledgerEntry.terminalOutcome) {
            case "accepted":
              accumulator.acceptedCount += 1;
              break;
            case "rejected":
              accumulator.rejectedCount += 1;
              recordReasonSummaries(
                accumulator,
                ledgerEntry.decisionStructuredReasons,
              );
              break;
            case "discarded":
              accumulator.discardedCount += 1;
              recordReasonSummaries(
                accumulator,
                ledgerEntry.decisionStructuredReasons,
              );
              break;
            case "failed":
              accumulator.failedCount += 1;
              break;
            case "review_pending":
              break;
          }
        }
      }
    }
  }

  const summaries = Array.from(accumulators.values())
    .map((accumulator) =>
      providerBenchmarkSummarySchema.parse({
        provider: accumulator.provider,
        stage: accumulator.stage,
        runCount: accumulator.runCount,
        successRate:
          accumulator.runCount > 0
            ? roundRate(accumulator.successCount / accumulator.runCount)
            : 0,
        retryRate:
          accumulator.runCount > 0
            ? roundRate(accumulator.retryCount / accumulator.runCount)
            : 0,
        averageLatencyMs: roundNullableAverage(accumulator.latencyValuesMs),
        averageEstimatedCostUsd: roundNullableAverage(
          accumulator.estimatedCostValuesUsd,
        ),
        averageActualCostUsd: roundNullableAverage(
          accumulator.actualCostValuesUsd,
        ),
        acceptanceRate:
          accumulator.runCount > 0
            ? roundRate(accumulator.acceptedCount / accumulator.runCount)
            : 0,
        rejectionRate:
          accumulator.runCount > 0
            ? roundRate(accumulator.rejectedCount / accumulator.runCount)
            : 0,
        discardRate:
          accumulator.runCount > 0
            ? roundRate(accumulator.discardedCount / accumulator.runCount)
            : 0,
        failureRate:
          accumulator.runCount > 0
            ? roundRate(accumulator.failedCount / accumulator.runCount)
            : 0,
        rejectionDiscardReasonsSummary: buildReasonSummaryRows(
          accumulator.reasonCounts,
        ),
      }),
    )
    .sort(
      (left, right) =>
        left.stage.localeCompare(right.stage) ||
        left.provider.localeCompare(right.provider),
    );

  return providerBenchmarkCollectionSchema.parse({
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summaries,
  });
}
