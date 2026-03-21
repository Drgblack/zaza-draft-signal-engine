import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import type { HookSet } from "@/lib/hook-engine";
import type { MessageAngle } from "@/lib/message-angles";
import {
  buildPhaseBAnchorTokens,
  countPhaseBAnchorOverlap,
  evaluatePhaseBTrust,
  normalizePhaseBText,
} from "@/lib/phase-b-trust";

export const VIDEO_BRIEF_FORMATS = [
  "talking-head",
  "text-led",
  "b-roll",
  "carousel-to-video",
] as const;

export const VIDEO_BRIEF_DURATIONS = [15, 20, 30, 45] as const;

export const videoBeatSchema = z.object({
  order: z.number().int().min(1).max(4),
  purpose: z.string().trim().min(1),
  guidance: z.string().trim().min(1),
  suggestedOverlay: z.string().trim().min(1).optional(),
});

export type VideoBeat = z.infer<typeof videoBeatSchema>;

export const videoBriefSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  angleId: z.string().trim().min(1),
  hookSetId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  hook: z.string().trim().min(1),
  format: z.enum(VIDEO_BRIEF_FORMATS),
  durationSec: z.union([
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(45),
  ]),
  goal: z.string().trim().min(1),
  tone: z.string().trim().min(1),
  structure: z.array(videoBeatSchema).min(3).max(4),
  visualDirection: z.string().trim().min(1),
  overlayLines: z.array(z.string().trim().min(1)).min(2).max(4),
  cta: z.string().trim().min(1),
  productionNotes: z.array(z.string().trim().min(1)).max(4).optional(),
});

export type VideoBrief = z.infer<typeof videoBriefSchema>;

export interface VideoBriefTrustDiagnostics {
  penalty: number;
  reasons: string[];
  anchorOverlap: number;
  wasSanitized: boolean;
  usedFallback: boolean;
}

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

function cleanLine(value: string | null | undefined): string {
  return normalizeText(value).replace(/[.!?]+$/g, "");
}

