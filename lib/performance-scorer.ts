import type {
  ContentOpportunity,
  ContentOpportunityPerformanceDrivers,
} from "@/lib/content-opportunities";

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function uniqueWords(text: string): Set<string> {
  const tokens = text.match(/[a-z0-9]+/g) ?? [];
  return new Set(tokens);
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
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
    opportunity.memoryContext.bestCombo,
    opportunity.memoryContext.weakCombo,
    opportunity.memoryContext.revenuePattern,
    opportunity.memoryContext.audienceCue,
    opportunity.memoryContext.caution,
  ]
    .filter(Boolean)
    .join(" ");
}

function scoreHookStrength(opportunity: ContentOpportunity, text: string): number {
  let score = 2;

  if (includesAny(text, ["risk", "wrong", "escalate", "complaint", "before you send"])) {
    score += 1.5;
  }

  if (opportunity.hookRanking && opportunity.hookRanking.length > 0) {
    const bestHookScore = opportunity.hookRanking[0]?.score ?? 0;
    if (bestHookScore >= 20) {
      score += 1.5;
    } else if (bestHookScore >= 15) {
      score += 1;
    }
  } else if (normalizeText(opportunity.recommendedHookDirection).length > 0) {
    score += 1;
  }

  return clampScore(score);
}

function scoreStakes(text: string): number {
  let score = 2;

  if (includesAny(text, ["risk", "risky", "complaint", "escalate", "job", "cost"])) {
    score += 2;
  }

  if (includesAny(text, ["urgent", "serious", "high stakes"])) {
    score += 1;
  }

  return clampScore(score);
}

function scoreViewerConnection(opportunity: ContentOpportunity, text: string): number {
  let score = 2;

  if (
    includesAny(text, [
      "worry",
      "anxious",
      "hesitate",
      "hesitation",
      "stress",
      "tense",
      "pressure",
      "rewriting",
      "second-guess",
      "calm",
    ])
  ) {
    score += 2;
  }

  if (opportunity.teacherLanguage.length > 0) {
    score += 1;
  }

  return clampScore(score);
}

function scoreGeneralistAppeal(opportunity: ContentOpportunity, text: string): number {
  let score = 2;
  const words = uniqueWords(text);
  const teacherMentions = ["teacher", "teachers", "classroom", "parent", "message", "email"];
  const broadMatches = teacherMentions.filter((token) => words.has(token)).length;

  if (broadMatches >= 3) {
    score += 2;
  } else if (broadMatches >= 2) {
    score += 1;
  }

  if (
    opportunity.opportunityType === "audience_opportunity" ||
    opportunity.opportunityType === "evergreen_opportunity"
  ) {
    score += 1;
  }

  return clampScore(score);
}

function scorePerspectiveShift(text: string): number {
  let score = 2;

  if (
    includesAny(text, [
      "reframe",
      "reframing",
      "most teachers",
      "people think",
      "misconception",
      "common belief",
      "different way",
    ])
  ) {
    score += 2;
  }

  if (includesAny(text, ["not what", "rarely", "actually", "instead"])) {
    score += 1;
  }

  return clampScore(score);
}

function scoreAuthenticityFit(opportunity: ContentOpportunity, text: string): number {
  let score = 2;

  if (opportunity.teacherLanguage.length > 0) {
    score += 2;
  }

  if (includesAny(text, ["teacher", "classroom", "parent", "send", "message"])) {
    score += 1;
  }

  return clampScore(score);
}

function scoreBrandAlignment(opportunity: ContentOpportunity, text: string): number {
  let score = 2;

  if (includesAny(text, ["calm", "safer", "clear", "trust", "teacher-first", "teacher"])) {
    score += 2;
  }

  if (opportunity.trustRisk === "low") {
    score += 1;
  }

  return clampScore(score);
}

function scoreConversionPotential(opportunity: ContentOpportunity, text: string): number {
  let score = 2;

  if (opportunity.commercialPotential === "high") {
    score += 2;
  } else if (opportunity.commercialPotential === "medium") {
    score += 1;
  }

  if (includesAny(text, ["next step", "try", "review", "approve", "send"])) {
    score += 1;
  }

  return clampScore(score);
}

export function scoreOpportunity(
  opportunity: ContentOpportunity,
): ContentOpportunityPerformanceDrivers {
  const text = buildOpportunityText(opportunity);

  return {
    hookStrength: scoreHookStrength(opportunity, text),
    stakes: scoreStakes(text),
    viewerConnection: scoreViewerConnection(opportunity, text),
    generalistAppeal: scoreGeneralistAppeal(opportunity, text),
    perspectiveShift: scorePerspectiveShift(text),
    authenticityFit: scoreAuthenticityFit(opportunity, text),
    brandAlignment: scoreBrandAlignment(opportunity, text),
    conversionPotential: scoreConversionPotential(opportunity, text),
  };
}
