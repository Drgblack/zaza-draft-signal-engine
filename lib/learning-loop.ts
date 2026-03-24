import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "./serverless-persistence";

const LEARNING_LOOP_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "learning-loop.json",
);

export const LEARNING_OUTCOMES = ["success", "failed", "rejected"] as const;
export const LEARNING_INPUT_TYPES = ["video_factory", "signal"] as const;
export const LEARNING_STAGES = [
  "generation",
  "operator_review",
  "engagement",
  "signal_outcome",
] as const;
export const LEARNING_PATTERN_DIMENSIONS = [
  "format",
  "hookType",
  "ctaType",
  "provider",
] as const;
export const LEARNING_AB_TEST_VARIANTS = ["A", "B"] as const;

export type LearningOutcome = (typeof LEARNING_OUTCOMES)[number];
export type LearningInputType = (typeof LEARNING_INPUT_TYPES)[number];
export type LearningStage = (typeof LEARNING_STAGES)[number];
export type LearningPatternDimension =
  (typeof LEARNING_PATTERN_DIMENSIONS)[number];
export type LearningABTestVariant =
  (typeof LEARNING_AB_TEST_VARIANTS)[number];

export type LearningRecord = {
  learningRecordId: string;
  inputSignature: string;
  outcome: "success" | "failed" | "rejected";
  retries: number;
  cost: number;
  timestamp: string;
  inputType?: LearningInputType;
  stage?: LearningStage | null;
  actionType?: string | null;
  sourceId?: string | null;
  platform?: string | null;
  format?: string | null;
  hookType?: string | null;
  ctaType?: string | null;
  provider?: string | null;
  defaultsProfileId?: string | null;
  abTestConfigId?: string | null;
  abTestDimension?: string | null;
  abTestVariant?: LearningABTestVariant | null;
  executionPath?: string | null;
  impressions?: number | null;
  clicks?: number | null;
  signups?: number | null;
  engagementScore?: number | null;
  engagementProxy?: number | null;
  ctr?: number | null;
  completionRate?: number | null;
  approvalRate?: number | null;
  costEfficiency?: number | null;
};

const learningRecordSchema = z.object({
  learningRecordId: z.string().trim().min(1),
  inputSignature: z.string().trim().min(1),
  outcome: z.enum(LEARNING_OUTCOMES),
  retries: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  timestamp: z.string().trim().min(1),
  inputType: z.enum(LEARNING_INPUT_TYPES).optional(),
  stage: z.enum(LEARNING_STAGES).nullable().optional(),
  actionType: z.string().trim().nullable().optional(),
  sourceId: z.string().trim().nullable().optional(),
  platform: z.string().trim().nullable().optional(),
  format: z.string().trim().nullable().optional(),
  hookType: z.string().trim().nullable().optional(),
  ctaType: z.string().trim().nullable().optional(),
  provider: z.string().trim().nullable().optional(),
  defaultsProfileId: z.string().trim().nullable().optional(),
  abTestConfigId: z.string().trim().nullable().optional(),
  abTestDimension: z.string().trim().nullable().optional(),
  abTestVariant: z.enum(LEARNING_AB_TEST_VARIANTS).nullable().optional(),
  executionPath: z.string().trim().nullable().optional(),
  impressions: z.number().int().nonnegative().nullable().optional(),
  clicks: z.number().int().nonnegative().nullable().optional(),
  signups: z.number().int().nonnegative().nullable().optional(),
  engagementScore: z.number().nonnegative().nullable().optional(),
  engagementProxy: z.number().nonnegative().nullable().optional(),
  ctr: z.number().min(0).max(1).nullable().optional(),
  completionRate: z.number().min(0).max(1).nullable().optional(),
  approvalRate: z.number().min(0).max(1).nullable().optional(),
  costEfficiency: z.number().nonnegative().nullable().optional(),
});

export interface LearningPatternEffectivenessRow {
  key: string;
  sampleSize: number;
  successRate: number;
  completionRate: number | null;
  approvalRate: number | null;
  averageCtr: number | null;
  averageEngagementProxy: number | null;
  costEfficiency: number | null;
  performanceScore: number;
  trendDelta: number | null;
}

export interface LearningPatternSummary {
  dimension: LearningPatternDimension;
  key: string;
  sampleSize: number;
  performanceScore: number;
  successRate: number;
}

export interface ABLearningInsight {
  configId: string;
  dimension: string | null;
  winnerVariant: LearningABTestVariant | null;
  loserVariant: LearningABTestVariant | null;
  sampleSize: number;
  winnerPerformanceScore: number | null;
  loserPerformanceScore: number | null;
  recommendation: "promote_winner" | "watch" | "inconclusive";
  reason: string | null;
}

export interface LearningSnapshot {
  snapshotId: string;
  generatedAt: string;
  recordCount: number;
  patternEffectiveness: Record<
    LearningPatternDimension,
    LearningPatternEffectivenessRow[]
  >;
  underperformingPatterns: LearningPatternSummary[];
  abInsights: ABLearningInsight[];
}

type LearningStoreState = {
  updatedAt: string | null;
  records: Record<string, LearningRecord>;
  snapshots: LearningSnapshot[];
};

const learningPatternEffectivenessRowSchema = z.object({
  key: z.string().trim().min(1),
  sampleSize: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  completionRate: z.number().min(0).max(1).nullable(),
  approvalRate: z.number().min(0).max(1).nullable(),
  averageCtr: z.number().min(0).max(1).nullable(),
  averageEngagementProxy: z.number().nonnegative().nullable(),
  costEfficiency: z.number().nonnegative().nullable(),
  performanceScore: z.number().min(0).max(100),
  trendDelta: z.number().min(-100).max(100).nullable(),
});

const learningPatternSummarySchema = z.object({
  dimension: z.enum(LEARNING_PATTERN_DIMENSIONS),
  key: z.string().trim().min(1),
  sampleSize: z.number().int().nonnegative(),
  performanceScore: z.number().min(0).max(100),
  successRate: z.number().min(0).max(1),
});

const abLearningInsightSchema = z.object({
  configId: z.string().trim().min(1),
  dimension: z.string().trim().nullable(),
  winnerVariant: z.enum(LEARNING_AB_TEST_VARIANTS).nullable(),
  loserVariant: z.enum(LEARNING_AB_TEST_VARIANTS).nullable(),
  sampleSize: z.number().int().nonnegative(),
  winnerPerformanceScore: z.number().min(0).max(100).nullable(),
  loserPerformanceScore: z.number().min(0).max(100).nullable(),
  recommendation: z.enum(["promote_winner", "watch", "inconclusive"]),
  reason: z.string().trim().nullable(),
});

