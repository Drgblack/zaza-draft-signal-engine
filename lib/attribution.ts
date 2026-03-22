import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appendAuditEventsSafe } from "@/lib/audit";
import { mockPostingLogSeed, mockStrategicOutcomeSeed } from "@/lib/mock-data";
import { POSTING_PLATFORMS, type PostingLogEntry, type PostingPlatform, postingLogEntrySchema } from "@/lib/posting-memory";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import { strategicOutcomeSchema } from "@/lib/strategic-outcome-memory";
import { EDITORIAL_MODES, type SignalRecord } from "@/types/signal";

const ATTRIBUTION_STORE_PATH = path.join(process.cwd(), "data", "attribution-memory.json");

export const ATTRIBUTION_OUTCOME_TYPES = ["click", "signup", "lead", "unknown"] as const;
export const ATTRIBUTION_OUTCOME_STRENGTHS = ["weak", "medium", "strong"] as const;

export type AttributionOutcomeType = (typeof ATTRIBUTION_OUTCOME_TYPES)[number];
export type AttributionOutcomeStrength = (typeof ATTRIBUTION_OUTCOME_STRENGTHS)[number];

export const attributionRecordSchema = z.object({
  attributionId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  postingId: z.string().trim().min(1),
  platform: z.enum(POSTING_PLATFORMS),
  destination: z.string().trim().nullable(),
  utmTag: z.string().trim().nullable(),
  campaignId: z.string().trim().nullable().optional(),
  editorialMode: z.enum(EDITORIAL_MODES).nullable().optional(),
  patternId: z.string().trim().nullable().optional(),
  patternName: z.string().trim().nullable().optional(),
  outcomeType: z.enum(ATTRIBUTION_OUTCOME_TYPES),
  outcomeStrength: z.enum(ATTRIBUTION_OUTCOME_STRENGTHS),
  notes: z.string().trim().nullable(),
  recordedAt: z.string().trim().min(1),
});

const attributionStoreSchema = z.record(z.string(), attributionRecordSchema);

export type AttributionRecord = z.infer<typeof attributionRecordSchema>;

let inMemoryAttributionStore: Record<string, AttributionRecord> = {};

export interface AttributionInsightRow {
  key: string;
  label: string;
  count: number;
  strongCount: number;
}

export interface AttributionInsights {
  recordedCount: number;
  strongCount: number;
  leadCount: number;
  signupCount: number;
  clickCount: number;
  topDestinationRows: AttributionInsightRow[];
  topPlatformDestinationRows: AttributionInsightRow[];
  topPatternRows: AttributionInsightRow[];
  summaries: string[];
}

