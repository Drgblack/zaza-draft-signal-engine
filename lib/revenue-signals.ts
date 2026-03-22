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

const REVENUE_SIGNAL_STORE_PATH = path.join(process.cwd(), "data", "revenue-signals.json");

export const REVENUE_SIGNAL_TYPES = ["signup", "trial", "paid", "unknown"] as const;
export const REVENUE_SIGNAL_STRENGTHS = ["low", "medium", "high"] as const;
export const REVENUE_SIGNAL_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const REVENUE_SIGNAL_SOURCES = ["manual", "inferred"] as const;

export type RevenueSignalType = (typeof REVENUE_SIGNAL_TYPES)[number];
export type RevenueSignalStrength = (typeof REVENUE_SIGNAL_STRENGTHS)[number];
export type RevenueSignalConfidence = (typeof REVENUE_SIGNAL_CONFIDENCE_LEVELS)[number];
export type RevenueSignalSource = (typeof REVENUE_SIGNAL_SOURCES)[number];

export const revenueSignalSchema = z.object({
  revenueSignalId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  postingId: z.string().trim().min(1),
  platform: z.enum(POSTING_PLATFORMS),
  destination: z.string().trim().nullable(),
  utmTag: z.string().trim().nullable(),
  campaignId: z.string().trim().nullable().optional(),
  editorialMode: z.enum(EDITORIAL_MODES).nullable().optional(),
  patternId: z.string().trim().nullable().optional(),
  patternName: z.string().trim().nullable().optional(),
  type: z.enum(REVENUE_SIGNAL_TYPES),
  strength: z.enum(REVENUE_SIGNAL_STRENGTHS),
  confidence: z.enum(REVENUE_SIGNAL_CONFIDENCE_LEVELS),
  notes: z.string().trim().nullable(),
  timestamp: z.string().trim().min(1),
  source: z.enum(REVENUE_SIGNAL_SOURCES),
});

const revenueSignalStoreSchema = z.record(z.string(), revenueSignalSchema);

export const revenueSignalRequestSchema = z.object({
  type: z.enum(REVENUE_SIGNAL_TYPES),
  strength: z.enum(REVENUE_SIGNAL_STRENGTHS),
  confidence: z.enum(REVENUE_SIGNAL_CONFIDENCE_LEVELS),
  notes: z.union([z.string(), z.null()]).optional(),
});

export type RevenueSignal = z.infer<typeof revenueSignalSchema>;
export type RevenueSignalRequest = z.infer<typeof revenueSignalRequestSchema>;

let inMemoryRevenueSignalStore: Record<string, RevenueSignal> = {};

export interface RevenueSignalInsightRow {
  key: string;
  label: string;
  count: number;
  highStrengthCount: number;
}

export interface RevenueSignalInsights {
  recordedCount: number;
  highStrengthCount: number;
  highConfidenceCount: number;
  paidCount: number;
  trialCount: number;
  signupCount: number;
  recentSignals: RevenueSignal[];
  topDestinationRows: RevenueSignalInsightRow[];
  topPlatformRows: RevenueSignalInsightRow[];
  topPlatformDestinationRows: RevenueSignalInsightRow[];
  topPatternRows: RevenueSignalInsightRow[];
  summaries: string[];
}

