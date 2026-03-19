import type { AuditEvent, AuditEventInput } from "@/lib/audit";
import { getLatestFeedbackByCategory, type SignalFeedback } from "@/lib/feedback-definitions";
import { findSuggestedPatterns, type PatternMatchSuggestion } from "@/lib/pattern-match";
import { normalizePatternTags, type PatternFormValues, type SignalPattern } from "@/lib/pattern-definitions";
import { buildPatternDraftFromSignal } from "@/lib/patterns";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import { hasGeneration, isFilteredOutSignal } from "@/lib/workflow";
import type { SignalRecord } from "@/types/signal";

export type PatternCoverageStatus = "covered" | "partially_covered" | "uncovered";

export interface PatternCoverageAssessment {
  status: PatternCoverageStatus;
  reason: string;
  topSuggestions: PatternMatchSuggestion[];
  topScore: number;
  matchedPatternCount: number;
  hasAppliedPattern: boolean;
  hasSuggestedPattern: boolean;
  gapType: string | null;
  gapTypeDescription: string | null;
  gapCandidate: boolean;
  gapReason: string | null;
}

export interface PatternCoverageRecord extends PatternCoverageAssessment {
  signalId: string;
  sourceTitle: string;
  createdDate: string;
}

export interface PatternCoverageGapSummaryRow {
  label: string;
  description: string;
  count: number;
  signalIds: string[];
  suggestedAction: string;
}

export interface PatternCoverageSummary {
  totalSignals: number;
  coveredCount: number;
  partiallyCoveredCount: number;
  uncoveredCount: number;
  coveredRate: number;
  partiallyCoveredRate: number;
  uncoveredRate: number;
  gapCandidateCount: number;
  uncoveredGapCandidateCount: number;
  recurringPartialGapCount: number;
  topGapTypes: PatternCoverageGapSummaryRow[];
}

type CoverageSignals = {
  hasUsefulSignal: boolean;
  hasStrongScenario: boolean;
  hasUsableScenario: boolean;
  reachedGeneration: boolean;
  hasWeakSignal: boolean;
  hasWeakScenario: boolean;
  hasWeakOutput: boolean;
  lowValue: boolean;
};

type GapTypeDefinition = {
  label: string;
  description: string;
  keywords: string[];
};

const GAP_TYPE_DEFINITIONS: GapTypeDefinition[] = [
  {
    label: "Parent confusion / unclear communication",
    description: "Signals where a teacher needs clearer wording around parent expectations, misunderstandings, or mixed messages.",
    keywords: ["parent", "complaint", "reply", "expectation", "unclear", "confus", "availability", "after-hours"],
  },
  {
    label: "Low-level behaviour concern messaging",
    description: "Signals about calm, factual communication around persistent behaviour concerns before escalation.",
    keywords: ["behaviour", "behavior", "low-level", "disruption", "concern", "conduct", "classroom behaviour"],
  },
  {
    label: "Boundary-setting without escalation",
    description: "Signals where the operator needs a firm boundary message without sounding defensive or escalating the situation.",
    keywords: ["boundary", "escalat", "de-escalat", "tone", "availability", "calm", "reply window"],
  },
  {
    label: "Student progress concern without evidence",
    description: "Signals about discussing progress or concern before hard evidence, documentation, or assessment is complete.",
    keywords: ["progress", "evidence", "achievement", "assessment", "data", "concern", "uncertain"],
  },
  {
    label: "Incident explanation and follow-up",
    description: "Signals about explaining a classroom incident, what happened next, and how to communicate it cleanly.",
    keywords: ["incident", "follow-up", "follow up", "explain", "leadership", "classroom incident", "report back"],
  },
  {
    label: "Documentation clarity and neutral reporting",
    description: "Signals that need a reusable neutral, factual, or documentation-led communication pattern.",
    keywords: ["document", "documentation", "factual", "neutral", "objective", "record", "reporting"],
  },
  {
    label: "Policy-to-practice translation",
    description: "Signals where a policy, procedure, or district rule needs to be translated into teacher-safe communication.",
    keywords: ["policy", "district", "procedure", "guidance", "rule", "compliance", "protocol"],
  },
];

function includesPattern(value: string, pattern: string): boolean {
  return value.includes(pattern);
}

