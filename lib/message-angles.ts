import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import { buildContentIntelligenceFromSignal } from "@/lib/strategic-intelligence-types";
import {
  buildPhaseBAnchorTokens,
  countPhaseBAnchorOverlap,
  evaluatePhaseBTrust,
  normalizePhaseBText,
} from "@/lib/phase-b-trust";

export const MESSAGE_ANGLE_STYLES = [
  "validation",
  "reframe",
  "practical-help",
  "risk-awareness",
  "calm-relief",
  "teacher-voice",
] as const;

export const MESSAGE_ANGLE_FRAMING_TYPES = [
  "risk-tension",
  "reassurance-relief",
  "practical-clarity",
] as const;

export const MESSAGE_ANGLE_RISK_POSTURES = [
  "protective",
  "balanced",
  "confident",
] as const;

export type MessageAngleStyle = (typeof MESSAGE_ANGLE_STYLES)[number];
export type MessageAngleFramingType = (typeof MESSAGE_ANGLE_FRAMING_TYPES)[number];
export type MessageAngleRiskPosture = (typeof MESSAGE_ANGLE_RISK_POSTURES)[number];

export const messageAngleStyleSchema = z.enum(MESSAGE_ANGLE_STYLES);
export const messageAngleFramingTypeSchema = z.enum(MESSAGE_ANGLE_FRAMING_TYPES);
export const messageAngleRiskPostureSchema = z.enum(MESSAGE_ANGLE_RISK_POSTURES);

export const messageAngleSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  style: messageAngleStyleSchema,
  framingType: messageAngleFramingTypeSchema,
  primaryPainPoint: z.string().trim().min(1),
  promisedOutcome: z.string().trim().min(1),
  intendedViewerEffect: z.string().trim().min(1),
  riskPosture: messageAngleRiskPostureSchema,
  rank: z.number().int().min(1).max(3),
  createdAt: z.string().trim().min(1),
  audienceFrame: z.string().trim().min(1),
  coreMessage: z.string().trim().min(1),
  teacherVoiceLine: z.string().trim().min(1),
  whyThisAngle: z.string().trim().min(1),
  trustRisk: z.enum(["low", "medium", "high"]),
  score: z.number().int().min(0).max(100),
  isRecommended: z.boolean(),
});

export type MessageAngle = z.infer<typeof messageAngleSchema>;

export interface MessageAngleTrustDiagnostics {
  penalty: number;
  reasons: string[];
  anchorOverlap: number;
  isUnsafe: boolean;
  isLowQuality: boolean;
}

export const MESSAGE_ANGLE_PLAYBOOK: Record<
  MessageAngleFramingType,
  {
    label: string;
    purpose: string;
    style: MessageAngleStyle;
  }
> = {
  "risk-tension": {
    label: "Risk / tension",
    purpose: "Make the cost of leaving the pain point unaddressed visible without sounding alarmist.",
    style: "risk-awareness",
  },
  "reassurance-relief": {
    label: "Reassurance / relief",
    purpose: "Lower emotional load first so the founder can offer steadiness before advice.",
    style: "calm-relief",
  },
  "practical-clarity": {
    label: "Practical clarity",
    purpose: "Turn the opportunity into one useful next move the viewer can trust and act on.",
    style: "practical-help",
  },
};

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

function clipText(value: string, maxLength: number): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
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

function containsStressLanguage(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    "pressure",
    "stress",
    "overwhelm",
    "drain",
    "tense",
    "tension",
    "spiral",
    "escalat",
    "panic",
  ].some((token) => normalized.includes(token));
}

function cleanAnchor(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "teacher pressure";
  }

  return normalized.replace(/[.!?]+$/g, "");
}

function angleId(opportunityId: string, framingType: MessageAngleFramingType): string {
  return `${opportunityId}:message-angle:${framingType}`;
}

function selectedStyleForFramingType(
  framingType: MessageAngleFramingType,
): MessageAngleStyle {
  return MESSAGE_ANGLE_PLAYBOOK[framingType].style;
}

function primaryTeacherPhrase(opportunity: ContentOpportunity): string {
  return firstNonEmpty(
    opportunity.teacherLanguage[0],
    opportunity.primaryPainPoint,
    opportunity.recommendedAngle,
    opportunity.title,
  );
}

function cautionLine(opportunity: ContentOpportunity): string {
  return firstNonEmpty(
    opportunity.riskSummary,
    opportunity.memoryContext.caution,
    opportunity.supportingSignals[0],
    opportunity.whyNow,
  );
}

