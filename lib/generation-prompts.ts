import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import {
  PLATFORM_INTENT_PROFILE_VERSION,
  PLATFORM_INTENT_PROFILES,
  describeModeForPlatform,
} from "@/lib/platform-profiles";
import { buildFounderVoicePromptBlock, FOUNDER_VOICE_PRINCIPLES } from "@/lib/founder-voice";
import type { PatternSummary, SignalPattern } from "@/lib/pattern-definitions";
import type { SignalGenerationInput } from "@/types/signal";
import { getScenarioPriority } from "@/lib/scenario-angle";
import type { EditorialMode, FounderVoiceMode } from "@/types/signal";

export const GENERATION_PROMPT_VERSION = "v1.3.0";

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

export function buildGenerationSystemPrompt(
  editorialMode: EditorialMode,
  founderVoiceMode: FounderVoiceMode = "founder_voice_on",
): string {
  const mode = getEditorialModeDefinition(editorialMode);
  const xProfile = PLATFORM_INTENT_PROFILES.x;
  const linkedInProfile = PLATFORM_INTENT_PROFILES.linkedin;
  const redditProfile = PLATFORM_INTENT_PROFILES.reddit;

  return [
    "You are generating editorial draft assets for Zaza Draft.",
    "Return exactly one JSON object matching the required schema and nothing else.",
    "Use UK English.",
    "Stay calm, teacher-first, high-trust, and emotionally intelligent.",
    "Do not sound salesy, corporate, hype-driven, or like generic AI marketing copy.",
    "Do not invent facts beyond the provided signal and interpretation context.",
    "Avoid defamation, legal claims, and named private individuals.",
    "Treat the interpretation as the governing editorial direction. Do not drift into a different angle.",
    "When Scenario Angle is present, treat it as the primary communication scenario for the drafts.",
    `Editorial Mode is explicitly selected as: ${mode.label}.`,
    `Editorial Mode purpose: ${mode.purpose}`,
    `Editorial Mode tone tendency: ${mode.tone}`,
    `Editorial Mode framing preference: ${mode.framing}`,
    "Editorial Mode shapes post intent and emphasis. It does not replace the Scenario Angle, interpretation, or selected pattern guidance.",
    "If a saved pattern is provided, treat it as optional guidance for tone, framing discipline, and structure only.",
    "Do not override the current Scenario Angle with the pattern example.",
    "Do not copy wording directly from the pattern description or example output.",
    "Use the pattern to improve consistency and safety, not to turn the result into a rigid template.",
    "Use the source title and excerpt as evidence and context, not as the main framing if a usable scenario angle exists.",
    "V1 is fixed-template and human-reviewed. Keep drafts clean and editable.",
    `Platform intent profiles are explicit and inspectable. Current profile version: ${PLATFORM_INTENT_PROFILE_VERSION}.`,
    "Platform guidance:",
    `X Draft profile: ${xProfile.tone} ${xProfile.structure} ${xProfile.depth} ${xProfile.modeExpression}`,
    ...xProfile.promptRules.map((rule) => `- X: ${rule}`),
    ...xProfile.avoid.map((rule) => `- X avoid: ${rule}`),
    `LinkedIn Draft profile: ${linkedInProfile.tone} ${linkedInProfile.structure} ${linkedInProfile.depth} ${linkedInProfile.modeExpression}`,
    ...linkedInProfile.promptRules.map((rule) => `- LinkedIn: ${rule}`),
    ...linkedInProfile.avoid.map((rule) => `- LinkedIn avoid: ${rule}`),
    `Reddit Draft profile: ${redditProfile.tone} ${redditProfile.structure} ${redditProfile.depth} ${redditProfile.modeExpression}`,
    ...redditProfile.promptRules.map((rule) => `- Reddit: ${rule}`),
    ...redditProfile.avoid.map((rule) => `- Reddit avoid: ${rule}`),
    "Image Prompt: calm visual scene, teacher context, useful for Canva or AI image generation, no irrelevant cinematic clutter.",
    "Video Script: 10 to 20 second short-form script with hook, issue, takeaway, and optional soft close.",
    "CTA / Closing Line: subtle only.",
    "Hashtags / Keywords: light touch only, natural, not stuffed.",
    ...buildFounderVoicePromptBlock(founderVoiceMode),
    "Editorial mode guardrails:",
    ...mode.promptRules.map((rule) => `- ${rule}`),
    "Avoid explicitly:",
    ...mode.avoid.map((rule) => `- ${rule}`),
  ].join("\n");
}

