import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { mockPlaybookCardSeed } from "@/lib/mock-data";
import type { PatternBundle, PatternBundleSummary } from "@/lib/pattern-bundles";
import type { SignalPattern } from "@/lib/pattern-definitions";
import {
  PLAYBOOK_CARD_STATUSES,
  type PlaybookCard,
  type PlaybookCardFormValues,
  type PlaybookCardMatch,
  type PlaybookCardStatus,
  type PlaybookCardSummary,
} from "@/lib/playbook-card-definitions";
import { getSourceProfile } from "@/lib/source-profiles";
import { EDITORIAL_MODES, type EditorialMode, type SignalRecord } from "@/types/signal";

const PLAYBOOK_CARD_STORE_PATH = path.join(process.cwd(), "data", "playbook-cards.json");

export const playbookCardSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(320),
  situation: z.string().trim().min(1).max(500),
  whatWorks: z.string().trim().min(1).max(500),
  whatToAvoid: z.string().trim().min(1).max(500),
  suggestedModes: z.array(z.enum(EDITORIAL_MODES)).max(4),
  relatedPatternIds: z.array(z.string().trim().min(1)).max(8),
  relatedBundleIds: z.array(z.string().trim().min(1)).max(8),
  relatedTags: z.array(z.string().trim().min(1).max(48)).max(8),
  status: z.enum(PLAYBOOK_CARD_STATUSES).default("active"),
  createdAt: z.string().trim().min(1),
  createdBy: z.string().trim().min(1).max(80),
});

const playbookCardStoreSchema = z.record(z.string(), playbookCardSchema);

export interface CreatePlaybookCardInput extends PlaybookCardFormValues {
  createdBy?: string | null;
}

export type UpdatePlaybookCardInput = Partial<PlaybookCardFormValues>;


type MatchOptions = {
  signal: SignalRecord;
  cards: PlaybookCard[];
  editorialMode?: EditorialMode | null;
  patternIds?: string[];
  bundleIds?: string[];
  familyLabels?: string[];
  limit?: number;
};

const PLAYBOOK_STOPWORDS = new Set([
  "that",
  "this",
  "with",
  "when",
  "what",
  "from",
  "into",
  "your",
  "they",
  "them",
  "then",
  "than",
  "their",
  "have",
  "were",
  "been",
  "does",
  "should",
  "would",
  "could",
  "about",
  "before",
  "after",
  "still",
  "very",
  "more",
  "most",
  "just",
  "need",
  "needs",
  "teacher",
  "teachers",
  "communication",
  "message",
  "messages",
  "situation",
  "situations",
]);

function sortCards(cards: PlaybookCard[]): PlaybookCard[] {
  return [...cards].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "active" ? -1 : 1;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTags(values: string[] | null | undefined): string[] {
  if (!values) {
    return [];
  }

  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    deduped.add(normalized.slice(0, 48));
    if (deduped.size >= 8) {
      break;
    }
  }

  return Array.from(deduped);
}

function buildSeedStore(): Record<string, PlaybookCard> {
  const store: Record<string, PlaybookCard> = {};

  for (const card of mockPlaybookCardSeed) {
    const parsed = playbookCardSchema.parse(card);
    store[parsed.id] = parsed;
  }

  return store;
}