function viewerEffectForFramingType(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): string {
  const contentIntelligence = buildContentIntelligenceFromSignal(opportunity);
  const existingEffect = normalizeText(contentIntelligence.intendedViewerEffect);

  if (existingEffect) {
    return existingEffect;
  }

  switch (framingType) {
    case "risk-tension":
      return "heightened caution with enough clarity to act earlier";
    case "reassurance-relief":
      return "recognition and relief before the viewer takes the next step";
    case "practical-clarity":
    default:
      return "clearer action and more confidence in the next move";
  }
}

function riskPostureForFramingType(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): MessageAngleRiskPosture {
  const growthRisk = opportunity.growthIntelligence?.riskLevel ?? null;

  if (
    framingType === "risk-tension" ||
    opportunity.trustRisk === "high" ||
    growthRisk === "high"
  ) {
    return "protective";
  }

  if (framingType === "practical-clarity" && opportunity.trustRisk === "low") {
    return "confident";
  }

  return "balanced";
}

function promisedOutcomeForFramingType(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): string {
  const teacherPhrase = cleanAnchor(primaryTeacherPhrase(opportunity)).toLowerCase();
  const recommendedAngle = cleanAnchor(opportunity.recommendedAngle).toLowerCase();

  switch (framingType) {
    case "risk-tension":
      return normalizeSentence(
        `Help the viewer spot the hidden risk around ${teacherPhrase} before it escalates and respond more safely`,
      );
    case "reassurance-relief":
      return normalizeSentence(
        `Help the viewer feel steadier and less alone around ${teacherPhrase} without adding more pressure`,
      );
    case "practical-clarity":
    default:
      return normalizeSentence(
        `Give the viewer one clearer next move grounded in ${recommendedAngle || teacherPhrase}`,
      );
  }
}

function audienceFrameForFramingType(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): string {
  const painPoint = cleanAnchor(opportunity.primaryPainPoint);

  switch (framingType) {
    case "risk-tension":
      return `Teachers dealing with ${painPoint} who need the downstream risk named before anyone jumps to a neat answer.`;
    case "reassurance-relief":
      return `Teachers carrying ${painPoint} who respond better to relief and recognition than more urgency.`;
    case "practical-clarity":
    default:
      return `Teachers dealing with ${painPoint} who need one calm, practical next step they can trust.`;
  }
}

function titleForFramingType(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): string {
  const painPoint = cleanAnchor(opportunity.primaryPainPoint);

  switch (framingType) {
    case "risk-tension":
      return clipText(`${painPoint}: show what gets worse if it keeps sliding`, 88);
    case "reassurance-relief":
      return clipText(`${painPoint}: lower the pressure before offering advice`, 88);
    case "practical-clarity":
    default:
      return clipText(`${painPoint}: turn it into one clearer next step`, 88);
  }
}

function teacherVoiceLineForFramingType(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): string {
  const teacherPhrase = cleanAnchor(primaryTeacherPhrase(opportunity));

  switch (framingType) {
    case "risk-tension":
      return normalizeSentence(
        `"${teacherPhrase}" is exactly the kind of moment that gets harder when the risk is softened too early`,
      );
    case "reassurance-relief":
      return normalizeSentence(
        `"${teacherPhrase}" already tells you the pressure is real, so the first job is to make the viewer feel less pinned down by it`,
      );
    case "practical-clarity":
    default:
      return normalizeSentence(
        `"${teacherPhrase}" should lead to one usable move, not more noise about what teachers should be doing`,
      );
  }
}

function coreMessageForFramingType(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): string {
  const teacherPhrase = cleanAnchor(primaryTeacherPhrase(opportunity)).toLowerCase();
  const recommendedAngle = cleanAnchor(opportunity.recommendedAngle).toLowerCase();
  const caution = cleanAnchor(cautionLine(opportunity)).toLowerCase();

  switch (framingType) {
    case "risk-tension":
      return normalizeSentence(
        `Foreground the tension inside ${teacherPhrase}, keep ${caution || "the caution"} visible, and frame the message as protection rather than alarm`,
      );
    case "reassurance-relief":
      return normalizeSentence(
        `Lead with recognition, use ${recommendedAngle || teacherPhrase}, and promise steadiness rather than more effort`,
      );
    case "practical-clarity":
    default:
      return normalizeSentence(
        `Use ${recommendedAngle || teacherPhrase} to turn the pain point into one clear next move the viewer can actually use`,
      );
  }
}

