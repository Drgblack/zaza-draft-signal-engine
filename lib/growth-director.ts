import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { DistributionSummary } from "@/lib/distribution";
import type { FlywheelOptimisationState } from "@/lib/flywheel-optimisation";
import type { FollowUpTask } from "@/lib/follow-up";
import type { InfluencerGraphSummary } from "@/lib/influencer-graph";
import type { NarrativeSequenceInsights } from "@/lib/narrative-sequences";
import type { OperatorTask, OperatorTaskSummary } from "@/lib/operator-tasks";
import type { GrowthScorecardSummary } from "@/lib/growth-scorecard";
import type { RevenueSignalInsights } from "@/lib/revenue-signals";
import type { SourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import type { WeeklyRecap } from "@/lib/weekly-recap";
import type { WeeklyPostingPack } from "@/lib/weekly-posting-pack";
import type { WeeklyPlan } from "@/lib/weekly-plan";
import type { ZazaConnectBridgeSummary } from "@/lib/zaza-connect-bridge";

export const GROWTH_DIRECTOR_PRIORITY_LEVELS = ["high", "medium", "low"] as const;
export type GrowthDirectorPriorityLevel = (typeof GROWTH_DIRECTOR_PRIORITY_LEVELS)[number];

export interface GrowthDirectorFocus {
  label: string;
  reason: string;
  href: string;
}

export interface GrowthDirectorRecommendation {
  id: string;
  label: string;
  reason: string;
  href: string;
  priority: GrowthDirectorPriorityLevel;
  supportingSignals: string[];
}

export interface GrowthDirectorSummary {
  generatedAt: string;
  currentFocus: GrowthDirectorFocus;
  topPriorities: GrowthDirectorRecommendation[];
  topBottlenecks: GrowthDirectorRecommendation[];
  strongestOpportunities: GrowthDirectorRecommendation[];
  recommendedActions: GrowthDirectorRecommendation[];
  supportingSignals: string[];
  planningSummary: string;
  contentSummary: string;
  distributionSummary: string;
  revenueSummary: string;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function priorityWeight(priority: GrowthDirectorPriorityLevel) {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function createRecommendation(input: {
  id: string;
  label: string;
  reason: string;
  href: string;
  priority: GrowthDirectorPriorityLevel;
  supportingSignals?: string[];
}): GrowthDirectorRecommendation {
  return {
    ...input,
    supportingSignals: (input.supportingSignals ?? []).filter(Boolean).slice(0, 4),
  };
}

function sortRecommendations(items: GrowthDirectorRecommendation[]) {
  return [...items].sort(
    (left, right) =>
      priorityWeight(right.priority) - priorityWeight(left.priority) ||
      left.label.localeCompare(right.label),
  );
}

function pickCurrentFocus(input: {
  operatorTaskSummary: OperatorTaskSummary;
  weeklyPostingPack: WeeklyPostingPack;
  distributionSummary: DistributionSummary;
  sourceAutopilotState: SourceAutopilotV2State;
  weeklyRecap: WeeklyRecap;
}) {
  if (input.operatorTaskSummary.highPriorityCount > 0) {
    return {
      label: "Clear the highest-leverage operator backlog",
      reason: `${input.operatorTaskSummary.highPriorityCount} high-priority task${input.operatorTaskSummary.highPriorityCount === 1 ? "" : "s"} are still blocking cleaner automation and review flow.`,
      href: "/tasks",
    } satisfies GrowthDirectorFocus;
  }

  if (input.weeklyPostingPack.items.length > 0 && input.distributionSummary.readyCount === 0) {
    return {
      label: "Turn this week’s pack into execution-ready posts",
      reason: `${input.weeklyPostingPack.items.length} recommended pack item${input.weeklyPostingPack.items.length === 1 ? "" : "s"} exist, but nothing is staged for posting yet.`,
      href: "/execution",
    } satisfies GrowthDirectorFocus;
  }

  if (input.sourceAutopilotState.proposalSummary.openPauseCount > 0) {
    return {
      label: "Repair weak sources before adding more queue volume",
      reason: `${input.sourceAutopilotState.proposalSummary.openPauseCount} source pause proposal${input.sourceAutopilotState.proposalSummary.openPauseCount === 1 ? "" : "s"} indicate upstream quality drift.`,
      href: "/ingestion",
    } satisfies GrowthDirectorFocus;
  }

  return {
    label: "Double down on what is already working",
    reason:
      input.weeklyRecap.winners[0]?.reason ??
      input.weeklyRecap.summary[0] ??
      "The strongest available move is to keep the weekly mix grounded in current winners.",
    href: input.weeklyRecap.winners[0]?.href ?? "/recap",
  } satisfies GrowthDirectorFocus;
}

export function buildGrowthDirector(input: {
  weeklyPlan: WeeklyPlan | null;
  weeklyPostingPack: WeeklyPostingPack;
  approvalCandidates: ApprovalQueueCandidate[];
  operatorTaskSummary: OperatorTaskSummary;
  operatorTasks: OperatorTask[];
  followUpTasks: FollowUpTask[];
  weeklyRecap: WeeklyRecap;
  sourceAutopilotState: SourceAutopilotV2State;
  optimisation: FlywheelOptimisationState;
  influencerGraphSummary: InfluencerGraphSummary;
  distributionSummary: DistributionSummary;
  revenueInsights: RevenueSignalInsights;
  narrativeSequenceInsights: NarrativeSequenceInsights;
  connectBridgeSummary?: ZazaConnectBridgeSummary | null;
  scorecard?: GrowthScorecardSummary | null;
  now?: Date;
}): GrowthDirectorSummary {
  const now = input.now ?? new Date();
  const staleCount = input.approvalCandidates.filter((candidate) =>
    ["stale", "stale_but_reusable", "stale_needs_refresh"].includes(candidate.stale.state),
  ).length;
  const lowConfidenceCount = input.approvalCandidates.filter(
    (candidate) => candidate.automationConfidence.level === "low",
  ).length;
  const conflictCount = input.approvalCandidates.filter(
    (candidate) => candidate.conflicts.highestSeverity === "high" || candidate.conflicts.highestSeverity === "medium",
  ).length;
  const highConfidenceCount = input.approvalCandidates.filter(
    (candidate) => candidate.automationConfidence.level === "high",
  ).length;
  const duplicateTask = input.operatorTaskSummary.byType.find(
    (row) => row.taskType === "confirm_duplicate_cluster",
  );
  const staleTask = input.operatorTaskSummary.byType.find(
    (row) => row.taskType === "refresh_stale_candidate",
  );
  const missingOutcomeTask = input.operatorTaskSummary.byType.find(
    (row) => row.taskType === "fill_missing_strategic_outcome",
  );
  const sourceRepairPressure =
    input.sourceAutopilotState.proposalSummary.openPauseCount +
    input.sourceAutopilotState.proposalSummary.openQueryRewriteCount;

  const topPriorities: GrowthDirectorRecommendation[] = [];
  const topBottlenecks: GrowthDirectorRecommendation[] = [];
  const strongestOpportunities: GrowthDirectorRecommendation[] = [];

  if (input.weeklyPostingPack.items.length > 0 && input.distributionSummary.readyCount < 2) {
    topPriorities.push(
      createRecommendation({
        id: "priority-stage-pack",
        label: "Stage the weekly posting pack for execution",
        reason: `${input.weeklyPostingPack.items.length} recommended item${input.weeklyPostingPack.items.length === 1 ? "" : "s"} are ready, but only ${input.distributionSummary.readyCount} staged package${input.distributionSummary.readyCount === 1 ? "" : "s"} exist.`,
        href: "/execution",
        priority: "high",
        supportingSignals: [
          input.weeklyPostingPack.coverageSummary.summary,
          `${input.distributionSummary.bundleCount} distribution bundle${input.distributionSummary.bundleCount === 1 ? "" : "s"} ready`,
        ],
      }),
    );
  }

  if (input.operatorTaskSummary.highPriorityCount > 0) {
    topPriorities.push(
      createRecommendation({
        id: "priority-operator-backlog",
        label: "Clear the high-priority operator backlog",
        reason: `${input.operatorTaskSummary.highPriorityCount} high-priority task${input.operatorTaskSummary.highPriorityCount === 1 ? "" : "s"} are blocking cleaner planning, review, or learning loops.`,
        href: "/tasks",
        priority: "high",
        supportingSignals: [
          input.operatorTaskSummary.topBottlenecks[0]
            ? `${input.operatorTaskSummary.topBottlenecks[0].count} ${input.operatorTaskSummary.topBottlenecks[0].label.toLowerCase()}`
            : `${input.operatorTaskSummary.openCount} open operator tasks`,
        ],
      }),
    );
  }

  if (input.optimisation.highestPriorityProposal) {
    topPriorities.push(
      createRecommendation({
        id: "priority-optimisation",
        label: input.optimisation.highestPriorityProposal.targetLabel,
        reason: input.optimisation.highestPriorityProposal.reason,
        href: input.optimisation.highestPriorityProposal.href,
        priority:
          input.optimisation.highestPriorityProposal.priority === "high" ? "high" : "medium",
        supportingSignals: input.optimisation.highestPriorityProposal.supportingSignals,
      }),
    );
  }

  if (input.weeklyRecap.winners[0]) {
    topPriorities.push(
      createRecommendation({
        id: "priority-winner",
        label: `Lean into ${input.weeklyRecap.winners[0].label}`,
        reason: input.weeklyRecap.winners[0].reason,
        href: input.weeklyRecap.winners[0].href ?? "/recap",
        priority: input.weeklyRecap.winners[0].score >= 8 ? "high" : "medium",
        supportingSignals: [input.weeklyRecap.summary[0] ?? "", ...input.weeklyRecap.commercialHighlights.slice(0, 1)],
      }),
    );
  }

  if (input.connectBridgeSummary && input.connectBridgeSummary.importedThemeCount > 0) {
    topPriorities.push(
      createRecommendation({
        id: "priority-connect-theme",
        label: "Use imported Zaza Connect themes in planning and outreach",
        reason:
          input.connectBridgeSummary.topNotes[0] ??
          "Imported cross-app context is now available and should shape trust or collaboration-friendly content.",
        href: "/connect-bridge",
        priority: "medium",
        supportingSignals: [
          `${input.connectBridgeSummary.importedThemeCount} imported theme${input.connectBridgeSummary.importedThemeCount === 1 ? "" : "s"}`,
          `${input.connectBridgeSummary.collaborationOpportunityCount} collaboration opportunit${input.connectBridgeSummary.collaborationOpportunityCount === 1 ? "y" : "ies"}`,
        ],
      }),
    );
  }

  if (missingOutcomeTask?.count || input.weeklyRecap.supportingMetrics.postsMissingStrategicOutcome > 0) {
    topBottlenecks.push(
      createRecommendation({
        id: "bottleneck-outcomes",
        label: "Outcome memory is still incomplete",
        reason: `${input.weeklyRecap.supportingMetrics.postsMissingStrategicOutcome} post${input.weeklyRecap.supportingMetrics.postsMissingStrategicOutcome === 1 ? "" : "s"} still need strategic outcome updates, which weakens ranking and recap quality.`,
        href: "/follow-up",
        priority: "high",
        supportingSignals: [
          `${input.followUpTasks.length} follow-up task${input.followUpTasks.length === 1 ? "" : "s"} open`,
          `${missingOutcomeTask?.count ?? 0} operator task${(missingOutcomeTask?.count ?? 0) === 1 ? "" : "s"} for missing strategic outcomes`,
        ],
      }),
    );
  }

  if (staleCount > 0 || staleTask?.count) {
    topBottlenecks.push(
      createRecommendation({
        id: "bottleneck-stale",
        label: "Stale queue pressure is building",
        reason: `${staleCount} approval candidate${staleCount === 1 ? "" : "s"} are already stale or need refresh, which lowers queue quality and slows review.`,
        href: "/review?view=stale",
        priority: staleCount >= 3 ? "high" : "medium",
        supportingSignals: [
          `${staleTask?.count ?? 0} refresh task${(staleTask?.count ?? 0) === 1 ? "" : "s"}`,
          `${conflictCount} conflicted approval candidate${conflictCount === 1 ? "" : "s"}`,
        ],
      }),
    );
  }

  if (duplicateTask?.count) {
    topBottlenecks.push(
      createRecommendation({
        id: "bottleneck-duplicates",
        label: "Duplicate or borderline decisions are blocking queue quality",
        reason: `${duplicateTask.count} duplicate-cluster confirmation${duplicateTask.count === 1 ? "" : "s"} are still unresolved.`,
        href: "/tasks",
        priority: duplicateTask.count >= 2 ? "high" : "medium",
        supportingSignals: [
          `${input.operatorTaskSummary.openCount} open operator tasks`,
          `${lowConfidenceCount} low-confidence candidate${lowConfidenceCount === 1 ? "" : "s"}`,
        ],
      }),
    );
  }

  if (sourceRepairPressure > 0) {
    topBottlenecks.push(
      createRecommendation({
        id: "bottleneck-sources",
        label: "Source quality drift is leaking review time",
        reason: `${sourceRepairPressure} open source change proposal${sourceRepairPressure === 1 ? "" : "s"} indicate weak or noisy upstream supply.`,
        href: "/ingestion",
        priority: input.sourceAutopilotState.proposalSummary.openPauseCount > 0 ? "high" : "medium",
        supportingSignals: [
          `${input.sourceAutopilotState.proposalSummary.openPauseCount} pause proposal${input.sourceAutopilotState.proposalSummary.openPauseCount === 1 ? "" : "s"}`,
          `${input.sourceAutopilotState.proposalSummary.openQueryRewriteCount} query rewrite${input.sourceAutopilotState.proposalSummary.openQueryRewriteCount === 1 ? "" : "s"}`,
        ],
      }),
    );
  }

  if (input.weeklyRecap.reuseCandidates[0]) {
    strongestOpportunities.push(
      createRecommendation({
        id: "opportunity-reuse",
        label: `Reuse ${input.weeklyRecap.reuseCandidates[0].label}`,
        reason: input.weeklyRecap.reuseCandidates[0].reason,
        href: input.weeklyRecap.reuseCandidates[0].href ?? "/recap",
        priority: "high",
        supportingSignals: input.weeklyRecap.commercialHighlights.slice(0, 2),
      }),
    );
  }

  if (input.revenueInsights.topPlatformDestinationRows[0]) {
    strongestOpportunities.push(
      createRecommendation({
        id: "opportunity-revenue-combo",
        label: `Push ${input.revenueInsights.topPlatformDestinationRows[0].label}`,
        reason: `${input.revenueInsights.topPlatformDestinationRows[0].label} is the strongest current revenue-linked combo.`,
        href: "/insights",
        priority: input.revenueInsights.topPlatformDestinationRows[0].highStrengthCount >= 2 ? "high" : "medium",
        supportingSignals: [
          `${input.revenueInsights.topPlatformDestinationRows[0].count} revenue-linked signal${input.revenueInsights.topPlatformDestinationRows[0].count === 1 ? "" : "s"}`,
          `${input.revenueInsights.topPlatformDestinationRows[0].highStrengthCount} high-strength revenue result${input.revenueInsights.topPlatformDestinationRows[0].highStrengthCount === 1 ? "" : "s"}`,
        ],
      }),
    );
  }

  if (input.narrativeSequenceInsights.sequenceCount > 0) {
    strongestOpportunities.push(
      createRecommendation({
        id: "opportunity-sequence",
        label: "Use cross-platform sequencing deliberately",
        reason: input.narrativeSequenceInsights.summary,
        href: "/weekly-pack",
        priority: input.narrativeSequenceInsights.strongOutcomeCount > 0 ? "medium" : "low",
        supportingSignals: [
          `${input.narrativeSequenceInsights.sequenceCount} sequence${input.narrativeSequenceInsights.sequenceCount === 1 ? "" : "s"}`,
          `${input.narrativeSequenceInsights.strongOutcomeCount} strong sequenced outcome${input.narrativeSequenceInsights.strongOutcomeCount === 1 ? "" : "s"}`,
        ],
      }),
    );
  }

  if (input.influencerGraphSummary.followUpNeededCount > 0 || input.influencerGraphSummary.newRepliesPendingCount > 0) {
    strongestOpportunities.push(
      createRecommendation({
        id: "opportunity-relationships",
        label: "Use relationship memory to support growth",
        reason:
          input.influencerGraphSummary.newRepliesPendingCount > 0
            ? `${input.influencerGraphSummary.newRepliesPendingCount} reply${input.influencerGraphSummary.newRepliesPendingCount === 1 ? "" : "ies"} are waiting and can be handled with context-aware outreach.`
            : `${input.influencerGraphSummary.followUpNeededCount} relationship follow-up${input.influencerGraphSummary.followUpNeededCount === 1 ? "" : "s"} are currently open.`,
        href: "/influencers",
        priority: "medium",
        supportingSignals: [
          `${input.influencerGraphSummary.relationshipOpportunityCount} relationship opportunit${input.influencerGraphSummary.relationshipOpportunityCount === 1 ? "y" : "ies"}`,
          `${input.connectBridgeSummary?.collaborationOpportunityCount ?? 0} imported collaboration opportunit${(input.connectBridgeSummary?.collaborationOpportunityCount ?? 0) === 1 ? "y" : "ies"}`,
        ],
      }),
    );
  }

  const combinedActions = sortRecommendations([
    ...topPriorities,
    ...topBottlenecks,
    ...strongestOpportunities,
  ]);

  const recommendedActions = combinedActions.slice(0, 3);
  const planningSummary = input.weeklyPostingPack.coverageSummary.summary;
  const contentSummary = `${input.approvalCandidates.length} approval-ready candidate${input.approvalCandidates.length === 1 ? "" : "s"} · ${highConfidenceCount} high-confidence · ${lowConfidenceCount} low-confidence · ${staleCount} stale`;
  const distributionSummary = input.distributionSummary.readyCount > 0
    ? `${input.distributionSummary.readyCount} staged package${input.distributionSummary.readyCount === 1 ? "" : "s"} across ${input.distributionSummary.bundleCount} bundle${input.distributionSummary.bundleCount === 1 ? "" : "s"}.`
    : "No posting package is staged yet.";
  const revenueSummary =
    input.revenueInsights.summaries[0] ??
    input.weeklyRecap.commercialHighlights[0] ??
    "No strong revenue-linked pattern is stable enough yet.";

  const supportingSignals: string[] = [];
  uniquePush(supportingSignals, planningSummary);
  uniquePush(supportingSignals, contentSummary);
  uniquePush(supportingSignals, distributionSummary);
  uniquePush(supportingSignals, `${input.operatorTaskSummary.openCount} open operator task${input.operatorTaskSummary.openCount === 1 ? "" : "s"} and ${input.followUpTasks.length} follow-up task${input.followUpTasks.length === 1 ? "" : "s"}.`);
  uniquePush(supportingSignals, revenueSummary);
  if (input.scorecard?.topConcerns[0]) {
    uniquePush(supportingSignals, `Scorecard concern: ${input.scorecard.topConcerns[0].reason}`);
  }
  if (input.scorecard?.topPositives[0]) {
    uniquePush(supportingSignals, `Scorecard positive: ${input.scorecard.topPositives[0].reason}`);
  }
  if (input.connectBridgeSummary?.topNotes[0]) {
    uniquePush(supportingSignals, input.connectBridgeSummary.topNotes[0]);
  }

  return {
    generatedAt: now.toISOString(),
    currentFocus: pickCurrentFocus({
      operatorTaskSummary: input.operatorTaskSummary,
      weeklyPostingPack: input.weeklyPostingPack,
      distributionSummary: input.distributionSummary,
      sourceAutopilotState: input.sourceAutopilotState,
      weeklyRecap: input.weeklyRecap,
    }),
    topPriorities: sortRecommendations(topPriorities).slice(0, 5),
    topBottlenecks: sortRecommendations(topBottlenecks).slice(0, 3),
    strongestOpportunities: sortRecommendations(strongestOpportunities).slice(0, 4),
    recommendedActions,
    supportingSignals: supportingSignals.slice(0, 6),
    planningSummary,
    contentSummary,
    distributionSummary,
    revenueSummary,
  };
}
