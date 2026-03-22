import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import { evaluatePhaseBTrust } from "@/lib/phase-b-trust";
import {
  VIDEO_BRIEF_FORMATS,
  type VideoBrief,
} from "@/lib/video-briefs";

export const videoPromptSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  format: z.enum(VIDEO_BRIEF_FORMATS),
  scenePrompts: z.array(z.string().trim().min(1)).min(3).max(4),
  overlayPlan: z.array(z.string().trim().min(1)).min(2).max(4),
  styleGuardrails: z.array(z.string().trim().min(1)).min(3).max(6),
  negativePrompt: z.string().trim().min(1).optional(),
});

export type VideoPrompt = z.infer<typeof videoPromptSchema>;

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

function clipLine(value: string, maxLength = 160): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).trimEnd();
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

function videoPromptId(videoBriefId: string): string {
  return `${videoBriefId}:video-prompt`;
}

function safeVisualLine(line: string, fallback: string): string {
  const normalized = normalizeSentence(line);
  if (!normalized) {
    return normalizeSentence(fallback);
  }

  return evaluatePhaseBTrust(normalized).penalty < 24
    ? normalized
    : normalizeSentence(fallback);
}

function buildScenePrompts(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
): string[] {
  const teacherContext = firstNonEmpty(
    opportunity.teacherLanguage[0],
    opportunity.primaryPainPoint,
    brief.overlayLines[1],
  ).toLowerCase();
  const promptsByFormat: Record<VideoBrief["format"], string[]> = {
    "talking-head": [
      `Single person speaking directly to camera in a quiet classroom corner or home workspace. Natural light, still framing, ordinary teacher setting, focused on ${teacherContext}.`,
      `Hold on the speaker while the recognition line lands. Keep expression steady, human, and conversational rather than polished.`,
      `Close with the speaker still on camera or a simple cutaway to notes, laptop, or desk materials. Keep the mood calm and useful.`,
    ],
    "text-led": [
      `Large readable text on a plain background with subtle movement. Keep spacing generous and pace unhurried around ${teacherContext}.`,
      `Use clean text cards with soft transitions and no attention-grabbing effects. The text should remain the hero.`,
      `Finish on a quiet closing card that leaves room for the CTA without turning into an ad.`,
    ],
    "b-roll": [
      `Use ordinary teacher-work visuals: desk setup, lesson notes, laptop, hallway, classroom details. Nothing glossy or staged.`,
      `Pair the recognition beat with natural classroom or planning footage that feels lived-in and specific to ${teacherContext}.`,
      `End with a quiet practical shot, such as notes being reviewed or materials being set down, to support the soft close.`,
    ],
    "carousel-to-video": [
      `Move through simple text-led cards as if adapting a calm carousel into motion. Keep each frame readable and uncluttered.`,
      `Let each beat appear as one clear card with minimal movement and muted visual treatment.`,
      `Finish with a final card that keeps the teacher reality central and the CTA understated.`,
    ],
  };

  return promptsByFormat[brief.format].map((prompt) =>
    safeVisualLine(prompt, "Keep visuals plain, readable, and teacher-real."),
  );
}

function buildOverlayPlan(brief: VideoBrief): string[] {
  return brief.overlayLines.map((line) =>
    clipLine(normalizeText(line), 96),
  );
}

function buildStyleGuardrails(brief: VideoBrief): string[] {
  const guardrails = [
    "Keep the visual tone calm, readable, and teacher-real.",
    "Avoid polished ad styling, flashy motion, or heavy transitions.",
    "Do not make the product the hero before the final beat.",
    brief.format === "talking-head"
      ? "Prefer natural delivery, ordinary framing, and visible breathing room."
      : "Prefer simple composition and easy-to-read on-screen text.",
  ];

  return guardrails;
}

function buildNegativePrompt(): string {
  return "No polished ad look, no hype text, no influencer-style urgency, no clickbait expressions, no glossy corporate office visuals, no exaggerated fear.";
}

export function buildVideoPrompt(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
): VideoPrompt {
  return videoPromptSchema.parse({
    id: videoPromptId(brief.id),
    opportunityId: opportunity.opportunityId,
    videoBriefId: brief.id,
    format: brief.format,
    scenePrompts: buildScenePrompts(opportunity, brief),
    overlayPlan: buildOverlayPlan(brief),
    styleGuardrails: buildStyleGuardrails(brief),
    negativePrompt: buildNegativePrompt(),
  });
}