function buildPatternGuidance(pattern: SignalPattern | null | undefined): {
  selectedPattern: PatternSummary | null;
  guidanceContext: null | {
    name: string;
    description: string;
    exampleScenarioAngle: string | null;
    exampleOutput: string | null;
    usageRules: string[];
  };
} {
  if (!pattern) {
    return {
      selectedPattern: null,
      guidanceContext: null,
    };
  }

  return {
    selectedPattern: {
      id: pattern.id,
      name: pattern.name,
      description: pattern.description,
      patternType: pattern.patternType,
      lifecycleState: pattern.lifecycleState,
    },
    guidanceContext: {
      name: pattern.name,
      description: pattern.description,
      exampleScenarioAngle: pattern.exampleScenarioAngle,
      exampleOutput: pattern.exampleOutput,
      usageRules: [
        "Use this pattern as optional style guidance only.",
        "Keep the current signal, Scenario Angle, and interpretation as the main source of truth.",
        "Do not copy the example output directly.",
        "Prefer tone, framing discipline, and structure over imitation.",
      ],
    },
  };
}

export function buildGenerationUserPrompt(
  input: SignalGenerationInput,
  options?: {
    pattern?: SignalPattern | null;
    editorialMode: EditorialMode;
    founderVoiceMode?: FounderVoiceMode;
  },
): string {
  const scenarioPriority = getScenarioPriority({
    scenarioAngle: input.scenarioAngle,
    sourceTitle: input.sourceTitle,
  });
  const patternGuidance = buildPatternGuidance(options?.pattern);
  const mode = getEditorialModeDefinition(options?.editorialMode ?? "awareness");

  return JSON.stringify(
    {
      task: "Generate fixed-format draft assets from this interpreted signal.",
      recordId: input.recordId ?? null,
      editorialMode: {
        id: mode.id,
        label: mode.label,
        purpose: mode.purpose,
        tone: mode.tone,
        framing: mode.framing,
        platformFit: mode.platformFit,
        avoid: mode.avoid,
        promptRules: mode.promptRules,
      },
      founderVoice: {
        mode: options?.founderVoiceMode ?? "founder_voice_on",
        principles: FOUNDER_VOICE_PRINCIPLES,
      },
      platformProfiles: {
        version: PLATFORM_INTENT_PROFILE_VERSION,
        x: {
          ...PLATFORM_INTENT_PROFILES.x,
          modeExpression: describeModeForPlatform(mode.id, "x"),
        },
        linkedIn: {
          ...PLATFORM_INTENT_PROFILES.linkedin,
          modeExpression: describeModeForPlatform(mode.id, "linkedin"),
        },
        reddit: {
          ...PLATFORM_INTENT_PROFILES.reddit,
          modeExpression: describeModeForPlatform(mode.id, "reddit"),
        },
      },
      source: {
        sourceTitle: input.sourceTitle,
        sourceType: input.sourceType,
        sourcePublisher: input.sourcePublisher,
        sourceDate: input.sourceDate,
        sourceUrl: input.sourceUrl,
        rawExcerpt: input.rawExcerpt,
        manualSummary: input.manualSummary,
        scenarioAngle: input.scenarioAngle,
        scenarioAngleQuality: scenarioPriority.assessment.quality,
        scenarioAnglePriority:
          scenarioPriority.preferredScenario !== null
            ? "Use the scenario angle as the main drafting frame."
            : "Scenario angle is weak or missing, so use interpretation plus source context.",
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
      patternGuidance: patternGuidance.guidanceContext,
      outputRequirements: {
        xDraft: `Short, high-signal, and clearly shaped by ${mode.label} intent through the X profile.`,
        linkedInDraft: `Professional and teacher-relevant, with ${mode.label.toLowerCase()} framing expressed through the LinkedIn profile.`,
        redditDraft: `Community-safe and grounded, with ${mode.label.toLowerCase()} intent expressed through the Reddit discussion profile.`,
        imagePrompt: `Calm editorial visual prompt that reflects ${mode.label.toLowerCase()} tone without clutter.`,
        videoScript: `10-20 second short-form script shaped by ${mode.label.toLowerCase()} intent.`,
        ctaOrClosingLine: `Soft close aligned with ${mode.label.toLowerCase()} purpose.`,
        hashtagsOrKeywords: `Light, useful, non-spammy keywords that match ${mode.label.toLowerCase()} framing.`,
      },
    },
    null,
    2,
  );
}