function whyThisAngleForFramingType(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): string {
  const whyNow = cleanAnchor(opportunity.whyNow).toLowerCase();
  const growthRisk = opportunity.growthIntelligence?.riskLevel ?? opportunity.trustRisk;

  switch (framingType) {
    case "risk-tension":
      return normalizeSentence(
        `This opportunity already carries ${growthRisk} risk signals, so keeping caution visible makes the framing more trustworthy`,
      );
    case "reassurance-relief":
      return normalizeSentence(
        `The teacher-facing language is emotionally loaded enough that relief will land better than another pressure-forward message`,
      );
    case "practical-clarity":
    default:
      return normalizeSentence(
        `The why-now case is already ${whyNow || "clear"}, so the strongest founder-facing version is one that gives the viewer a specific next step`,
      );
  }
}

function summaryForAngle(input: {
  opportunity: ContentOpportunity;
  framingType: MessageAngleFramingType;
  promisedOutcome: string;
  intendedViewerEffect: string;
}): string {
  const painPoint = cleanAnchor(input.opportunity.primaryPainPoint);
  const emotionalPayoff = cleanAnchor(input.promisedOutcome).toLowerCase();
  const viewerEffect = cleanAnchor(input.intendedViewerEffect).toLowerCase();

  switch (input.framingType) {
    case "risk-tension":
      return clipText(
        `${painPoint} is framed as a pressure point that can quietly escalate. The payoff is to ${emotionalPayoff}, while aiming for ${viewerEffect}.`,
        220,
      );
    case "reassurance-relief":
      return clipText(
        `${painPoint} is framed as something heavy but survivable. The payoff is to ${emotionalPayoff}, while aiming for ${viewerEffect}.`,
        220,
      );
    case "practical-clarity":
    default:
      return clipText(
        `${painPoint} is framed as a solvable moment that needs cleaner direction. The payoff is to ${emotionalPayoff}, while aiming for ${viewerEffect}.`,
        220,
      );
  }
}

function deriveAngleTrustRisk(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): MessageAngle["trustRisk"] {
  if (framingType === "risk-tension") {
    return opportunity.trustRisk === "low" ? "medium" : opportunity.trustRisk;
  }

  if (framingType === "reassurance-relief" && opportunity.trustRisk === "high") {
    return "medium";
  }

  return opportunity.trustRisk;
}

function getOpportunityAnchorTokens(opportunity: ContentOpportunity): Set<string> {
  return buildPhaseBAnchorTokens([
    opportunity.title,
    opportunity.primaryPainPoint,
    ...opportunity.teacherLanguage,
    opportunity.recommendedAngle,
    opportunity.whyNow,
    opportunity.riskSummary,
    opportunity.memoryContext.bestCombo,
    opportunity.memoryContext.revenuePattern,
    opportunity.memoryContext.audienceCue,
    opportunity.memoryContext.caution,
  ]);
}

function baseFitScore(
  opportunity: ContentOpportunity,
  framingType: MessageAngleFramingType,
): number {
  const contentIntelligence = buildContentIntelligenceFromSignal(opportunity);
  const effectText = normalizeText(contentIntelligence.intendedViewerEffect).toLowerCase();
  const rationaleText = normalizeText(contentIntelligence.rationale).toLowerCase();
  const growthRisk = opportunity.growthIntelligence?.riskLevel ?? opportunity.trustRisk;
  const stressText = `${opportunity.primaryPainPoint} ${opportunity.teacherLanguage.join(" ")}`.toLowerCase();
  let score = 52;

  if (framingType === "practical-clarity") {
    score += opportunity.priority === "high" ? 18 : 12;
    score += opportunity.recommendedFormat === "short_video" ? 6 : 0;
    score += (contentIntelligence.performanceDrivers.viewerConnection ?? 0) >= 4 ? 4 : 0;
  }

  if (framingType === "reassurance-relief") {
    score += containsStressLanguage(stressText) ? 18 : 10;
    score += containsStressLanguage(effectText) ? 10 : 0;
    score += containsStressLanguage(rationaleText) ? 6 : 0;
  }

  if (framingType === "risk-tension") {
    score += growthRisk === "high" ? 22 : growthRisk === "medium" ? 12 : 4;
    score += normalizeText(opportunity.riskSummary) ? 8 : 0;
    score += normalizeText(opportunity.memoryContext.caution) ? 6 : 0;
  }

  return score;
}

