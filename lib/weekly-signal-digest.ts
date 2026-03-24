import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  listContentOpportunityState,
  type ContentOpportunity,
} from "@/lib/content-opportunities";
import {
  buildFactoryProviderRunBenchmarkReport,
  providerRunBenchmarkEvidenceSchema,
  providerRunBenchmarkSummarySchema,
} from "@/lib/video-factory-provider-benchmarks";
import {
  buildFactoryRunsObservability,
  type FactoryRunObservabilityItem,
} from "@/lib/video-factory-runs";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";

const WEEKLY_SIGNAL_DIGEST_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "weekly-signal-digests.json",
);

const weeklyDigestCountSummarySchema = z.object({
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  discarded: z.number().int().nonnegative(),
  pendingReview: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

const weeklyDigestReasonSummarySchema = z.object({
  label: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
});

const weeklyDigestDefaultsVersionSummarySchema = z.object({
  defaultsVersion: z.number().int().positive(),
  runCount: z.number().int().nonnegative(),
  terminalRunCount: z.number().int().nonnegative(),
  approvalRate: z.number().min(0).max(1).nullable(),
  averageCostUsd: z.number().nonnegative().nullable(),
  providers: z.array(z.string().trim().min(1)).default([]),
  formats: z.array(z.string().trim().min(1)).default([]),
  evidence: providerRunBenchmarkEvidenceSchema,
});

export const weeklySignalDigestSchema = z.object({
  weekStartDate: z.string().trim().min(1),
  weekEndDate: z.string().trim().min(1),
  generatedAt: z.string().trim().min(1),
  signalsConsidered: z.number().int().nonnegative(),
  opportunitiesTouched: z.number().int().nonnegative(),
  videosGenerated: z.number().int().nonnegative(),
  reviewSummary: weeklyDigestCountSummarySchema,
  regenerationRate: z.number().min(0).max(1),
  averageRetries: z.number().nonnegative(),
  costPerApprovedVideoUsd: z.number().nonnegative().nullable(),
  providerComparisonSummary: z
    .array(providerRunBenchmarkSummarySchema)
    .default([]),
  defaultsVersionComparisonSummary: z
    .array(weeklyDigestDefaultsVersionSummarySchema)
    .default([]),
  topFailureReasons: z.array(weeklyDigestReasonSummarySchema).default([]),
  topTrustWarnings: z.array(weeklyDigestReasonSummarySchema).default([]),
});

const weeklySignalDigestStoreSchema = z.object({
  digestsByWeekStartDate: z.record(z.string(), weeklySignalDigestSchema).default({}),
  updatedAt: z.string().trim().nullable().default(null),
});

export type WeeklySignalDigest = z.infer<typeof weeklySignalDigestSchema>;
type WeeklySignalDigestStore = z.infer<typeof weeklySignalDigestStoreSchema>;

let inMemoryWeeklySignalDigestStore: WeeklySignalDigestStore =
  weeklySignalDigestStoreSchema.parse({
    digestsByWeekStartDate: {},
    updatedAt: null,
  });

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function formatWeekStart(date: Date): string {
  return startOfWeek(date).toISOString().slice(0, 10);
}

function formatWeekEnd(weekStartDate: string): string {
  const end = new Date(`${weekStartDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10);
}

function isDateInWeek(value: string | null | undefined, weekStartDate: string): boolean {
  if (!value) {
    return false;
  }

  const current = new Date(value).getTime();
  if (Number.isNaN(current)) {
    return false;
  }

  const start = new Date(`${weekStartDate}T00:00:00Z`).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return current >= start && current < end;
}

function normalizeLabel(value: string) {
  return value.replaceAll("_", " ");
}

function roundRate(value: number) {
  return Math.round(value * 10000) / 10000;
}

function roundAverage(value: number) {
  return Math.round(value * 10000) / 10000;
}

function roundNullableAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((total, value) => total + value, 0);
  return roundAverage(sum / values.length);
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

function buildReasonRows(
  counts: Map<string, number>,
  limit = 5,
) {
  return Array.from(counts.entries())
    .map(([label, count]) =>
      weeklyDigestReasonSummarySchema.parse({
        label,
        count,
      }),
    )
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    )
    .slice(0, limit);
}

function approvalStatus(item: FactoryRunObservabilityItem) {
  return item.reviewOutcome.status ?? item.terminalOutcome;
}

function isVideoGenerated(item: FactoryRunObservabilityItem) {
  return (
    item.artifactSummary.hasComposedVideo ||
    item.lifecycleStatus === "generated" ||
    item.lifecycleStatus === "review_pending" ||
    approvalStatus(item) === "accepted" ||
    approvalStatus(item) === "rejected" ||
    approvalStatus(item) === "discarded" ||
    approvalStatus(item) === "pending_review"
  );
}

function isOpportunityTouchedInWeek(
  opportunity: ContentOpportunity,
  weekStartDate: string,
) {
  if (
    isDateInWeek(opportunity.createdAt, weekStartDate) ||
    isDateInWeek(opportunity.updatedAt, weekStartDate)
  ) {
    return true;
  }

  const generationState = opportunity.generationState;
  if (!generationState) {
    return false;
  }

  if (
    generationState.runLedger.some((entry) =>
      isDateInWeek(entry.lastUpdatedAt, weekStartDate),
    )
  ) {
    return true;
  }

  return Boolean(
    generationState.factoryLifecycle &&
      isDateInWeek(generationState.factoryLifecycle.lastUpdatedAt, weekStartDate),
  );
}

function collectSignalCount(opportunities: ContentOpportunity[]) {
  const signalIds = new Set<string>();

  for (const opportunity of opportunities) {
    signalIds.add(opportunity.signalId);
    for (const signalId of opportunity.sourceSignalIds) {
      signalIds.add(signalId);
    }
  }

  return signalIds.size;
}

function collectFailureReasonCounts(
  opportunities: ContentOpportunity[],
  weekStartDate: string,
) {
  const counts = new Map<string, number>();

  for (const opportunity of opportunities) {
    for (const entry of opportunity.generationState?.runLedger ?? []) {
      if (!isDateInWeek(entry.lastUpdatedAt, weekStartDate)) {
        continue;
      }

      if (entry.failureStage) {
        const label = `failure stage: ${normalizeLabel(entry.failureStage)}`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }

      for (const failure of entry.qualityCheck?.failures ?? []) {
        const label = `quality: ${normalizeLabel(failure.code)}`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }

      for (const reason of entry.decisionStructuredReasons ?? []) {
        const label = `review: ${normalizeLabel(reason)}`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
  }

  return buildReasonRows(counts);
}

function collectTrustWarningCounts(
  opportunities: ContentOpportunity[],
  weekStartDate: string,
) {
  const counts = new Map<string, number>();

  for (const opportunity of opportunities) {
    const renderJob = opportunity.generationState?.renderJob;
    const compiledPlan = renderJob?.compiledProductionPlan;

    if (!compiledPlan) {
      continue;
    }

    const relevantToWeek =
      isDateInWeek(renderJob?.submittedAt, weekStartDate) ||
      isDateInWeek(renderJob?.completedAt, weekStartDate) ||
      isDateInWeek(opportunity.generationState?.factoryLifecycle?.lastUpdatedAt, weekStartDate) ||
      isDateInWeek(opportunity.updatedAt, weekStartDate);

    if (!relevantToWeek) {
      continue;
    }

    for (const reason of compiledPlan.trustAssessment.reasons) {
      const label = `compiled: ${normalizeLabel(reason)}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    for (const reason of compiledPlan.finalScriptTrustAssessment?.reasons ?? []) {
      const label = `final script: ${normalizeLabel(reason)}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    if (
      compiledPlan.trustAssessment.status !== "safe" &&
      compiledPlan.trustAssessment.reasons.length === 0
    ) {
      counts.set("compiled: adjusted trust caution", (counts.get("compiled: adjusted trust caution") ?? 0) + 1);
    }

    if (
      compiledPlan.finalScriptTrustAssessment &&
      compiledPlan.finalScriptTrustAssessment.status !== "safe" &&
      compiledPlan.finalScriptTrustAssessment.reasons.length === 0
    ) {
      counts.set(
        "final script: adjusted trust caution",
        (counts.get("final script: adjusted trust caution") ?? 0) + 1,
      );
    }
  }

  return buildReasonRows(counts);
}

function buildDefaultsVersionSummary(runs: FactoryRunObservabilityItem[]) {
  const accumulators = new Map<
    number,
    {
      defaultsVersion: number;
      runCount: number;
      terminalRunCount: number;
      approvedCount: number;
      costValuesUsd: number[];
      providers: Set<string>;
      formats: Set<string>;
    }
  >();

  for (const item of runs) {
    if (item.defaultsVersion === null) {
      continue;
    }

    const existing = accumulators.get(item.defaultsVersion);
    const accumulator =
      existing ??
      {
        defaultsVersion: item.defaultsVersion,
        runCount: 0,
        terminalRunCount: 0,
        approvedCount: 0,
        costValuesUsd: [],
        providers: new Set<string>(),
        formats: new Set<string>(),
      };

    accumulator.runCount += 1;
    if (!item.isActive && item.terminalOutcome !== null) {
      accumulator.terminalRunCount += 1;
    }
    if (approvalStatus(item) === "accepted") {
      accumulator.approvedCount += 1;
    }

    const costUsd = item.actualCostUsd ?? item.estimatedCostUsd ?? null;
    if (costUsd !== null) {
      accumulator.costValuesUsd.push(costUsd);
    }

    if (item.providerSet.renderProvider) {
      accumulator.providers.add(item.providerSet.renderProvider);
    }
    if (item.format) {
      accumulator.formats.add(item.format);
    }

    accumulators.set(item.defaultsVersion, accumulator);
  }

  return Array.from(accumulators.values())
    .map((accumulator) =>
      weeklyDigestDefaultsVersionSummarySchema.parse({
        defaultsVersion: accumulator.defaultsVersion,
        runCount: accumulator.runCount,
        terminalRunCount: accumulator.terminalRunCount,
        approvalRate:
          accumulator.terminalRunCount > 0
            ? roundRate(accumulator.approvedCount / accumulator.terminalRunCount)
            : null,
        averageCostUsd: roundNullableAverage(accumulator.costValuesUsd),
        providers: Array.from(accumulator.providers.values()).sort((left, right) =>
          left.localeCompare(right),
        ),
        formats: Array.from(accumulator.formats.values()).sort((left, right) =>
          left.localeCompare(right),
        ),
        evidence: buildEvidenceSummary(accumulator.runCount),
      }),
    )
    .sort(
      (left, right) =>
        right.runCount - left.runCount || right.defaultsVersion - left.defaultsVersion,
    );
}

function sanitizeWeeklySignalDigestStore(input: unknown): WeeklySignalDigestStore {
  const parsed = weeklySignalDigestStoreSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const fallbackInput =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const updatedAt =
    typeof (fallbackInput as { updatedAt?: unknown }).updatedAt === "string"
      ? ((fallbackInput as { updatedAt?: string }).updatedAt ?? null)
      : null;
  const digestsByWeekStartDate =
    (fallbackInput as { digestsByWeekStartDate?: unknown }).digestsByWeekStartDate;
  const sanitizedDigests: Record<string, WeeklySignalDigest> = {};

  if (
    digestsByWeekStartDate &&
    typeof digestsByWeekStartDate === "object" &&
    !Array.isArray(digestsByWeekStartDate)
  ) {
    for (const [weekStartDate, digest] of Object.entries(digestsByWeekStartDate)) {
      const parsedDigest = weeklySignalDigestSchema.safeParse(digest);
      if (!parsedDigest.success) {
        console.warn(
          `weekly-signal-digest: dropping invalid persisted digest for ${weekStartDate}.`,
          parsedDigest.error,
        );
        continue;
      }

      sanitizedDigests[weekStartDate] = parsedDigest.data;
    }
  }

  return weeklySignalDigestStoreSchema.parse({
    digestsByWeekStartDate: sanitizedDigests,
    updatedAt,
  });
}

async function readPersistedStore() {
  try {
    const raw = await readFile(WEEKLY_SIGNAL_DIGEST_STORE_PATH, "utf8");
    const parsed = sanitizeWeeklySignalDigestStore(JSON.parse(raw));
    inMemoryWeeklySignalDigestStore = parsed;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryWeeklySignalDigestStore;
    }

    console.warn(
      "weekly-signal-digest: persisted store could not be parsed, falling back to in-memory state.",
      error,
    );
    return inMemoryWeeklySignalDigestStore;
  }
}

async function writePersistedStore(store: WeeklySignalDigestStore) {
  const parsed = sanitizeWeeklySignalDigestStore(store);
  inMemoryWeeklySignalDigestStore = parsed;

  try {
    await mkdir(path.dirname(WEEKLY_SIGNAL_DIGEST_STORE_PATH), { recursive: true });
    await writeFile(
      WEEKLY_SIGNAL_DIGEST_STORE_PATH,
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("weekly-signal-digest", error);
      return;
    }

    throw error;
  }
}

export function buildWeeklySignalDigest(input: {
  opportunities: ContentOpportunity[];
  weekStartDate?: string;
  now?: Date;
  generatedAt?: string;
}): WeeklySignalDigest {
  const now = input.now ?? new Date();
  const weekStartDate = input.weekStartDate ?? formatWeekStart(now);
  const generatedAt = input.generatedAt ?? now.toISOString();
  const touchedOpportunities = input.opportunities.filter((opportunity) =>
    isOpportunityTouchedInWeek(opportunity, weekStartDate),
  );
  const observability = buildFactoryRunsObservability({
    opportunities: input.opportunities,
    generatedAt,
    now,
    lookbackDays: 3650,
  });
  const weeklyRuns = observability.items.filter(
    (item) =>
      isDateInWeek(item.updatedAt, weekStartDate) ||
      isDateInWeek(item.createdAt, weekStartDate),
  );
  const providerReport = buildFactoryProviderRunBenchmarkReport({
    runs: weeklyRuns,
    generatedAt,
  });
  const approvedRuns = weeklyRuns.filter(
    (item) => approvalStatus(item) === "accepted",
  );
  const costValuesForApprovedRuns = approvedRuns
    .map((item) => item.actualCostUsd ?? item.estimatedCostUsd ?? null)
    .filter((value): value is number => value !== null);
  const totalApprovedCost = costValuesForApprovedRuns.reduce(
    (total, value) => total + value,
    0,
  );

  return weeklySignalDigestSchema.parse({
    weekStartDate,
    weekEndDate: formatWeekEnd(weekStartDate),
    generatedAt,
    signalsConsidered: collectSignalCount(touchedOpportunities),
    opportunitiesTouched: touchedOpportunities.length,
    videosGenerated: weeklyRuns.filter((item) => isVideoGenerated(item)).length,
    reviewSummary: {
      approved: approvedRuns.length,
      rejected: weeklyRuns.filter((item) => approvalStatus(item) === "rejected").length,
      discarded: weeklyRuns.filter((item) => approvalStatus(item) === "discarded").length,
      pendingReview: weeklyRuns.filter(
        (item) =>
          approvalStatus(item) === "pending_review" ||
          item.terminalOutcome === "review_pending",
      ).length,
      failed: weeklyRuns.filter(
        (item) =>
          item.terminalOutcome === "failed" ||
          item.terminalOutcome === "failed_permanent" ||
          item.lifecycleStatus === "failed" ||
          item.lifecycleStatus === "failed_permanent",
      ).length,
    },
    regenerationRate:
      weeklyRuns.length > 0
        ? roundRate(
            weeklyRuns.filter((item) => item.attemptNumber > 1).length /
              weeklyRuns.length,
          )
        : 0,
    averageRetries:
      weeklyRuns.length > 0
        ? roundAverage(
            weeklyRuns.reduce((total, item) => total + item.retryCount, 0) /
              weeklyRuns.length,
          )
        : 0,
    costPerApprovedVideoUsd:
      approvedRuns.length > 0
        ? roundAverage(totalApprovedCost / approvedRuns.length)
        : null,
    providerComparisonSummary: providerReport.providerSummaries,
    defaultsVersionComparisonSummary: buildDefaultsVersionSummary(weeklyRuns),
    topFailureReasons: collectFailureReasonCounts(input.opportunities, weekStartDate),
    topTrustWarnings: collectTrustWarningCounts(input.opportunities, weekStartDate),
  });
}

export async function getStoredWeeklySignalDigest(weekStartDate: string) {
  const store = await readPersistedStore();
  return store.digestsByWeekStartDate[weekStartDate] ?? null;
}

export async function listWeeklySignalDigests() {
  const store = await readPersistedStore();

  return Object.values(store.digestsByWeekStartDate).sort((left, right) =>
    right.weekStartDate.localeCompare(left.weekStartDate),
  );
}

export async function generateWeeklySignalDigest(input?: {
  weekStartDate?: string;
  now?: Date;
  generatedAt?: string;
  opportunities?: ContentOpportunity[];
}) {
  const opportunities =
    input?.opportunities ?? (await listContentOpportunityState()).opportunities;
  const digest = buildWeeklySignalDigest({
    opportunities,
    weekStartDate: input?.weekStartDate,
    now: input?.now,
    generatedAt: input?.generatedAt,
  });
  const store = await readPersistedStore();

  await writePersistedStore(
    weeklySignalDigestStoreSchema.parse({
      digestsByWeekStartDate: {
        ...store.digestsByWeekStartDate,
        [digest.weekStartDate]: digest,
      },
      updatedAt: digest.generatedAt,
    }),
  );

  return digest;
}
