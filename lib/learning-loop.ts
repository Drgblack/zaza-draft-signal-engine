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

export type LearningOutcome = (typeof LEARNING_OUTCOMES)[number];
export type LearningInputType = (typeof LEARNING_INPUT_TYPES)[number];
export type LearningStage = (typeof LEARNING_STAGES)[number];

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
  executionPath?: string | null;
  impressions?: number | null;
  clicks?: number | null;
  signups?: number | null;
  engagementScore?: number | null;
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
  executionPath: z.string().trim().nullable().optional(),
  impressions: z.number().int().nonnegative().nullable().optional(),
  clicks: z.number().int().nonnegative().nullable().optional(),
  signups: z.number().int().nonnegative().nullable().optional(),
  engagementScore: z.number().nonnegative().nullable().optional(),
});

const learningStoreSchema = z.record(z.string(), learningRecordSchema);

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
  executionPath?: string | null;
  impressions?: number | null;
  clicks?: number | null;
  signups?: number | null;
  engagementScore?: number | null;
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
  averageRetries: number;
  costPerSuccess: number | null;
}

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
  executionPathSuccessRate: number | null;
  averageRetries: number | null;
  costPerSuccess: number | null;
  priorityDelta: number;
  learningValueDelta: number;
  reason: string | null;
}

let inMemoryLearningStore: Record<string, LearningRecord> = {};

function sanitizeSignatureValue(value: string | number | boolean) {
  return String(value).replaceAll("|", "/").trim();
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
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

function readPersistedStoreSync(): Record<string, LearningRecord> {
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

async function readPersistedStore(): Promise<Record<string, LearningRecord>> {
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

async function writeStore(store: Record<string, LearningRecord>) {
  const parsed = learningStoreSchema.parse(store);
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
  return Object.values(readPersistedStoreSync())
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
  return Object.values(await readPersistedStore())
    .filter((record) => (options?.inputType ? record.inputType === options.inputType : true))
    .filter((record) => (options?.stage ? record.stage === options.stage : true))
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
        left.learningRecordId.localeCompare(right.learningRecordId),
    );
}

export async function upsertLearningRecord(input: UpsertLearningRecordInput) {
  const store = await readPersistedStore();
  const recordId =
    input.learningRecordId ??
    buildLearningRecordId({
      inputSignature: input.inputSignature,
      stage: input.stage ?? null,
      sourceId: input.sourceId ?? null,
    });
  const previous = store[recordId] ?? null;
  const record = buildLearningRecord(
    {
      ...input,
      learningRecordId: recordId,
    },
    previous,
  );

  store[record.learningRecordId] = record;
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
    averageRetries: records.length > 0 ? retryTotal / records.length : 0,
    costPerSuccess: successCount > 0 ? costTotal / successCount : null,
  };
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
    executionPath?: string | null;
  },
): GrowthLearningAdjustment {
  const relevantBase = selectGrowthRelevantRecords(records);
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
    const pathMatches =
      !input.executionPath ||
      record.executionPath === input.executionPath ||
      parsedSignature.path === input.executionPath ||
      parsedSignature.executionPath === input.executionPath;
    return formatMatches && hookMatches && pathMatches;
  });

  const formatRecords = relevantBase.filter(
    (record) => !input.format || record.format === input.format,
  );
  const hookTypeRecords = relevantBase.filter(
    (record) => !input.hookType || record.hookType === input.hookType,
  );
  const executionPathRecords = relevantBase.filter(
    (record) => !input.executionPath || record.executionPath === input.executionPath,
  );
  const samplePool = relevant;
  const formatSuccessRate = successRate(formatRecords);
  const hookTypeSuccessRate = successRate(hookTypeRecords);
  const executionPathSuccessRate = successRate(executionPathRecords);
  const currentAverageRetries = averageRetries(samplePool);
  const currentCostPerSuccess = costPerSuccess(samplePool);
  let priorityDelta = 0;
  let learningValueDelta = 0;
  const reasons: string[] = [];

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

  return {
    sampleSize: samplePool.length,
    formatSuccessRate,
    hookTypeSuccessRate,
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