const learningSnapshotSchema = z.object({
  snapshotId: z.string().trim().min(1),
  generatedAt: z.string().trim().min(1),
  recordCount: z.number().int().nonnegative(),
  patternEffectiveness: z.object({
    format: z.array(learningPatternEffectivenessRowSchema).default([]),
    hookType: z.array(learningPatternEffectivenessRowSchema).default([]),
    ctaType: z.array(learningPatternEffectivenessRowSchema).default([]),
    provider: z.array(learningPatternEffectivenessRowSchema).default([]),
  }),
  underperformingPatterns: z.array(learningPatternSummarySchema).default([]),
  abInsights: z.array(abLearningInsightSchema).default([]),
});

const learningStoreStateSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  records: z.record(z.string(), learningRecordSchema).default({}),
  snapshots: z.array(learningSnapshotSchema).max(60).default([]),
});

const learningStoreSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  if ("records" in value) {
    return value;
  }

  return {
    updatedAt: null,
    records: value,
    snapshots: [],
  };
}, learningStoreStateSchema);

export interface UpsertLearningRecordInput {
  learningRecordId?: string;
  inputSignature: string;
  outcome: LearningOutcome;
  retries?: number;
  cost?: number;
  timestamp?: string;
  inputType?: LearningInputType;
  stage?: LearningStage | null;
  actionType?: string | null;
  sourceId?: string | null;
  platform?: string | null;
  format?: string | null;
  hookType?: string | null;
  ctaType?: string | null;
  provider?: string | null;
  defaultsProfileId?: string | null;
  abTestConfigId?: string | null;
  abTestDimension?: string | null;
  abTestVariant?: LearningABTestVariant | null;
  executionPath?: string | null;
  impressions?: number | null;
  clicks?: number | null;
  signups?: number | null;
  engagementScore?: number | null;
  engagementProxy?: number | null;
  ctr?: number | null;
  completionRate?: number | null;
  approvalRate?: number | null;
  costEfficiency?: number | null;
}

export interface LearningAggregateRow {
  key: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  rejectedCount: number;
  successRate: number;
  averageRetries: number;
  costPerSuccess: number | null;
}

export interface LearningAggregates {
  successRateByInputType: LearningAggregateRow[];
  successRateByFormat: LearningAggregateRow[];
  successRateByHookType: LearningAggregateRow[];
  successRateByExecutionPath: LearningAggregateRow[];
  patternEffectiveness: LearningSnapshot["patternEffectiveness"];
  underperformingPatterns: LearningPatternSummary[];
  abInsights: ABLearningInsight[];
  averageRetries: number;
  costPerSuccess: number | null;
}

export interface LearningPatternAdjustment {
  sampleSize: number;
  scoreDelta: number;
  reason: string | null;
}

export type ContentLearningAdjustment = LearningPatternAdjustment;

export type BatchSelectionLearningBias = LearningPatternAdjustment;

export interface AutonomyLearningAdjustment {
  increaseRisk: boolean;
  reason: string | null;
  sampleSize: number;
  successRate: number | null;
  averageRetries: number | null;
  costPerSuccess: number | null;
}

export interface RepairAutopilotLearningAdjustment {
  useConservativeTextDefaults: boolean;
  reason: string | null;
  sampleSize: number;
  successRate: number | null;
}

export interface GrowthLearningAdjustment {
  sampleSize: number;
  formatSuccessRate: number | null;
  hookTypeSuccessRate: number | null;
  ctaTypeSuccessRate: number | null;
  executionPathSuccessRate: number | null;
  averageRetries: number | null;
  costPerSuccess: number | null;
  priorityDelta: number;
  learningValueDelta: number;
  reason: string | null;
}

let inMemoryLearningStore: LearningStoreState = {
  updatedAt: null,
  records: {},
  snapshots: [],
};

function sanitizeSignatureValue(value: string | number | boolean) {
  return String(value).replaceAll("|", "/").trim();
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalRate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function roundMetric(value: number) {
  return Math.round(value * 10000) / 10000;
}

function averageMetric(values: Array<number | null | undefined>) {
  const numericValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (numericValues.length === 0) {
    return null;
  }

  return roundMetric(
    numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length,
  );
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function parseSignature(signature: string) {
  const [kind = "unknown", ...parts] = signature.split("|");
  const tokens: Record<string, string> = { kind };

  for (const part of parts) {
    const separatorIndex = part.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key && value) {
      tokens[key] = value;
    }
  }

  return tokens;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const normalized = normalizeOptionalText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function inferHookType(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value)?.toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }

  if (
    normalized.includes("before you send") ||
    normalized.includes("pause before") ||
    normalized.includes("pause")
  ) {
    return "pause_before_send";
  }

  if (
    normalized.includes("escalate") ||
    normalized.includes("risk") ||
    normalized.includes("cost you your job") ||
    normalized.includes("go wrong") ||
    normalized.includes("complaint")
  ) {
    return "risk_warning";
  }

  if (
    normalized.includes("belief") ||
    normalized.includes("perspective") ||
    normalized.includes("reframe") ||
    normalized.includes("misconception")
  ) {
    return "perspective_shift";
  }

  if (
    normalized.includes("most teachers") ||
    normalized.includes("teachers do not realise") ||
    normalized.includes("teachers don't realise")
  ) {
    return "generalist_insight";
  }

  if (
    normalized.includes("relief") ||
    normalized.includes("calm") ||
    normalized.includes("confidence") ||
    normalized.includes("safe")
  ) {
    return "relief_reassurance";
  }

  return "direct_statement";
}

export function inferCtaType(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value)?.toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }

  if (
    normalized.includes("try") ||
    normalized.includes("sign up") ||
    normalized.includes("start") ||
    normalized.includes("trial")
  ) {
    return "product";
  }

  if (
    normalized.includes("share") ||
    normalized.includes("comment") ||
    normalized.includes("reply") ||
    normalized.includes("save")
  ) {
    return "engagement";
  }

  if (
    normalized.includes("visit") ||
    normalized.includes("learn more") ||
    normalized.includes("read")
  ) {
    return "visit";
  }

  return "awareness";
}

