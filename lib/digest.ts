import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  type DuplicateCluster,
} from "@/lib/duplicate-clusters";
import type { SignalFeedback } from "@/lib/feedback-definitions";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import type { ManagedIngestionSource } from "@/lib/ingestion/types";
import type { PostingOutcome } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, type PatternBundle } from "@/lib/pattern-bundles";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import type { PlaybookCard } from "@/lib/playbook-card-definitions";
import type { SignalPattern } from "@/lib/pattern-definitions";
import { type PostingLogEntry, getPostingPlatformLabel } from "@/lib/posting-memory";
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

export interface OperatorDigestOutcomeFollowUp {
  postingLogId: string;
  signalId: string;
  sourceTitle: string;
  platformLabel: string;
  postedAt: string;
  missing: string[];
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
  heldForJudgement: OperatorDigestHeldItem[];
  weeklyGaps: OperatorDigestWeeklyGap[];
  outcomeFollowUps: OperatorDigestOutcomeFollowUp[];
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

function isOutcomeFollowUpDue(postedAt: string, now: Date, days = 3): boolean {
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) {
    return false;
  }

  return now.getTime() - posted.getTime() >= days * 24 * 60 * 60 * 1000;
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
  const topCandidates = rankApprovalCandidates(
    autonomousAssessments.filter((item) => item.assessment.decision === "approval_ready"),
    5,
    {
      strategy: input.strategy,
      cadence: input.cadence,
      weeklyPlan: input.weeklyPlan,
      weeklyPlanState: input.weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      postingEntries: input.postingEntries,
    },
  ).map((candidate) => ({
    signalId: candidate.signal.recordId,
    sourceTitle: candidate.signal.sourceTitle,
    summary: candidate.rankReasons[0] ?? candidate.assessment.summary,
    objective: candidate.hypothesis.objective,
    whyItMayWork: candidate.hypothesis.whyItMayWork,
    href: `/signals/${candidate.signal.recordId}/review`,
  }));

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

  const outcomeByPostingLogId = new Map(input.postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicByPostingLogId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const outcomeFollowUps = input.postingEntries
    .filter((entry) => isOutcomeFollowUpDue(entry.postedAt, now))
    .map((entry) => {
      const missing: string[] = [];
      if (!outcomeByPostingLogId.has(entry.id)) {
        missing.push("qualitative outcome");
      }
      if (!strategicByPostingLogId.has(entry.id)) {
        missing.push("strategic outcome");
      }

      if (missing.length === 0) {
        return null;
      }

      const signal = signalById.get(entry.signalId);
      return {
        postingLogId: entry.id,
        signalId: entry.signalId,
        sourceTitle: signal?.sourceTitle ?? "Unknown signal",
        platformLabel: getPostingPlatformLabel(entry.platform),
        postedAt: entry.postedAt,
        missing,
        href: `/signals/${entry.signalId}#posting-log-${entry.id}`,
      } satisfies OperatorDigestOutcomeFollowUp;
    })
    .filter((item): item is OperatorDigestOutcomeFollowUp => Boolean(item))
    .sort(
      (left, right) =>
        right.missing.length - left.missing.length ||
        new Date(left.postedAt).getTime() - new Date(right.postedAt).getTime(),
    )
    .slice(0, 6);

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
    heldForJudgement,
    weeklyGaps,
    outcomeFollowUps,
    sourceRecommendations,
  };
}