function buildCombinedSignalText(signal: SignalRecord): string {
  return [
    signal.sourceTitle,
    signal.manualSummary,
    signal.rawExcerpt,
    signal.scenarioAngle,
    signal.signalSubtype,
    signal.teacherPainPoint,
    signal.contentAngle,
    signal.sourceType,
    signal.sourcePublisher,
    signal.signalCategory,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function detectGapType(signal: SignalRecord): { label: string; description: string } | null {
  const combined = buildCombinedSignalText(signal);
  let bestMatch: { label: string; description: string; score: number } | null = null;

  for (const definition of GAP_TYPE_DEFINITIONS) {
    const score = definition.keywords.reduce(
      (sum, keyword) => sum + (includesPattern(combined, keyword) ? 1 : 0),
      0,
    );

    if (score === 0) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        label: definition.label,
        description: definition.description,
        score,
      };
    }
  }

  if (bestMatch) {
    return {
      label: bestMatch.label,
      description: bestMatch.description,
    };
  }

  if (signal.signalCategory) {
    return {
      label: `${signal.signalCategory} communication gap`,
      description: `Signals in the ${signal.signalCategory.toLowerCase()} category are recurring without a strong reusable pattern.`,
    };
  }

  return null;
}

function getCoverageSignals(signal: SignalRecord, feedbackEntries: SignalFeedback[]): CoverageSignals {
  const latestFeedback = getLatestFeedbackByCategory(feedbackEntries);
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });

  const hasUsefulSignal = latestFeedback.signal?.value === "useful_signal";
  const hasWeakSignal =
    latestFeedback.signal?.value === "weak_signal" || latestFeedback.signal?.value === "irrelevant_signal";
  const hasWeakScenario = latestFeedback.scenario?.value === "weak_framing";
  const hasWeakOutput =
    latestFeedback.output?.value === "weak_output" || latestFeedback.output?.value === "needs_revision";
  const lowValue =
    isFilteredOutSignal(signal) ||
    signal.keepRejectRecommendation === "Reject" ||
    signal.qualityGateResult === "Fail" ||
    latestFeedback.signal?.value === "irrelevant_signal";

  return {
    hasUsefulSignal,
    hasStrongScenario: scenarioAssessment.quality === "strong",
    hasUsableScenario: scenarioAssessment.quality === "usable",
    reachedGeneration: hasGeneration(signal),
    hasWeakSignal,
    hasWeakScenario,
    hasWeakOutput,
    lowValue,
  };
}

function hasPatternEvent(
  auditEvents: AuditEvent[],
  eventType: "PATTERN_APPLIED" | "PATTERN_SUGGESTED",
): boolean {
  return auditEvents.some((event) => event.eventType === eventType);
}

function buildCoverageReason(input: {
  status: PatternCoverageStatus;
  topSuggestion: PatternMatchSuggestion | null;
  hasAppliedPattern: boolean;
  hasSuggestedPattern: boolean;
}): string {
  if (input.status === "covered") {
    if (input.hasAppliedPattern) {
      return "A saved pattern has already been applied to this signal.";
    }

    return input.topSuggestion
      ? `A strong existing pattern match covers this signal: ${input.topSuggestion.pattern.name}.`
      : "A strong existing pattern appears to cover this signal.";
  }

  if (input.status === "partially_covered") {
    if (input.hasSuggestedPattern && input.topSuggestion) {
      return `A pattern was suggested here, but the best match still looks indirect: ${input.topSuggestion.pattern.name}.`;
    }

    return input.topSuggestion
      ? `Only a weak or indirect pattern match exists right now: ${input.topSuggestion.pattern.name}.`
      : "Only a weak or indirect pattern match exists right now.";
  }

  return "No existing pattern covers this signal well.";
}