function deriveCtr(input: {
  clicks?: number | null;
  impressions?: number | null;
}) {
  if (
    typeof input.clicks !== "number" ||
    typeof input.impressions !== "number" ||
    input.impressions <= 0
  ) {
    return null;
  }

  return roundMetric(input.clicks / input.impressions);
}

function deriveEngagementProxy(input: {
  engagementScore?: number | null;
  signups?: number | null;
  clicks?: number | null;
  impressions?: number | null;
}) {
  if (typeof input.engagementScore === "number") {
    return input.engagementScore;
  }

  const signups = input.signups ?? 0;
  const clicks = input.clicks ?? 0;
  const impressions = input.impressions ?? 0;

  if (signups <= 0 && clicks <= 0 && impressions <= 0) {
    return null;
  }

  return signups * 5 + clicks + Math.round(impressions / 100);
}

function deriveApprovalRate(input: {
  stage?: LearningStage | null;
  outcome: LearningOutcome;
}) {
  if (input.stage !== "operator_review") {
    return null;
  }

  return input.outcome === "success" ? 1 : 0;
}

function deriveCompletionRate(input: {
  stage?: LearningStage | null;
  outcome: LearningOutcome;
}) {
  if (
    input.stage !== "generation" &&
    input.stage !== "engagement" &&
    input.stage !== "signal_outcome"
  ) {
    return null;
  }

  return input.outcome === "success" ? 1 : 0;
}

function deriveCostEfficiency(input: {
  cost: number;
  outcome: LearningOutcome;
  engagementProxy?: number | null;
}) {
  if (input.cost <= 0) {
    return input.outcome === "success" ? 1 : null;
  }

  if (typeof input.engagementProxy === "number" && input.engagementProxy > 0) {
    return roundMetric(input.engagementProxy / input.cost);
  }

  if (input.outcome === "success") {
    return roundMetric(1 / input.cost);
  }

  return null;
}

function matchesSignatureTokens(
  signature: string,
  expected: Record<string, string | null | undefined>,
) {
  const parsed = parseSignature(signature);

  return Object.entries(expected).every(([key, value]) => {
    if (!value) {
      return true;
    }

    return parsed[key] === value;
  });
}

function buildLearningRecord(
  input: UpsertLearningRecordInput,
  existing?: LearningRecord | null,
): LearningRecord {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const parsedSignature = parseSignature(input.inputSignature);
  const engagementProxy =
    input.engagementProxy ??
    existing?.engagementProxy ??
    deriveEngagementProxy({
      engagementScore:
        input.engagementScore === undefined
          ? existing?.engagementScore ?? null
          : input.engagementScore,
      signups:
        input.signups === undefined ? existing?.signups ?? null : input.signups,
      clicks: input.clicks === undefined ? existing?.clicks ?? null : input.clicks,
      impressions:
        input.impressions === undefined
          ? existing?.impressions ?? null
          : input.impressions,
    });
  const completionRate =
    input.completionRate ??
    existing?.completionRate ??
    deriveCompletionRate({
      stage:
        input.stage === undefined ? existing?.stage ?? null : input.stage ?? null,
      outcome: input.outcome,
    });
  const approvalRate =
    input.approvalRate ??
    existing?.approvalRate ??
    deriveApprovalRate({
      stage:
        input.stage === undefined ? existing?.stage ?? null : input.stage ?? null,
      outcome: input.outcome,
    });
  const ctr =
    input.ctr ??
    existing?.ctr ??
    deriveCtr({
      clicks: input.clicks === undefined ? existing?.clicks ?? null : input.clicks,
      impressions:
        input.impressions === undefined
          ? existing?.impressions ?? null
          : input.impressions,
    });
  const effectiveCost = input.cost ?? existing?.cost ?? 0;

  return learningRecordSchema.parse({
    learningRecordId:
      input.learningRecordId ??
      existing?.learningRecordId ??
      buildLearningRecordId({
        inputSignature: input.inputSignature,
        stage: input.stage ?? null,
        sourceId: input.sourceId ?? null,
      }),
    inputSignature: input.inputSignature,
    outcome: input.outcome,
    retries: input.retries ?? existing?.retries ?? 0,
    cost: input.cost ?? existing?.cost ?? 0,
    timestamp,
    inputType: input.inputType ?? existing?.inputType,
    stage:
      input.stage === undefined
        ? existing?.stage ?? null
        : input.stage,
    actionType:
      input.actionType === undefined
        ? existing?.actionType ?? null
        : normalizeOptionalText(input.actionType),
    sourceId:
      input.sourceId === undefined
        ? existing?.sourceId ?? null
        : normalizeOptionalText(input.sourceId),
    platform:
      input.platform === undefined
        ? existing?.platform ?? null
        : normalizeOptionalText(input.platform),
    format:
      input.format === undefined
        ? firstNonEmpty(existing?.format, parsedSignature.format)
        : normalizeOptionalText(input.format),
    hookType:
      input.hookType === undefined
        ? firstNonEmpty(existing?.hookType, parsedSignature.hookType)
        : normalizeOptionalText(input.hookType),
    ctaType:
      input.ctaType === undefined
        ? firstNonEmpty(existing?.ctaType, parsedSignature.ctaType)
        : normalizeOptionalText(input.ctaType),
    provider:
      input.provider === undefined
        ? firstNonEmpty(existing?.provider, parsedSignature.provider)
        : normalizeOptionalText(input.provider),
    defaultsProfileId:
      input.defaultsProfileId === undefined
        ? existing?.defaultsProfileId ?? null
        : normalizeOptionalText(input.defaultsProfileId),
    abTestConfigId:
      input.abTestConfigId === undefined
        ? existing?.abTestConfigId ?? null
        : normalizeOptionalText(input.abTestConfigId),
    abTestDimension:
      input.abTestDimension === undefined
        ? existing?.abTestDimension ?? null
        : normalizeOptionalText(input.abTestDimension),
    abTestVariant:
      input.abTestVariant === undefined
        ? existing?.abTestVariant ?? null
        : input.abTestVariant ?? null,
    executionPath:
      input.executionPath === undefined
        ? firstNonEmpty(existing?.executionPath, parsedSignature.path, parsedSignature.executionPath)
        : normalizeOptionalText(input.executionPath),
    impressions:
      input.impressions === undefined
        ? existing?.impressions ?? null
        : input.impressions,
    clicks:
      input.clicks === undefined
        ? existing?.clicks ?? null
        : input.clicks,
    signups:
      input.signups === undefined
        ? existing?.signups ?? null
        : input.signups,
    engagementScore:
      input.engagementScore === undefined
        ? existing?.engagementScore ?? null
        : input.engagementScore,
    engagementProxy,
    ctr,
    completionRate: normalizeOptionalRate(completionRate),
    approvalRate: normalizeOptionalRate(approvalRate),
    costEfficiency:
      input.costEfficiency ??
      existing?.costEfficiency ??
      deriveCostEfficiency({
        cost: effectiveCost,
        outcome: input.outcome,
        engagementProxy,
      }),
  });
}

