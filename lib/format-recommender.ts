import type { ContentOpportunity } from "@/lib/content-opportunities";

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function buildOpportunityText(opportunity: ContentOpportunity): string {
  return [
    opportunity.title,
    opportunity.primaryPainPoint,
    ...opportunity.teacherLanguage,
    opportunity.recommendedAngle,
    opportunity.recommendedHookDirection,
    opportunity.whyNow,
    opportunity.riskSummary,
    opportunity.suggestedNextStep,
    ...opportunity.supportingSignals,
    opportunity.memoryContext.audienceCue,
    opportunity.memoryContext.caution,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function recommendFormat(
  opportunity: ContentOpportunity,
): ContentOpportunity["recommendedFormat"] {
  const text = buildOpportunityText(opportunity);
  const angle = normalizeText(opportunity.recommendedAngle);
  const hookDirection = normalizeText(opportunity.recommendedHookDirection);
  const hasMultiplePlatforms = opportunity.recommendedPlatforms.length > 1;

  if (hasMultiplePlatforms && opportunity.trustRisk !== "high") {
    return "multi_asset";
  }

  if (
    includesAny(text, ["misconception", "reframe", "reframing", "most teachers", "perspective"]) ||
    includesAny(angle, ["reframe", "perspective", "belief"]) ||
    includesAny(hookDirection, ["perspective", "belief", "reframe"])
  ) {
    return "carousel";
  }

  if (
    includesAny(text, ["risk", "complaint", "escalate", "hesitation", "pause", "before you send"]) ||
    includesAny(angle, ["pause", "risk", "relief"]) ||
    opportunity.trustRisk !== "low"
  ) {
    return "short_video";
  }

  if (opportunity.commercialPotential === "high") {
    return "short_video";
  }

  return "text";
}
