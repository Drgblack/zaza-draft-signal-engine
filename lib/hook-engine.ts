import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import type { MessageAngle } from "@/lib/message-angles";
import { buildContentIntelligenceFromSignal } from "@/lib/strategic-intelligence-types";
import {
  buildPhaseBAnchorTokens,
  countPhaseBAnchorOverlap,
  evaluatePhaseBTrust,
} from "@/lib/phase-b-trust";

export const HOOK_VARIANT_TYPES = [
  "direct",
  "empathetic",
  "pattern-interrupt",
  "teacher-confession",
  "calm-warning",
  "practical",
] as const;

const HOOK_RECOMMENDED_PLATFORMS = ["x", "linkedin", "reddit"] as const;

export type HookVariantType = (typeof HOOK_VARIANT_TYPES)[number];
export type HookRecommendedPlatform = (typeof HOOK_RECOMMENDED_PLATFORMS)[number];

export const hookVariantTypeSchema = z.enum(HOOK_VARIANT_TYPES);
export const hookRecommendedPlatformSchema = z.enum(HOOK_RECOMMENDED_PLATFORMS);

export const hookVariantSchema = z.object({
  id: z.string().trim().min(1),
  type: hookVariantTypeSchema,
  hookType: hookVariantTypeSchema,
  text: z.string().trim().min(1),
  recommendedPlatforms: z.array(hookRecommendedPlatformSchema).min(1).max(3),
  intendedEffect: z.string().trim().min(1),
  rank: z.number().int().min(1).max(5),
  trustNotes: z.array(z.string().trim().min(1)).max(6),
  riskNotes: z.array(z.string().trim().min(1)).max(6),
  score: z.number().int().min(0).max(100),
  isRecommended: z.boolean(),
});

export type HookOption = z.infer<typeof hookVariantSchema>;
export type HookVariant = HookOption;

export const hookSetSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  angleId: z.string().trim().min(1),
  primaryHook: hookVariantSchema,
  variants: z.array(hookVariantSchema).min(3).max(5),
  rationale: z.string().trim().min(1),
});

export type HookSet = z.infer<typeof hookSetSchema>;

export interface HookTrustDiagnostics {
  penalty: number;
  reasons: string[];
  anchorOverlap: number;
  isUnsafe: boolean;
}

interface EmotionalTruths {
  pressure: string;
  recognition: string;
  framing: string;
  caution: string;
  relief: string;
  nextStep: string;
  teacherVoice: string;
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function cleanLine(value: string | null | undefined): string {
  return normalizeText(value).replace(/[.!?]+$/g, "");
}

function hookSignature(text: string): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function hookIdSuffix(text: string): string {
  const signature = hookSignature(text).replace(/\s+/g, "-");
  return signature.slice(0, 48) || "candidate";
}

function clipHook(value: string, maxLength = 88): string {
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

function sharedTokenCount(left: string, right: string): number {
  const rightTokens = buildPhaseBAnchorTokens([right]);
  return countPhaseBAnchorOverlap(left, rightTokens);
}

function hookId(
  opportunityId: string,
  angleId: string,
  type: HookVariantType,
  text: string,
) {
  return `${opportunityId}:${angleId}:hook:${type}:${hookIdSuffix(text)}`;
}

function hookSetId(opportunityId: string, angleId: string) {
  return `${opportunityId}:${angleId}:hook-set`;
}

function normalizeRiskNote(value: string): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/[.!?]+$/g, "") : null;
}

function platformScoreBoost(
  platforms: HookRecommendedPlatform[],
  type: HookVariantType,
): number {
  let score = 0;

  if (platforms.includes("linkedin")) {
    score +=
      type === "direct" || type === "empathetic" || type === "practical"
        ? 6
        : type === "pattern-interrupt"
          ? 2
          : 0;
  }

  if (platforms.includes("x")) {
    score += type === "direct" || type === "pattern-interrupt" ? 4 : 0;
  }

  if (platforms.includes("reddit")) {
    score += type === "empathetic" || type === "practical" ? 4 : 0;
  }

  return score;
}

