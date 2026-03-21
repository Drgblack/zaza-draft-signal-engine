import type { AutonomyPolicyDecision } from "@/lib/autonomy-policy";
import { appendAuditEventsSafe } from "@/lib/audit";
import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { PostingPlatform } from "@/lib/posting-memory";

export const EXECUTION_CHAIN_TYPES = [
  "repair_chain",
  "completion_chain",
  "promotion_chain",
] as const;

export const EXECUTION_CHAIN_STEP_KEYS = [
  "autofill_package",
  "repair_package",
  "refresh_package",
  "re_evaluate_readiness",
  "stage_for_posting",
] as const;

export type ExecutionChainType = (typeof EXECUTION_CHAIN_TYPES)[number];
export type ExecutionChainStepKey = (typeof EXECUTION_CHAIN_STEP_KEYS)[number];

export interface ExecutionChainStep {
  key: ExecutionChainStepKey;
  label: string;
  status: "completed" | "pending" | "blocked" | "skipped";
  detail: string;
}

export interface ExecutionChainAssessment {
  chainType: ExecutionChainType | null;
  eligible: boolean;
  status: "completed" | "available" | "blocked" | "not_applicable";
  steps: ExecutionChainStep[];
  triggerConditions: string[];
  stopConditions: string[];
  blockReasons: string[];
  summary: string;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function formatChainLabels(steps: ExecutionChainStep[]) {
  return steps
    .filter((step) => step.status === "completed" || step.status === "pending")
    .map((step) => step.label.toLowerCase())
    .join(" -> ");
}

function buildBaseStopConditions() {
  return [
    "Abort if unresolved conflicts appear.",
    "Abort if the package still is not complete after repair.",
    "Abort if autonomy policy blocks the next step.",
  ];
}

export function assessExecutionChain(input: {
  candidate: Pick<
    ApprovalQueueCandidate,
    | "signal"
    | "packageAutofill"
    | "preReviewRepair"
    | "automationConfidence"
    | "conflicts"
    | "completeness"
    | "triage"
    | "commercialRisk"
    | "distributionPriority"
  >;
  experimentLinked?: boolean;
  includeStage?: boolean;
  stagePolicy?: Pick<AutonomyPolicyDecision, "decision" | "summary" | "reasons"> | null;
  stageExecuted?: boolean;
}): ExecutionChainAssessment {
  const triggerConditions: string[] = [];
  const steps: ExecutionChainStep[] = [];
  const blockReasons: string[] = [];
  const stopConditions = buildBaseStopConditions();

  if (input.candidate.automationConfidence.level !== "high") {
    return {
      chainType: null,
      eligible: false,
      status: "not_applicable",
      steps: [],
      triggerConditions: [],
      stopConditions,
      blockReasons: ["Execution chains only run for high-confidence items."],
      summary: "No execution chain ran because automation confidence is not high.",
    };
  }

  uniquePush(triggerConditions, "High automation confidence");

  if (input.candidate.conflicts.conflicts.length > 0) {
    return {
      chainType: null,
      eligible: false,
      status: "blocked",
      steps: [],
      triggerConditions,
      stopConditions,
      blockReasons: ["Execution chains stop when unresolved conflicts exist."],
      summary: "Execution chain blocked by unresolved conflicts.",
    };
  }

  uniquePush(triggerConditions, "No unresolved conflicts");

  if (input.candidate.commercialRisk.decision === "block") {
    return {
      chainType: null,
      eligible: false,
      status: "blocked",
      steps: [],
      triggerConditions,
      stopConditions,
      blockReasons: [input.candidate.commercialRisk.summary],
      summary: "Execution chain blocked by commercial risk guardrails.",
    };
  }

  if (input.experimentLinked) {
    return {
      chainType: null,
      eligible: false,
      status: "blocked",
      steps: [],
      triggerConditions,
      stopConditions,
      blockReasons: ["Execution chains do not run on experiment-linked candidates."],
      summary: "Execution chain blocked because this candidate is linked to an active experiment.",
    };
  }

  uniquePush(triggerConditions, "No experiment lock");
  uniquePush(
    triggerConditions,
    `${input.candidate.distributionPriority.primaryPlatformLabel} is the lead distribution route.`,
  );

  if (input.candidate.packageAutofill.mode === "applied") {
    steps.push({
      key: "autofill_package",
      label: "Autofill",
      status: "completed",
      detail:
        input.candidate.packageAutofill.notes[0]?.label ??
        "Approval autopilot filled missing package fields.",
    });
  }

  if (input.candidate.preReviewRepair.decision === "applied") {
    steps.push({
      key: "repair_package",
      label: "Repair",
      status: "completed",
      detail:
        input.candidate.preReviewRepair.repairs[0]?.reason ??
        input.candidate.preReviewRepair.summary,
    });
    steps.push({
      key: "refresh_package",
      label: "Refresh package",
      status: "completed",
      detail: "Publish-prep and final review inputs were refreshed from the repaired package.",
    });
  }

  if (steps.length === 0) {
    return {
      chainType: null,
      eligible: false,
      status: "not_applicable",
      steps: [],
      triggerConditions,
      stopConditions,
      blockReasons: [],
      summary: "No safe multi-step chain ran because no bounded upstream automation step fired.",
    };
  }

  steps.push({
    key: "re_evaluate_readiness",
    label: "Re-evaluate",
    status: "completed",
    detail: `Package re-evaluated as ${input.candidate.completeness.completenessState.replaceAll("_", " ")} and ${input.candidate.triage.triageState.replaceAll("_", " ")}.`,
  });

  const stageReady =
    input.includeStage &&
    input.candidate.completeness.completenessState === "complete" &&
    input.candidate.triage.triageState !== "needs_judgement" &&
    input.candidate.triage.triageState !== "suppress";

  if (input.includeStage) {
    if (input.stageExecuted) {
      steps.push({
        key: "stage_for_posting",
        label: "Stage",
        status: "completed",
        detail: "Posting assistant package was staged automatically after the bounded repair path cleared.",
      });
    } else if (
      stageReady &&
      input.stagePolicy?.decision === "allow"
    ) {
      steps.push({
        key: "stage_for_posting",
        label: "Stage",
        status: "pending",
        detail: input.stagePolicy.summary,
      });
    } else if (input.stagePolicy?.decision === "block") {
      uniquePush(blockReasons, input.stagePolicy.reasons[0] ?? input.stagePolicy.summary);
      steps.push({
        key: "stage_for_posting",
        label: "Stage",
        status: "blocked",
        detail: input.stagePolicy.summary,
      });
    }
  }

  const chainType: ExecutionChainType =
    input.includeStage ? "promotion_chain" : input.candidate.preReviewRepair.decision === "applied" ? "repair_chain" : "completion_chain";

  if (input.includeStage && input.stageExecuted) {
    return {
      chainType,
      eligible: true,
      status: "completed",
      steps,
      triggerConditions,
      stopConditions,
      blockReasons: [],
      summary: `Auto-executed chain: ${formatChainLabels(steps)}.`,
    };
  }

  if (input.includeStage && blockReasons.length > 0) {
    return {
      chainType,
      eligible: false,
      status: "blocked",
      steps,
      triggerConditions,
      stopConditions,
      blockReasons,
      summary: `Execution chain aborted before stage: ${blockReasons[0]}.`,
    };
  }

  if (input.includeStage && stageReady && input.stagePolicy?.decision === "allow") {
    return {
      chainType,
      eligible: true,
      status: "available",
      steps,
      triggerConditions,
      stopConditions,
      blockReasons: [],
      summary: `Chain ready: ${formatChainLabels(steps)}.`,
    };
  }

  return {
    chainType,
    eligible: true,
    status: "completed",
    steps,
    triggerConditions,
    stopConditions,
    blockReasons,
    summary: `Auto-executed chain: ${formatChainLabels(steps)}.`,
  };
}

export async function executePromotionExecutionChain(input: {
  candidate: ApprovalQueueCandidate;
  weekStartDate: string;
  platform: PostingPlatform;
  platformLabel: string;
  sourceTitle: string;
  experimentLinked?: boolean;
  stagePolicy: Pick<AutonomyPolicyDecision, "decision" | "summary" | "reasons">;
  stage: () => Promise<{ packageId: string; packageData?: unknown }>;
}) {
  const initialAssessment = assessExecutionChain({
    candidate: input.candidate,
    experimentLinked: input.experimentLinked,
    includeStage: true,
    stagePolicy: input.stagePolicy,
    stageExecuted: false,
  });

  if (initialAssessment.status === "blocked" || initialAssessment.status === "not_applicable") {
    await appendAuditEventsSafe([
      {
        signalId: input.candidate.signal.recordId,
        eventType: "EXECUTION_CHAIN_ABORTED",
        actor: "system",
        summary: initialAssessment.summary,
        metadata: {
          chainType: initialAssessment.chainType,
          weekStartDate: input.weekStartDate,
          platform: input.platform,
          reason: initialAssessment.blockReasons[0] ?? null,
        },
      },
    ]);

    return {
      executed: false,
      assessment: initialAssessment,
      packageId: null,
      packageData: null,
    };
  }

  await appendAuditEventsSafe([
    {
      signalId: input.candidate.signal.recordId,
      eventType: "EXECUTION_CHAIN_STARTED",
      actor: "system",
      summary: `Started ${initialAssessment.chainType?.replaceAll("_", " ") ?? "execution chain"} for ${input.sourceTitle}.`,
      metadata: {
        chainType: initialAssessment.chainType,
        weekStartDate: input.weekStartDate,
        platform: input.platform,
      },
    },
  ]);

  try {
    const stageResult = await input.stage();
    const completedAssessment = assessExecutionChain({
      candidate: input.candidate,
      includeStage: true,
      stagePolicy: input.stagePolicy,
      stageExecuted: true,
    });

    await appendAuditEventsSafe([
      {
        signalId: input.candidate.signal.recordId,
        eventType: "EXECUTION_CHAIN_COMPLETED",
        actor: "system",
        summary: `${completedAssessment.summary} ${input.platformLabel} package is now staged.`,
        metadata: {
          chainType: completedAssessment.chainType,
          packageId: stageResult.packageId,
          weekStartDate: input.weekStartDate,
          platform: input.platform,
        },
      },
    ]);

    return {
      executed: true,
      assessment: completedAssessment,
      packageId: stageResult.packageId,
      packageData: stageResult.packageData ?? null,
    };
  } catch (error) {
    await appendAuditEventsSafe([
      {
        signalId: input.candidate.signal.recordId,
        eventType: "EXECUTION_CHAIN_ABORTED",
        actor: "system",
        summary: `Execution chain aborted for ${input.sourceTitle}.`,
        metadata: {
          chainType: initialAssessment.chainType,
          weekStartDate: input.weekStartDate,
          platform: input.platform,
          reason: error instanceof Error ? error.message : "Unknown staging failure",
        },
      },
    ]);

    throw error;
  }
}