function buildAggregateRows(
  records: LearningRecord[],
  keySelector: (record: LearningRecord) => string | null,
): LearningAggregateRow[] {
  const counts = new Map<
    string,
    {
      successCount: number;
      failedCount: number;
      rejectedCount: number;
      totalCount: number;
      retryTotal: number;
      successCostTotal: number;
    }
  >();

  for (const record of records) {
    const key = normalizeOptionalText(keySelector(record));
    if (!key) {
      continue;
    }

    const row =
      counts.get(key) ?? {
        successCount: 0,
        failedCount: 0,
        rejectedCount: 0,
        totalCount: 0,
        retryTotal: 0,
        successCostTotal: 0,
      };

    row.totalCount += 1;
    row.retryTotal += record.retries;
    if (record.outcome === "success") {
      row.successCount += 1;
      row.successCostTotal += record.cost;
    } else if (record.outcome === "failed") {
      row.failedCount += 1;
    } else {
      row.rejectedCount += 1;
    }

    counts.set(key, row);
  }

  return [...counts.entries()]
    .map(([key, row]) => ({
      key,
      totalCount: row.totalCount,
      successCount: row.successCount,
      failedCount: row.failedCount,
      rejectedCount: row.rejectedCount,
      successRate: row.totalCount > 0 ? row.successCount / row.totalCount : 0,
      averageRetries: row.totalCount > 0 ? row.retryTotal / row.totalCount : 0,
      costPerSuccess: row.successCount > 0 ? row.successCostTotal / row.successCount : null,
    }))
    .sort(
      (left, right) =>
        right.totalCount - left.totalCount ||
        right.successRate - left.successRate ||
        left.key.localeCompare(right.key),
    );
}

function scorePatternEffectiveness(input: {
  successRate: number;
  completionRate: number | null;
  approvalRate: number | null;
  averageCtr: number | null;
  averageEngagementProxy: number | null;
  costEfficiency: number | null;
}) {
  const ctrScore = Math.min((input.averageCtr ?? 0) / 0.1, 1) * 15;
  const engagementScore =
    Math.min((input.averageEngagementProxy ?? 0) / 20, 1) * 15;
  const costScore = Math.min((input.costEfficiency ?? 0) / 5, 1) * 10;

  return clampScore(
    input.successRate * 40 +
      (input.completionRate ?? input.successRate) * 10 +
      (input.approvalRate ?? input.successRate) * 10 +
      ctrScore +
      engagementScore +
      costScore,
  );
}

function buildPatternEffectivenessRows(
  records: LearningRecord[],
  keySelector: (record: LearningRecord) => string | null,
  previousRows?: LearningPatternEffectivenessRow[] | null,
): LearningPatternEffectivenessRow[] {
  const buckets = new Map<string, LearningRecord[]>();
  const previousByKey = new Map(
    (previousRows ?? []).map((row) => [row.key, row] as const),
  );

  for (const record of records) {
    const key = normalizeOptionalText(keySelector(record));
    if (!key) {
      continue;
    }

    const bucket = buckets.get(key) ?? [];
    bucket.push(record);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([key, bucket]) => {
      const successRateValue = successRate(bucket) ?? 0;
      const completionRateValue = averageMetric(
        bucket.map((record) => record.completionRate ?? null),
      );
      const approvalRateValue = averageMetric(
        bucket.map((record) => record.approvalRate ?? null),
      );
      const averageCtr = averageMetric(bucket.map((record) => record.ctr ?? null));
      const averageEngagementProxy = averageMetric(
        bucket.map(
          (record) =>
            record.engagementProxy ?? record.engagementScore ?? null,
        ),
      );
      const costEfficiencyValue = averageMetric(
        bucket.map((record) => record.costEfficiency ?? null),
      );
      const performanceScore = scorePatternEffectiveness({
        successRate: successRateValue,
        completionRate: completionRateValue,
        approvalRate: approvalRateValue,
        averageCtr,
        averageEngagementProxy,
        costEfficiency: costEfficiencyValue,
      });
      const previousPerformanceScore =
        previousByKey.get(key)?.performanceScore ?? null;

      return learningPatternEffectivenessRowSchema.parse({
        key,
        sampleSize: bucket.length,
        successRate: successRateValue,
        completionRate: completionRateValue,
        approvalRate: approvalRateValue,
        averageCtr,
        averageEngagementProxy,
        costEfficiency: costEfficiencyValue,
        performanceScore,
        trendDelta:
          previousPerformanceScore === null
            ? null
            : roundMetric(performanceScore - previousPerformanceScore),
      });
    })
    .sort(
      (left, right) =>
        right.performanceScore - left.performanceScore ||
        right.sampleSize - left.sampleSize ||
        left.key.localeCompare(right.key),
    );
}