function clipLine(value: string, maxLength = 96): string {
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

function briefId(opportunityId: string, angleId: string, hookSetId: string) {
  return `${opportunityId}:${angleId}:${hookSetId}:video-brief`;
}

function buildBriefAnchorTokens(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
) {
  return buildPhaseBAnchorTokens([
    opportunity.title,
    opportunity.primaryPainPoint,
    ...opportunity.teacherLanguage,
    opportunity.recommendedAngle,
    opportunity.whyNow,
    opportunity.riskSummary,
    opportunity.memoryContext.audienceCue,
    opportunity.memoryContext.caution,
    angle.title,
    angle.summary,
    angle.coreMessage,
    angle.teacherVoiceLine,
    hookSet.primaryHook.text,
  ]);
}

function isEarlyProductMention(value: string): boolean {
  const normalized = normalizePhaseBText(value).toLowerCase();
  return (
    normalized.includes("zaza draft") ||
    normalized.includes("we built") ||
    normalized.includes("our product") ||
    normalized.includes("our tool")
  );
}

export function chooseVideoBriefFormat(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
): VideoBrief["format"] {
  if (opportunity.recommendedFormat === "carousel") {
    return "carousel-to-video";
  }

  if (opportunity.recommendedFormat === "multi_asset") {
    return "text-led";
  }

  if (opportunity.recommendedFormat === "short_video") {
    return opportunity.trustRisk === "high" ? "text-led" : "talking-head";
  }

  if (angle.style === "teacher-voice" || angle.style === "validation") {
    return "talking-head";
  }

  if (angle.style === "risk-awareness") {
    return "text-led";
  }

  if (angle.style === "practical-help") {
    return "b-roll";
  }

  return "text-led";
}

export function chooseVideoBriefDuration(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
): VideoBrief["durationSec"] {
  if (opportunity.trustRisk === "high") {
    return 30;
  }

  if (angle.style === "practical-help" || angle.style === "risk-awareness") {
    return 30;
  }

  if (opportunity.recommendedFormat === "multi_asset") {
    return 30;
  }

  if (angle.style === "teacher-voice" || angle.style === "validation") {
    return 20;
  }

  if (opportunity.priority === "high") {
    return 20;
  }

  return 15;
}

function buildGoal(opportunity: ContentOpportunity, angle: MessageAngle): string {
  switch (angle.style) {
    case "validation":
      return "Help teachers feel accurately seen before offering direction.";
    case "reframe":
      return "Offer a calmer frame that lowers tension without oversimplifying the issue.";
    case "practical-help":
      return "Give one usable next move that respects the reality of a school day.";
    case "risk-awareness":
      return "Keep the caution visible while still making the message useful.";
    case "calm-relief":
      return "Reduce emotional pressure and make the message feel steadier.";
    case "teacher-voice":
    default:
      return `Sound like a trusted colleague speaking plainly about ${cleanLine(opportunity.primaryPainPoint).toLowerCase()}.`;
  }
}

function buildTone(opportunity: ContentOpportunity, angle: MessageAngle): string {
  const baseTone = "Calm, grounded, teacher-real, and non-performative.";

  if (opportunity.trustRisk === "high") {
    return `${baseTone} Keep claims modest and caution visible.`;
  }

  if (angle.style === "practical-help") {
    return `${baseTone} Keep it concrete and useful.`;
  }

  if (angle.style === "calm-relief") {
    return `${baseTone} Let relief matter more than intensity.`;
  }

  return baseTone;
}

function buildVisualDirection(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  format: VideoBrief["format"],
): string {
  const painPoint = cleanLine(opportunity.primaryPainPoint).toLowerCase();

  switch (format) {
    case "talking-head":
      return `Simple direct-to-camera delivery. Natural light, still frame, and enough pause for the hook and recognition to land around ${painPoint}.`;
    case "text-led":
      return "Large readable on-screen text, quiet pacing, and minimal cuts. Let the words carry the weight rather than visual tricks.";
    case "b-roll":
      return `Use ordinary teacher-work moments or desk/classroom detail shots. Keep visuals understated and supportive of the message about ${painPoint}.`;
    case "carousel-to-video":
    default:
      return "Move through clear text cards with gentle transitions. Treat each beat like one clean slide, not a polished ad.";
  }
}

function buildRecognitionLine(opportunity: ContentOpportunity, angle: MessageAngle): string {
  return firstNonEmpty(
    angle.teacherVoiceLine,
    opportunity.teacherLanguage[0],
    opportunity.memoryContext.audienceCue,
    opportunity.primaryPainPoint,
  );
}

function buildReliefLine(opportunity: ContentOpportunity, angle: MessageAngle): string {
  return firstNonEmpty(
    angle.coreMessage,
    opportunity.recommendedAngle,
    opportunity.whyNow,
    opportunity.memoryContext.bestCombo,
  );
}

function buildNextStepLine(opportunity: ContentOpportunity): string {
  return firstNonEmpty(
    opportunity.suggestedNextStep,
    opportunity.supportingSignals[0],
    opportunity.whyNow,
  );
}

function buildBeatPurpose(order: number): string {
  switch (order) {
    case 1:
      return "hook";
    case 2:
      return "recognition";
    case 3:
      return "relief / reframe";
    case 4:
    default:
      return "next step / soft cta";
  }
}

export function buildVideoBeats(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
  durationSec: VideoBrief["durationSec"],
): VideoBeat[] {
  const recognitionLine = normalizeSentence(buildRecognitionLine(opportunity, angle));
  const reliefLine = normalizeSentence(buildReliefLine(opportunity, angle));
  const nextStepLine = normalizeSentence(buildNextStepLine(opportunity));
  const useThreeBeatStructure = durationSec === 15 && opportunity.trustRisk === "low";

  if (useThreeBeatStructure) {
    return [
      videoBeatSchema.parse({
        order: 1,
        purpose: buildBeatPurpose(1),
        guidance: `Open with the selected hook exactly as written. Deliver it plainly and give it a beat to land.`,
        suggestedOverlay: clipLine(hookSet.primaryHook.text, 72),
      }),
      videoBeatSchema.parse({
        order: 2,
        purpose: "recognition + relief / reframe",
        guidance: `Name the teacher reality quickly, then move straight into the steadier frame. Use ${recognitionLine} ${reliefLine}`,
        suggestedOverlay: clipLine(cleanLine(recognitionLine), 72),
      }),
      videoBeatSchema.parse({
        order: 3,
        purpose: "next step / soft cta",
        guidance: `Close with one useful next step and a soft line that leaves the teacher feeling understood, not pushed. Use ${nextStepLine}`,
        suggestedOverlay: clipLine(cleanLine(nextStepLine), 72),
      }),
    ];
  }

  return [
    videoBeatSchema.parse({
      order: 1,
      purpose: buildBeatPurpose(1),
      guidance: "Open with the selected hook exactly as written. Keep the delivery clean and unhurried.",
      suggestedOverlay: clipLine(hookSet.primaryHook.text, 72),
    }),
    videoBeatSchema.parse({
      order: 2,
      purpose: buildBeatPurpose(2),
      guidance: `Recognize the teacher experience without overselling it. Stay close to ${recognitionLine}`,
      suggestedOverlay: clipLine(cleanLine(recognitionLine), 72),
    }),
    videoBeatSchema.parse({
      order: 3,
      purpose: buildBeatPurpose(3),
      guidance: `Offer the relief, reframe, or practical shift. Keep the teacher's emotional reality central. Use ${reliefLine}`,
      suggestedOverlay: clipLine(cleanLine(reliefLine), 72),
    }),
    videoBeatSchema.parse({
      order: 4,
      purpose: buildBeatPurpose(4),
      guidance: `Close with one grounded next step and a soft CTA. Use ${nextStepLine}`,
      suggestedOverlay: clipLine(cleanLine(nextStepLine), 72),
    }),
  ];
}

export function buildOverlayLines(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
  beats: VideoBeat[],
): string[] {
  const candidateLines = [
    clipLine(hookSet.primaryHook.text, 64),
    clipLine(cleanLine(buildRecognitionLine(opportunity, angle)), 64),
    clipLine(cleanLine(opportunity.recommendedAngle), 64),
    clipLine(cleanLine(buildNextStepLine(opportunity)), 64),
  ];

  const beatOverlays = beats
    .map((beat) => beat.suggestedOverlay)
    .filter((value): value is string => Boolean(normalizeText(value)));
  const seen = new Set<string>();

  return [...candidateLines, ...beatOverlays]
    .map((line) => clipLine(line, 64))
    .filter((line) => normalizeText(line).length > 0)
    .filter((line) => evaluatePhaseBTrust(line).penalty < 24)
    .filter((line) => {
      const key = normalizeText(line).toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

export function buildSoftCta(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
): string {
  if (opportunity.trustRisk === "high" || angle.style === "risk-awareness") {
    return "Teachers need a safer place to work through messages like this.";
  }

  if (angle.style === "teacher-voice" || angle.style === "validation") {
    return "If this feels familiar, you are not the only one.";
  }

  if (angle.style === "practical-help") {
    return "That is part of why Zaza Draft exists.";
  }

  return "Teachers need calmer ways to work through messages like this.";
}

function buildProductionNotes(
  opportunity: ContentOpportunity,
  format: VideoBrief["format"],
): string[] | undefined {
  const notes: string[] = [];

  if (format === "talking-head") {
    notes.push("Record in one take if possible; natural delivery matters more than polish.");
  }

  if (format === "text-led" || format === "carousel-to-video") {
    notes.push("Keep on-screen text large and readable enough to scan without pausing.");
  }

  if (format === "b-roll") {
    notes.push("Use ordinary classroom or desk detail shots; avoid polished ad-style footage.");
  }

  if (opportunity.trustRisk !== "low") {
    notes.push("Keep any risk or caution language visible rather than hiding it in the close.");
  }

  return notes.length > 0 ? notes : undefined;
}

function fallbackOverlayLines(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
): string[] {
  return [
    clipLine(hookSet.primaryHook.text, 64),
    clipLine(cleanLine(buildRecognitionLine(opportunity, angle)), 64),
    clipLine(cleanLine(buildReliefLine(opportunity, angle)), 64),
    clipLine(cleanLine(buildNextStepLine(opportunity)), 64),
  ]
    .filter((line) => normalizeText(line).length > 0)
    .slice(0, 4);
}

function sanitizeBriefBeat(
  beat: VideoBeat,
  index: number,
): VideoBeat {
  const earlyBeat = index < 2;

  return {
    ...beat,
    suggestedOverlay:
      beat.suggestedOverlay &&
      evaluatePhaseBTrust(beat.suggestedOverlay).penalty < 24 &&
      !(earlyBeat && isEarlyProductMention(beat.suggestedOverlay))
        ? beat.suggestedOverlay
        : undefined,
    guidance:
      evaluatePhaseBTrust(beat.guidance, {
        allowProductMention: !earlyBeat,
      }).penalty < 24 && !(earlyBeat && isEarlyProductMention(beat.guidance))
        ? beat.guidance
        : earlyBeat
          ? "Keep the line plainspoken and anchored in the teacher reality."
          : "Close in a calm, useful way without pushing the product too hard.",
  };
}

function sanitizeOverlayLines(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
  lines: string[],
): string[] {
  const anchorTokens = buildBriefAnchorTokens(opportunity, angle, hookSet);
  const kept = lines.filter((line) =>
    evaluatePhaseBTrust(line).penalty < 24 &&
    countPhaseBAnchorOverlap(line, anchorTokens) >= 1 &&
    !isEarlyProductMention(line),
  );

  return (kept.length >= 2 ? kept : fallbackOverlayLines(opportunity, angle, hookSet)).slice(0, 4);
}

export function validateVideoBrief(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
  brief: VideoBrief,
): VideoBrief {
  const anchorTokens = buildBriefAnchorTokens(opportunity, angle, hookSet);
  const safeStructure = brief.structure.map((beat, index) =>
    sanitizeBriefBeat(beat, index),
  );
  const safeOverlayLines = sanitizeOverlayLines(
    opportunity,
    angle,
    hookSet,
    brief.overlayLines,
  );
  const safeCta =
    evaluatePhaseBTrust(brief.cta, { allowProductMention: true }).penalty < 24
      ? brief.cta
      : buildSoftCta(opportunity, angle);
  const safeProductionNotes = brief.productionNotes?.filter(
    (note) => evaluatePhaseBTrust(note, { allowProductMention: true }).penalty < 24,
  );
  const nextBrief = videoBriefSchema.parse({
    ...brief,
    title:
      evaluatePhaseBTrust(brief.title).penalty < 24
        ? brief.title
        : `${cleanLine(opportunity.primaryPainPoint)} video brief`,
    goal:
      evaluatePhaseBTrust(brief.goal).penalty < 24
        ? brief.goal
        : buildGoal(opportunity, angle),
    tone:
      evaluatePhaseBTrust(brief.tone).penalty < 24
        ? brief.tone
        : buildTone(opportunity, angle),
    visualDirection:
      evaluatePhaseBTrust(brief.visualDirection).penalty < 24
        ? brief.visualDirection
        : buildVisualDirection(opportunity, angle, brief.format),
    structure: safeStructure,
    overlayLines: safeOverlayLines,
    cta: safeCta,
    productionNotes: safeProductionNotes?.length ? safeProductionNotes : undefined,
  });
  const textToValidate = [
    nextBrief.title,
    nextBrief.hook,
    nextBrief.goal,
    nextBrief.tone,
    nextBrief.visualDirection,
    ...nextBrief.overlayLines,
    nextBrief.cta,
    ...(nextBrief.productionNotes ?? []),
    ...nextBrief.structure.flatMap((beat) => [
      beat.purpose,
      beat.guidance,
      beat.suggestedOverlay ?? "",
    ]),
  ].join(" ");
  const trustCheck = evaluatePhaseBTrust(textToValidate, {
    allowProductMention: true,
  });
  const anchorOverlap = countPhaseBAnchorOverlap(textToValidate, anchorTokens);

  if (trustCheck.penalty >= 32 || anchorOverlap < 6) {
    return videoBriefSchema.parse({
      ...nextBrief,
      title: `${cleanLine(opportunity.primaryPainPoint)} video brief`,
      goal: buildGoal(opportunity, angle),
      tone: buildTone(opportunity, angle),
      visualDirection: buildVisualDirection(opportunity, angle, nextBrief.format),
      overlayLines: fallbackOverlayLines(opportunity, angle, hookSet).slice(0, 4),
      cta:
        opportunity.trustRisk === "high"
          ? "Teachers need a safer place to work through messages like this."
          : "If this feels familiar, you are not the only one.",
    });
  }

  return nextBrief;
}

export const validateTrustSafeVideoBrief = validateVideoBrief;

function rawBriefForTrustCheck(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
): VideoBrief {
  const format = chooseVideoBriefFormat(opportunity, angle);
  const durationSec = chooseVideoBriefDuration(opportunity, angle);
  const structure = buildVideoBeats(opportunity, angle, hookSet, durationSec);
  const overlayLines = buildOverlayLines(opportunity, angle, hookSet, structure);
  const cta = buildSoftCta(opportunity, angle);

  return videoBriefSchema.parse({
    id: briefId(opportunity.opportunityId, angle.id, hookSet.id),
    opportunityId: opportunity.opportunityId,
    angleId: angle.id,
    hookSetId: hookSet.id,
    title: `${angle.title} video brief`,
    hook: hookSet.primaryHook.text,
    format,
    durationSec,
    goal: buildGoal(opportunity, angle),
    tone: buildTone(opportunity, angle),
    structure,
    visualDirection: buildVisualDirection(opportunity, angle, format),
    overlayLines,
    cta,
    productionNotes: buildProductionNotes(opportunity, format),
  });
}

function briefChangedForTrust(original: VideoBrief, validated: VideoBrief) {
  return JSON.stringify(original) !== JSON.stringify(validated);
}

function buildVideoBriefTrustDiagnostics(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
  rawBrief: VideoBrief,
  validatedBrief: VideoBrief,
): VideoBriefTrustDiagnostics {
  const anchorTokens = buildBriefAnchorTokens(opportunity, angle, hookSet);
  const textToValidate = [
    validatedBrief.title,
    validatedBrief.hook,
    validatedBrief.goal,
    validatedBrief.tone,
    validatedBrief.visualDirection,
    ...validatedBrief.overlayLines,
    validatedBrief.cta,
    ...(validatedBrief.productionNotes ?? []),
    ...validatedBrief.structure.flatMap((beat) => [
      beat.purpose,
      beat.guidance,
      beat.suggestedOverlay ?? "",
    ]),
  ].join(" ");
  const trustCheck = evaluatePhaseBTrust(textToValidate, {
    allowProductMention: true,
  });

  return {
    penalty: trustCheck.penalty,
    reasons: trustCheck.reasons,
    anchorOverlap: countPhaseBAnchorOverlap(textToValidate, anchorTokens),
    wasSanitized: briefChangedForTrust(rawBrief, validatedBrief),
    usedFallback:
      validatedBrief.cta !== rawBrief.cta ||
      validatedBrief.title !== rawBrief.title ||
      validatedBrief.goal !== rawBrief.goal ||
      validatedBrief.overlayLines.join("||") !== rawBrief.overlayLines.join("||"),
  };
}

export function inspectVideoBriefTrust(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
  brief: VideoBrief,
): VideoBriefTrustDiagnostics {
  const rawBrief = rawBriefForTrustCheck(opportunity, angle, hookSet);
  const validatedBrief = validateVideoBrief(opportunity, angle, hookSet, brief);

  return buildVideoBriefTrustDiagnostics(
    opportunity,
    angle,
    hookSet,
    rawBrief,
    validatedBrief,
  );
}

export function buildVideoBriefWithDiagnostics(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
): {
  brief: VideoBrief;
  diagnostics: VideoBriefTrustDiagnostics;
} {
  const rawBrief = rawBriefForTrustCheck(opportunity, angle, hookSet);
  const brief = validateVideoBrief(opportunity, angle, hookSet, rawBrief);

  return {
    brief,
    diagnostics: buildVideoBriefTrustDiagnostics(
      opportunity,
      angle,
      hookSet,
      rawBrief,
      brief,
    ),
  };
}

export function buildVideoBrief(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
): VideoBrief {
  return buildVideoBriefWithDiagnostics(opportunity, angle, hookSet).brief;
}