function buildGapReason(input: {
  status: PatternCoverageStatus;
  signals: CoverageSignals;
  gapType: string | null;
  gapCount: number;
}): string | null {
  if (input.status === "uncovered") {
    if (input.signals.hasStrongScenario) {
      return "No pattern matched but Scenario Angle is strong.";
    }

    if (input.signals.reachedGeneration) {
      return "No existing pattern covers this well, but the record still reached generation successfully.";
    }

    if (input.signals.hasUsefulSignal) {
      return "No existing pattern covers this well, but the signal was marked useful.";
    }

    return "No existing pattern covers this signal well.";
  }

  if (input.status === "partially_covered" && input.gapCount >= 2) {
    if (input.signals.hasUsefulSignal) {
      return "Weak pattern match for a useful signal in a recurring scenario.";
    }

    if (input.gapType) {
      return "This situation recurs with only weak pattern coverage.";
    }

    return "This situation recurs without a strong reusable pattern.";
  }

  return null;
}

function isGapReadySignal(signals: CoverageSignals): boolean {
  if (signals.lowValue || signals.hasWeakSignal || signals.hasWeakScenario || signals.hasWeakOutput) {
    return false;
  }

  return signals.hasUsefulSignal || signals.hasStrongScenario || signals.hasUsableScenario || signals.reachedGeneration;
}

export function assessPatternCoverage(
  signal: SignalRecord,
  options: {
    patterns: SignalPattern[];
    feedbackEntries?: SignalFeedback[];
    auditEvents?: AuditEvent[];
  },
): PatternCoverageAssessment {
  const feedbackEntries = options.feedbackEntries ?? [];
  const auditEvents = options.auditEvents ?? [];
  const topSuggestions = findSuggestedPatterns(signal, options.patterns, { limit: 3 });
  const topSuggestion = topSuggestions[0] ?? null;
  const topScore = topSuggestion?.score ?? 0;
  const matchedPatternCount = topSuggestions.length;
  const hasAppliedPattern = hasPatternEvent(auditEvents, "PATTERN_APPLIED");
  const hasSuggestedPattern = hasPatternEvent(auditEvents, "PATTERN_SUGGESTED");
  const signals = getCoverageSignals(signal, feedbackEntries);
  const weakAppliedOutcome = hasAppliedPattern && signals.hasWeakOutput && topScore < 8;

  let status: PatternCoverageStatus = "uncovered";
  if ((hasAppliedPattern && !weakAppliedOutcome) || topScore >= 8) {
    status = "covered";
  } else if (topScore >= 4 || hasSuggestedPattern) {
    status = "partially_covered";
  }

  const gapType = detectGapType(signal);

  return {
    status,
    reason: buildCoverageReason({
      status,
      topSuggestion,
      hasAppliedPattern,
      hasSuggestedPattern,
    }),
    topSuggestions,
    topScore,
    matchedPatternCount,
    hasAppliedPattern,
    hasSuggestedPattern,
    gapType: gapType?.label ?? null,
    gapTypeDescription: gapType?.description ?? null,
    gapCandidate: false,
    gapReason: null,
  };
}

export function buildPatternCoverageRecords(
  signals: SignalRecord[],
  feedbackEntries: SignalFeedback[],
  patterns: SignalPattern[],
  auditEvents: AuditEvent[],
): PatternCoverageRecord[] {
  const feedbackBySignal = new Map<string, SignalFeedback[]>();
  const auditBySignal = new Map<string, AuditEvent[]>();

  for (const entry of feedbackEntries) {
    feedbackBySignal.set(entry.signalId, [...(feedbackBySignal.get(entry.signalId) ?? []), entry]);
  }

  for (const event of auditEvents) {
    auditBySignal.set(event.signalId, [...(auditBySignal.get(event.signalId) ?? []), event]);
  }

  const baseRecords = signals.map((signal) => {
    const assessment = assessPatternCoverage(signal, {
      patterns,
      feedbackEntries: feedbackBySignal.get(signal.recordId) ?? [],
      auditEvents: auditBySignal.get(signal.recordId) ?? [],
    });

    return {
      signal,
      feedbackEntries: feedbackBySignal.get(signal.recordId) ?? [],
      assessment,
    };
  });

  const recurringGapCounts = new Map<string, number>();
  for (const record of baseRecords) {
    if (
      (record.assessment.status === "uncovered" || record.assessment.status === "partially_covered") &&
      record.assessment.gapType
    ) {
      recurringGapCounts.set(record.assessment.gapType, (recurringGapCounts.get(record.assessment.gapType) ?? 0) + 1);
    }
  }

  return baseRecords.map(({ signal, feedbackEntries: entries, assessment }) => {
    const signals = getCoverageSignals(signal, entries);
    const gapCount = assessment.gapType ? recurringGapCounts.get(assessment.gapType) ?? 0 : 0;
    const gapCandidate =
      isGapReadySignal(signals) &&
      (assessment.status === "uncovered" ||
        (assessment.status === "partially_covered" && gapCount >= 2));

    return {
      signalId: signal.recordId,
      sourceTitle: signal.sourceTitle,
      createdDate: signal.createdDate,
      ...assessment,
      gapCandidate,
      gapReason: gapCandidate
        ? buildGapReason({
            status: assessment.status,
            signals,
            gapType: assessment.gapType,
            gapCount,
          })
        : null,
    };
  });
}

