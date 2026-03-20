import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildBatchApprovalPrep } from "@/lib/batch-approval";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  type DuplicateCluster,
} from "@/lib/duplicate-clusters";
import type { ManualExperiment } from "@/lib/experiments";
import type { SignalFeedback } from "@/lib/feedback-definitions";
import type { FollowUpTask } from "@/lib/follow-up";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import type { ManagedIngestionSource } from "@/lib/ingestion/types";
import type { PostingOutcome } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, type PatternBundle } from "@/lib/pattern-bundles";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import type { PlaybookCard } from "@/lib/playbook-card-definitions";
import type { SignalPattern } from "@/lib/pattern-definitions";
import type { PostingLogEntry } from "@/lib/posting-memory";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { type StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { OperatorTuningSettings } from "@/lib/tuning";
import type { SignalRecord } from "@/types/signal";
import type { WeeklyPlan, WeeklyPlanState } from "@/lib/weekly-plan";

export interface OperatorDigestTopCandidate {
  signalId: string;
  sourceTitle: string;
  summary: string;
  objective: string;
  whyItMayWork: string;
  conflictSummary: string | null;
  href: string;
}

export interface OperatorDigestHeldItem {
  signalId: string;
  sourceTitle: string;
  stageLabel: string;
  summary: string;
  href: string;
}

export interface OperatorDigestWeeklyGap {
  id: string;
  label: string;
  summary: string;
  href: string;
}

export interface OperatorDigestSourceRecommendation {
  sourceId: string;
  sourceName: string;
  summary: string;
  rationale: string;
  href: string;
}

export interface OperatorDigest {
  generatedAt: string;
  topCandidates: OperatorDigestTopCandidate[];
  conflictSummary: {
    count: number;
    highSeverityCount: number;
    summary: string;
    href: string;
  };
  batchReview: {
    count: number;
    summary: string;
    href: string;
  };
  heldForJudgement: OperatorDigestHeldItem[];
  weeklyGaps: OperatorDigestWeeklyGap[];
  followUpTasks: FollowUpTask[];
  sourceRecommendations: OperatorDigestSourceRecommendation[];
}

function stageLabel(stage: ReturnType<typeof assessAutonomousSignal>["stage"]): string {
  switch (stage) {
    case "auto_interpret":
      return "Needs interpretation";
    case "auto_generate":
      return "Needs generation";
    case "auto_prepare_for_review":
      return "Needs final judgement";
    default:
      return "Held";
  }
}

function reviewPriorityScore(signal: SignalRecord): number {
  if (signal.reviewPriority === "Urgent") {
    return 3;
  }

  if (signal.reviewPriority === "High") {
    return 2;
  }

  if (signal.reviewPriority === "Medium") {
    return 1;
  }

  return 0;
}

export function buildOperatorDigest(input: {
  signals: SignalRecord[];
  feedbackEntries: SignalFeedback[];
  patterns: SignalPattern[];
  playbookCards: PlaybookCard[];
  bundles: PatternBundle[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  duplicateClusters: DuplicateCluster[];
  strategy: CampaignStrategy;
  cadence: CampaignCadenceSummary;
  weeklyPlan: WeeklyPlan | null;
  weeklyPlanState: WeeklyPlanState | null;
  tuning: OperatorTuningSettings;
  managedSources: ManagedIngestionSource[];
  followUpTasks: FollowUpTask[];
  experiments?: ManualExperiment[];
  now?: Date;
}): OperatorDigest {
  const now = input.now ?? new Date();
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
  const visibleSignals = filterSignalsForActiveReviewQueue(input.signals, input.duplicateClusters);
  const confirmedClustersByCanonicalSignalId = indexConfirmedClusterByCanonicalSignalId(input.duplicateClusters);
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    input.signals,
    input.feedbackEntries,
    input.patterns,
    bundleSummariesByPatternId,
    undefined,
    input.playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    input.tuning,
  );
  const autonomousAssessments = visibleSignals.map((signal) => {
    const guidance = buildUnifiedGuidanceModel({
      signal,
      guidance: guidanceBySignalId[signal.recordId],
      context: "review",
      tuning: input.tuning,
    });

    return {
      signal,
      guidance,
      assessment: assessAutonomousSignal(signal, guidance),
    };
  });
  const rankedCandidates = rankApprovalCandidates(
    autonomousAssessments.filter((item) => item.assessment.decision === "approval_ready"),
    5,
    {
      strategy: input.strategy,
      cadence: input.cadence,
      weeklyPlan: input.weeklyPlan,
      weeklyPlanState: input.weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: input.signals,
      postingEntries: input.postingEntries,
      postingOutcomes: input.postingOutcomes,
      strategicOutcomes: input.strategicOutcomes,
      experiments: input.experiments ?? [],
    },
  );
  const batchPrep = buildBatchApprovalPrep({
    candidates: rankedCandidates,
    strategy: input.strategy,
    maxItems: 5,
  });
  const topCandidates = rankedCandidates.map((candidate) => ({
    signalId: candidate.signal.recordId,
    sourceTitle: candidate.signal.sourceTitle,
    summary: candidate.rankReasons[0] ?? candidate.assessment.summary,
    objective: candidate.hypothesis.objective,
    whyItMayWork: candidate.hypothesis.whyItMayWork,
    conflictSummary: candidate.conflicts.topConflicts[0]?.reason ?? null,
    href: `/signals/${candidate.signal.recordId}/review`,
  }));
  const conflictedCandidates = rankedCandidates.filter((candidate) => candidate.conflicts.conflicts.length > 0);
  const highSeverityConflicts = conflictedCandidates.filter(
    (candidate) => candidate.conflicts.highestSeverity === "high",
  );

  const heldForJudgement = autonomousAssessments
    .filter((item) => item.assessment.decision === "hold")
    .sort(
      (left, right) =>
        reviewPriorityScore(right.signal) - reviewPriorityScore(left.signal) ||
        new Date(right.signal.createdDate).getTime() - new Date(left.signal.createdDate).getTime() ||
        left.signal.sourceTitle.localeCompare(right.signal.sourceTitle),
    )
    .slice(0, 5)
    .map((item) => ({
      signalId: item.signal.recordId,
      sourceTitle: item.signal.sourceTitle,
      stageLabel: stageLabel(item.assessment.stage),
      summary: item.assessment.summary,
      href:
        item.assessment.stage === "auto_interpret"
          ? `/signals/${item.signal.recordId}/interpret`
          : item.assessment.stage === "auto_generate"
            ? `/signals/${item.signal.recordId}/generate`
            : `/signals/${item.signal.recordId}/review`,
    }));

  const weeklyGapItems = (input.weeklyPlanState?.gaps.length ?? 0) > 0
    ? input.weeklyPlanState?.gaps ?? []
    : input.weeklyPlanState?.summaries ?? [];
  const weeklyGaps = weeklyGapItems.slice(0, 4).map((summary, index) => ({
    id: `weekly-gap-${index}`,
    label: index === 0 ? "Primary weekly gap" : `Weekly note ${index + 1}`,
    summary,
    href: "/plan",
  }));

  const sourceRecommendations = input.managedSources
    .flatMap((source) =>
      source.recommendations.map((recommendation) => ({
        sourceId: source.id,
        sourceName: source.name,
        summary: recommendation.summary,
        rationale: recommendation.rationale,
        href: `/ingestion#source-${source.id}`,
      })),
    )
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName))
    .slice(0, 6);

  return {
    generatedAt: now.toISOString(),
    topCandidates,
    conflictSummary: {
      count: conflictedCandidates.length,
      highSeverityCount: highSeverityConflicts.length,
      summary:
        highSeverityConflicts[0]?.conflicts.topConflicts[0]?.reason ??
        conflictedCandidates[0]?.conflicts.topConflicts[0]?.reason ??
        "No meaningful package conflicts are surfacing in the current top queue.",
      href: conflictedCandidates.length > 0 ? "/review?view=needs_judgement" : "/review#approval-ready",
    },
    batchReview: {
      count: batchPrep.items.length,
      summary:
        batchPrep.items.length > 0
          ? `${batchPrep.items.length} candidates are staged for one-pass batch review.`
          : "No bounded batch is ready right now.",
      href: "/review/batch",
    },
    heldForJudgement,
    weeklyGaps,
    followUpTasks: input.followUpTasks.filter((task) => task.status === "open").slice(0, 6),
    sourceRecommendations,
  };
}
