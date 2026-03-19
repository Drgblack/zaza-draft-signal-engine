import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  feedbackEntrySchema,
  type FeedbackActor,
  type FeedbackCategory,
  type FeedbackValue,
  type SignalFeedback,
} from "@/lib/feedback-definitions";
import { mockFeedbackSeed } from "@/lib/mock-data";

const FEEDBACK_STORE_PATH = path.join(process.cwd(), "data", "signal-feedback.json");

const feedbackStoreSchema = z.record(z.string(), z.array(feedbackEntrySchema));

export interface CreateFeedbackInput {
  signalId: string;
  category: FeedbackCategory;
  value: FeedbackValue;
  note?: string | null;
  actor?: FeedbackActor;
}

function sortFeedback(entries: SignalFeedback[]): SignalFeedback[] {
  return [...entries].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

function buildSeedFeedbackStore(): Record<string, SignalFeedback[]> {
  const store: Record<string, SignalFeedback[]> = {};

  for (const entry of mockFeedbackSeed) {
    const parsed = feedbackEntrySchema.parse(entry);
    store[parsed.signalId] = [...(store[parsed.signalId] ?? []), parsed];
  }

  return Object.fromEntries(Object.entries(store).map(([signalId, entries]) => [signalId, sortFeedback(entries)]));
}

function mergeFeedbackStores(
  baseStore: Record<string, SignalFeedback[]>,
  persistedStore: Record<string, SignalFeedback[]>,
): Record<string, SignalFeedback[]> {
  const merged: Record<string, SignalFeedback[]> = {};
  const signalIds = new Set([...Object.keys(baseStore), ...Object.keys(persistedStore)]);

  for (const signalId of signalIds) {
    const deduped = new Map<string, SignalFeedback>();

    for (const entry of [...(baseStore[signalId] ?? []), ...(persistedStore[signalId] ?? [])]) {
      deduped.set(entry.id, entry);
    }

    merged[signalId] = sortFeedback(Array.from(deduped.values()));
  }

  return merged;
}

async function readPersistedFeedbackStore(): Promise<Record<string, SignalFeedback[]>> {
  try {
    const raw = await readFile(FEEDBACK_STORE_PATH, "utf8");
    return feedbackStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function readFeedbackStore(): Promise<Record<string, SignalFeedback[]>> {
  return mergeFeedbackStores(buildSeedFeedbackStore(), await readPersistedFeedbackStore());
}

async function writeFeedbackStore(store: Record<string, SignalFeedback[]>): Promise<void> {
  await mkdir(path.dirname(FEEDBACK_STORE_PATH), { recursive: true });
  await writeFile(FEEDBACK_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildFeedbackEntry(input: CreateFeedbackInput): SignalFeedback {
  return feedbackEntrySchema.parse({
    id: crypto.randomUUID(),
    signalId: input.signalId,
    timestamp: new Date().toISOString(),
    category: input.category,
    value: input.value,
    note: normalizeNote(input.note),
    actor: input.actor ?? "operator",
  });
}

export async function appendFeedback(input: CreateFeedbackInput): Promise<SignalFeedback> {
  const entry = buildFeedbackEntry(input);
  const store = await readPersistedFeedbackStore();
  store[entry.signalId] = sortFeedback([...(store[entry.signalId] ?? []), entry]);
  await writeFeedbackStore(store);
  return entry;
}

export async function getFeedbackEntries(signalId: string): Promise<SignalFeedback[]> {
  const store = await readFeedbackStore();
  return sortFeedback(store[signalId] ?? []);
}

export async function listFeedbackEntries(options?: {
  signalIds?: string[];
}): Promise<SignalFeedback[]> {
  const store = await readFeedbackStore();
  const allowedSignalIds = options?.signalIds ? new Set(options.signalIds) : null;

  return Object.entries(store)
    .filter(([signalId]) => (allowedSignalIds ? allowedSignalIds.has(signalId) : true))
    .flatMap(([, entries]) => entries)
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}