export function buildPatternCoverageSummary(records: PatternCoverageRecord[]): PatternCoverageSummary {
  const totalSignals = records.length;
  const coveredCount = records.filter((record) => record.status === "covered").length;
  const partiallyCoveredCount = records.filter((record) => record.status === "partially_covered").length;
  const uncoveredCount = records.filter((record) => record.status === "uncovered").length;
  const gapRows = new Map<string, PatternCoverageGapSummaryRow>();

  for (const record of records) {
    if (!record.gapCandidate || !record.gapType || !record.gapTypeDescription) {
      continue;
    }

    const existing = gapRows.get(record.gapType) ?? {
      label: record.gapType,
      description: record.gapTypeDescription,
      count: 0,
      signalIds: [],
      suggestedAction: "Consider creating a pattern for this scenario type.",
    };
    existing.count += 1;
    existing.signalIds.push(record.signalId);
    gapRows.set(record.gapType, existing);
  }

  const topGapTypes = Array.from(gapRows.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 4);

  return {
    totalSignals,
    coveredCount,
    partiallyCoveredCount,
    uncoveredCount,
    coveredRate: totalSignals > 0 ? coveredCount / totalSignals : 0,
    partiallyCoveredRate: totalSignals > 0 ? partiallyCoveredCount / totalSignals : 0,
    uncoveredRate: totalSignals > 0 ? uncoveredCount / totalSignals : 0,
    gapCandidateCount: records.filter((record) => record.gapCandidate).length,
    uncoveredGapCandidateCount: records.filter(
      (record) => record.gapCandidate && record.status === "uncovered",
    ).length,
    recurringPartialGapCount: records.filter(
      (record) => record.gapCandidate && record.status === "partially_covered",
    ).length,
    topGapTypes,
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildPatternDraftFromCoverageGap(
  signal: SignalRecord,
  assessment: PatternCoverageAssessment,
): PatternFormValues {
  const draft = buildPatternDraftFromSignal(signal);

  if (!assessment.gapCandidate || !assessment.gapReason) {
    return draft;
  }

  const coverageGapNote = `Coverage gap: ${assessment.gapReason}`;

  return {
    ...draft,
    description: truncate(
      draft.description.toLowerCase().includes("coverage gap")
        ? draft.description
        : `${draft.description} ${coverageGapNote}`,
      220,
    ),
    tags: normalizePatternTags([
      ...draft.tags,
      "coverage-gap",
      assessment.gapType
        ? assessment.gapType
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40)
        : "",
    ]),
  };
}

export function buildPatternGapDetectedEvent(input: {
  signal: SignalRecord;
  current: PatternCoverageAssessment;
  previous?: PatternCoverageAssessment | null;
}): AuditEventInput | null {
  if (!input.current.gapCandidate || !input.current.gapReason) {
    return null;
  }

  if (
    input.previous &&
    input.previous.gapCandidate === input.current.gapCandidate &&
    input.previous.status === input.current.status &&
    input.previous.gapReason === input.current.gapReason &&
    input.previous.gapType === input.current.gapType
  ) {
    return null;
  }

  return {
    signalId: input.signal.recordId,
    eventType: "PATTERN_GAP_DETECTED",
    actor: "system",
    summary: `Pattern coverage gap detected: ${input.current.gapReason}`,
    metadata: {
      coverageStatus: input.current.status,
      gapType: input.current.gapType,
      matchedPatternCount: input.current.matchedPatternCount,
      topScore: input.current.topScore,
    },
  };
}
