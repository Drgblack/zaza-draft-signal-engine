import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
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

export type MessageAngleStyle = (typeof MESSAGE_ANGLE_STYLES)[number];

export const messageAngleStyleSchema = z.enum(MESSAGE_ANGLE_STYLES);

export const messageAngleSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  style: messageAngleStyleSchema,
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
  MessageAngleStyle,
  {
    label: string;
    purpose: string;
  }
> = {
  validation: {
    label: "Validation",
    purpose: "Name the teacher pressure clearly before trying to solve it.",
  },
  reframe: {
    label: "Reframe",
    purpose: "Offer a steadier way to interpret the situation without overselling certainty.",
  },
  "practical-help": {
    label: "Practical help",
    purpose: "Give one grounded next move teachers can actually use.",
  },
  "risk-awareness": {
    label: "Risk awareness",
    purpose: "Keep caution visible so the message stays trustworthy under pressure.",
  },
  "calm-relief": {
    label: "Calm relief",
    purpose: "Reduce emotional load rather than adding more pressure or performance.",
  },
  "teacher-voice": {
    label: "Teacher voice",
    purpose: "Make the message sound like a steady colleague, not a marketer.",
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

  const trimmed = normalized.replace(/[.!?]+$/g, "");
  return `${trimmed}.`;
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
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

function firstTeacherLine(opportunity: ContentOpportunity): string {
  return firstNonEmpty(
    opportunity.teacherLanguage[0],
    opportunity.primaryPainPoint,
    opportunity.recommendedAngle,
    opportunity.title,
  );
}

function secondTeacherLine(opportunity: ContentOpportunity): string {
  return firstNonEmpty(
    opportunity.teacherLanguage[1],
    opportunity.teacherLanguage[0],
    opportunity.memoryContext.audienceCue,
    opportunity.primaryPainPoint,
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

function bestMemoryLine(opportunity: ContentOpportunity): string {
  return firstNonEmpty(
    opportunity.memoryContext.bestCombo,
    opportunity.memoryContext.revenuePattern,
    opportunity.memoryContext.audienceCue,
    opportunity.supportingSignals[0],
  );
}

function cleanAnchor(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "teacher pressure";
  }

  return normalized.replace(/[.!?]+$/g, "");
}

function angleId(opportunityId: string, style: MessageAngleStyle) {
  return `${opportunityId}:message-angle:${style}`;
}

function getOpportunityAnchorTokens(opportunity: ContentOpportunity): Set<string> {
  const anchorFields = [
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
  ];

  return buildPhaseBAnchorTokens(anchorFields);
}

function buildTitle(opportunity: ContentOpportunity, style: MessageAngleStyle): string {
  const anchor = cleanAnchor(opportunity.primaryPainPoint);

  switch (style) {
    case "validation":
      return clipText(`${anchor}: name the pressure first`, 72);
    case "reframe":
      return clipText(`${anchor}: offer a steadier frame`, 72);
    case "practical-help":
      return clipText(`${anchor}: give one useful next step`, 72);
    case "risk-awareness":
      return clipText(`${anchor}: keep the caution visible`, 72);
    case "calm-relief":
      return clipText(`${anchor}: lower the pressure`, 72);
    case "teacher-voice":
    default:
      return clipText(`${anchor}: sound like a trusted colleague`, 72);
  }
}

function buildAudienceFrame(opportunity: ContentOpportunity, style: MessageAngleStyle): string {
  const painPoint = cleanAnchor(opportunity.primaryPainPoint);

  switch (style) {
    case "validation":
      return `Teachers who are carrying ${painPoint} and want the pressure named honestly before advice shows up.`;
    case "reframe":
      return `Teachers who are close to the problem and need a clearer frame, not a louder opinion.`;
    case "practical-help":
      return `Teachers who need one calm, usable move they can apply in a real school day.`;
    case "risk-awareness":
      return `Teachers who want practical guidance without pretending the risk has disappeared.`;
    case "calm-relief":
      return `Teachers who are already carrying enough and respond better to relief than urgency.`;
    case "teacher-voice":
    default:
      return `Teachers who trust language that sounds lived-in, specific, and respectful of classroom reality.`;
  }
}

function buildCoreMessage(opportunity: ContentOpportunity, style: MessageAngleStyle): string {
  const teacherLine = cleanAnchor(firstTeacherLine(opportunity));
  const recommendedAngle = cleanAnchor(opportunity.recommendedAngle);
  const whyNow = cleanAnchor(opportunity.whyNow);
  const caution = cleanAnchor(cautionLine(opportunity));
  const bestMemory = cleanAnchor(bestMemoryLine(opportunity));

  switch (style) {
    case "validation":
      return normalizeSentence(
        `${teacherLine} is a real load, not a small complaint. Start by acknowledging that pressure, then move into ${recommendedAngle.toLowerCase()}`,
      );
    case "reframe":
      return normalizeSentence(
        `What looks like a single difficult moment is often a wider pattern teachers are carrying. Reframe it through ${recommendedAngle.toLowerCase()} while staying close to ${whyNow.toLowerCase()}`,
      );
    case "practical-help":
      return normalizeSentence(
        `Keep the message concrete: use ${recommendedAngle.toLowerCase()} and give one next move teachers can actually try without adding more noise`,
      );
    case "risk-awareness":
      return normalizeSentence(
        `Lead with the value of the idea, but keep the caution visible. ${caution} should stay in view while the message holds on to ${recommendedAngle.toLowerCase()}`,
      );
    case "calm-relief":
      return normalizeSentence(
        `The promise here is less pressure, not more effort. Use ${recommendedAngle.toLowerCase()} to help teachers feel steadier around ${teacherLine.toLowerCase()}`,
      );
    case "teacher-voice":
    default:
      return normalizeSentence(
        `Say this the way a trusted colleague would say it after a long week: grounded in ${teacherLine.toLowerCase()}, shaped by ${recommendedAngle.toLowerCase()}, and supported by ${bestMemory.toLowerCase()}`,
      );
  }
}

function buildTeacherVoiceLine(opportunity: ContentOpportunity, style: MessageAngleStyle): string {
  const teacherLine = cleanAnchor(firstTeacherLine(opportunity));
  const secondLine = cleanAnchor(secondTeacherLine(opportunity));

  switch (style) {
    case "validation":
      return normalizeSentence(`${teacherLine} is heavier than it sounds when you are the one carrying it every day`);
    case "reframe":
      return normalizeSentence(`This is not only about one hard moment; it is about what ${secondLine.toLowerCase()} keeps asking teachers to absorb`);
    case "practical-help":
      return normalizeSentence(`Teachers do not need a speech here. They need one useful move that respects the day they are already having`);
    case "risk-awareness":
      return normalizeSentence(`Keep the message steady enough that it helps, but honest enough that it does not overpromise`);
    case "calm-relief":
      return normalizeSentence(`The value is not doing more. The value is feeling less pinned down by ${teacherLine.toLowerCase()}`);
    case "teacher-voice":
    default:
      return normalizeSentence(`If this does not sound like something a steady teacher would actually say, it is not ready yet`);
  }
}

function buildWhyThisAngle(opportunity: ContentOpportunity, style: MessageAngleStyle): string {
  const whyNow = cleanAnchor(opportunity.whyNow);
  const recommendedAngle = cleanAnchor(opportunity.recommendedAngle);
  const trustRisk = opportunity.trustRisk;

  switch (style) {
    case "validation":
      return normalizeSentence(
        `This opportunity is rooted in a clear teacher pain point, so naming the pressure first makes the message feel earned`,
      );
    case "reframe":
      return normalizeSentence(
        `The current opportunity already points toward ${recommendedAngle.toLowerCase()}, so a calmer interpretation can add value without drifting away from the source`,
      );
    case "practical-help":
      return normalizeSentence(
        `The why-now case is already defined as ${whyNow.toLowerCase()}, which makes a practical angle more useful than a broad inspirational one`,
      );
    case "risk-awareness":
      return normalizeSentence(
        `Trust risk is ${trustRisk}, so the angle should keep caution visible instead of sounding too certain`,
      );
    case "calm-relief":
      return normalizeSentence(
        `The strongest teacher-facing version of this idea is relief-oriented, because it lowers pressure while staying close to the real pain point`,
      );
    case "teacher-voice":
    default:
      return normalizeSentence(
        `The opportunity already carries teacher-real language, so the safest version is one that sounds human, plainspoken, and lived-in`,
      );
  }
}

function deriveAngleTrustRisk(
  opportunity: ContentOpportunity,
  style: MessageAngleStyle,
): MessageAngle["trustRisk"] {
  if (opportunity.trustRisk === "high") {
    if (style === "risk-awareness") {
      return "medium";
    }

    if (style === "validation" || style === "teacher-voice" || style === "calm-relief") {
      return "medium";
    }

    return "high";
  }

  if (opportunity.trustRisk === "medium") {
    if (style === "practical-help" && opportunity.riskSummary) {
      return "medium";
    }

    return style === "risk-awareness" ? "medium" : "low";
  }

  return "low";
}

function scoreStyleFit(opportunity: ContentOpportunity, style: MessageAngleStyle): number {
  let score = 40;

  if (style === "teacher-voice") {
    score += 18;
  }

  if (style === "validation" && opportunity.teacherLanguage.length > 0) {
    score += 16;
  }

  if (style === "practical-help") {
    score += 14;
  }

  if (style === "reframe" && normalizeText(opportunity.recommendedAngle)) {
    score += 12;
  }

  if (style === "risk-awareness") {
    score += opportunity.trustRisk === "high" ? 24 : opportunity.trustRisk === "medium" ? 12 : 2;
  }

  if (style === "calm-relief") {
    const stressLanguage = `${opportunity.primaryPainPoint} ${opportunity.teacherLanguage.join(" ")}`.toLowerCase();
    if (
      stressLanguage.includes("pressure") ||
      stressLanguage.includes("stress") ||
      stressLanguage.includes("overwhelm") ||
      stressLanguage.includes("drain") ||
      stressLanguage.includes("tension")
    ) {
      score += 15;
    } else {
      score += 8;
    }
  }

  if (opportunity.memoryContext.caution && style === "risk-awareness") {
    score += 8;
  }

  if (opportunity.memoryContext.audienceCue && style === "validation") {
    score += 6;
  }

  if (opportunity.priority === "high") {
    score += style === "practical-help" || style === "teacher-voice" ? 5 : 2;
  }

  return score;
}

export function selectMessageAngleStyles(opportunity: ContentOpportunity): MessageAngleStyle[] {
  const ranked = MESSAGE_ANGLE_STYLES
    .map((style) => ({
      style,
      fit: scoreStyleFit(opportunity, style),
    }))
    .sort((left, right) => right.fit - left.fit || left.style.localeCompare(right.style));

  const targetCount = opportunity.trustRisk === "high" ? 5 : opportunity.priority === "high" ? 4 : 3;
  const selected = ranked.slice(0, targetCount).map((entry) => entry.style);

  if (!selected.includes("teacher-voice")) {
    selected.push("teacher-voice");
  }

  if (opportunity.trustRisk !== "low" && !selected.includes("risk-awareness")) {
    selected.push("risk-awareness");
  }

  return MESSAGE_ANGLE_STYLES.filter((style) => selected.includes(style)).slice(0, 5);
}

export function buildMessageAngleForStyle(
  opportunity: ContentOpportunity,
  style: MessageAngleStyle,
): MessageAngle {
  const angle = messageAngleSchema.parse({
    id: angleId(opportunity.opportunityId, style),
    opportunityId: opportunity.opportunityId,
    title: buildTitle(opportunity, style),
    summary: clipText(
      `${buildAudienceFrame(opportunity, style)} ${buildCoreMessage(opportunity, style)}`,
      220,
    ),
    style,
    audienceFrame: buildAudienceFrame(opportunity, style),
    coreMessage: buildCoreMessage(opportunity, style),
    teacherVoiceLine: buildTeacherVoiceLine(opportunity, style),
    whyThisAngle: buildWhyThisAngle(opportunity, style),
    trustRisk: deriveAngleTrustRisk(opportunity, style),
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
  angle: Omit<MessageAngle, "score" | "isRecommended"> | MessageAngle,
): number {
  const anchorTokens = getOpportunityAnchorTokens(opportunity);
  const combinedText = [
    angle.title,
    angle.summary,
    angle.coreMessage,
    angle.teacherVoiceLine,
    angle.whyThisAngle,
  ].join(" ");
  const sharedAnchors = countPhaseBAnchorOverlap(combinedText, anchorTokens);
  const trustCheck = evaluatePhaseBTrust(combinedText);
  let score = 48 + Math.min(18, sharedAnchors * 3);

  score += scoreStyleFit(opportunity, angle.style) - 40;
  score += angle.style === "teacher-voice" ? 6 : 0;
  score += angle.style === "risk-awareness" && opportunity.trustRisk !== "low" ? 8 : 0;
  score += angle.style === "practical-help" && opportunity.priority === "high" ? 5 : 0;
  score -= angle.trustRisk === "high" ? 14 : angle.trustRisk === "medium" ? 6 : 0;
  score -= trustCheck.penalty;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function angleTrustPenalty(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
): number {
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
    angle.summary.length < 48 ||
    angle.coreMessage.length < 40
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
  return normalizeText(`${angle.style} ${angle.title} ${angle.coreMessage}`)
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
    .sort((left, right) => right.score - left.score || left.style.localeCompare(right.style));
}

export const filterMessageAngles = filterUnsafeAngles;

function selectSafestAngleFallbacks(
  opportunity: ContentOpportunity,
  angles: MessageAngle[],
): MessageAngle[] {
  const seen = new Set<string>();

  return [...angles]
    .sort((left, right) =>
      angleTrustPenalty(opportunity, left) - angleTrustPenalty(opportunity, right) ||
      right.score - left.score ||
      left.style.localeCompare(right.style),
    )
    .filter((angle) => {
      const nextSignature = signature(angle);
      if (seen.has(nextSignature)) {
        return false;
      }

      seen.add(nextSignature);
      return true;
    });
}

export function markRecommendedMessageAngle(angles: MessageAngle[]): MessageAngle[] {
  if (angles.length === 0) {
    return [];
  }

  const recommendedId = [...angles]
    .sort((left, right) => right.score - left.score || left.style.localeCompare(right.style))[0]?.id;

  return angles.map((angle) => ({
    ...angle,
    isRecommended: angle.id === recommendedId,
  }));
}

export function buildMessageAngles(opportunity: ContentOpportunity): MessageAngle[] {
  const selectedStyles = selectMessageAngleStyles(opportunity);
  const builtAngles = selectedStyles.map((style) => buildMessageAngleForStyle(opportunity, style));
  const filtered = filterUnsafeAngles(opportunity, builtAngles);

  const fallbackAngles =
    filtered.length >= 3
      ? filtered
      : MESSAGE_ANGLE_STYLES
          .filter((style) => !selectedStyles.includes(style))
          .map((style) => buildMessageAngleForStyle(opportunity, style));
  const finalAngles = filtered.length >= 3
    ? filtered.slice(0, 5)
    : selectSafestAngleFallbacks(opportunity, [...filtered, ...fallbackAngles]).slice(0, 5);

  return markRecommendedMessageAngle(finalAngles).map((angle) => messageAngleSchema.parse(angle));
}
