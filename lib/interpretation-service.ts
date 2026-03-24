import { interpretSignal, toInterpretationInput } from "@/lib/interpreter";
import { getSavedScenarioAngleReuseDecision, type SavedScenarioAngleReuseDecision } from "@/lib/scenario-angle";
import type { SignalInterpretationResult, SignalRecord } from "@/types/signal";

export interface InterpretationStageInput {
  signal: SignalRecord;
  reuseSavedScenarioAngles: boolean;
}

export interface InterpretationStageResult {
  savedScenarioAngleDecision: SavedScenarioAngleReuseDecision;
  interpretationSignal: SignalRecord;
  interpretation: SignalInterpretationResult;
  interpretationUpdate: ReturnType<typeof buildInterpretationUpdate>;
}

export function applyScenarioAngleOverride(signal: SignalRecord, scenarioAngle: string | null): SignalRecord {
  return {
    ...signal,
    scenarioAngle,
  };
}

export function buildInterpretationUpdate(signal: SignalRecord) {
  const interpretation = interpretSignal(toInterpretationInput(signal));

  return {
    interpretation,
    update: {
      signalCategory: interpretation.signalCategory,
      severityScore: interpretation.severityScore,
      signalSubtype: interpretation.signalSubtype,
      emotionalPattern: interpretation.emotionalPattern,
      teacherPainPoint: interpretation.teacherPainPoint,
      relevanceToZazaDraft: interpretation.relevanceToZazaDraft,
      riskToTeacher: interpretation.riskToTeacher,
      interpretationNotes: interpretation.interpretationNotes,
      hookTemplateUsed: interpretation.hookTemplateUsed,
      contentAngle: interpretation.contentAngle,
      platformPriority: interpretation.platformPriority,
      suggestedFormatPriority: interpretation.suggestedFormatPriority,
      needsHumanReview: true,
      status: "Interpreted" as const,
    },
  };
}

export function runInterpretationStage(input: InterpretationStageInput): InterpretationStageResult {
  const savedScenarioAngleDecision = getSavedScenarioAngleReuseDecision({
    scenarioAngle: input.signal.scenarioAngle,
    sourceTitle: input.signal.sourceTitle,
    reuseAllowed: input.reuseSavedScenarioAngles,
  });
  const interpretationSignal = applyScenarioAngleOverride(
    input.signal,
    savedScenarioAngleDecision.reusableScenarioAngle,
  );
  const interpretationUpdate = buildInterpretationUpdate(interpretationSignal);

  return {
    savedScenarioAngleDecision,
    interpretationSignal,
    interpretation: interpretationUpdate.interpretation,
    interpretationUpdate,
  };
}
