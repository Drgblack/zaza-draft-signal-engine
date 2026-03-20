import { z } from "zod";

import type { ApprovalPackageCompleteness } from "@/lib/completeness";
import type { ConflictAssessment } from "@/lib/conflicts";
import type { ExpectedOutcomeAssessment } from "@/lib/expected-outcome-ranking";
import type { FatigueAssessment } from "@/lib/fatigue";
import type { UnifiedGuidance } from "@/lib/guidance";
import type { CandidateHypothesis } from "@/lib/hypotheses";
import type { SignalRecord } from "@/types/signal";

export const AUTOMATION_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export type AutomationConfidenceLevel = (typeof AUTOMATION_CONFIDENCE_LEVELS)[number];

export const automationConfidenceLevelSchema = z.enum(AUTOMATION_CONFIDENCE_LEVELS);

export interface AutomationConfidenceAssessment {
  level: AutomationConfidenceLevel;
  label: string;
  summary: string;
  reasons: string[];
  allowAutofill: boolean;
  allowBatchInclusion: boolean;
  allowExperimentProposal: boolean;
  allowMacroSuggestions: boolean;
  requiresOperatorJudgement: boolean;
  rankAdjustment: number;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

export function getAutomationConfidenceLabel(level: AutomationConfidenceLevel): string {
  switch (level) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
    default:
      return "Low confidence";
  }
}

export function getAutomationConfidenceSummary(level: AutomationConfidenceLevel): string {
  switch (level) {
    case "high":
      return "High confidence - safe to autopilot";
    case "medium":
      return "Medium confidence - suggest only";
    case "low":
    default:
      return "Low confidence - hold";
  }
}

