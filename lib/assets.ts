import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { getPlatformIntentProfile } from "@/lib/platform-profiles";
import type { PatternSummary } from "@/lib/pattern-definitions";
import type { EditorialMode, SignalGenerationInput, SignalGenerationResult, SignalRecord } from "@/types/signal";

export const ASSET_PRIMARY_TYPES = ["image", "video", "text_first"] as const;
export const IMAGE_VISUAL_STYLES = ["realistic", "illustration", "minimal graphic", "editorial collage"] as const;
export const VIDEO_STYLES = ["talking_head", "text_overlay", "screen_recording", "documentary_b_roll"] as const;

export type AssetPrimaryType = (typeof ASSET_PRIMARY_TYPES)[number];
export type ImageVisualStyle = (typeof IMAGE_VISUAL_STYLES)[number];
export type VideoStyle = (typeof VIDEO_STYLES)[number];

export interface ImageAsset {
  id: string;
  conceptTitle: string;
  conceptDescription: string;
  visualStyle: ImageVisualStyle;
  layoutIdea: string;
  textOverlay: string | null;
  imagePrompt: string;
  platformSuggestions: string[];
  emotionalTone: string;
  aspectRatio: string;
  avoidElements: string[];
}

export interface VideoConcept {
  id: string;
  conceptTitle: string;
  conceptDescription: string;
  hook: string;
  scriptShort: string;
  shotList: string[];
  style: VideoStyle;
  platformSuggestions: string[];
  emotionalEffect: string;
}

export interface AssetBundle {
  imageAssets: ImageAsset[];
  videoConcepts: VideoConcept[];
  suggestedPrimaryAssetType: AssetPrimaryType;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function quoteScenario(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "the teacher communication moment";
}

function firstSentence(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "Use the signal as a calm teacher-facing communication scenario.";
  }

  const [sentence] = normalized.split(/(?<=[.!?])\s+/);
  return sentence?.trim() || normalized;
}

function buildPlatformSuggestions(priority: SignalGenerationInput["platformPriority"], kind: "image" | "video"): string[] {
  switch (priority) {
    case "LinkedIn First":
      return kind === "image"
        ? ["LinkedIn", "Instagram 4:5"]
        : ["LinkedIn", "LinkedIn vertical preview"];
    case "Reddit First":
      return kind === "image"
        ? ["Reddit", "LinkedIn secondary"]
        : ["Reddit text-first video", "TikTok secondary"];
    case "X First":
      return kind === "image"
        ? ["X", "LinkedIn secondary"]
        : ["X teaser clip", "TikTok secondary"];
    case "Multi-platform":
    default:
      return kind === "image"
        ? ["LinkedIn", "Instagram 4:5", "X support image"]
        : ["LinkedIn", "TikTok", "Instagram Reels"];
  }
}

function aspectRatioFor(priority: SignalGenerationInput["platformPriority"], format: SignalGenerationInput["suggestedFormatPriority"]): string {
  if (format === "Image" || format === "Carousel") {
    return priority === "X First" ? "1:1" : "4:5";
  }

  return priority === "LinkedIn First" ? "4:5" : "9:16";
}

function primaryAssetTypeFor(input: SignalGenerationInput): AssetPrimaryType {
  if (input.suggestedFormatPriority === "Video") {
    return "video";
  }

  if (input.suggestedFormatPriority === "Image" || input.suggestedFormatPriority === "Carousel") {
    return "image";
  }

  if (input.platformPriority === "Reddit First") {
    return "text_first";
  }

  return input.signalCategory === "Success" || input.signalCategory === "Confusion" ? "image" : "video";
}

function imageOverlayFor(input: SignalGenerationInput): string | null {
  if (input.platformPriority === "Reddit First") {
    return null;
  }

  return input.hookTemplateUsed.length > 72 ? input.hookTemplateUsed.slice(0, 69).trimEnd() + "..." : input.hookTemplateUsed;
}