export interface AttributionHistorySnapshot {
  sampleCount: number;
  strongCount: number;
  leadCount: number;
  signupCount: number;
  weakCount: number;
  averageScore: number;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildDestinationLabel(entry: PostingLogEntry): string | null {
  return normalizeText(entry.destinationLabel) ??
    normalizeText(entry.destinationUrl) ??
    normalizeText(entry.selectedSiteLinkId);
}

function buildUtmTag(entry: PostingLogEntry): string | null {
  const parts = [
    normalizeText(entry.utmSource),
    normalizeText(entry.utmMedium),
    normalizeText(entry.utmCampaign),
    normalizeText(entry.utmContent),
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join("|") : null;
}

function inferOutcomeType(outcome: StrategicOutcome): AttributionOutcomeType {
  if ((outcome.leadsOrSignups ?? 0) > 0) {
    return "lead";
  }

  if ((outcome.trialsOrConversions ?? 0) > 0) {
    return "signup";
  }

  if ((outcome.clicks ?? 0) > 0) {
    return "click";
  }

  const note = outcome.note?.toLowerCase() ?? "";
  if (/\b(lead|demo|conversation|reply from founder|sales)\b/.test(note)) {
    return "lead";
  }
  if (/\b(signup|trial|conversion|registered|started)\b/.test(note)) {
    return "signup";
  }
  if (/\b(click|visited|traffic)\b/.test(note)) {
    return "click";
  }

  return "unknown";
}

function inferOutcomeStrength(
  outcome: StrategicOutcome,
  outcomeType: AttributionOutcomeType,
): AttributionOutcomeStrength {
  const leadLikeCount = (outcome.leadsOrSignups ?? 0) + (outcome.trialsOrConversions ?? 0);
  if (
    leadLikeCount >= 2 ||
    outcome.strategicValue === "high" ||
    (outcome.clicks ?? 0) >= 25
  ) {
    return "strong";
  }

  if (
    leadLikeCount >= 1 ||
    outcome.strategicValue === "medium" ||
    (outcome.clicks ?? 0) >= 8 ||
    outcomeType !== "unknown"
  ) {
    return "medium";
  }

  return "weak";
}

function strengthScore(record: AttributionRecord): number {
  const typeScore =
    record.outcomeType === "lead"
      ? 4
      : record.outcomeType === "signup"
        ? 3
        : record.outcomeType === "click"
          ? 1
          : 0;
  const strengthMultiplier =
    record.outcomeStrength === "strong" ? 2 : record.outcomeStrength === "medium" ? 1 : -1;
  return typeScore + strengthMultiplier;
}

function buildRecord(
  entry: PostingLogEntry,
  outcome: StrategicOutcome,
  signal: SignalRecord | null | undefined,
): AttributionRecord {
  const outcomeType = inferOutcomeType(outcome);
  const outcomeStrength = inferOutcomeStrength(outcome, outcomeType);

  return attributionRecordSchema.parse({
    attributionId: `attr_${entry.id}`,
    signalId: entry.signalId,
    postingId: entry.id,
    platform: entry.platform,
    destination: buildDestinationLabel(entry),
    utmTag: buildUtmTag(entry),
    campaignId: signal?.campaignId ?? null,
    editorialMode: signal?.editorialMode ?? entry.editorialMode ?? null,
    patternId: entry.patternId ?? null,
    patternName: entry.patternName ?? null,
    outcomeType,
    outcomeStrength,
    notes: normalizeText(outcome.note),
    recordedAt: outcome.recordedAt,
  });
}

function buildSeedStore(): Record<string, AttributionRecord> {
  const entries = mockPostingLogSeed.map((entry) => postingLogEntrySchema.parse(entry));
  const outcomesByPostingId = new Map(
    mockStrategicOutcomeSeed.map((outcome) => {
      const parsed = strategicOutcomeSchema.parse(outcome);
      return [parsed.postingLogId, parsed] as const;
    }),
  );
  const store: Record<string, AttributionRecord> = {};

  for (const entry of entries) {
    const outcome = outcomesByPostingId.get(entry.id);
    if (!outcome) {
      continue;
    }

    const record = buildRecord(entry, outcome, null);
    store[record.postingId] = record;
  }

  return store;
}

async function readPersistedStore(): Promise<Record<string, AttributionRecord>> {
  try {
    const raw = await readFile(ATTRIBUTION_STORE_PATH, "utf8");
    const store = attributionStoreSchema.parse(JSON.parse(raw));
    inMemoryAttributionStore = store;
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryAttributionStore;
    }

    throw error;
  }
}

async function writeStore(store: Record<string, AttributionRecord>): Promise<void> {
  const parsed = attributionStoreSchema.parse(store);
  inMemoryAttributionStore = parsed;

  try {
    await mkdir(path.dirname(ATTRIBUTION_STORE_PATH), { recursive: true });
    await writeFile(ATTRIBUTION_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("attribution-memory", error);
      return;
    }

    throw error;
  }
}

export function buildAttributionRecordsFromInputs(input: {
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
  signals?: SignalRecord[];
}): AttributionRecord[] {
  const outcomesByPostingId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const signalsById = new Map((input.signals ?? []).map((signal) => [signal.recordId, signal]));

  return input.postingEntries
    .map((entry) => {
      const outcome = outcomesByPostingId.get(entry.id);
      if (!outcome) {
        return null;
      }

      return buildRecord(entry, outcome, signalsById.get(entry.signalId));
    })
    .filter((record): record is AttributionRecord => record !== null)
    .sort(
      (left, right) =>
        new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime() ||
        right.attributionId.localeCompare(left.attributionId),
    );
}

export async function syncAttributionMemory(input: {
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
  signals?: SignalRecord[];
}): Promise<AttributionRecord[]> {
  const persisted = await readPersistedStore();
  const nextRecords = buildAttributionRecordsFromInputs(input);
  const nextStore = { ...persisted };
  const createdOrChanged: AttributionRecord[] = [];

  for (const record of nextRecords) {
    const previous = persisted[record.postingId];
    nextStore[record.postingId] = previous
      ? attributionRecordSchema.parse({
          ...previous,
          ...record,
          notes: record.notes ?? previous.notes ?? null,
        })
      : record;

    if (!previous || JSON.stringify(previous) !== JSON.stringify(nextStore[record.postingId])) {
      createdOrChanged.push(nextStore[record.postingId]);
    }
  }

  if (createdOrChanged.length > 0) {
    await writeStore(nextStore);
    await appendAuditEventsSafe(
      createdOrChanged.map((record) => ({
        signalId: record.signalId,
        eventType: "ATTRIBUTION_RECORDED" as const,
        actor: "system" as const,
        summary: `Recorded ${record.outcomeStrength} ${record.outcomeType} attribution for ${record.platform}.`,
        metadata: {
          postingId: record.postingId,
          destination: record.destination,
          outcomeType: record.outcomeType,
          outcomeStrength: record.outcomeStrength,
          utmTag: record.utmTag,
        },
      })),
    );
  }

  return Object.values({
    ...buildSeedStore(),
    ...nextStore,
  }).sort(
    (left, right) =>
      new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime() ||
      right.attributionId.localeCompare(left.attributionId),
  );
}

export async function listAttributionRecords(options?: {
  signalIds?: string[];
  postingIds?: string[];
}): Promise<AttributionRecord[]> {
  const store = {
    ...buildSeedStore(),
    ...(await readPersistedStore()),
  };
  const allowedSignalIds = options?.signalIds ? new Set(options.signalIds) : null;
  const allowedPostingIds = options?.postingIds ? new Set(options.postingIds) : null;

  return Object.values(store)
    .filter((record) => (allowedSignalIds ? allowedSignalIds.has(record.signalId) : true))
    .filter((record) => (allowedPostingIds ? allowedPostingIds.has(record.postingId) : true))
    .sort(
      (left, right) =>
        new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime() ||
        right.attributionId.localeCompare(left.attributionId),
    );
}

function buildRows(records: AttributionRecord[], selector: (record: AttributionRecord) => { key: string; label: string } | null) {
  const rows = new Map<string, AttributionInsightRow>();

  for (const record of records) {
    const row = selector(record);
    if (!row) {
      continue;
    }

    const current = rows.get(row.key) ?? {
      key: row.key,
      label: row.label,
      count: 0,
      strongCount: 0,
    };
    current.count += 1;
    if (record.outcomeStrength === "strong") {
      current.strongCount += 1;
    }
    rows.set(row.key, current);
  }

  return Array.from(rows.values()).sort(
    (left, right) => right.strongCount - left.strongCount || right.count - left.count || left.label.localeCompare(right.label),
  ).slice(0, 5);
}

export function buildAttributionInsights(records: AttributionRecord[]): AttributionInsights {
  const strongCount = records.filter((record) => record.outcomeStrength === "strong").length;
  const leadCount = records.filter((record) => record.outcomeType === "lead").length;
  const signupCount = records.filter((record) => record.outcomeType === "signup").length;
  const clickCount = records.filter((record) => record.outcomeType === "click").length;

  const topDestinationRows = buildRows(records, (record) =>
    record.destination
      ? {
          key: record.destination.toLowerCase(),
          label: record.destination,
        }
      : null,
  );
  const topPlatformDestinationRows = buildRows(records, (record) =>
    record.destination
      ? {
          key: `${record.platform}:${record.destination.toLowerCase()}`,
          label: `${record.platform === "x" ? "X" : record.platform === "linkedin" ? "LinkedIn" : "Reddit"} + ${record.destination}`,
        }
      : null,
  );
  const topPatternRows = buildRows(records, (record) =>
    record.patternName
      ? {
          key: record.patternName.toLowerCase(),
          label: record.patternName,
        }
      : record.editorialMode
        ? {
            key: `mode:${record.editorialMode}`,
            label: record.editorialMode,
          }
        : null,
  );

  const summaries: string[] = [];
  if (topPlatformDestinationRows[0]) {
    summaries.push(`${topPlatformDestinationRows[0].label} is the strongest current commercial combo.`);
  }
  if (topDestinationRows[0]) {
    summaries.push(`${topDestinationRows[0].label} is the destination most often tied to attributed commercial signals.`);
  }
  if (topPatternRows[0]) {
    summaries.push(`${topPatternRows[0].label} is the strongest current pattern or mode attribution row.`);
  }

  return {
    recordedCount: records.length,
    strongCount,
    leadCount,
    signupCount,
    clickCount,
    topDestinationRows,
    topPlatformDestinationRows,
    topPatternRows,
    summaries: summaries.slice(0, 3),
  };
}

export function buildAttributionHistorySnapshot(input: {
  records: AttributionRecord[];
  platform: PostingPlatform;
  destination: string | null;
  editorialMode?: SignalRecord["editorialMode"];
}): AttributionHistorySnapshot {
  const matched = input.records.filter((record) => {
    const platformMatch = record.platform === input.platform;
    const destinationMatch = input.destination
      ? record.destination?.toLowerCase() === input.destination.toLowerCase()
      : true;
    const modeMatch = input.editorialMode ? record.editorialMode === input.editorialMode : true;
    return platformMatch && destinationMatch && modeMatch;
  });

  const totalScore = matched.reduce((sum, record) => sum + strengthScore(record), 0);

  return {
    sampleCount: matched.length,
    strongCount: matched.filter((record) => record.outcomeStrength === "strong").length,
    leadCount: matched.filter((record) => record.outcomeType === "lead").length,
    signupCount: matched.filter((record) => record.outcomeType === "signup").length,
    weakCount: matched.filter((record) => record.outcomeStrength === "weak").length,
    averageScore: matched.length > 0 ? totalScore / matched.length : 0,
  };
}