function inferHookTypeFromText(text: string): HookVariantType {
  const normalized = normalizeText(text).toLowerCase();

  if (
    normalized.includes("usually not") ||
    normalized.includes("rarely") ||
    normalized.includes("not what people think")
  ) {
    return "pattern-interrupt";
  }

  if (
    normalized.startsWith("if ") ||
    normalized.includes("that makes sense") ||
    normalized.includes("you are not overreacting")
  ) {
    return "empathetic";
  }

  if (
    normalized.includes("before you") ||
    normalized.includes("start with") ||
    normalized.includes("one useful move") ||
    normalized.includes("try ")
  ) {
    return "practical";
  }

  if (
    normalized.includes("risk") ||
    normalized.includes("escalate") ||
    normalized.includes("go wrong") ||
    normalized.includes("be careful")
  ) {
    return "calm-warning";
  }

  if (
    normalized.includes("some days") ||
    normalized.includes("i think teachers") ||
    normalized.includes("i keep")
  ) {
    return "teacher-confession";
  }

  return "direct";
}

function recommendedPlatformsForHook(
  opportunity: ContentOpportunity,
  type: HookVariantType,
): HookRecommendedPlatform[] {
  const available = opportunity.recommendedPlatforms.filter(
    (platform): platform is HookRecommendedPlatform =>
      HOOK_RECOMMENDED_PLATFORMS.includes(platform as HookRecommendedPlatform),
  );
  const preferredByType: Partial<Record<HookVariantType, HookRecommendedPlatform[]>> = {
    direct: ["linkedin", "x"],
    empathetic: ["linkedin", "reddit"],
    "pattern-interrupt": ["x", "linkedin"],
    "teacher-confession": ["linkedin", "reddit"],
    "calm-warning": ["linkedin", "x"],
    practical: ["linkedin", "reddit"],
  };
  const preferred = preferredByType[type] ?? [];
  const intersection = preferred.filter((platform) => available.includes(platform));

  return (intersection.length > 0 ? intersection : available).slice(0, 3);
}

export function applySelectedHookSelection(
  hookSet: HookSet,
  hookId: string | null | undefined,
): HookSet {
  if (!hookId) {
    return hookSet;
  }

  const selectedHook = hookSet.variants.find((variant) => variant.id === hookId);
  if (!selectedHook) {
    return hookSet;
  }

  const variants = hookSet.variants.map((variant) => ({
    ...variant,
    isRecommended: variant.id === selectedHook.id,
  }));

  return {
    ...hookSet,
    primaryHook:
      variants.find((variant) => variant.id === selectedHook.id) ??
      hookSet.primaryHook,
    variants,
  };
}

function buildAnchorText(opportunity: ContentOpportunity, angle: MessageAngle): string {
  return [
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
  ].join(" ");
}

export function deriveEmotionalTruths(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
): EmotionalTruths {
  const pressure = cleanLine(
    firstNonEmpty(
      opportunity.primaryPainPoint,
      opportunity.teacherLanguage[0],
      angle.teacherVoiceLine,
      opportunity.title,
    ),
  );
  const recognition = cleanLine(
    firstNonEmpty(
      opportunity.teacherLanguage[0],
      opportunity.teacherLanguage[1],
      angle.teacherVoiceLine,
      opportunity.memoryContext.audienceCue,
      opportunity.primaryPainPoint,
    ),
  );
  const framing = cleanLine(
    firstNonEmpty(
      angle.coreMessage,
      angle.summary,
      opportunity.recommendedAngle,
      opportunity.whyNow,
    ),
  );
  const caution = cleanLine(
    firstNonEmpty(
      opportunity.riskSummary,
      opportunity.memoryContext.caution,
      angle.whyThisAngle,
      opportunity.whyNow,
    ),
  );
  const relief = cleanLine(
    firstNonEmpty(
      opportunity.memoryContext.audienceCue,
      opportunity.memoryContext.bestCombo,
      opportunity.recommendedAngle,
      angle.summary,
    ),
  );
  const nextStep = cleanLine(
    firstNonEmpty(
      opportunity.suggestedNextStep,
      opportunity.supportingSignals[0],
      opportunity.whyNow,
      angle.coreMessage,
    ),
  );
  const teacherVoice = cleanLine(
    firstNonEmpty(
      angle.teacherVoiceLine,
      opportunity.teacherLanguage[0],
      opportunity.teacherLanguage[1],
      opportunity.primaryPainPoint,
    ),
  );

  return {
    pressure: pressure || "teacher pressure",
    recognition: recognition || pressure || "this load",
    framing: framing || pressure || "the situation",
    caution: caution || "the risk is real",
    relief: relief || "a calmer way through it",
    nextStep: nextStep || "one useful next move",
    teacherVoice: teacherVoice || "this is harder than it sounds",
  };
}

