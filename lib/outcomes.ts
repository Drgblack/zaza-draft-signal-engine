import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { mockPostingOutcomeSeed } from "@/lib/mock-data";
import {
  buildLearningInputSignature,
  buildLearningRecordId,
  upsertLearningRecord,
} from "@/lib/learning-loop";
import {
  postingOutcomeSchema,
  type PostingOutcome,
  type UpsertPostingOutcomeInput,
} from "@/lib/outcome-memory";

const POSTING_OUTCOME_STORE_PATH = path.join(process.cwd(), "data", "posting-outcomes.json");

const postingOutcomeStoreSchema = z.record(z.string(), postingOutcomeSchema);

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildSeedOutcomeStore(): Record<string, PostingOutcome> {
  const store: Record<string, PostingOutcome> = {};

  for (const entry of mockPostingOutcomeSeed) {
    const parsed = postingOutcomeSchema.parse(entry);
    store[parsed.postingLogId] = parsed;
  }

  return store;
}

async function readPersistedOutcomeStore(): Promise<Record<string, PostingOutcome>> {
  try {
    const raw = await readFile(POSTING_OUTCOME_STORE_PATH, "utf8");
    return postingOutcomeStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function readOutcomeStore(): Promise<Record<string, PostingOutcome>> {
  return {
    ...buildSeedOutcomeStore(),
    ...(await readPersistedOutcomeStore()),
  };
}

async function writeOutcomeStore(store: Record<string, PostingOutcome>): Promise<void> {
  await mkdir(path.dirname(POSTING_OUTCOME_STORE_PATH), { recursive: true });
  await writeFile(POSTING_OUTCOME_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildPostingOutcome(input: UpsertPostingOutcomeInput, existing?: PostingOutcome | null): PostingOutcome {
  return postingOutcomeSchema.parse({
    id: existing?.id ?? crypto.randomUUID(),
    postingLogId: input.postingLogId,
    signalId: input.signalId,
    platform: input.platform,
    outcomeQuality: input.outcomeQuality,
    reuseRecommendation: input.reuseRecommendation,
    note: normalizeOptionalText(input.note),
    timestamp: new Date().toISOString(),
    actor: input.actor ?? "operator",
  });
}

export async function getPostingOutcome(postingLogId: string): Promise<PostingOutcome | null> {
  const store = await readOutcomeStore();
  return store[postingLogId] ?? null;
}

export async function listPostingOutcomes(options?: {
  signalIds?: string[];
  postingLogIds?: string[];
}): Promise<PostingOutcome[]> {
  const store = await readOutcomeStore();
  const allowedSignalIds = options?.signalIds ? new Set(options.signalIds) : null;
  const allowedPostingLogIds = options?.postingLogIds ? new Set(options.postingLogIds) : null;

  return Object.values(store)
    .filter((entry) => (allowedSignalIds ? allowedSignalIds.has(entry.signalId) : true))
    .filter((entry) => (allowedPostingLogIds ? allowedPostingLogIds.has(entry.postingLogId) : true))
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
        right.id.localeCompare(left.id),
    );
}

export async function upsertPostingOutcome(input: UpsertPostingOutcomeInput): Promise<{
  outcome: PostingOutcome;
  previous: PostingOutcome | null;
  created: boolean;
}> {
  const persistedStore = await readPersistedOutcomeStore();
  const seedStore = buildSeedOutcomeStore();
  const previous = persistedStore[input.postingLogId] ?? seedStore[input.postingLogId] ?? null;
  const outcome = buildPostingOutcome(input, previous);
  persistedStore[input.postingLogId] = outcome;
  await writeOutcomeStore(persistedStore);
  const inputSignature = buildLearningInputSignature("signal", {
    platform: outcome.platform,
  });
  await upsertLearningRecord({
    learningRecordId: buildLearningRecordId({
      inputSignature,
      stage: "signal_outcome",
      sourceId: outcome.postingLogId,
    }),
    inputSignature,
    outcome: outcome.outcomeQuality === "weak" ? "rejected" : "success",
    retries: 0,
    cost: 0,
    timestamp: outcome.timestamp,
    inputType: "signal",
    stage: "signal_outcome",
    actionType: "posting_outcome",
    sourceId: outcome.postingLogId,
    platform: outcome.platform,
  });

  return {
    outcome,
    previous,
    created: !previous,
  };
}

export function indexOutcomesByPostingLogId(outcomes: PostingOutcome[]): Record<string, PostingOutcome> {
  return Object.fromEntries(outcomes.map((outcome) => [outcome.postingLogId, outcome]));
}

export {
  getOutcomeQualityLabel,
  getReuseRecommendationLabel,
  OUTCOME_QUALITIES,
  postingOutcomeRequestSchema,
  postingOutcomeSchema,
  REUSE_RECOMMENDATIONS,
  type OutcomeQuality,
  type PostingOutcome,
  type ReuseRecommendation,
  type UpsertPostingOutcomeInput,
} from "@/lib/outcome-memory";
