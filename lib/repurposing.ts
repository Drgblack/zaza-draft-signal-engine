import { buildSignalAssetBundle, getAssetPrimaryVideo, type AssetBundle } from "@/lib/assets";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import type { EditorialConfidenceLevel } from "@/lib/editorial-confidence";
import type { SignalRecord } from "@/types/signal";

export const REPURPOSING_PLATFORMS = [
  "x",
  "linkedin",
  "reddit",
  "email",
  "video",
  "carousel",
  "founder_thought",
] as const;

export const REPURPOSING_FORMAT_TYPES = [
  "post",
  "thread",
  "script",
  "concept",
  "email_angle",
  "outline",
  "reflection",
] as const;

export type RepurposingPlatform = (typeof REPURPOSING_PLATFORMS)[number];
export type RepurposingFormatType = (typeof REPURPOSING_FORMAT_TYPES)[number];

export interface RepurposedOutput {
  id: string;
  platform: RepurposingPlatform;
  formatType: RepurposingFormatType;
  title: string | null;
  content: string;
  hook: string | null;
  CTA: string | null;
  notes: string | null;
}

export interface RepurposingBundle {
  signalId: string;
  outputs: RepurposedOutput[];
  primaryPlatform: RepurposingPlatform;
  recommendedSubset?: string[];
}

export interface RepurposingEligibility {
  eligible: boolean;
  reasons: string[];
  summary: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function firstSentence(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "Teacher-facing communication guidance.";
  }

  const [sentence] = normalized.split(/(?<=[.!?])\s+/);
  return sentence?.trim() || normalized;
}

function toPrimaryPlatform(signal: SignalRecord): RepurposingPlatform {
  switch (signal.platformPriority) {
    case "X First":
      return "x";
    case "Reddit First":
      return "reddit";
    case "Multi-platform":
      return "linkedin";
    case "LinkedIn First":
    default:
      return "linkedin";
  }
}

function buildPlatformCta(signal: SignalRecord, platform: RepurposingPlatform): string | null {
  const funnelStage = signal.funnelStage;
  const ctaGoal = signal.ctaGoal;

  if (platform === "reddit") {
    return "What wording would you trust in this situation?";
  }

  if (platform === "x") {
    if (ctaGoal === "Share / engage" || funnelStage === "Awareness" || funnelStage === "Trust") {
      return "Worth keeping in mind the next time this lands on your desk.";
    }

    return "If this feels familiar, keep the wording tighter than your first instinct.";
  }

  if (platform === "linkedin") {
    if (ctaGoal === "Try product" || funnelStage === "Consideration" || funnelStage === "Conversion") {
      return "This is exactly the kind of communication load teachers need calmer support for.";
    }

    return "It is worth noticing how often the real pressure sits inside the wording, not only the event.";
  }

  if (platform === "email") {
    if (ctaGoal === "Visit site" || ctaGoal === "Try product") {
      return "If helpful, read the fuller breakdown and adapt the wording to your own context.";
    }

    return "A short reminder worth keeping for the next difficult message.";
  }

  if (platform === "video") {
    return "Save this structure for the next version of this conversation.";
  }

  if (platform === "carousel") {
    return "Use each slide to slow the situation down before it escalates.";
  }

  if (platform === "founder_thought") {
    return "That is one of the quieter patterns I keep seeing in teacher communication.";
  }

  return null;
}

function buildXOutput(signal: SignalRecord): RepurposedOutput | null {
  if (!signal.xDraft) {
    return null;
  }

  const base = signal.xDraft.trim();
  const sentences = base.split(/(?<=[.!?])\s+/).filter(Boolean);
  const isThread = sentences.length >= 3 || base.length > 220;
  const content = isThread
    ? [sentences[0], sentences.slice(1, 3).join(" "), buildPlatformCta(signal, "x")].filter(Boolean).join("\n\n")
    : base;

  return {
    id: `repurpose-${slugify(signal.recordId)}-x`,
    platform: "x",
    formatType: isThread ? "thread" : "post",
    title: null,
    content,
    hook: firstSentence(base),
    CTA: buildPlatformCta(signal, "x"),
    notes: isThread ? "Keep this to 2-3 posts max. The first line needs to carry the tension cleanly." : "Keep the line sharp and non-hyped.",
  };
}

function buildLinkedInOutput(signal: SignalRecord): RepurposedOutput | null {
  if (!signal.linkedInDraft) {
    return null;
  }

  return {
    id: `repurpose-${slugify(signal.recordId)}-linkedin`,
    platform: "linkedin",
    formatType: "post",
    title: signal.contentAngle ? firstSentence(signal.contentAngle) : null,
    content: signal.linkedInDraft.trim(),
    hook: firstSentence(signal.hookTemplateUsed ?? signal.linkedInDraft),
    CTA: buildPlatformCta(signal, "linkedin"),
    notes: "Keep the structure reflective and professional. Preserve paragraph spacing.",
  };
}