function buildPrimaryImageAsset(
  input: SignalGenerationInput,
  generation: SignalGenerationResult,
  editorialMode: EditorialMode,
  pattern?: PatternSummary | null,
): ImageAsset {
  const scenario = quoteScenario(input.scenarioAngle ?? input.contentAngle ?? input.sourceTitle);
  const mode = getEditorialModeDefinition(editorialMode);
  const aspectRatio = aspectRatioFor(input.platformPriority, input.suggestedFormatPriority);

  return {
    id: `img-${slugify(input.recordId ?? input.sourceTitle)}-primary`,
    conceptTitle: "Teacher moment under pressure",
    conceptDescription: `A calm, teacher-appropriate visual anchored in ${scenario} and the current ${mode.label.toLowerCase()} framing.`,
    visualStyle: input.suggestedFormatPriority === "Carousel" ? "minimal graphic" : "realistic",
    layoutIdea:
      input.suggestedFormatPriority === "Carousel"
        ? "Headline card with one central teacher-facing sentence and wide negative space for safe text placement."
        : "Single-subject editorial frame with one clear focal point and minimal background clutter.",
    textOverlay: imageOverlayFor(input),
    imagePrompt: generation.imagePrompt,
    platformSuggestions: buildPlatformSuggestions(input.platformPriority, "image"),
    emotionalTone: input.emotionalPattern,
    aspectRatio,
    avoidElements: [
      "No school logos",
      "No exaggerated distress",
      "No cluttered classroom props",
      pattern ? `Do not literalize the pattern name "${pattern.name}"` : "Do not make the composition feel generic stock-photo",
    ],
  };
}

function buildSecondaryImageAsset(
  input: SignalGenerationInput,
  editorialMode: EditorialMode,
): ImageAsset {
  const scenario = quoteScenario(input.scenarioAngle ?? input.contentAngle ?? input.sourceTitle);
  const mode = getEditorialModeDefinition(editorialMode);
  const aspectRatio = aspectRatioFor(input.platformPriority, "Image");

  return {
    id: `img-${slugify(input.recordId ?? input.sourceTitle)}-graphic`,
    conceptTitle: "Quote-card highlight",
    conceptDescription: `A clean card-style visual that turns the core point from ${scenario} into a calm, professional takeaway.`,
    visualStyle: "minimal graphic",
    layoutIdea: "Card layout with one headline, one supporting line, and soft editorial background texture.",
    textOverlay: firstSentence(input.contentAngle ?? input.interpretationNotes),
    imagePrompt: [
      "Create a calm editorial graphic for social media.",
      `Use a ${mode.label.toLowerCase()} tone with minimal typography-led composition.`,
      `Include a central teacher-facing sentence based on "${firstSentence(input.contentAngle ?? input.interpretationNotes)}".`,
      `Soft background, restrained palette, generous whitespace, ${aspectRatio} aspect ratio.`,
      "No logos, no clutter, no cartoonish icons, no corporate stock-photo feel.",
    ].join(" "),
    platformSuggestions: buildPlatformSuggestions(input.platformPriority, "image"),
    emotionalTone: mode.tone,
    aspectRatio,
    avoidElements: ["No heavy gradients", "No meme styling", "No dense body copy"],
  };
}

function buildPrimaryVideoConcept(
  input: SignalGenerationInput,
  generation: SignalGenerationResult,
  editorialMode: EditorialMode,
): VideoConcept {
  const mode = getEditorialModeDefinition(editorialMode);
  const scenario = quoteScenario(input.scenarioAngle ?? input.contentAngle ?? input.sourceTitle);

  return {
    id: `vid-${slugify(input.recordId ?? input.sourceTitle)}-primary`,
    conceptTitle: "Direct scenario breakdown",
    conceptDescription: `A short direct-to-camera explanation of why ${scenario} matters and how to frame it more safely.`,
    hook: firstSentence(generation.videoScript.replace(/^Hook:\s*/i, "")),
    scriptShort: generation.videoScript,
    shotList: [
      "Open on a calm close-up with the hook on screen for the first 1-2 seconds.",
      "Cut to a simple supporting visual or screen text naming the scenario risk clearly.",
      "Return to face or voiceover for the safer framing takeaway.",
      "Close with a light CTA or reflective line in text overlay.",
    ],
    style: input.platformPriority === "LinkedIn First" ? "talking_head" : "text_overlay",
    platformSuggestions: buildPlatformSuggestions(input.platformPriority, "video"),
    emotionalEffect: mode.tone,
  };
}

