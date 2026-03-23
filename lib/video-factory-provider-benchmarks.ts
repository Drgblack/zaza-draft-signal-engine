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

const PROVIDER_RUN_BENCHMARK_EVIDENCE_LEVELS = [
  "low_sample",
  "directional",
  "usable",
] as const;

export const providerRunBenchmarkEvidenceSchema = z.object({
  level: z.enum(PROVIDER_RUN_BENCHMARK_EVIDENCE_LEVELS),
  label: z.string().trim().min(1),
});

export const providerRunBenchmarkSummarySchema = z.object({
  provider: z.string().trim().min(1),
  runCount: z.number().int().nonnegative(),
  terminalRunCount: z.number().int().nonnegative(),
  approvalRate: z.number().min(0).max(1).nullable(),
  regenerationRate: z.number().min(0).max(1),
  averageRetries: z.number().nonnegative(),
  averageCostUsd: z.number().nonnegative().nullable(),
  averageTimeToTerminalMs: z.number().nonnegative().nullable(),
  defaultsVersions: z.array(z.number().int().positive()).default([]),
  formats: z.array(z.string().trim().min(1)).default([]),
  trustStatuses: z.array(z.string().trim().min(1)).default([]),
  adjustedCount: z.number().int().nonnegative(),
  evidence: providerRunBenchmarkEvidenceSchema,
});

export const providerRunBenchmarkGroupSchema = z.object({
  groupKey: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  defaultsVersion: z.number().int().positive().nullable(),
  format: z.string().trim().min(1).nullable(),
  trustStatus: z.string().trim().min(1).nullable(),
  trustAdjusted: z.boolean().nullable(),
  runCount: z.number().int().nonnegative(),
  terminalRunCount: z.number().int().nonnegative(),
  approvalRate: z.number().min(0).max(1).nullable(),
  regenerationRate: z.number().min(0).max(1),
  averageRetries: z.number().nonnegative(),
  averageCostUsd: z.number().nonnegative().nullable(),
  averageTimeToTerminalMs: z.number().nonnegative().nullable(),
  evidence: providerRunBenchmarkEvidenceSchema,
});

export const providerRunBenchmarkReportSchema = z.object({
  generatedAt: z.string().trim().min(1),
  providerSummaries: z.array(providerRunBenchmarkSummarySchema).default([]),
  comparisonGroups: z.array(providerRunBenchmarkGroupSchema).default([]),
});

export type ProviderBenchmarkSummary = z.infer<
  typeof providerBenchmarkSummarySchema
>;
export type ProviderBenchmarkCollection = z.infer<
  typeof providerBenchmarkCollectionSchema
>;
export type ProviderRunBenchmarkSummary = z.infer<
  typeof providerRunBenchmarkSummarySchema
>;
export type ProviderRunBenchmarkGroup = z.infer<
  typeof providerRunBenchmarkGroupSchema
>;
export type ProviderRunBenchmarkReport = z.infer<
  typeof providerRunBenchmarkReportSchema
>;

type BenchmarkStage = (typeof VIDEO_FACTORY_EXECUTION_STAGES)[number];
type BenchmarkOutcome = (typeof FACTORY_RUN_TERMINAL_OUTCOMES)[number];
type BenchmarkReasonCode = (typeof FACTORY_REVIEW_REASON_CODES)[number];

function isFailureOutcome(outcome: BenchmarkOutcome) {
  return outcome === "failed" || outcome === "failed_permanent";
}

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

