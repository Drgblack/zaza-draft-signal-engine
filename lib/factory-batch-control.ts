import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import { buildContentIntelligenceFromSignal } from "@/lib/strategic-intelligence-types";

const FACTORY_BATCH_CONTROL_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "factory-batch-control.json",
);

export const BATCH_RENDER_JOB_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "queued",
  "running",
  "completed",
  "completed_with_failures",
  "cancelled",
] as const;

export const CONTENT_MIX_DIMENSIONS = [
  "contentType",
  "format",
  "audience",
  "effect",
  "cta",
  "platform",
] as const;

const distributionRecordSchema = z.record(
  z.string().trim().min(1),
  z.number().min(0).max(1),
);

const countRecordSchema = z.record(
  z.string().trim().min(1),
  z.number().int().nonnegative(),
);

export const contentMixTargetsSchema = z.object({
  contentType: distributionRecordSchema.default({}),
  format: distributionRecordSchema.default({}),
  audience: distributionRecordSchema.default({}),
  effect: distributionRecordSchema.default({}),
  cta: distributionRecordSchema.default({}),
  platform: distributionRecordSchema.default({}),
});

export const contentMixObservedSummarySchema = z.object({
  totalOpportunities: z.number().int().nonnegative(),
  contentTypeCounts: countRecordSchema.default({}),
  formatCounts: countRecordSchema.default({}),
  audienceCounts: countRecordSchema.default({}),
  effectCounts: countRecordSchema.default({}),
  ctaCounts: countRecordSchema.default({}),
  platformCounts: countRecordSchema.default({}),
  contentTypeShares: distributionRecordSchema.default({}),
  formatShares: distributionRecordSchema.default({}),
  audienceShares: distributionRecordSchema.default({}),
  effectShares: distributionRecordSchema.default({}),
  ctaShares: distributionRecordSchema.default({}),
  platformShares: distributionRecordSchema.default({}),
});

export const contentMixGapIndicatorSchema = z.object({
  dimension: z.enum(CONTENT_MIX_DIMENSIONS),
  key: z.string().trim().min(1),
  targetShare: z.number().min(0).max(1),
  observedShare: z.number().min(0).max(1),
  delta: z.number().min(-1).max(1),
  direction: z.enum(["underrepresented", "overrepresented", "aligned"]),
  severity: z.enum(["aligned", "warning", "soft_block"]),
});

export const contentMixTargetSchema = z.object({
  targetId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  targets: contentMixTargetsSchema,
  observedMix: contentMixObservedSummarySchema,
  gaps: z.array(contentMixGapIndicatorSchema).default([]),
});

export const batchRenderSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  withApprovedBrief: z.number().int().nonnegative(),
  withRenderJob: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  discarded: z.number().int().nonnegative(),
  pendingReview: z.number().int().nonnegative(),
  totalEstimatedCostUsd: z.number().min(0),
  totalActualCostUsd: z.number().min(0),
});

export const batchExecutionPolicySchema = z.object({
  priority: z.enum(["score-desc", "fifo"]).default("score-desc"),
  throttle: z.number().int().positive().max(3).default(3),
  requireFounderApproval: z.boolean().default(true),
  maxBatchSize: z.number().int().positive().max(10).default(10),
  contentMixTargetId: z.string().trim().nullable().default(null),
  executionPath: z
    .enum(["video_factory", "campaigns", "connect", "hold", "review"])
    .nullable()
    .default("video_factory"),
  notes: z.string().trim().nullable().default(null),
});

const DEFAULT_BATCH_EXECUTION_POLICY = batchExecutionPolicySchema.parse({});

export const batchRenderJobSchema = z.object({
  batchId: z.string().trim().min(1),
  opportunityIds: z.array(z.string().trim().min(1)).min(1).max(10),
  briefIds: z.array(z.string().trim().min(1)).default([]),
  jobIds: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(BATCH_RENDER_JOB_STATUSES),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  completedAt: z.string().trim().nullable().default(null),
  totalEstimatedCostUsd: z.number().min(0),
  summary: batchRenderSummarySchema,
  executionPolicy: batchExecutionPolicySchema.default(DEFAULT_BATCH_EXECUTION_POLICY),
});

const factoryBatchControlStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  batches: z.array(batchRenderJobSchema).default([]),
  mixTargets: z.array(contentMixTargetSchema).default([]),
});

