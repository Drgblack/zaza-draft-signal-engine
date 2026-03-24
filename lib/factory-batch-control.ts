import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import { buildContentIntelligenceFromSignal } from "@/lib/strategic-intelligence-types";
import { adjustAutoApproveConfidenceThreshold } from "@/lib/video-factory-selection";

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

export const AUTO_APPROVE_CONFIG_STATUSES = ["draft", "active", "archived"] as const;
export const BATCH_PRIORITY_STRATEGIES = [
  "high_score",
  "mixed",
  "exploration",
] as const;

export const CONTENT_MIX_DIMENSIONS = [
  "contentType",
  "format",
  "painPoint",
  "audience",
  "hookType",
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
  painPoint: distributionRecordSchema.default({}),
  audience: distributionRecordSchema.default({}),
  hookType: distributionRecordSchema.default({}),
  effect: distributionRecordSchema.default({}),
  cta: distributionRecordSchema.default({}),
  platform: distributionRecordSchema.default({}),
});

export const contentMixObservedSummarySchema = z.object({
  totalOpportunities: z.number().int().nonnegative(),
  contentTypeCounts: countRecordSchema.default({}),
  formatCounts: countRecordSchema.default({}),
  painPointCounts: countRecordSchema.default({}),
  audienceCounts: countRecordSchema.default({}),
  hookTypeCounts: countRecordSchema.default({}),
  effectCounts: countRecordSchema.default({}),
  ctaCounts: countRecordSchema.default({}),
  platformCounts: countRecordSchema.default({}),
  contentTypeShares: distributionRecordSchema.default({}),
  formatShares: distributionRecordSchema.default({}),
  painPointShares: distributionRecordSchema.default({}),
  audienceShares: distributionRecordSchema.default({}),
  hookTypeShares: distributionRecordSchema.default({}),
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

export const autoApproveConfigSchema = z.object({
  configId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  status: z.enum(AUTO_APPROVE_CONFIG_STATUSES).default("draft"),
  enabled: z.boolean().default(false),
  confidenceThreshold: z.number().int().min(0).max(100).default(85),
  requiresTrustPass: z.boolean().default(true),
  maxPerDay: z.number().int().positive().max(25).default(5),
  mandatoryReviewEveryN: z.number().int().positive().max(25).default(5),
  changedAt: z.string().trim().min(1),
  changedSource: z.string().trim().min(1),
  changeNote: z.string().trim().nullable().default(null),
});

export const batchAutoApproveConfigSnapshotSchema = z.object({
  configId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  status: z.enum(AUTO_APPROVE_CONFIG_STATUSES),
  enabled: z.boolean(),
  confidenceThreshold: z.number().int().min(0).max(100),
  maxPerDay: z.number().int().positive().max(25),
  mandatoryReviewEveryN: z.number().int().positive().max(25),
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

export const batchRenderResultsSummarySchema = z.object({
  selected: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  autoApproved: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  completedWithFailures: z.number().int().nonnegative(),
  lastRunAt: z.string().trim().nullable().default(null),
  notes: z.array(z.string().trim().min(1)).default([]),
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

export const batchApprovalAssessmentSchema = z.object({
  batchId: z.string().trim().min(1),
  contentMixTargetId: z.string().trim().nullable().default(null),
  requiresOverride: z.boolean(),
  hasSoftBlockGaps: z.boolean(),
  softBlockGapCount: z.number().int().nonnegative(),
  warningGapCount: z.number().int().nonnegative(),
  warnings: z.array(z.string().trim().min(1)).default([]),
});

export const autoApproveOpportunityAssessmentSchema = z.object({
  configId: z.string().trim().min(1),
  enabled: z.boolean(),
  eligible: z.boolean(),
  heldForMandatoryReview: z.boolean(),
  confidenceScore: z.number().min(0).max(100).nullable().default(null),
  reasons: z.array(z.string().trim().min(1)).default([]),
});

const DEFAULT_BATCH_EXECUTION_POLICY = batchExecutionPolicySchema.parse({});

export const batchRenderJobSchema = z.object({
  batchId: z.string().trim().min(1),
  opportunityIds: z.array(z.string().trim().min(1)).min(1).max(10),
  selectedOpportunityIds: z.array(z.string().trim().min(1)).default([]),
  targetCount: z.number().int().positive().max(25).default(1),
  priorityStrategy: z.enum(BATCH_PRIORITY_STRATEGIES).default("high_score"),
  maxCost: z.number().min(0).nullable().default(null),
  autoApproveConfig: batchAutoApproveConfigSnapshotSchema.nullable().default(null),
  briefIds: z.array(z.string().trim().min(1)).default([]),
  jobIds: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(BATCH_RENDER_JOB_STATUSES),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  completedAt: z.string().trim().nullable().default(null),
  totalEstimatedCostUsd: z.number().min(0),
  summary: batchRenderSummarySchema,
  resultsSummary: batchRenderResultsSummarySchema.default({
    selected: 0,
    attempted: 0,
    queued: 0,
    autoApproved: 0,
    skipped: 0,
    failed: 0,
    completed: 0,
    completedWithFailures: 0,
    lastRunAt: null,
    notes: [],
  }),
  executionPolicy: batchExecutionPolicySchema.default(DEFAULT_BATCH_EXECUTION_POLICY),
});

const factoryBatchControlStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  batches: z.array(batchRenderJobSchema).default([]),
  mixTargets: z.array(contentMixTargetSchema).default([]),
  autoApproveConfigs: z.array(autoApproveConfigSchema).default([]),
});

export type ContentMixTargets = z.infer<typeof contentMixTargetsSchema>;
export type ContentMixObservedSummary = z.infer<typeof contentMixObservedSummarySchema>;
export type ContentMixGapIndicator = z.infer<typeof contentMixGapIndicatorSchema>;
export type ContentMixTarget = z.infer<typeof contentMixTargetSchema>;
export type AutoApproveConfig = z.infer<typeof autoApproveConfigSchema>;
export type BatchAutoApproveConfigSnapshot = z.infer<
  typeof batchAutoApproveConfigSnapshotSchema
>;
export type BatchExecutionPolicy = z.infer<typeof batchExecutionPolicySchema>;
export type BatchRenderJob = z.infer<typeof batchRenderJobSchema>;
export type BatchRenderResultsSummary = z.infer<
  typeof batchRenderResultsSummarySchema
>;
export type BatchApprovalAssessment = z.infer<typeof batchApprovalAssessmentSchema>;
export type AutoApproveOpportunityAssessment = z.infer<
  typeof autoApproveOpportunityAssessmentSchema
>;
export type BatchPriorityStrategy = (typeof BATCH_PRIORITY_STRATEGIES)[number];

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
    autoApproveConfigs: [...store.autoApproveConfigs].sort(
      (left, right) =>
        right.changedAt.localeCompare(left.changedAt) ||
        left.name.localeCompare(right.name),
    ),
  });
}

function buildDefaultStore(): FactoryBatchControlStore {
  return factoryBatchControlStoreSchema.parse({
    updatedAt: null,
    batches: [],
    mixTargets: [],
    autoApproveConfigs: [],
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

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return roundMetric(Math.max(0, Math.min(100, value)));
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function deriveAudienceBucket(opportunity: ContentOpportunity): string {
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

export function derivePainPointBucket(opportunity: ContentOpportunity): string {
  return (
    normalizeText(opportunity.painPointCategory) ??
    normalizeText(opportunity.primaryPainPoint)?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ??
    "general-teacher-pressure"
  );
}

export function deriveHookType(opportunity: ContentOpportunity): string {
  const source = normalizeText(
    [
      opportunity.selectedVideoBrief?.hook,
      opportunity.recommendedHookDirection,
      opportunity.intendedViewerEffect,
      opportunity.recommendedAngle,
      opportunity.whyNow,
    ].join(" "),
  )?.toLowerCase();

  if (!source) {
    return "insight";
  }

  if (
    source.includes("risk") ||
    source.includes("before you") ||
    source.includes("wrong") ||
    source.includes("cost") ||
    source.includes("danger") ||
    source.includes("mistake")
  ) {
    return "risk";
  }

  if (
    source.includes("relief") ||
    source.includes("calm") ||
    source.includes("reassur") ||
    source.includes("steady") ||
    source.includes("soften")
  ) {
    return "relief";
  }

  if (
    source.includes("story") ||
    source.includes("real moment") ||
    source.includes("what happened") ||
    source.includes("scene")
  ) {
    return "story";
  }

  return "insight";
}

export function deriveCtaType(opportunity: ContentOpportunity): string {
  const source = normalizeText(
    buildContentIntelligenceFromSignal(opportunity).suggestedCta ??
      opportunity.selectedVideoBrief?.cta ??
      opportunity.suggestedCTA,
  )?.toLowerCase();

  if (!source) {
    return "awareness";
  }

  if (
    source.includes("try") ||
    source.includes("sign up") ||
    source.includes("start") ||
    source.includes("trial")
  ) {
    return "product";
  }

  if (
    source.includes("share") ||
    source.includes("comment") ||
    source.includes("reply") ||
    source.includes("save")
  ) {
    return "engagement";
  }

  if (
    source.includes("visit") ||
    source.includes("learn more") ||
    source.includes("read")
  ) {
    return "visit";
  }

  return "awareness";
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

export function getContentMixValuesForDimension(
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
    case "painPoint":
      return [derivePainPointBucket(opportunity)];
    case "audience":
      return [deriveAudienceBucket(opportunity)];
    case "hookType":
      return [deriveHookType(opportunity)];
    case "effect":
      return [
        normalizeText(contentIntelligence.intendedViewerEffect) ?? "unknown",
      ];
    case "cta":
      return [deriveCtaType(opportunity)];
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
    case "painPoint":
      return observedMix.painPointShares;
    case "audience":
      return observedMix.audienceShares;
    case "hookType":
      return observedMix.hookTypeShares;
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
    painPoint: new Map<string, number>(),
    audience: new Map<string, number>(),
    hookType: new Map<string, number>(),
    effect: new Map<string, number>(),
    cta: new Map<string, number>(),
    platform: new Map<string, number>(),
  };

  for (const opportunity of input.opportunities) {
    for (const dimension of CONTENT_MIX_DIMENSIONS) {
      for (const value of getContentMixValuesForDimension(opportunity, dimension)) {
        incrementCount(counts[dimension], value);
      }
    }
  }

  const totalOpportunities = input.opportunities.length;

  return contentMixObservedSummarySchema.parse({
    totalOpportunities,
    contentTypeCounts: countsToRecord(counts.contentType),
    formatCounts: countsToRecord(counts.format),
    painPointCounts: countsToRecord(counts.painPoint),
    audienceCounts: countsToRecord(counts.audience),
    hookTypeCounts: countsToRecord(counts.hookType),
    effectCounts: countsToRecord(counts.effect),
    ctaCounts: countsToRecord(counts.cta),
    platformCounts: countsToRecord(counts.platform),
    contentTypeShares: sharesFromCounts(counts.contentType, totalOpportunities),
    formatShares: sharesFromCounts(counts.format, totalOpportunities),
    painPointShares: sharesFromCounts(counts.painPoint, totalOpportunities),
    audienceShares: sharesFromCounts(counts.audience, totalOpportunities),
    hookTypeShares: sharesFromCounts(counts.hookType, totalOpportunities),
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

export function buildBatchAutoApproveConfigSnapshot(
  config: AutoApproveConfig | null | undefined,
): BatchAutoApproveConfigSnapshot | null {
  if (!config) {
    return null;
  }

  return batchAutoApproveConfigSnapshotSchema.parse({
    configId: config.configId,
    name: config.name,
    status: config.status,
    enabled: config.enabled,
    confidenceThreshold: config.confidenceThreshold,
    maxPerDay: config.maxPerDay,
    mandatoryReviewEveryN: config.mandatoryReviewEveryN,
  });
}

export function buildBatchRenderResultsSummary(
  input: Partial<BatchRenderResultsSummary> = {},
): BatchRenderResultsSummary {
  return batchRenderResultsSummarySchema.parse({
    selected: 0,
    attempted: 0,
    queued: 0,
    autoApproved: 0,
    skipped: 0,
    failed: 0,
    completed: 0,
    completedWithFailures: 0,
    lastRunAt: null,
    notes: [],
    ...input,
  });
}

export function deriveBatchRenderJobStatus(input: {
  currentStatus?: BatchRenderJob["status"];
  summary: BatchRenderJob["summary"];
  resultsSummary?: BatchRenderResultsSummary | null;
}): BatchRenderJob["status"] {
  const resultsSummary = input.resultsSummary ?? null;

  if (input.summary.total === 0) {
    return input.currentStatus ?? "draft";
  }

  if (resultsSummary && resultsSummary.attempted === 0) {
    return input.currentStatus ?? "draft";
  }

  if (
    input.summary.completed + input.summary.failed >= input.summary.total &&
    input.summary.withRenderJob >= input.summary.total
  ) {
    return input.summary.failed > 0 || (resultsSummary?.failed ?? 0) > 0
      ? "completed_with_failures"
      : "completed";
  }

  if (input.summary.withRenderJob > 0) {
    if (input.summary.pendingReview > 0 || input.summary.completed > 0) {
      return "running";
    }

    return "queued";
  }

  if ((resultsSummary?.queued ?? 0) > 0) {
    return "queued";
  }

  if ((resultsSummary?.failed ?? 0) > 0) {
    return "completed_with_failures";
  }

  return input.currentStatus ?? "draft";
}

export function buildBatchRenderJob(input: {
  batchId: string;
  opportunities: ContentOpportunity[];
  status?: (typeof BATCH_RENDER_JOB_STATUSES)[number];
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  targetCount?: number;
  selectedOpportunityIds?: string[];
  priorityStrategy?: BatchPriorityStrategy;
  maxCost?: number | null;
  autoApproveConfig?: AutoApproveConfig | BatchAutoApproveConfigSnapshot | null;
  resultsSummary?: Partial<BatchRenderResultsSummary>;
  executionPolicy?: Partial<BatchExecutionPolicy>;
}): BatchRenderJob {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  const opportunityIds = input.opportunities.map((opportunity) => opportunity.opportunityId);
  const selectedOpportunityIds =
    input.selectedOpportunityIds && input.selectedOpportunityIds.length > 0
      ? input.selectedOpportunityIds
      : opportunityIds;
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
  const resultsSummary = buildBatchRenderResultsSummary({
    selected: selectedOpportunityIds.length,
    ...(input.resultsSummary ?? {}),
  });
  const autoApproveConfig =
    input.autoApproveConfig && "changeNote" in input.autoApproveConfig
      ? buildBatchAutoApproveConfigSnapshot(input.autoApproveConfig)
      : batchAutoApproveConfigSnapshotSchema.nullable().parse(
          input.autoApproveConfig ?? null,
        );
  const nextStatus = deriveBatchRenderJobStatus({
    currentStatus: input.status,
    summary,
    resultsSummary,
  });

  return batchRenderJobSchema.parse({
    batchId: input.batchId,
    opportunityIds,
    selectedOpportunityIds,
    targetCount: input.targetCount ?? selectedOpportunityIds.length,
    priorityStrategy: input.priorityStrategy ?? "high_score",
    maxCost: input.maxCost ?? null,
    autoApproveConfig,
    briefIds,
    jobIds,
    status: nextStatus,
    createdAt,
    updatedAt,
    completedAt: input.completedAt ?? null,
    totalEstimatedCostUsd: roundMetric(summary.totalEstimatedCostUsd),
    summary: {
      ...summary,
      totalEstimatedCostUsd: roundMetric(summary.totalEstimatedCostUsd),
      totalActualCostUsd: roundMetric(summary.totalActualCostUsd),
    },
    resultsSummary,
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

export function listAutoApproveConfigs(): AutoApproveConfig[] {
  return readPersistedStoreSync().autoApproveConfigs;
}

export function getBatchRenderJob(batchId: string): BatchRenderJob | null {
  return listBatchRenderJobs().find((batch) => batch.batchId === batchId) ?? null;
}

export function findLinkedBatchRenderJobForOpportunity(input: {
  opportunityId: string;
  statuses?: BatchRenderJob["status"][];
}): BatchRenderJob | null {
  const eligibleStatuses = new Set<BatchRenderJob["status"]>(
    input.statuses ?? ["approved", "queued", "running", "completed", "completed_with_failures"],
  );

  return (
    listBatchRenderJobs().find(
      (batch) =>
        eligibleStatuses.has(batch.status) &&
        batch.opportunityIds.includes(input.opportunityId),
    ) ?? null
  );
}

export function getContentMixTarget(targetId: string): ContentMixTarget | null {
  return listContentMixTargets().find((target) => target.targetId === targetId) ?? null;
}

export function getAutoApproveConfig(configId: string): AutoApproveConfig | null {
  return listAutoApproveConfigs().find((config) => config.configId === configId) ?? null;
}

export function getActiveAutoApproveConfig(): AutoApproveConfig | null {
  return (
    listAutoApproveConfigs().find(
      (config) => config.status === "active" && config.enabled,
    ) ?? null
  );
}

export function buildBatchApprovalAssessment(input: {
  batch: BatchRenderJob;
  contentMixTarget?: ContentMixTarget | null;
}): BatchApprovalAssessment {
  const targetId =
    input.contentMixTarget?.targetId ??
    input.batch.executionPolicy.contentMixTargetId ??
    null;
  const gaps =
    input.contentMixTarget?.gaps.filter((gap) => gap.severity !== "aligned") ?? [];
  const softBlockGapCount = gaps.filter((gap) => gap.severity === "soft_block").length;
  const warningGapCount = gaps.filter((gap) => gap.severity === "warning").length;
  const warnings: string[] = [];

  if (softBlockGapCount > 0) {
    warnings.push(
      `${softBlockGapCount} content-mix gap${softBlockGapCount === 1 ? "" : "s"} exceed the soft-block threshold and require explicit founder override.`,
    );
  }

  if (warningGapCount > 0) {
    warnings.push(
      `${warningGapCount} content-mix gap${warningGapCount === 1 ? "" : "s"} are outside the target band.`,
    );
  }

  if (input.batch.summary.totalEstimatedCostUsd > 0) {
    warnings.push(
      `Estimated batch cost is $${input.batch.summary.totalEstimatedCostUsd.toFixed(2)} and must be founder-confirmed before execution.`,
    );
  }

  return batchApprovalAssessmentSchema.parse({
    batchId: input.batch.batchId,
    contentMixTargetId: targetId,
    requiresOverride: softBlockGapCount > 0,
    hasSoftBlockGaps: softBlockGapCount > 0,
    softBlockGapCount,
    warningGapCount,
    warnings,
  });
}

export function assessAutoApproveOpportunity(input: {
  opportunity: ContentOpportunity;
  config: AutoApproveConfig;
  autoApprovedTodayCount: number;
  totalAutoApprovedCount: number;
}): AutoApproveOpportunityAssessment {
  const reasons: string[] = [];
  const confidenceThreshold = adjustAutoApproveConfidenceThreshold({
    baseThreshold: input.config.confidenceThreshold,
    growthIntelligence: input.opportunity.growthIntelligence ?? null,
  });
  const confidenceScore = normalizePercent(
    typeof input.opportunity.confidence === "number"
      ? input.opportunity.confidence * 100
      : null,
  );
  const finalTrustScore = input.opportunity.selectedVideoBrief?.finalScriptTrustScore ?? null;
  let eligible = input.config.enabled && input.config.status === "active";
  let heldForMandatoryReview = false;

  if (!input.config.enabled || input.config.status !== "active") {
    reasons.push("Auto-approve is not active.");
    eligible = false;
  }

  if (
    confidenceScore === null ||
    confidenceScore < confidenceThreshold
  ) {
    reasons.push(
      `Confidence ${confidenceScore ?? 0} is below the ${confidenceThreshold} threshold.`,
    );
    eligible = false;
  }

  if (input.config.requiresTrustPass && typeof finalTrustScore === "number" && finalTrustScore < 70) {
    reasons.push(`Final script trust score ${finalTrustScore} did not clear the trust pass.`);
    eligible = false;
  }

  if (
    input.config.requiresTrustPass &&
    input.opportunity.selectedVideoBrief &&
    finalTrustScore === null
  ) {
    reasons.push("Final script trust has not been evaluated yet.");
    eligible = false;
  }

  if (input.autoApprovedTodayCount >= input.config.maxPerDay) {
    reasons.push(`Daily auto-approve cap of ${input.config.maxPerDay} has been reached.`);
    eligible = false;
  }

  if (
    eligible &&
    input.config.mandatoryReviewEveryN > 0 &&
    (input.totalAutoApprovedCount + 1) % input.config.mandatoryReviewEveryN === 0
  ) {
    heldForMandatoryReview = true;
    reasons.push(
      `Mandatory review rail triggered for every ${input.config.mandatoryReviewEveryN}th auto-approved brief.`,
    );
  }

  if (eligible && !heldForMandatoryReview) {
    reasons.push("Confidence and trust checks clear the current auto-approve rails.");
  }

  return autoApproveOpportunityAssessmentSchema.parse({
    configId: input.config.configId,
    enabled: input.config.enabled,
    eligible,
    heldForMandatoryReview,
    confidenceScore,
    reasons,
  });
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
    autoApproveConfigs: store.autoApproveConfigs,
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
    autoApproveConfigs: store.autoApproveConfigs,
  });

  return nextTarget;
}

export async function upsertAutoApproveConfig(
  config: AutoApproveConfig,
): Promise<AutoApproveConfig> {
  const store = readPersistedStoreSync();
  const nextConfig = autoApproveConfigSchema.parse(config);

  await writePersistedStore({
    updatedAt: nextConfig.changedAt,
    batches: store.batches,
    mixTargets: store.mixTargets,
    autoApproveConfigs: [
      nextConfig,
      ...store.autoApproveConfigs.filter(
        (item) => item.configId !== nextConfig.configId,
      ),
    ],
  });

  return nextConfig;
}

export async function approveBatchRenderJob(input: {
  batchId: string;
  overrideMixGaps?: boolean;
}): Promise<BatchRenderJob> {
  const store = readPersistedStoreSync();
  const currentBatch = store.batches.find((batch) => batch.batchId === input.batchId);

  if (!currentBatch) {
    throw new Error("Batch render job not found.");
  }

  const target =
    currentBatch.executionPolicy.contentMixTargetId
      ? store.mixTargets.find(
          (mixTarget) =>
            mixTarget.targetId === currentBatch.executionPolicy.contentMixTargetId,
        ) ?? null
      : null;
  const assessment = buildBatchApprovalAssessment({
    batch: currentBatch,
    contentMixTarget: target,
  });

  if (assessment.requiresOverride && !input.overrideMixGaps) {
    throw new Error(
      "Batch approval requires an explicit content-mix override because the current mix exceeds the soft-block threshold.",
    );
  }

  const approvedBatch = batchRenderJobSchema.parse({
    ...currentBatch,
    status: "approved",
    updatedAt: new Date().toISOString(),
  });

  await writePersistedStore({
    updatedAt: approvedBatch.updatedAt,
    batches: [
      approvedBatch,
      ...store.batches.filter((batch) => batch.batchId !== approvedBatch.batchId),
    ],
    mixTargets: store.mixTargets,
    autoApproveConfigs: store.autoApproveConfigs,
  });

  return approvedBatch;
}
