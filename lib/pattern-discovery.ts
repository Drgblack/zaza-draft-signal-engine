import type { AuditEventInput } from "@/lib/audit";
import { getLatestFeedbackByCategory, type SignalFeedback } from "@/lib/feedback-definitions";
import type { PatternSummary, PatternType, SignalPattern } from "@/lib/pattern-definitions";
import { buildPatternSourceContext, getPatternExampleOutput, toPatternSummary } from "@/lib/patterns";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import { hasGeneration, hasInterpretation, isFilteredOutSignal } from "@/lib/workflow";
import type { SignalRecord } from "@/types/signal";

export const PATTERN_CANDIDATE_FLAGS = ["yes", "maybe", "no"] as const;
export const PATTERN_CANDIDATE_STRENGTHS = ["strong", "moderate", "low"] as const;

export type PatternCandidateFlag = (typeof PATTERN_CANDIDATE_FLAGS)[number];
export type PatternCandidateStrength = (typeof PATTERN_CANDIDATE_STRENGTHS)[number];

type DiscoveryHeuristicKey =
  | "reuse_flag"
  | "repeatable_field"
  | "useful_signal"
  | "strong_framing"
  | "strong_output"
  | "good_recommendation"
  | "clean_generation"
  | "workflow_progression"
  | "reusable_context_combo"
  | "common_situation"
  | "weak_signal"
  | "irrelevant_signal"
  | "weak_framing"
  | "weak_output"
  | "needs_revision"
  | "bad_recommendation"
  | "filtered_out"
  | "one_off_case"
  | "review_only";

export const PATTERN_DISCOVERY_HEURISTICS: Record<
  DiscoveryHeuristicKey,
  {
    direction: "positive" | "negative";
    weight: number;
    label: string;
  }
> = {
  reuse_flag: {
    direction: "positive",
    weight: 3,
    label: "Record has already been marked for reuse.",
  },
  repeatable_field: {
    direction: "positive",
    weight: 3,
    label: "Record already carries an explicit repeatable-pattern marker.",
  },
  useful_signal: {
    direction: "positive",
    weight: 4,
    label: "Signal was marked useful by the operator.",
  },
  strong_framing: {
    direction: "positive",
    weight: 3,
    label: "Scenario Angle was marked strong or assessed as usable.",
  },
  strong_output: {
    direction: "positive",
    weight: 4,
    label: "Output was marked strong or the saved output set looks reusable.",
  },
  good_recommendation: {
    direction: "positive",
    weight: 2,
    label: "Co-pilot recommendation was marked good.",
  },
  clean_generation: {
    direction: "positive",
    weight: 2,
    label: "Record reached generation cleanly.",
  },
  workflow_progression: {
    direction: "positive",
    weight: 1,
    label: "Record progressed past interpretation into a later workflow stage.",
  },
  reusable_context_combo: {
    direction: "positive",
    weight: 2,
    label: "Source context and Scenario Angle combination looks reusable.",
  },
  common_situation: {
    direction: "positive",
    weight: 2,
    label: "Signal looks like a common communication situation.",
  },
  weak_signal: {
    direction: "negative",
    weight: -4,
    label: "Signal was marked weak.",
  },
  irrelevant_signal: {
    direction: "negative",
    weight: -5,
    label: "Signal was marked irrelevant.",
  },
  weak_framing: {
    direction: "negative",
    weight: -3,
    label: "Scenario Angle was marked weak or remains weak.",
  },
  weak_output: {
    direction: "negative",
    weight: -4,
    label: "Output was marked weak.",
  },
  needs_revision: {
    direction: "negative",
    weight: -3,
    label: "Output still needs revision.",
  },
  bad_recommendation: {
    direction: "negative",
    weight: -1,
    label: "Co-pilot recommendation was marked bad.",
  },
  filtered_out: {
    direction: "negative",
    weight: -6,
    label: "Signal was filtered out or rejected.",
  },
  one_off_case: {
    direction: "negative",
    weight: -3,
    label: "Signal looks too one-off or operationally specific.",
  },
  review_only: {
    direction: "negative",
    weight: -2,
    label: "Signal is still stuck in review without strong supporting evidence.",
  },
};

const COMMON_SITUATION_MATCHERS = [
  {
    label: "parent complaint communication",
    patterns: ["parent complaint", "parent expectations", "delayed replies", "reply window", "after-hours", "parent message"],
  },
  {
    label: "incident communication",
    patterns: ["incident", "escalat", "de-escalat", "behaviour", "behavior", "complaint"],
  },
  {
    label: "documentation communication",
    patterns: ["document", "paperwork", "report", "evidence trail", "record keeping"],
  },
  {
    label: "teacher onboarding communication",
    patterns: ["first-week", "first week", "onboarding", "new users", "getting started"],
  },
  {
    label: "planning reset communication",
    patterns: ["planning", "lesson plan", "weekly structure", "routine", "reusable", "workload spirals"],
  },
  {
    label: "boundary-setting communication",
    patterns: ["boundary", "response window", "constant availability", "always-on", "expectation system"],
  },
] as const;