export type ContentMixTargets = z.infer<typeof contentMixTargetsSchema>;
export type ContentMixObservedSummary = z.infer<typeof contentMixObservedSummarySchema>;
export type ContentMixGapIndicator = z.infer<typeof contentMixGapIndicatorSchema>;
export type ContentMixTarget = z.infer<typeof contentMixTargetSchema>;
export type BatchExecutionPolicy = z.infer<typeof batchExecutionPolicySchema>;
export type BatchRenderJob = z.infer<typeof batchRenderJobSchema>;

type FactoryBatchControlStore = z.infer<typeof factoryBatchControlStoreSchema>;
type MixDimension = (typeof CONTENT_MIX_DIMENSIONS)[number];

function normalizeStore(store: FactoryBatchControlStore): FactoryBatchControlStore {
  return factoryBatchControlStoreSchema.parse({
    updatedAt: store.updatedAt,
    batches: [...store.batches].sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.createdAt.localeCompare(left.createdAt),
    ),
    mixTargets: [...store.mixTargets].sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.name.localeCompare(right.name),
    ),
  });
}

function buildDefaultStore(): FactoryBatchControlStore {
  return factoryBatchControlStoreSchema.parse({
    updatedAt: null,
    batches: [],
    mixTargets: [],
  });
}

function readPersistedStoreSync(): FactoryBatchControlStore {
  try {
    const raw = readFileSync(FACTORY_BATCH_CONTROL_STORE_PATH, "utf8");
    return normalizeStore(factoryBatchControlStoreSchema.parse(JSON.parse(raw)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return buildDefaultStore();
    }

    throw error;
  }
}

async function writePersistedStore(store: FactoryBatchControlStore): Promise<void> {
  await mkdir(path.dirname(FACTORY_BATCH_CONTROL_STORE_PATH), { recursive: true });
  await writeFile(
    FACTORY_BATCH_CONTROL_STORE_PATH,
    `${JSON.stringify(normalizeStore(store), null, 2)}\n`,
    "utf8",
  );
}

function roundMetric(value: number) {
  return Math.round(value * 10000) / 10000;
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function deriveAudienceBucket(opportunity: ContentOpportunity): string {
  const source = normalizeText(
    [
      opportunity.selectedVideoBrief?.goal,
      opportunity.memoryContext.audienceCue,
      opportunity.recommendedAngle,
      opportunity.primaryPainPoint,
    ].join(" "),
  )?.toLowerCase();

  if (!source) {
    return "teachers-general";
  }

  if (source.includes("parent")) {
    return "parents-and-teachers";
  }

  if (source.includes("leader") || source.includes("admin")) {
    return "school-leaders";
  }

  if (source.includes("new teacher") || source.includes("early career")) {
    return "new-teachers";
  }

  return "teachers-general";
}

function incrementCount(map: Map<string, number>, key: string | null | undefined) {
  const normalized = normalizeText(key);
  if (!normalized) {
    return;
  }

  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function countsToRecord(counts: Map<string, number>) {
  return Object.fromEntries([...counts.entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

function sharesFromCounts(counts: Map<string, number>, total: number) {
  if (total <= 0) {
    return {};
  }

  return Object.fromEntries(
    [...counts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, count]) => [key, roundMetric(count / total)]),
  );
}

function valuesForDimension(
  opportunity: ContentOpportunity,
  dimension: MixDimension,
): string[] {
  const contentIntelligence = buildContentIntelligenceFromSignal(opportunity);

  switch (dimension) {
    case "contentType":
      return [
        normalizeText(opportunity.selectedVideoBrief?.contentType) ?? "unknown",
      ];
    case "format":
      return [
        contentIntelligence.recommendedFormat ||
          opportunity.recommendedFormat ||
          "unknown",
      ];
    case "audience":
      return [deriveAudienceBucket(opportunity)];
    case "effect":
      return [
        normalizeText(contentIntelligence.intendedViewerEffect) ?? "unknown",
      ];
    case "cta":
      return [
        normalizeText(contentIntelligence.suggestedCta) ?? "unknown",
      ];
    case "platform":
      return opportunity.recommendedPlatforms.length > 0
        ? opportunity.recommendedPlatforms
        : ["unknown"];
    default:
      return [];
  }
}

function sharesForDimension(
  observedMix: ContentMixObservedSummary,
  dimension: MixDimension,
): Record<string, number> {
  switch (dimension) {
    case "contentType":
      return observedMix.contentTypeShares;
    case "format":
      return observedMix.formatShares;
    case "audience":
      return observedMix.audienceShares;
    case "effect":
      return observedMix.effectShares;
    case "cta":
      return observedMix.ctaShares;
    case "platform":
      return observedMix.platformShares;
  }
}

function targetsForDimension(
  targets: ContentMixTargets,
  dimension: MixDimension,
): Record<string, number> {
  return targets[dimension];
}

export function buildObservedContentMixSummary(input: {
  opportunities: ContentOpportunity[];
}): ContentMixObservedSummary {
  const counts: Record<MixDimension, Map<string, number>> = {
    contentType: new Map<string, number>(),
    format: new Map<string, number>(),
    audience: new Map<string, number>(),
    effect: new Map<string, number>(),
    cta: new Map<string, number>(),
    platform: new Map<string, number>(),
  };

  for (const opportunity of input.opportunities) {
    for (const dimension of CONTENT_MIX_DIMENSIONS) {
      for (const value of valuesForDimension(opportunity, dimension)) {
        incrementCount(counts[dimension], value);
      }
    }
  }

  const totalOpportunities = input.opportunities.length;

  return contentMixObservedSummarySchema.parse({
    totalOpportunities,
    contentTypeCounts: countsToRecord(counts.contentType),
    formatCounts: countsToRecord(counts.format),
    audienceCounts: countsToRecord(counts.audience),
    effectCounts: countsToRecord(counts.effect),
    ctaCounts: countsToRecord(counts.cta),
    platformCounts: countsToRecord(counts.platform),
    contentTypeShares: sharesFromCounts(counts.contentType, totalOpportunities),
    formatShares: sharesFromCounts(counts.format, totalOpportunities),
    audienceShares: sharesFromCounts(counts.audience, totalOpportunities),
    effectShares: sharesFromCounts(counts.effect, totalOpportunities),
    ctaShares: sharesFromCounts(counts.cta, totalOpportunities),
    platformShares: sharesFromCounts(counts.platform, totalOpportunities),
  });
}

export function buildContentMixGapIndicators(input: {
  targets: ContentMixTargets;
  observedMix: ContentMixObservedSummary;
}): ContentMixGapIndicator[] {
  const gaps: ContentMixGapIndicator[] = [];

  for (const dimension of CONTENT_MIX_DIMENSIONS) {
    const targetShares = targetsForDimension(input.targets, dimension);
    const observedShares = sharesForDimension(input.observedMix, dimension);
    const keys = new Set([...Object.keys(targetShares), ...Object.keys(observedShares)]);

    for (const key of keys) {
      const targetShare = roundMetric(targetShares[key] ?? 0);
      const observedShare = roundMetric(observedShares[key] ?? 0);
      const delta = roundMetric(observedShare - targetShare);
      const absoluteDelta = Math.abs(delta);
      const direction =
        absoluteDelta <= 0.05
          ? "aligned"
          : delta < 0
            ? "underrepresented"
            : "overrepresented";
      const severity =
        absoluteDelta > 0.3
          ? "soft_block"
          : absoluteDelta > 0.15
            ? "warning"
            : "aligned";

      gaps.push(
        contentMixGapIndicatorSchema.parse({
          dimension,
          key,
          targetShare,
          observedShare,
          delta,
          direction,
          severity,
        }),
      );
    }
  }

  return gaps.sort(
    (left, right) =>
      Math.abs(right.delta) - Math.abs(left.delta) ||
      left.dimension.localeCompare(right.dimension) ||
      left.key.localeCompare(right.key),
  );
}

export function buildContentMixTarget(input: {
  targetId: string;
  name: string;
  targets: Partial<ContentMixTargets>;
  opportunities: ContentOpportunity[];
  status?: "draft" | "active" | "archived";
  createdAt?: string;
  updatedAt?: string;
}): ContentMixTarget {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const targets = contentMixTargetsSchema.parse(input.targets);
  const observedMix = buildObservedContentMixSummary({
    opportunities: input.opportunities,
  });

  return contentMixTargetSchema.parse({
    targetId: input.targetId,
    name: input.name,
    status: input.status ?? "draft",
    createdAt,
    updatedAt,
    targets,
    observedMix,
    gaps: buildContentMixGapIndicators({
      targets,
      observedMix,
    }),
  });
}

export function buildBatchRenderJob(input: {
  batchId: string;
  opportunities: ContentOpportunity[];
  status?: (typeof BATCH_RENDER_JOB_STATUSES)[number];
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  executionPolicy?: Partial<BatchExecutionPolicy>;
}): BatchRenderJob {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const opportunityIds = input.opportunities.map((opportunity) => opportunity.opportunityId);
  const briefIds = input.opportunities
    .map((opportunity) => opportunity.selectedVideoBrief?.id ?? null)
    .filter((briefId): briefId is string => Boolean(briefId));
  const jobIds = input.opportunities
    .map((opportunity) => opportunity.generationState?.renderJob?.id ?? null)
    .filter((jobId): jobId is string => Boolean(jobId));

  const summary = batchRenderSummarySchema.parse(
    input.opportunities.reduce(
      (accumulator, opportunity) => {
        const generationState = opportunity.generationState;
        const lifecycleStatus = generationState?.factoryLifecycle?.status ?? null;
        const reviewStatus = generationState?.assetReview?.status ?? null;
        const runLedgerTerminalOutcome = generationState?.runLedger.at(-1)?.terminalOutcome ?? null;

        accumulator.total += 1;
        if (opportunity.selectedVideoBrief) {
          accumulator.withApprovedBrief += 1;
        }
        if (generationState?.renderJob) {
          accumulator.withRenderJob += 1;
        }
        if (
          lifecycleStatus === "generated" ||
          lifecycleStatus === "review_pending" ||
          lifecycleStatus === "accepted" ||
          lifecycleStatus === "rejected" ||
          lifecycleStatus === "discarded"
        ) {
          accumulator.completed += 1;
        }
        if (lifecycleStatus === "failed" || lifecycleStatus === "failed_permanent") {
          accumulator.failed += 1;
        }
        if (reviewStatus === "accepted" || runLedgerTerminalOutcome === "accepted") {
          accumulator.approved += 1;
        }
        if (reviewStatus === "rejected" || runLedgerTerminalOutcome === "rejected") {
          accumulator.rejected += 1;
        }
        if (reviewStatus === "discarded" || runLedgerTerminalOutcome === "discarded") {
          accumulator.discarded += 1;
        }
        if (
          reviewStatus === "pending_review" ||
          lifecycleStatus === "review_pending" ||
          runLedgerTerminalOutcome === "review_pending"
        ) {
          accumulator.pendingReview += 1;
        }

        accumulator.totalEstimatedCostUsd +=
          generationState?.latestCostEstimate?.estimatedTotalUsd ?? 0;
        accumulator.totalActualCostUsd +=
          generationState?.latestActualCost?.actualCostUsd ?? 0;

        return accumulator;
      },
      {
        total: 0,
        withApprovedBrief: 0,
        withRenderJob: 0,
        completed: 0,
        failed: 0,
        approved: 0,
        rejected: 0,
        discarded: 0,
        pendingReview: 0,
        totalEstimatedCostUsd: 0,
        totalActualCostUsd: 0,
      },
    ),
  );

  return batchRenderJobSchema.parse({
    batchId: input.batchId,
    opportunityIds,
    briefIds,
    jobIds,
    status: input.status ?? "draft",
    createdAt,
    updatedAt,
    completedAt: input.completedAt ?? null,
    totalEstimatedCostUsd: roundMetric(summary.totalEstimatedCostUsd),
    summary: {
      ...summary,
      totalEstimatedCostUsd: roundMetric(summary.totalEstimatedCostUsd),
      totalActualCostUsd: roundMetric(summary.totalActualCostUsd),
    },
    executionPolicy: batchExecutionPolicySchema.parse({
      ...DEFAULT_BATCH_EXECUTION_POLICY,
      ...(input.executionPolicy ?? {}),
    }),
  });
}

export function listBatchRenderJobs(): BatchRenderJob[] {
  return readPersistedStoreSync().batches;
}

export function listContentMixTargets(): ContentMixTarget[] {
  return readPersistedStoreSync().mixTargets;
}

export function getBatchRenderJob(batchId: string): BatchRenderJob | null {
  return listBatchRenderJobs().find((batch) => batch.batchId === batchId) ?? null;
}

export function getContentMixTarget(targetId: string): ContentMixTarget | null {
  return listContentMixTargets().find((target) => target.targetId === targetId) ?? null;
}

export async function upsertBatchRenderJob(batch: BatchRenderJob): Promise<BatchRenderJob> {
  const store = readPersistedStoreSync();
  const nextBatch = batchRenderJobSchema.parse(batch);

  await writePersistedStore({
    updatedAt: nextBatch.updatedAt,
    batches: [
      nextBatch,
      ...store.batches.filter((item) => item.batchId !== nextBatch.batchId),
    ],
    mixTargets: store.mixTargets,
  });

  return nextBatch;
}

export async function upsertContentMixTarget(
  target: ContentMixTarget,
): Promise<ContentMixTarget> {
  const store = readPersistedStoreSync();
  const nextTarget = contentMixTargetSchema.parse(target);

  await writePersistedStore({
    updatedAt: nextTarget.updatedAt,
    batches: store.batches,
    mixTargets: [
      nextTarget,
      ...store.mixTargets.filter((item) => item.targetId !== nextTarget.targetId),
    ],
  });

  return nextTarget;
}
