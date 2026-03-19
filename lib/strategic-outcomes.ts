import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { mockStrategicOutcomeSeed } from "@/lib/mock-data";
import {
  strategicOutcomeSchema,
  type StrategicOutcome,
  type UpsertStrategicOutcomeInput,
} from "@/lib/strategic-outcome-memory";

const strategicOutcomeStoreSchema = z.record(z.string(), strategicOutcomeSchema);
const STRATEGIC_OUTCOME_STORE_PATH = path.join(process.cwd(), "data", "strategic-outcomes.json");

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMetric(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function buildSeedStore(): Record<string, StrategicOutcome> {
  const store: Record<string, StrategicOutcome> = {};

  for (const entry of mockStrategicOutcomeSeed) {
    const parsed = strategicOutcomeSchema.parse(entry);
    store[parsed.postingLogId] = parsed;
  }

  return store;
}

async function readPersistedStore(): Promise<Record<string, StrategicOutcome>> {
  try {
    const raw = await readFile(STRATEGIC_OUTCOME_STORE_PATH, "utf8");
    return strategicOutcomeStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function readStore(): Promise<Record<string, StrategicOutcome>> {
  return {
    ...buildSeedStore(),
    ...(await readPersistedStore()),
  };
}

async function writeStore(store: Record<string, StrategicOutcome>): Promise<void> {
  await mkdir(path.dirname(STRATEGIC_OUTCOME_STORE_PATH), { recursive: true });
  await writeFile(STRATEGIC_OUTCOME_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildStrategicOutcome(
  input: UpsertStrategicOutcomeInput,
  existing?: StrategicOutcome | null,
): StrategicOutcome {
  return strategicOutcomeSchema.parse({
    id: existing?.id ?? crypto.randomUUID(),
    postingLogId: input.postingLogId,
    signalId: input.signalId,
    platform: input.platform,
    recordedAt: new Date().toISOString(),
    impressionsOrReach: normalizeMetric(input.impressionsOrReach),
    savesOrBookmarks: normalizeMetric(input.savesOrBookmarks),
    sharesOrReposts: normalizeMetric(input.sharesOrReposts),
    commentsOrReplies: normalizeMetric(input.commentsOrReplies),
    clicks: normalizeMetric(input.clicks),
    leadsOrSignups: normalizeMetric(input.leadsOrSignups),
    trialsOrConversions: normalizeMetric(input.trialsOrConversions),
    strategicValue: input.strategicValue,
    note: normalizeOptionalText(input.note),
    actor: input.actor ?? "operator",
  });
}

export async function getStrategicOutcome(postingLogId: string): Promise<StrategicOutcome | null> {
  const store = await readStore();
  return store[postingLogId] ?? null;
}

export async function listStrategicOutcomes(options?: {
  signalIds?: string[];
  postingLogIds?: string[];
}): Promise<StrategicOutcome[]> {
  const store = await readStore();
  const allowedSignalIds = options?.signalIds ? new Set(options.signalIds) : null;
  const allowedPostingLogIds = options?.postingLogIds ? new Set(options.postingLogIds) : null;

  return Object.values(store)
    .filter((entry) => (allowedSignalIds ? allowedSignalIds.has(entry.signalId) : true))
    .filter((entry) => (allowedPostingLogIds ? allowedPostingLogIds.has(entry.postingLogId) : true))
    .sort(
      (left, right) =>
        new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime() ||
        right.id.localeCompare(left.id),
    );
}

export async function upsertStrategicOutcome(input: UpsertStrategicOutcomeInput): Promise<{
  outcome: StrategicOutcome;
  previous: StrategicOutcome | null;
  created: boolean;
}> {
  const persistedStore = await readPersistedStore();
  const seedStore = buildSeedStore();
  const previous = persistedStore[input.postingLogId] ?? seedStore[input.postingLogId] ?? null;
  const outcome = buildStrategicOutcome(input, previous);
  persistedStore[input.postingLogId] = outcome;
  await writeStore(persistedStore);

  return {
    outcome,
    previous,
    created: !previous,
  };
}

export function indexStrategicOutcomesByPostingLogId(
  outcomes: StrategicOutcome[],
): Record<string, StrategicOutcome> {
  return Object.fromEntries(outcomes.map((outcome) => [outcome.postingLogId, outcome]));
}