function buildRedditOutput(signal: SignalRecord): RepurposedOutput | null {
  if (!signal.redditDraft) {
    return null;
  }

  return {
    id: `repurpose-${slugify(signal.recordId)}-reddit`,
    platform: "reddit",
    formatType: "post",
    title: signal.scenarioAngle ? firstSentence(signal.scenarioAngle) : null,
    content: signal.redditDraft.trim(),
    hook: firstSentence(signal.redditDraft),
    CTA: buildPlatformCta(signal, "reddit"),
    notes: "Keep this discussion-led and less polished than LinkedIn.",
  };
}

function buildCarouselOutput(signal: SignalRecord): RepurposedOutput {
  const hook = firstSentence(signal.hookTemplateUsed ?? signal.contentAngle ?? signal.sourceTitle);
  const scenario = firstSentence(signal.scenarioAngle ?? signal.sourceTitle);
  const risk = firstSentence(signal.riskToTeacher ?? signal.contentAngle);
  const angle = firstSentence(signal.contentAngle ?? signal.interpretationNotes);
  const close = buildPlatformCta(signal, "carousel") ?? "End on one calm practical takeaway.";

  const slides = [
    `Slide 1: ${hook}`,
    `Slide 2: Scenario - ${scenario}`,
    `Slide 3: What is really risky here - ${risk}`,
    `Slide 4: Better framing - ${angle}`,
    `Slide 5: What to say instead - keep it factual, calm, and teacher-safe`,
    `Slide 6: Soft close - ${close}`,
  ];

  return {
    id: `repurpose-${slugify(signal.recordId)}-carousel`,
    platform: "carousel",
    formatType: "outline",
    title: "Carousel outline",
    content: slides.join("\n"),
    hook,
    CTA: close,
    notes: "Aim for 5-7 slides with one idea per card.",
  };
}

function buildVideoOutput(signal: SignalRecord, assetBundle: AssetBundle | null): RepurposedOutput | null {
  const video = getAssetPrimaryVideo(assetBundle, signal.selectedVideoConceptId);
  const script = video?.scriptShort ?? signal.videoScript;
  if (!script) {
    return null;
  }

  return {
    id: `repurpose-${slugify(signal.recordId)}-video`,
    platform: "video",
    formatType: "script",
    title: video?.conceptTitle ?? "Short-form video",
    content: script,
    hook: video?.hook ?? firstSentence(script),
    CTA: buildPlatformCta(signal, "video"),
    notes: video ? video.shotList.join(" | ") : "Keep the cut sequence tight and text-supported.",
  };
}

function buildEmailOutput(signal: SignalRecord): RepurposedOutput {
  const subject = signal.contentAngle ? firstSentence(signal.contentAngle) : firstSentence(signal.sourceTitle);
  const body = [
    `Subject: ${subject}`,
    "",
    `This week’s angle: ${firstSentence(signal.scenarioAngle ?? signal.sourceTitle)}`,
    firstSentence(signal.interpretationNotes ?? signal.contentAngle),
    buildPlatformCta(signal, "email"),
  ].filter(Boolean).join("\n");

  return {
    id: `repurpose-${slugify(signal.recordId)}-email`,
    platform: "email",
    formatType: "email_angle",
    title: subject,
    content: body,
    hook: subject,
    CTA: buildPlatformCta(signal, "email"),
    notes: signal.campaignId ? `Keep this aligned with campaign ${signal.campaignId}.` : "Keep this summary-driven and lighter than LinkedIn.",
  };
}

function buildFounderThoughtOutput(signal: SignalRecord): RepurposedOutput {
  const mode = signal.editorialMode ? getEditorialModeDefinition(signal.editorialMode) : null;
  const reflection = firstSentence(signal.contentAngle ?? signal.interpretationNotes ?? signal.sourceTitle);

  return {
    id: `repurpose-${slugify(signal.recordId)}-founder`,
    platform: "founder_thought",
    formatType: "reflection",
    title: "Founder thought angle",
    content: `What I keep noticing is this: ${reflection}\n\nThe visible issue is rarely the whole issue. The wording burden around it is usually where teachers start absorbing the pressure.`,
    hook: "What I keep noticing is this:",
    CTA: buildPlatformCta(signal, "founder_thought"),
    notes: mode ? `Keep the tone aligned with ${mode.label.toLowerCase()} rather than turning it into a founder monologue.` : "Keep this personal but still teacher-first.",
  };
}

function shouldAddFounderThought(signal: SignalRecord): boolean {
  return (
    signal.teacherVoiceSource === "Founder Observation" ||
    signal.editorialMode === "thought_leadership" ||
    signal.editorialMode === "calm_insight"
  );
}