export interface RevenueHistorySnapshot {
  sampleCount: number;
  highStrengthCount: number;
  paidCount: number;
  trialCount: number;
  signupCount: number;
  lowStrengthCount: number;
  averageScore: number;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildDestinationLabel(entry: PostingLogEntry): string | null {
  return (
    normalizeText(entry.destinationLabel) ??
    normalizeText(entry.destinationUrl) ??
    normalizeText(entry.selectedSiteLinkId)
  );
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

function inferRevenueType(outcome: StrategicOutcome): RevenueSignalType {
  const note = outcome.note?.toLowerCase() ?? "";

  if (
    /\b(paid|payment|customer|closed|contract|purchase|upgraded?|annual plan|monthly plan)\b/.test(note)
  ) {
    return "paid";
  }

  if ((outcome.trialsOrConversions ?? 0) > 0) {
    return "trial";
  }

  if ((outcome.leadsOrSignups ?? 0) > 0) {
    return "signup";
  }

  if (/\b(trial|conversion|booked demo|started|registered|signed up|signup)\b/.test(note)) {
    return "trial";
  }

  if (/\b(lead|conversation|qualified|reply that led to)\b/.test(note)) {
    return "signup";
  }

  return "unknown";
}

function inferRevenueStrength(
  outcome: StrategicOutcome,
  type: RevenueSignalType,
): RevenueSignalStrength {
  const trialLikeTotal = (outcome.trialsOrConversions ?? 0) + (outcome.leadsOrSignups ?? 0);

  if (
    type === "paid" ||
    (outcome.trialsOrConversions ?? 0) >= 2 ||
    trialLikeTotal >= 4 ||
    outcome.strategicValue === "high"
  ) {
    return "high";
  }

  if (
    type !== "unknown" ||
    (outcome.trialsOrConversions ?? 0) >= 1 ||
    trialLikeTotal >= 1 ||
    outcome.strategicValue === "medium"
  ) {
    return "medium";
  }

  return "low";
}

function inferRevenueConfidence(
  outcome: StrategicOutcome,
  type: RevenueSignalType,
): RevenueSignalConfidence {
  const note = outcome.note?.toLowerCase() ?? "";

  if (
    type === "paid" ||
    (outcome.trialsOrConversions ?? 0) > 0 ||
    (outcome.leadsOrSignups ?? 0) >= 2
  ) {
    return "high";
  }

  if (
    type !== "unknown" ||
    /\b(signup|trial|paid|lead|demo|customer|conversation)\b/.test(note)
  ) {
    return "medium";
  }

  return "low";
}

function scoreRevenueSignal(record: RevenueSignal): number {
  const typeScore =
    record.type === "paid"
      ? 5
      : record.type === "trial"
        ? 4
        : record.type === "signup"
          ? 3
          : 0;
  const strengthScore = record.strength === "high" ? 2 : record.strength === "medium" ? 1 : -1;
  const confidenceScore = record.confidence === "high" ? 1 : record.confidence === "medium" ? 0 : -1;
  return typeScore + strengthScore + confidenceScore;
}

function buildRecord(
  entry: PostingLogEntry,
  signal: SignalRecord | null | undefined,
  input: {
    type: RevenueSignalType;
    strength: RevenueSignalStrength;
    confidence: RevenueSignalConfidence;
    notes?: string | null;
    timestamp: string;
    source: RevenueSignalSource;
  },
): RevenueSignal {
  return revenueSignalSchema.parse({
    revenueSignalId: `revenue_${entry.id}`,
    signalId: entry.signalId,
    postingId: entry.id,
    platform: entry.platform,
    destination: buildDestinationLabel(entry),
    utmTag: buildUtmTag(entry),
    campaignId: signal?.campaignId ?? null,
    editorialMode: signal?.editorialMode ?? entry.editorialMode ?? null,
    patternId: entry.patternId ?? null,
    patternName: entry.patternName ?? null,
    type: input.type,
    strength: input.strength,
    confidence: input.confidence,
    notes: normalizeText(input.notes),
    timestamp: input.timestamp,
    source: input.source,
  });
}

function buildSeedStore(): Record<string, RevenueSignal> {
  const entries = mockPostingLogSeed.map((entry) => postingLogEntrySchema.parse(entry));
  const outcomesByPostingId = new Map(
    mockStrategicOutcomeSeed.map((outcome) => {
      const parsed = strategicOutcomeSchema.parse(outcome);
      return [parsed.postingLogId, parsed] as const;
    }),
  );
  const store: Record<string, RevenueSignal> = {};

  for (const entry of entries) {
    const outcome = outcomesByPostingId.get(entry.id);
    if (!outcome) {
      continue;
    }

    const type = inferRevenueType(outcome);
    if (type === "unknown" && outcome.strategicValue === "low") {
      continue;
    }

    const record = buildRecord(entry, null, {
      type,
      strength: inferRevenueStrength(outcome, type),
      confidence: inferRevenueConfidence(outcome, type),
      notes: outcome.note,
      timestamp: outcome.recordedAt,
      source: "inferred",
    });
    store[record.postingId] = record;
  }

  return store;
}

async function readPersistedStore(): Promise<Record<string, RevenueSignal>> {
  try {
    const raw = await readFile(REVENUE_SIGNAL_STORE_PATH, "utf8");
    const store = revenueSignalStoreSchema.parse(JSON.parse(raw));
    inMemoryRevenueSignalStore = store;
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryRevenueSignalStore;
    }

    throw error;
  }
}

async function writeStore(store: Record<string, RevenueSignal>): Promise<void> {
  const parsed = revenueSignalStoreSchema.parse(store);
  inMemoryRevenueSignalStore = parsed;

  try {
    await mkdir(path.dirname(REVENUE_SIGNAL_STORE_PATH), { recursive: true });
    await writeFile(REVENUE_SIGNAL_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("revenue-signals", error);
      return;
    }

    throw error;
  }
}

export function buildRevenueSignalsFromInputs(input: {
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
  signals?: SignalRecord[];
}): RevenueSignal[] {
  const signalsById = new Map((input.signals ?? []).map((signal) => [signal.recordId, signal]));
  const outcomesByPostingId = new Map(
    input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]),
  );

  return input.postingEntries
    .map((entry) => {
      const outcome = outcomesByPostingId.get(entry.id);
      if (!outcome) {
        return null;
      }

      const type = inferRevenueType(outcome);
      if (type === "unknown" && outcome.strategicValue === "low") {
        return null;
      }

      return buildRecord(entry, signalsById.get(entry.signalId), {
        type,
        strength: inferRevenueStrength(outcome, type),
        confidence: inferRevenueConfidence(outcome, type),
        notes: outcome.note,
        timestamp: outcome.recordedAt,
        source: "inferred",
      });
    })
    .filter((record): record is RevenueSignal => record !== null)
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
        right.revenueSignalId.localeCompare(left.revenueSignalId),
    );
}