function buildSecondaryVideoConcept(
  input: SignalGenerationInput,
  editorialMode: EditorialMode,
): VideoConcept {
  const mode = getEditorialModeDefinition(editorialMode);
  const scenario = quoteScenario(input.scenarioAngle ?? input.contentAngle ?? input.sourceTitle);
  const coreMessage = firstSentence(input.riskToTeacher ?? input.contentAngle);

  return {
    id: `vid-${slugify(input.recordId ?? input.sourceTitle)}-overlay`,
    conceptTitle: "Text-led before / after",
    conceptDescription: `A text-overlay sequence that shows the risky instinctive framing and then a steadier version for ${scenario}.`,
    hook: input.hookTemplateUsed,
    scriptShort: `Hook: ${input.hookTemplateUsed}\nBody: ${coreMessage}\nClose: ${mode.purpose}`,
    shotList: [
      "Start with one bold line of on-screen text naming the problem.",
      "Show a quick 'what teachers often write or feel' line.",
      "Replace it with a calmer, safer wording principle.",
      "End on a short teacher-first closing line.",
    ],
    style: "text_overlay",
    platformSuggestions: buildPlatformSuggestions(input.platformPriority, "video"),
    emotionalEffect: `Quick clarity with a ${mode.tone.toLowerCase()} landing.`,
  };
}

export function buildAssetBundle(
  input: SignalGenerationInput,
  generation: SignalGenerationResult,
  options?: {
    editorialMode?: EditorialMode;
    pattern?: PatternSummary | null;
  },
): AssetBundle {
  const editorialMode = options?.editorialMode ?? "awareness";

  return {
    imageAssets: [
      buildPrimaryImageAsset(input, generation, editorialMode, options?.pattern),
      buildSecondaryImageAsset(input, editorialMode),
    ],
    videoConcepts: [
      buildPrimaryVideoConcept(input, generation, editorialMode),
      buildSecondaryVideoConcept(input, editorialMode),
    ],
    suggestedPrimaryAssetType: primaryAssetTypeFor(input),
  };
}

export function parseAssetBundle(value: string | null | undefined): AssetBundle | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as AssetBundle;
    if (!Array.isArray(parsed.imageAssets) || !Array.isArray(parsed.videoConcepts) || !parsed.suggestedPrimaryAssetType) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function stringifyAssetBundle(bundle: AssetBundle | null | undefined): string | null {
  return bundle ? JSON.stringify(bundle) : null;
}

export function getAssetPrimaryImage(bundle: AssetBundle | null | undefined, selectedImageAssetId?: string | null): ImageAsset | null {
  if (!bundle) {
    return null;
  }

  return (
    bundle.imageAssets.find((asset) => asset.id === selectedImageAssetId) ??
    bundle.imageAssets[0] ??
    null
  );
}

export function getAssetPrimaryVideo(bundle: AssetBundle | null | undefined, selectedVideoConceptId?: string | null): VideoConcept | null {
  if (!bundle) {
    return null;
  }

  return (
    bundle.videoConcepts.find((concept) => concept.id === selectedVideoConceptId) ??
    bundle.videoConcepts[0] ??
    null
  );
}

