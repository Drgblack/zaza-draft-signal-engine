import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { CampaignAllocationState } from "@/lib/campaign-allocation";
import type { ExceptionInboxState } from "@/lib/exception-inbox";
import type { FounderOverrideState } from "@/lib/founder-overrides";
import type { FollowUpTask } from "@/lib/follow-up";
import type { InfluencerGraphSummary } from "@/lib/influencer-graph";
import type { OperatorTask, OperatorTaskSummary } from "@/lib/operator-tasks";
import type { RevenueSignalInsights } from "@/lib/revenue-signals";
import {
  getRecommendationFamilyForResourceFocus,
  getRecommendationWeight,
  type RecommendationTuningState,
} from "@/lib/recommendation-tuning";
import type { SourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import type { StrategicDecisionState } from "@/lib/strategic-decisions";
import type { WeeklyExecutionFlow } from "@/lib/weekly-execution";

export const RESOURCE_FOCUS_AREAS = [
  "review_queue",
  "staging_and_posting",
  "campaign_support",
  "source_quality",
  "experiment_resolution",
  "outcome_completion",
  "evergreen_reuse",
  "outreach",
] as const;

export const RESOURCE_FOCUS_URGENCY_LEVELS = ["high", "medium", "low"] as const;
export const RESOURCE_FOCUS_LEVERAGE_LEVELS = ["high", "medium", "low"] as const;
export const RESOURCE_FOCUS_EFFORT_BANDS = ["10 min", "30 min", "60 min"] as const;

export type ResourceFocusArea = (typeof RESOURCE_FOCUS_AREAS)[number];
export type ResourceFocusUrgency = (typeof RESOURCE_FOCUS_URGENCY_LEVELS)[number];
export type ResourceFocusLeverage = (typeof RESOURCE_FOCUS_LEVERAGE_LEVELS)[number];
export type ResourceFocusEffortBand = (typeof RESOURCE_FOCUS_EFFORT_BANDS)[number];

export interface ResourceFocusRecommendation {
  focusArea: ResourceFocusArea;
  urgency: ResourceFocusUrgency;
  leverage: ResourceFocusLeverage;
  recommendation: string;
  reason: string;
  estimatedEffortBand: ResourceFocusEffortBand;
  linkedWorkflow: string;
  supportingSignals: string[];
}

export interface ResourceFocusState {
  generatedAt: string;
  focusStack: ResourceFocusRecommendation[];
  topSummary: string[];
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function urgencyWeight(level: ResourceFocusUrgency) {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function leverageWeight(level: ResourceFocusLeverage) {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function createRecommendation(
  input: ResourceFocusRecommendation,
): ResourceFocusRecommendation {
  return {
    ...input,
    supportingSignals: input.supportingSignals.filter(Boolean).slice(0, 4),
  };
}

function sortRecommendations(
  items: ResourceFocusRecommendation[],
  tuning?: RecommendationTuningState | null,
) {
  return [...items].sort(
    (left, right) =>
      urgencyWeight(right.urgency) - urgencyWeight(left.urgency) ||
      leverageWeight(right.leverage) +
        (getRecommendationWeight(tuning, getRecommendationFamilyForResourceFocus(right.focusArea)) - 1) -
        (leverageWeight(left.leverage) +
          (getRecommendationWeight(tuning, getRecommendationFamilyForResourceFocus(left.focusArea)) - 1)) ||
      left.recommendation.localeCompare(right.recommendation),
  );
}

function buildTopSummary(items: ResourceFocusRecommendation[]) {
  const lines: string[] = [];
  if (items[0]) {
    uniquePush(lines, `${items[0].recommendation} (${items[0].estimatedEffortBand}).`);
  }
  if (items[1]) {
    uniquePush(lines, `${items[1].recommendation} because ${items[1].reason.toLowerCase()}`);
  }
  if (items[2]) {
    uniquePush(lines, `${items[2].focusArea.replaceAll("_", " ")} is the next best leverage bucket.`);
  }
  return lines.slice(0, 3);
}

export function buildResourceFocusState(input: {
  exceptionInbox: ExceptionInboxState;
  operatorTaskSummary: OperatorTaskSummary;
  operatorTasks: OperatorTask[];
  weeklyExecution: WeeklyExecutionFlow;
  campaignAllocation: CampaignAllocationState;
  strategicDecisions: StrategicDecisionState;
  followUpTasks: FollowUpTask[];
  approvalCandidates: ApprovalQueueCandidate[];
  sourceAutopilotState: SourceAutopilotV2State;
  influencerGraphSummary: InfluencerGraphSummary;
  revenueInsights: RevenueSignalInsights;
  activeExperimentCount: number;
  recommendationTuning?: RecommendationTuningState | null;
  founderOverrides?: FounderOverrideState | null;
  now?: Date;
}): ResourceFocusState {
  const now = input.now ?? new Date();
  const recommendations: ResourceFocusRecommendation[] = [];
  const needsJudgementCount =
    input.exceptionInbox.groups.find((group) => group.issueType === "needs_judgement")?.count ?? 0;
  const missingOutcomeCount =
    input.exceptionInbox.groups.find((group) => group.issueType === "missing_outcome")?.count ?? 0;
  const experimentUnresolvedCount =
    input.exceptionInbox.groups.find((group) => group.issueType === "experiment_unresolved")?.count ?? 0;
  const staleReusableCount = input.approvalCandidates.filter(
    (candidate) => candidate.triage.triageState === "stale_but_reusable",
  ).length;
  const repairableCount = input.approvalCandidates.filter(
    (candidate) => candidate.triage.triageState === "repairable",
  ).length;
  const sourcePressure =
    input.sourceAutopilotState.proposalSummary.openPauseCount +
    input.sourceAutopilotState.proposalSummary.openQueryRewriteCount;
  const underSupportedCampaign =
    input.campaignAllocation.recommendations.find((item) => item.supportLevel === "increase") ?? null;
  const outreachOpportunityCount =
    input.influencerGraphSummary.newRepliesPendingCount +
    input.influencerGraphSummary.followUpNeededCount;
  const topFounderOverride = input.founderOverrides?.activeOverrides[0] ?? null;

  if (topFounderOverride) {
    recommendations.push(
      createRecommendation({
        focusArea: "campaign_support",
        urgency: topFounderOverride.priority,
        leverage: "high",
        recommendation: "Apply the active founder override before lower-leverage cleanup",
        reason: `${topFounderOverride.instruction} stays active until ${new Date(topFounderOverride.expiresAt).toLocaleDateString("en-GB")} and should shape what gets attention first.`,
        estimatedEffortBand: "10 min",
        linkedWorkflow: "/overrides",
        supportingSignals: input.founderOverrides?.topNotes.slice(0, 2) ?? [],
      }),
    );
  }

  if (input.weeklyExecution.stagedCount > 0 || input.weeklyExecution.readyToStageCount > 0) {
    recommendations.push(
      createRecommendation({
        focusArea: "staging_and_posting",
        urgency: input.weeklyExecution.stagedCount > 0 ? "high" : "medium",
        leverage: "high",
        recommendation:
          input.weeklyExecution.stagedCount > 0
            ? "Clear staged posting and execution first"
            : "Finish staging the strongest weekly items",
        reason:
          input.weeklyExecution.stagedCount > 0
            ? `${input.weeklyExecution.stagedCount} item${input.weeklyExecution.stagedCount === 1 ? "" : "s"} are already staged and can turn into live distribution with very little operator effort.`
            : `${input.weeklyExecution.readyToStageCount} more item${input.weeklyExecution.readyToStageCount === 1 ? "" : "s"} are almost execution-ready this week.`,
        estimatedEffortBand: input.weeklyExecution.stagedCount > 0 ? "10 min" : "30 min",
        linkedWorkflow: "/execution",
        supportingSignals: [
          input.weeklyExecution.executionReasons[0] ?? "",
          `${input.weeklyExecution.blockedCount} blocked item${input.weeklyExecution.blockedCount === 1 ? "" : "s"} remain visible`,
        ],
      }),
    );
  }

  if (missingOutcomeCount > 0 || input.followUpTasks.length >= 3) {
    recommendations.push(
      createRecommendation({
        focusArea: "outcome_completion",
        urgency: missingOutcomeCount >= 3 ? "high" : "medium",
        leverage: "high",
        recommendation: "Close outcome gaps before the learning loop drifts",
        reason: `${missingOutcomeCount || input.followUpTasks.length} item${(missingOutcomeCount || input.followUpTasks.length) === 1 ? "" : "s"} still need outcome or strategic result capture, which weakens ranking, recap, and revenue learning.`,
        estimatedEffortBand: missingOutcomeCount >= 3 ? "30 min" : "10 min",
        linkedWorkflow: "/follow-up",
        supportingSignals: [
          `${input.followUpTasks.length} follow-up task${input.followUpTasks.length === 1 ? "" : "s"} open`,
          input.revenueInsights.summaries[0] ?? "",
        ],
      }),
    );
  }

  if (sourcePressure > 0) {
    recommendations.push(
      createRecommendation({
        focusArea: "source_quality",
        urgency: input.sourceAutopilotState.proposalSummary.openPauseCount > 0 ? "high" : "medium",
        leverage: "high",
        recommendation: "Spend time on source cleanup before adding more queue volume",
        reason: `${sourcePressure} open source proposal${sourcePressure === 1 ? "" : "s"} suggest upstream noise is still costing review time.`,
        estimatedEffortBand: "30 min",
        linkedWorkflow: "/ingestion",
        supportingSignals: [
          `${input.sourceAutopilotState.proposalSummary.openPauseCount} pause proposal${input.sourceAutopilotState.proposalSummary.openPauseCount === 1 ? "" : "s"}`,
          `${input.sourceAutopilotState.proposalSummary.openQueryRewriteCount} query rewrite${input.sourceAutopilotState.proposalSummary.openQueryRewriteCount === 1 ? "" : "s"}`,
        ],
      }),
    );
  }

  if (needsJudgementCount > 0 || repairableCount > 0) {
    recommendations.push(
      createRecommendation({
        focusArea: "review_queue",
        urgency: needsJudgementCount >= 3 ? "high" : "medium",
        leverage: "medium",
        recommendation: "Use focused review time on the unresolved queue edge cases",
        reason: `${needsJudgementCount} judgement-first item${needsJudgementCount === 1 ? "" : "s"} and ${repairableCount} repairable item${repairableCount === 1 ? "" : "s"} are still absorbing operator attention.`,
        estimatedEffortBand: "30 min",
        linkedWorkflow: "/exceptions",
        supportingSignals: [
          input.exceptionInbox.topSummary[0] ?? "",
          `${input.operatorTaskSummary.highPriorityCount} high-priority operator task${input.operatorTaskSummary.highPriorityCount === 1 ? "" : "s"}`,
        ],
      }),
    );
  }

  if (underSupportedCampaign) {
    recommendations.push(
      createRecommendation({
        focusArea: "campaign_support",
        urgency: underSupportedCampaign.urgency,
        leverage: "high",
        recommendation: `Reallocate attention toward ${underSupportedCampaign.campaignName}`,
        reason: underSupportedCampaign.reason,
        estimatedEffortBand: "30 min",
        linkedWorkflow: underSupportedCampaign.linkedWorkflow,
        supportingSignals: underSupportedCampaign.supportingSignals,
      }),
    );
  }

  if (experimentUnresolvedCount > 0 || input.activeExperimentCount >= 3) {
    recommendations.push(
      createRecommendation({
        focusArea: "experiment_resolution",
        urgency: experimentUnresolvedCount > 0 ? "high" : "medium",
        leverage: "medium",
        recommendation: "Resolve open experiment learning before launching more tests",
        reason:
          experimentUnresolvedCount > 0
            ? `${experimentUnresolvedCount} experiment item${experimentUnresolvedCount === 1 ? "" : "s"} still need an explicit result or decision.`
            : `${input.activeExperimentCount} experiments are still active, which is enough to dilute learning quality if left unresolved.`,
        estimatedEffortBand: "30 min",
        linkedWorkflow: "/experiments",
        supportingSignals: [
          input.strategicDecisions.proposals.find((item) => item.category === "experiment_pacing")?.reason ??
            "",
        ],
      }),
    );
  }

  if (staleReusableCount > 0 && input.weeklyExecution.reviewCount > 0) {
    recommendations.push(
      createRecommendation({
        focusArea: "evergreen_reuse",
        urgency: "medium",
        leverage: "medium",
        recommendation: "Use some time on evergreen reuse instead of only fresh review",
        reason: `${staleReusableCount} stale-but-reusable candidate${staleReusableCount === 1 ? "" : "s"} can help carry the week without depending only on new queue supply.`,
        estimatedEffortBand: "30 min",
        linkedWorkflow: "/weekly-pack",
        supportingSignals: [
          input.strategicDecisions.proposals.find((item) => item.category === "evergreen_balance")?.reason ??
            "",
        ],
      }),
    );
  }

  if (outreachOpportunityCount > 0) {
    recommendations.push(
      createRecommendation({
        focusArea: "outreach",
        urgency: input.influencerGraphSummary.newRepliesPendingCount > 0 ? "high" : "medium",
        leverage: "medium",
        recommendation: "Use a short block on relationship follow-up and outreach",
        reason:
          input.influencerGraphSummary.newRepliesPendingCount > 0
            ? `${input.influencerGraphSummary.newRepliesPendingCount} reply${input.influencerGraphSummary.newRepliesPendingCount === 1 ? "" : "ies"} are waiting and can be answered with existing context.`
            : `${input.influencerGraphSummary.followUpNeededCount} relationship follow-up${input.influencerGraphSummary.followUpNeededCount === 1 ? "" : "s"} are currently open.`,
        estimatedEffortBand: "10 min",
        linkedWorkflow: "/influencers",
        supportingSignals: [
          `${input.influencerGraphSummary.relationshipOpportunityCount} relationship opportunit${input.influencerGraphSummary.relationshipOpportunityCount === 1 ? "y" : "ies"}`,
          input.strategicDecisions.proposals.find((item) => item.category === "outreach_focus")?.reason ??
            "",
        ],
      }),
    );
  }

  const sortedRecommendations = sortRecommendations(recommendations, input.recommendationTuning).slice(0, 3);

  return {
    generatedAt: now.toISOString(),
    focusStack: sortedRecommendations,
    topSummary: buildTopSummary(sortedRecommendations),
  };
}