export function buildABLearningInsightsFromRecords(
  records: LearningRecord[],
): ABLearningInsight[] {
  const grouped = new Map<string, LearningRecord[]>();

  for (const record of records) {
    const configId = normalizeOptionalText(record.abTestConfigId);
    const variant = record.abTestVariant ?? null;
    if (!configId || !variant) {
      continue;
    }

    const key = `${configId}:${variant}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(record);
    grouped.set(key, bucket);
  }

  const configIds = new Set(
    records
      .map((record) => normalizeOptionalText(record.abTestConfigId))
      .filter((value): value is string => Boolean(value)),
  );

  return Array.from(configIds)
    .map((configId) => {
      const left = grouped.get(`${configId}:A`) ?? [];
      const right = grouped.get(`${configId}:B`) ?? [];
      const totalSampleSize = left.length + right.length;
      const leftScore =
        left.length > 0
          ? scorePatternEffectiveness({
              successRate: successRate(left) ?? 0,
              completionRate: averageMetric(
                left.map((record) => record.completionRate ?? null),
              ),
              approvalRate: averageMetric(
                left.map((record) => record.approvalRate ?? null),
              ),
              averageCtr: averageMetric(left.map((record) => record.ctr ?? null)),
              averageEngagementProxy: averageMetric(
                left.map(
                  (record) =>
                    record.engagementProxy ?? record.engagementScore ?? null,
                ),
              ),
              costEfficiency: averageMetric(
                left.map((record) => record.costEfficiency ?? null),
              ),
            })
          : null;
      const rightScore =
        right.length > 0
          ? scorePatternEffectiveness({
              successRate: successRate(right) ?? 0,
              completionRate: averageMetric(
                right.map((record) => record.completionRate ?? null),
              ),
              approvalRate: averageMetric(
                right.map((record) => record.approvalRate ?? null),
              ),
              averageCtr: averageMetric(right.map((record) => record.ctr ?? null)),
              averageEngagementProxy: averageMetric(
                right.map(
                  (record) =>
                    record.engagementProxy ?? record.engagementScore ?? null,
                ),
              ),
              costEfficiency: averageMetric(
                right.map((record) => record.costEfficiency ?? null),
              ),
            })
          : null;
      const scoreGap =
        leftScore !== null && rightScore !== null
          ? Math.abs(leftScore - rightScore)
          : 0;
      const winnerVariant =
        leftScore === null && rightScore === null
          ? null
          : rightScore === null || (leftScore ?? 0) > (rightScore ?? 0)
            ? "A"
            : leftScore === null || (rightScore ?? 0) > (leftScore ?? 0)
              ? "B"
              : null;
      const loserVariant =
        winnerVariant === "A"
          ? "B"
          : winnerVariant === "B"
            ? "A"
            : null;
      const recommendation =
        totalSampleSize >= 4 && scoreGap >= 8 && winnerVariant
          ? "promote_winner"
          : totalSampleSize >= 2
            ? "watch"
            : "inconclusive";
      const dimension =
        normalizeOptionalText(left[0]?.abTestDimension) ??
        normalizeOptionalText(right[0]?.abTestDimension) ??
        null;

      return abLearningInsightSchema.parse({
        configId,
        dimension,
        winnerVariant,
        loserVariant,
        sampleSize: totalSampleSize,
        winnerPerformanceScore:
          winnerVariant === "A"
            ? leftScore
            : winnerVariant === "B"
              ? rightScore
              : null,
        loserPerformanceScore:
          loserVariant === "A"
            ? leftScore
            : loserVariant === "B"
              ? rightScore
              : null,
        recommendation,
        reason:
          recommendation === "promote_winner" && winnerVariant
            ? `Variant ${winnerVariant} is outperforming variant ${loserVariant} for ${configId}.`
            : recommendation === "watch"
              ? `A/B evidence for ${configId} is directional but not decisive yet.`
              : null,
      });
    })
    .sort(
      (left, right) =>
        right.sampleSize - left.sampleSize ||
        left.configId.localeCompare(right.configId),
    );
}

export function buildLearningSnapshotFromRecords(
  records: LearningRecord[],
  input?: {
    generatedAt?: string;
    previousSnapshot?: LearningSnapshot | null;
  },
): LearningSnapshot {
  const previousSnapshot = input?.previousSnapshot ?? null;
  const growthRelevantRecords = selectGrowthRelevantRecords(records);
  const providerRelevantRecords = records.filter(
    (record) => record.inputType === "video_factory",
  );
  const patternEffectiveness = {
    format: buildPatternEffectivenessRows(
      growthRelevantRecords,
      (record) => record.format ?? parseSignature(record.inputSignature).format ?? null,
      previousSnapshot?.patternEffectiveness.format,
    ),
    hookType: buildPatternEffectivenessRows(
      growthRelevantRecords,
      (record) =>
        record.hookType ?? parseSignature(record.inputSignature).hookType ?? null,
      previousSnapshot?.patternEffectiveness.hookType,
    ),
    ctaType: buildPatternEffectivenessRows(
      growthRelevantRecords,
      (record) =>
        record.ctaType ?? parseSignature(record.inputSignature).ctaType ?? null,
      previousSnapshot?.patternEffectiveness.ctaType,
    ),
    provider: buildPatternEffectivenessRows(
      providerRelevantRecords,
      (record) =>
        record.provider ?? parseSignature(record.inputSignature).provider ?? null,
      previousSnapshot?.patternEffectiveness.provider,
    ),
  } satisfies LearningSnapshot["patternEffectiveness"];
  const underperformingPatterns = LEARNING_PATTERN_DIMENSIONS.flatMap((dimension) =>
    patternEffectiveness[dimension]
      .filter((row) => row.sampleSize >= 3 && row.performanceScore <= 38)
      .slice(0, 3)
      .map((row) =>
        learningPatternSummarySchema.parse({
          dimension,
          key: row.key,
          sampleSize: row.sampleSize,
          performanceScore: row.performanceScore,
          successRate: row.successRate,
        }),
      ),
  ).sort(
    (left, right) =>
      left.performanceScore - right.performanceScore ||
      right.sampleSize - left.sampleSize ||
      left.key.localeCompare(right.key),
  );

  return learningSnapshotSchema.parse({
    snapshotId: `learning-snapshot:${input?.generatedAt ?? new Date().toISOString()}`,
    generatedAt: input?.generatedAt ?? new Date().toISOString(),
    recordCount: records.length,
    patternEffectiveness,
    underperformingPatterns,
    abInsights: buildABLearningInsightsFromRecords(records),
  });
}

function buildNormalizedLearningStore(
  state?: Partial<LearningStoreState> | null,
): LearningStoreState {
  return learningStoreStateSchema.parse({
    updatedAt: state?.updatedAt ?? null,
    records: state?.records ?? {},
    snapshots: state?.snapshots ?? [],
  });
}

function readPersistedStoreSync(): LearningStoreState {
  try {
    if (!existsSync(LEARNING_LOOP_STORE_PATH)) {
      return inMemoryLearningStore;
    }

    const raw = readFileSync(LEARNING_LOOP_STORE_PATH, "utf8");
    const parsed = learningStoreSchema.parse(JSON.parse(raw));
    inMemoryLearningStore = parsed;
    return parsed;
  } catch {
    return inMemoryLearningStore;
  }
}

async function readPersistedStore(): Promise<LearningStoreState> {
  try {
    const raw = await readFile(LEARNING_LOOP_STORE_PATH, "utf8");
    const parsed = learningStoreSchema.parse(JSON.parse(raw));
    inMemoryLearningStore = parsed;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryLearningStore;
    }

    throw error;
  }
}

async function writeStore(store: LearningStoreState) {
  const parsed = learningStoreStateSchema.parse(store);
  inMemoryLearningStore = parsed;

  try {
    await mkdir(path.dirname(LEARNING_LOOP_STORE_PATH), { recursive: true });
    await writeFile(
      LEARNING_LOOP_STORE_PATH,
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("learning-loop", error);
      return;
    }

    throw error;
  }
}

export function buildLearningInputSignature(
  kind: string,
  parts: Record<string, string | number | boolean | null | undefined>,
) {
  const entries = Object.entries(parts)
    .filter(([, value]) => value !== null && value !== undefined && `${value}`.trim())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${sanitizeSignatureValue(value as string | number | boolean)}`);

  return [kind, ...entries].join("|");
}