async function readPersistedStore(): Promise<Record<string, PlaybookCard>> {
  try {
    const raw = await readFile(PLAYBOOK_CARD_STORE_PATH, "utf8");
    return playbookCardStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function readStore(): Promise<Record<string, PlaybookCard>> {
  return {
    ...buildSeedStore(),
    ...(await readPersistedStore()),
  };
}

async function writeStore(store: Record<string, PlaybookCard>): Promise<void> {
  await mkdir(path.dirname(PLAYBOOK_CARD_STORE_PATH), { recursive: true });
  await writeFile(PLAYBOOK_CARD_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildCard(input: CreatePlaybookCardInput): PlaybookCard {
  return playbookCardSchema.parse({
    id: crypto.randomUUID(),
    title: input.title.trim(),
    summary: input.summary.trim(),
    situation: input.situation.trim(),
    whatWorks: input.whatWorks.trim(),
    whatToAvoid: input.whatToAvoid.trim(),
    suggestedModes: input.suggestedModes ?? [],
    relatedPatternIds: Array.from(new Set(input.relatedPatternIds ?? [])).slice(0, 8),
    relatedBundleIds: Array.from(new Set(input.relatedBundleIds ?? [])).slice(0, 8),
    relatedTags: normalizeTags(input.relatedTags),
    status: input.status ?? "active",
    createdAt: new Date().toISOString(),
    createdBy: normalizeText(input.createdBy) ?? "operator",
  });
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 4 && !PLAYBOOK_STOPWORDS.has(token));
}

function keywordSet(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(tokenize(values.filter(Boolean).join(" ")))).slice(0, 18);
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function buildReason(matchedOn: string[]): string {
  if (matchedOn[0]) {
    return matchedOn[0].charAt(0).toUpperCase() + matchedOn[0].slice(1) + ".";
  }

  return "Situation overlap suggests this card may help.";
}

function scoreMatch(card: PlaybookCard, input: MatchOptions): PlaybookCardMatch | null {
  if (card.status === "retired") {
    return null;
  }

  const matchedOn: string[] = [];
  let score = 0;
  const currentKeywords = keywordSet([
    input.signal.sourceTitle,
    input.signal.manualSummary,
    input.signal.rawExcerpt,
    input.signal.scenarioAngle,
    input.signal.signalSubtype,
    input.signal.teacherPainPoint,
    input.signal.contentAngle,
  ]);
  const cardKeywords = keywordSet([
    card.title,
    card.summary,
    card.situation,
    card.whatWorks,
    card.whatToAvoid,
    card.relatedTags.join(" "),
  ]);
  const sharedKeywords = intersect(currentKeywords, cardKeywords);
  const sharedPatternIds = intersect(input.patternIds ?? [], card.relatedPatternIds);
  const sharedBundleIds = intersect(input.bundleIds ?? [], card.relatedBundleIds);
  const normalizedFamilyLabels = (input.familyLabels ?? []).map((label) => label.toLowerCase());
  const sharedTags = intersect(normalizedFamilyLabels, card.relatedTags);
  const sourceProfile = getSourceProfile(input.signal);

  if (sharedPatternIds.length > 0) {
    score += 6;
    matchedOn.push("linked to a related saved pattern");
  }

  if (sharedBundleIds.length > 0) {
    score += 5;
    matchedOn.push("linked to a related bundle");
  }

  if (input.editorialMode && card.suggestedModes.includes(input.editorialMode)) {
    score += 4;
    matchedOn.push("suggested mode aligns with the current editorial direction");
  }

  if (
    card.relatedTags.includes(sourceProfile.sourceKind.toLowerCase()) ||
    card.relatedTags.includes(sourceProfile.kindLabel.toLowerCase())
  ) {
    score += 2;
    matchedOn.push("built for the same source family");
  }

  if (input.signal.signalCategory && card.relatedTags.includes(input.signal.signalCategory.toLowerCase())) {
    score += 2;
    matchedOn.push(`shares the same ${input.signal.signalCategory.toLowerCase()} family`);
  }

  if (sharedTags.length > 0) {
    score += 3;
    matchedOn.push(`shares the same family label: ${sharedTags[0]}`);
  }

  if (sharedKeywords.length >= 4) {
    score += 3;
    matchedOn.push("situation wording overlaps strongly");
  } else if (sharedKeywords.length >= 2) {
    score += 2;
    matchedOn.push("situation wording overlaps");
  }

  if (score < 4) {
    return null;
  }

  return {
    card,
    reason: buildReason(matchedOn),
    score,
    matchedOn,
  };
}

export const createPlaybookCardRequestSchema = z.object({
  title: z.string().trim().min(1, "Card title is required.").max(120),
  summary: z.string().trim().min(1, "Summary is required.").max(320),
  situation: z.string().trim().min(1, "Situation is required.").max(500),
  whatWorks: z.string().trim().min(1, "What works is required.").max(500),
  whatToAvoid: z.string().trim().min(1, "What to avoid is required.").max(500),
  suggestedModes: z.array(z.enum(EDITORIAL_MODES)).max(4).optional(),
  relatedPatternIds: z.array(z.string().trim().min(1)).max(8).optional(),
  relatedBundleIds: z.array(z.string().trim().min(1)).max(8).optional(),
  relatedTags: z.array(z.string().trim().min(1).max(48)).max(8).optional(),
  status: z.enum(PLAYBOOK_CARD_STATUSES).optional(),
  createdBy: z.string().trim().min(1).max(80).optional(),
});

export const updatePlaybookCardRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    summary: z.string().trim().min(1).max(320).optional(),
    situation: z.string().trim().min(1).max(500).optional(),
    whatWorks: z.string().trim().min(1).max(500).optional(),
    whatToAvoid: z.string().trim().min(1).max(500).optional(),
    suggestedModes: z.array(z.enum(EDITORIAL_MODES)).max(4).optional(),
    relatedPatternIds: z.array(z.string().trim().min(1)).max(8).optional(),
    relatedBundleIds: z.array(z.string().trim().min(1)).max(8).optional(),
    relatedTags: z.array(z.string().trim().min(1).max(48)).max(8).optional(),
    status: z.enum(PLAYBOOK_CARD_STATUSES).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "Provide at least one playbook field to update.",
  });

export function toPlaybookCardSummary(card: PlaybookCard): PlaybookCardSummary {
  return {
    id: card.id,
    title: card.title,
    summary: card.summary,
    status: card.status,
  };
}

export async function listPlaybookCards(options?: {
  includeRetired?: boolean;
  status?: PlaybookCardStatus | "all";
}): Promise<PlaybookCard[]> {
  const store = await readStore();
  const status = options?.status ?? (options?.includeRetired ? "all" : "active");

  return sortCards(
    Object.values(store).filter((card) => {
      if (status === "all") {
        return true;
      }

      return card.status === status;
    }),
  );
}

export async function getPlaybookCard(cardId: string): Promise<PlaybookCard | null> {
  const store = await readStore();
  return store[cardId] ?? null;
}

export async function appendPlaybookCard(input: CreatePlaybookCardInput): Promise<PlaybookCard> {
  const card = buildCard(input);
  const persistedStore = await readPersistedStore();
  persistedStore[card.id] = card;
  await writeStore(persistedStore);
  return card;
}

export async function updatePlaybookCard(
  cardId: string,
  input: UpdatePlaybookCardInput,
): Promise<PlaybookCard | null> {
  const store = await readStore();
  const existing = store[cardId];

  if (!existing) {
    return null;
  }

  const updated = playbookCardSchema.parse({
    ...existing,
    title: input.title?.trim() ?? existing.title,
    summary: input.summary?.trim() ?? existing.summary,
    situation: input.situation?.trim() ?? existing.situation,
    whatWorks: input.whatWorks?.trim() ?? existing.whatWorks,
    whatToAvoid: input.whatToAvoid?.trim() ?? existing.whatToAvoid,
    suggestedModes: input.suggestedModes ?? existing.suggestedModes,
    relatedPatternIds: input.relatedPatternIds ?? existing.relatedPatternIds,
    relatedBundleIds: input.relatedBundleIds ?? existing.relatedBundleIds,
    relatedTags: input.relatedTags ? normalizeTags(input.relatedTags) : existing.relatedTags,
    status: input.status ?? existing.status,
  });

  const persistedStore = await readPersistedStore();
  persistedStore[cardId] = updated;
  await writeStore(persistedStore);
  return updated;
}

export function findRelatedPlaybookCards(input: MatchOptions): PlaybookCardMatch[] {
  return input.cards
    .map((card) => scoreMatch(card, input))
    .filter((match): match is PlaybookCardMatch => match !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        new Date(right.card.createdAt).getTime() - new Date(left.card.createdAt).getTime() ||
        left.card.title.localeCompare(right.card.title),
    )
    .slice(0, input.limit ?? 2);
}

export function buildPlaybookDraftFromSignal(input: {
  signal: SignalRecord;
  suggestedMode?: EditorialMode | null;
  relatedPatternIds?: string[];
  relatedBundleIds?: string[];
  relatedTags?: string[];
}): PlaybookCardFormValues {
  const profile = getSourceProfile(input.signal);
  const baseTitle = input.signal.scenarioAngle
    ? input.signal.scenarioAngle.slice(0, 72)
    : `When ${input.signal.signalCategory?.toLowerCase() ?? "teacher"} communication is under pressure`;

  return {
    title: baseTitle,
    summary:
      normalizeText(input.signal.contentAngle) ??
      normalizeText(input.signal.manualSummary) ??
      "Compact operator guidance captured from a strong signal.",
    situation:
      normalizeText(input.signal.scenarioAngle) ??
      normalizeText(input.signal.manualSummary) ??
      input.signal.sourceTitle,
    whatWorks:
      "Keep the framing specific to the communication moment, use calm factual language, and make the next step concrete.",
    whatToAvoid:
      "Avoid generic commentary, blame language, over-defensiveness, or drifting away from the real scenario.",
    suggestedModes: input.suggestedMode ? [input.suggestedMode] : [],
    relatedPatternIds: Array.from(new Set(input.relatedPatternIds ?? [])).slice(0, 8),
    relatedBundleIds: Array.from(new Set(input.relatedBundleIds ?? [])).slice(0, 8),
    relatedTags: normalizeTags([
      input.signal.signalCategory?.toLowerCase() ?? "",
      profile.sourceKind.toLowerCase(),
      ...(input.relatedTags ?? []),
    ]),
    status: "active",
  };
}

export function buildPlaybookDraftFromPattern(input: {
  pattern: SignalPattern;
  bundleSummaries?: PatternBundleSummary[];
}): PlaybookCardFormValues {
  return {
    title: input.pattern.name,
    summary: input.pattern.description,
    situation:
      normalizeText(input.pattern.exampleScenarioAngle) ??
      normalizeText(input.pattern.exampleSignalSummary) ??
      "Reusable operator situation linked to this saved pattern.",
    whatWorks:
      normalizeText(input.pattern.exampleOutput) ??
      "Use the saved structure and tone memory from this pattern when the same situation recurs.",
    whatToAvoid:
      "Avoid copying the example mechanically or using it when the live scenario is materially different.",
    suggestedModes: [],
    relatedPatternIds: [input.pattern.id],
    relatedBundleIds: input.bundleSummaries?.map((bundle) => bundle.id) ?? [],
    relatedTags: normalizeTags(input.pattern.tags),
    status: "active",
  };
}

export function buildPlaybookDraftFromBundle(input: {
  bundle: PatternBundle;
}): PlaybookCardFormValues {
  return {
    title: input.bundle.name,
    summary: input.bundle.description,
    situation: input.bundle.description,
    whatWorks:
      "Use this family as a quick operator check for what good framing usually needs across related scenarios.",
    whatToAvoid:
      "Avoid mixing contradictory tones across related patterns or assuming the whole bundle should apply at once.",
    suggestedModes: [],
    relatedPatternIds: [],
    relatedBundleIds: [input.bundle.id],
    relatedTags: normalizeTags([input.bundle.name]),
    status: "active",
  };
}