const ONE_OFF_MARKERS = [
  "today only",
  "this morning",
  "this afternoon",
  "tomorrow",
  "next week scheduling",
  "single queue update",
  "internal queue note",
] as const;

export interface PatternCandidateHeuristicMatch {
  key: DiscoveryHeuristicKey;
  direction: "positive" | "negative";
  weight: number;
  label: string;
}

export interface PatternCandidateAssessment {
  flag: PatternCandidateFlag;
  strength: PatternCandidateStrength;
  score: number;
  reason: string;
  shapeLabel: string | null;
  suggestedPatternType: PatternType;
  commonSituationLabel: string | null;
  alreadyCaptured: boolean;
  linkedPatterns: PatternSummary[];
  matchedHeuristics: PatternCandidateHeuristicMatch[];
}

export interface PatternCandidateRecord extends PatternCandidateAssessment {
  signalId: string;
  sourceTitle: string;
  createdDate: string;
}

export interface PatternDiscoverySummary {
  candidateCount: number;
  strongCandidateCount: number;
  savedCount: number;
  unsavedCount: number;
  topShapeLabel: string | null;
  topShapeCount: number;
  shapeRows: Array<{
    label: string;
    count: number;
  }>;
  recentCandidates: PatternCandidateRecord[];
}

function addMatch(matches: PatternCandidateHeuristicMatch[], key: DiscoveryHeuristicKey) {
  const heuristic = PATTERN_DISCOVERY_HEURISTICS[key];

  matches.push({
    key,
    direction: heuristic.direction,
    weight: heuristic.weight,
    label: heuristic.label,
  });
}

function buildPatternTypeSuggestion(signal: SignalRecord): PatternType {
  const exampleOutput = getPatternExampleOutput(signal);

  if (signal.scenarioAngle && exampleOutput) {
    return "hybrid";
  }

  if (signal.scenarioAngle) {
    return "scenario";
  }

  if (exampleOutput) {
    return "output";
  }

  return "signal";
}

function getLinkedPatterns(signalId: string, patterns: SignalPattern[]): PatternSummary[] {
  return patterns
    .filter((pattern) => pattern.exampleSignalId === signalId)
    .map((pattern) => toPatternSummary(pattern))
    .filter((pattern): pattern is PatternSummary => Boolean(pattern));
}

