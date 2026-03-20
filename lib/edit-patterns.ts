import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { EditorialMode, SignalRecord } from "@/types/signal";

const EDIT_PATTERN_STORE_PATH = path.join(process.cwd(), "data", "edit-patterns.json");

export const EDIT_PATTERN_TYPES = [
  "shortened_hook",
  "softened_tone",
  "removed_claim",
  "changed_cta",
] as const;

export const EDIT_PATTERN_PLATFORMS = ["x", "linkedin", "reddit"] as const;

export type EditPatternType = (typeof EDIT_PATTERN_TYPES)[number];
export type EditPatternPlatform = (typeof EDIT_PATTERN_PLATFORMS)[number];

export const editPatternRecordSchema = z.object({
  id: z.string().trim().min(1),
  patternType: z.enum(EDIT_PATTERN_TYPES),
  frequency: z.number().int().min(1),
  platform: z.enum(EDIT_PATTERN_PLATFORMS),
  mode: z.string().trim().min(1).nullable(),
  context: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
});

const editPatternStoreSchema = z.object({
  patterns: z.array(editPatternRecordSchema).default([]),
  updatedAt: z.string().trim().min(1),
});

export const finalReviewEditSuggestionSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  platform: z.enum(EDIT_PATTERN_PLATFORMS),
  patternType: z.enum(EDIT_PATTERN_TYPES),
  frequency: z.number().int().min(1).nullable(),
});

export type EditPatternRecord = z.infer<typeof editPatternRecordSchema>;
export type FinalReviewEditSuggestion = z.infer<typeof finalReviewEditSuggestionSchema>;

interface EditPatternObservation {
  signalId: string;
  platform: EditPatternPlatform;
  patternType: EditPatternType;
  mode: EditorialMode | null;
  context: string;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
]);

const ASSERTIVE_TERMS = [
  "always",
  "never",
  "clearly",
  "obviously",
  "definitely",
  "guarantee",
  "everyone",
  "nobody",
  "must",
  "urgent",
  "immediately",
];

const CTA_TERMS = [
  "comment",
  "dm",
  "message",
  "reply",
  "share",
  "save",
  "join",
  "follow",
  "visit",
  "click",
  "read",
  "watch",
  "try",
];

function normalizeText(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function uniqueTokens(value: string | null | undefined): string[] {
  return Array.from(new Set(tokenize(value)));
}

function overlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...left, ...right]).size;

  return union === 0 ? 0 : intersection / union;
}

function slugify(value: string): string {
  const slug = normalizeText(value).replace(/\s+/g, "-");
  return slug.length > 0 ? slug.slice(0, 80) : "general";
}

function buildPatternId(observation: Pick<EditPatternObservation, "platform" | "patternType" | "mode" | "context">): string {
  return [
    "edit-pattern",
    observation.platform,
    observation.patternType,
    observation.mode ?? "all",
    slugify(observation.context),
  ].join("-");
}

function getLeadSegment(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return "";
  }

  return firstLine.split(/(?<=[.!?])\s+/)[0]?.trim() ?? firstLine;
}

function getClosingSegment(text: string): string {
  const nonEmptyLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = nonEmptyLines.at(-1) ?? "";
  if (!lastLine) {
    return "";
  }

  const sentences = lastLine.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (sentences.at(-1) ?? lastLine).trim();
}

function countMatchingTerms(text: string, terms: string[]): number {
  const normalized = normalizeText(text);
  return terms.reduce((total, term) => total + (normalized.includes(term) ? 1 : 0), 0);
}