function directHooks(truths: EmotionalTruths): string[] {
  return [
    `${truths.pressure} is not a small problem`,
    `${truths.pressure} needs a calmer response`,
  ];
}

function empatheticHooks(truths: EmotionalTruths): string[] {
  return [
    `If ${truths.recognition.toLowerCase()} feels heavier lately, that makes sense`,
    `If this has been sitting on your shoulders, you are not overreacting`,
  ];
}

function patternInterruptHooks(): string[] {
  return [
    `The hard part is usually not what people think`,
    `What sounds manageable on paper can land very differently in a real classroom`,
    `The surface issue is rarely the whole story`,
  ];
}

function teacherConfessionHooks(truths: EmotionalTruths): string[] {
  return [
    `Some days the hardest part is acting like ${truths.pressure.toLowerCase()} is manageable`,
    `I think teachers get tired of pretending this part is easy`,
  ];
}

function calmWarningHooks(truths: EmotionalTruths): string[] {
  return [
    `${truths.caution.charAt(0).toUpperCase()}${truths.caution.slice(1)}`,
    `It helps to name the risk before the message gets too neat`,
  ];
}

function practicalHooks(truths: EmotionalTruths): string[] {
  return [
    `Start with one useful move, not a perfect answer`,
    `${truths.nextStep.charAt(0).toUpperCase()}${truths.nextStep.slice(1)}`,
  ];
}

function buildIntelligenceSeedHooks(
  opportunity: ContentOpportunity,
): Array<{ type: HookVariantType; text: string }> {
  const contentIntelligence = buildContentIntelligenceFromSignal(opportunity);
  const candidates = contentIntelligence.hookCandidates.slice(0, 3);

  return candidates.map((text) => ({
    type: inferHookTypeFromText(text),
    text,
  }));
}

function buildHookCandidates(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
): Array<{ type: HookVariantType; text: string }> {
  const truths = deriveEmotionalTruths(opportunity, angle);

  return [
    ...buildIntelligenceSeedHooks(opportunity),
    ...directHooks(truths).map((text) => ({ type: "direct" as const, text })),
    ...empatheticHooks(truths).map((text) => ({ type: "empathetic" as const, text })),
    ...patternInterruptHooks().map((text) => ({
      type: "pattern-interrupt" as const,
      text,
    })),
    ...teacherConfessionHooks(truths).map((text) => ({
      type: "teacher-confession" as const,
      text,
    })),
    ...calmWarningHooks(truths).map((text) => ({ type: "calm-warning" as const, text })),
    ...practicalHooks(truths).map((text) => ({ type: "practical" as const, text })),
  ];
}

