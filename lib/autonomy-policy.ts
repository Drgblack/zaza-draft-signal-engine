import type { OperatorTuning, OperatorTuningSettings } from "@/lib/tuning-definitions";
import type { FounderOverrideState } from "@/lib/founder-overrides";
import { getAutonomyLearningAdjustmentSync } from "@/lib/learning-loop";

export const AUTONOMY_ACTION_TYPES = [
  "autofill_package",
  "auto_repair",
  "auto_stage_for_posting",
  "auto_progress_signal",
  "safe_post",
  "suggest_reply",
  "create_experiment_variant",
  "apply_macro",
  "auto_promote_to_approval_ready",
  "auto_route_to_queue_bucket",
  "auto_run_video_factory",
  "auto_regenerate_video_factory",
] as const;

export const AUTONOMY_POLICY_DECISIONS = ["allow", "suggest_only", "block"] as const;
export const AUTONOMY_RISK_LEVELS = ["low", "medium", "high"] as const;
export const AUTONOMY_CONTENT_TYPES = ["campaign", "reactive", "experimental"] as const;

export type AutonomyActionType = (typeof AUTONOMY_ACTION_TYPES)[number];
export type AutonomyPolicyDecisionType = (typeof AUTONOMY_POLICY_DECISIONS)[number];
export type AutonomyRiskLevel = (typeof AUTONOMY_RISK_LEVELS)[number];
export type AutonomyContentType = (typeof AUTONOMY_CONTENT_TYPES)[number];

export type AutonomyDecision = {
  allowAutoProceed: boolean;
  requireReview: boolean;
  reason: string;
  riskLevel: AutonomyRiskLevel;
};

export interface AutonomyPolicyDecision extends AutonomyDecision {
  actionType: AutonomyActionType;
  decision: AutonomyPolicyDecisionType;
  reasons: string[];
  policyLane?: string | null;
  relatedSignals?: string[];
  summary: string;
}

export interface AutonomyPolicyInput {
  actionType: AutonomyActionType;
  contentType?: AutonomyContentType | null;
  confidenceLevel?: "high" | "medium" | "low" | null;
  confidenceScore?: number | null;
  severityScore?: number | string | null;
  retryCount?: number | null;
  costEstimateUsd?: number | null;
  platformTarget?: string | null;
  lifecycleState?: string | null;
  missingCriticalMetadata?: boolean;
  riskLevel?: AutonomyRiskLevel | null;
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
  founderOverrides?: FounderOverrideState | null;
}

const AUTONOMY_AUTO_RETRY_REVIEW_THRESHOLD = 1;
const AUTONOMY_LOW_COST_THRESHOLD_USD = 5;

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
  baseDecision?: AutonomyDecision,
): AutonomyPolicyDecision {
  const finalReasons = reasons.length > 0 ? reasons : [`${input.actionType.replaceAll("_", " ")} stays ${decision.replaceAll("_", " ")}.`];
  const resolvedDecision =
    baseDecision ??
    ({
      allowAutoProceed: decision === "allow",
      requireReview: decision !== "allow",
      reason: finalReasons[0] ?? `${input.actionType.replaceAll("_", " ")} stays ${decision.replaceAll("_", " ")}.`,
      riskLevel: inferRiskLevel(input),
    } satisfies AutonomyDecision);

  return {
    allowAutoProceed: resolvedDecision.allowAutoProceed,
    requireReview: resolvedDecision.requireReview,
    reason: resolvedDecision.reason,
    riskLevel: resolvedDecision.riskLevel,
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
  if (input.contentType) {
    relatedSignals.push(`content:${input.contentType}`);
  }
  if (input.confidenceLevel) {
    relatedSignals.push(`confidence:${input.confidenceLevel}`);
  }
  if (typeof input.confidenceScore === "number" && Number.isFinite(input.confidenceScore)) {
    relatedSignals.push(`confidence_score:${Math.round(Math.max(0, Math.min(1, input.confidenceScore)) * 100)}`);
  }
  if (input.severityScore !== null && input.severityScore !== undefined && `${input.severityScore}`.trim()) {
    relatedSignals.push(`severity:${input.severityScore}`);
  }
  if (typeof input.retryCount === "number" && Number.isFinite(input.retryCount)) {
    relatedSignals.push(`retry:${input.retryCount}`);
  }
  if (typeof input.costEstimateUsd === "number" && Number.isFinite(input.costEstimateUsd)) {
    relatedSignals.push(`cost:${input.costEstimateUsd.toFixed(2)}`);
  }
  if (input.platformTarget) {
    relatedSignals.push(`platform:${input.platformTarget}`);
  }
  if (input.lifecycleState) {
    relatedSignals.push(`lifecycle:${input.lifecycleState}`);
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

function normalizeConfidenceScore(input: AutonomyPolicyInput) {
  if (typeof input.confidenceScore === "number" && Number.isFinite(input.confidenceScore)) {
    return Math.max(0, Math.min(1, input.confidenceScore));
  }

  if (input.confidenceLevel === "high") {
    return 0.85;
  }

  if (input.confidenceLevel === "medium") {
    return 0.6;
  }

  if (input.confidenceLevel === "low") {
    return 0.35;
  }

  return null;
}

function normalizeSeverityScore(value: AutonomyPolicyInput["severityScore"]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(3, Math.round(value)));
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (normalized === "high" || normalized === "urgent") {
      return 3;
    }

    if (normalized === "medium" || normalized === "moderate") {
      return 2;
    }

    if (normalized === "low") {
      return 1;
    }

    const parsed = Number.parseInt(normalized, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(3, parsed));
    }
  }

  return null;
}