export function assessAutomationConfidence(input: {
  signal: SignalRecord;
  guidance: Pick<UnifiedGuidance, "confidence" | "reuseMemory" | "relatedPlaybookCards" | "relatedPatterns" | "relatedBundles">;
  completeness: Pick<ApprovalPackageCompleteness, "completenessState" | "completenessScore" | "missingElements">;
  conflicts: Pick<ConflictAssessment, "highestSeverity" | "requiresJudgement" | "summary">;
  expectedOutcome: Pick<ExpectedOutcomeAssessment, "expectedOutcomeTier" | "expectedOutcomeReasons" | "positiveSignals" | "riskSignals">;
  hypothesis: Pick<CandidateHypothesis, "keyLevers" | "riskNote">;
  fatigue: Pick<FatigueAssessment, "warnings">;
}): AutomationConfidenceAssessment {
  const reasons: string[] = [];
  const positiveReasons: string[] = [];
  const cautionReasons: string[] = [];

  const moderateFatigue = input.fatigue.warnings.some((warning) => warning.severity === "moderate");
  const anyFatigue = input.fatigue.warnings.length > 0;
  const highConflict = input.conflicts.highestSeverity === "high" || input.conflicts.requiresJudgement;
  const mediumConflict = input.conflicts.highestSeverity === "medium";
  const lowOutcome = input.expectedOutcome.expectedOutcomeTier === "low";
  const mediumOutcome = input.expectedOutcome.expectedOutcomeTier === "medium";
  const highOutcome = input.expectedOutcome.expectedOutcomeTier === "high";
  const incompletePackage = input.completeness.completenessState === "incomplete";
  const highCompleteness =
    input.completeness.completenessState === "complete" || input.completeness.completenessState === "mostly_complete";
  const lowGuidanceConfidence = input.guidance.confidence.confidenceLevel === "low";
  const highGuidanceConfidence = input.guidance.confidence.confidenceLevel === "high";
  const weakSourceTrust = (input.signal.sourceTrustScore ?? 100) <= 45;
  const strongSourceTrust = (input.signal.sourceTrustScore ?? 60) >= 70;
  const repeatableSupport =
    Boolean(input.guidance.relatedPlaybookCards[0]) ||
    Boolean(input.guidance.relatedPatterns[0]) ||
    Boolean(input.guidance.relatedBundles[0]) ||
    Boolean(input.guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "positive"));
  const cautionaryReuse = Boolean(
    input.guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "caution"),
  );
  const weakHypothesis = Boolean(input.hypothesis.riskNote) || input.hypothesis.keyLevers.length < 2;
  const strongHypothesis = !input.hypothesis.riskNote && input.hypothesis.keyLevers.length >= 3;

  if (highCompleteness) {
    uniquePush(positiveReasons, "Approval package is nearly complete.");
  } else if (incompletePackage) {
    uniquePush(
      cautionReasons,
      `Package still misses ${input.completeness.missingElements[0] ?? "key approval details"}.`,
    );
  }

  if (highOutcome) {
    uniquePush(
      positiveReasons,
      input.expectedOutcome.expectedOutcomeReasons[0] ?? "Expected outcome support is strong.",
    );
  } else if (mediumOutcome) {
    uniquePush(
      cautionReasons,
      input.expectedOutcome.expectedOutcomeReasons[0] ?? "Expected outcome support is workable but not fully settled.",
    );
  } else if (lowOutcome) {
    uniquePush(
      cautionReasons,
      input.expectedOutcome.riskSignals[0] ?? input.expectedOutcome.expectedOutcomeReasons[0] ?? "Expected value support is still weak.",
    );
  }

  if (highConflict) {
    uniquePush(cautionReasons, input.conflicts.summary[0] ?? "Package conflicts still need explicit judgement.");
  } else if (mediumConflict) {
    uniquePush(cautionReasons, input.conflicts.summary[0] ?? "Some package alignment friction remains.");
  } else {
    uniquePush(positiveReasons, "No meaningful package conflict is active.");
  }

  if (moderateFatigue) {
    uniquePush(cautionReasons, input.fatigue.warnings[0]?.summary ?? "Fatigue risk is rising.");
  } else if (anyFatigue) {
    uniquePush(cautionReasons, input.fatigue.warnings[0]?.summary ?? "Light fatigue signal is visible.");
  } else {
    uniquePush(positiveReasons, "No fatigue warning is active.");
  }

  if (lowGuidanceConfidence) {
    uniquePush(cautionReasons, "Editorial confidence is still low.");
  } else if (highGuidanceConfidence) {
    uniquePush(positiveReasons, "Editorial confidence is already high.");
  }

  if (weakSourceTrust) {
    uniquePush(cautionReasons, "Source trust is still weak for autopilot.");
  } else if (strongSourceTrust) {
    uniquePush(positiveReasons, "Source trust is strong.");
  }

  if (strongHypothesis) {
    uniquePush(positiveReasons, "Hypothesis is clear and supported by multiple levers.");
  } else if (weakHypothesis) {
    uniquePush(cautionReasons, input.hypothesis.riskNote ?? "Hypothesis support is still thin.");
  }

  if (repeatableSupport) {
    uniquePush(positiveReasons, "Pattern or reuse support exists.");
  }

  if (cautionaryReuse) {
    uniquePush(cautionReasons, "Reuse memory still carries caution.");
  }

  let level: AutomationConfidenceLevel;

  if (incompletePackage || lowOutcome || highConflict || lowGuidanceConfidence || weakSourceTrust) {
    level = "low";
  } else if (
    highCompleteness &&
    highOutcome &&
    !mediumConflict &&
    !highConflict &&
    !moderateFatigue &&
    !anyFatigue &&
    !weakHypothesis &&
    (highGuidanceConfidence || repeatableSupport) &&
    !cautionaryReuse
  ) {
    level = "high";
  } else {
    level = "medium";
  }

  const rankAdjustment = level === "high" ? 3 : level === "low" ? -4 : 0;

  for (const reason of [...positiveReasons, ...cautionReasons].slice(0, 4)) {
    uniquePush(reasons, reason);
  }

  return {
    level,
    label: getAutomationConfidenceLabel(level),
    summary: getAutomationConfidenceSummary(level),
    reasons,
    allowAutofill: level === "high",
    allowBatchInclusion: level === "high",
    allowExperimentProposal: level === "medium",
    allowMacroSuggestions: level !== "low",
    requiresOperatorJudgement: level === "low",
    rankAdjustment,
  };
}