function scoreTypeFit(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  type: HookVariantType,
): number {
  const contentIntelligence = buildContentIntelligenceFromSignal(opportunity);
  const performanceDrivers = contentIntelligence.performanceDrivers;
  const intendedEffect = normalizeText(contentIntelligence.intendedViewerEffect).toLowerCase();
  const platforms = recommendedPlatformsForHook(opportunity, type);
  let score = 40;

  if (type === "direct") {
    score += 18;
  }

  if (type === "empathetic") {
    score += 16;
  }

  if (type === "practical" && angle.style === "practical-help") {
    score += 18;
  }

  if (type === "teacher-confession" && angle.style === "teacher-voice") {
    score += 18;
  }

  if (type === "calm-warning" && angle.style === "risk-awareness") {
    score += 20;
  }

  if (type === "pattern-interrupt" && angle.style === "reframe") {
    score += 16;
  }

  if (type === "empathetic" && angle.style === "validation") {
    score += 12;
  }

  if (type === "direct" && angle.style === "calm-relief") {
    score += 10;
  }

  if ((performanceDrivers.stakes ?? 0) >= 4) {
    score += type === "direct" || type === "calm-warning" ? 8 : 0;
  }

  if ((performanceDrivers.viewerConnection ?? 0) >= 4) {
    score += type === "empathetic" || type === "teacher-confession" ? 8 : 0;
  }

  if ((performanceDrivers.perspectiveShift ?? 0) >= 4) {
    score += type === "pattern-interrupt" ? 8 : 0;
  }

  if ((performanceDrivers.conversionPotential ?? 0) >= 4) {
    score += type === "practical" ? 6 : 0;
  }

  if (intendedEffect.includes("clarity")) {
    score += type === "practical" || type === "direct" ? 4 : 0;
  }

  if (intendedEffect.includes("relief") || intendedEffect.includes("recognition")) {
    score += type === "empathetic" ? 4 : 0;
  }

  if (opportunity.trustRisk === "high") {
    score += type === "calm-warning" || type === "direct" ? 8 : 0;
    score -= type === "pattern-interrupt" ? 6 : 0;
  }

  if (opportunity.priority === "high") {
    score += type === "direct" || type === "practical" ? 4 : 0;
  }

  score += platformScoreBoost(platforms, type);

  return score;
}