export function buildAssetBundleSummary(bundle: AssetBundle | null | undefined): {
  primaryLabel: string;
  summary: string;
} | null {
  if (!bundle) {
    return null;
  }

  const primaryImage = bundle.imageAssets[0];
  const primaryVideo = bundle.videoConcepts[0];
  const imageLabel = primaryImage ? primaryImage.conceptTitle : "No image concept";
  const videoLabel = primaryVideo ? primaryVideo.conceptTitle : "No video concept";

  return {
    primaryLabel:
      bundle.suggestedPrimaryAssetType === "image"
        ? "Image-first"
        : bundle.suggestedPrimaryAssetType === "video"
          ? "Video-first"
          : "Text-first",
    summary: `${imageLabel} · ${videoLabel}`,
  };
}

export function buildGeneratedImagePlaceholderUrl(signalId: string, imageAssetId: string): string {
  const profile = getPlatformIntentProfile("linkedin");
  return `mock://generated-image/${signalId}/${imageAssetId}?profile=${encodeURIComponent(profile.label)}`;
}

export function buildSignalAssetBundle(signal: SignalRecord): AssetBundle | null {
  const parsed = parseAssetBundle(signal.assetBundleJson);
  if (parsed) {
    return parsed;
  }

  if (
    !signal.signalCategory ||
    !signal.severityScore ||
    !signal.signalSubtype ||
    !signal.emotionalPattern ||
    !signal.teacherPainPoint ||
    !signal.relevanceToZazaDraft ||
    !signal.riskToTeacher ||
    !signal.interpretationNotes ||
    !signal.hookTemplateUsed ||
    !signal.contentAngle ||
    !signal.platformPriority ||
    !signal.suggestedFormatPriority ||
    !signal.xDraft ||
    !signal.linkedInDraft ||
    !signal.redditDraft ||
    !signal.imagePrompt ||
    !signal.videoScript ||
    !signal.ctaOrClosingLine ||
    !signal.hashtagsOrKeywords
  ) {
    return null;
  }

  const input: SignalGenerationInput = {
    recordId: signal.recordId,
    sourceTitle: signal.sourceTitle,
    sourceType: signal.sourceType,
    sourcePublisher: signal.sourcePublisher,
    sourceDate: signal.sourceDate,
    sourceUrl: signal.sourceUrl,
    rawExcerpt: signal.rawExcerpt,
    manualSummary: signal.manualSummary,
    scenarioAngle: signal.scenarioAngle,
    signalCategory: signal.signalCategory,
    severityScore: signal.severityScore,
    signalSubtype: signal.signalSubtype,
    emotionalPattern: signal.emotionalPattern,
    teacherPainPoint: signal.teacherPainPoint,
    relevanceToZazaDraft: signal.relevanceToZazaDraft,
    riskToTeacher: signal.riskToTeacher,
    interpretationNotes: signal.interpretationNotes,
    hookTemplateUsed: signal.hookTemplateUsed as SignalGenerationInput["hookTemplateUsed"],
    contentAngle: signal.contentAngle,
    platformPriority: signal.platformPriority,
    suggestedFormatPriority: signal.suggestedFormatPriority,
  };

  const generation: SignalGenerationResult = {
    xDraft: signal.xDraft,
    linkedInDraft: signal.linkedInDraft,
    redditDraft: signal.redditDraft,
    imagePrompt: signal.imagePrompt,
    videoScript: signal.videoScript,
    ctaOrClosingLine: signal.ctaOrClosingLine,
    hashtagsOrKeywords: signal.hashtagsOrKeywords,
    generationSource: "manual",
    generationModelVersion: signal.generationModelVersion ?? "legacy-save",
    promptVersion: signal.promptVersion ?? "legacy-save",
    generatedAt: signal.createdDate,
    assetBundleJson: null,
    preferredAssetType: signal.preferredAssetType,
    selectedImageAssetId: signal.selectedImageAssetId,
    selectedVideoConceptId: signal.selectedVideoConceptId,
    generatedImageUrl: signal.generatedImageUrl,
  };

  return buildAssetBundle(input, generation, {
    editorialMode: signal.editorialMode ?? "awareness",
  });
}
