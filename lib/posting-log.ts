import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { mockPostingLogSeed } from "@/lib/mock-data";
import {
  normalizeOptionalPostingText,
  normalizePostingIsoDateTime,
  postingLogEntrySchema,
  sortPostingEntries,
  type CreatePostingLogInput,
  type PostingLogEntry,
} from "@/lib/posting-memory";

const POSTING_LOG_STORE_PATH = path.join(process.cwd(), "data", "posting-log.json");

const postingLogStoreSchema = z.record(z.string(), z.array(postingLogEntrySchema));

function buildSeedPostingStore(): Record<string, PostingLogEntry[]> {
  const store: Record<string, PostingLogEntry[]> = {};

  for (const entry of mockPostingLogSeed) {
    const parsed = postingLogEntrySchema.parse(entry);
    store[parsed.signalId] = [...(store[parsed.signalId] ?? []), parsed];
  }

  return Object.fromEntries(Object.entries(store).map(([signalId, entries]) => [signalId, sortPostingEntries(entries)]));
}

function mergePostingStores(
  baseStore: Record<string, PostingLogEntry[]>,
  persistedStore: Record<string, PostingLogEntry[]>,
): Record<string, PostingLogEntry[]> {
  const merged: Record<string, PostingLogEntry[]> = {};
  const signalIds = new Set([...Object.keys(baseStore), ...Object.keys(persistedStore)]);

  for (const signalId of signalIds) {
    const deduped = new Map<string, PostingLogEntry>();

    for (const entry of [...(baseStore[signalId] ?? []), ...(persistedStore[signalId] ?? [])]) {
      deduped.set(entry.id, entry);
    }

    merged[signalId] = sortPostingEntries(Array.from(deduped.values()));
  }

  return merged;
}

async function readPersistedPostingStore(): Promise<Record<string, PostingLogEntry[]>> {
  try {
    const raw = await readFile(POSTING_LOG_STORE_PATH, "utf8");
    return postingLogStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function readPostingStore(): Promise<Record<string, PostingLogEntry[]>> {
  return mergePostingStores(buildSeedPostingStore(), await readPersistedPostingStore());
}

async function writePostingStore(store: Record<string, PostingLogEntry[]>): Promise<void> {
  await mkdir(path.dirname(POSTING_LOG_STORE_PATH), { recursive: true });
  await writeFile(POSTING_LOG_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildPostingLogEntry(input: CreatePostingLogInput): PostingLogEntry {
  return postingLogEntrySchema.parse({
    id: crypto.randomUUID(),
    signalId: input.signalId,
    platform: input.platform,
    postedAt: normalizePostingIsoDateTime(input.postedAt),
    finalPostedText: input.finalPostedText.trim(),
    postUrl: normalizeOptionalPostingText(input.postUrl),
    note: normalizeOptionalPostingText(input.note),
    createdBy: input.createdBy?.trim() || "operator",
    editorialMode: input.editorialMode ?? null,
    patternId: normalizeOptionalPostingText(input.patternId),
    patternName: normalizeOptionalPostingText(input.patternName),
    scenarioAngle: normalizeOptionalPostingText(input.scenarioAngle),
    sourceDraftStatus: input.sourceDraftStatus ?? null,
  });
}

export async function appendPostingLogEntry(input: CreatePostingLogInput): Promise<PostingLogEntry> {
  const entry = buildPostingLogEntry(input);
  const store = await readPersistedPostingStore();
  store[entry.signalId] = sortPostingEntries([...(store[entry.signalId] ?? []), entry]);
  await writePostingStore(store);
  return entry;
}

export async function getPostingLogEntries(signalId: string): Promise<PostingLogEntry[]> {
  const store = await readPostingStore();
  return sortPostingEntries(store[signalId] ?? []);
}

export async function listPostingLogEntries(options?: {
  signalIds?: string[];
}): Promise<PostingLogEntry[]> {
  const store = await readPostingStore();
  const allowedSignalIds = options?.signalIds ? new Set(options.signalIds) : null;

  return Object.entries(store)
    .filter(([signalId]) => (allowedSignalIds ? allowedSignalIds.has(signalId) : true))
    .flatMap(([, entries]) => entries)
    .sort(
      (left, right) =>
        new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime() ||
        right.id.localeCompare(left.id),
    );
}

export function indexPostingEntriesBySignalId(entries: PostingLogEntry[]): Record<string, PostingLogEntry[]> {
  const index: Record<string, PostingLogEntry[]> = {};

  for (const entry of entries) {
    index[entry.signalId] = [...(index[entry.signalId] ?? []), entry];
  }

  return Object.fromEntries(
    Object.entries(index).map(([signalId, signalEntries]) => [signalId, sortPostingEntries(signalEntries)]),
  );
}

export {
  buildSignalPostingSummary,
  createPostingLogRequestSchema,
  getPostingPlatformLabel,
  POSTING_PLATFORMS,
  postingLogEntrySchema,
  type CreatePostingLogInput,
  type PostingLogEntry,
  type PostingPlatform,
  type SignalPostingSummary,
  type SignalPostingSummaryRow,
} from "@/lib/posting-memory";