export function buildLearningRecordId(input: {
  inputSignature: string;
  stage?: LearningStage | null;
  sourceId?: string | null;
}) {
  const stage = input.stage ?? "generic";
  const sourceId = normalizeOptionalText(input.sourceId) ?? input.inputSignature;
  return `${stage}::${sourceId}`;
}

export function listLearningRecordsSync(options?: {
  inputType?: LearningInputType;
  stage?: LearningStage;
}) {
  return Object.values(readPersistedStoreSync().records)
    .filter((record) => (options?.inputType ? record.inputType === options.inputType : true))
    .filter((record) => (options?.stage ? record.stage === options.stage : true))
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
        left.learningRecordId.localeCompare(right.learningRecordId),
    );
}

export async function listLearningRecords(options?: {
  inputType?: LearningInputType;
  stage?: LearningStage;
}) {
  return Object.values((await readPersistedStore()).records)
    .filter((record) => (options?.inputType ? record.inputType === options.inputType : true))
    .filter((record) => (options?.stage ? record.stage === options.stage : true))
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
        left.learningRecordId.localeCompare(right.learningRecordId),
    );
}

export function listLearningSnapshotsSync() {
  return [...readPersistedStoreSync().snapshots].sort(
    (left, right) =>
      new Date(right.generatedAt).getTime() -
        new Date(left.generatedAt).getTime() ||
      left.snapshotId.localeCompare(right.snapshotId),
  );
}

export function getLatestLearningSnapshotSync() {
  return listLearningSnapshotsSync()[0] ?? null;
}

export async function upsertLearningRecord(input: UpsertLearningRecordInput) {
  const store = buildNormalizedLearningStore(await readPersistedStore());
  const recordId =
    input.learningRecordId ??
    buildLearningRecordId({
      inputSignature: input.inputSignature,
      stage: input.stage ?? null,
      sourceId: input.sourceId ?? null,
    });
  const previous = store.records[recordId] ?? null;
  const record = buildLearningRecord(
    {
      ...input,
      learningRecordId: recordId,
    },
    previous,
  );

  store.records[record.learningRecordId] = record;
  store.updatedAt = record.timestamp;
  store.snapshots = [
    buildLearningSnapshotFromRecords(Object.values(store.records), {
      generatedAt: record.timestamp,
      previousSnapshot: store.snapshots.at(-1) ?? null,
    }),
    ...store.snapshots,
  ].slice(0, 40);
  await writeStore(store);

  return {
    record,
    previous,
    created: !previous,
  };
}

export function buildLearningAggregates(records: LearningRecord[]): LearningAggregates {
  let retryTotal = 0;
  let costTotal = 0;
  let successCount = 0;
  const latestSnapshot = buildLearningSnapshotFromRecords(records);

  for (const record of records) {
    retryTotal += record.retries;
    if (record.outcome === "success") {
      costTotal += record.cost;
      successCount += 1;
    }
  }

  return {
    successRateByInputType: buildAggregateRows(
      records,
      (record) => record.inputType ?? parseSignature(record.inputSignature).kind,
    ),
    successRateByFormat: buildAggregateRows(
      records,
      (record) => record.format ?? parseSignature(record.inputSignature).format ?? null,
    ),
    successRateByHookType: buildAggregateRows(
      records,
      (record) => record.hookType ?? parseSignature(record.inputSignature).hookType ?? null,
    ),
    successRateByExecutionPath: buildAggregateRows(
      records,
      (record) =>
        record.executionPath ??
        parseSignature(record.inputSignature).path ??
        parseSignature(record.inputSignature).executionPath ??
        null,
    ),
    patternEffectiveness: latestSnapshot.patternEffectiveness,
    underperformingPatterns: latestSnapshot.underperformingPatterns,
    abInsights: latestSnapshot.abInsights,
    averageRetries: records.length > 0 ? retryTotal / records.length : 0,
    costPerSuccess: successCount > 0 ? costTotal / successCount : null,
  };
}

function findPatternRow(
  rows: LearningPatternEffectivenessRow[],
  key: string | null | undefined,
) {
  const normalized = normalizeOptionalText(key);
  if (!normalized) {
    return null;
  }

  return rows.find((row) => row.key === normalized) ?? null;
}

function patternPriorityDelta(row: LearningPatternEffectivenessRow | null) {
  if (!row || row.sampleSize < 3) {
    return 0;
  }

  if (row.performanceScore >= 72) {
    return 5;
  }

  if (row.performanceScore >= 60) {
    return 3;
  }

  if (row.performanceScore <= 35) {
    return -5;
  }

  if (row.performanceScore <= 45) {
    return -2;
  }

  return 0;
}

function patternScoreDelta(row: LearningPatternEffectivenessRow | null) {
  if (!row || row.sampleSize < 3) {
    return 0;
  }

  if (row.performanceScore >= 72) {
    return 0.45;
  }

  if (row.performanceScore >= 60) {
    return 0.2;
  }

  if (row.performanceScore <= 35) {
    return -0.35;
  }

  if (row.performanceScore <= 45) {
    return -0.15;
  }

  return 0;
}

function patternReason(
  dimension: string,
  row: LearningPatternEffectivenessRow | null,
) {
  if (!row || row.sampleSize < 3) {
    return null;
  }

  if (row.performanceScore >= 60) {
    return `${dimension} "${row.key}" is outperforming recent baselines.`;
  }

  if (row.performanceScore <= 40) {
    return `${dimension} "${row.key}" is underperforming in recent runs.`;
  }

  return null;
}

