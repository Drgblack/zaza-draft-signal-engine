import { FEEDBACK_VALUE_DEFINITIONS, type SignalFeedback } from "@/lib/feedback-definitions";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import { getSourceProfile } from "@/lib/source-profiles";
import type { SignalRecord } from "@/types/signal";

export interface FeedbackContextNote {
  tone: "success" | "warning" | "neutral";
  text: string;
}

function countFeedback(entries: SignalFeedback[], values: Array<keyof typeof FEEDBACK_VALUE_DEFINITIONS>): number {
  return entries.filter((entry) => values.includes(entry.value)).length;
}

export function getSignalSourceLabel(signal: SignalRecord): string {
  if (signal.ingestionSource?.trim()) {
    return signal.ingestionSource.trim().replace(/^query:/i, "Query · ");
  }

  if (signal.sourcePublisher?.trim()) {
    return signal.sourcePublisher.trim();
  }

  if (signal.sourceType?.trim()) {
    return signal.sourceType.trim();
  }

  return "Unattributed source";
}

function getRelatedSignals(signal: SignalRecord, allSignals: SignalRecord[]): SignalRecord[] {
  const currentProfile = getSourceProfile(signal);

  return allSignals.filter((candidate) => {
    if (candidate.recordId === signal.recordId) {
      return false;
    }

    const candidateProfile = getSourceProfile(candidate);
    if (candidateProfile.sourceKind !== currentProfile.sourceKind) {
      return false;
    }

    if (signal.signalCategory && candidate.signalCategory) {
      return candidate.signalCategory === signal.signalCategory;
    }

    return true;
  });
}

function buildSourceFeedbackNote(signal: SignalRecord, allSignals: SignalRecord[], feedbackEntries: SignalFeedback[]): FeedbackContextNote | null {
  const sourceLabel = getSignalSourceLabel(signal);
  const matchingSignalIds = new Set(
    allSignals.filter((candidate) => getSignalSourceLabel(candidate) === sourceLabel).map((candidate) => candidate.recordId),
  );
  const relevantEntries = feedbackEntries.filter(
    (entry) => entry.category === "source" && matchingSignalIds.has(entry.signalId),
  );

  const noisyCount = countFeedback(relevantEntries, ["noisy_source"]);
  const highQualityCount = countFeedback(relevantEntries, ["high_quality_source"]);

  if (noisyCount === 0 && highQualityCount === 0) {
    return null;
  }

  if (noisyCount >= highQualityCount) {
    return {
      tone: "warning",
      text: noisyCount > 1 ? "This source has previously been marked noisy more than once." : "This source has previously been marked noisy.",
    };
  }

  return {
    tone: "success",
    text:
      highQualityCount > 1
        ? "This source has previously been marked high quality more than once."
        : "This source has previously been marked high quality.",
  };
}

function buildSignalFeedbackNote(signal: SignalRecord, relatedSignals: SignalRecord[], feedbackEntries: SignalFeedback[]): FeedbackContextNote | null {
  const relatedSignalIds = new Set(relatedSignals.map((candidate) => candidate.recordId));
  const relevantEntries = feedbackEntries.filter(
    (entry) => entry.category === "signal" && relatedSignalIds.has(entry.signalId),
  );
  const usefulCount = countFeedback(relevantEntries, ["useful_signal"]);
  const weakCount = countFeedback(relevantEntries, ["weak_signal", "irrelevant_signal"]);

  if (usefulCount === 0 && weakCount === 0) {
    return null;
  }

  if (usefulCount > weakCount) {
    return {
      tone: "success",
      text: `Similar ${getSourceProfile(signal).kindLabel.toLowerCase()} signals were previously marked useful more often than weak.`,
    };
  }

  return {
    tone: "warning",
    text: `Similar ${getSourceProfile(signal).kindLabel.toLowerCase()} signals were previously marked weak or irrelevant more often than useful.`,
  };
}

