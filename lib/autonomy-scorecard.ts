import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { AuditEvent } from "@/lib/audit";
import type { WeeklyExecutionFlow } from "@/lib/weekly-execution";

export interface AutonomyScorecardRow {
  label: string;
  count: number;
}

export interface AutonomyScorecardSummary {
  generatedAt: string;
  totalCandidates: number;
  autoAdvancedCount: number;
  autoRepairedCount: number;
  autoHealedCount: number;
  stagedWithoutManualEdit: number;
  approvalReadyWithoutChanges: number;
  operatorInterventionsRequired: number;
  blockedByPolicyCount: number;
  blockedByConflictCount: number;
  blockedByMissingData: number;
  autonomyRate: number;
  partialAutonomyRate: number;
  blockedRate: number;
  topBlockers: AutonomyScorecardRow[];
  operatorEffortAreas: AutonomyScorecardRow[];
  summaries: string[];
}

function normalize(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalize(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function toRows(counts: Map<string, number>, limit = 3): AutonomyScorecardRow[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function buildCurrentWeekStagedIds(
  auditEvents: AuditEvent[],
  weekStartDate: string | null,
): Set<string> {
  const ids = new Set<string>();

  for (const event of auditEvents) {
    if (event.eventType !== "WEEKLY_EXECUTION_ITEM_STAGED") {
      continue;
    }

    if (
      weekStartDate &&
      event.metadata?.weekStartDate &&
      String(event.metadata.weekStartDate) !== weekStartDate
    ) {
      continue;
    }

    ids.add(event.signalId);
  }

  return ids;
}

export function buildAutonomyScorecard(input: {
  approvalCandidates: ApprovalQueueCandidate[];
  executionFlow?: WeeklyExecutionFlow | null;
  auditEvents?: AuditEvent[];
  now?: Date;
}): AutonomyScorecardSummary {
  const now = input.now ?? new Date();
  const totalCandidates = input.approvalCandidates.length;
  const executionItems = input.executionFlow?.executionItems ?? [];
  const stagedByExecutionAudit = buildCurrentWeekStagedIds(
    input.auditEvents ?? [],
    input.executionFlow?.weekStartDate ?? null,
  );

  const autoRepairedIds = new Set(
    input.approvalCandidates
      .filter((candidate) => candidate.preReviewRepair.decision === "applied")
      .map((candidate) => candidate.signal.recordId),
  );
  const autoHealedIds = new Set(
    input.approvalCandidates
      .filter(
        (candidate) => candidate.preReviewRepair.ctaDestinationHealing.decision === "applied",
      )
      .map((candidate) => candidate.signal.recordId),
  );
  const approvalReadyWithoutChangesIds = new Set(
    input.approvalCandidates
      .filter(
        (candidate) =>
          candidate.triage.triageState === "approve_ready" &&
          candidate.packageAutofill.mode !== "applied" &&
          candidate.preReviewRepair.decision !== "applied",
      )
      .map((candidate) => candidate.signal.recordId),
  );
  const autoAdvancedIds = new Set(
    input.approvalCandidates
      .filter(
        (candidate) =>
          candidate.triage.triageState === "approve_ready" &&
          (candidate.packageAutofill.mode === "applied" ||
            candidate.preReviewRepair.decision === "applied" ||
            stagedByExecutionAudit.has(candidate.signal.recordId)),
      )
      .map((candidate) => candidate.signal.recordId),
  );
  const stagedWithoutManualEditIds = new Set(
    executionItems
      .filter((item) => item.status === "staged_for_posting" && stagedByExecutionAudit.has(item.signalId))
      .map((item) => item.signalId),
  );
  const missingDataIds = new Set(
    input.approvalCandidates
      .filter((candidate) => candidate.completeness.completenessState === "incomplete")
      .map((candidate) => candidate.signal.recordId),
  );
  const conflictIds = new Set(
    input.approvalCandidates
      .filter((candidate) => candidate.conflicts.conflicts.length > 0)
      .map((candidate) => candidate.signal.recordId),
  );
  const blockedByPolicyIds = new Set(
    input.approvalCandidates
      .filter(
        (candidate) =>
          candidate.packageAutofill.policy.decision === "block" ||
          candidate.preReviewRepair.policy.decision === "block" ||
          executionItems.some(
            (item) => item.signalId === candidate.signal.recordId && item.status === "blocked",
          ),
      )
      .map((candidate) => candidate.signal.recordId),
  );
  const operatorInterventionIds = new Set(
    input.approvalCandidates
      .filter(
        (candidate) =>
          candidate.triage.triageState === "repairable" ||
          candidate.triage.triageState === "needs_judgement" ||
          executionItems.some(
            (item) =>
              item.signalId === candidate.signal.recordId &&
              (item.status === "ready_to_review" || item.status === "blocked"),
          ),
      )
      .map((candidate) => candidate.signal.recordId),
  );
  const fullyAutonomousIds = new Set([
    ...approvalReadyWithoutChangesIds,
    ...stagedWithoutManualEditIds,
  ]);
  const partialAutonomyIds = new Set([
    ...autoAdvancedIds,
    ...autoRepairedIds,
    ...autoHealedIds,
  ]);
  const blockedIds = new Set([
    ...blockedByPolicyIds,
    ...conflictIds,
    ...missingDataIds,
  ]);

  const blockerCounts = new Map<string, number>();
  const effortCounts = new Map<string, number>();

  for (const candidate of input.approvalCandidates) {
    if (candidate.conflicts.conflicts.length > 0) {
      blockerCounts.set(
        "Unresolved conflicts",
        (blockerCounts.get("Unresolved conflicts") ?? 0) + 1,
      );
    }
    if (candidate.completeness.completenessState === "incomplete") {
      blockerCounts.set(
        "Missing package data",
        (blockerCounts.get("Missing package data") ?? 0) + 1,
      );
    }
    if (candidate.packageAutofill.policy.decision === "block") {
      const label = candidate.packageAutofill.policy.reasons[0] ?? "Policy blocked autofill";
      blockerCounts.set(label, (blockerCounts.get(label) ?? 0) + 1);
    }
    if (candidate.preReviewRepair.policy.decision === "block") {
      const label = candidate.preReviewRepair.policy.reasons[0] ?? "Policy blocked pre-review repair";
      blockerCounts.set(label, (blockerCounts.get(label) ?? 0) + 1);
    }
  }

  for (const item of executionItems) {
    if (item.status === "blocked") {
      blockerCounts.set(
        item.blockReasons[0] ?? "Blocked by weekly execution policy",
        (blockerCounts.get(item.blockReasons[0] ?? "Blocked by weekly execution policy") ?? 0) + 1,
      );
    }
  }

  effortCounts.set(
    "Judgement-first review",
    input.approvalCandidates.filter((candidate) => candidate.triage.triageState === "needs_judgement").length,
  );
  effortCounts.set(
    "Repairable package cleanup",
    input.approvalCandidates.filter((candidate) => candidate.triage.triageState === "repairable").length,
  );
  effortCounts.set(
    "Review before staging",
    executionItems.filter((item) => item.status === "ready_to_review").length,
  );
  effortCounts.set(
    "Blocked execution items",
    executionItems.filter((item) => item.status === "blocked").length,
  );

  const summaries: string[] = [];
  uniquePush(
    summaries,
    fullyAutonomousIds.size > 0
      ? `${fullyAutonomousIds.size} candidate${fullyAutonomousIds.size === 1 ? "" : "s"} moved through the current workflow without extra manual cleanup.`
      : "No candidate is currently reaching the workflow without manual cleanup.",
  );
  if (blockedByPolicyIds.size > 0) {
    uniquePush(
      summaries,
      `Policy blocked ${blockedByPolicyIds.size} candidate${blockedByPolicyIds.size === 1 ? "" : "s"} from advancing automatically.`,
    );
  }
  const repairableCount = input.approvalCandidates.filter(
    (candidate) => candidate.triage.triageState === "repairable",
  ).length;
  if (repairableCount > 0) {
    uniquePush(
      summaries,
      `Repair resolved ${Math.round((autoRepairedIds.size / repairableCount) * 100)}% of repairable candidates in the current queue snapshot.`,
    );
  }
  if (autoHealedIds.size > 0) {
    uniquePush(
      summaries,
      `${autoHealedIds.size} CTA/destination pair${autoHealedIds.size === 1 ? "" : "s"} were self-healed before review.`,
    );
  }
  if (operatorInterventionIds.size > 0) {
    uniquePush(
      summaries,
      `${operatorInterventionIds.size} candidate${operatorInterventionIds.size === 1 ? "" : "s"} still concentrate operator effort in review, repair, or policy-unblocking work.`,
    );
  }

  return {
    generatedAt: now.toISOString(),
    totalCandidates,
    autoAdvancedCount: autoAdvancedIds.size,
    autoRepairedCount: autoRepairedIds.size,
    autoHealedCount: autoHealedIds.size,
    stagedWithoutManualEdit: stagedWithoutManualEditIds.size,
    approvalReadyWithoutChanges: approvalReadyWithoutChangesIds.size,
    operatorInterventionsRequired: operatorInterventionIds.size,
    blockedByPolicyCount: blockedByPolicyIds.size,
    blockedByConflictCount: conflictIds.size,
    blockedByMissingData: missingDataIds.size,
    autonomyRate: totalCandidates === 0 ? 0 : fullyAutonomousIds.size / totalCandidates,
    partialAutonomyRate: totalCandidates === 0 ? 0 : partialAutonomyIds.size / totalCandidates,
    blockedRate: totalCandidates === 0 ? 0 : blockedIds.size / totalCandidates,
    topBlockers: toRows(blockerCounts, 3),
    operatorEffortAreas: toRows(effortCounts, 3).filter((row) => row.count > 0),
    summaries: summaries.slice(0, 4),
  };
}