type MinimalFactoryRunObservabilityItem = {
  attemptNumber: number;
  format: string | null;
  terminalOutcome: string | null;
  isActive: boolean;
  providerSet: {
    renderProvider: string | null;
  };
  defaultsVersion: number | null;
  trustStatus: string | null;
  trustAdjusted: boolean | null;
  retryCount: number;
  createdAt: string | null;
  updatedAt: string;
  timeline: Array<{
    status: string;
    at: string;
  }>;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  reviewOutcome: {
    status: string | null;
  };
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

type ProviderRunBenchmarkAccumulator = {
  provider: string;
  runCount: number;
  terminalRunCount: number;
  approvedCount: number;
  regenerationCount: number;
  totalRetries: number;
  costValuesUsd: number[];
  terminalDurationValuesMs: number[];
  defaultsVersions: Set<number>;
  formats: Set<string>;
  trustStatuses: Set<string>;
  adjustedCount: number;
};

type ProviderRunBenchmarkGroupAccumulator = {
  groupKey: string;
  provider: string;
  defaultsVersion: number | null;
  format: string | null;
  trustStatus: string | null;
  trustAdjusted: boolean | null;
  runCount: number;
  terminalRunCount: number;
  approvedCount: number;
  regenerationCount: number;
  totalRetries: number;
  costValuesUsd: number[];
  terminalDurationValuesMs: number[];
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

function roundAverage(value: number) {
  return Math.round(value * 10000) / 10000;
}

function buildEvidenceSummary(runCount: number) {
  if (runCount < 3) {
    return providerRunBenchmarkEvidenceSchema.parse({
      level: "low_sample",
      label: `Low sample (${runCount} run${runCount === 1 ? "" : "s"})`,
    });
  }

  if (runCount < 8) {
    return providerRunBenchmarkEvidenceSchema.parse({
      level: "directional",
      label: `Directional only (${runCount} runs)`,
    });
  }

  return providerRunBenchmarkEvidenceSchema.parse({
    level: "usable",
    label: `Usable sample (${runCount} runs)`,
  });
}

function isTerminalRun(item: MinimalFactoryRunObservabilityItem) {
  return !item.isActive && item.terminalOutcome !== null;
}

function getApprovalStatus(item: MinimalFactoryRunObservabilityItem) {
  return item.reviewOutcome.status ?? item.terminalOutcome;
}

function getRunCostUsd(item: MinimalFactoryRunObservabilityItem) {
  return item.actualCostUsd ?? item.estimatedCostUsd ?? null;
}

function getTimeToTerminalMs(item: MinimalFactoryRunObservabilityItem) {
  if (!isTerminalRun(item)) {
    return null;
  }

  const firstAt = item.timeline[0]?.at ?? item.createdAt;
  const lastAt = item.timeline.at(-1)?.at ?? item.updatedAt;

  if (!firstAt || !lastAt) {
    return null;
  }

  const firstMs = new Date(firstAt).getTime();
  const lastMs = new Date(lastAt).getTime();
  const durationMs = lastMs - firstMs;

  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null;
}

function buildAccumulatorKey(provider: string, stage: BenchmarkStage) {
  return `${stage}:${provider}`;
}

function buildProviderRunGroupKey(input: {
  provider: string;
  defaultsVersion: number | null;
  format: string | null;
  trustStatus: string | null;
  trustAdjusted: boolean | null;
}) {
  return [
    input.provider,
    input.defaultsVersion ?? "none",
    input.format ?? "none",
    input.trustStatus ?? "none",
    input.trustAdjusted === null
      ? "unknown"
      : input.trustAdjusted
        ? "adjusted"
        : "not-adjusted",
  ].join("|");
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

function getProviderRunAccumulator(
  store: Map<string, ProviderRunBenchmarkAccumulator>,
  provider: string,
) {
  const existing = store.get(provider);
  if (existing) {
    return existing;
  }

  const created: ProviderRunBenchmarkAccumulator = {
    provider,
    runCount: 0,
    terminalRunCount: 0,
    approvedCount: 0,
    regenerationCount: 0,
    totalRetries: 0,
    costValuesUsd: [],
    terminalDurationValuesMs: [],
    defaultsVersions: new Set<number>(),
    formats: new Set<string>(),
    trustStatuses: new Set<string>(),
    adjustedCount: 0,
  };
  store.set(provider, created);
  return created;
}

function getProviderRunGroupAccumulator(
  store: Map<string, ProviderRunBenchmarkGroupAccumulator>,
  input: {
    provider: string;
    defaultsVersion: number | null;
    format: string | null;
    trustStatus: string | null;
    trustAdjusted: boolean | null;
  },
) {
  const groupKey = buildProviderRunGroupKey(input);
  const existing = store.get(groupKey);
  if (existing) {
    return existing;
  }

  const created: ProviderRunBenchmarkGroupAccumulator = {
    groupKey,
    provider: input.provider,
    defaultsVersion: input.defaultsVersion,
    format: input.format,
    trustStatus: input.trustStatus,
    trustAdjusted: input.trustAdjusted,
    runCount: 0,
    terminalRunCount: 0,
    approvedCount: 0,
    regenerationCount: 0,
    totalRetries: 0,
    costValuesUsd: [],
    terminalDurationValuesMs: [],
  };
  store.set(groupKey, created);
  return created;
}

function recordProviderRunBenchmarkItem(
  accumulator: ProviderRunBenchmarkAccumulator | ProviderRunBenchmarkGroupAccumulator,
  item: MinimalFactoryRunObservabilityItem,
) {
  accumulator.runCount += 1;
  accumulator.totalRetries += item.retryCount;

  if (item.attemptNumber > 1) {
    accumulator.regenerationCount += 1;
  }

  const costUsd = getRunCostUsd(item);
  if (costUsd !== null) {
    accumulator.costValuesUsd.push(costUsd);
  }

  const timeToTerminalMs = getTimeToTerminalMs(item);
  if (timeToTerminalMs !== null) {
    accumulator.terminalDurationValuesMs.push(timeToTerminalMs);
  }

  if (isTerminalRun(item)) {
    accumulator.terminalRunCount += 1;
  }

  if (getApprovalStatus(item) === "accepted") {
    accumulator.approvedCount += 1;
  }
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
            isFailureOutcome(ledgerEntry.terminalOutcome) &&
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
            case "failed_permanent":
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

export function buildFactoryProviderRunBenchmarkReport(input: {
  runs: MinimalFactoryRunObservabilityItem[];
  generatedAt?: string;
}): ProviderRunBenchmarkReport {
  const providerAccumulators = new Map<string, ProviderRunBenchmarkAccumulator>();
  const groupAccumulators = new Map<string, ProviderRunBenchmarkGroupAccumulator>();

  for (const item of input.runs) {
    const provider = item.providerSet.renderProvider?.trim();

    if (!provider) {
      continue;
    }

    const providerAccumulator = getProviderRunAccumulator(
      providerAccumulators,
      provider,
    );
    recordProviderRunBenchmarkItem(providerAccumulator, item);

    if (item.defaultsVersion !== null) {
      providerAccumulator.defaultsVersions.add(item.defaultsVersion);
    }
    if (item.format) {
      providerAccumulator.formats.add(item.format);
    }
    if (item.trustStatus) {
      providerAccumulator.trustStatuses.add(item.trustStatus);
    }
    if (item.trustAdjusted) {
      providerAccumulator.adjustedCount += 1;
    }

    const groupAccumulator = getProviderRunGroupAccumulator(groupAccumulators, {
      provider,
      defaultsVersion: item.defaultsVersion,
      format: item.format,
      trustStatus: item.trustStatus,
      trustAdjusted: item.trustAdjusted,
    });
    recordProviderRunBenchmarkItem(groupAccumulator, item);
  }

  const providerSummaries = Array.from(providerAccumulators.values())
    .map((accumulator) =>
      providerRunBenchmarkSummarySchema.parse({
        provider: accumulator.provider,
        runCount: accumulator.runCount,
        terminalRunCount: accumulator.terminalRunCount,
        approvalRate:
          accumulator.terminalRunCount > 0
            ? roundRate(accumulator.approvedCount / accumulator.terminalRunCount)
            : null,
        regenerationRate:
          accumulator.runCount > 0
            ? roundRate(accumulator.regenerationCount / accumulator.runCount)
            : 0,
        averageRetries:
          accumulator.runCount > 0
            ? roundAverage(accumulator.totalRetries / accumulator.runCount)
            : 0,
        averageCostUsd: roundNullableAverage(accumulator.costValuesUsd),
        averageTimeToTerminalMs: roundNullableAverage(
          accumulator.terminalDurationValuesMs,
        ),
        defaultsVersions: Array.from(accumulator.defaultsVersions.values()).sort(
          (left, right) => left - right,
        ),
        formats: Array.from(accumulator.formats.values()).sort((left, right) =>
          left.localeCompare(right),
        ),
        trustStatuses: Array.from(accumulator.trustStatuses.values()).sort(
          (left, right) => left.localeCompare(right),
        ),
        adjustedCount: accumulator.adjustedCount,
        evidence: buildEvidenceSummary(accumulator.runCount),
      }),
    )
    .sort(
      (left, right) =>
        right.runCount - left.runCount ||
        right.terminalRunCount - left.terminalRunCount ||
        left.provider.localeCompare(right.provider),
    );

  const comparisonGroups = Array.from(groupAccumulators.values())
    .map((accumulator) =>
      providerRunBenchmarkGroupSchema.parse({
        groupKey: accumulator.groupKey,
        provider: accumulator.provider,
        defaultsVersion: accumulator.defaultsVersion,
        format: accumulator.format,
        trustStatus: accumulator.trustStatus,
        trustAdjusted: accumulator.trustAdjusted,
        runCount: accumulator.runCount,
        terminalRunCount: accumulator.terminalRunCount,
        approvalRate:
          accumulator.terminalRunCount > 0
            ? roundRate(accumulator.approvedCount / accumulator.terminalRunCount)
            : null,
        regenerationRate:
          accumulator.runCount > 0
            ? roundRate(accumulator.regenerationCount / accumulator.runCount)
            : 0,
        averageRetries:
          accumulator.runCount > 0
            ? roundAverage(accumulator.totalRetries / accumulator.runCount)
            : 0,
        averageCostUsd: roundNullableAverage(accumulator.costValuesUsd),
        averageTimeToTerminalMs: roundNullableAverage(
          accumulator.terminalDurationValuesMs,
        ),
        evidence: buildEvidenceSummary(accumulator.runCount),
      }),
    )
    .sort(
      (left, right) =>
        right.runCount - left.runCount ||
        left.provider.localeCompare(right.provider) ||
        (left.defaultsVersion ?? 0) - (right.defaultsVersion ?? 0) ||
        (left.format ?? "").localeCompare(right.format ?? ""),
    );

  return providerRunBenchmarkReportSchema.parse({
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    providerSummaries,
    comparisonGroups,
  });
}