function buildScenarioFeedbackNote(signal: SignalRecord, relatedSignals: SignalRecord[], feedbackEntries: SignalFeedback[]): FeedbackContextNote | null {
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const currentQuality = scenarioAssessment.quality;
  const relevantSignals = relatedSignals.filter((candidate) => {
    const candidateAssessment = assessScenarioAngle({
      scenarioAngle: candidate.scenarioAngle,
      sourceTitle: candidate.sourceTitle,
    });

    if (currentQuality === "weak" || currentQuality === "missing") {
      return candidateAssessment.quality === "weak" || candidateAssessment.quality === "missing";
    }

    return candidateAssessment.quality === "strong" || candidateAssessment.quality === "usable";
  });
  const relevantIds = new Set(relevantSignals.map((candidate) => candidate.recordId));
  const relevantEntries = feedbackEntries.filter(
    (entry) => entry.category === "scenario" && relevantIds.has(entry.signalId),
  );
  const strongCount = countFeedback(relevantEntries, ["strong_framing"]);
  const weakCount = countFeedback(relevantEntries, ["weak_framing"]);

  if (strongCount === 0 && weakCount === 0) {
    return null;
  }

  if (currentQuality === "weak" || currentQuality === "missing") {
    if (weakCount >= 1) {
      return {
        tone: "warning",
        text: "Similar records with weak framing were previously marked as weakly framed by the operator.",
      };
    }

    return null;
  }

  if (strongCount >= 1) {
    return {
      tone: "success",
      text: "Similar records with usable or strong framing were previously marked as strongly framed.",
    };
  }

  return null;
}

function buildOutputFeedbackNote(signal: SignalRecord, relatedSignals: SignalRecord[], feedbackEntries: SignalFeedback[]): FeedbackContextNote | null {
  const relatedIds = new Set([signal.recordId, ...relatedSignals.map((candidate) => candidate.recordId)]);
  const relevantEntries = feedbackEntries.filter(
    (entry) => entry.category === "output" && relatedIds.has(entry.signalId),
  );
  const strongCount = countFeedback(relevantEntries, ["strong_output"]);
  const weakCount = countFeedback(relevantEntries, ["weak_output", "needs_revision"]);

  if (strongCount === 0 && weakCount === 0) {
    return null;
  }

  if (strongCount > weakCount) {
    return {
      tone: "success",
      text: "Outputs from similar signals were previously marked strong more often than weak.",
    };
  }

  return {
    tone: "warning",
    text: "Outputs from similar signals were previously marked weak or in need of revision more often than strong.",
  };
}

function buildCopilotFeedbackNote(signal: SignalRecord, relatedSignals: SignalRecord[], feedbackEntries: SignalFeedback[]): FeedbackContextNote | null {
  const relatedIds = new Set([signal.recordId, ...relatedSignals.map((candidate) => candidate.recordId)]);
  const relevantEntries = feedbackEntries.filter(
    (entry) => entry.category === "copilot" && relatedIds.has(entry.signalId),
  );
  const goodCount = countFeedback(relevantEntries, ["good_recommendation"]);
  const badCount = countFeedback(relevantEntries, ["bad_recommendation"]);

  if (goodCount === 0 && badCount === 0) {
    return null;
  }

  if (goodCount >= badCount) {
    return {
      tone: "neutral",
      text: "Similar co-pilot recommendations were previously marked helpful.",
    };
  }

  return {
    tone: "warning",
    text: "Similar co-pilot recommendations were previously marked ineffective.",
  };
}

export function buildFeedbackContextForSignal(input: {
  signal: SignalRecord;
  allSignals: SignalRecord[];
  feedbackEntries: SignalFeedback[];
  currentAction: string;
}): FeedbackContextNote[] {
  const relatedSignals = getRelatedSignals(input.signal, input.allSignals);
  const candidates: Array<FeedbackContextNote | null> = [];

  candidates.push(buildSourceFeedbackNote(input.signal, input.allSignals, input.feedbackEntries));

  if (["score", "interpret", "review", "none"].includes(input.currentAction)) {
    candidates.push(buildSignalFeedbackNote(input.signal, relatedSignals, input.feedbackEntries));
  }

  if (["shape_scenario", "interpret", "generate"].includes(input.currentAction)) {
    candidates.push(buildScenarioFeedbackNote(input.signal, relatedSignals, input.feedbackEntries));
  }

  if (["generate", "review", "schedule", "post"].includes(input.currentAction)) {
    candidates.push(buildOutputFeedbackNote(input.signal, relatedSignals, input.feedbackEntries));
  }

  candidates.push(buildCopilotFeedbackNote(input.signal, relatedSignals, input.feedbackEntries));

  return candidates.filter((candidate): candidate is FeedbackContextNote => candidate !== null).slice(0, 3);
}
