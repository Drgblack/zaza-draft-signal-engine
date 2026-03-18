import { assessScenarioAngle } from "@/lib/scenario-angle";
import { ABSTRACT_COMMENTARY_PATTERNS, COMMUNICATION_SIGNAL_KEYWORDS, clampScore, countKeywordMatches } from "@/lib/scoring-rules";
import { getSourceProfile } from "@/lib/source-profiles";
import type { SignalRecord } from "@/types/signal";

export interface TransformabilityAssessment {
  score: number;
  label: "Low transformability" | "Moderate transformability" | "High transformability";
  reason: string;
  isIndirectSource: boolean;
  materiallyImprovedByScenario: boolean;
  scenarioQuality: ReturnType<typeof assessScenarioAngle>["quality"];
}

function buildRawSourceText(signal: SignalRecord): string {
  return [signal.sourceTitle, signal.manualSummary, signal.rawExcerpt, signal.sourcePublisher].filter(Boolean).join(" ").toLowerCase();
}

function buildScenarioText(signal: SignalRecord): string {
  return signal.scenarioAngle?.trim().toLowerCase() ?? "";
}

export function assessTransformability(signal: SignalRecord): TransformabilityAssessment {
  const profile = getSourceProfile(signal);
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const rawSourceText = buildRawSourceText(signal);
  const scenarioText = buildScenarioText(signal);
  const rawCommunicationHits = countKeywordMatches(rawSourceText, COMMUNICATION_SIGNAL_KEYWORDS);
  const scenarioCommunicationHits = countKeywordMatches(scenarioText, COMMUNICATION_SIGNAL_KEYWORDS);
  const isIndirectSource = ["feed-policy-news", "formal-report", "feed-teacher-news", "generic-external"].includes(profile.id);

  let score = isIndirectSource ? 18 : 8;

  if (scenarioAssessment.quality === "strong") {
    score += 34;
  } else if (scenarioAssessment.quality === "usable") {
    score += 22;
  } else if (scenarioAssessment.quality === "weak") {
    score += 6;
  }

  if (scenarioCommunicationHits >= 2) {
    score += 20;
  } else if (scenarioCommunicationHits >= 1) {
    score += 10;
  }

  if (isIndirectSource && rawCommunicationHits === 0) {
    score += 10;
  }

  if (scenarioAssessment.overlapWithTitle <= 0.45 && scenarioAssessment.quality !== "missing") {
    score += 10;
  } else if (scenarioAssessment.overlapWithTitle >= 0.75) {
    score -= 12;
  }

  if (ABSTRACT_COMMENTARY_PATTERNS.some((pattern) => rawSourceText.includes(pattern))) {
    score -= 12;
  }

  if (scenarioAssessment.quality === "missing") {
    score -= isIndirectSource ? 14 : 6;
  }

  const finalScore = clampScore(score);
  const materiallyImprovedByScenario =
    isIndirectSource &&
    (scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable") &&
    scenarioCommunicationHits >= 1 &&
    scenarioAssessment.overlapWithTitle < 0.7;

  if (finalScore >= 70) {
    return {
      score: finalScore,
      label: "High transformability",
      reason: materiallyImprovedByScenario
        ? "Raw source is indirect, but the current scenario framing turns it into a usable teacher communication situation."
        : "Current framing gives this signal a strong path into a practical communication scenario.",
      isIndirectSource,
      materiallyImprovedByScenario,
      scenarioQuality: scenarioAssessment.quality,
    };
  }

  if (finalScore >= 45) {
    return {
      score: finalScore,
      label: "Moderate transformability",
      reason:
        scenarioAssessment.quality === "weak" || scenarioAssessment.quality === "missing"
          ? "This source may be useful, but the current framing is not yet strong enough to convert it into a practical communication situation."
          : "There is some usable transformation potential here, but the framing still needs operator judgement.",
      isIndirectSource,
      materiallyImprovedByScenario,
      scenarioQuality: scenarioAssessment.quality,
    };
  }

  return {
    score: finalScore,
    label: "Low transformability",
    reason:
      scenarioAssessment.quality === "weak" || scenarioAssessment.quality === "missing"
        ? "This source remains too indirect or weakly framed to become a strong teacher communication scenario."
        : "The source still reads as too abstract or low-tension to transform cleanly.",
    isIndirectSource,
    materiallyImprovedByScenario,
    scenarioQuality: scenarioAssessment.quality,
  };
}