function matchCommonSituation(signal: SignalRecord): string | null {
  const combined = [
    signal.sourceTitle,
    signal.manualSummary,
    signal.rawExcerpt,
    signal.scenarioAngle,
    signal.signalSubtype,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  for (const matcher of COMMON_SITUATION_MATCHERS) {
    if (matcher.patterns.some((pattern) => combined.includes(pattern))) {
      return matcher.label;
    }
  }

  return null;
}

function looksOneOff(signal: SignalRecord): boolean {
  const combined = [signal.sourceTitle, signal.manualSummary, signal.scenarioAngle]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return ONE_OFF_MARKERS.some((pattern) => combined.includes(pattern));
}

function buildPositiveReason(input: {
  hasStrongFraming: boolean;
  hasStrongOutput: boolean;
  hasUsefulSignal: boolean;
  commonSituationLabel: string | null;
  cleanGeneration: boolean;
  reusableContextCombo: boolean;
}): string {
  if (input.hasStrongFraming && input.hasStrongOutput) {
    return "Strong Scenario Angle and strong output suggest this could be reusable.";
  }

  if (input.commonSituationLabel) {
    return `This looks like a repeatable ${input.commonSituationLabel}.`;
  }

  if (input.hasUsefulSignal && input.cleanGeneration) {
    return "This record was marked useful and reached generation successfully.";
  }

  if (input.reusableContextCombo) {
    return "Source context and Scenario Angle look reusable together.";
  }

  if (input.hasStrongFraming) {
    return "Strong framing suggests this Scenario Angle may be worth reusing.";
  }

  if (input.hasStrongOutput) {
    return "The saved output looks strong enough to capture as a reusable pattern.";
  }

  return "This record shows enough repeatable structure to consider saving as a pattern.";
}

function buildNegativeReason(matches: PatternCandidateHeuristicMatch[]): string {
  if (matches.some((match) => match.key === "filtered_out")) {
    return "This record remains too weak or low-value to save as a pattern.";
  }

  if (matches.some((match) => match.key === "irrelevant_signal")) {
    return "This signal was marked irrelevant, so it is not a good pattern candidate.";
  }

  if (matches.some((match) => match.key === "weak_output" || match.key === "needs_revision")) {
    return "Outputs are still weak or need revision, so this is not ready to save as a pattern.";
  }

  if (matches.some((match) => match.key === "weak_framing")) {
    return "The framing still looks too weak to treat as a reusable pattern.";
  }

  if (matches.some((match) => match.key === "one_off_case")) {
    return "This case still looks too one-off to save as a reusable pattern.";
  }

  return "This record does not show enough reusable structure yet.";
}

function buildShapeLabel(input: {
  hasUsefulSignal: boolean;
  hasStrongFraming: boolean;
  hasStrongOutput: boolean;
  cleanGeneration: boolean;
  commonSituationLabel: string | null;
}): string | null {
  if (input.hasStrongFraming && input.hasStrongOutput) {
    return "Strong Scenario Angle + strong output";
  }

  if (input.hasUsefulSignal && input.hasStrongFraming) {
    return "Useful signal + strong Scenario Angle";
  }

  if (input.hasUsefulSignal && input.cleanGeneration) {
    return "Useful signal + clean generation";
  }

  if (input.commonSituationLabel) {
    return "Repeatable communication situation";
  }

  if (input.hasStrongOutput) {
    return "Strong output-led pattern";
  }

  return null;
}

function scoreToFlag(score: number): PatternCandidateFlag {
  if (score >= 7) {
    return "yes";
  }

  if (score >= 3) {
    return "maybe";
  }

  return "no";
}

function scoreToStrength(score: number): PatternCandidateStrength {
  if (score >= 9) {
    return "strong";
  }

  if (score >= 5) {
    return "moderate";
  }

  return "low";
}

export function assessPatternCandidate(
  signal: SignalRecord,
  options?: {
    feedbackEntries?: SignalFeedback[];
    patterns?: SignalPattern[];
  },
): PatternCandidateAssessment {
  const feedbackEntries = options?.feedbackEntries ?? [];
  const patterns = options?.patterns ?? [];
  const latestFeedback = getLatestFeedbackByCategory(feedbackEntries);
  const matches: PatternCandidateHeuristicMatch[] = [];
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const commonSituationLabel = matchCommonSituation(signal);
  const linkedPatterns = getLinkedPatterns(signal.recordId, patterns);
  const exampleOutput = getPatternExampleOutput(signal);
  const cleanGeneration =
    hasGeneration(signal) &&
    latestFeedback.output?.value !== "weak_output" &&
    latestFeedback.output?.value !== "needs_revision";
  const reusableContextCombo = Boolean(
    buildPatternSourceContext(signal) &&
      signal.scenarioAngle &&
      (scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable"),
  );
  const hasStrongFraming =
    latestFeedback.scenario?.value === "strong_framing" ||
    (scenarioAssessment.quality === "strong" && latestFeedback.scenario?.value !== "weak_framing");
  const hasStrongOutput =
    latestFeedback.output?.value === "strong_output" ||
    (Boolean(exampleOutput) && cleanGeneration && signal.status !== "Interpreted");
  const hasUsefulSignal = latestFeedback.signal?.value === "useful_signal";

  if (signal.reuseFlag) {
    addMatch(matches, "reuse_flag");
  }

  if (signal.repeatablePattern) {
    addMatch(matches, "repeatable_field");
  }

  if (hasUsefulSignal) {
    addMatch(matches, "useful_signal");
  }

  if (hasStrongFraming) {
    addMatch(matches, "strong_framing");
  }

  if (hasStrongOutput) {
    addMatch(matches, "strong_output");
  }

  if (latestFeedback.copilot?.value === "good_recommendation") {
    addMatch(matches, "good_recommendation");
  }

  if (cleanGeneration) {
    addMatch(matches, "clean_generation");
  }

  if (
    hasInterpretation(signal) &&
    ["Draft Generated", "Reviewed", "Approved", "Scheduled", "Posted"].includes(signal.status)
  ) {
    addMatch(matches, "workflow_progression");
  }

  if (reusableContextCombo) {
    addMatch(matches, "reusable_context_combo");
  }

  if (commonSituationLabel) {
    addMatch(matches, "common_situation");
  }

  if (latestFeedback.signal?.value === "weak_signal") {
    addMatch(matches, "weak_signal");
  }

  if (latestFeedback.signal?.value === "irrelevant_signal") {
    addMatch(matches, "irrelevant_signal");
  }

  if (
    latestFeedback.scenario?.value === "weak_framing" ||
    (scenarioAssessment.quality === "weak" && !hasStrongOutput)
  ) {
    addMatch(matches, "weak_framing");
  }

  if (latestFeedback.output?.value === "weak_output") {
    addMatch(matches, "weak_output");
  }

  if (latestFeedback.output?.value === "needs_revision") {
    addMatch(matches, "needs_revision");
  }

  if (latestFeedback.copilot?.value === "bad_recommendation") {
    addMatch(matches, "bad_recommendation");
  }

  if (isFilteredOutSignal(signal)) {
    addMatch(matches, "filtered_out");
  }

  if (looksOneOff(signal)) {
    addMatch(matches, "one_off_case");
  }

  if (
    signal.keepRejectRecommendation === "Review" &&
    !hasStrongOutput &&
    latestFeedback.signal?.value !== "useful_signal" &&
    latestFeedback.scenario?.value !== "strong_framing"
  ) {
    addMatch(matches, "review_only");
  }

  const score = matches.reduce((sum, match) => sum + match.weight, 0);
  const flag = scoreToFlag(score);
  const strength = scoreToStrength(score);
  const shapeLabel = buildShapeLabel({
    hasUsefulSignal,
    hasStrongFraming,
    hasStrongOutput,
    cleanGeneration,
    commonSituationLabel,
  });

  return {
    flag,
    strength,
    score,
    reason:
      flag === "no"
        ? buildNegativeReason(matches)
        : buildPositiveReason({
            hasStrongFraming,
            hasStrongOutput,
            hasUsefulSignal,
            commonSituationLabel,
            cleanGeneration,
            reusableContextCombo,
          }),
    shapeLabel,
    suggestedPatternType: buildPatternTypeSuggestion(signal),
    commonSituationLabel,
    alreadyCaptured: linkedPatterns.length > 0,
    linkedPatterns,
    matchedHeuristics: matches.sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight)),
  };
}

