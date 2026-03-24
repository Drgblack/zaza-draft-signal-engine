import { assessAutoRepairPlan } from "@/lib/auto-repair";
import type { AutoAdvanceAssessment } from "@/lib/auto-advance";
import type { UnifiedGuidance } from "@/lib/guidance";
import type { SignalRecord } from "@/types/signal";

export interface RepairStageInput {
  signal: SignalRecord;
  guidance: UnifiedGuidance;
  assessment: AutoAdvanceAssessment;
}

export interface RepairStageResult {
  stage: AutoAdvanceAssessment["stage"];
  repairPlan: ReturnType<typeof assessAutoRepairPlan>;
  shouldAttempt: boolean;
}

export function prepareRepairStage(input: RepairStageInput): RepairStageResult {
  const repairPlan = assessAutoRepairPlan(input.signal, input.guidance, input.assessment);

  return {
    stage: input.assessment.stage,
    repairPlan,
    shouldAttempt: Boolean(
      input.assessment.decision === "hold" &&
        input.assessment.stage &&
        repairPlan.eligibility === "repairable" &&
        repairPlan.repairType,
    ),
  };
}