export function buildContentLearningAdjustmentFromRecords(
  records: LearningRecord[],
  input: {
    format?: string | null;
    hookType?: string | null;
    ctaType?: string | null;
  },
): ContentLearningAdjustment {
  const snapshot = buildLearningSnapshotFromRecords(records);
  const formatPattern = findPatternRow(
    snapshot.patternEffectiveness.format,
    input.format,
  );
  const hookPattern = findPatternRow(
    snapshot.patternEffectiveness.hookType,
    input.hookType,
  );
  const ctaPattern = findPatternRow(
    snapshot.patternEffectiveness.ctaType,
    input.ctaType,
  );
  const matchedRows = [formatPattern, hookPattern, ctaPattern].filter(
    (row): row is LearningPatternEffectivenessRow => Boolean(row),
  );
  const scoreDelta = matchedRows.reduce(
    (sum, row) => sum + patternScoreDelta(row),
    0,
  );
  const reason =
    patternReason("Format", formatPattern) ??
    patternReason("Hook", hookPattern) ??
    patternReason("CTA", ctaPattern) ??
    null;

  return {
    sampleSize: matchedRows.reduce((sum, row) => sum + row.sampleSize, 0),
    scoreDelta: Math.round(scoreDelta * 100) / 100,
    reason,
  };
}

export function getContentLearningAdjustmentSync(input: {
  format?: string | null;
  hookType?: string | null;
  ctaType?: string | null;
}) {
  return buildContentLearningAdjustmentFromRecords(
    listLearningRecordsSync({
      inputType: "video_factory",
    }),
    input,
  );
}

export function buildBatchSelectionLearningBiasFromRecords(
  records: LearningRecord[],
  input: {
    format?: string | null;
    hookType?: string | null;
    ctaType?: string | null;
  },
): BatchSelectionLearningBias {
  const adjustment = buildContentLearningAdjustmentFromRecords(records, input);

  return {
    sampleSize: adjustment.sampleSize,
    scoreDelta: Math.max(-12, Math.min(12, Math.round(adjustment.scoreDelta * 14))),
    reason: adjustment.reason,
  };
}

export function getBatchSelectionLearningBiasSync(input: {
  format?: string | null;
  hookType?: string | null;
  ctaType?: string | null;
}) {
  return buildBatchSelectionLearningBiasFromRecords(
    listLearningRecordsSync({
      inputType: "video_factory",
    }),
    input,
  );
}

function averageRetries(records: LearningRecord[]) {
  if (records.length === 0) {
    return null;
  }

  return records.reduce((sum, record) => sum + record.retries, 0) / records.length;
}

function successRate(records: LearningRecord[]) {
  if (records.length === 0) {
    return null;
  }

  const successes = records.filter((record) => record.outcome === "success").length;
  return successes / records.length;
}

function costPerSuccess(records: LearningRecord[]) {
  const successful = records.filter((record) => record.outcome === "success");
  if (successful.length === 0) {
    return null;
  }

  return successful.reduce((sum, record) => sum + record.cost, 0) / successful.length;
}

function selectGrowthRelevantRecords(records: LearningRecord[]) {
  const videoFactoryRecords = records.filter(
    (record) => record.inputType === "video_factory",
  );
  const higherSignalRecords = videoFactoryRecords.filter(
    (record) => record.stage === "operator_review" || record.stage === "engagement",
  );

  return higherSignalRecords.length > 0 ? higherSignalRecords : videoFactoryRecords;
}

export function buildGrowthLearningAdjustmentFromRecords(
  records: LearningRecord[],
  input: {
    format?: string | null;
    hookType?: string | null;
    ctaType?: string | null;
    executionPath?: string | null;
  },
): GrowthLearningAdjustment {
  const relevantBase = selectGrowthRelevantRecords(records);
  const snapshot = buildLearningSnapshotFromRecords(relevantBase);
  const relevant = relevantBase.filter((record) => {
    const parsedSignature = parseSignature(record.inputSignature);
    const formatMatches =
      !input.format ||
      record.format === input.format ||
      parsedSignature.format === input.format;
    const hookMatches =
      !input.hookType ||
      record.hookType === input.hookType ||
      parsedSignature.hookType === input.hookType;
    const ctaMatches =
      !input.ctaType ||
      record.ctaType === input.ctaType ||
      parsedSignature.ctaType === input.ctaType;
    const pathMatches =
      !input.executionPath ||
      record.executionPath === input.executionPath ||
      parsedSignature.path === input.executionPath ||
      parsedSignature.executionPath === input.executionPath;
    return formatMatches && hookMatches && ctaMatches && pathMatches;
  });

  const formatRecords = relevantBase.filter(
    (record) => !input.format || record.format === input.format,
  );
  const hookTypeRecords = relevantBase.filter(
    (record) => !input.hookType || record.hookType === input.hookType,
  );
  const ctaTypeRecords = relevantBase.filter(
    (record) => !input.ctaType || record.ctaType === input.ctaType,
  );
  const executionPathRecords = relevantBase.filter(
    (record) => !input.executionPath || record.executionPath === input.executionPath,
  );
  const samplePool = relevant;
  const formatSuccessRate = successRate(formatRecords);
  const hookTypeSuccessRate = successRate(hookTypeRecords);
  const ctaTypeSuccessRate = successRate(ctaTypeRecords);
  const executionPathSuccessRate = successRate(executionPathRecords);
  const currentAverageRetries = averageRetries(samplePool);
  const currentCostPerSuccess = costPerSuccess(samplePool);
  let priorityDelta = 0;
  let learningValueDelta = 0;
  const reasons: string[] = [];
  const formatPattern = findPatternRow(
    snapshot.patternEffectiveness.format,
    input.format,
  );
  const hookPattern = findPatternRow(
    snapshot.patternEffectiveness.hookType,
    input.hookType,
  );
  const ctaPattern = findPatternRow(
    snapshot.patternEffectiveness.ctaType,
    input.ctaType,
  );

  if (formatRecords.length >= 3 && (formatSuccessRate ?? 0) >= 0.7) {
    priorityDelta += 6;
    reasons.push(
      `${input.format ?? "This format"} is converting similar opportunities at ${Math.round((formatSuccessRate ?? 0) * 100)}% success.`,
    );
  } else if (formatRecords.length >= 3 && (formatSuccessRate ?? 1) <= 0.35) {
    priorityDelta -= 5;
    reasons.push(
      `${input.format ?? "This format"} is underperforming with only ${Math.round((formatSuccessRate ?? 0) * 100)}% success.`,
    );
  }

  if (executionPathRecords.length >= 3 && (executionPathSuccessRate ?? 0) >= 0.65) {
    priorityDelta += 4;
  } else if (executionPathRecords.length >= 3 && (executionPathSuccessRate ?? 1) <= 0.35) {
    priorityDelta -= 4;
  }

  if (ctaTypeRecords.length >= 3 && (ctaTypeSuccessRate ?? 0) >= 0.7) {
    priorityDelta += 3;
    reasons.push(
      `${input.ctaType ?? "This CTA"} is outperforming recent baselines.`,
    );
  } else if (ctaTypeRecords.length >= 3 && (ctaTypeSuccessRate ?? 1) <= 0.35) {
    priorityDelta -= 3;
  }

  if ((currentAverageRetries ?? 0) >= 1.5) {
    priorityDelta -= 6;
    reasons.push(
      `Similar executions are averaging ${currentAverageRetries?.toFixed(1) ?? "0.0"} retries.`,
    );
  } else if ((currentAverageRetries ?? 0) >= 1) {
    priorityDelta -= 3;
  }

  if ((currentCostPerSuccess ?? 0) >= 8) {
    priorityDelta -= 3;
  }

  priorityDelta +=
    patternPriorityDelta(formatPattern) +
    patternPriorityDelta(hookPattern) +
    patternPriorityDelta(ctaPattern);

  if (hookTypeRecords.length < 3 || executionPathRecords.length < 3) {
    learningValueDelta += 6;
    reasons.push("This pattern is still under-sampled, so it retains learning value.");
  } else if (
    hookTypeRecords.length >= 5 &&
    executionPathRecords.length >= 5 &&
    (hookTypeSuccessRate ?? 0) >= 0.6 &&
    (executionPathSuccessRate ?? 0) >= 0.6
  ) {
    learningValueDelta -= 4;
  }

  if (ctaTypeRecords.length < 3) {
    learningValueDelta += 3;
  } else if ((ctaPattern?.performanceScore ?? 0) >= 65) {
    learningValueDelta -= 2;
  }

  return {
    sampleSize: samplePool.length,
    formatSuccessRate,
    hookTypeSuccessRate,
    ctaTypeSuccessRate,
    executionPathSuccessRate,
    averageRetries: currentAverageRetries,
    costPerSuccess: currentCostPerSuccess,
    priorityDelta,
    learningValueDelta,
    reason: reasons[0] ?? null,
  };
}

