import type { AuditEvent } from "@/lib/audit";
import {
  BUNDLE_COVERAGE_STRENGTH_LABELS,
  buildBundleCoverageSummary,
  type BundleCoverageStrength,
} from "@/lib/bundle-coverage";
import { getCopilotGuidance } from "@/lib/copilot";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_DEFINITIONS,
  FEEDBACK_VALUE_DEFINITIONS,
  FEEDBACK_VALUES,
  type FeedbackCategory,
  type FeedbackValue,
  type SignalFeedback,
} from "@/lib/feedback-definitions";
import type { PatternFeedbackEntry } from "@/lib/pattern-feedback-definitions";
import { assessScenarioAngle, SCENARIO_ANGLE_QUALITY_LEVELS, type ScenarioAngleQuality } from "@/lib/scenario-angle";
import { getSourceProfile } from "@/lib/source-profiles";
import {
  buildPatternCandidateRecords,
  buildPatternDiscoverySummary,
} from "@/lib/pattern-discovery";
import {
  buildPatternCoverageRecords,
  buildPatternCoverageSummary,
} from "@/lib/pattern-coverage";
import { EDITORIAL_MODE_DEFINITIONS, type EditorialModeDefinition } from "@/lib/editorial-modes";
import {
  getOutcomeQualityLabel,
  type PostingOutcome,
} from "@/lib/outcome-memory";
import {
  buildPlaybookCoverageSummary,
  type PlaybookCoverageGap,
  type PlaybookCoverageStatus,
} from "@/lib/playbook-coverage";
import type { PostingLogEntry } from "@/lib/posting-memory";
import { indexBundleSummariesByPatternId, type PatternBundle } from "@/lib/pattern-bundles";
import type { PatternType, SignalPattern } from "@/lib/pattern-definitions";
import { getPostingPlatformLabel, POSTING_PLATFORMS } from "@/lib/posting-log";
import { buildReuseMemoryCases, buildReuseMemoryInsights } from "@/lib/reuse-memory";
import type { PlaybookCard } from "@/lib/playbook-card-definitions";
import { findRelatedPlaybookCards } from "@/lib/playbook-cards";
import { hasGeneration, hasInterpretation, hasScoring, isFilteredOutSignal } from "@/lib/workflow";
import { EDITORIAL_MODES, type EditorialMode, type SignalRecord } from "@/types/signal";

export const INSIGHT_WINDOWS = ["all", "7d", "30d"] as const;

type SourceMetricAccumulator = {
  key: string;
  label: string;
  total: number;
  scored: number;
  interpreted: number;
  generated: number;
  filteredOut: number;
  keep: number;
  review: number;
  rejected: number;
};

type ScenarioMetricAccumulator = {
  quality: ScenarioAngleQuality;
  total: number;
  interpreted: number;
  generated: number;
  blocked: number;
};

type OperatorStageKey = "scenario" | "interpretation" | "generation" | "review" | "scheduling" | "posting" | "workflow";

type StageMetricKey = "ingested" | "scored" | "scoredOnly" | "interpreted" | "interpretedOnly" | "generated" | "filteredOut";

export type InsightWindow = (typeof INSIGHT_WINDOWS)[number];

export interface SourceInsightRow {
  key: string;
  label: string;
  total: number;
  scored: number;
  interpreted: number;
  generated: number;
  filteredOut: number;
  keep: number;
  review: number;
  rejected: number;
  interpretationRate: number;
  generationRate: number;
  filteredRate: number;
}

export interface ScenarioQualityInsightRow {
  quality: ScenarioAngleQuality;
  label: string;
  total: number;
  interpreted: number;
  generated: number;
  blocked: number;
  interpretationRate: number;
  generationRate: number;
}

export interface PipelineStageInsight {
  key: StageMetricKey;
  label: string;
  count: number;
  share: number;
}

export interface OperatorStageInsight {
  key: OperatorStageKey;
  label: string;
  count: number;
}

export interface InsightObservation {
  tone: "neutral" | "warning" | "success";
  text: string;
}

export interface FeedbackValueInsightRow {
  value: FeedbackValue;
  label: string;
  count: number;
}

export interface FeedbackCategoryInsight {
  category: FeedbackCategory;
  label: string;
  total: number;
  rows: FeedbackValueInsightRow[];
}

export interface FeedbackSourceInsightRow {
  label: string;
  highQuality: number;
  noisy: number;
  total: number;
}

export interface PatternCandidateInsightRow {
  signalId: string;
  sourceTitle: string;
  reason: string;
  flag: "yes" | "maybe";
  strength: "strong" | "moderate" | "low";
  suggestedPatternType: PatternType;
}

export interface PatternSuggestionInsightRow {
  patternId: string;
  name: string;
  count: number;
}

export interface PatternCoverageGapInsightRow {
  label: string;
  description: string;
  count: number;
  signalIds: string[];
  suggestedAction: string;
}

export interface BundleCoverageInsightRow {
  bundleId: string;
  name: string;
  familyLabel: string | null;
  coverageStrength: BundleCoverageStrength;
  note: string;
  activePatternCount: number;
  retiredPatternCount: number;
  gapCandidateCount: number;
  suggestedAction: string;
}

export interface MissingKitInsightRow {
  familyLabel: string;
  familyDescription: string;
  count: number;
  reason: string;
  suggestedAction: string;
  exampleSignalIds: string[];
  relatedBundleNames: string[];
}

export interface EditorialModeInsightRow {
  mode: EditorialMode;
  label: string;
  usedCount: number;
  strongOutputCount: number;
}

export interface FinalReviewPlatformInsightRow {
  platform: "x" | "linkedin" | "reddit";
  label: string;
  readyCount: number;
  needsEditCount: number;
  skipCount: number;
}

export interface PostingPlatformInsightRow {
  platform: "x" | "linkedin" | "reddit";
  label: string;
  count: number;
}

export interface OutcomeQualityInsightRow {
  quality: "strong" | "acceptable" | "weak";
  label: string;
  count: number;
}

export interface OutcomePlatformInsightRow {
  platform: "x" | "linkedin" | "reddit";
  label: string;
  strongCount: number;
  acceptableCount: number;
  weakCount: number;
}

export interface ReuseMemoryCombinationInsightRow {
  label: string;
  count: number;
}

export interface ReuseMemoryPlatformInsightRow {
  platform: "x" | "linkedin" | "reddit";
  label: string;
  reusableCount: number;
  cautionCount: number;
}

export interface PlaybookCardInsightRow {
  cardId: string;
  title: string;
  count: number;
}

export interface PlaybookCoverageGapInsightRow {
  key: string;
  label: string;
  kind: "uncovered" | "weak_coverage" | "opportunity";
  flag: string;
  status: PlaybookCoverageStatus;
  summary: string;
  whyFlagged: string;
  suggestedAction: string;
  signalCount: number;
  strongOutcomeCount: number;
  acceptableOutcomeCount: number;
  weakOutcomeCount: number;
  cautionCount: number;
  adaptBeforeReuseCount: number;
  cardCount: number;
  signalIds: string[];
}

