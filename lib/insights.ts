import type { AuditEvent } from "@/lib/audit";
import {
  BUNDLE_COVERAGE_STRENGTH_LABELS,
  buildBundleCoverageSummary,
  type BundleCoverageStrength,
} from "@/lib/bundle-coverage";
import { getCopilotGuidance, getFeedbackAwareCopilotGuidance } from "@/lib/copilot";
import {
  deriveEditorialConfidence,
  getEditorialConfidenceLabel,
  type EditorialConfidenceLevel,
  type EditorialUncertaintyFlagCode,
} from "@/lib/editorial-confidence";
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
  STRATEGIC_VALUE_LEVELS,
  getStrategicValueLabel,
  type StrategicOutcome,
  type StrategicValue,
} from "@/lib/strategic-outcome-memory";
import {
  buildPlaybookCoverageSummary,
  type PlaybookCoverageGap,
  type PlaybookCoverageStatus,
} from "@/lib/playbook-coverage";
import {
  buildSignalRepurposingBundle,
  parseSelectedRepurposedOutputIds,
  type RepurposingFormatType,
  type RepurposingPlatform,
} from "@/lib/repurposing";
import { buildSignalPublishPrepBundle, parsePublishPrepBundle } from "@/lib/publish-prep";
import type { PostingLogEntry } from "@/lib/posting-memory";
import { indexBundleSummariesByPatternId, type PatternBundle } from "@/lib/pattern-bundles";
import type { PatternType, SignalPattern } from "@/lib/pattern-definitions";
import { getPostingPlatformLabel, POSTING_PLATFORMS } from "@/lib/posting-log";
import { buildReuseMemoryCases, buildReuseMemoryInsights } from "@/lib/reuse-memory";
import {
  getOperatorTuningRows,
  getOperatorTuningSummary,
  type OperatorTuning,
} from "@/lib/tuning";
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

export interface AssetTypeInsightRow {
  type: "image" | "video" | "text_first";
  label: string;
  count: number;
  strongCount: number;
}

export interface RepurposingPlatformInsightRow {
  platform: RepurposingPlatform;
  label: string;
  count: number;
  strongCount: number;
}

export interface RepurposingFormatInsightRow {
  formatType: RepurposingFormatType;
  label: string;
  count: number;
}

export interface PublishPrepPlatformInsightRow {
  platform: string;
  label: string;
  count: number;
}

export interface PublishPrepStyleInsightRow {
  label: string;
  count: number;
}

export interface PublishPrepDestinationInsightRow {
  key: string;
  label: string;
  count: number;
  highValueCount: number;
}

export interface StrategicValueInsightRow {
  value: StrategicValue;
  label: string;
  count: number;
}

export interface StrategicOutcomePlatformInsightRow {
  platform: "x" | "linkedin" | "reddit";
  label: string;
  total: number;
  highCount: number;
  clickTotal: number;
  leadTotal: number;
}