function chooseExtraOutputs(
  signal: SignalRecord,
  assetBundle: AssetBundle | null,
): RepurposedOutput[] {
  const extras: RepurposedOutput[] = [];

  if (signal.suggestedFormatPriority === "Carousel" || signal.suggestedFormatPriority === "Image" || signal.suggestedFormatPriority === "Multi-format") {
    extras.push(buildCarouselOutput(signal));
  }

  const video = buildVideoOutput(signal, assetBundle);
  if (video && (signal.suggestedFormatPriority === "Video" || signal.suggestedFormatPriority === "Multi-format" || signal.preferredAssetType === "video")) {
    extras.push(video);
  }

  if (signal.funnelStage === "Consideration" || signal.funnelStage === "Conversion" || signal.funnelStage === "Retention") {
    extras.push(buildEmailOutput(signal));
  }

  if (shouldAddFounderThought(signal)) {
    extras.push(buildFounderThoughtOutput(signal));
  }

  if (extras.length === 0) {
    extras.push(buildCarouselOutput(signal));
  }

  return extras.slice(0, 2);
}

export function assessRepurposingEligibility(params: {
  signal: SignalRecord;
  confidenceLevel?: EditorialConfidenceLevel | null;
}): RepurposingEligibility {
  const scenario = assessScenarioAngle({
    scenarioAngle: params.signal.scenarioAngle,
    sourceTitle: params.signal.sourceTitle,
  });
  const reasons: string[] = [];

  if (!params.signal.xDraft || !params.signal.linkedInDraft || !params.signal.redditDraft) {
    reasons.push("Missing core platform drafts");
  }

  if (params.confidenceLevel === "low") {
    reasons.push("Low confidence");
  }

  if (scenario.quality === "missing" || scenario.quality === "weak") {
    reasons.push("Weak framing");
  }

  if (params.signal.status === "Rejected" || params.signal.status === "Archived" || params.signal.status === "Posted") {
    reasons.push("Not an active approval candidate");
  }

  if (reasons.length > 0) {
    return {
      eligible: false,
      reasons,
      summary: `Repurposing held: ${reasons.join(" and ").toLowerCase()}.`,
    };
  }

  return {
    eligible: true,
    reasons: [
      params.confidenceLevel === "high" ? "High confidence" : "Confidence is workable",
      scenario.quality === "strong" ? "Strong framing" : "Usable framing",
    ],
    summary: "Repurposing is suitable because the signal already looks strong enough to expand across a few bounded formats.",
  };
}

export function buildRepurposingBundle(params: {
  signal: SignalRecord;
  assetBundle: AssetBundle | null;
}): RepurposingBundle {
  const outputs = [
    buildXOutput(params.signal),
    buildLinkedInOutput(params.signal),
    buildRedditOutput(params.signal),
    ...chooseExtraOutputs(params.signal, params.assetBundle),
  ].filter((output): output is RepurposedOutput => Boolean(output));
  const primaryPlatform = toPrimaryPlatform(params.signal);
  const recommendedSubset = outputs
    .filter((output) => output.platform === primaryPlatform || output.platform === "carousel" || output.platform === "video")
    .slice(0, 3)
    .map((output) => output.id);

  return {
    signalId: params.signal.recordId,
    outputs: outputs.slice(0, 5),
    primaryPlatform,
    recommendedSubset,
  };
}

export function parseRepurposingBundle(value: string | null | undefined): RepurposingBundle | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as RepurposingBundle;
    if (!parsed.signalId || !Array.isArray(parsed.outputs) || !parsed.primaryPlatform) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function stringifyRepurposingBundle(bundle: RepurposingBundle | null | undefined): string | null {
  return bundle ? JSON.stringify(bundle) : null;
}

export function parseSelectedRepurposedOutputIds(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function stringifySelectedRepurposedOutputIds(value: string[] | null | undefined): string | null {
  return value && value.length > 0 ? JSON.stringify(value) : null;
}

export function buildSignalRepurposingBundle(signal: SignalRecord): RepurposingBundle | null {
  const parsed = parseRepurposingBundle(signal.repurposingBundleJson);
  if (parsed) {
    return parsed;
  }

  const eligibility = assessRepurposingEligibility({
    signal,
    confidenceLevel: null,
  });
  if (!eligibility.eligible) {
    return null;
  }

  return buildRepurposingBundle({
    signal,
    assetBundle: buildSignalAssetBundle(signal),
  });
}

export function buildRepurposingBundleSummary(bundle: RepurposingBundle | null | undefined): {
  count: number;
  primaryPlatformLabel: string;
  previewLabels: string[];
} | null {
  if (!bundle) {
    return null;
  }

  const labelFor = (platform: RepurposingPlatform) => {
    switch (platform) {
      case "x":
        return "X";
      case "linkedin":
        return "LinkedIn";
      case "reddit":
        return "Reddit";
      case "email":
        return "Email";
      case "video":
        return "Video";
      case "carousel":
        return "Carousel";
      case "founder_thought":
      default:
        return "Founder";
    }
  };

  return {
    count: bundle.outputs.length,
    primaryPlatformLabel: labelFor(bundle.primaryPlatform),
    previewLabels: bundle.outputs.slice(0, 2).map((output) => `${labelFor(output.platform)} ${output.formatType}`),
  };
}