function inferRiskLevel(input: AutonomyPolicyInput): AutonomyRiskLevel {
  const severityScore = normalizeSeverityScore(input.severityScore);
  const confidenceScore = normalizeConfidenceScore(input);
  const retryCount = input.retryCount ?? 0;
  const costEstimateUsd = input.costEstimateUsd ?? 0;
  let riskLevel: AutonomyRiskLevel = input.riskLevel ?? "low";

  if (
    input.contentType === "experimental" ||
    input.ambiguityRisk === "high" ||
    input.hasUnresolvedConflicts ||
    severityScore === 3
  ) {
    riskLevel = "high";
  } else if (
    input.ambiguityRisk === "medium" ||
    input.experimentLinked ||
    severityScore === 2 ||
    retryCount > 0 ||
    costEstimateUsd > AUTONOMY_LOW_COST_THRESHOLD_USD ||
    (typeof confidenceScore === "number" && confidenceScore < 0.7)
  ) {
    riskLevel = "medium";
  }

  const learningAdjustment = getAutonomyLearningAdjustmentSync({
    actionType: input.actionType,
    contentType: input.contentType ?? null,
    platformTarget: input.platformTarget ?? null,
    inputType:
      input.actionType === "auto_run_video_factory" ||
      input.actionType === "auto_regenerate_video_factory"
        ? "video_factory"
        : "signal",
  });
  if (learningAdjustment.increaseRisk) {
    riskLevel =
      riskLevel === "low"
        ? "medium"
        : riskLevel === "medium"
          ? "high"
          : "high";
  }

  return riskLevel;
}

