import type { AutomationConfidenceAssessment } from "@/lib/confidence";
import type { ConflictAssessment } from "@/lib/conflicts";
import type { DistributionPriorityAssessment } from "@/lib/distribution-priority";
import type { ExpectedOutcomeAssessment } from "@/lib/expected-outcome-ranking";
import type { PackageAutofillResult } from "@/lib/package-filler";
import type { PreReviewRepairResult } from "@/lib/review-repair";
import type { CommercialRiskAssessment } from "@/lib/risk-guardrails";
import type { StaleQueueAssessment } from "@/lib/stale-queue";

export const QUEUE_TRIAGE_STATES = [
  "approve_ready",
  "repairable",
  "needs_judgement",
  "stale_but_reusable",
  "suppress",
] as const;

export type QueueTriageState = (typeof QUEUE_TRIAGE_STATES)[number];

export interface QueueTriageAssessment {
  triageState: QueueTriageState;
  reason: string;
  supportingSignals: string[];
  suggestedNextAction: string;
  summary: string;
}

export interface QueueTriageInsights {
  distribution: Array<{ triageState: QueueTriageState; label: string; count: number }>;
  repairableCount: number;
  suppressionCount: number;
  staleButReusableCount: number;
  topNeedsJudgementReasons: Array<{ label: string; count: number }>;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

export function getQueueTriageLabel(state: QueueTriageState): string {
  switch (state) {
    case "approve_ready":
      return "Approve ready";
    case "repairable":
      return "Repairable";
    case "needs_judgement":
      return "Needs judgement";
    case "stale_but_reusable":
      return "Evergreen later";
    case "suppress":
    default:
      return "Suppressed for now";
  }
}

export function assessQueueTriage(input: {
  automationConfidence: AutomationConfidenceAssessment;
  completeness: { completenessState: "complete" | "mostly_complete" | "incomplete"; missingElements: string[] };
  conflicts: ConflictAssessment;
  expectedOutcome: ExpectedOutcomeAssessment;
  stale: StaleQueueAssessment;
  packageAutofill: PackageAutofillResult;
  preReviewRepair: PreReviewRepairResult;
  commercialRisk: CommercialRiskAssessment;
  distributionPriority: DistributionPriorityAssessment;
  experimentLinked?: boolean;
}): QueueTriageAssessment {
  const supportingSignals: string[] = [];

  if (
    input.stale.operatorAction === "suppress" ||
    (input.stale.isSuppressedFromTopQueue &&
      (input.expectedOutcome.expectedOutcomeTier === "low" || input.automationConfidence.level === "low"))
  ) {
    uniquePush(supportingSignals, input.stale.actionSummary);
    uniquePush(supportingSignals, input.stale.reasons[0]?.summary);
    uniquePush(supportingSignals, input.expectedOutcome.riskSignals[0]);

    return {
      triageState: "suppress",
      reason:
        input.stale.reasons[0]?.summary ??
        "This candidate is low-value or explicitly suppressed, so it should stay visible but out of the top queue.",
      supportingSignals,
      suggestedNextAction: "Keep visible in stale or full queue lanes only.",
      summary: "Suppressed for now.",
    };
  }

  if (
    input.stale.state === "stale_but_reusable" ||
    input.stale.operatorAction === "move_to_evergreen_later"
  ) {
    uniquePush(supportingSignals, input.stale.reasons[0]?.summary);
    uniquePush(supportingSignals, input.stale.actionSummary);
    uniquePush(supportingSignals, input.expectedOutcome.positiveSignals[0]);

    return {
      triageState: "stale_but_reusable",
      reason:
        input.stale.reasons[0]?.summary ??
        "This candidate is no longer top-queue material right now, but it still looks worth preserving for later reuse.",
      supportingSignals,
      suggestedNextAction: "Route to evergreen later and reuse when the weekly mix needs it.",
      summary: "Stale but reusable.",
    };
  }

  if (
    input.conflicts.requiresJudgement ||
    input.automationConfidence.requiresOperatorJudgement ||
    input.automationConfidence.level !== "high" ||
    input.experimentLinked ||
    input.commercialRisk.decision === "block"
  ) {
    uniquePush(supportingSignals, input.conflicts.summary[0]);
    uniquePush(supportingSignals, input.automationConfidence.summary);
    uniquePush(supportingSignals, input.packageAutofill.policy.summary);
    uniquePush(supportingSignals, input.commercialRisk.topRisk?.reason);
    uniquePush(
      supportingSignals,
      input.distributionPriority.distributionStrategy !== "single"
        ? `${input.distributionPriority.primaryPlatformLabel} leads, but distribution should stay ${input.distributionPriority.distributionStrategy}.`
        : null,
    );

    return {
      triageState: "needs_judgement",
      reason:
        input.commercialRisk.topRisk?.reason ??
        input.conflicts.topConflicts[0]?.reason ??
        input.automationConfidence.summary ??
        "This candidate still needs explicit operator judgement before it should sit in the fastest approval lane.",
      supportingSignals,
      suggestedNextAction: "Route into final review or a judgement-first lane.",
      summary: "Needs operator judgement.",
    };
  }

  if (
    input.completeness.completenessState !== "complete" ||
    input.packageAutofill.mode === "suggested" ||
    input.preReviewRepair.decision === "skipped"
  ) {
    uniquePush(
      supportingSignals,
      input.packageAutofill.notes[0]
        ? `${input.packageAutofill.notes[0].label}: ${input.packageAutofill.notes[0].value}`
        : null,
    );
    uniquePush(supportingSignals, input.completeness.missingElements[0]);
    uniquePush(supportingSignals, input.preReviewRepair.summary);

    return {
      triageState: "repairable",
      reason:
        input.completeness.missingElements[0]
          ? `Low-risk package cleanup is still available: ${input.completeness.missingElements[0]}.`
          : input.packageAutofill.notes[0]?.reason ??
            "This candidate is close, but one bounded repair pass would reduce review friction.",
      supportingSignals,
      suggestedNextAction: "Apply or confirm bounded package fixes before deeper review.",
      summary: "Repairable with low-risk cleanup.",
    };
  }

  uniquePush(supportingSignals, input.automationConfidence.summary);
  uniquePush(supportingSignals, input.expectedOutcome.expectedOutcomeReasons[0]);
  uniquePush(
    supportingSignals,
    `${input.distributionPriority.primaryPlatformLabel} is the clearest first distribution route.`,
  );

  return {
    triageState: "approve_ready",
    reason:
      input.expectedOutcome.expectedOutcomeReasons[0] ??
      "This candidate is complete, high-confidence, and clear enough to stay in the fastest approval lane.",
    supportingSignals,
    suggestedNextAction: "Open final review and approve when ready.",
    summary: "Approve ready.",
  };
}

export function buildQueueTriageInsights(
  items: QueueTriageAssessment[],
): QueueTriageInsights {
  const needsJudgementReasonCounts = new Map<string, number>();
  const distribution = QUEUE_TRIAGE_STATES.map((triageState) => ({
    triageState,
    label: getQueueTriageLabel(triageState),
    count: items.filter((item) => item.triageState === triageState).length,
  }));

  for (const item of items) {
    if (item.triageState !== "needs_judgement") {
      continue;
    }

    const label = item.supportingSignals[0] ?? item.reason;
    needsJudgementReasonCounts.set(label, (needsJudgementReasonCounts.get(label) ?? 0) + 1);
  }

  return {
    distribution,
    repairableCount: items.filter((item) => item.triageState === "repairable").length,
    suppressionCount: items.filter((item) => item.triageState === "suppress").length,
    staleButReusableCount: items.filter((item) => item.triageState === "stale_but_reusable").length,
    topNeedsJudgementReasons: [...needsJudgementReasonCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4),
  };
}
