import type { AutoAdvanceAssessment } from "@/lib/auto-advance";
import { getSignalContentContextSummary, type CampaignStrategy } from "@/lib/campaigns";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { UnifiedGuidance } from "@/lib/guidance";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import { getStrategicValueLabel, type StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { SignalRecord } from "@/types/signal";

export interface CandidateHypothesis {
  objective: string;
  whyItMayWork: string;
  keyLevers: string[];
  riskNote: string | null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function getPrimaryPlatform(signal: SignalRecord): "x" | "linkedin" | "reddit" {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }

  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "x";
}

function deriveObjective(signal: SignalRecord): string {
  if (signal.ctaGoal === "Sign up") {
    return "drive signups";
  }

  if (signal.ctaGoal === "Try product") {
    return "drive trials";
  }

  if (signal.ctaGoal === "Visit site") {
    return "drive site visits";
  }

  if (signal.ctaGoal === "Share / engage") {
    return "invite response";
  }

  if (signal.funnelStage === "Trust") {
    return "build trust";
  }

  if (signal.funnelStage === "Conversion") {
    return "drive conversion";
  }

  if (signal.funnelStage === "Consideration") {
    return "move readers into consideration";
  }

  if (signal.funnelStage === "Retention") {
    return "support retention";
  }

  if (signal.editorialMode === "professional_guidance" || signal.editorialMode === "calm_insight") {
    return "build trust";
  }

  if (signal.editorialMode === "thought_leadership") {
    return "shape positioning";
  }

  if (signal.editorialMode === "helpful_tip") {
    return "give one practical takeaway";
  }

  if (signal.editorialMode === "risk_warning" || signal.editorialMode === "this_could_happen_to_you") {
    return "surface professional risk";
  }

  return "test a teacher-facing angle";
}

export function buildCandidateHypothesis(input: {
  signal: SignalRecord;
  guidance: UnifiedGuidance;
  assessment?: AutoAdvanceAssessment | null;
  strategy?: CampaignStrategy;
  weeklyBoosts?: string[];
  weeklyCautions?: string[];
}): CandidateHypothesis {
  const objective = deriveObjective(input.signal);
  const whyParts: string[] = [];
  const keyLevers: string[] = [];
  const strategicContext = input.strategy ? getSignalContentContextSummary(input.signal, input.strategy) : null;
  const primaryPlatform = getPrimaryPlatform(input.signal);
  const modeLabel = input.signal.editorialMode ? getEditorialModeDefinition(input.signal.editorialMode).label : null;

  if (input.signal.scenarioAngle || input.signal.teacherPainPoint || input.signal.riskToTeacher) {
    uniquePush(whyParts, "clear teacher tension");
    uniquePush(keyLevers, "strong framing");
  }

  if (modeLabel) {
    uniquePush(whyParts, `${modeLabel.toLowerCase()} mode`);
    uniquePush(keyLevers, `${modeLabel} mode`);
  }

  uniquePush(whyParts, `${getPostingPlatformLabel(primaryPlatform)} fit`);
  uniquePush(keyLevers, `${getPostingPlatformLabel(primaryPlatform)} platform fit`);

  if (input.guidance.relatedPatterns[0]) {
    uniquePush(whyParts, "saved pattern support");
    uniquePush(keyLevers, "pattern support");
  }

  if (input.guidance.relatedBundles[0]) {
    uniquePush(keyLevers, "bundle support");
  }

  if (input.guidance.relatedPlaybookCards[0]) {
    uniquePush(keyLevers, "playbook support");
  }

  if (input.guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "positive")) {
    uniquePush(whyParts, "positive reuse memory");
    uniquePush(keyLevers, "positive reuse memory");
  }

  if (strategicContext?.campaignName) {
    uniquePush(whyParts, "campaign alignment");
    uniquePush(keyLevers, "campaign alignment");
  } else if (strategicContext?.pillarName || strategicContext?.funnelStage) {
    uniquePush(keyLevers, "strategic alignment");
  }

  if ((input.weeklyBoosts?.length ?? 0) > 0) {
    uniquePush(keyLevers, "weekly plan alignment");
  }

  if (input.assessment?.draftQuality?.label === "Strong") {
    uniquePush(whyParts, "strong draft quality");
    uniquePush(keyLevers, "strong draft quality");
  }

  const whyItMayWork =
    whyParts.length > 0
      ? whyParts.slice(0, 3).join(" + ")
      : `${objective} with a readable platform fit`;

  let riskNote: string | null = null;
  if (input.guidance.confidence.confidenceLevel === "low") {
    riskNote = "Confidence is still low.";
  } else if (input.weeklyCautions?.[0]) {
    riskNote = input.weeklyCautions[0];
  } else if (input.guidance.cautionNotes[0]) {
    riskNote = input.guidance.cautionNotes[0];
  }

  return {
    objective,
    whyItMayWork,
    keyLevers: keyLevers.slice(0, 4),
    riskNote,
  };
}

export function compareHypothesisToStrategicOutcome(
  hypothesis: CandidateHypothesis,
  outcome: StrategicOutcome | null | undefined,
): string | null {
  if (!outcome) {
    return null;
  }

  const valueLabel = getStrategicValueLabel(outcome.strategicValue);
  if (outcome.strategicValue === "high") {
    return `Latest strategic outcome is ${valueLabel}. The ${hypothesis.objective} objective may be working.`;
  }

  if (outcome.strategicValue === "medium") {
    return `Latest strategic outcome is ${valueLabel}. The ${hypothesis.objective} objective has partial support so far.`;
  }

  if (outcome.strategicValue === "low") {
    return `Latest strategic outcome is ${valueLabel}. The ${hypothesis.objective} objective is not showing clearly yet.`;
  }

  return `Latest strategic outcome is ${valueLabel}. There is not enough evidence to judge the ${hypothesis.objective} objective yet.`;
}
