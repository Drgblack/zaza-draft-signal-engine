import { getPipelineGateDecision, type PipelineGateDecision } from "@/lib/pipeline-rules";
import { scoreSignal } from "@/lib/scoring";
import type { OperatorTuningSettings } from "@/lib/tuning";
import type { SignalRecord, SignalScoringResult } from "@/types/signal";

export interface ScoringStageInput {
  signal: SignalRecord;
  allSignals: SignalRecord[];
  tuningSettings?: OperatorTuningSettings;
}

export interface ScoringStageResult {
  scoring: SignalScoringResult;
  scoringUpdate: ReturnType<typeof buildScoringUpdate>;
  decision: PipelineGateDecision;
}

export function buildScoringUpdate(scoring: SignalScoringResult) {
  return {
    signalRelevanceScore: scoring.signalRelevanceScore,
    signalNoveltyScore: scoring.signalNoveltyScore,
    signalUrgencyScore: scoring.signalUrgencyScore,
    brandFitScore: scoring.brandFitScore,
    sourceTrustScore: scoring.sourceTrustScore,
    keepRejectRecommendation: scoring.keepRejectRecommendation,
    whySelected: scoring.whySelected,
    whyRejected: scoring.whyRejected,
    needsHumanReview: scoring.needsHumanReview,
    qualityGateResult: scoring.qualityGateResult,
    reviewPriority: scoring.reviewPriority,
    similarityToExistingContent: scoring.similarityToExistingContent,
    duplicateClusterId: scoring.duplicateClusterId,
  } as const;
}

export function runScoringStage(input: ScoringStageInput): ScoringStageResult {
  const scoring = scoreSignal(input.signal, input.allSignals, input.tuningSettings);

  return {
    scoring,
    scoringUpdate: buildScoringUpdate(scoring),
    decision: getPipelineGateDecision(scoring),
  };
}
