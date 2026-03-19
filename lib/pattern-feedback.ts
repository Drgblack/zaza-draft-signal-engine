import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { mockPatternFeedbackSeed } from "@/lib/mock-data";
import {
  patternFeedbackEntrySchema,
  type PatternFeedbackEntry,
  type PatternFeedbackValue,
} from "@/lib/pattern-feedback-definitions";

const PATTERN_FEEDBACK_STORE_PATH = path.join(process.cwd(), "data", "pattern-feedback.json");

const patternFeedbackStoreSchema = z.record(z.string(), z.array(patternFeedbackEntrySchema));

function sortPatternFeedback(entries: PatternFeedbackEntry[]): PatternFeedbackEntry[] {
  return [...entries].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

function buildSeedPatternFeedbackStore(): Record<string, PatternFeedbackEntry[]> {
  const store: Record<string, PatternFeedbackEntry[]> = {};

  for (const entry of mockPatternFeedbackSeed) {
    const parsed = patternFeedbackEntrySchema.parse(entry);
    store[parsed.patternId] = [...(store[parsed.patternId] ?? []), parsed];
  }

  return Object.fromEntries(Object.entries(store).map(([patternId, entries]) => [patternId, sortPatternFeedback(entries)]));
}

function mergePatternFeedbackStores(
  baseStore: Record<string, PatternFeedbackEntry[]>,
  persistedStore: Record<string, PatternFeedbackEntry[]>,
): Record<string, PatternFeedbackEntry[]> {
  const merged: Record<string, PatternFeedbackEntry[]> = {};
  const patternIds = new Set([...Object.keys(baseStore), ...Object.keys(persistedStore)]);

  for (const patternId of patternIds) {
    const deduped = new Map<string, PatternFeedbackEntry>();

    for (const entry of [...(baseStore[patternId] ?? []), ...(persistedStore[patternId] ?? [])]) {
      deduped.set(entry.id, entry);
    }

    merged[patternId] = sortPatternFeedback(Array.from(deduped.values()));
  }

  return merged;
}

async function readPersistedPatternFeedbackStore(): Promise<Record<string, PatternFeedbackEntry[]>> {
  try {
    const raw = await readFile(PATTERN_FEEDBACK_STORE_PATH, "utf8");
    return patternFeedbackStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function readPatternFeedbackStore(): Promise<Record<string, PatternFeedbackEntry[]>> {
  return mergePatternFeedbackStores(buildSeedPatternFeedbackStore(), await readPersistedPatternFeedbackStore());
}

async function writePatternFeedbackStore(store: Record<string, PatternFeedbackEntry[]>): Promise<void> {
  await mkdir(path.dirname(PATTERN_FEEDBACK_STORE_PATH), { recursive: true });
  await writeFile(PATTERN_FEEDBACK_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function appendPatternFeedback(input: {
  patternId: string;
  value: PatternFeedbackValue;
  note?: string | null;
}): Promise<PatternFeedbackEntry> {
  const entry = patternFeedbackEntrySchema.parse({
    id: crypto.randomUUID(),
    patternId: input.patternId,
    timestamp: new Date().toISOString(),
    value: input.value,
    note: normalizeNote(input.note),
    actor: "operator",
  });

  const store = await readPersistedPatternFeedbackStore();
  store[entry.patternId] = sortPatternFeedback([...(store[entry.patternId] ?? []), entry]);
  await writePatternFeedbackStore(store);
  return entry;
}

export async function getPatternFeedbackEntries(patternId: string): Promise<PatternFeedbackEntry[]> {
  const store = await readPatternFeedbackStore();
  return sortPatternFeedback(store[patternId] ?? []);
}

export async function listPatternFeedbackEntries(options?: {
  patternIds?: string[];
}): Promise<PatternFeedbackEntry[]> {
  const store = await readPatternFeedbackStore();
  const allowedPatternIds = options?.patternIds ? new Set(options.patternIds) : null;

  return Object.entries(store)
    .filter(([patternId]) => (allowedPatternIds ? allowedPatternIds.has(patternId) : true))
    .flatMap(([, entries]) => entries)
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}