export function selectMessageAngleStyles(
  opportunity: ContentOpportunity,
): MessageAngleStyle[] {
  return MESSAGE_ANGLE_FRAMING_TYPES.map((framingType) => ({
    framingType,
    score: baseFitScore(opportunity, framingType),
  }))
    .sort(
      (left, right) =>
        right.score - left.score || left.framingType.localeCompare(right.framingType),
    )
    .map((entry) => selectedStyleForFramingType(entry.framingType));
}

export function buildMessageAngleForStyle(
  opportunity: ContentOpportunity,
  style: MessageAngleStyle,
  createdAt?: string,
): MessageAngle {
  const framingType = MESSAGE_ANGLE_FRAMING_TYPES.find(
    (candidate) => selectedStyleForFramingType(candidate) === style,
  );

  if (!framingType) {
    throw new Error(`Unsupported message angle style: ${style}`);
  }

  const intendedViewerEffect = viewerEffectForFramingType(opportunity, framingType);
  const promisedOutcome = promisedOutcomeForFramingType(opportunity, framingType);
  const angle = messageAngleSchema.parse({
    id: angleId(opportunity.opportunityId, framingType),
    opportunityId: opportunity.opportunityId,
    title: titleForFramingType(opportunity, framingType),
    summary: summaryForAngle({
      opportunity,
      framingType,
      promisedOutcome,
      intendedViewerEffect,
    }),
    style,
    framingType,
    primaryPainPoint: normalizeSentence(opportunity.primaryPainPoint),
    promisedOutcome,
    intendedViewerEffect: normalizeSentence(intendedViewerEffect),
    riskPosture: riskPostureForFramingType(opportunity, framingType),
    rank: 3,
    createdAt:
      normalizeText(createdAt) ||
      normalizeText(opportunity.updatedAt) ||
      normalizeText(opportunity.createdAt) ||
      new Date().toISOString(),
    audienceFrame: audienceFrameForFramingType(opportunity, framingType),
    coreMessage: coreMessageForFramingType(opportunity, framingType),
    teacherVoiceLine: teacherVoiceLineForFramingType(opportunity, framingType),
    whyThisAngle: whyThisAngleForFramingType(opportunity, framingType),
    trustRisk: deriveAngleTrustRisk(opportunity, framingType),
    score: 0,
    isRecommended: false,
  });

  return {
    ...angle,
    score: scoreMessageAngle(opportunity, angle),
  };
}

export function scoreMessageAngle(
  opportunity: ContentOpportunity,
  angle: Omit<MessageAngle, "score" | "isRecommended" | "rank"> | MessageAngle,
): number {
  const combinedText = [
    angle.title,
    angle.summary,
    angle.coreMessage,
    angle.teacherVoiceLine,
    angle.whyThisAngle,
    angle.promisedOutcome,
  ].join(" ");
  const anchorOverlap = countPhaseBAnchorOverlap(
    combinedText,
    getOpportunityAnchorTokens(opportunity),
  );
  const trustCheck = evaluatePhaseBTrust(combinedText);
  let score = baseFitScore(opportunity, angle.framingType);

  score += Math.min(16, anchorOverlap * 4);
  score += angle.framingType === "practical-clarity" ? 4 : 0;
  score += angle.framingType === "reassurance-relief" && containsStressLanguage(combinedText) ? 3 : 0;
  score -= angle.trustRisk === "high" ? 14 : angle.trustRisk === "medium" ? 6 : 0;
  score -= trustCheck.penalty;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function angleTrustPenalty(opportunity: ContentOpportunity, angle: MessageAngle): number {
  const combinedText = [
    angle.title,
    angle.summary,
    angle.audienceFrame,
    angle.coreMessage,
    angle.teacherVoiceLine,
    angle.whyThisAngle,
  ].join(" ");
  const trustCheck = evaluatePhaseBTrust(combinedText);
  const anchorOverlap = countPhaseBAnchorOverlap(
    combinedText,
    getOpportunityAnchorTokens(opportunity),
  );
  let penalty = trustCheck.penalty;

  if (anchorOverlap < 2) {
    penalty += 18;
  }

  if (normalizePhaseBText(angle.teacherVoiceLine).length < 24) {
    penalty += 8;
  }

  return penalty;
}

function isAngleUnsafe(opportunity: ContentOpportunity, angle: MessageAngle): boolean {
  return angleTrustPenalty(opportunity, angle) >= 24;
}

function isAngleLowQuality(opportunity: ContentOpportunity, angle: MessageAngle): boolean {
  const sharedAnchors = countPhaseBAnchorOverlap(
    [angle.summary, angle.coreMessage, angle.teacherVoiceLine].join(" "),
    getOpportunityAnchorTokens(opportunity),
  );

  return (
    angle.score < 54 ||
    sharedAnchors < 2 ||
    angle.summary.length < 56 ||
    angle.coreMessage.length < 48
  );
}

export function inspectMessageAngleTrust(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
): MessageAngleTrustDiagnostics {
  const combinedText = [
    angle.title,
    angle.summary,
    angle.audienceFrame,
    angle.coreMessage,
    angle.teacherVoiceLine,
    angle.whyThisAngle,
  ].join(" ");
  const reasons = evaluatePhaseBTrust(combinedText).reasons;
  const anchorOverlap = countPhaseBAnchorOverlap(
    combinedText,
    getOpportunityAnchorTokens(opportunity),
  );
  const penalty = angleTrustPenalty(opportunity, angle);
  const isLowQuality = isAngleLowQuality(opportunity, angle);

  return {
    penalty,
    reasons,
    anchorOverlap,
    isUnsafe: penalty >= 24,
    isLowQuality,
  };
}

function signature(angle: MessageAngle): string {
  return normalizeText(
    `${angle.framingType} ${angle.title} ${angle.summary} ${angle.coreMessage}`,
  )
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "");
}

