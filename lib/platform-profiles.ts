import type { EditorialMode } from "@/types/signal";

export const PLATFORM_INTENT_PROFILE_VERSION = "v1.0.0";

export type PlatformIntentProfileId = "x" | "linkedin" | "reddit";

export interface PlatformIntentProfile {
  id: PlatformIntentProfileId;
  label: string;
  tone: string;
  structure: string;
  depth: string;
  modeExpression: string;
  helperNote: string;
  avoid: string[];
  promptRules: string[];
}

export const PLATFORM_INTENT_PROFILES: Record<PlatformIntentProfileId, PlatformIntentProfile> = {
  x: {
    id: "x",
    label: "X",
    tone: "Sharp, concise, clear, scroll-stopping without hype.",
    structure: "Fast opening, one clear point, minimal explanation.",
    depth: "Short and compressed. No thread-like drift.",
    modeExpression: "Express the selected editorial mode as a crisp high-signal post, not a reflective essay.",
    helperNote: "Concise, sharper framing.",
    avoid: ["over-explaining", "LinkedIn-style reflection", "hashtag stuffing", "thread-like overlength"],
    promptRules: [
      "Use a sharp opening line that lands quickly.",
      "Keep the draft compact enough to feel native to X.",
      "Prefer one strong insight over multiple soft points.",
    ],
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    tone: "Professional, reflective, credible, teacher-aware.",
    structure: "Clear opening, brief context, insight, takeaway.",
    depth: "Moderate depth is allowed if it adds professional value.",
    modeExpression: "Express the selected editorial mode as professional perspective and usable insight, not performative virality.",
    helperNote: "Reflective professional framing.",
    avoid: ["clickbait", "viral-post gimmicks", "cryptic one-liners", "generic motivation"],
    promptRules: [
      "Make the professional value legible, not implied.",
      "Allow some reflection, but keep it anchored to the scenario.",
      "Sound credible and specific rather than polished for its own sake.",
    ],
  },
  reddit: {
    id: "reddit",
    label: "Reddit",
    tone: "Discussion-first, grounded, less polished, community-safe.",
    structure: "Context first, observation second, invite discussion naturally.",
    depth: "Allow more conversational room than X, but keep it human and direct.",
    modeExpression: "Express the selected editorial mode as a grounded discussion starter, not as brand copy or a polished post.",
    helperNote: "Discussion-first, non-promotional.",
    avoid: ["brand tone", "promotional voice", "CTA-heavy endings", "marketing polish"],
    promptRules: [
      "Sound like a thoughtful participant, not a polished brand account.",
      "Leave room for discussion or reflection from other teachers.",
      "Keep the ending open enough for conversation rather than conversion.",
    ],
  },
};

export function getPlatformIntentProfile(platform: PlatformIntentProfileId): PlatformIntentProfile {
  return PLATFORM_INTENT_PROFILES[platform];
}

export function describeModeForPlatform(mode: EditorialMode, platform: PlatformIntentProfileId): string {
  const profile = getPlatformIntentProfile(platform);

  switch (platform) {
    case "x":
      return `Express ${mode} as a compressed, sharper signal with one clean takeaway.`;
    case "linkedin":
      return `Express ${mode} as a professionally credible reflection with a clearer contextual bridge.`;
    case "reddit":
      return `Express ${mode} as a grounded teacher discussion prompt rather than a polished post.`;
    default:
      return profile.modeExpression;
  }
}