export interface StrategicOutcomeNamedInsightRow {
  label: string;
  total: number;
  highCount: number;
  clickTotal: number;
  leadTotal: number;
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

export interface EditorialConfidenceInsightRow {
  level: EditorialConfidenceLevel;
  label: string;
  count: number;
}

export interface EditorialConfidenceClusterInsightRow {
  label: string;
  count: number;
}

export interface EditorialConfidenceFlagInsightRow {
  code: EditorialUncertaintyFlagCode;
  label: string;
  count: number;
}

export interface SignalInsights {
  window: InsightWindow;
  windowLabel: string;
  totalSignals: number;
  dateRangeLabel: string;
  tuning: {
    presetLabel: string;
    summary: string;
    rows: Array<{
      key: string;
      label: string;
      valueLabel: string;
    }>;
  };
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
  assets: {
    rows: AssetTypeInsightRow[];
    topUsedLabel: string | null;
    topStrongLabel: string | null;
  };
  publishPrep: {
    totalPackages: number;
    platformRows: PublishPrepPlatformInsightRow[];
    hookStyleRows: PublishPrepStyleInsightRow[];
    ctaStyleRows: PublishPrepStyleInsightRow[];
    destinationRows: PublishPrepDestinationInsightRow[];
    ctaGoalDestinationRows: PublishPrepStyleInsightRow[];
    topPlatformLabel: string | null;
    topHookStyleLabel: string | null;
    topCtaStyleLabel: string | null;
    topDestinationLabel: string | null;
    topHighValueDestinationLabel: string | null;
  };
  strategicOutcomes: {
    recordedCount: number;
    valueRows: StrategicValueInsightRow[];
    platformRows: StrategicOutcomePlatformInsightRow[];
    editorialModeRows: StrategicOutcomeNamedInsightRow[];
    patternRows: StrategicOutcomeNamedInsightRow[];
    bundleRows: StrategicOutcomeNamedInsightRow[];
    sourceKindRows: StrategicOutcomeNamedInsightRow[];
    assetRows: StrategicOutcomeNamedInsightRow[];
    funnelRows: StrategicOutcomeNamedInsightRow[];
    campaignRows: StrategicOutcomeNamedInsightRow[];
    topHighValuePlatformLabel: string | null;
    topLeadPlatformLabel: string | null;
    topModeLabel: string | null;
    topPatternLabel: string | null;
    topSourceKindLabel: string | null;
    topAssetLabel: string | null;
    topCampaignLabel: string | null;
    summaries: string[];
  };
  repurposing: {
    totalBundles: number;
    totalOutputs: number;
    platformRows: RepurposingPlatformInsightRow[];
    formatRows: RepurposingFormatInsightRow[];
    topPlatformLabel: string | null;
    topStrongPlatformLabel: string | null;
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
  editorialConfidence: {
    highCount: number;
    moderateCount: number;
    lowCount: number;
    rows: EditorialConfidenceInsightRow[];
    lowConfidenceSourceKinds: EditorialConfidenceClusterInsightRow[];
    lowConfidenceFamilies: EditorialConfidenceClusterInsightRow[];
    topUncertaintyFlags: EditorialConfidenceFlagInsightRow[];
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

function getSignalAssetType(signal: SignalRecord): AssetTypeInsightRow["type"] {
  if (signal.preferredAssetType) {
    return signal.preferredAssetType;
  }

  if (signal.suggestedFormatPriority === "Video") {
    return "video";
  }

  if (signal.suggestedFormatPriority === "Image" || signal.suggestedFormatPriority === "Carousel") {
    return "image";
  }

  return "text_first";
}

function buildAssetInsights(
  signals: SignalRecord[],
  postingOutcomes: PostingOutcome[],
): SignalInsights["assets"] {
  const rows: AssetTypeInsightRow[] = [
    { type: "image", label: "Image", count: 0, strongCount: 0 },
    { type: "video", label: "Video", count: 0, strongCount: 0 },
    { type: "text_first", label: "Text-first", count: 0, strongCount: 0 },
  ];
  const rowByType = new Map(rows.map((row) => [row.type, row]));
  const signalById = new Map(signals.map((signal) => [signal.recordId, signal]));

  for (const signal of signals) {
    const row = rowByType.get(getSignalAssetType(signal));
    if (row) {
      row.count += 1;
    }
  }

  for (const outcome of postingOutcomes) {
    if (outcome.outcomeQuality !== "strong") {
      continue;
    }

    const signal = signalById.get(outcome.signalId);
    if (!signal) {
      continue;
    }

    const row = rowByType.get(getSignalAssetType(signal));
    if (row) {
      row.strongCount += 1;
    }
  }

  const topUsed = [...rows]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .find((row) => row.count > 0) ?? null;
  const topStrong = [...rows]
    .sort((left, right) => right.strongCount - left.strongCount || right.count - left.count || left.label.localeCompare(right.label))
    .find((row) => row.strongCount > 0) ?? null;

  return {
    rows,
    topUsedLabel: topUsed?.label ?? null,
    topStrongLabel: topStrong?.label ?? null,
  };
}

function buildRepurposingInsights(
  signals: SignalRecord[],
  postingOutcomes: PostingOutcome[],
): SignalInsights["repurposing"] {
  const platformLabel = (platform: RepurposingPlatform) => {
    switch (platform) {
      case "x":
        return "X";
      case "linkedin":
        return "LinkedIn";
      case "reddit":
        return "Reddit";
      case "email":
        return "Email";
      case "video":
        return "Video";
      case "carousel":
        return "Carousel";
      case "founder_thought":
      default:
        return "Founder thought";
    }
  };
  const formatLabel = (formatType: RepurposingFormatType) => {
    switch (formatType) {
      case "email_angle":
        return "Email angle";
      case "outline":
        return "Outline";
      case "reflection":
        return "Reflection";
      case "post":
        return "Post";
      case "thread":
        return "Thread";
      case "script":
      case "concept":
      default:
        return formatType[0].toUpperCase() + formatType.slice(1).replace("_", " ");
    }
  };

  const platformMap = new Map<RepurposingPlatform, RepurposingPlatformInsightRow>();
  const formatMap = new Map<RepurposingFormatType, RepurposingFormatInsightRow>();
  const bundleSignals = signals
    .map((signal) => ({
      signal,
      bundle: buildSignalRepurposingBundle(signal),
      selectedIds: parseSelectedRepurposedOutputIds(signal.selectedRepurposedOutputIdsJson),
    }))
    .filter((entry): entry is {
      signal: SignalRecord;
      bundle: NonNullable<ReturnType<typeof buildSignalRepurposingBundle>>;
      selectedIds: string[];
    } => entry.bundle !== null);
  const signalBundleMap = new Map(bundleSignals.map((entry) => [entry.signal.recordId, entry]));

  for (const entry of bundleSignals) {
    for (const output of entry.bundle.outputs) {
      const platformRow = platformMap.get(output.platform) ?? {
        platform: output.platform,
        label: platformLabel(output.platform),
        count: 0,
        strongCount: 0,
      };
      platformRow.count += 1;
      platformMap.set(output.platform, platformRow);

      const formatRow = formatMap.get(output.formatType) ?? {
        formatType: output.formatType,
        label: formatLabel(output.formatType),
        count: 0,
      };
      formatRow.count += 1;
      formatMap.set(output.formatType, formatRow);
    }
  }

  for (const outcome of postingOutcomes) {
    if (outcome.outcomeQuality !== "strong") {
      continue;
    }

    const bundleEntry = signalBundleMap.get(outcome.signalId);
    if (!bundleEntry?.bundle) {
      continue;
    }

    const selectedOutputs = bundleEntry.bundle.outputs.filter((output) =>
      bundleEntry.selectedIds.length > 0 ? bundleEntry.selectedIds.includes(output.id) : (bundleEntry.bundle.recommendedSubset ?? []).includes(output.id),
    );
    const matchingOutput = selectedOutputs.find((output) => output.platform === outcome.platform) ??
      bundleEntry.bundle.outputs.find((output) => output.platform === outcome.platform);
    if (!matchingOutput) {
      continue;
    }

    const row = platformMap.get(matchingOutput.platform);
    if (row) {
      row.strongCount += 1;
    }
  }

  const platformRows = Array.from(platformMap.values()).sort(
    (left, right) => right.count - left.count || right.strongCount - left.strongCount || left.label.localeCompare(right.label),
  );
  const formatRows = Array.from(formatMap.values()).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );

  return {
    totalBundles: bundleSignals.length,
    totalOutputs: bundleSignals.reduce((sum, entry) => sum + entry.bundle.outputs.length, 0),
    platformRows,
    formatRows,
    topPlatformLabel: platformRows[0]?.label ?? null,
    topStrongPlatformLabel: [...platformRows].sort((left, right) => right.strongCount - left.strongCount || right.count - left.count)[0]?.strongCount
      ? [...platformRows].sort((left, right) => right.strongCount - left.strongCount || right.count - left.count)[0].label
      : null,
  };
}

function buildPublishPrepInsights(
  signals: SignalRecord[],
  postingEntries: PostingLogEntry[],
  strategicOutcomes: StrategicOutcome[],
): SignalInsights["publishPrep"] {
  const platformMap = new Map<string, PublishPrepPlatformInsightRow>();
  const hookStyleMap = new Map<string, PublishPrepStyleInsightRow>();
  const ctaStyleMap = new Map<string, PublishPrepStyleInsightRow>();
  const destinationMap = new Map<string, PublishPrepDestinationInsightRow>();
  const ctaGoalDestinationMap = new Map<string, PublishPrepStyleInsightRow>();
  const postingEntryById = new Map(postingEntries.map((entry) => [entry.id, entry]));
  let totalPackages = 0;

  const getPlatformLabel = (platform: string) => {
    if (platform === "x" || platform === "linkedin" || platform === "reddit") {
      return getPostingPlatformLabel(platform);
    }

    if (platform === "email") {
      return "Email";
    }

    if (platform === "video") {
      return "Video";
    }

    if (platform === "carousel") {
      return "Carousel";
    }

    return "Founder thought";
  };

  for (const signal of signals) {
    const bundle = parsePublishPrepBundle(signal.publishPrepBundleJson) ?? buildSignalPublishPrepBundle(signal);
    if (!bundle) {
      continue;
    }

    for (const pkg of bundle.packages) {
      totalPackages += 1;
      const platformRow = platformMap.get(pkg.platform) ?? {
        platform: pkg.platform,
        label: getPlatformLabel(pkg.platform),
        count: 0,
      };
      platformRow.count += 1;
      platformMap.set(pkg.platform, platformRow);

      const selectedHook =
        pkg.hookVariants.find((variant) => variant.id === pkg.selectedHookId) ??
        pkg.hookVariants.find((variant) => variant.text === pkg.primaryHook) ??
        pkg.hookVariants[0];
      if (selectedHook) {
        const hookRow = hookStyleMap.get(selectedHook.styleLabel) ?? {
          label: selectedHook.styleLabel,
          count: 0,
        };
        hookRow.count += 1;
        hookStyleMap.set(selectedHook.styleLabel, hookRow);
      }

      const selectedCta =
        pkg.ctaVariants.find((variant) => variant.id === pkg.selectedCtaId) ??
        pkg.ctaVariants.find((variant) => variant.text === pkg.primaryCta) ??
        pkg.ctaVariants[0];
      if (selectedCta) {
        const ctaRow = ctaStyleMap.get(selectedCta.goalLabel) ?? {
          label: selectedCta.goalLabel,
          count: 0,
        };
        ctaRow.count += 1;
        ctaStyleMap.set(selectedCta.goalLabel, ctaRow);
      }

      if (pkg.siteLinkId || pkg.siteLinkLabel) {
        const key = pkg.siteLinkId ?? pkg.siteLinkLabel ?? "site_link";
        const destinationRow = destinationMap.get(key) ?? {
          key,
          label: pkg.siteLinkLabel ?? pkg.siteLinkId ?? "Site link",
          count: 0,
          highValueCount: 0,
        };
        destinationRow.count += 1;
        destinationMap.set(key, destinationRow);

        if (signal.ctaGoal) {
          const ctaGoalKey = `${signal.ctaGoal} -> ${destinationRow.label}`;
          const ctaGoalRow = ctaGoalDestinationMap.get(ctaGoalKey) ?? {
            label: ctaGoalKey,
            count: 0,
          };
          ctaGoalRow.count += 1;
          ctaGoalDestinationMap.set(ctaGoalKey, ctaGoalRow);
        }
      }
    }
  }

  for (const outcome of strategicOutcomes) {
    if (outcome.strategicValue !== "high") {
      continue;
    }

    const entry = postingEntryById.get(outcome.postingLogId);
    const key = entry?.selectedSiteLinkId ?? entry?.destinationLabel;
    if (!key) {
      continue;
    }

    const destinationRow = destinationMap.get(key) ?? {
      key,
      label: entry?.destinationLabel ?? entry?.selectedSiteLinkId ?? "Site link",
      count: 0,
      highValueCount: 0,
    };
    destinationRow.highValueCount += 1;
    destinationMap.set(key, destinationRow);
  }

  const platformRows = Array.from(platformMap.values()).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
  const hookStyleRows = Array.from(hookStyleMap.values()).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
  const ctaStyleRows = Array.from(ctaStyleMap.values()).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
  const destinationRows = Array.from(destinationMap.values()).sort(
    (left, right) =>
      right.count - left.count ||
      right.highValueCount - left.highValueCount ||
      left.label.localeCompare(right.label),
  );
  const ctaGoalDestinationRows = Array.from(ctaGoalDestinationMap.values()).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
  const topHighValueDestination = [...destinationRows]
    .sort((left, right) => right.highValueCount - left.highValueCount || right.count - left.count || left.label.localeCompare(right.label))
    .find((row) => row.highValueCount > 0) ?? null;

  return {
    totalPackages,
    platformRows,
    hookStyleRows,
    ctaStyleRows,
    destinationRows,
    ctaGoalDestinationRows,
    topPlatformLabel: platformRows[0]?.label ?? null,
    topHookStyleLabel: hookStyleRows[0]?.label ?? null,
    topCtaStyleLabel: ctaStyleRows[0]?.label ?? null,
    topDestinationLabel: destinationRows[0]?.label ?? null,
    topHighValueDestinationLabel: topHighValueDestination?.label ?? null,
  };
}

function buildStrategicOutcomeInsights(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
  bundles: PatternBundle[];
}): SignalInsights["strategicOutcomes"] {
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const postingEntryById = new Map(input.postingEntries.map((entry) => [entry.id, entry]));
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(input.bundles);

  const valueRows: StrategicValueInsightRow[] = STRATEGIC_VALUE_LEVELS.map((value) => ({
    value,
    label: getStrategicValueLabel(value),
    count: 0,
  }));
  const valueRowByKey = new Map(valueRows.map((row) => [row.value, row]));
  const platformRows: StrategicOutcomePlatformInsightRow[] = POSTING_PLATFORMS.map((platform) => ({
    platform,
    label: getPostingPlatformLabel(platform),
    total: 0,
    highCount: 0,
    clickTotal: 0,
    leadTotal: 0,
  }));
  const platformRowByKey = new Map(platformRows.map((row) => [row.platform, row]));
  const editorialModeCounts = new Map<string, StrategicOutcomeNamedInsightRow>();
  const patternCounts = new Map<string, StrategicOutcomeNamedInsightRow>();
  const bundleCounts = new Map<string, StrategicOutcomeNamedInsightRow>();
  const sourceKindCounts = new Map<string, StrategicOutcomeNamedInsightRow>();
  const assetCounts = new Map<string, StrategicOutcomeNamedInsightRow>();
  const funnelCounts = new Map<string, StrategicOutcomeNamedInsightRow>();
  const campaignCounts = new Map<string, StrategicOutcomeNamedInsightRow>();

  function incrementRow(
    counter: Map<string, StrategicOutcomeNamedInsightRow>,
    key: string | null | undefined,
    label: string | null | undefined,
    outcome: StrategicOutcome,
  ) {
    if (!key || !label) {
      return;
    }

    const current = counter.get(key) ?? {
      label,
      total: 0,
      highCount: 0,
      clickTotal: 0,
      leadTotal: 0,
    };
    current.total += 1;
    if (outcome.strategicValue === "high") {
      current.highCount += 1;
    }
    current.clickTotal += outcome.clicks ?? 0;
    current.leadTotal += (outcome.leadsOrSignups ?? 0) + (outcome.trialsOrConversions ?? 0);
    counter.set(key, current);
  }

  for (const outcome of input.strategicOutcomes) {
    valueRowByKey.get(outcome.strategicValue)!.count += 1;
    const platformRow = platformRowByKey.get(outcome.platform);
    if (platformRow) {
      platformRow.total += 1;
      if (outcome.strategicValue === "high") {
        platformRow.highCount += 1;
      }
      platformRow.clickTotal += outcome.clicks ?? 0;
      platformRow.leadTotal += (outcome.leadsOrSignups ?? 0) + (outcome.trialsOrConversions ?? 0);
    }

    const postingEntry = postingEntryById.get(outcome.postingLogId);
    const signal = signalById.get(outcome.signalId);

    if (postingEntry?.editorialMode) {
      incrementRow(
        editorialModeCounts,
        postingEntry.editorialMode,
        EDITORIAL_MODE_DEFINITIONS[postingEntry.editorialMode].label,
        outcome,
      );
    }

    if (postingEntry?.patternId && postingEntry.patternName) {
      incrementRow(patternCounts, postingEntry.patternId, postingEntry.patternName, outcome);
      for (const bundle of bundleSummariesByPatternId[postingEntry.patternId] ?? []) {
        incrementRow(bundleCounts, bundle.id, bundle.name, outcome);
      }
    }

    if (signal) {
      const sourceProfile = getSourceProfile(signal);
      incrementRow(sourceKindCounts, sourceProfile.sourceKind, sourceProfile.kindLabel, outcome);

      const assetType = getSignalAssetType(signal);
      incrementRow(
        assetCounts,
        assetType,
        assetType === "image" ? "Image" : assetType === "video" ? "Video" : "Text-first",
        outcome,
      );

      if (signal.funnelStage) {
        incrementRow(funnelCounts, signal.funnelStage, signal.funnelStage, outcome);
      }

      if (signal.campaignId) {
        incrementRow(campaignCounts, signal.campaignId, signal.campaignId, outcome);
      }
    }
  }

  const sortRows = (rows: StrategicOutcomeNamedInsightRow[]) =>
    rows.sort(
      (left, right) =>
        right.highCount - left.highCount ||
        right.leadTotal - left.leadTotal ||
        right.clickTotal - left.clickTotal ||
        right.total - left.total ||
        left.label.localeCompare(right.label),
    );

  const editorialModeRows = sortRows(Array.from(editorialModeCounts.values()));
  const patternRows = sortRows(Array.from(patternCounts.values()));
  const bundleRows = sortRows(Array.from(bundleCounts.values()));
  const sourceKindRows = sortRows(Array.from(sourceKindCounts.values()));
  const assetRows = sortRows(Array.from(assetCounts.values()));
  const funnelRows = sortRows(Array.from(funnelCounts.values()));
  const campaignRows = sortRows(Array.from(campaignCounts.values()));
  const topHighValuePlatform = [...platformRows].sort(
    (left, right) =>
      right.highCount - left.highCount ||
      right.leadTotal - left.leadTotal ||
      right.clickTotal - left.clickTotal ||
      left.label.localeCompare(right.label),
  )[0];
  const topLeadPlatform = [...platformRows].sort(
    (left, right) =>
      right.leadTotal - left.leadTotal ||
      right.highCount - left.highCount ||
      right.clickTotal - left.clickTotal ||
      left.label.localeCompare(right.label),
  )[0];

  const summaries: string[] = [];
  if (topHighValuePlatform && topHighValuePlatform.highCount > 0) {
    summaries.push(`${topHighValuePlatform.label} currently carries the most high-value strategic outcomes.`);
  }
  if (editorialModeRows[0]?.highCount) {
    summaries.push(`${editorialModeRows[0].label} most often leads to high strategic value in the current window.`);
  }
  if (sourceKindRows[0]?.leadTotal) {
    summaries.push(`${sourceKindRows[0].label} is currently producing the strongest lead or signup movement.`);
  } else if (sourceKindRows[0]?.highCount) {
    summaries.push(`${sourceKindRows[0].label} is currently the strongest source family for strategic value.`);
  }

  return {
    recordedCount: input.strategicOutcomes.length,
    valueRows,
    platformRows,
    editorialModeRows,
    patternRows,
    bundleRows,
    sourceKindRows,
    assetRows,
    funnelRows,
    campaignRows,
    topHighValuePlatformLabel:
      topHighValuePlatform && topHighValuePlatform.highCount > 0 ? topHighValuePlatform.label : null,
    topLeadPlatformLabel: topLeadPlatform && topLeadPlatform.leadTotal > 0 ? topLeadPlatform.label : null,
    topModeLabel: editorialModeRows[0]?.label ?? null,
    topPatternLabel: patternRows[0]?.label ?? null,
    topSourceKindLabel: sourceKindRows[0]?.label ?? null,
    topAssetLabel: assetRows[0]?.label ?? null,
    topCampaignLabel: campaignRows[0]?.label ?? null,
    summaries: summaries.slice(0, 3),
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

function buildEditorialConfidenceInsights(input: {
  signals: SignalRecord[];
  feedbackEntries: SignalFeedback[];
  patterns: SignalPattern[];
  bundles: PatternBundle[];
  playbookCards: PlaybookCard[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  tuning?: OperatorTuning;
}): SignalInsights["editorialConfidence"] {
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(input.bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: input.signals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: input.signals,
    playbookCards: input.playbookCards,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    bundleSummariesByPatternId,
  });
  const counts: Record<EditorialConfidenceLevel, number> = {
    high: 0,
    moderate: 0,
    low: 0,
  };
  const lowConfidenceSourceKinds = new Map<string, number>();
  const lowConfidenceFamilies = new Map<string, number>();
  const flagCounts = new Map<EditorialUncertaintyFlagCode, EditorialConfidenceFlagInsightRow>();

  for (const signal of input.signals) {
    const guidance = getFeedbackAwareCopilotGuidance(signal, {
      allSignals: input.signals,
      feedbackEntries: input.feedbackEntries,
      patterns: input.patterns,
      bundleSummariesByPatternId,
      playbookCards: input.playbookCards,
      reuseMemoryCases,
      playbookCoverageSummary,
      tuning: input.tuning?.settings,
    });
    const confidence = deriveEditorialConfidence({
      signal,
      guidance,
      tuning: input.tuning?.settings,
    });

    counts[confidence.confidenceLevel] += 1;

    if (confidence.confidenceLevel === "low") {
      const sourceKindLabel = getSourceProfile(signal).kindLabel;
      const familyLabel = signal.signalSubtype?.trim() || signal.signalCategory || getSourceProfile(signal).contextLabel;

      lowConfidenceSourceKinds.set(
        sourceKindLabel,
        (lowConfidenceSourceKinds.get(sourceKindLabel) ?? 0) + 1,
      );
      lowConfidenceFamilies.set(
        familyLabel,
        (lowConfidenceFamilies.get(familyLabel) ?? 0) + 1,
      );
    }

    for (const flag of confidence.uncertaintyFlags) {
      const existing = flagCounts.get(flag.code) ?? {
        code: flag.code,
        label: flag.label,
        count: 0,
      };
      existing.count += 1;
      flagCounts.set(flag.code, existing);
    }
  }

  return {
    highCount: counts.high,
    moderateCount: counts.moderate,
    lowCount: counts.low,
    rows: (["high", "moderate", "low"] as const).map((level) => ({
      level,
      label: getEditorialConfidenceLabel(level),
      count: counts[level],
    })),
    lowConfidenceSourceKinds: Array.from(lowConfidenceSourceKinds.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 3),
    lowConfidenceFamilies: Array.from(lowConfidenceFamilies.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 3),
    topUncertaintyFlags: Array.from(flagCounts.values())
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4),
  };
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
  assets: SignalInsights["assets"];
  publishPrep: SignalInsights["publishPrep"];
  strategicOutcomes: SignalInsights["strategicOutcomes"];
  repurposing: SignalInsights["repurposing"];
  reuseMemory: SignalInsights["reuseMemory"];
  bundleCoverage: SignalInsights["bundleCoverage"];
  playbook: SignalInsights["playbook"];
  editorialConfidence: SignalInsights["editorialConfidence"];
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

  if (input.editorialConfidence.lowCount > 0) {
    const topLowConfidenceSource = input.editorialConfidence.lowConfidenceSourceKinds[0];
    observations.push({
      tone:
        input.editorialConfidence.lowCount >= Math.max(2, Math.round(input.totalSignals * 0.25))
          ? "warning"
          : "neutral",
      text: topLowConfidenceSource
        ? `${input.editorialConfidence.lowCount} records currently sit in low-confidence guidance territory, with ${topLowConfidenceSource.label} clustering most often.`
        : `${input.editorialConfidence.lowCount} records currently sit in low-confidence guidance territory.`,
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

  if (input.assets.topStrongLabel) {
    observations.push({
      tone: "neutral",
      text: `${input.assets.topStrongLabel} assets are currently most often associated with strong posted outcomes.`,
    });
  }

  if (input.publishPrep.totalPackages > 0) {
    observations.push({
      tone: "neutral",
      text: input.publishPrep.topDestinationLabel
        ? `${input.publishPrep.totalPackages} publish-prep packages are currently attached, with ${input.publishPrep.topDestinationLabel} used most often as the destination link.`
        : input.publishPrep.topPlatformLabel
          ? `${input.publishPrep.totalPackages} publish-prep packages are currently attached, with ${input.publishPrep.topPlatformLabel} receiving the most last-mile support.`
          : `${input.publishPrep.totalPackages} publish-prep packages are currently attached to approval-ready content.`,
    });
  }

  if (input.strategicOutcomes.topHighValuePlatformLabel) {
    observations.push({
      tone: "neutral",
      text: `${input.strategicOutcomes.topHighValuePlatformLabel} currently carries the strongest strategic-value outcomes in this window.`,
    });
  }

  if (input.repurposing.topPlatformLabel) {
    observations.push({
      tone: "neutral",
      text: `${input.repurposing.topPlatformLabel} is currently the most common repurposed platform in this window.`,
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
    tuning?: OperatorTuning;
    patterns?: SignalPattern[];
    allPatterns?: SignalPattern[];
    bundles?: PatternBundle[];
    playbookCards?: PlaybookCard[];
    patternFeedbackEntries?: PatternFeedbackEntry[];
    postingEntries?: PostingLogEntry[];
    postingOutcomes?: PostingOutcome[];
    strategicOutcomes?: StrategicOutcome[];
  },
): SignalInsights {
  const now = options?.now ?? new Date();
  const window = options?.window ?? "all";
  const tuning = options?.tuning;
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
  const includedStrategicOutcomes = (options?.strategicOutcomes ?? []).filter((outcome) => includedSignalIds.has(outcome.signalId));
  const assets = buildAssetInsights(filteredSignals, includedPostingOutcomes);
  const publishPrep = buildPublishPrepInsights(filteredSignals, includedPostingEntries, includedStrategicOutcomes);
  const strategicOutcomes = buildStrategicOutcomeInsights({
    signals: filteredSignals,
    postingEntries: includedPostingEntries,
    strategicOutcomes: includedStrategicOutcomes,
    bundles: options?.bundles ?? [],
  });
  const repurposing = buildRepurposingInsights(filteredSignals, includedPostingOutcomes);
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
  const editorialConfidence = buildEditorialConfidenceInsights({
    signals: filteredSignals,
    feedbackEntries: includedFeedbackEntries,
    patterns: options?.patterns ?? [],
    bundles: options?.bundles ?? [],
    playbookCards: options?.playbookCards ?? [],
    postingEntries: includedPostingEntries,
    postingOutcomes: includedPostingOutcomes,
    tuning,
  });

  return {
    window,
    windowLabel: formatWindowLabel(window),
    totalSignals: filteredSignals.length,
    dateRangeLabel: formatDateRange(filteredSignals),
    tuning: tuning
      ? {
          presetLabel: tuning.preset === "custom" ? "Custom" : tuning.preset[0].toUpperCase() + tuning.preset.slice(1),
          summary: getOperatorTuningSummary(tuning),
          rows: getOperatorTuningRows(tuning).map((row) => ({
            key: row.key,
            label: row.label,
            valueLabel: row.valueLabel,
          })),
        }
      : {
          presetLabel: "Balanced",
          summary: "Balanced mode. Transformability rescue is medium.",
          rows: [],
        },
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
    assets,
    publishPrep,
    strategicOutcomes,
    repurposing,
    reuseMemory,
    bundleCoverage,
    playbook,
    editorialConfidence,
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
      assets,
      publishPrep,
      strategicOutcomes,
      repurposing,
      reuseMemory,
      bundleCoverage,
      playbook,
      editorialConfidence,
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
      "Editorial confidence is heuristic and advisory only. It reflects confidence in current guidance support, not objective correctness or probabilistic truth.",
      "Pattern candidate suggestions are heuristic only. They do not auto-create patterns, perform similarity matching, or change workflow rules.",
      "Pattern coverage and gap typing are heuristic only. They use explicit keyword buckets and current pattern-match strength, not embeddings or clustering.",
      `Bundle coverage is heuristic only. Strength labels such as ${BUNDLE_COVERAGE_STRENGTH_LABELS.strong_coverage.toLowerCase()} or ${BUNDLE_COVERAGE_STRENGTH_LABELS.thin_bundle.toLowerCase()} come from explicit family matching and current usage signals, not ML or clustering.`,
      "This layer is descriptive only. It summarizes current record state and audited operator actions without tuning scores or changing workflow rules.",
    ],
  };
}