export function scoreHookVariant(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  variant: Omit<HookVariant, "score" | "isRecommended" | "rank"> | HookVariant,
): number {
  const anchorText = buildAnchorText(opportunity, angle);
  const normalizedText = normalizeText(variant.text);
  const trustCheck = evaluatePhaseBTrust(normalizedText);
  let score = scoreTypeFit(opportunity, angle, variant.type);

  const hookLength = normalizedText.length;
  if (hookLength >= 28 && hookLength <= 72) {
    score += 12;
  } else if (hookLength <= 88) {
    score += 6;
  } else {
    score -= 10;
  }

  score += Math.min(18, sharedTokenCount(normalizedText, anchorText) * 3);

  if (variant.type === "direct" && !normalizedText.toLowerCase().startsWith("if ")) {
    score += 6;
  }

  if (
    variant.type === "empathetic" &&
    normalizedText.toLowerCase().includes("makes sense")
  ) {
    score += 6;
  }

  if (
    variant.type === "pattern-interrupt" &&
    normalizedText.toLowerCase().includes("usually not")
  ) {
    score += 4;
  }

  if (variant.type === "calm-warning" && opportunity.trustRisk !== "low") {
    score += 6;
  }

  score -= trustCheck.penalty;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function hookTrustPenalty(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hook: Pick<HookVariant, "text">,
): number {
  let penalty = evaluatePhaseBTrust(hook.text).penalty;
  const anchorOverlap = sharedTokenCount(hook.text, buildAnchorText(opportunity, angle));

  if (anchorOverlap < 1) {
    penalty += 16;
  }

  if (normalizeText(hook.text).length < 16) {
    penalty += 8;
  }

  return penalty;
}

export function inspectHookTrust(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hook: Pick<HookVariant, "text">,
): HookTrustDiagnostics {
  const anchorOverlap = sharedTokenCount(hook.text, buildAnchorText(opportunity, angle));
  const trustCheck = evaluatePhaseBTrust(hook.text);
  const penalty = hookTrustPenalty(opportunity, angle, hook);

  return {
    penalty,
    reasons: trustCheck.reasons,
    anchorOverlap,
    isUnsafe: penalty >= 24,
  };
}

function areNearDuplicates(left: string, right: string): boolean {
  const leftSignature = hookSignature(left);
  const rightSignature = hookSignature(right);

  if (leftSignature === rightSignature) {
    return true;
  }

  const leftTokens = Array.from(buildPhaseBAnchorTokens([leftSignature]));
  const rightTokens = Array.from(buildPhaseBAnchorTokens([rightSignature]));
  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
  const threshold = Math.max(2, Math.min(leftTokens.length, rightTokens.length) - 1);

  return overlap >= threshold;
}

export function filterUnsafeHooks(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hooks: HookVariant[],
): HookVariant[] {
  const kept: HookVariant[] = [];

  for (const hook of hooks) {
    const normalized = clipHook(hook.text);
    const nextHook = {
      ...hook,
      text: normalized,
    };

    if (!normalized || hookTrustPenalty(opportunity, angle, nextHook) >= 24) {
      continue;
    }

    if (sharedTokenCount(normalized, buildAnchorText(opportunity, angle)) < 1) {
      continue;
    }

    if (kept.some((existing) => areNearDuplicates(existing.text, normalized))) {
      continue;
    }

    kept.push(nextHook);
  }

  return kept;
}

function selectSafestHookFallbacks(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hooks: HookVariant[],
): HookVariant[] {
  const kept: HookVariant[] = [];

  for (const hook of [...hooks].sort(
    (left, right) =>
      hookTrustPenalty(opportunity, angle, left) -
        hookTrustPenalty(opportunity, angle, right) ||
      right.score - left.score ||
      left.text.localeCompare(right.text),
  )) {
    const normalized = clipHook(hook.text);
    const nextHook = {
      ...hook,
      text: normalized,
    };

    if (!normalized || kept.some((existing) => areNearDuplicates(existing.text, normalized))) {
      continue;
    }

    kept.push(nextHook);
  }

  return kept;
}

function ensureCoverage(hooks: HookVariant[], rankedHooks: HookVariant[]): HookVariant[] {
  const requiredTypes: HookVariantType[] = ["direct", "empathetic", "practical"];
  const nextHooks = [...hooks];

  for (const type of requiredTypes) {
    if (nextHooks.some((hook) => hook.type === type)) {
      continue;
    }

    const fallback = rankedHooks.find((hook) => hook.type === type);
    if (fallback) {
      nextHooks.push(fallback);
    }
  }

  return nextHooks;
}

export function selectRecommendedPrimaryHook(hooks: HookVariant[]): HookVariant {
  return [...hooks].sort((left, right) => {
    const leftPriority = left.type === "direct" ? 0 : left.type === "empathetic" ? 1 : 2;
    const rightPriority = right.type === "direct" ? 0 : right.type === "empathetic" ? 1 : 2;

    return (
      right.score - left.score ||
      leftPriority - rightPriority ||
      left.text.localeCompare(right.text)
    );
  })[0]!;
}

function buildHookTrustNotes(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  variant: Pick<HookVariant, "text" | "type">,
): string[] {
  const trust = inspectHookTrust(opportunity, angle, variant);
  const notes = trust.reasons.map((reason) => reason.replace(/-/g, " "));

  if (notes.length > 0) {
    return notes.slice(0, 4);
  }

  return ["Stays close to teacher-real language and opportunity anchors"];
}

function buildHookRiskNotes(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  variant: Pick<HookVariant, "text" | "type">,
): string[] {
  const trust = inspectHookTrust(opportunity, angle, variant);
  const notes: string[] = [];

  if (opportunity.trustRisk !== "low") {
    notes.push(`Opportunity trust risk is ${opportunity.trustRisk}`);
  }

  if (angle.riskPosture === "protective") {
    notes.push("Angle is intentionally protective");
  }

  if (trust.anchorOverlap < 2) {
    notes.push("Keep the hook close to the teacher phrasing in the opportunity");
  }

  const normalizedReasons = trust.reasons
    .map((reason) => normalizeRiskNote(reason.replace(/-/g, " ")))
    .filter((reason): reason is string => Boolean(reason));

  return [...notes, ...normalizedReasons].slice(0, 4);
}

function rankHookVariants(hooks: HookVariant[]): HookVariant[] {
  return hooks
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.type.localeCompare(right.type) ||
        left.text.localeCompare(right.text),
    )
    .map((hook, index) =>
      hookVariantSchema.parse({
        ...hook,
        rank: index + 1,
        isRecommended: index === 0,
      }),
    );
}

