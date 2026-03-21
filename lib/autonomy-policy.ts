import type { OperatorTuning, OperatorTuningSettings } from "@/lib/tuning-definitions";

export const AUTONOMY_ACTION_TYPES = [
  "autofill_package",
  "auto_repair",
  "auto_stage_for_posting",
  "safe_post",
  "suggest_reply",
  "create_experiment_variant",
  "apply_macro",
  "auto_promote_to_approval_ready",
  "auto_route_to_queue_bucket",
] as const;

export const AUTONOMY_POLICY_DECISIONS = ["allow", "suggest_only", "block"] as const;

export type AutonomyActionType = (typeof AUTONOMY_ACTION_TYPES)[number];
export type AutonomyPolicyDecisionType = (typeof AUTONOMY_POLICY_DECISIONS)[number];

export interface AutonomyPolicyDecision {
  actionType: AutonomyActionType;
  decision: AutonomyPolicyDecisionType;
  reasons: string[];
  policyLane?: string | null;
  relatedSignals?: string[];
  summary: string;
}

export interface AutonomyPolicyInput {
  actionType: AutonomyActionType;
  confidenceLevel?: "high" | "medium" | "low" | null;
  completenessState?: "complete" | "mostly_complete" | "incomplete" | null;
  hasUnresolvedConflicts?: boolean;
  experimentLinked?: boolean;
  workflowState?: string | null;
  safeModePostingEnabled?: boolean;
  supportedExecutionPath?: string | null;
  ambiguityRisk?: "low" | "medium" | "high" | null;
  approvalReady?: boolean;
  hasDrafts?: boolean;
  nearComplete?: boolean;
  draftQualityLabel?: string | null;
  reviewContextKnown?: boolean;
  relationshipKnown?: boolean;
}

export interface AutonomyPolicyInsights {
  allowedCount: number;
  suggestOnlyCount: number;
  blockedCount: number;
  topBlockReasons: Array<{ label: string; count: number }>;
  byAction: Array<{
    actionType: AutonomyActionType;
    allowedCount: number;
    suggestOnlyCount: number;
    blockedCount: number;
  }>;
}

export interface AutonomyPolicyTuningSummary {
  allowed: string[];
  suggestOnly: string[];
  blocked: string[];
}

