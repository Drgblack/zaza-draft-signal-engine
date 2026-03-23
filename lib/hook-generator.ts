import type { ContentOpportunity } from "@/lib/content-opportunities";

export interface RankedHook {
  hook: string;
  score: number;
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function clipText(value: string, maxLength = 96): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength).trimEnd();
}

function lowerFirst(value: string): string {
  if (!value) {
    return value;
  }

  return `${value.slice(0, 1).toLowerCase()}${value.slice(1)}`;
}

function cleanFragment(value: string | null | undefined): string {
  return normalizeText(value).replace(/[.!?]+$/g, "");
}

function uniqueHooks(hooks: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const hook of hooks) {
    const normalized = normalizeText(hook);
    if (!normalized) {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

function buildOpportunityAnchor(opportunity: ContentOpportunity): string {
  return clipText(
    cleanFragment(
      opportunity.teacherLanguage[0] ||
        opportunity.primaryPainPoint ||
        opportunity.title ||
        opportunity.recommendedAngle,
    ),
    72,
  );
}

function buildRiskAnchor(opportunity: ContentOpportunity): string {
  return clipText(
    cleanFragment(
      opportunity.riskSummary ||
        opportunity.whyNow ||
        opportunity.suggestedNextStep ||
        opportunity.supportingSignals[0] ||
        opportunity.primaryPainPoint,
    ),
    72,
  );
}

function buildNextStepAnchor(opportunity: ContentOpportunity): string {
  const nextStep = cleanFragment(opportunity.suggestedNextStep);
  if (nextStep) {
    return lowerFirst(nextStep);
  }

  const caution = cleanFragment(opportunity.memoryContext.caution);
  if (caution) {
    return lowerFirst(caution);
  }

  return "pause before it lands the wrong way";
}

function scoreClarity(hook: string): number {
  const words = hook.split(/\s+/).filter(Boolean).length;

  if (words <= 7) {
    return 5;
  }

  if (words <= 11) {
    return 4;
  }

  if (words <= 15) {
    return 3;
  }

  if (words <= 20) {
    return 2;
  }

  return 1;
}

function scoreEmotionalImpact(hook: string): number {
  const normalized = hook.toLowerCase();
  const strongSignals = ["job", "risk", "wrong", "escalate", "cost", "pause", "send"];
  const matches = strongSignals.filter((signal) => normalized.includes(signal)).length;
  return Math.min(5, Math.max(1, 2 + matches));
}

function scoreStakes(hook: string, opportunity: ContentOpportunity): number {
  const normalized = hook.toLowerCase();
  let score = 1;

  if (normalized.includes("job") || normalized.includes("cost")) {
    score += 2;
  }

  if (
    normalized.includes("risk") ||
    normalized.includes("wrong") ||
    normalized.includes("escalate")
  ) {
    score += 1;
  }

  if (opportunity.trustRisk === "medium") {
    score += 1;
  }

  if (opportunity.trustRisk === "high") {
    score += 2;
  }

  return Math.min(5, Math.max(1, score));
}

function scoreBrandAlignment(hook: string, opportunity: ContentOpportunity): number {
  const normalized = hook.toLowerCase();
  let score = 3;

  if (
    normalized.includes("teacher") ||
    normalized.includes("message") ||
    normalized.includes("send") ||
    normalized.includes("calm")
  ) {
    score += 1;
  }

  if (
    normalized.includes(opportunity.primaryPainPoint.toLowerCase()) ||
    normalized.includes(opportunity.title.toLowerCase())
  ) {
    score += 1;
  }

  if (normalized.includes("job")) {
    score -= 1;
  }

  return Math.min(5, Math.max(1, score));
}

function scoreGeneralistAppeal(hook: string): number {
  const normalized = hook.toLowerCase();
  let score = 4;

  if (hook.length > 90) {
    score -= 1;
  }

  if (normalized.includes("teacher")) {
    score -= 1;
  }

  if (
    normalized.includes("risk") ||
    normalized.includes("message") ||
    normalized.includes("wrong") ||
    normalized.includes("send")
  ) {
    score += 1;
  }

  return Math.min(5, Math.max(1, score));
}

export function generateHooks(opportunity: ContentOpportunity): string[] {
  const anchor = buildOpportunityAnchor(opportunity);
  const anchorLower = lowerFirst(anchor);
  const riskAnchor = lowerFirst(buildRiskAnchor(opportunity));
  const nextStepAnchor = buildNextStepAnchor(opportunity);

  const hooks = uniqueHooks([
    "This could escalate quickly.",
    "This message could cost you your job.",
    "Most teachers don't realise this risk.",
    "This is where things go wrong.",
    "Before you send this...",
    anchor
      ? `This could escalate quickly when ${anchorLower}.`
      : "This could escalate quickly when the pressure is already high.",
    riskAnchor
      ? `The real risk starts when ${riskAnchor}.`
      : "The real risk starts when nobody spots the issue early.",
    `Before you send this, ${nextStepAnchor}.`,
    anchor
      ? `${anchor} can turn into a bigger problem fast.`
      : "What feels small here can turn into a bigger problem fast.",
    "What looks minor here can land badly.",
  ]);

  return hooks.slice(0, 8);
}

export function rankHooks(
  hooks: string[],
  opportunity: ContentOpportunity,
): RankedHook[] {
  return uniqueHooks(hooks)
    .map((hook) => {
      const score =
        scoreClarity(hook) +
        scoreEmotionalImpact(hook) +
        scoreStakes(hook, opportunity) +
        scoreBrandAlignment(hook, opportunity) +
        scoreGeneralistAppeal(hook);

      return {
        hook,
        score,
      };
    })
    .sort((left, right) => right.score - left.score || left.hook.localeCompare(right.hook));
}