function buildRationale(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  primaryHook: HookVariant,
): string {
  const riskClause =
    opportunity.trustRisk === "high"
      ? "It keeps the opening steady because this opportunity carries elevated trust risk."
      : opportunity.trustRisk === "medium"
        ? "It stays clear without sounding too certain."
        : "It is clear, calm, and easy to place at the start of a post or video.";

  return `${primaryHook.type.replaceAll("-", " ")} was selected because it best matches the ${angle.style.replaceAll("-", " ")} angle and stays close to the teacher reality in the opportunity. ${riskClause}`;
}

function buildDraftHookVariant(input: {
  opportunity: ContentOpportunity;
  angle: MessageAngle;
  type: HookVariantType;
  text: string;
}): HookVariant {
  const contentIntelligence = buildContentIntelligenceFromSignal(input.opportunity);
  const intendedEffect =
    normalizeText(contentIntelligence.intendedViewerEffect) ||
    normalizeText(input.angle.intendedViewerEffect) ||
    "Create enough recognition to keep watching";
  const recommendedPlatforms = recommendedPlatformsForHook(
    input.opportunity,
    input.type,
  );
  const draft = hookVariantSchema.parse({
    id: hookId(input.opportunity.opportunityId, input.angle.id, input.type, input.text),
    type: input.type,
    hookType: input.type,
    text: clipHook(input.text),
    recommendedPlatforms,
    intendedEffect,
    rank: 5,
    trustNotes: [],
    riskNotes: [],
    score: 0,
    isRecommended: false,
  });
  const score = scoreHookVariant(input.opportunity, input.angle, draft);
  const trustNotes = buildHookTrustNotes(input.opportunity, input.angle, draft);
  const riskNotes = buildHookRiskNotes(input.opportunity, input.angle, draft);

  return hookVariantSchema.parse({
    ...draft,
    score,
    trustNotes,
    riskNotes,
  });
}

function normalizePersistedHookSet(hookSet: HookSet): HookSet {
  const ranked = rankHookVariants([...hookSet.variants]).slice(0, 5);
  const primaryHook =
    ranked.find((variant) => variant.id === hookSet.primaryHook.id) ??
    ranked.find((variant) => variant.isRecommended) ??
    ranked[0];

  return hookSetSchema.parse({
    ...hookSet,
    primaryHook,
    variants: ranked,
  });
}

export function buildHookSet(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
): HookSet {
  const rawCandidates = buildHookCandidates(opportunity, angle);
  const rankedCandidates = rawCandidates
      .map((candidate) =>
        buildDraftHookVariant({
          opportunity,
          angle,
          type: candidate.type,
          text: candidate.text,
        }),
      )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.type.localeCompare(right.type) ||
        left.text.localeCompare(right.text),
    );

  const filtered = filterUnsafeHooks(opportunity, angle, rankedCandidates);
  const safePool =
    filtered.length >= 3
      ? filtered
      : selectSafestHookFallbacks(opportunity, angle, rankedCandidates);
  const covered = ensureCoverage(safePool.slice(0, 5), safePool);
  const finalVariants = rankHookVariants(covered.slice(0, 5));
  const primaryHook = selectRecommendedPrimaryHook(finalVariants);
  const variants = finalVariants.map((variant) =>
    hookVariantSchema.parse({
      ...variant,
      isRecommended: variant.id === primaryHook.id,
    }),
  );

  return normalizePersistedHookSet(
    hookSetSchema.parse({
      id: hookSetId(opportunity.opportunityId, angle.id),
      opportunityId: opportunity.opportunityId,
      angleId: angle.id,
      primaryHook:
        variants.find((variant) => variant.id === primaryHook.id) ?? primaryHook,
      variants,
      rationale: buildRationale(opportunity, angle, primaryHook),
    }),
  );
}

export function generateHookSets(
  opportunity: ContentOpportunity,
  angles: MessageAngle[],
): HookSet[] {
  return angles
    .map((angle) => buildHookSet(opportunity, angle))
    .map((hookSet) => normalizePersistedHookSet(hookSet));
}
