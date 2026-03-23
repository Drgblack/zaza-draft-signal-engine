import type { ContentOpportunity } from "@/lib/content-opportunities";

export type IntendedViewerEffect =
  | "recognition"
  | "relief"
  | "caution"
  | "validation"
  | "confidence";

export type SuggestedOpportunityCta =
  | "Try Zaza Draft"
  | "Pause before sending"
  | "Rewrite safely"
  | "Download template";

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

export function determineViewerEffect(
  opportunity: ContentOpportunity,
): IntendedViewerEffect {
  const text = buildOpportunityText(opportunity);
  const drivers = opportunity.performanceDrivers;

  if (
    includesAny(text, ["risk", "risky", "complaint", "escalate", "job", "before you send"]) ||
    (drivers?.stakes ?? 0) >= 4
  ) {
    return "caution";
  }

  if (
    includesAny(text, ["calm", "relief", "safer", "lighter", "easier"]) &&
    (drivers?.viewerConnection ?? 0) >= 3
  ) {
    return "relief";
  }

  if (
    includesAny(text, ["recognise", "recognize", "most teachers", "you are not overreacting"]) ||
    (drivers?.generalistAppeal ?? 0) >= 4
  ) {
    return "recognition";
  }

  if (
    includesAny(text, ["valid", "makes sense", "not overreacting", "harder than it sounds"]) ||
    (drivers?.authenticityFit ?? 0) >= 4
  ) {
    return "validation";
  }

  return "confidence";
}

export function suggestCTA(
  opportunity: ContentOpportunity,
): SuggestedOpportunityCta {
  const text = buildOpportunityText(opportunity);
  const effect = determineViewerEffect(opportunity);
  const drivers = opportunity.performanceDrivers;
  const angle = normalizeText(opportunity.recommendedAngle);

  if (
    effect === "caution" &&
    includesAny(text, ["send", "message", "email", "parent", "complaint", "risk"])
  ) {
    return "Pause before sending";
  }

  if (
    includesAny(text, ["rewrite", "wording", "tone", "message", "email"]) ||
    angle.includes("rewrite")
  ) {
    return "Rewrite safely";
  }

  if (
    includesAny(text, ["template", "example", "framework"]) ||
    opportunity.opportunityType === "evergreen_opportunity"
  ) {
    return "Download template";
  }

  if (
    effect === "confidence" ||
    opportunity.commercialPotential === "high" ||
    (drivers?.conversionPotential ?? 0) >= 4
  ) {
    return "Try Zaza Draft";
  }

  return "Rewrite safely";
}