export async function syncRevenueSignals(input: {
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
  signals?: SignalRecord[];
}): Promise<RevenueSignal[]> {
  const persisted = await readPersistedStore();
  const nextRecords = buildRevenueSignalsFromInputs(input);
  const nextStore = { ...persisted };
  const createdOrChanged: RevenueSignal[] = [];

  for (const record of nextRecords) {
    const previous = persisted[record.postingId];
    const merged =
      previous?.source === "manual"
        ? revenueSignalSchema.parse({
            ...record,
            ...previous,
            platform: record.platform,
            destination: record.destination,
            utmTag: record.utmTag,
            campaignId: record.campaignId,
            editorialMode: record.editorialMode,
            patternId: record.patternId,
            patternName: record.patternName,
          })
        : revenueSignalSchema.parse({
            ...previous,
            ...record,
            notes: record.notes ?? previous?.notes ?? null,
          });

    nextStore[record.postingId] = merged;

    if (!previous || JSON.stringify(previous) !== JSON.stringify(merged)) {
      createdOrChanged.push(merged);
    }
  }

  if (createdOrChanged.length > 0) {
    await writeStore(nextStore);
    await appendAuditEventsSafe(
      createdOrChanged.map((record) => ({
        signalId: record.signalId,
        eventType: "REVENUE_SIGNAL_RECORDED" as const,
        actor: "system" as const,
        summary: `Recorded ${record.strength} ${record.type} revenue signal for ${record.platform}.`,
        metadata: {
          postingId: record.postingId,
          type: record.type,
          strength: record.strength,
          confidence: record.confidence,
          destination: record.destination,
          source: record.source,
        },
      })),
    );
  }

  return Object.values({
    ...buildSeedStore(),
    ...nextStore,
  }).sort(
    (left, right) =>
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
      right.revenueSignalId.localeCompare(left.revenueSignalId),
  );
}

export async function upsertRevenueSignal(input: {
  postingEntry: PostingLogEntry;
  signal?: SignalRecord | null;
  type: RevenueSignalType;
  strength: RevenueSignalStrength;
  confidence: RevenueSignalConfidence;
  notes?: string | null;
}): Promise<{
  revenueSignal: RevenueSignal;
  previous: RevenueSignal | null;
  created: boolean;
}> {
  const persisted = await readPersistedStore();
  const previous = persisted[input.postingEntry.id] ?? buildSeedStore()[input.postingEntry.id] ?? null;
  const revenueSignal = buildRecord(input.postingEntry, input.signal, {
    type: input.type,
    strength: input.strength,
    confidence: input.confidence,
    notes: input.notes ?? null,
    timestamp: new Date().toISOString(),
    source: "manual",
  });

  persisted[input.postingEntry.id] = revenueSignal;
  await writeStore(persisted);

  await appendAuditEventsSafe([
    {
      signalId: input.postingEntry.signalId,
      eventType: "REVENUE_SIGNAL_RECORDED",
      actor: "operator",
      summary: `Recorded ${revenueSignal.strength} ${revenueSignal.type} revenue signal for ${input.postingEntry.platform}.`,
      metadata: {
        postingId: input.postingEntry.id,
        type: revenueSignal.type,
        strength: revenueSignal.strength,
        confidence: revenueSignal.confidence,
        destination: revenueSignal.destination,
        source: revenueSignal.source,
      },
    },
  ]);

  return {
    revenueSignal,
    previous,
    created: !previous,
  };
}