export interface SignalInsights {
  window: InsightWindow;
  windowLabel: string;
  totalSignals: number;
  dateRangeLabel: string;
  sourceKinds: SourceInsightRow[];
  topSources: SourceInsightRow[];
  watchSources: SourceInsightRow[];
  scenarioAngles: {
    rows: ScenarioQualityInsightRow[];
    blockedSignals: number;
    strongOrUsableGenerationRate: number;
    weakOrMissingGenerationRate: number;
  };
  pipeline: {
    stages: PipelineStageInsight[];
    reviewRecommended: number;
  };
  operator: {
    auditEvents: number;
    manualActions: number;
    trackedGuidanceActions: number;
    followedGuidance: number;
    overrides: number;
    overrideSignals: number;
    overrideRate: number;
    stageRows: OperatorStageInsight[];
    overrideStageRows: OperatorStageInsight[];
  };
  feedback: {
    totalEntries: number;
    categories: FeedbackCategoryInsight[];
    sourceRows: FeedbackSourceInsightRow[];
  };
  patternDiscovery: {
    candidateCount: number;
    strongCandidateCount: number;
    savedCount: number;
    unsavedCount: number;
    topShapeLabel: string | null;
    topShapeCount: number;
    recentCandidates: PatternCandidateInsightRow[];
  };
  patternCoverage: {
    coveredCount: number;
    partiallyCoveredCount: number;
    uncoveredCount: number;
    coveredRate: number;
    partiallyCoveredRate: number;
    uncoveredRate: number;
    gapCandidateCount: number;
    uncoveredGapCandidateCount: number;
    recurringPartialGapCount: number;
    topGapTypes: PatternCoverageGapInsightRow[];
  };
  patternSuggestions: {
    interactionCount: number;
    appliedCount: number;
    topPatterns: PatternSuggestionInsightRow[];
  };
  editorialModes: {
    usedCount: number;
    topModeLabel: string | null;
    topModeCount: number;
    rows: EditorialModeInsightRow[];
    underusedLabels: string[];
  };
  finalReview: {
    startedCount: number;
    completedCount: number;
    highestReadyPlatformLabel: string | null;
    platformRows: FinalReviewPlatformInsightRow[];
  };
  posting: {
    totalPostsLogged: number;
    signalsPostedCount: number;
    topPlatformLabel: string | null;
    topEditorialModeLabel: string | null;
    topPatternName: string | null;
    topSourceKindLabel: string | null;
    platformRows: PostingPlatformInsightRow[];
  };
  outcomes: {
    recordedCount: number;
    qualityRows: OutcomeQualityInsightRow[];
    platformRows: OutcomePlatformInsightRow[];
    topStrongPlatformLabel: string | null;
    topReuseModeLabel: string | null;
    topStrongSourceKindLabel: string | null;
    topStrongPatternName: string | null;
    topDoNotRepeatModeLabel: string | null;
  };
  reuseMemory: {
    totalCases: number;
    reusableCount: number;
    cautionCount: number;
    topReusableCombinationLabel: string | null;
    topDoNotRepeatCombinationLabel: string | null;
    strongestPlatformLabel: string | null;
    weakestPlatformLabel: string | null;
    reusableRows: ReuseMemoryCombinationInsightRow[];
    cautionRows: ReuseMemoryCombinationInsightRow[];
    platformRows: ReuseMemoryPlatformInsightRow[];
  };
  bundleCoverage: {
    bundleCount: number;
    strongCoverageCount: number;
    partialCoverageCount: number;
    thinBundleCount: number;
    inactiveBundleCount: number;
    bundles: BundleCoverageInsightRow[];
    missingKitCandidates: MissingKitInsightRow[];
  };
  playbook: {
    cardCount: number;
    activeCount: number;
    retiredCount: number;
    referencedCount: number;
    coverageAreaCount: number;
    coveredAreaCount: number;
    weaklyCoveredAreaCount: number;
    uncoveredAreaCount: number;
    lowSignalAreaCount: number;
    topCards: PlaybookCardInsightRow[];
    topCoverageGaps: PlaybookCoverageGapInsightRow[];
    uncoveredGaps: PlaybookCoverageGapInsightRow[];
    weakCoverageGaps: PlaybookCoverageGapInsightRow[];
    opportunityGaps: PlaybookCoverageGapInsightRow[];
    uncoveredFamiliesWithoutCard: string[];
  };
  observations: InsightObservation[];
  limitations: string[];
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesWindow(signal: SignalRecord, window: InsightWindow, now: Date): boolean {
  if (window === "all") {
    return true;
  }

  const createdAt = parseDate(signal.createdDate);
  if (createdAt === null) {
    return false;
  }

  const days = window === "7d" ? 7 : 30;
  const threshold = now.getTime() - days * 24 * 60 * 60 * 1000;
  return createdAt >= threshold;
}

function formatWindowLabel(window: InsightWindow): string {
  if (window === "7d") {
    return "Last 7 days";
  }

  if (window === "30d") {
    return "Last 30 days";
  }

  return "All time";
}

function formatDateRange(signals: SignalRecord[]): string {
  if (signals.length === 0) {
    return "No records in this window.";
  }

  const dates = signals
    .map((signal) => parseDate(signal.createdDate))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  if (dates.length === 0) {
    return "Created-date coverage is incomplete for this window.";
  }

  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${formatter.format(dates[0])} to ${formatter.format(dates[dates.length - 1])}`;
}

function toSourceRow(accumulator: SourceMetricAccumulator): SourceInsightRow {
  return {
    ...accumulator,
    interpretationRate: accumulator.total > 0 ? accumulator.interpreted / accumulator.total : 0,
    generationRate: accumulator.total > 0 ? accumulator.generated / accumulator.total : 0,
    filteredRate: accumulator.total > 0 ? accumulator.filteredOut / accumulator.total : 0,
  };
}

function buildSourceMetrics(
  signals: SignalRecord[],
  selector: (signal: SignalRecord) => { key: string; label: string },
): SourceInsightRow[] {
  const groups = new Map<string, SourceMetricAccumulator>();

  for (const signal of signals) {
    const group = selector(signal);
    const existing = groups.get(group.key) ?? {
      key: group.key,
      label: group.label,
      total: 0,
      scored: 0,
      interpreted: 0,
      generated: 0,
      filteredOut: 0,
      keep: 0,
      review: 0,
      rejected: 0,
    };

    existing.total += 1;
    if (hasScoring(signal)) {
      existing.scored += 1;
    }
    if (hasInterpretation(signal)) {
      existing.interpreted += 1;
    }
    if (hasGeneration(signal)) {
      existing.generated += 1;
    }
    if (isFilteredOutSignal(signal)) {
      existing.filteredOut += 1;
    }
    if (signal.keepRejectRecommendation === "Keep") {
      existing.keep += 1;
    }
    if (signal.keepRejectRecommendation === "Review") {
      existing.review += 1;
    }
    if (signal.keepRejectRecommendation === "Reject") {
      existing.rejected += 1;
    }

    groups.set(group.key, existing);
  }

  return Array.from(groups.values())
    .map(toSourceRow)
    .sort(
      (left, right) =>
        right.total - left.total ||
        right.generated - left.generated ||
        right.interpreted - left.interpreted ||
        left.label.localeCompare(right.label),
    );
}

function getSpecificSourceLabel(signal: SignalRecord): string {
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

function buildFeedbackInsights(
  signals: SignalRecord[],
  feedbackEntries: SignalFeedback[],
): SignalInsights["feedback"] {
  const signalMap = new Map(signals.map((signal) => [signal.recordId, signal]));
  const valueCounts = new Map<FeedbackValue, number>();
  const sourceRows = new Map<string, FeedbackSourceInsightRow>();

  for (const value of FEEDBACK_VALUES) {
    valueCounts.set(value, 0);
  }

  for (const entry of feedbackEntries) {
    valueCounts.set(entry.value, (valueCounts.get(entry.value) ?? 0) + 1);

    if (entry.category === "source") {
      const signal = signalMap.get(entry.signalId);
      const label = signal ? getSpecificSourceLabel(signal) : "Unknown source";
      const current = sourceRows.get(label) ?? {
        label,
        highQuality: 0,
        noisy: 0,
        total: 0,
      };

      current.total += 1;
      if (entry.value === "high_quality_source") {
        current.highQuality += 1;
      }
      if (entry.value === "noisy_source") {
        current.noisy += 1;
      }

      sourceRows.set(label, current);
    }
  }

  const categories = FEEDBACK_CATEGORIES.map((category) => {
    const rows = FEEDBACK_VALUES.filter((value) => FEEDBACK_VALUE_DEFINITIONS[value].category === category).map((value) => ({
      value,
      label: FEEDBACK_VALUE_DEFINITIONS[value].label,
      count: valueCounts.get(value) ?? 0,
    }));

    return {
      category,
      label: FEEDBACK_CATEGORY_DEFINITIONS[category].label,
      total: rows.reduce((sum, row) => sum + row.count, 0),
      rows,
    };
  });

  return {
    totalEntries: feedbackEntries.length,
    categories,
    sourceRows: Array.from(sourceRows.values())
      .sort((left, right) => right.total - left.total || right.noisy - left.noisy || left.label.localeCompare(right.label))
      .slice(0, 6),
  };
}

function buildPatternDiscoveryInsights(
  signals: SignalRecord[],
  feedbackEntries: SignalFeedback[],
  patterns: SignalPattern[],
): SignalInsights["patternDiscovery"] {
  const summary = buildPatternDiscoverySummary(buildPatternCandidateRecords(signals, feedbackEntries, patterns));

  return {
    candidateCount: summary.candidateCount,
    strongCandidateCount: summary.strongCandidateCount,
    savedCount: summary.savedCount,
    unsavedCount: summary.unsavedCount,
    topShapeLabel: summary.topShapeLabel,
    topShapeCount: summary.topShapeCount,
    recentCandidates: summary.recentCandidates.map((candidate) => ({
      signalId: candidate.signalId,
      sourceTitle: candidate.sourceTitle,
      reason: candidate.reason,
      flag: candidate.flag === "yes" ? "yes" : "maybe",
      strength: candidate.strength,
      suggestedPatternType: candidate.suggestedPatternType,
    })),
  };
}

function buildPatternCoverageInsights(
  signals: SignalRecord[],
  feedbackEntries: SignalFeedback[],
  patterns: SignalPattern[],
  auditEvents: AuditEvent[],
): SignalInsights["patternCoverage"] {
  const summary = buildPatternCoverageSummary(
    buildPatternCoverageRecords(signals, feedbackEntries, patterns, auditEvents),
  );

  return {
    coveredCount: summary.coveredCount,
    partiallyCoveredCount: summary.partiallyCoveredCount,
    uncoveredCount: summary.uncoveredCount,
    coveredRate: summary.coveredRate,
    partiallyCoveredRate: summary.partiallyCoveredRate,
    uncoveredRate: summary.uncoveredRate,
    gapCandidateCount: summary.gapCandidateCount,
    uncoveredGapCandidateCount: summary.uncoveredGapCandidateCount,
    recurringPartialGapCount: summary.recurringPartialGapCount,
    topGapTypes: summary.topGapTypes,
  };
}

function buildPatternSuggestionInsights(
  auditEvents: AuditEvent[],
): SignalInsights["patternSuggestions"] {
  const suggestionEvents = auditEvents.filter(
    (event) =>
      event.eventType === "PATTERN_SUGGESTED" &&
      typeof event.metadata?.patternId === "string" &&
      typeof event.metadata?.patternName === "string",
  );
  const appliedCount = auditEvents.filter(
    (event) => event.eventType === "PATTERN_APPLIED" && event.metadata?.suggestedPatternUsed === true,
  ).length;
  const counts = new Map<string, PatternSuggestionInsightRow>();

  for (const event of suggestionEvents) {
    const patternId = event.metadata?.patternId;
    const patternName = event.metadata?.patternName;
    if (typeof patternId !== "string" || typeof patternName !== "string") {
      continue;
    }

    const existing = counts.get(patternId) ?? {
      patternId,
      name: patternName,
      count: 0,
    };
    existing.count += 1;
    counts.set(patternId, existing);
  }

  return {
    interactionCount: suggestionEvents.length,
    appliedCount,
    topPatterns: Array.from(counts.values())
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
      .slice(0, 3),
  };
}

function buildEditorialModeInsights(
  signals: SignalRecord[],
  feedbackEntries: SignalFeedback[],
): SignalInsights["editorialModes"] {
  const strongOutputSignalIds = new Set(
    feedbackEntries
      .filter((entry) => entry.category === "output" && entry.value === "strong_output")
      .map((entry) => entry.signalId),
  );
  const rows = EDITORIAL_MODES.map((mode) => {
    const usedSignals = signals.filter((signal) => signal.editorialMode === mode);
    const definition: EditorialModeDefinition = EDITORIAL_MODE_DEFINITIONS[mode];

    return {
      mode,
      label: definition.label,
      usedCount: usedSignals.length,
      strongOutputCount: usedSignals.filter((signal) => strongOutputSignalIds.has(signal.recordId)).length,
    };
  });
  const usedCount = rows.reduce((sum, row) => sum + row.usedCount, 0);
  const topRow = [...rows]
    .filter((row) => row.usedCount > 0)
    .sort(
      (left, right) =>
        right.usedCount - left.usedCount ||
        right.strongOutputCount - left.strongOutputCount ||
        left.label.localeCompare(right.label),
    )[0];

  return {
    usedCount,
    topModeLabel: topRow?.label ?? null,
    topModeCount: topRow?.usedCount ?? 0,
    rows,
    underusedLabels: rows.filter((row) => row.usedCount <= 1).map((row) => row.label).slice(0, 3),
  };
}

function buildReuseMemorySection(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  bundles: PatternBundle[];
}): SignalInsights["reuseMemory"] {
  const cases = buildReuseMemoryCases({
    signals: input.signals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    bundleSummariesByPatternId: indexBundleSummariesByPatternId(input.bundles),
  });
  const summary = buildReuseMemoryInsights(cases);

  return summary;
}

function buildFinalReviewInsights(signals: SignalRecord[]): SignalInsights["finalReview"] {
  const platformRows: FinalReviewPlatformInsightRow[] = [
    { platform: "x", label: "X", readyCount: 0, needsEditCount: 0, skipCount: 0 },
    { platform: "linkedin", label: "LinkedIn", readyCount: 0, needsEditCount: 0, skipCount: 0 },
    { platform: "reddit", label: "Reddit", readyCount: 0, needsEditCount: 0, skipCount: 0 },
  ];
  let startedCount = 0;
  let completedCount = 0;

  for (const signal of signals) {
    if (signal.finalReviewStartedAt || signal.finalReviewNotes || signal.xReviewStatus || signal.linkedInReviewStatus || signal.redditReviewStatus) {
      startedCount += 1;
    }
    if (signal.finalReviewedAt) {
      completedCount += 1;
    }

    const platformStatuses = [
      signal.xReviewStatus,
      signal.linkedInReviewStatus,
      signal.redditReviewStatus,
    ] as const;

    for (const [index, status] of platformStatuses.entries()) {
      if (status === "ready") {
        platformRows[index].readyCount += 1;
      }
      if (status === "needs_edit") {
        platformRows[index].needsEditCount += 1;
      }
      if (status === "skip") {
        platformRows[index].skipCount += 1;
      }
    }
  }

  const highestReadyPlatform = [...platformRows].sort(
    (left, right) =>
      right.readyCount - left.readyCount ||
      left.skipCount - right.skipCount ||
      left.label.localeCompare(right.label),
  )[0];

  return {
    startedCount,
    completedCount,
    highestReadyPlatformLabel: highestReadyPlatform && highestReadyPlatform.readyCount > 0 ? highestReadyPlatform.label : null,
    platformRows,
  };
}

function buildPostingInsights(
  signals: SignalRecord[],
  postingEntries: PostingLogEntry[],
): SignalInsights["posting"] {
  const signalById = new Map(signals.map((signal) => [signal.recordId, signal]));
  const platformRows: PostingPlatformInsightRow[] = POSTING_PLATFORMS.map((platform) => ({
    platform,
    label: getPostingPlatformLabel(platform),
    count: 0,
  }));
  const platformRowByPlatform = new Map(platformRows.map((row) => [row.platform, row]));
  const editorialModeCounts = new Map<EditorialMode, number>();
  const patternCounts = new Map<string, { name: string; count: number }>();
  const sourceKindCounts = new Map<string, { label: string; count: number }>();
  const signalIds = new Set<string>();

  for (const entry of postingEntries) {
    signalIds.add(entry.signalId);
    const row = platformRowByPlatform.get(entry.platform);
    if (row) {
      row.count += 1;
    }

    if (entry.editorialMode) {
      editorialModeCounts.set(entry.editorialMode, (editorialModeCounts.get(entry.editorialMode) ?? 0) + 1);
    }

    if (entry.patternId && entry.patternName) {
      const current = patternCounts.get(entry.patternId) ?? {
        name: entry.patternName,
        count: 0,
      };
      current.count += 1;
      patternCounts.set(entry.patternId, current);
    }

    const signal = signalById.get(entry.signalId);
    if (signal) {
      const sourceProfile = getSourceProfile(signal);
      const current = sourceKindCounts.get(sourceProfile.sourceKind) ?? {
        label: sourceProfile.kindLabel,
        count: 0,
      };
      current.count += 1;
      sourceKindCounts.set(sourceProfile.sourceKind, current);
    }
  }

  const topPlatform = [...platformRows].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))[0];
  const topMode = [...editorialModeCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  const topPattern = [...patternCounts.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))[0];
  const topSourceKind = [...sourceKindCounts.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))[0];

  return {
    totalPostsLogged: postingEntries.length,
    signalsPostedCount: signalIds.size,
    topPlatformLabel: topPlatform && topPlatform.count > 0 ? topPlatform.label : null,
    topEditorialModeLabel: topMode ? EDITORIAL_MODE_DEFINITIONS[topMode[0]].label : null,
    topPatternName: topPattern?.name ?? null,
    topSourceKindLabel: topSourceKind?.label ?? null,
    platformRows,
  };
}

function incrementNamedCounter(
  counter: Map<string, { label: string; count: number }>,
  key: string,
  label: string,
) {
  const current = counter.get(key) ?? { label, count: 0 };
  current.count += 1;
  counter.set(key, current);
}

function buildOutcomeInsights(
  signals: SignalRecord[],
  postingEntries: PostingLogEntry[],
  outcomes: PostingOutcome[],
): SignalInsights["outcomes"] {
  const signalById = new Map(signals.map((signal) => [signal.recordId, signal]));
  const postingEntryById = new Map(postingEntries.map((entry) => [entry.id, entry]));
  const qualityRows: OutcomeQualityInsightRow[] = [
    { quality: "strong", label: getOutcomeQualityLabel("strong"), count: 0 },
    { quality: "acceptable", label: getOutcomeQualityLabel("acceptable"), count: 0 },
    { quality: "weak", label: getOutcomeQualityLabel("weak"), count: 0 },
  ];
  const qualityRowByKey = new Map(qualityRows.map((row) => [row.quality, row]));
  const platformRows: OutcomePlatformInsightRow[] = POSTING_PLATFORMS.map((platform) => ({
    platform,
    label: getPostingPlatformLabel(platform),
    strongCount: 0,
    acceptableCount: 0,
    weakCount: 0,
  }));
  const platformRowByKey = new Map(platformRows.map((row) => [row.platform, row]));
  const strongModeCounts = new Map<string, { label: string; count: number }>();
  const doNotRepeatModeCounts = new Map<string, { label: string; count: number }>();
  const strongPatternCounts = new Map<string, { label: string; count: number }>();
  const strongSourceKindCounts = new Map<string, { label: string; count: number }>();

  for (const outcome of outcomes) {
    qualityRowByKey.get(outcome.outcomeQuality)!.count += 1;

    const platformRow = platformRowByKey.get(outcome.platform);
    if (platformRow) {
      if (outcome.outcomeQuality === "strong") {
        platformRow.strongCount += 1;
      } else if (outcome.outcomeQuality === "acceptable") {
        platformRow.acceptableCount += 1;
      } else {
        platformRow.weakCount += 1;
      }
    }

    const postingEntry = postingEntryById.get(outcome.postingLogId);
    const signal = signalById.get(outcome.signalId);

    if (postingEntry?.editorialMode) {
      const label = EDITORIAL_MODE_DEFINITIONS[postingEntry.editorialMode].label;
      if (outcome.reuseRecommendation === "reuse_this_approach") {
        incrementNamedCounter(strongModeCounts, postingEntry.editorialMode, label);
      }
      if (outcome.reuseRecommendation === "do_not_repeat") {
        incrementNamedCounter(doNotRepeatModeCounts, postingEntry.editorialMode, label);
      }
    }

    if (postingEntry?.patternId && postingEntry.patternName && outcome.outcomeQuality === "strong") {
      incrementNamedCounter(strongPatternCounts, postingEntry.patternId, postingEntry.patternName);
    }

    if (signal && outcome.outcomeQuality === "strong") {
      const sourceProfile = getSourceProfile(signal);
      incrementNamedCounter(strongSourceKindCounts, sourceProfile.sourceKind, sourceProfile.kindLabel);
    }
  }

  const topStrongPlatform = [...platformRows].sort(
    (left, right) =>
      right.strongCount - left.strongCount ||
      left.weakCount - right.weakCount ||
      left.label.localeCompare(right.label),
  )[0];
  const topReuseMode = [...strongModeCounts.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  )[0];
  const topDoNotRepeatMode = [...doNotRepeatModeCounts.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  )[0];
  const topStrongPattern = [...strongPatternCounts.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  )[0];
  const topStrongSourceKind = [...strongSourceKindCounts.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  )[0];

  return {
    recordedCount: outcomes.length,
    qualityRows,
    platformRows,
    topStrongPlatformLabel: topStrongPlatform && topStrongPlatform.strongCount > 0 ? topStrongPlatform.label : null,
    topReuseModeLabel: topReuseMode?.label ?? null,
    topStrongSourceKindLabel: topStrongSourceKind?.label ?? null,
    topStrongPatternName: topStrongPattern?.label ?? null,
    topDoNotRepeatModeLabel: topDoNotRepeatMode?.label ?? null,
  };
}

function buildBundleCoverageInsights(input: {
  signals: SignalRecord[];
  auditEvents: AuditEvent[];
  feedbackEntries: SignalFeedback[];
  patternFeedbackEntries: PatternFeedbackEntry[];
  patterns: SignalPattern[];
  bundles: PatternBundle[];
}): SignalInsights["bundleCoverage"] {
  const summary = buildBundleCoverageSummary({
    signals: input.signals,
    bundles: input.bundles,
    patterns: input.patterns,
    auditEvents: input.auditEvents,
    feedbackEntries: input.feedbackEntries,
    patternFeedbackEntries: input.patternFeedbackEntries,
  });

  return {
    bundleCount: summary.bundleCount,
    strongCoverageCount: summary.strongCoverageCount,
    partialCoverageCount: summary.partialCoverageCount,
    thinBundleCount: summary.thinBundleCount,
    inactiveBundleCount: summary.inactiveBundleCount,
    bundles: summary.bundles.map((bundle) => ({
      bundleId: bundle.bundleId,
      name: bundle.name,
      familyLabel: bundle.familyLabel,
      coverageStrength: bundle.coverageStrength,
      note: bundle.note,
      activePatternCount: bundle.activePatternCount,
      retiredPatternCount: bundle.retiredPatternCount,
      gapCandidateCount: bundle.gapCandidateCount,
      suggestedAction: bundle.suggestedAction,
    })),
    missingKitCandidates: summary.missingKitCandidates.map((candidate) => ({
      familyLabel: candidate.familyLabel,
      familyDescription: candidate.familyDescription,
      count: candidate.count,
      reason: candidate.reason,
      suggestedAction: candidate.suggestedAction,
      exampleSignalIds: candidate.exampleSignalIds,
      relatedBundleNames: candidate.relatedBundleNames,
    })),
  };
}

function buildPlaybookInsights(input: {
  signals: SignalRecord[];
  cards: PlaybookCard[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  bundles: PatternBundle[];
  patternCoverage: SignalInsights["patternCoverage"];
  bundleCoverage: SignalInsights["bundleCoverage"];
}): SignalInsights["playbook"] {
  const activeCards = input.cards.filter((card) => card.status === "active");
  const counts = new Map<string, PlaybookCardInsightRow>();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(input.bundles);
  const coverageSummary = buildPlaybookCoverageSummary({
    signals: input.signals,
    playbookCards: input.cards,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    bundleSummariesByPatternId,
  });

  for (const signal of input.signals) {
    const matches = findRelatedPlaybookCards({
      signal,
      cards: activeCards,
      editorialMode: signal.editorialMode,
      familyLabels: [
        signal.signalCategory?.toLowerCase() ?? "",
        signal.signalSubtype?.toLowerCase() ?? "",
      ].filter(Boolean),
      limit: 2,
    });

    for (const match of matches) {
      const current = counts.get(match.card.id) ?? {
        cardId: match.card.id,
        title: match.card.title,
        count: 0,
      };
      current.count += 1;
      counts.set(match.card.id, current);
    }
  }

  const toGapInsightRow = (gap: PlaybookCoverageGap): PlaybookCoverageGapInsightRow => ({
    key: gap.key,
    label: gap.label,
    kind: gap.kind,
    flag: gap.flag,
    status: gap.status,
    summary: gap.compactSummary,
    whyFlagged: gap.whyFlagged,
    suggestedAction: gap.suggestedAction,
    signalCount: gap.signalCount,
    strongOutcomeCount: gap.strongOutcomeCount,
    acceptableOutcomeCount: gap.acceptableOutcomeCount,
    weakOutcomeCount: gap.weakOutcomeCount,
    cautionCount: gap.cautionCount,
    adaptBeforeReuseCount: gap.adaptBeforeReuseCount,
    cardCount: gap.cardCount,
    signalIds: gap.signalIds,
  });

  const normalizedCardText = activeCards.map((card) => ({
    id: card.id,
    text: `${card.title} ${card.summary} ${card.situation} ${card.relatedTags.join(" ")}`.toLowerCase(),
  }));
  const uncoveredFamiliesWithoutCard = [
    ...input.bundleCoverage.missingKitCandidates.map((candidate) => candidate.familyLabel),
    ...input.patternCoverage.topGapTypes.map((gap) => gap.label),
  ].filter((label, index, values) => values.indexOf(label) === index)
    .filter((label) => {
      const normalized = label.toLowerCase();
      return !normalizedCardText.some((card) => card.text.includes(normalized));
    })
    .slice(0, 3);

  return {
    cardCount: input.cards.length,
    activeCount: activeCards.length,
    retiredCount: input.cards.filter((card) => card.status === "retired").length,
    referencedCount: counts.size,
    coverageAreaCount: coverageSummary.areaCount,
    coveredAreaCount: coverageSummary.coveredCount,
    weaklyCoveredAreaCount: coverageSummary.weaklyCoveredCount,
    uncoveredAreaCount: coverageSummary.uncoveredCount,
    lowSignalAreaCount: coverageSummary.lowSignalCount,
    topCards: Array.from(counts.values())
      .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))
      .slice(0, 3),
    topCoverageGaps: coverageSummary.gaps.slice(0, 10).map(toGapInsightRow),
    uncoveredGaps: coverageSummary.groupedGaps.uncovered.slice(0, 5).map(toGapInsightRow),
    weakCoverageGaps: coverageSummary.groupedGaps.weakCoverage.slice(0, 5).map(toGapInsightRow),
    opportunityGaps: coverageSummary.groupedGaps.opportunity.slice(0, 5).map(toGapInsightRow),
    uncoveredFamiliesWithoutCard,
  };
}

function buildScenarioRows(signals: SignalRecord[]): ScenarioQualityInsightRow[] {
  const groups = new Map<ScenarioAngleQuality, ScenarioMetricAccumulator>();

  for (const quality of SCENARIO_ANGLE_QUALITY_LEVELS) {
    groups.set(quality, {
      quality,
      total: 0,
      interpreted: 0,
      generated: 0,
      blocked: 0,
    });
  }

  for (const signal of signals) {
    const assessment = assessScenarioAngle({
      scenarioAngle: signal.scenarioAngle,
      sourceTitle: signal.sourceTitle,
    });
    const guidance = getCopilotGuidance(signal);
    const current = groups.get(assessment.quality);

    if (!current) {
      continue;
    }

    current.total += 1;
    if (hasInterpretation(signal)) {
      current.interpreted += 1;
    }
    if (hasGeneration(signal)) {
      current.generated += 1;
    }
    if (guidance.actionKey === "shape_scenario") {
      current.blocked += 1;
    }
  }

  return SCENARIO_ANGLE_QUALITY_LEVELS.map((quality) => {
    const current = groups.get(quality)!;

    return {
      quality,
      label: quality.charAt(0).toUpperCase() + quality.slice(1),
      total: current.total,
      interpreted: current.interpreted,
      generated: current.generated,
      blocked: current.blocked,
      interpretationRate: current.total > 0 ? current.interpreted / current.total : 0,
      generationRate: current.total > 0 ? current.generated / current.total : 0,
    };
  });
}

function rateForQualities(rows: ScenarioQualityInsightRow[], qualities: ScenarioAngleQuality[]): number {
  const selected = rows.filter((row) => qualities.includes(row.quality));
  const total = selected.reduce((sum, row) => sum + row.total, 0);
  const generated = selected.reduce((sum, row) => sum + row.generated, 0);
  return total > 0 ? generated / total : 0;
}

function buildPipelineStages(signals: SignalRecord[]): SignalInsights["pipeline"] {
  const totalSignals = signals.length;
  const scored = signals.filter((signal) => hasScoring(signal)).length;
  const interpreted = signals.filter((signal) => hasInterpretation(signal)).length;
  const generated = signals.filter((signal) => hasGeneration(signal)).length;
  const filteredOut = signals.filter((signal) => isFilteredOutSignal(signal)).length;
  const scoredOnly = signals.filter(
    (signal) => hasScoring(signal) && !hasInterpretation(signal) && !isFilteredOutSignal(signal),
  ).length;
  const interpretedOnly = signals.filter(
    (signal) => hasInterpretation(signal) && !hasGeneration(signal) && !isFilteredOutSignal(signal),
  ).length;
  const reviewRecommended = signals.filter(
    (signal) =>
      signal.keepRejectRecommendation === "Review" ||
      signal.qualityGateResult === "Needs Review" ||
      signal.needsHumanReview === true,
  ).length;

  const stages: PipelineStageInsight[] = [
    { key: "ingested", label: "Ingested", count: totalSignals, share: totalSignals > 0 ? 1 : 0 },
    { key: "scored", label: "Scored", count: scored, share: totalSignals > 0 ? scored / totalSignals : 0 },
    { key: "scoredOnly", label: "Scored only", count: scoredOnly, share: totalSignals > 0 ? scoredOnly / totalSignals : 0 },
    { key: "interpreted", label: "Interpreted", count: interpreted, share: totalSignals > 0 ? interpreted / totalSignals : 0 },
    {
      key: "interpretedOnly",
      label: "Interpreted only",
      count: interpretedOnly,
      share: totalSignals > 0 ? interpretedOnly / totalSignals : 0,
    },
    { key: "generated", label: "Generated", count: generated, share: totalSignals > 0 ? generated / totalSignals : 0 },
    { key: "filteredOut", label: "Filtered out", count: filteredOut, share: totalSignals > 0 ? filteredOut / totalSignals : 0 },
  ];

  return {
    stages,
    reviewRecommended,
  };
}

function getOperatorStageLabel(stage: OperatorStageKey): string {
  switch (stage) {
    case "scenario":
      return "Scenario shaping";
    case "interpretation":
      return "Interpretation";
    case "generation":
      return "Generation";
    case "review":
      return "Review";
    case "scheduling":
      return "Scheduling";
    case "posting":
      return "Posting";
    case "workflow":
    default:
      return "Workflow";
  }
}

function incrementStage(counter: Map<OperatorStageKey, number>, stage: OperatorStageKey) {
  counter.set(stage, (counter.get(stage) ?? 0) + 1);
}

function statusChangeStage(event: AuditEvent): OperatorStageKey | null {
  const nextStatus = typeof event.metadata?.nextStatus === "string" ? event.metadata.nextStatus : null;

  if (nextStatus === "Reviewed" || nextStatus === "Approved") {
    return "review";
  }
  if (nextStatus === "Scheduled") {
    return "scheduling";
  }
  if (nextStatus === "Posted") {
    return "posting";
  }
  if (nextStatus === "Rejected" || nextStatus === "Archived") {
    return "workflow";
  }

  return null;
}

function overrideStage(event: AuditEvent): OperatorStageKey | null {
  const actualAction = typeof event.metadata?.actualAction === "string" ? event.metadata.actualAction : null;

  if (actualAction === "interpret") {
    return "interpretation";
  }
  if (actualAction === "generate") {
    return "generation";
  }
  if (actualAction === "review") {
    return "review";
  }
  if (actualAction === "schedule") {
    return "scheduling";
  }
  if (actualAction === "post") {
    return "posting";
  }

  return null;
}

function toOperatorStageRows(counter: Map<OperatorStageKey, number>): OperatorStageInsight[] {
  return Array.from(counter.entries())
    .map(([key, count]) => ({
      key,
      label: getOperatorStageLabel(key),
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildOperatorInsights(events: AuditEvent[]): SignalInsights["operator"] {
  const manualStageCounter = new Map<OperatorStageKey, number>();
  const overrideStageCounter = new Map<OperatorStageKey, number>();
  let scenarioActions = 0;
  let trackedGuidanceActions = 0;

  for (const event of events) {
    if (event.actor !== "operator") {
      continue;
    }

    if (event.eventType === "SCENARIO_ANGLE_ADDED") {
      scenarioActions += 1;
      incrementStage(manualStageCounter, "scenario");
      continue;
    }

    if (event.eventType === "INTERPRETATION_SAVED") {
      trackedGuidanceActions += 1;
      incrementStage(manualStageCounter, "interpretation");
      continue;
    }

    if (event.eventType === "GENERATION_SAVED") {
      trackedGuidanceActions += 1;
      incrementStage(manualStageCounter, "generation");
      continue;
    }

    if (event.eventType === "STATUS_CHANGED") {
      const stage = statusChangeStage(event);
      if (stage) {
        trackedGuidanceActions += 1;
        incrementStage(manualStageCounter, stage);
      }
      continue;
    }

    if (event.eventType === "OPERATOR_OVERRIDE") {
      const stage = overrideStage(event);
      if (stage) {
        incrementStage(overrideStageCounter, stage);
      }
    }
  }

  const overrides = events.filter((event) => event.eventType === "OPERATOR_OVERRIDE").length;
  const overrideSignals = new Set(
    events.filter((event) => event.eventType === "OPERATOR_OVERRIDE").map((event) => event.signalId),
  ).size;
  const manualActions = trackedGuidanceActions + scenarioActions;
  const followedGuidance = Math.max(trackedGuidanceActions - overrides, 0);

  return {
    auditEvents: events.length,
    manualActions,
    trackedGuidanceActions,
    followedGuidance,
    overrides,
    overrideSignals,
    overrideRate: trackedGuidanceActions > 0 ? overrides / trackedGuidanceActions : 0,
    stageRows: toOperatorStageRows(manualStageCounter),
    overrideStageRows: toOperatorStageRows(overrideStageCounter),
  };
}

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildObservations(input: {
  totalSignals: number;
  sourceKinds: SourceInsightRow[];
  scenarioRows: ScenarioQualityInsightRow[];
  blockedSignals: number;
  pipeline: SignalInsights["pipeline"];
  operator: SignalInsights["operator"];
  patternDiscovery: SignalInsights["patternDiscovery"];
  patternCoverage: SignalInsights["patternCoverage"];
  patternSuggestions: SignalInsights["patternSuggestions"];
  editorialModes: SignalInsights["editorialModes"];
  finalReview: SignalInsights["finalReview"];
  posting: SignalInsights["posting"];
  outcomes: SignalInsights["outcomes"];
  reuseMemory: SignalInsights["reuseMemory"];
  bundleCoverage: SignalInsights["bundleCoverage"];
  playbook: SignalInsights["playbook"];
}): InsightObservation[] {
  const observations: InsightObservation[] = [];
  const strongOrUsableRate = rateForQualities(input.scenarioRows, ["strong", "usable"]);
  const weakOrMissingRate = rateForQualities(input.scenarioRows, ["weak", "missing"]);
  const strongestKind = input.sourceKinds.find((row) => row.total > 0 && row.generated > 0) ?? input.sourceKinds[0];
  const weakestHighVolumeKind = [...input.sourceKinds]
    .filter((row) => row.total >= 2)
    .sort(
      (left, right) =>
        right.filteredRate - left.filteredRate ||
        left.interpretationRate - right.interpretationRate ||
        left.label.localeCompare(right.label),
    )[0];

  if (input.totalSignals === 0) {
    return [
      {
        tone: "neutral",
        text: "No records fall inside this window yet, so the insight layer has nothing stable to summarize.",
      },
    ];
  }

  if (strongOrUsableRate > weakOrMissingRate) {
    observations.push({
      tone: "success",
      text: `Records with usable or strong Scenario Angles reached generation ${percentage(strongOrUsableRate)} of the time versus ${percentage(weakOrMissingRate)} for weak or missing framing.`,
    });
  }

  if (input.blockedSignals > 0) {
    observations.push({
      tone: input.blockedSignals >= Math.max(2, Math.round(input.totalSignals * 0.25)) ? "warning" : "neutral",
      text: `Weak or missing Scenario Angles are currently blocking ${input.blockedSignals} records before the next recommended step.`,
    });
  }

  if (strongestKind && strongestKind.generated > 0) {
    observations.push({
      tone: "neutral",
      text: `${strongestKind.label} is the strongest current source family by output volume: ${strongestKind.total} records, ${strongestKind.interpreted} interpreted, ${strongestKind.generated} generated.`,
    });
  }

  if (weakestHighVolumeKind && weakestHighVolumeKind.filteredOut > 0) {
    observations.push({
      tone: "warning",
      text: `${weakestHighVolumeKind.label} is producing the weakest progression in the current window: ${weakestHighVolumeKind.filteredOut} filtered out from ${weakestHighVolumeKind.total} records.`,
    });
  }

  const scoredOnly = input.pipeline.stages.find((stage) => stage.key === "scoredOnly")?.count ?? 0;
  if (scoredOnly > 0) {
    observations.push({
      tone: scoredOnly >= Math.max(2, Math.round(input.totalSignals * 0.25)) ? "warning" : "neutral",
      text: `${scoredOnly} records are stopping at scoring without reaching interpretation yet.`,
    });
  }

  if (input.patternDiscovery.topShapeLabel && input.patternDiscovery.topShapeCount > 0) {
    observations.push({
      tone: "neutral",
      text: `${input.patternDiscovery.topShapeLabel} is the most common pattern candidate shape in this window.`,
    });
  }

  if (input.patternDiscovery.unsavedCount > 0) {
    observations.push({
      tone:
        input.patternDiscovery.unsavedCount >= Math.max(2, Math.round(input.totalSignals * 0.2))
          ? "warning"
          : "neutral",
      text: `${input.patternDiscovery.unsavedCount} candidate-worthy records have not been saved as patterns yet.`,
    });
  }

  if (input.patternCoverage.topGapTypes[0]) {
    observations.push({
      tone:
        input.patternCoverage.topGapTypes[0].count >= Math.max(2, Math.round(input.totalSignals * 0.2))
          ? "warning"
          : "neutral",
      text: `${input.patternCoverage.topGapTypes[0].label} is the clearest current pattern coverage gap in this window.`,
    });
  }

  if (input.bundleCoverage.missingKitCandidates[0]) {
    observations.push({
      tone:
        input.bundleCoverage.missingKitCandidates[0].count >= Math.max(2, Math.round(input.totalSignals * 0.2))
          ? "warning"
          : "neutral",
      text: `${input.bundleCoverage.missingKitCandidates[0].familyLabel} is the clearest current missing-kit family in this window.`,
    });
  }

  const thinBundle = input.bundleCoverage.bundles.find((bundle) => bundle.coverageStrength === "thin_bundle");
  if (thinBundle) {
    observations.push({
      tone: "neutral",
      text: `${thinBundle.name} currently looks thin at the bundle level and may need one stronger supporting pattern.`,
    });
  }

  if (input.patternSuggestions.interactionCount > 0) {
    observations.push({
      tone: "neutral",
      text: `Pattern suggestions were explicitly used ${input.patternSuggestions.interactionCount} times in this window.`,
    });
  }

  if (input.editorialModes.topModeLabel && input.editorialModes.topModeCount > 0) {
    observations.push({
      tone: "neutral",
      text: `${input.editorialModes.topModeLabel} is the most-used editorial mode in this window.`,
    });
  }

  if (input.finalReview.highestReadyPlatformLabel) {
    observations.push({
      tone: "neutral",
      text: `${input.finalReview.highestReadyPlatformLabel} is currently the platform most often marked ready in final review.`,
    });
  }

  if (input.posting.topPlatformLabel) {
    observations.push({
      tone: "neutral",
      text: `${input.posting.topPlatformLabel} is currently the platform most often logged as actually posted.`,
    });
  }

  if (input.outcomes.topStrongPlatformLabel) {
    observations.push({
      tone: "neutral",
      text: `${input.outcomes.topStrongPlatformLabel} is currently the platform most often marked strong after posting.`,
    });
  }

  if (input.reuseMemory.topReusableCombinationLabel) {
    observations.push({
      tone: "neutral",
      text: `${input.reuseMemory.topReusableCombinationLabel} is the strongest current reuse-memory combination.`,
    });
  }

  if (input.reuseMemory.topDoNotRepeatCombinationLabel) {
    observations.push({
      tone: "warning",
      text: `${input.reuseMemory.topDoNotRepeatCombinationLabel} is the combination most often marked do not repeat.`,
    });
  }

  if (input.playbook.topCards[0]) {
    observations.push({
      tone: "neutral",
      text: `${input.playbook.topCards[0].title} is currently the most frequently surfaced playbook card in this window.`,
    });
  }

  if (input.playbook.topCoverageGaps[0]) {
    observations.push({
      tone: input.playbook.topCoverageGaps[0].kind === "weak_coverage" ? "warning" : "neutral",
      text: input.playbook.topCoverageGaps[0].summary,
    });
  }

  const topOverrideStage = input.operator.overrideStageRows[0];
  if (topOverrideStage) {
    observations.push({
      tone: "neutral",
      text: `Operator overrides are concentrated most heavily in ${topOverrideStage.label.toLowerCase()} decisions right now.`,
    });
  }

  return observations.slice(0, 4);
}

export function buildSignalInsights(
  signals: SignalRecord[],
  auditEvents: AuditEvent[],
  feedbackEntries: SignalFeedback[],
  options?: {
    window?: InsightWindow;
    now?: Date;
    patterns?: SignalPattern[];
    allPatterns?: SignalPattern[];
    bundles?: PatternBundle[];
    playbookCards?: PlaybookCard[];
    patternFeedbackEntries?: PatternFeedbackEntry[];
    postingEntries?: PostingLogEntry[];
    postingOutcomes?: PostingOutcome[];
  },
): SignalInsights {
  const now = options?.now ?? new Date();
  const window = options?.window ?? "all";
  const filteredSignals = signals.filter((signal) => matchesWindow(signal, window, now));
  const includedSignalIds = new Set(filteredSignals.map((signal) => signal.recordId));
  const includedAuditEvents = auditEvents.filter((event) => includedSignalIds.has(event.signalId));
  const includedFeedbackEntries = feedbackEntries.filter((entry) => includedSignalIds.has(entry.signalId));
  const sourceKinds = buildSourceMetrics(filteredSignals, (signal) => {
    const profile = getSourceProfile(signal);
    return {
      key: profile.sourceKind,
      label: profile.kindLabel,
    };
  });
  const specificSources = buildSourceMetrics(filteredSignals, (signal) => {
    const label = getSpecificSourceLabel(signal);
    return {
      key: label.toLowerCase(),
      label,
    };
  });
  const scenarioRows = buildScenarioRows(filteredSignals);
  const blockedSignals = scenarioRows.reduce((sum, row) => sum + row.blocked, 0);
  const pipeline = buildPipelineStages(filteredSignals);
  const operator = buildOperatorInsights(includedAuditEvents);
  const feedback = buildFeedbackInsights(filteredSignals, includedFeedbackEntries);
  const patternDiscovery = buildPatternDiscoveryInsights(
    filteredSignals,
    includedFeedbackEntries,
    options?.patterns ?? [],
  );
  const patternCoverage = buildPatternCoverageInsights(
    filteredSignals,
    includedFeedbackEntries,
    options?.patterns ?? [],
    includedAuditEvents,
  );
  const patternSuggestions = buildPatternSuggestionInsights(includedAuditEvents);
  const editorialModes = buildEditorialModeInsights(filteredSignals, includedFeedbackEntries);
  const finalReview = buildFinalReviewInsights(filteredSignals);
  const includedPostingEntries = (options?.postingEntries ?? []).filter((entry) => includedSignalIds.has(entry.signalId));
  const posting = buildPostingInsights(filteredSignals, includedPostingEntries);
  const outcomes = buildOutcomeInsights(
    filteredSignals,
    includedPostingEntries,
    (options?.postingOutcomes ?? []).filter((outcome) => includedSignalIds.has(outcome.signalId)),
  );
  const includedPostingOutcomes = (options?.postingOutcomes ?? []).filter((outcome) => includedSignalIds.has(outcome.signalId));
  const reuseMemory = buildReuseMemorySection({
    signals: filteredSignals,
    postingEntries: includedPostingEntries,
    postingOutcomes: includedPostingOutcomes,
    bundles: options?.bundles ?? [],
  });
  const bundleCoverage = buildBundleCoverageInsights({
    signals: filteredSignals,
    auditEvents: includedAuditEvents,
    feedbackEntries: includedFeedbackEntries,
    patternFeedbackEntries: options?.patternFeedbackEntries ?? [],
    patterns: options?.allPatterns ?? options?.patterns ?? [],
    bundles: options?.bundles ?? [],
  });
  const playbook = buildPlaybookInsights({
    signals: filteredSignals,
    cards: options?.playbookCards ?? [],
    postingEntries: includedPostingEntries,
    postingOutcomes: includedPostingOutcomes,
    bundles: options?.bundles ?? [],
    patternCoverage,
    bundleCoverage,
  });

  return {
    window,
    windowLabel: formatWindowLabel(window),
    totalSignals: filteredSignals.length,
    dateRangeLabel: formatDateRange(filteredSignals),
    sourceKinds,
    topSources: [...specificSources]
      .sort(
        (left, right) =>
          right.generated - left.generated ||
          right.interpreted - left.interpreted ||
          right.total - left.total ||
          left.label.localeCompare(right.label),
      )
      .slice(0, 5),
    watchSources: [...specificSources]
      .sort(
        (left, right) =>
          right.filteredOut - left.filteredOut ||
          left.generated - right.generated ||
          left.interpretationRate - right.interpretationRate ||
          left.label.localeCompare(right.label),
      )
      .slice(0, 5),
    scenarioAngles: {
      rows: scenarioRows,
      blockedSignals,
      strongOrUsableGenerationRate: rateForQualities(scenarioRows, ["strong", "usable"]),
      weakOrMissingGenerationRate: rateForQualities(scenarioRows, ["weak", "missing"]),
    },
    pipeline,
    operator,
    feedback,
    patternDiscovery,
    patternCoverage,
    patternSuggestions,
    editorialModes,
    finalReview,
    posting,
    outcomes,
    reuseMemory,
    bundleCoverage,
    playbook,
    observations: buildObservations({
      totalSignals: filteredSignals.length,
      sourceKinds,
      scenarioRows,
      blockedSignals,
      pipeline,
      operator,
      patternDiscovery,
      patternCoverage,
      patternSuggestions,
      editorialModes,
      finalReview,
      posting,
      outcomes,
      reuseMemory,
      bundleCoverage,
      playbook,
    }),
    limitations: [
      "Time windows are based on signal created date. Audit-derived metrics follow the records in that window rather than filtering events by event timestamp.",
      "Suggested Scenario Angle usage is not tracked explicitly yet, so the insight layer reports framing quality and blockers rather than suggestion adoption.",
      "Pattern suggestion metrics currently track explicit suggestion interactions and suggested-pattern applications, not passive page impressions.",
      "Posting memory is manual only. It reflects what the operator logged after external publishing rather than direct platform integrations.",
      "Outcome quality is qualitative only. It reflects operator judgement after posting rather than external engagement or platform analytics.",
      "Reuse memory is heuristic and advisory only. It matches prior judged outcomes through explicit fields such as mode, platform, pattern, bundle, source family, category, and scenario wording overlap rather than ML similarity.",
      "Playbook cards are manual, compact guidance only. Surfacing is heuristic and based on explicit links, editorial mode, family labels, and wording overlap rather than ML summarisation.",
      "Playbook coverage gaps are heuristic only. Coverage areas use explicit structured dimensions such as platform, editorial mode, source family, and recurring caution labels rather than clustering or semantic search.",
      "Pattern candidate suggestions are heuristic only. They do not auto-create patterns, perform similarity matching, or change workflow rules.",
      "Pattern coverage and gap typing are heuristic only. They use explicit keyword buckets and current pattern-match strength, not embeddings or clustering.",
      `Bundle coverage is heuristic only. Strength labels such as ${BUNDLE_COVERAGE_STRENGTH_LABELS.strong_coverage.toLowerCase()} or ${BUNDLE_COVERAGE_STRENGTH_LABELS.thin_bundle.toLowerCase()} come from explicit family matching and current usage signals, not ML or clustering.`,
      "This layer is descriptive only. It summarizes current record state and audited operator actions without tuning scores or changing workflow rules.",
    ],
  };
}
