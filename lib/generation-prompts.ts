import type { SignalGenerationInput } from "@/types/signal";

export const GENERATION_PROMPT_VERSION = "v1.0.0";

export const GENERATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "xDraft",
    "linkedInDraft",
    "redditDraft",
    "imagePrompt",
    "videoScript",
    "ctaOrClosingLine",
    "hashtagsOrKeywords",
  ],
  properties: {
    xDraft: { type: "string" },
    linkedInDraft: { type: "string" },
    redditDraft: { type: "string" },
    imagePrompt: { type: "string" },
    videoScript: { type: "string" },
    ctaOrClosingLine: { type: "string" },
    hashtagsOrKeywords: { type: "string" },
  },
} as const;

export function buildGenerationSystemPrompt(): string {
  return [
    "You are generating editorial draft assets for Zaza Draft.",
    "Return exactly one JSON object matching the required schema and nothing else.",
    "Use UK English.",
    "Stay calm, teacher-first, high-trust, and emotionally intelligent.",
    "Do not sound salesy, corporate, hype-driven, or like generic AI marketing copy.",
    "Do not invent facts beyond the provided signal and interpretation context.",
    "Avoid defamation, legal claims, and named private individuals.",
    "Treat the interpretation as the governing editorial direction. Do not drift into a different angle.",
    "V1 is fixed-template and human-reviewed. Keep drafts clean and editable.",
    "Platform guidance:",
    "X Draft: short, sharp, emotionally resonant, not corporate, not hashtag-heavy.",
    "LinkedIn Draft: reflective, story-driven, professional, teacher-protective, no hype.",
    "Reddit Draft: neutral, discussion-first, non-promotional, community-safe.",
    "Image Prompt: calm visual scene, teacher context, useful for Canva or AI image generation, no irrelevant cinematic clutter.",
    "Video Script: 10 to 20 second short-form script with hook, issue, takeaway, and optional soft close.",
    "CTA / Closing Line: subtle only.",
    "Hashtags / Keywords: light touch only, natural, not stuffed.",
  ].join("\n");
}

export function buildGenerationUserPrompt(input: SignalGenerationInput): string {
  return JSON.stringify(
    {
      task: "Generate fixed-format draft assets from this interpreted signal.",
      recordId: input.recordId ?? null,
      source: {
        sourceTitle: input.sourceTitle,
        sourceType: input.sourceType,
        sourcePublisher: input.sourcePublisher,
        sourceDate: input.sourceDate,
        sourceUrl: input.sourceUrl,
        rawExcerpt: input.rawExcerpt,
        manualSummary: input.manualSummary,
        scenarioAngle: input.scenarioAngle,
      },
      interpretation: {
        signalCategory: input.signalCategory,
        severityScore: input.severityScore,
        signalSubtype: input.signalSubtype,
        emotionalPattern: input.emotionalPattern,
        teacherPainPoint: input.teacherPainPoint,
        relevanceToZazaDraft: input.relevanceToZazaDraft,
        riskToTeacher: input.riskToTeacher,
        interpretationNotes: input.interpretationNotes,
        hookTemplateUsed: input.hookTemplateUsed,
        contentAngle: input.contentAngle,
        platformPriority: input.platformPriority,
        suggestedFormatPriority: input.suggestedFormatPriority,
      },
      outputRequirements: {
        xDraft: "Short, scroll-stopping, reflective, subtle takeaway.",
        linkedInDraft: "Professional, reflective, concise, teacher-protective.",
        redditDraft: "Neutral, discussion-friendly, non-promotional, community-safe.",
        imagePrompt: "Calm editorial visual prompt with teacher context.",
        videoScript: "10-20 second short-form script.",
        ctaOrClosingLine: "Soft and subtle.",
        hashtagsOrKeywords: "Light, useful, non-spammy.",
      },
    },
    null,
    2,
  );
}