function normalizeReason(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function pushReason(target: string[], value: string | null | undefined) {
  const normalized = normalizeReason(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function buildSummary(
  actionType: AutonomyActionType,
  decision: AutonomyPolicyDecisionType,
  reasons: string[],
) {
  const actionLabel = actionType.replaceAll("_", " ");
  if (decision === "allow") {
    return reasons[0] ?? `Allowed by policy for ${actionLabel}.`;
  }
  if (decision === "suggest_only") {
    return reasons[0] ?? `Suggest only for ${actionLabel}.`;
  }
  return reasons[0] ?? `Blocked by policy for ${actionLabel}.`;
}

function finalizeDecision(
  input: AutonomyPolicyInput,
  decision: AutonomyPolicyDecisionType,
  reasons: string[],
  policyLane?: string | null,
  relatedSignals?: string[],
): AutonomyPolicyDecision {
  const finalReasons = reasons.length > 0 ? reasons : [`${input.actionType.replaceAll("_", " ")} stays ${decision.replaceAll("_", " ")}.`];

  return {
    actionType: input.actionType,
    decision,
    reasons: finalReasons,
    policyLane: policyLane ?? null,
    relatedSignals: relatedSignals?.filter(Boolean) ?? [],
    summary: buildSummary(input.actionType, decision, finalReasons),
  };
}

function buildRelatedSignals(input: AutonomyPolicyInput) {
  const relatedSignals: string[] = [];
  if (input.confidenceLevel) {
    relatedSignals.push(`confidence:${input.confidenceLevel}`);
  }
  if (input.completenessState) {
    relatedSignals.push(`completeness:${input.completenessState}`);
  }
  if (input.hasUnresolvedConflicts) {
    relatedSignals.push("conflicts:unresolved");
  }
  if (input.experimentLinked) {
    relatedSignals.push("experiment:linked");
  }
  if (input.ambiguityRisk) {
    relatedSignals.push(`risk:${input.ambiguityRisk}`);
  }
  return relatedSignals;
}

function isMedium(input: AutonomyPolicyInput) {
  return input.confidenceLevel === "medium";
}

function isLow(input: AutonomyPolicyInput) {
  return input.confidenceLevel === "low";
}

export function evaluateAutonomyPolicy(input: AutonomyPolicyInput): AutonomyPolicyDecision {
  const reasons: string[] = [];
  const relatedSignals = buildRelatedSignals(input);

  switch (input.actionType) {
    case "safe_post": {
      if (input.workflowState !== "staged_for_posting") {
        pushReason(reasons, "Only staged packages can use safe-mode posting.");
      }
      if (!input.safeModePostingEnabled) {
        pushReason(reasons, "Safe-mode posting is disabled in operator settings.");
      }
      if (!input.reviewContextKnown) {
        pushReason(reasons, "This item is outside the active review context, so the engine cannot verify it safely.");
      }
      if (input.completenessState !== "complete") {
        pushReason(reasons, `Package completeness is ${input.completenessState?.replaceAll("_", " ") ?? "not complete"}.`);
      }
      if (input.hasUnresolvedConflicts) {
        pushReason(reasons, "Unresolved conflicts remain in the posting package.");
      }
      if (input.experimentLinked) {
        pushReason(reasons, "Experiment-linked content stays manual-only in strict safe mode.");
      }
      if (input.confidenceLevel !== "high") {
        pushReason(reasons, "Only high-confidence items can use safe mode.");
      }
      if (reasons.length > 0) {
        return finalizeDecision(input, "block", reasons, "strict_guardrails", relatedSignals);
      }
      if (!input.supportedExecutionPath) {
        pushReason(reasons, "This platform remains manual-only in strict safe mode.");
        return finalizeDecision(input, "suggest_only", reasons, "manual_confirmed", relatedSignals);
      }
      pushReason(reasons, "High-confidence complete package with no unresolved conflicts meets safe-post guardrails.");
      return finalizeDecision(input, "allow", reasons, "strict_guardrails", relatedSignals);
    }

    case "suggest_reply": {
      if (input.ambiguityRisk === "high") {
        pushReason(reasons, "High-risk, emotional, legal, payment, or support-sensitive replies stay manual.");
        return finalizeDecision(input, "block", reasons, "reply_guardrails", relatedSignals);
      }
      if (!input.relationshipKnown) {
        pushReason(reasons, "Relationship context is still too thin for a safe staged reply.");
      }
      if (input.ambiguityRisk === "medium") {
        pushReason(reasons, "Reply intent is still ambiguous enough to require operator judgement.");
      }
      if (reasons.length > 0) {
        return finalizeDecision(input, "suggest_only", reasons, "reply_guardrails", relatedSignals);
      }
      pushReason(reasons, "Low-risk reply with clear intent can be staged safely for operator confirmation.");
      return finalizeDecision(input, "allow", reasons, "reply_guardrails", relatedSignals);
    }

    case "autofill_package": {
      if (!input.hasDrafts) {
        pushReason(reasons, "Draft variants are still missing, so bounded autofill has nothing safe to work from.");
      }
      if (!input.nearComplete) {
        pushReason(reasons, "The package is still too incomplete for bounded autofill.");
      }
      if (input.draftQualityLabel === "Weak") {
        pushReason(reasons, "Weak draft quality keeps this package in operator judgement.");
      }
      if (input.approvalReady === false) {
        pushReason(reasons, "The candidate is not approval-ready yet.");
      }
      if (isLow(input)) {
        pushReason(reasons, "Low confidence blocks package autofill.");
      }
      if (reasons.length > 0) {
        return finalizeDecision(input, "block", reasons, "bounded_autofill", relatedSignals);
      }
      if (isMedium(input)) {
        pushReason(reasons, "Medium confidence keeps package autofill in suggest-only mode.");
        return finalizeDecision(input, "suggest_only", reasons, "bounded_autofill", relatedSignals);
      }
      pushReason(reasons, "High-confidence near-complete package can use bounded autofill.");
      return finalizeDecision(input, "allow", reasons, "bounded_autofill", relatedSignals);
    }

    case "create_experiment_variant": {
      if (isLow(input)) {
        pushReason(reasons, "Low-confidence candidates should not spawn autonomous experiment variants.");
        return finalizeDecision(input, "block", reasons, "experiment_learning", relatedSignals);
      }
      if (input.hasUnresolvedConflicts) {
        pushReason(reasons, "Conflicted candidates can still suggest experiments, but they should not auto-escalate.");
        return finalizeDecision(input, "suggest_only", reasons, "experiment_learning", relatedSignals);
      }
      if (isMedium(input)) {
        pushReason(reasons, "Medium confidence keeps experiment creation in suggest-only mode.");
        return finalizeDecision(input, "suggest_only", reasons, "experiment_learning", relatedSignals);
      }
      pushReason(reasons, "High-confidence candidate can generate a bounded experiment proposal.");
      return finalizeDecision(input, "allow", reasons, "experiment_learning", relatedSignals);
    }

    case "auto_route_to_queue_bucket":
    case "auto_stage_for_posting":
    case "auto_repair":
    case "auto_promote_to_approval_ready":
    case "apply_macro": {
      if (isLow(input)) {
        pushReason(reasons, "Low confidence keeps this action in operator judgement.");
      }
      if (input.hasUnresolvedConflicts) {
        pushReason(reasons, "Unresolved conflicts block this autonomous action.");
      }
      if (
        input.actionType !== "apply_macro" &&
        input.actionType !== "auto_route_to_queue_bucket" &&
        input.completenessState &&
        input.completenessState === "incomplete"
      ) {
        pushReason(reasons, "Incomplete packages should not advance automatically.");
      }
      if (reasons.length > 0) {
        return finalizeDecision(input, "block", reasons, "operator_guarded", relatedSignals);
      }
      if (isMedium(input)) {
        pushReason(reasons, "Medium confidence keeps this action in suggest-only mode.");
        return finalizeDecision(input, "suggest_only", reasons, "operator_guarded", relatedSignals);
      }
      pushReason(reasons, "High-confidence low-risk state allows this bounded autonomous action.");
      return finalizeDecision(input, "allow", reasons, "operator_guarded", relatedSignals);
    }

    default: {
      if (isLow(input)) {
        pushReason(reasons, "Low confidence keeps this action blocked.");
        return finalizeDecision(input, "block", reasons, "operator_guarded", relatedSignals);
      }
      if (isMedium(input)) {
        pushReason(reasons, "Medium confidence keeps this action suggest-only.");
        return finalizeDecision(input, "suggest_only", reasons, "operator_guarded", relatedSignals);
      }
      pushReason(reasons, "High-confidence low-risk state allows this action.");
      return finalizeDecision(input, "allow", reasons, "operator_guarded", relatedSignals);
    }
  }
}

export function buildAutonomyPolicyInsights(
  decisions: AutonomyPolicyDecision[],
): AutonomyPolicyInsights {
  const reasonCounts = new Map<string, number>();
  const byActionMap = new Map<
    AutonomyActionType,
    { actionType: AutonomyActionType; allowedCount: number; suggestOnlyCount: number; blockedCount: number }
  >();

  for (const decision of decisions) {
    const row =
      byActionMap.get(decision.actionType) ??
      {
        actionType: decision.actionType,
        allowedCount: 0,
        suggestOnlyCount: 0,
        blockedCount: 0,
      };

    if (decision.decision === "allow") {
      row.allowedCount += 1;
    } else if (decision.decision === "suggest_only") {
      row.suggestOnlyCount += 1;
    } else {
      row.blockedCount += 1;
      for (const reason of decision.reasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
    }

    byActionMap.set(decision.actionType, row);
  }

  return {
    allowedCount: decisions.filter((decision) => decision.decision === "allow").length,
    suggestOnlyCount: decisions.filter((decision) => decision.decision === "suggest_only").length,
    blockedCount: decisions.filter((decision) => decision.decision === "block").length,
    topBlockReasons: [...reasonCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4),
    byAction: [...byActionMap.values()].sort((left, right) => {
      const leftTotal = left.allowedCount + left.suggestOnlyCount + left.blockedCount;
      const rightTotal = right.allowedCount + right.suggestOnlyCount + right.blockedCount;
      return rightTotal - leftTotal || left.actionType.localeCompare(right.actionType);
    }),
  };
}

function resolveTuningSettings(
  tuning: OperatorTuning | OperatorTuningSettings,
): OperatorTuningSettings {
  return "settings" in tuning ? tuning.settings : tuning;
}

export function buildAutonomyPolicyTuningSummary(
  tuning: OperatorTuning | OperatorTuningSettings,
): AutonomyPolicyTuningSummary {
  const settings = resolveTuningSettings(tuning);
  const allowed = [
    "Package autofill for high-confidence near-complete approval items",
    "Batch prep and queue routing for high-confidence low-risk candidates",
    "Low-risk reply staging with clear context and founder-voice guardrails",
  ];
  const suggestOnly = [
    "Medium-confidence package help and experiment variants",
    "Unsupported safe-post routes that must stay manual",
    "Ambiguous replies that still need operator judgement",
  ];
  const blocked = [
    "Low-confidence or conflicted autonomous actions",
    "Incomplete packages that are not safe to advance automatically",
    settings.safeModePosting === "enabled"
      ? "Unsupported platforms and experiment-linked items in strict safe mode"
      : "All strict safe-mode posting while the operator setting is disabled",
  ];

  return {
    allowed,
    suggestOnly,
    blocked,
  };
}
