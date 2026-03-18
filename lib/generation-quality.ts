import { assessScenarioAngle, getScenarioPriority } from "@/lib/scenario-angle";
import { hasInterpretation } from "@/lib/workflow";
import type { SignalGenerationInput, SignalGenerationResult, SignalRecord } from "@/types/signal";

export interface GenerationReadiness {
  status: "ready" | "caution" | "blocked";
  label: string;
  message: string;
  notes: string[];
  scenarioQuality: ReturnType<typeof assessScenarioAngle>["quality"];
  interpretationLikelyStale: boolean;
  canGenerate: boolean;
}

export interface DraftQualityCheck {
  label: string;
  status: "pass" | "warn";
  message: string;
}

export interface DraftQualityEvaluation {
  label: "Strong" | "Needs Review" | "Weak";
  checks: DraftQualityCheck[];
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function overlapRatio(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const overlap = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

export function evaluateGenerationReadiness(signal: SignalRecord): GenerationReadiness {
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const interpretationPresent = hasInterpretation(signal);
  const interpretationMentionsScenario = normalizeText(signal.interpretationNotes).includes("scenario angle");
  const shouldPrioritizeScenario = scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable";
  const interpretationLikelyStale = Boolean(signal.scenarioAngle && shouldPrioritizeScenario && !interpretationMentionsScenario);

  if (!interpretationPresent) {
    return {
      status: "blocked",
      label: "Interpretation missing",
      message: "Generate is blocked until the record has a saved interpretation.",
      notes: ["Return to interpretation first so the drafts are governed by a clear editorial read."],
      scenarioQuality: scenarioAssessment.quality,
      interpretationLikelyStale,
      canGenerate: false,
    };
  }

  if (interpretationLikelyStale) {
    return {
      status: "caution",
      label: "Interpretation may be stale",
      message: "Scenario framing looks stronger than the saved interpretation context. Refresh interpretation before generating if the framing changed.",
      notes: ["Current scenario angle looks usable, but the saved interpretation does not clearly reference it."],
      scenarioQuality: scenarioAssessment.quality,
      interpretationLikelyStale,
      canGenerate: true,
    };
  }

  if (scenarioAssessment.quality === "weak") {
    return {
      status: "caution",
      label: "Scenario angle weak",
      message: "Drafts may lean generic because the current scenario angle is weakly framed.",
      notes: scenarioAssessment.suggestions,
      scenarioQuality: scenarioAssessment.quality,
      interpretationLikelyStale,
      canGenerate: true,
    };
  }

  if (scenarioAssessment.quality === "missing") {
    return {
      status: "caution",
      label: "Ready, but headline-led",
      message: "Generation can run, but without a scenario angle the drafts will lean more on the saved interpretation and source framing.",
      notes: ["If the source is indirect, return to interpretation and add a teacher communication scenario first."],
      scenarioQuality: scenarioAssessment.quality,
      interpretationLikelyStale,
      canGenerate: true,
    };
  }

  return {
    status: "ready",
    label: "Ready to generate",
    message: "Scenario angle and interpretation are aligned enough to drive scenario-aware drafts.",
    notes: ["Drafts will prioritise the current scenario angle, then the saved interpretation, then source evidence."],
    scenarioQuality: scenarioAssessment.quality,
    interpretationLikelyStale,
    canGenerate: true,
  };
}

function countHashtags(value: string): number {
  const matches = value.match(/#[\p{L}\p{N}_]+/gu);
  return matches?.length ?? 0;
}

export function evaluateDraftQuality(input: SignalGenerationInput, output: SignalGenerationResult): DraftQualityEvaluation {
  const preferredScenario = getScenarioPriority({
    scenarioAngle: input.scenarioAngle,
    sourceTitle: input.sourceTitle,
  }).preferredScenario;
  const allDraftText = [output.xDraft, output.linkedInDraft, output.redditDraft, output.videoScript].join(" ");

  const checks: DraftQualityCheck[] = [];
  const scenarioOverlap = overlapRatio(allDraftText, preferredScenario);
  const headlineOverlap = overlapRatio(allDraftText, input.sourceTitle);
  const xLength = output.xDraft.length;
  const linkedInLower = normalizeText(output.linkedInDraft);
  const redditLower = normalizeText(output.redditDraft);

  checks.push({
    label: "Scenario alignment",
    status: preferredScenario && scenarioOverlap < 0.12 ? "warn" : "pass",
    message:
      preferredScenario && scenarioOverlap < 0.12
        ? "The drafts do not yet read as strongly tied to the chosen scenario angle."
        : "The drafts appear aligned to the current framing.",
  });

  checks.push({
    label: "Headline drift",
    status: headlineOverlap > 0.48 ? "warn" : "pass",
    message:
      headlineOverlap > 0.48
        ? "The draft set looks a bit too close to the source headline and may need more scenario-led wording."
        : "The drafts are not overly tied to the raw source headline.",
  });

  checks.push({
    label: "X draft sharpness",
    status: xLength > 280 || xLength < 80 ? "warn" : "pass",
    message:
      xLength > 280
        ? "The X draft is too long for a clean first pass."
        : xLength < 80
          ? "The X draft may be too thin to land clearly."
          : "The X draft length looks workable.",
  });

  checks.push({
    label: "LinkedIn specificity",
    status:
      linkedInLower.includes("teachers are stressed") ||
      linkedInLower.includes("more than ever") ||
      linkedInLower.includes("in today s world")
        ? "warn"
        : "pass",
    message:
      linkedInLower.includes("teachers are stressed") ||
      linkedInLower.includes("more than ever") ||
      linkedInLower.includes("in today s world")
        ? "The LinkedIn draft reads a bit generic or abstract."
        : "The LinkedIn draft feels specific enough for review.",
  });

  checks.push({
    label: "Reddit community fit",
    status:
      redditLower.includes("zaza") ||
      redditLower.includes("sign up") ||
      redditLower.includes("book a demo") ||
      countHashtags(output.redditDraft) > 0
        ? "warn"
        : "pass",
    message:
      redditLower.includes("zaza") ||
      redditLower.includes("sign up") ||
      redditLower.includes("book a demo") ||
      countHashtags(output.redditDraft) > 0
        ? "The Reddit draft feels too promotional for a discussion-first post."
        : "The Reddit draft looks discussion-first rather than promotional.",
  });

  const warningCount = checks.filter((check) => check.status === "warn").length;

  return {
    label: warningCount === 0 ? "Strong" : warningCount >= 3 ? "Weak" : "Needs Review",
    checks,
  };
}
