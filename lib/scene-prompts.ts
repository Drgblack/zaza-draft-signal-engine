import { z } from "zod";

import { selectAuthenticPhrasesForBrief } from "@/lib/authentic-language";
import type { ContentOpportunity } from "@/lib/content-opportunities";
import type { ProductionDefaults } from "@/lib/production-defaults";
import type { VideoBrief, VideoBeat } from "@/lib/video-briefs";

export const scenePromptSchema = z.object({
  id: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  order: z.number().int().min(1).max(4),
  purpose: z.enum(["hook", "recognition", "reframe", "cta"]),
  visualPrompt: z.string().trim().min(1),
  overlayText: z.string().trim().min(1).optional(),
  durationSec: z.number().int().positive().optional(),
  negativePrompt: z.string().trim().min(1).optional(),
});

export type ScenePrompt = z.infer<typeof scenePromptSchema>;

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function cleanSentence(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return normalized.replace(/[.!?]+$/g, "");
}

function quoteExact(value: string | null | undefined): string {
  return normalizeText(value);
}

function scenePromptId(videoBriefId: string, order: number): string {
  return `${videoBriefId}:scene-prompt:${order}`;
}

function distributeDuration(totalDurationSec: number, count: number, index: number): number {
  const baseDuration = Math.floor(totalDurationSec / count);
  const remainder = totalDurationSec % count;

  return baseDuration + (index < remainder ? 1 : 0);
}

function toScenePurpose(
  beat: VideoBeat,
  index: number,
  total: number,
): ScenePrompt["purpose"] {
  const normalizedPurpose = beat.purpose.toLowerCase();

  if (index === 0) {
    return "hook";
  }

  if (index === total - 1) {
    return "cta";
  }

  if (
    normalizedPurpose.includes("reframe") ||
    normalizedPurpose.includes("relief")
  ) {
    return "reframe";
  }

  return "recognition";
}

function buildBaseVisualTemplate(
  brief: VideoBrief,
  purpose: ScenePrompt["purpose"],
  beat: VideoBeat,
): string {
  const formatTemplates: Record<VideoBrief["format"], Record<ScenePrompt["purpose"], string>> = {
    "talking-head": {
      hook: "Single person speaking directly to camera in a quiet classroom corner or home workspace.",
      recognition: "Hold on the speaker in a still, ordinary teacher setting while the recognition lands.",
      reframe: "Stay with the speaker or use one calm cutaway to classroom or desk detail while the reframe lands.",
      cta: "Close on the speaker or one quiet teacher-work detail with enough breathing room for the last line.",
    },
    "text-led": {
      hook: "Large readable text on a plain background with restrained motion.",
      recognition: "Use one clean text-led frame with calm pacing and no attention-grabbing effects.",
      reframe: "Move to one additional text card with gentle motion and generous spacing.",
      cta: "Finish on a quiet closing text card that leaves room for the last line.",
    },
    "b-roll": {
      hook: "Open on an ordinary teacher-work visual such as desk setup, notes, laptop, or classroom detail.",
      recognition: "Use lived-in teacher footage that supports the recognition without feeling staged.",
      reframe: "Shift to one practical classroom or planning detail that supports the steadier frame.",
      cta: "Close on a quiet practical shot such as notes being reviewed or materials being set down.",
    },
    "carousel-to-video": {
      hook: "Open on one clean card adapted from a calm carousel frame.",
      recognition: "Use one readable card with muted motion and clear spacing.",
      reframe: "Advance to the next card with the same calm layout and minimal transition.",
      cta: "Finish on a final card that keeps the close understated and readable.",
    },
  };

  return `${formatTemplates[brief.format][purpose]} Beat guidance: ${cleanSentence(beat.guidance)}.`;
}

function buildNegativePrompt(defaults: ProductionDefaults): string {
  return defaults.negativeConstraints.join("; ");
}

export function buildScenePrompts(input: {
  opportunity: ContentOpportunity;
  brief: VideoBrief;
  defaults: ProductionDefaults;
}): ScenePrompt[] {
  const authenticPhrases = selectAuthenticPhrasesForBrief(
    input.opportunity,
    input.brief,
    input.brief.structure.length,
  );

  return input.brief.structure.map((beat, index) => {
    const purpose = toScenePurpose(beat, index, input.brief.structure.length);
    const overlayText = normalizeText(
      beat.suggestedOverlay ?? input.brief.overlayLines[index],
    );
    const authenticAnchor =
      authenticPhrases[index]?.text ?? authenticPhrases[0]?.text ?? input.opportunity.primaryPainPoint;
    const visualPrompt = [
      buildBaseVisualTemplate(input.brief, purpose, beat),
      `Approved language anchor: "${quoteExact(authenticAnchor)}"`,
      overlayText ? `Overlay text: "${quoteExact(overlayText)}"` : "",
      `Visual direction: ${cleanSentence(input.brief.visualDirection)}.`,
      `Style anchor: ${cleanSentence(input.defaults.styleAnchorPrompt)}.`,
      `Motion style: ${cleanSentence(input.defaults.motionStyle)}.`,
      "Keep the scene calm, readable, and teacher-real.",
    ]
      .filter((part) => part.length > 0)
      .join(" ");

    return scenePromptSchema.parse({
      id: scenePromptId(input.brief.id, index + 1),
      videoBriefId: input.brief.id,
      order: index + 1,
      purpose,
      visualPrompt,
      overlayText: overlayText || undefined,
      durationSec: distributeDuration(
        input.brief.durationSec,
        input.brief.structure.length,
        index,
      ),
      negativePrompt: buildNegativePrompt(input.defaults),
    });
  });
}