export function filterUnsafeAngles(
  opportunity: ContentOpportunity,
  angles: MessageAngle[],
): MessageAngle[] {
  const seen = new Set<string>();

  return angles
    .filter((angle) => !isAngleUnsafe(opportunity, angle))
    .filter((angle) => !isAngleLowQuality(opportunity, angle))
    .filter((angle) => {
      const nextSignature = signature(angle);
      if (seen.has(nextSignature)) {
        return false;
      }

      seen.add(nextSignature);
      return true;
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.framingType.localeCompare(right.framingType),
    )
    .slice(0, 3);
}

export const filterMessageAngles = filterUnsafeAngles;

function selectSafestAngleFallbacks(
  opportunity: ContentOpportunity,
  angles: MessageAngle[],
): MessageAngle[] {
  const seen = new Set<string>();

  return [...angles]
    .sort(
      (left, right) =>
        angleTrustPenalty(opportunity, left) - angleTrustPenalty(opportunity, right) ||
        right.score - left.score ||
        left.framingType.localeCompare(right.framingType),
    )
    .filter((angle) => {
      const nextSignature = signature(angle);
      if (seen.has(nextSignature)) {
        return false;
      }

      seen.add(nextSignature);
      return true;
    })
    .slice(0, 3);
}

export function markRecommendedMessageAngle(angles: MessageAngle[]): MessageAngle[] {
  const ranked = [...angles]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.framingType.localeCompare(right.framingType),
    )
    .slice(0, 3);

  return ranked.map((angle, index) =>
    messageAngleSchema.parse({
      ...angle,
      rank: index + 1,
      isRecommended: index === 0,
    }),
  );
}

function normalizePersistedAngles(angles: MessageAngle[] | null | undefined): MessageAngle[] {
  if (!angles?.length) {
    return [];
  }

  const parsed = angles
    .map((angle) => messageAngleSchema.safeParse(angle))
    .filter((result): result is { success: true; data: MessageAngle } => result.success)
    .map((result) => result.data);

  if (parsed.length === 0) {
    return [];
  }

  return markRecommendedMessageAngle(parsed);
}

export function generateMessageAngles(
  opportunity: ContentOpportunity,
  createdAt?: string,
): MessageAngle[] {
  const builtAngles = MESSAGE_ANGLE_FRAMING_TYPES.map((framingType) =>
    buildMessageAngleForStyle(
      opportunity,
      selectedStyleForFramingType(framingType),
      createdAt,
    ),
  );
  const filtered = filterUnsafeAngles(opportunity, builtAngles);
  const finalAngles =
    filtered.length >= 2
      ? filtered
      : selectSafestAngleFallbacks(opportunity, builtAngles).slice(0, 2);

  return markRecommendedMessageAngle(finalAngles);
}

export function buildMessageAngles(opportunity: ContentOpportunity): MessageAngle[] {
  const persisted = normalizePersistedAngles(opportunity.messageAngles ?? null);
  if (persisted.length > 0) {
    return persisted;
  }

  return generateMessageAngles(opportunity);
}