function evaluateCoreAutonomyDecision(input: AutonomyPolicyInput): AutonomyDecision {
  const riskLevel = inferRiskLevel(input);
  const severityScore = normalizeSeverityScore(input.severityScore);
  const retryCount = input.retryCount ?? 0;
  const costEstimateUsd = input.costEstimateUsd ?? null;
  const missingCriticalMetadata = Boolean(input.missingCriticalMetadata);

  if (missingCriticalMetadata) {
    return {
      allowAutoProceed: false,
      requireReview: true,
      reason: "Missing critical metadata keeps this action in operator review.",
      riskLevel: riskLevel === "low" ? "medium" : riskLevel,
    };
  }

  if (input.contentType === "experimental") {
    return {
      allowAutoProceed: false,
      requireReview: true,
      reason: "Experimental content requires explicit operator review before autonomous execution.",
      riskLevel: "high",
    };
  }

  if (riskLevel === "high" || severityScore === 3) {
    return {
      allowAutoProceed: false,
      requireReview: true,
      reason: "High-risk or high-severity work requires explicit operator review.",
      riskLevel: "high",
    };
  }

  if (retryCount > AUTONOMY_AUTO_RETRY_REVIEW_THRESHOLD) {
    return {
      allowAutoProceed: false,
      requireReview: true,
      reason: "Retry count is beyond the autonomous threshold and now requires operator review.",
      riskLevel: riskLevel === "low" ? "medium" : riskLevel,
    };
  }

  if (
    riskLevel === "low" &&
    retryCount === 0 &&
    (costEstimateUsd === null || costEstimateUsd <= AUTONOMY_LOW_COST_THRESHOLD_USD)
  ) {
    return {
      allowAutoProceed: true,
      requireReview: false,
      reason: "Low-cost low-risk first attempt is safe to proceed automatically.",
      riskLevel: "low",
    };
  }

  return {
    allowAutoProceed: false,
    requireReview: true,
    reason: "This action is not clearly low-risk enough to skip operator review.",
    riskLevel,
  };
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
  const coreDecision = evaluateCoreAutonomyDecision(input);

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
      if (input.founderOverrides?.experimentDirection === "reduce") {
        pushReason(reasons, "Founder override is temporarily reducing experiment load.");
        return finalizeDecision(input, "suggest_only", reasons, "experiment_learning", relatedSignals);
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
    case "auto_progress_signal":
    case "auto_repair":
    case "auto_promote_to_approval_ready":
    case "auto_run_video_factory":
    case "auto_regenerate_video_factory":
    case "apply_macro": {
      if (coreDecision.requireReview) {
        pushReason(reasons, coreDecision.reason);
        return finalizeDecision(
          input,
          coreDecision.riskLevel === "high" ? "block" : "suggest_only",
          reasons,
          "operator_guarded",
          relatedSignals,
          coreDecision,
        );
      }
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
        return finalizeDecision(input, "block", reasons, "operator_guarded", relatedSignals, {
          allowAutoProceed: false,
          requireReview: true,
          reason: reasons[0] ?? coreDecision.reason,
          riskLevel: coreDecision.riskLevel,
        });
      }
      if (isMedium(input)) {
        pushReason(reasons, "Medium confidence keeps this action in suggest-only mode.");
        return finalizeDecision(input, "suggest_only", reasons, "operator_guarded", relatedSignals, {
          allowAutoProceed: false,
          requireReview: true,
          reason: reasons[0] ?? coreDecision.reason,
          riskLevel: coreDecision.riskLevel === "low" ? "medium" : coreDecision.riskLevel,
        });
      }
      pushReason(reasons, coreDecision.reason);
      return finalizeDecision(input, "allow", reasons, "operator_guarded", relatedSignals, coreDecision);
    }

    default: {
      if (coreDecision.requireReview) {
        pushReason(reasons, coreDecision.reason);
        return finalizeDecision(
          input,
          coreDecision.riskLevel === "high" ? "block" : "suggest_only",
          reasons,
          "operator_guarded",
          relatedSignals,
          coreDecision,
        );
      }
      if (isLow(input)) {
        pushReason(reasons, "Low confidence keeps this action blocked.");
        return finalizeDecision(input, "block", reasons, "operator_guarded", relatedSignals, {
          allowAutoProceed: false,
          requireReview: true,
          reason: reasons[0] ?? coreDecision.reason,
          riskLevel: coreDecision.riskLevel,
        });
      }
      if (isMedium(input)) {
        pushReason(reasons, "Medium confidence keeps this action suggest-only.");
        return finalizeDecision(input, "suggest_only", reasons, "operator_guarded", relatedSignals, {
          allowAutoProceed: false,
          requireReview: true,
          reason: reasons[0] ?? coreDecision.reason,
          riskLevel: coreDecision.riskLevel === "low" ? "medium" : coreDecision.riskLevel,
        });
      }
      pushReason(reasons, coreDecision.reason);
      return finalizeDecision(input, "allow", reasons, "operator_guarded", relatedSignals, coreDecision);
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
