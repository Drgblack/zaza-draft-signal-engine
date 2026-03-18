import type { SignalScoringResult } from "@/types/signal";

export type PipelineGateAction = "reject" | "review" | "interpret" | "generate";

export interface PipelineGateDecision {
  action: PipelineGateAction;
  shouldInterpret: boolean;
  shouldGenerate: boolean;
  summary: string;
}

function isGenerationPriority(priority: SignalScoringResult["reviewPriority"]): boolean {
  return priority === "High" || priority === "Urgent";
}

export function getPipelineGateDecision(scoring: Pick<
  SignalScoringResult,
  "keepRejectRecommendation" | "qualityGateResult" | "reviewPriority"
>): PipelineGateDecision {
  if (scoring.keepRejectRecommendation === "Reject" || scoring.qualityGateResult === "Fail") {
    return {
      action: "reject",
      shouldInterpret: false,
      shouldGenerate: false,
      summary: `Stopped after scoring because the record was marked ${scoring.keepRejectRecommendation} with a ${scoring.qualityGateResult} quality gate.`,
    };
  }

  if (scoring.keepRejectRecommendation === "Review" || scoring.qualityGateResult === "Needs Review") {
    return {
      action: "review",
      shouldInterpret: false,
      shouldGenerate: false,
      summary: `Held for operator review because the signal scored ${scoring.keepRejectRecommendation} and ${scoring.qualityGateResult}.`,
    };
  }

  if (
    scoring.keepRejectRecommendation === "Keep" &&
    scoring.qualityGateResult === "Pass" &&
    isGenerationPriority(scoring.reviewPriority)
  ) {
    return {
      action: "generate",
      shouldInterpret: true,
      shouldGenerate: true,
      summary: `Advanced through interpretation and generation because the signal scored Keep + Pass with ${scoring.reviewPriority.toLowerCase()} priority.`,
    };
  }

  if (scoring.keepRejectRecommendation === "Keep" && scoring.qualityGateResult === "Pass") {
    return {
      action: "interpret",
      shouldInterpret: true,
      shouldGenerate: false,
      summary: "Advanced to interpretation because the signal scored Keep + Pass.",
    };
  }

  return {
    action: "review",
    shouldInterpret: false,
    shouldGenerate: false,
    summary: "Held for operator review because the pipeline could not place the scoring result on a stronger path.",
  };
}
