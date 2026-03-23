import { z } from "zod";

export const FACTORY_REVIEW_REASON_CODES = [
  "tone_mismatch",
  "weak_hook",
  "poor_visuals",
  "caption_issues",
  "pacing_issues",
  "trust_safety_concern",
  "low_clarity",
  "poor_cta",
  "provider_artifact_problem",
  "not_publish_ready",
  "other",
] as const;

export const factoryReviewReasonCodeSchema = z.enum(
  FACTORY_REVIEW_REASON_CODES,
);

export const factoryReviewReasonListSchema = z
  .array(factoryReviewReasonCodeSchema)
  .max(FACTORY_REVIEW_REASON_CODES.length)
  .default([]);

export type FactoryReviewReasonCode = z.infer<
  typeof factoryReviewReasonCodeSchema
>;

const LEGACY_REGENERATION_REASON_TO_STRUCTURED_REASON: Record<
  string,
  FactoryReviewReasonCode
> = {
  wrong_visual_setting: "poor_visuals",
  wrong_mood: "tone_mismatch",
  wrong_subject: "poor_visuals",
  poor_narration_quality: "provider_artifact_problem",
  trust_concern: "trust_safety_concern",
  off_brand: "tone_mismatch",
  other: "other",
};

export function normalizeFactoryReviewReasonCodes(
  input: readonly (FactoryReviewReasonCode | string | null | undefined)[] | null | undefined,
): FactoryReviewReasonCode[] {
  if (!input || input.length === 0) {
    return [];
  }

  const seen = new Set<FactoryReviewReasonCode>();

  for (const value of input) {
    const parsed = factoryReviewReasonCodeSchema.safeParse(value);
    if (parsed.success) {
      seen.add(parsed.data);
    }
  }

  return [...seen];
}

export function deriveStructuredReasonsFromLegacyRegenerationReason(
  legacyReason: string | null | undefined,
): FactoryReviewReasonCode[] {
  const structuredReason =
    (legacyReason &&
      LEGACY_REGENERATION_REASON_TO_STRUCTURED_REASON[legacyReason]) ??
    null;

  return structuredReason ? [structuredReason] : [];
}
