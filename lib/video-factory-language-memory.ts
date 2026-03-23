import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ContentOpportunity } from "./content-opportunities";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "./serverless-persistence";

const VIDEO_FACTORY_LANGUAGE_MEMORY_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "video-factory-language-memory.json",
);

export const VIDEO_FACTORY_LANGUAGE_MEMORY_TYPES = [
  "original_teacher_language",
  "approved_brief_anchor",
  "accepted_narration_phrase",
  "accepted_overlay_phrase",
  "rejected_phrase",
] as const;

export const VIDEO_FACTORY_LANGUAGE_MEMORY_SOURCES = [
  "teacher_language",
  "brief_title",
  "brief_hook",
  "brief_structure_guidance",
  "brief_cta",
  "brief_overlay",
  "scene_overlay",
  "video_prompt_overlay",
  "narration_script",
] as const;

export const VIDEO_FACTORY_LANGUAGE_MEMORY_OUTCOMES = [
  "accepted",
  "rejected",
  "discarded",
] as const;

export const videoFactoryLanguageMemoryRecordSchema = z.object({
  memoryRecordId: z.string().trim().min(1),
  phraseType: z.enum(VIDEO_FACTORY_LANGUAGE_MEMORY_TYPES),
  sourceKind: z.enum(VIDEO_FACTORY_LANGUAGE_MEMORY_SOURCES),
  phrase: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  factoryJobId: z.string().trim().nullable().default(null),
  renderJobId: z.string().trim().nullable().default(null),
  renderedAssetId: z.string().trim().nullable().default(null),
  assetReviewId: z.string().trim().nullable().default(null),
  attemptId: z.string().trim().nullable().default(null),
  renderVersion: z.string().trim().nullable().default(null),
  reviewOutcome: z.enum(VIDEO_FACTORY_LANGUAGE_MEMORY_OUTCOMES),
  reviewedAt: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
});

const videoFactoryLanguageMemoryStoreSchema = z.record(
  z.string(),
  videoFactoryLanguageMemoryRecordSchema,
);

export type VideoFactoryLanguageMemoryRecord = z.infer<
  typeof videoFactoryLanguageMemoryRecordSchema
>;

type LanguageMemoryPhraseType =
  z.infer<typeof videoFactoryLanguageMemoryRecordSchema>["phraseType"];
type LanguageMemorySourceKind =
  z.infer<typeof videoFactoryLanguageMemoryRecordSchema>["sourceKind"];
type ExtractedPhraseEntry = {
  sourceKind: LanguageMemorySourceKind;
  phrase: string;
};
type ExtractedMemoryEntry = {
  phraseType: LanguageMemoryPhraseType;
  sourceKind: LanguageMemorySourceKind;
  phrase: string;
};

function normalizeText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function splitScriptIntoPhrases(script: string | null | undefined) {
  const normalized = normalizeText(script);
  if (!normalized) {
    return [];
  }

  const matches = normalized.match(/[^.!?]+[.!?]?/g) ?? [];
  return matches
    .map((part) => normalizeText(part))
    .filter((part): part is string => Boolean(part));
}

