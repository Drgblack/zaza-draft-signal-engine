import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import type { MessageAngle } from "@/lib/message-angles";
import {
  buildPhaseBAnchorTokens,
  countPhaseBAnchorOverlap,
} from "@/lib/phase-b-trust";
import type { VideoBrief } from "@/lib/video-briefs";

export const authenticPhraseSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  text: z.string().trim().min(1),
  sourceType: z.enum(["teacher-language", "signal", "memory"]),
  weight: z.number().finite(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

export type AuthenticPhrase = z.infer<typeof authenticPhraseSchema>;

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function phraseId(
  opportunityId: string,
  sourceType: AuthenticPhrase["sourceType"],
  index: number,
): string {
  return `${opportunityId}:authentic-phrase:${sourceType}:${index}`;
}

function buildPhrase(
  opportunity: ContentOpportunity,
  sourceType: AuthenticPhrase["sourceType"],
  index: number,
  text: string | null | undefined,
  weight: number,
  tags?: string[],
): AuthenticPhrase | null {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  const normalizedTags = (tags ?? []).map((tag) => normalizeText(tag)).filter(Boolean);

  return authenticPhraseSchema.parse({
    id: phraseId(opportunity.opportunityId, sourceType, index),
    opportunityId: opportunity.opportunityId,
    text: normalized,
    sourceType,
    weight,
    tags: normalizedTags.length > 0 ? normalizedTags : undefined,
  });
}

function sortPhrases(
  phrases: AuthenticPhrase[],
  contextValues: Array<string | null | undefined>,
): AuthenticPhrase[] {
  const contextTokens = buildPhaseBAnchorTokens(contextValues);

  return [...phrases].sort((left, right) => {
    const leftOverlap =
      contextTokens.size > 0
        ? countPhaseBAnchorOverlap(left.text, contextTokens)
        : 0;
    const rightOverlap =
      contextTokens.size > 0
        ? countPhaseBAnchorOverlap(right.text, contextTokens)
        : 0;

    return (
      rightOverlap - leftOverlap ||
      right.weight - left.weight ||
      left.text.localeCompare(right.text)
    );
  });
}

function selectPhrases(
  opportunity: ContentOpportunity,
  contextValues: Array<string | null | undefined>,
  limit: number,
): AuthenticPhrase[] {
  const phrases = extractAuthenticPhrases(opportunity);
  const selected: AuthenticPhrase[] = [];
  const selectedIds = new Set<string>();
  const nextLimit = Math.max(1, limit);

  for (const sourceType of ["teacher-language", "signal", "memory"] as const) {
    const ranked = sortPhrases(
      phrases.filter((phrase) => phrase.sourceType === sourceType),
      contextValues,
    );

    for (const phrase of ranked) {
      if (selected.length >= nextLimit) {
        return selected;
      }

      if (selectedIds.has(phrase.id)) {
        continue;
      }

      selected.push(phrase);
      selectedIds.add(phrase.id);
    }
  }

  return selected;
}

export function extractAuthenticPhrases(
  opportunity: ContentOpportunity,
): AuthenticPhrase[] {
  const phrases: AuthenticPhrase[] = [];
  const seen = new Set<string>();

  const pushPhrase = (
    sourceType: AuthenticPhrase["sourceType"],
    index: number,
    text: string | null | undefined,
    weight: number,
    tags?: string[],
  ) => {
    const phrase = buildPhrase(opportunity, sourceType, index, text, weight, tags);
    if (!phrase) {
      return;
    }

    const key = phrase.text.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    phrases.push(phrase);
  };

  opportunity.teacherLanguage.forEach((line, index) => {
    pushPhrase(
      "teacher-language",
      index,
      line,
      100 - index * 8,
      index === 0 ? ["teacher-real", "primary"] : ["teacher-real"],
    );
  });

  const needsSignalFallback = phrases.length < 3;
  if (needsSignalFallback) {
    pushPhrase("signal", 0, opportunity.primaryPainPoint, 72, ["pain-point"]);
    pushPhrase("signal", 1, opportunity.recommendedAngle, 66, ["angle-anchor"]);
    pushPhrase("signal", 2, opportunity.title, 60, ["title-anchor"]);
    pushPhrase("signal", 3, opportunity.supportingSignals[0], 56, ["supporting-signal"]);
  }

  const needsMemoryFallback =
    phrases.filter((phrase) => phrase.sourceType === "teacher-language").length < 2 ||
    phrases.length < 4;
  if (needsMemoryFallback) {
    pushPhrase(
      "memory",
      0,
      opportunity.memoryContext.audienceCue,
      52,
      ["audience-cue"],
    );
    pushPhrase(
      "memory",
      1,
      opportunity.memoryContext.caution,
      48,
      ["caution"],
    );
    pushPhrase(
      "memory",
      2,
      opportunity.memoryContext.bestCombo,
      44,
      ["best-combo"],
    );
  }

  return phrases;
}

export function selectAuthenticPhrasesForAngle(
  opportunity: ContentOpportunity,
  angle: Pick<
    MessageAngle,
    "title" | "summary" | "coreMessage" | "teacherVoiceLine"
  > | null | undefined,
  limit = 2,
): AuthenticPhrase[] {
  return selectPhrases(
    opportunity,
    [
      angle?.title,
      angle?.summary,
      angle?.coreMessage,
      angle?.teacherVoiceLine,
    ],
    limit,
  );
}

export function selectAuthenticPhrasesForBrief(
  opportunity: ContentOpportunity,
  brief: Pick<VideoBrief, "title" | "hook" | "goal" | "overlayLines"> | null | undefined,
  limit = 3,
): AuthenticPhrase[] {
  return selectPhrases(
    opportunity,
    [
      brief?.title,
      brief?.hook,
      brief?.goal,
      ...(brief?.overlayLines ?? []),
    ],
    limit,
  );
}