export function getGrowthLearningAdjustmentSync(input: {
  format?: string | null;
  hookType?: string | null;
  ctaType?: string | null;
  executionPath?: string | null;
}) {
  return buildGrowthLearningAdjustmentFromRecords(
    listLearningRecordsSync({
      inputType: "video_factory",
    }),
    input,
  );
}

export function buildAutonomyLearningAdjustmentFromRecords(
  records: LearningRecord[],
  input: {
    actionType: string;
    contentType?: string | null;
    platformTarget?: string | null;
    inputType?: LearningInputType;
  },
): AutonomyLearningAdjustment {
  const relevant = records.filter((record) =>
    matchesSignatureTokens(record.inputSignature, {
      kind: input.inputType ?? null,
      action: input.actionType,
      content: input.contentType ?? null,
      platform: input.platformTarget ?? null,
    }),
  );
  const sampleSize = relevant.length;
  const currentSuccessRate = successRate(relevant);
  const currentAverageRetries = averageRetries(relevant);
  const currentCostPerSuccess = costPerSuccess(relevant);

  if (sampleSize < 3) {
    return {
      increaseRisk: false,
      reason: null,
      sampleSize,
      successRate: currentSuccessRate,
      averageRetries: currentAverageRetries,
      costPerSuccess: currentCostPerSuccess,
    };
  }

  const reasons: string[] = [];
  if ((currentSuccessRate ?? 1) < 0.5) {
    reasons.push(
      `Historical success rate for similar ${input.actionType.replaceAll("_", " ")} runs is only ${Math.round((currentSuccessRate ?? 0) * 100)}%.`,
    );
  }
  if ((currentAverageRetries ?? 0) > 1.5) {
    reasons.push(
      `Similar runs are averaging ${currentAverageRetries?.toFixed(1) ?? "0.0"} retries before completion.`,
    );
  }
  if ((currentCostPerSuccess ?? 0) > 7.5) {
    reasons.push(
      `Similar runs are currently costing about $${currentCostPerSuccess?.toFixed(2) ?? "0.00"} per success.`,
    );
  }

  return {
    increaseRisk: reasons.length > 0,
    reason: reasons[0] ?? null,
    sampleSize,
    successRate: currentSuccessRate,
    averageRetries: currentAverageRetries,
    costPerSuccess: currentCostPerSuccess,
  };
}

export function getAutonomyLearningAdjustmentSync(input: {
  actionType: string;
  contentType?: string | null;
  platformTarget?: string | null;
  inputType?: LearningInputType;
}) {
  return buildAutonomyLearningAdjustmentFromRecords(
    listLearningRecordsSync({
      inputType: input.inputType,
    }),
    input,
  );
}

export function buildRepairAutopilotAdjustmentFromRecords(
  records: LearningRecord[],
  input: {
    platform: string;
  },
): RepairAutopilotLearningAdjustment {
  const relevant = records.filter(
    (record) =>
      record.inputType === "signal" &&
      (record.stage === "signal_outcome" || record.stage === "engagement") &&
      matchesSignatureTokens(record.inputSignature, {
        kind: "signal",
        platform: input.platform,
      }),
  );
  const sampleSize = relevant.length;
  const currentSuccessRate = successRate(relevant);

  if (sampleSize < 3 || (currentSuccessRate ?? 1) >= 0.45) {
    return {
      useConservativeTextDefaults: false,
      reason: null,
      sampleSize,
      successRate: currentSuccessRate,
    };
  }

  return {
    useConservativeTextDefaults: true,
    reason: `Historical signal outcomes on ${input.platform} are weak enough to keep CTA and tone fixes conservative.`,
    sampleSize,
    successRate: currentSuccessRate,
  };
}

export function getRepairAutopilotLearningAdjustmentSync(input: {
  platform: string;
}) {
  return buildRepairAutopilotAdjustmentFromRecords(
    listLearningRecordsSync({
      inputType: "signal",
    }),
    input,
  );
}