function uniquePhraseEntries<T extends { phrase: string }>(entries: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const entry of entries) {
    const key = entry.phrase.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function compactExtractedPhraseEntries(
  entries: Array<{
    sourceKind: LanguageMemorySourceKind;
    phrase: string | null | undefined;
  }>,
): ExtractedPhraseEntry[] {
  return entries
    .map((entry) => ({
      sourceKind: entry.sourceKind,
      phrase: normalizeText(entry.phrase),
    }))
    .filter((entry): entry is ExtractedPhraseEntry => Boolean(entry.phrase));
}

function memoryRecordId(input: {
  renderJobId?: string | null;
  renderedAssetId?: string | null;
  reviewOutcome: z.infer<typeof videoFactoryLanguageMemoryRecordSchema>["reviewOutcome"];
  phraseType: z.infer<typeof videoFactoryLanguageMemoryRecordSchema>["phraseType"];
  sourceKind: z.infer<typeof videoFactoryLanguageMemoryRecordSchema>["sourceKind"];
  index: number;
}) {
  const baseId = input.renderJobId ?? input.renderedAssetId ?? "unlinked";
  return [
    baseId,
    "language-memory",
    input.reviewOutcome,
    input.phraseType,
    input.sourceKind,
    String(input.index + 1),
  ].join(":");
}

function readMatchingAttempt(opportunity: ContentOpportunity) {
  const generationState = opportunity.generationState;
  if (!generationState?.renderJob) {
    return null;
  }

  return (
    generationState.attemptLineage.find(
      (attempt) => attempt.renderJobId === generationState.renderJob?.id,
    ) ?? null
  );
}

function buildAcceptedOverlayEntries(opportunity: ContentOpportunity) {
  const brief = opportunity.selectedVideoBrief;
  const generationState = opportunity.generationState;
  const compiledPlan = generationState?.renderJob?.compiledProductionPlan ?? null;
  const videoPrompt = generationState?.videoPrompt ?? null;

  return uniquePhraseEntries(
    compactExtractedPhraseEntries([
      ...(brief?.overlayLines.map((phrase) => ({
        sourceKind: "brief_overlay" as const,
        phrase,
      })) ?? []),
      ...(compiledPlan?.scenePrompts.map((scene) => ({
        sourceKind: "scene_overlay" as const,
        phrase: scene.overlayText ?? null,
      })) ?? []),
      ...(videoPrompt?.overlayPlan.map((phrase) => ({
        sourceKind: "video_prompt_overlay" as const,
        phrase,
      })) ?? []),
    ]),
  );
}

function buildAcceptedBriefAnchorEntries(opportunity: ContentOpportunity) {
  const brief = opportunity.selectedVideoBrief;
  if (!brief) {
    return [];
  }

  return uniquePhraseEntries(
    compactExtractedPhraseEntries([
      { sourceKind: "brief_title" as const, phrase: brief.title },
      { sourceKind: "brief_hook" as const, phrase: brief.hook },
      ...brief.structure.map((beat) => ({
        sourceKind: "brief_structure_guidance" as const,
        phrase: beat.guidance,
      })),
      { sourceKind: "brief_cta" as const, phrase: brief.cta },
    ]),
  );
}

function buildRejectedPhraseEntries(opportunity: ContentOpportunity) {
  const brief = opportunity.selectedVideoBrief;
  const narrationScript =
    opportunity.generationState?.narrationSpec?.script ??
    opportunity.generationState?.renderJob?.compiledProductionPlan?.narrationSpec
      ?.script ??
    null;

  return uniquePhraseEntries(
    compactExtractedPhraseEntries([
      ...(brief
        ? [
            { sourceKind: "brief_hook" as const, phrase: brief.hook },
            { sourceKind: "brief_cta" as const, phrase: brief.cta },
            ...brief.overlayLines.map((phrase) => ({
              sourceKind: "brief_overlay" as const,
              phrase,
            })),
          ]
        : []),
      ...splitScriptIntoPhrases(narrationScript).map((phrase) => ({
        sourceKind: "narration_script" as const,
        phrase,
      })),
    ]),
  );
}

export function extractVideoFactoryLanguageMemoryRecords(input: {
  opportunity: ContentOpportunity;
  reviewOutcome: z.infer<typeof videoFactoryLanguageMemoryRecordSchema>["reviewOutcome"];
  reviewedAt: string;
}) {
  const brief = input.opportunity.selectedVideoBrief;
  const generationState = input.opportunity.generationState;
  if (!brief || !generationState?.assetReview) {
    return [] as VideoFactoryLanguageMemoryRecord[];
  }

  const matchingAttempt = readMatchingAttempt(input.opportunity);
  const narrationScript =
    generationState.narrationSpec?.script ??
    generationState.renderJob?.compiledProductionPlan?.narrationSpec?.script ??
    null;

  const extractedEntries: ExtractedMemoryEntry[] =
    input.reviewOutcome === "accepted"
      ? [
          ...uniquePhraseEntries(
            (input.opportunity.teacherLanguage ?? [])
              .map((phrase) => ({
                phraseType: "original_teacher_language" as const,
                sourceKind: "teacher_language" as const,
                phrase: normalizeText(phrase),
              }))
              .filter(
                (
                  entry,
                ): entry is {
                  phraseType: "original_teacher_language";
                  sourceKind: "teacher_language";
                  phrase: string;
                } => Boolean(entry.phrase),
              ),
          ),
          ...buildAcceptedBriefAnchorEntries(input.opportunity).map((entry) => ({
            phraseType: "approved_brief_anchor" as const,
            sourceKind: entry.sourceKind,
            phrase: entry.phrase,
          })),
          ...splitScriptIntoPhrases(narrationScript).map((phrase) => ({
            phraseType: "accepted_narration_phrase" as const,
            sourceKind: "narration_script" as const,
            phrase,
          })),
          ...buildAcceptedOverlayEntries(input.opportunity).map((entry) => ({
            phraseType: "accepted_overlay_phrase" as const,
            sourceKind: entry.sourceKind,
            phrase: entry.phrase,
          })),
        ]
      : buildRejectedPhraseEntries(input.opportunity).map((entry) => ({
          phraseType: "rejected_phrase" as const,
          sourceKind: entry.sourceKind,
          phrase: entry.phrase,
        }));

  return uniquePhraseEntries(extractedEntries).map((entry, index) =>
    videoFactoryLanguageMemoryRecordSchema.parse({
      memoryRecordId: memoryRecordId({
        renderJobId: generationState.renderJob?.id ?? null,
        renderedAssetId: generationState.renderedAsset?.id ?? null,
        reviewOutcome: input.reviewOutcome,
        phraseType: entry.phraseType,
        sourceKind: entry.sourceKind,
        index,
      }),
      phraseType: entry.phraseType,
      sourceKind: entry.sourceKind,
      phrase: entry.phrase,
      opportunityId: input.opportunity.opportunityId,
      videoBriefId: brief.id,
      factoryJobId: generationState.factoryLifecycle?.factoryJobId ?? null,
      renderJobId: generationState.renderJob?.id ?? null,
      renderedAssetId: generationState.renderedAsset?.id ?? null,
      assetReviewId: generationState.assetReview?.id ?? null,
      attemptId: matchingAttempt?.attemptId ?? null,
      renderVersion:
        generationState.renderJob?.renderVersion ?? matchingAttempt?.renderVersion ?? null,
      reviewOutcome: input.reviewOutcome,
      reviewedAt: input.reviewedAt,
      createdAt: input.reviewedAt,
    }),
  );
}

let inMemoryStore: Record<string, VideoFactoryLanguageMemoryRecord> = {};

async function readPersistedStore() {
  try {
    const raw = await readFile(VIDEO_FACTORY_LANGUAGE_MEMORY_STORE_PATH, "utf8");
    const parsed = videoFactoryLanguageMemoryStoreSchema.parse(JSON.parse(raw));
    inMemoryStore = parsed;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryStore;
    }

    throw error;
  }
}