function buildSignalContext(signal: SignalRecord): string {
  const tokens = uniqueTokens(
    [
      signal.teacherPainPoint,
      signal.signalSubtype,
      signal.contentAngle,
      signal.scenarioAngle,
      signal.sourceTitle,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return tokens.slice(0, 6).join(" ") || "general teacher communication";
}

function getGeneratedDraft(signal: SignalRecord, platform: EditPatternPlatform): string | null {
  switch (platform) {
    case "x":
      return signal.xDraft;
    case "linkedin":
      return signal.linkedInDraft;
    case "reddit":
    default:
      return signal.redditDraft;
  }
}

function getFinalDraft(signal: SignalRecord, platform: EditPatternPlatform): string | null {
  switch (platform) {
    case "x":
      return signal.finalXDraft;
    case "linkedin":
      return signal.finalLinkedInDraft;
    case "reddit":
    default:
      return signal.finalRedditDraft;
  }
}

function getReviewStatus(signal: SignalRecord, platform: EditPatternPlatform): SignalRecord["xReviewStatus"] {
  switch (platform) {
    case "x":
      return signal.xReviewStatus;
    case "linkedin":
      return signal.linkedInReviewStatus;
    case "reddit":
    default:
      return signal.redditReviewStatus;
  }
}

function collectEditPatternTypes(generatedDraft: string, finalDraft: string): EditPatternType[] {
  const generated = generatedDraft.trim();
  const final = finalDraft.trim();
  if (!generated || !final || generated === final) {
    return [];
  }

  const types = new Set<EditPatternType>();
  const generatedLead = getLeadSegment(generated);
  const finalLead = getLeadSegment(final);
  const generatedLeadWords = generatedLead.split(/\s+/).filter(Boolean);
  const finalLeadWords = finalLead.split(/\s+/).filter(Boolean);
  const generatedClosing = getClosingSegment(generated);
  const finalClosing = getClosingSegment(final);
  const certaintyDelta =
    countMatchingTerms(generated, ASSERTIVE_TERMS) - countMatchingTerms(final, ASSERTIVE_TERMS);
  const generatedExclamations = (generated.match(/!/g) ?? []).length;
  const finalExclamations = (final.match(/!/g) ?? []).length;
  const closingOverlap = overlapScore(uniqueTokens(generatedClosing), uniqueTokens(finalClosing));

  if (
    generatedLeadWords.length >= 10 &&
    finalLeadWords.length > 0 &&
    finalLeadWords.length <= Math.max(6, Math.floor(generatedLeadWords.length * 0.75))
  ) {
    types.add("shortened_hook");
  }

  if (certaintyDelta > 0) {
    types.add("removed_claim");
  }

  if (certaintyDelta > 0 || generatedExclamations > finalExclamations) {
    types.add("softened_tone");
  }

  if (
    closingOverlap < 0.45 &&
    (countMatchingTerms(generatedClosing, CTA_TERMS) > 0 || countMatchingTerms(finalClosing, CTA_TERMS) > 0)
  ) {
    types.add("changed_cta");
  }

  return Array.from(types);
}

function mergePatternRecords(patterns: EditPatternRecord[]): EditPatternRecord[] {
  const merged = new Map<string, EditPatternRecord>();

  for (const pattern of patterns) {
    const existing = merged.get(pattern.id);
    if (!existing) {
      merged.set(pattern.id, pattern);
      continue;
    }

    merged.set(pattern.id, {
      ...existing,
      frequency: existing.frequency + pattern.frequency,
      updatedAt:
        new Date(existing.updatedAt).getTime() > new Date(pattern.updatedAt).getTime()
          ? existing.updatedAt
          : pattern.updatedAt,
    });
  }

  return Array.from(merged.values()).sort(
    (left, right) =>
      right.frequency - left.frequency ||
      left.platform.localeCompare(right.platform) ||
      left.id.localeCompare(right.id),
  );
}

function toPatternRecords(observations: EditPatternObservation[]): EditPatternRecord[] {
  const timestamp = new Date().toISOString();
  return mergePatternRecords(
    observations.map((observation) =>
      editPatternRecordSchema.parse({
        id: buildPatternId(observation),
        patternType: observation.patternType,
        frequency: 1,
        platform: observation.platform,
        mode: observation.mode,
        context: observation.context,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ),
  );
}

async function readPersistedStore(): Promise<z.infer<typeof editPatternStoreSchema>> {
  try {
    const raw = await readFile(EDIT_PATTERN_STORE_PATH, "utf8");
    return editPatternStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {
        patterns: [],
        updatedAt: new Date().toISOString(),
      };
    }

    throw error;
  }
}

async function writePersistedStore(store: z.infer<typeof editPatternStoreSchema>): Promise<void> {
  await mkdir(path.dirname(EDIT_PATTERN_STORE_PATH), { recursive: true });
  await writeFile(EDIT_PATTERN_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function extractEditPatternObservations(signal: SignalRecord): EditPatternObservation[] {
  const context = buildSignalContext(signal);
  const observations: EditPatternObservation[] = [];

  for (const platform of EDIT_PATTERN_PLATFORMS) {
    const generatedDraft = getGeneratedDraft(signal, platform);
    const finalDraft = getFinalDraft(signal, platform);
    const reviewStatus = getReviewStatus(signal, platform);

    if (!generatedDraft || !finalDraft || reviewStatus !== "ready") {
      continue;
    }

    const patternTypes = collectEditPatternTypes(generatedDraft, finalDraft);
    for (const patternType of patternTypes) {
      observations.push({
        signalId: signal.recordId,
        platform,
        patternType,
        mode: signal.editorialMode,
        context,
      });
    }
  }

  return observations;
}

export async function listPersistedEditPatterns(): Promise<EditPatternRecord[]> {
  const store = await readPersistedStore();
  return mergePatternRecords(store.patterns.map((pattern) => editPatternRecordSchema.parse(pattern)));
}

export async function recordLearnedEditPatterns(signal: SignalRecord): Promise<EditPatternRecord[]> {
  const learnedPatterns = toPatternRecords(extractEditPatternObservations(signal));
  if (learnedPatterns.length === 0) {
    return [];
  }

  const store = await readPersistedStore();
  const persistedById = new Map(store.patterns.map((pattern) => [pattern.id, editPatternRecordSchema.parse(pattern)]));
  const timestamp = new Date().toISOString();

  for (const pattern of learnedPatterns) {
    const existing = persistedById.get(pattern.id);
    if (existing) {
      persistedById.set(pattern.id, {
        ...existing,
        frequency: existing.frequency + pattern.frequency,
        updatedAt: timestamp,
      });
    } else {
      persistedById.set(pattern.id, {
        ...pattern,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  await writePersistedStore({
    patterns: mergePatternRecords(Array.from(persistedById.values())),
    updatedAt: timestamp,
  });

  return learnedPatterns;
}

export function inferEditPatternHistory(
  signals: SignalRecord[],
  options?: {
    excludeSignalId?: string;
  },
): EditPatternRecord[] {
  return mergePatternRecords(
    signals
      .filter((signal) => signal.recordId !== options?.excludeSignalId)
      .flatMap((signal) => toPatternRecords(extractEditPatternObservations(signal))),
  );
}

export async function listLearnedEditPatterns(input: {
  signals: SignalRecord[];
  excludeSignalId?: string;
}): Promise<EditPatternRecord[]> {
  const persisted = await listPersistedEditPatterns();
  if (persisted.length > 0) {
    return persisted;
  }

  return inferEditPatternHistory(input.signals, {
    excludeSignalId: input.excludeSignalId,
  });
}

function platformLabel(platform: EditPatternPlatform): string {
  switch (platform) {
    case "x":
      return "X";
    case "linkedin":
      return "LinkedIn";
    case "reddit":
    default:
      return "Reddit";
  }
}

function patternLabel(patternType: EditPatternType): string {
  switch (patternType) {
    case "shortened_hook":
      return "tightened the opening hook";
    case "softened_tone":
      return "softened the tone";
    case "removed_claim":
      return "removed a stronger claim";
    case "changed_cta":
    default:
      return "changed the CTA";
  }
}

function canTightenHook(text: string): boolean {
  const lead = getLeadSegment(text);
  return lead.split(/\s+/).filter(Boolean).length >= 13;
}

function canSoftenCta(text: string): boolean {
  const closing = getClosingSegment(text);
  return countMatchingTerms(closing, CTA_TERMS) > 0;
}

function canSoftenTone(text: string): boolean {
  return countMatchingTerms(text, ASSERTIVE_TERMS) > 0 || text.includes("!");
}

function canRemoveClaim(text: string): boolean {
  return countMatchingTerms(text, ASSERTIVE_TERMS) > 0;
}

function isPatternApplicable(patternType: EditPatternType, draft: string): boolean {
  switch (patternType) {
    case "shortened_hook":
      return canTightenHook(draft);
    case "softened_tone":
      return canSoftenTone(draft);
    case "removed_claim":
      return canRemoveClaim(draft);
    case "changed_cta":
    default:
      return canSoftenCta(draft);
  }
}

function rankPatternForSignal(
  pattern: EditPatternRecord,
  signal: SignalRecord,
  contextTokens: string[],
): number {
  const modeMatch = pattern.mode && signal.editorialMode === pattern.mode ? 0.5 : pattern.mode === null ? 0.15 : 0;
  const contextOverlap = overlapScore(contextTokens, uniqueTokens(pattern.context));

  return pattern.frequency * 1.2 + modeMatch + contextOverlap;
}

export function buildEditPatternSuggestions(
  signal: SignalRecord,
  learnedPatterns: EditPatternRecord[],
): Record<EditPatternPlatform, FinalReviewEditSuggestion[]> {
  const signalContext = buildSignalContext(signal);
  const contextTokens = uniqueTokens(signalContext);

  return Object.fromEntries(
    EDIT_PATTERN_PLATFORMS.map((platform) => {
      const baseDraft = getFinalDraft(signal, platform) ?? getGeneratedDraft(signal, platform) ?? "";
      const suggestions: FinalReviewEditSuggestion[] = [];
      const matchingPatterns = learnedPatterns
        .filter((pattern) => pattern.platform === platform)
        .filter((pattern) => isPatternApplicable(pattern.patternType, baseDraft))
        .sort((left, right) => rankPatternForSignal(right, signal, contextTokens) - rankPatternForSignal(left, signal, contextTokens));
      const topPattern = matchingPatterns[0];

      if (topPattern) {
        suggestions.push(
          finalReviewEditSuggestionSchema.parse({
            key: `learned:${platform}:${topPattern.patternType}:${topPattern.id}`,
            label: "Apply previous edit pattern",
            summary: `Seen ${topPattern.frequency} approved ${platformLabel(platform)} edit${topPattern.frequency === 1 ? "" : "s"} where operators ${patternLabel(topPattern.patternType)} in similar review context.`,
            reason:
              topPattern.mode && signal.editorialMode === topPattern.mode
                ? `Mode match: ${topPattern.mode.replaceAll("_", " ")}.`
                : `Context match: ${topPattern.context}.`,
            platform,
            patternType: topPattern.patternType,
            frequency: topPattern.frequency,
          }),
        );
      }

      if (canTightenHook(baseDraft) && !suggestions.some((suggestion) => suggestion.patternType === "shortened_hook")) {
        suggestions.push(
          finalReviewEditSuggestionSchema.parse({
            key: `default:${platform}:shortened_hook`,
            label: "Tighten hook",
            summary: "Shorten the opening line so the first idea lands faster.",
            reason: "The lead sentence is long enough to trim without changing the substance.",
            platform,
            patternType: "shortened_hook",
            frequency: null,
          }),
        );
      }

      if (canSoftenCta(baseDraft) && !suggestions.some((suggestion) => suggestion.patternType === "changed_cta")) {
        suggestions.push(
          finalReviewEditSuggestionSchema.parse({
            key: `default:${platform}:changed_cta`,
            label: "Soften CTA",
            summary: "Turn the closing CTA into a lighter, lower-pressure ask.",
            reason: "The ending reads like a direct prompt and can be softened without removing the action.",
            platform,
            patternType: "changed_cta",
            frequency: null,
          }),
        );
      }

      return [platform, suggestions.slice(0, 3)];
    }),
  ) as Record<EditPatternPlatform, FinalReviewEditSuggestion[]>;
}