export function buildPatternCandidateRecords(
  signals: SignalRecord[],
  feedbackEntries: SignalFeedback[],
  patterns: SignalPattern[],
): PatternCandidateRecord[] {
  const feedbackBySignal = new Map<string, SignalFeedback[]>();

  for (const entry of feedbackEntries) {
    feedbackBySignal.set(entry.signalId, [...(feedbackBySignal.get(entry.signalId) ?? []), entry]);
  }

  return signals.map((signal) => ({
    signalId: signal.recordId,
    sourceTitle: signal.sourceTitle,
    createdDate: signal.createdDate,
    ...assessPatternCandidate(signal, {
      feedbackEntries: feedbackBySignal.get(signal.recordId) ?? [],
      patterns,
    }),
  }));
}

export function buildPatternDiscoverySummary(records: PatternCandidateRecord[]): PatternDiscoverySummary {
  const candidateRecords = records.filter((record) => record.flag !== "no");
  const shapeCounts = new Map<string, number>();

  for (const record of candidateRecords) {
    if (!record.shapeLabel) {
      continue;
    }

    shapeCounts.set(record.shapeLabel, (shapeCounts.get(record.shapeLabel) ?? 0) + 1);
  }

  const shapeRows = Array.from(shapeCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  const recentCandidates = [...candidateRecords]
    .filter((record) => !record.alreadyCaptured)
    .sort(
      (left, right) =>
        right.score - left.score ||
        new Date(right.createdDate).getTime() - new Date(left.createdDate).getTime(),
    )
    .slice(0, 5);

  return {
    candidateCount: candidateRecords.length,
    strongCandidateCount: candidateRecords.filter((record) => record.flag === "yes").length,
    savedCount: candidateRecords.filter((record) => record.alreadyCaptured).length,
    unsavedCount: candidateRecords.filter((record) => !record.alreadyCaptured).length,
    topShapeLabel: shapeRows[0]?.label ?? null,
    topShapeCount: shapeRows[0]?.count ?? 0,
    shapeRows: shapeRows.slice(0, 3),
    recentCandidates,
  };
}

export function buildPatternCandidateDetectedEvent(input: {
  signal: SignalRecord;
  current: PatternCandidateAssessment;
  previous?: PatternCandidateAssessment | null;
}): AuditEventInput | null {
  if (input.current.flag === "no" || input.current.alreadyCaptured) {
    return null;
  }

  if (
    input.previous &&
    input.previous.flag === input.current.flag &&
    input.previous.strength === input.current.strength &&
    input.previous.reason === input.current.reason &&
    input.previous.alreadyCaptured === input.current.alreadyCaptured
  ) {
    return null;
  }

  return {
    signalId: input.signal.recordId,
    eventType: "PATTERN_CANDIDATE_DETECTED",
    actor: "system",
    summary: `Pattern candidate detected: ${input.current.reason}`,
    metadata: {
      flag: input.current.flag,
      strength: input.current.strength,
      score: input.current.score,
      patternType: input.current.suggestedPatternType,
      shape: input.current.shapeLabel,
    },
  };
}
