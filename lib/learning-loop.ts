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
  impressions?: number | null;
  clicks?: number | null;
  signups?: number | null;
  engagementScore?: number | null;
}

export interface LearningAggregateRow {
  inputType: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  rejectedCount: number;
  successRate: number;
}

export interface LearningAggregates {
  successRateByInputType: LearningAggregateRow[];
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
  const countsByInputType = new Map<
    string,
    { successCount: number; failedCount: number; rejectedCount: number; totalCount: number }
  >();
  let retryTotal = 0;
  let costTotal = 0;
  let successCount = 0;

  for (const record of records) {
    const inputType = record.inputType ?? parseSignature(record.inputSignature).kind;
    const row =
      countsByInputType.get(inputType) ?? {
        successCount: 0,
        failedCount: 0,
        rejectedCount: 0,
        totalCount: 0,
      };

    row.totalCount += 1;
    retryTotal += record.retries;
    if (record.outcome === "success") {
      row.successCount += 1;
      costTotal += record.cost;
      successCount += 1;
    } else if (record.outcome === "failed") {
      row.failedCount += 1;
    } else {
      row.rejectedCount += 1;
    }

    countsByInputType.set(inputType, row);
  }

  return {
    successRateByInputType: [...countsByInputType.entries()]
      .map(([inputType, row]) => ({
        inputType,
        totalCount: row.totalCount,
        successCount: row.successCount,
        failedCount: row.failedCount,
        rejectedCount: row.rejectedCount,
        successRate: row.totalCount > 0 ? row.successCount / row.totalCount : 0,
      }))
      .sort(
        (left, right) =>
          right.totalCount - left.totalCount || left.inputType.localeCompare(right.inputType),
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
