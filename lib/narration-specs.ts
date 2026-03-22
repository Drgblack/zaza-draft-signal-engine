import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import { evaluatePhaseBTrust } from "@/lib/phase-b-trust";
import {
  VIDEO_BRIEF_DURATIONS,
  type VideoBrief,
} from "@/lib/video-briefs";

const narrationDurationSchema = z.union([
  z.literal(VIDEO_BRIEF_DURATIONS[0]),
  z.literal(VIDEO_BRIEF_DURATIONS[1]),
  z.literal(VIDEO_BRIEF_DURATIONS[2]),
  z.literal(VIDEO_BRIEF_DURATIONS[3]),
]);

export const NARRATION_TONES = ["calm", "grounded", "teacher-real"] as const;
export const NARRATION_PACES = ["slow", "steady", "measured"] as const;

export const narrationSpecSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  script: z.string().trim().min(1),
  tone: z.enum(NARRATION_TONES),
  pace: z.enum(NARRATION_PACES),
  targetDurationSec: narrationDurationSchema,
  pronunciationNotes: z.array(z.string().trim().min(1)).max(4).optional(),
  pauseHints: z.array(z.string().trim().min(1)).max(4).optional(),
});

export type NarrationSpec = z.infer<typeof narrationSpecSchema>;

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeSentence(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return `${normalized.replace(/[.!?]+$/g, "")}.`;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function narrationSpecId(videoBriefId: string): string {
  return `${videoBriefId}:narration-spec`;
}

function chooseNarrationTone(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
): NarrationSpec["tone"] {
  if (brief.tone.toLowerCase().includes("teacher-real")) {
    return "teacher-real";
  }

  if (opportunity.trustRisk !== "low" || brief.tone.toLowerCase().includes("grounded")) {
    return "grounded";
  }

  return "calm";
}

function chooseNarrationPace(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
): NarrationSpec["pace"] {
  if (opportunity.trustRisk === "high") {
    return "measured";
  }

  if (brief.durationSec >= 30) {
    return "measured";
  }

  if (brief.durationSec === 15) {
    return "steady";
  }

  return "slow";
}

function safeLine(
  line: string,
  fallback: string,
  options?: {
    allowProductMention?: boolean;
  },
): string {
  const normalized = normalizeSentence(line);
  if (!normalized) {
    return normalizeSentence(fallback);
  }

  return evaluatePhaseBTrust(normalized, options).penalty < 24
    ? normalized
    : normalizeSentence(fallback);
}

function buildRecognitionLine(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
): string {
  return firstNonEmpty(
    opportunity.teacherLanguage[0],
    opportunity.primaryPainPoint,
    brief.overlayLines[1],
    brief.goal,
  );
}

function buildReliefLine(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
): string {
  return firstNonEmpty(
    brief.goal,
    opportunity.recommendedAngle,
    brief.overlayLines[2],
    opportunity.whyNow,
  );
}

function buildNextStepLine(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
): string {
  return firstNonEmpty(
    opportunity.suggestedNextStep,
    brief.overlayLines[brief.overlayLines.length - 1],
    opportunity.whyNow,
  );
}

function buildNarrationScript(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
): string {
  const lines = [
    safeLine(brief.hook, opportunity.primaryPainPoint),
    safeLine(
      buildRecognitionLine(opportunity, brief),
      opportunity.primaryPainPoint,
    ),
    safeLine(
      buildReliefLine(opportunity, brief),
      opportunity.recommendedAngle,
    ),
    safeLine(
      `${buildNextStepLine(opportunity, brief)} ${brief.cta}`,
      `${opportunity.suggestedNextStep} ${brief.cta}`,
      { allowProductMention: true },
    ),
  ];

  return lines.join(" ");
}

function buildPronunciationNotes(brief: VideoBrief): string[] | undefined {
  const notes: string[] = [];
  const briefText = `${brief.title} ${brief.cta} ${brief.hook}`.toLowerCase();

  if (briefText.includes("zaza draft")) {
    notes.push('Zaza Draft: say "zah-zah draft".');
  }

  return notes.length > 0 ? notes : undefined;
}

function buildPauseHints(brief: VideoBrief): string[] | undefined {
  const hints = [
    "Pause briefly after the opening line.",
    brief.structure.length > 3
      ? "Leave a short beat before the reframe."
      : null,
    "Slow slightly before the closing line.",
  ].filter((hint): hint is string => Boolean(hint));

  return hints.length > 0 ? hints : undefined;
}

export function buildNarrationSpec(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
): NarrationSpec {
  return narrationSpecSchema.parse({
    id: narrationSpecId(brief.id),
    opportunityId: opportunity.opportunityId,
    videoBriefId: brief.id,
    script: buildNarrationScript(opportunity, brief),
    tone: chooseNarrationTone(opportunity, brief),
    pace: chooseNarrationPace(opportunity, brief),
    targetDurationSec: brief.durationSec,
    pronunciationNotes: buildPronunciationNotes(brief),
    pauseHints: buildPauseHints(brief),
  });
}
