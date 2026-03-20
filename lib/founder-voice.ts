import type { FounderVoiceMode, SignalGenerationResult, SignalRecord } from "@/types/signal";

export const FOUNDER_VOICE_LABEL = "Founder voice applied";

export const FOUNDER_VOICE_PRINCIPLES = {
  tone: ["calm", "grounded", "analytical"],
  stance: ["teacher-first", "protective", "trust-first"],
  style: ["short sentences", "observational tone", "low hype"],
  avoid: [
    "exaggerated claims",
    "buzzwords",
    "AI revolution language",
    "promotional pressure",
  ],
} as const;

const HYPE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bAI revolution\b/gi, "current AI tooling"],
  [/\brevolutionary\b/gi, "useful"],
  [/\bgame[- ]changer\b/gi, "useful shift"],
  [/\bbreakthrough\b/gi, "clear improvement"],
  [/\btransformative\b/gi, "useful"],
  [/\bdisruptive\b/gi, "different"],
  [/\bnext[- ]level\b/gi, "more considered"],
  [/\bultimate\b/gi, "practical"],
  [/\bworld[- ]class\b/gi, "careful"],
  [/\bcutting[- ]edge\b/gi, "current"],
  [/\bseamless\b/gi, "clear"],
  [/\bskyrocket\b/gi, "improve"],
  [/\bmust\b/gi, "may need to"],
  [/\bguarantee\b/gi, "support"],
  [/\bunlock\b/gi, "support"],
  [/\bcrush\b/gi, "handle"],
  [/\bdominate\b/gi, "handle"],
  [/\bperfect\b/gi, "strong"],
];

function normalizeSentenceTone(text: string): string {
  let nextText = text;

  for (const [pattern, replacement] of HYPE_REPLACEMENTS) {
    nextText = nextText.replace(pattern, replacement);
  }

  return nextText
    .replace(/!/g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isFounderVoiceOn(mode: FounderVoiceMode | null | undefined): boolean {
  return (mode ?? "founder_voice_on") === "founder_voice_on";
}

export function getFounderVoiceModeLabel(mode: FounderVoiceMode | null | undefined): string {
  return isFounderVoiceOn(mode) ? "Founder voice on" : "Founder voice off";
}

export function buildFounderVoicePromptBlock(mode: FounderVoiceMode | null | undefined): string[] {
  if (!isFounderVoiceOn(mode)) {
    return [];
  }

  return [
    "Founder Voice Mode is ON for Zaza and Greg's identity layer.",
    "Write with calm authority, teacher empathy, and non-hype positioning.",
    "Use short sentences where possible. Prefer grounded observations over grand claims.",
    "Sound protective and trust-first, not promotional or founder-theatre driven.",
    "Avoid exaggerated claims, buzzwords, artificial urgency, and AI-revolution language.",
    "If a line sounds like generic marketing copy, rewrite it more plainly.",
  ];
}

export function applyFounderVoiceToText(text: string, mode: FounderVoiceMode | null | undefined): string {
  if (!isFounderVoiceOn(mode)) {
    return text;
  }

  const normalized = normalizeSentenceTone(text);
  return normalized.length > 0 ? normalized : text;
}

export function applyFounderVoiceToGeneration(
  generation: SignalGenerationResult,
  mode: FounderVoiceMode | null | undefined,
): SignalGenerationResult {
  if (!isFounderVoiceOn(mode)) {
    return generation;
  }

  return {
    ...generation,
    xDraft: applyFounderVoiceToText(generation.xDraft, mode),
    linkedInDraft: applyFounderVoiceToText(generation.linkedInDraft, mode),
    redditDraft: applyFounderVoiceToText(generation.redditDraft, mode),
    imagePrompt: applyFounderVoiceToText(generation.imagePrompt, mode),
    videoScript: applyFounderVoiceToText(generation.videoScript, mode),
    ctaOrClosingLine: applyFounderVoiceToText(generation.ctaOrClosingLine, mode),
    hashtagsOrKeywords: applyFounderVoiceToText(generation.hashtagsOrKeywords, mode),
  };
}

export function getFounderVoiceIndicator(signal: Pick<SignalRecord, "founderVoiceMode"> | FounderVoiceMode | null | undefined): string {
  if (typeof signal === "string" || signal === null || signal === undefined) {
    return getFounderVoiceModeLabel(signal);
  }

  return getFounderVoiceModeLabel(signal.founderVoiceMode);
}