export async function getRevenueSignal(postingId: string): Promise<RevenueSignal | null> {
  const store = {
    ...buildSeedStore(),
    ...(await readPersistedStore()),
  };
  return store[postingId] ?? null;
}

export async function listRevenueSignals(options?: {
  signalIds?: string[];
  postingIds?: string[];
}): Promise<RevenueSignal[]> {
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
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
        right.revenueSignalId.localeCompare(left.revenueSignalId),
    );
}

function buildRows(
  records: RevenueSignal[],
  selector: (record: RevenueSignal) => { key: string; label: string } | null,
) {
  const rows = new Map<string, RevenueSignalInsightRow>();

  for (const record of records) {
    const row = selector(record);
    if (!row) {
      continue;
    }

    const current = rows.get(row.key) ?? {
      key: row.key,
      label: row.label,
      count: 0,
      highStrengthCount: 0,
    };
    current.count += 1;
    if (record.strength === "high") {
      current.highStrengthCount += 1;
    }
    rows.set(row.key, current);
  }

  return Array.from(rows.values())
    .sort(
      (left, right) =>
        right.highStrengthCount - left.highStrengthCount ||
        right.count - left.count ||
        left.label.localeCompare(right.label),
    )
    .slice(0, 5);
}

export function buildRevenueSignalInsights(records: RevenueSignal[]): RevenueSignalInsights {
  const highStrengthCount = records.filter((record) => record.strength === "high").length;
  const highConfidenceCount = records.filter((record) => record.confidence === "high").length;
  const paidCount = records.filter((record) => record.type === "paid").length;
  const trialCount = records.filter((record) => record.type === "trial").length;
  const signupCount = records.filter((record) => record.type === "signup").length;

  const topDestinationRows = buildRows(records, (record) =>
    record.destination
      ? {
          key: record.destination.toLowerCase(),
          label: record.destination,
        }
      : null,
  );
  const topPlatformRows = buildRows(records, (record) => ({
    key: record.platform,
    label:
      record.platform === "x"
        ? "X"
        : record.platform === "linkedin"
          ? "LinkedIn"
          : "Reddit",
  }));
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
    summaries.push(`${topPlatformDestinationRows[0].label} is the strongest current revenue-linked combo.`);
  }
  if (topPatternRows[0]) {
    summaries.push(`${topPatternRows[0].label} is the strongest current revenue-linked pattern or mode.`);
  }
  if (topDestinationRows[0]) {
    summaries.push(`${topDestinationRows[0].label} is the destination most often tied to revenue signals.`);
  }

  return {
    recordedCount: records.length,
    highStrengthCount,
    highConfidenceCount,
    paidCount,
    trialCount,
    signupCount,
    recentSignals: records.slice(0, 5),
    topDestinationRows,
    topPlatformRows,
    topPlatformDestinationRows,
    topPatternRows,
    summaries: summaries.slice(0, 3),
  };
}

export function buildRevenueHistorySnapshot(input: {
  records: RevenueSignal[];
  platform: PostingPlatform;
  destination: string | null;
  editorialMode?: SignalRecord["editorialMode"];
}): RevenueHistorySnapshot {
  const matched = input.records.filter((record) => {
    const platformMatch = record.platform === input.platform;
    const destinationMatch = input.destination
      ? record.destination?.toLowerCase() === input.destination.toLowerCase()
      : true;
    const modeMatch = input.editorialMode ? record.editorialMode === input.editorialMode : true;
    return platformMatch && destinationMatch && modeMatch;
  });

  const totalScore = matched.reduce((sum, record) => sum + scoreRevenueSignal(record), 0);

  return {
    sampleCount: matched.length,
    highStrengthCount: matched.filter((record) => record.strength === "high").length,
    paidCount: matched.filter((record) => record.type === "paid").length,
    trialCount: matched.filter((record) => record.type === "trial").length,
    signupCount: matched.filter((record) => record.type === "signup").length,
    lowStrengthCount: matched.filter((record) => record.strength === "low").length,
    averageScore: matched.length > 0 ? totalScore / matched.length : 0,
  };
}