async function writeStore(store: Record<string, VideoFactoryLanguageMemoryRecord>) {
  const parsed = videoFactoryLanguageMemoryStoreSchema.parse(store);
  inMemoryStore = parsed;

  try {
    await mkdir(path.dirname(VIDEO_FACTORY_LANGUAGE_MEMORY_STORE_PATH), {
      recursive: true,
    });
    await writeFile(
      VIDEO_FACTORY_LANGUAGE_MEMORY_STORE_PATH,
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("video-factory-language-memory", error);
      return;
    }

    throw error;
  }
}

export async function listVideoFactoryLanguageMemoryRecords(options?: {
  opportunityId?: string;
  videoBriefId?: string;
  reviewOutcome?: z.infer<typeof videoFactoryLanguageMemoryRecordSchema>["reviewOutcome"];
  phraseType?: z.infer<typeof videoFactoryLanguageMemoryRecordSchema>["phraseType"];
}) {
  const store = await readPersistedStore();

  return Object.values(store)
    .filter((record) =>
      options?.opportunityId ? record.opportunityId === options.opportunityId : true,
    )
    .filter((record) =>
      options?.videoBriefId ? record.videoBriefId === options.videoBriefId : true,
    )
    .filter((record) =>
      options?.reviewOutcome ? record.reviewOutcome === options.reviewOutcome : true,
    )
    .filter((record) =>
      options?.phraseType ? record.phraseType === options.phraseType : true,
    )
    .sort(
      (left, right) =>
        new Date(right.reviewedAt).getTime() - new Date(left.reviewedAt).getTime() ||
        left.memoryRecordId.localeCompare(right.memoryRecordId),
    );
}

export async function syncVideoFactoryLanguageMemoryFromReview(input: {
  opportunity: ContentOpportunity;
  reviewOutcome: z.infer<typeof videoFactoryLanguageMemoryRecordSchema>["reviewOutcome"];
  reviewedAt: string;
}) {
  const records = extractVideoFactoryLanguageMemoryRecords(input);
  if (records.length === 0) {
    return [];
  }

  const store = await readPersistedStore();
  for (const record of records) {
    store[record.memoryRecordId] = record;
  }
  await writeStore(store);

  return records;
}
