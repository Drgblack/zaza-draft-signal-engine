import type { AttributionInsights } from "@/lib/attribution";
import type { AutonomyScorecardSummary } from "@/lib/autonomy-scorecard";
import type { CampaignAllocationState } from "@/lib/campaign-allocation";
import type { ExceptionInboxState } from "@/lib/exception-inbox";
import type { FounderOverrideState } from "@/lib/founder-overrides";
import type { GrowthDirectorSummary } from "@/lib/growth-director";
import type { GrowthMemoryState } from "@/lib/growth-memory";
import type { GrowthScorecardSummary } from "@/lib/growth-scorecard";
import type { CommercialOpportunityRadarState } from "@/lib/opportunity-radar";
import type { ResourceFocusState } from "@/lib/resource-focus";
import type { RevenueSignalInsights } from "@/lib/revenue-signals";
import {
  inferRecommendationFamilyFromWorkflow,
  getRecommendationWeight,
  type RecommendationTuningState,
} from "@/lib/recommendation-tuning";
import type { SourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import type { StrategicDecisionState } from "@/lib/strategic-decisions";
import type { WeeklyExecutionFlow } from "@/lib/weekly-execution";
import type { WeeklyPlan } from "@/lib/weekly-plan";
import type { WeeklyRecap } from "@/lib/weekly-recap";

export interface ExecutiveBriefingPoint {
  id: string;
  headline: string;
  reason: string;
  linkedWorkflow: string;
  supportingSignals: string[];
}

export interface ExecutiveBriefing {
  generatedAt: string;
  headline: string;
  currentSituation: string;
  thisWeekFocus: string;
  growthSignalSummary: string;
  contentSignalSummary: string;
  executionSignalSummary: string;
  topOpportunities: ExecutiveBriefingPoint[];
  topRisks: ExecutiveBriefingPoint[];
  recommendedActions: ExecutiveBriefingPoint[];
}

function createPoint(input: ExecutiveBriefingPoint): ExecutiveBriefingPoint {
  return {
    ...input,
    supportingSignals: input.supportingSignals.filter(Boolean).slice(0, 3),
  };
}

function sortPoints(
  items: ExecutiveBriefingPoint[],
  tuning?: RecommendationTuningState | null,
) {
  return [...items].sort(
    (left, right) =>
      getRecommendationWeight(tuning, inferRecommendationFamilyFromWorkflow(right.linkedWorkflow, right.headline)) -
        getRecommendationWeight(tuning, inferRecommendationFamilyFromWorkflow(left.linkedWorkflow, left.headline)) ||
      left.headline.localeCompare(right.headline),
  );
}

function currentSituation(input: {
  weeklyExecution: WeeklyExecutionFlow;
  exceptionInbox: ExceptionInboxState;
  growthScorecard: GrowthScorecardSummary;
  weeklyPlan: WeeklyPlan | null;
}) {
  if (input.weeklyExecution.stagedCount > 0) {
    return `${input.weeklyExecution.stagedCount} item${input.weeklyExecution.stagedCount === 1 ? "" : "s"} are already staged, so execution should come before more queue digging.`;
  }

  if (input.exceptionInbox.openCount > 0) {
    return `${input.exceptionInbox.openCount} operator exception${input.exceptionInbox.openCount === 1 ? "" : "s"} are still open, so clearing blocked or judgement-heavy work is slowing everything else down.`;
  }

  if (input.weeklyPlan?.activeCampaignIds.length) {
    return `${input.weeklyPlan.activeCampaignIds.length} active campaign${input.weeklyPlan.activeCampaignIds.length === 1 ? "" : "s"} are in play this week, and the system is stable enough to keep the focus tight.`;
  }

  return input.growthScorecard.overallSummary;
}

function buildHeadline(input: {
  weeklyExecution: WeeklyExecutionFlow;
  resourceFocus: ResourceFocusState;
  growthDirector: GrowthDirectorSummary;
}) {
  if (input.weeklyExecution.stagedCount > 0) {
    return `${input.weeklyExecution.stagedCount} staged item${input.weeklyExecution.stagedCount === 1 ? "" : "s"} are the clearest immediate growth lever.`;
  }

  if (input.resourceFocus.focusStack[0]) {
    return input.resourceFocus.focusStack[0].recommendation;
  }

  return input.growthDirector.currentFocus.label;
}

export function buildExecutiveBriefing(input: {
  weeklyPlan: WeeklyPlan | null;
  growthDirector: GrowthDirectorSummary;
  strategicDecisions: StrategicDecisionState;
  campaignAllocation: CampaignAllocationState;
  resourceFocus: ResourceFocusState;
  weeklyExecution: WeeklyExecutionFlow;
  autonomyScorecard: AutonomyScorecardSummary;
  growthScorecard: GrowthScorecardSummary;
  weeklyRecap: WeeklyRecap;
  revenueInsights: RevenueSignalInsights;
  attributionInsights: AttributionInsights;
  sourceAutopilotState: SourceAutopilotV2State;
  exceptionInbox: ExceptionInboxState;
  opportunityRadar?: CommercialOpportunityRadarState | null;
  growthMemory?: GrowthMemoryState | null;
  recommendationTuning?: RecommendationTuningState | null;
  founderOverrides?: FounderOverrideState | null;
  now?: Date;
}): ExecutiveBriefing {
  const now = input.now ?? new Date();
  const opportunities: ExecutiveBriefingPoint[] = [];
  const risks: ExecutiveBriefingPoint[] = [];
  const recommendedActions: ExecutiveBriefingPoint[] = [];
  const underSupportedCampaign =
    input.campaignAllocation.recommendations.find((item) => item.supportLevel === "increase") ?? null;
  const sourcePressure =
    input.sourceAutopilotState.proposalSummary.openPauseCount +
    input.sourceAutopilotState.proposalSummary.openQueryRewriteCount;
  const topExceptionGroup = input.exceptionInbox.groups[0] ?? null;
  const topCommercialOpportunity = input.opportunityRadar?.opportunities[0] ?? null;
  const topFounderOverride = input.founderOverrides?.activeOverrides[0] ?? null;

  if (topFounderOverride) {
    recommendedActions.push(
      createPoint({
        id: `action-founder-override-${topFounderOverride.overrideId}`,
        headline: "Apply the current founder override first",
        reason: `${topFounderOverride.instruction} remains active until ${new Date(topFounderOverride.expiresAt).toLocaleDateString("en-GB")}.`,
        linkedWorkflow: "/overrides",
        supportingSignals: input.founderOverrides?.topNotes.slice(0, 2) ?? [],
      }),
    );
  }

  if (topCommercialOpportunity) {
    opportunities.push(
      createPoint({
        id: `opportunity-radar-${topCommercialOpportunity.opportunityId}`,
        headline: topCommercialOpportunity.title,
        reason: topCommercialOpportunity.reason,
        linkedWorkflow: topCommercialOpportunity.linkedWorkflow,
        supportingSignals: [
          topCommercialOpportunity.opportunity,
          ...topCommercialOpportunity.supportingSignals,
        ],
      }),
    );
  }

  if (input.growthMemory?.currentBestCombos[0]) {
    opportunities.push(
      createPoint({
        id: `opportunity-memory-${input.growthMemory.currentBestCombos[0].id}`,
        headline: `${input.growthMemory.currentBestCombos[0].label} is reinforced across growth memory`,
        reason: input.growthMemory.currentBestCombos[0].reason,
        linkedWorkflow: input.growthMemory.currentBestCombos[0].href,
        supportingSignals: [
          input.growthMemory.commercialMemory.currentPosture,
          input.growthMemory.audienceMemorySummary.summary,
        ],
      }),
    );
  }

  if (input.revenueInsights.topPlatformDestinationRows[0]) {
    const row = input.revenueInsights.topPlatformDestinationRows[0];
    opportunities.push(
      createPoint({
        id: "opportunity-commercial-combo",
        headline: `${row.label} remains the strongest current commercial path`,
        reason: `${row.count} revenue-linked signal${row.count === 1 ? "" : "s"} and ${row.highStrengthCount} high-strength outcome${row.highStrengthCount === 1 ? "" : "s"} are tied to this pairing.`,
        linkedWorkflow: "/insights",
        supportingSignals: [
          input.revenueInsights.summaries[0] ?? "",
          input.attributionInsights.summaries[0] ?? "",
        ],
      }),
    );
  }

  if (input.weeklyRecap.winners[0]) {
    opportunities.push(
      createPoint({
        id: "opportunity-winner",
        headline: `${input.weeklyRecap.winners[0].label} is still a live winner`,
        reason: input.weeklyRecap.winners[0].reason,
        linkedWorkflow: input.weeklyRecap.winners[0].href ?? "/recap",
        supportingSignals: [
          input.weeklyRecap.summary[0] ?? "",
          input.weeklyRecap.commercialHighlights[0] ?? "",
        ],
      }),
    );
  }

  if (underSupportedCampaign) {
    opportunities.push(
      createPoint({
        id: "opportunity-campaign",
        headline: `${underSupportedCampaign.campaignName} deserves more weekly support`,
        reason: underSupportedCampaign.reason,
        linkedWorkflow: underSupportedCampaign.linkedWorkflow,
        supportingSignals: [
          underSupportedCampaign.suggestedWeeklyShare,
          underSupportedCampaign.supportingSignals[0] ?? "",
        ],
      }),
    );
  }

  if (input.weeklyExecution.stagedCount > 0) {
    opportunities.push(
      createPoint({
        id: "opportunity-execution",
        headline: `${input.weeklyExecution.stagedCount} item${input.weeklyExecution.stagedCount === 1 ? "" : "s"} are ready to turn into live distribution`,
        reason: "The weekly execution flow already has staged work, so there is no need to create more content before using the ready output.",
        linkedWorkflow: "/execution",
        supportingSignals: [
          input.weeklyExecution.executionReasons[0] ?? "",
          `${input.weeklyExecution.readyToStageCount} more item${input.weeklyExecution.readyToStageCount === 1 ? "" : "s"} are close behind`,
        ],
      }),
    );
  }

  if (topExceptionGroup) {
    risks.push(
      createPoint({
        id: "risk-exceptions",
        headline: `${topExceptionGroup.count} item${topExceptionGroup.count === 1 ? "" : "s"} still need direct operator judgement`,
        reason:
          input.exceptionInbox.topSummary[0] ??
          `${topExceptionGroup.label} is the largest current exception bucket.`,
        linkedWorkflow: "/exceptions",
        supportingSignals: topExceptionGroup.items[0]?.supportingSignals ?? [],
      }),
    );
  }

  if (input.weeklyRecap.supportingMetrics.postsMissingStrategicOutcome > 0) {
    risks.push(
      createPoint({
        id: "risk-outcomes",
        headline: "Missing outcomes are slowing learning",
        reason: `${input.weeklyRecap.supportingMetrics.postsMissingStrategicOutcome} posted item${input.weeklyRecap.supportingMetrics.postsMissingStrategicOutcome === 1 ? "" : "s"} still lack strategic outcomes, which weakens ranking and recap quality.`,
        linkedWorkflow: "/follow-up",
        supportingSignals: [
          input.growthScorecard.topConcerns.find((item) => item.id === "outcome-gaps")?.reason ?? "",
          input.autonomyScorecard.summaries.find((item) => item.includes("operator effort")) ?? "",
        ],
      }),
    );
  }

  if (sourcePressure > 0) {
    risks.push(
      createPoint({
        id: "risk-source-drift",
        headline: "Source quality drift is creating avoidable queue noise",
        reason: `${sourcePressure} open source proposal${sourcePressure === 1 ? "" : "s"} suggest upstream quality is still leaking review time.`,
        linkedWorkflow: "/ingestion",
        supportingSignals: [
          `${input.sourceAutopilotState.proposalSummary.openPauseCount} pause proposal${input.sourceAutopilotState.proposalSummary.openPauseCount === 1 ? "" : "s"}`,
          `${input.sourceAutopilotState.proposalSummary.openQueryRewriteCount} query rewrite${input.sourceAutopilotState.proposalSummary.openQueryRewriteCount === 1 ? "" : "s"}`,
        ],
      }),
    );
  }

  if (input.weeklyExecution.blockedCount > 0 || input.autonomyScorecard.blockedByPolicyCount > 0) {
    risks.push(
      createPoint({
        id: "risk-policy-blocks",
        headline: "Automation is still getting blocked in a few high-value paths",
        reason:
          input.autonomyScorecard.topBlockers[0]
            ? `${input.autonomyScorecard.topBlockers[0].count} item${input.autonomyScorecard.topBlockers[0].count === 1 ? "" : "s"} are being held back by ${input.autonomyScorecard.topBlockers[0].label.toLowerCase()}.`
            : `${input.weeklyExecution.blockedCount} weekly execution item${input.weeklyExecution.blockedCount === 1 ? "" : "s"} remain blocked.`,
        linkedWorkflow: "/execution",
        supportingSignals: [
          `${Math.round(input.autonomyScorecard.blockedRate * 100)}% blocked rate`,
          `${input.weeklyExecution.blockedCount} blocked in weekly execution`,
        ],
      }),
    );
  }

  if (input.growthMemory?.currentWeakCombos[0]) {
    risks.push(
      createPoint({
        id: `risk-memory-${input.growthMemory.currentWeakCombos[0].id}`,
        headline: "A repeated weak combination is still showing up in memory",
        reason: `${input.growthMemory.currentWeakCombos[0].label}. ${input.growthMemory.currentWeakCombos[0].reason}`,
        linkedWorkflow: input.growthMemory.currentWeakCombos[0].href,
        supportingSignals: [
          input.growthMemory.cautionMemorySummary.headline,
        ],
      }),
    );
  }

  for (const item of input.resourceFocus.focusStack.slice(0, 3)) {
    recommendedActions.push(
      createPoint({
        id: `action-${item.focusArea}`,
        headline: item.recommendation,
        reason: item.reason,
        linkedWorkflow: item.linkedWorkflow,
        supportingSignals: [
          item.estimatedEffortBand,
          item.supportingSignals[0] ?? "",
        ],
      }),
    );
  }

  if (recommendedActions.length === 0) {
    for (const item of input.growthDirector.recommendedActions.slice(0, 3)) {
      recommendedActions.push(
        createPoint({
          id: `action-director-${item.id}`,
          headline: item.label,
          reason: item.reason,
          linkedWorkflow: item.href,
          supportingSignals: item.supportingSignals,
        }),
      );
    }
  }

  const growthSignalSummary =
    input.opportunityRadar?.topSummary ??
    input.growthMemory?.commercialMemory.summary ??
    input.revenueInsights.summaries[0] ??
    input.attributionInsights.summaries[0] ??
    input.weeklyRecap.commercialHighlights[0] ??
    "No stable commercial growth signal is strong enough to summarize yet.";
  const contentSignalSummary =
    input.growthMemory?.audienceMemorySummary.summary ??
    input.strategicDecisions.topSummary[0] ??
    input.campaignAllocation.topSummary ??
    input.weeklyRecap.summary[0] ??
    "The content system is stable, but no dominant content-side call is strong enough yet.";
  const executionSignalSummary =
    input.weeklyExecution.stagedCount > 0
      ? `${input.weeklyExecution.stagedCount} staged, ${input.weeklyExecution.readyToStageCount} ready to stage, ${input.weeklyExecution.reviewCount} still need review, and ${input.weeklyExecution.blockedCount} remain blocked.`
      : input.exceptionInbox.topSummary[0] ??
        "Execution is not blocked, but there is no staged work ready yet.";

  const sortedOpportunities = sortPoints(opportunities, input.recommendationTuning);
  const sortedRisks = sortPoints(risks, input.recommendationTuning);
  const sortedActions = sortPoints(recommendedActions, input.recommendationTuning);

  return {
    generatedAt: now.toISOString(),
    headline: buildHeadline({
      weeklyExecution: input.weeklyExecution,
      resourceFocus: input.resourceFocus,
      growthDirector: input.growthDirector,
    }),
    currentSituation: currentSituation({
      weeklyExecution: input.weeklyExecution,
      exceptionInbox: input.exceptionInbox,
      growthScorecard: input.growthScorecard,
      weeklyPlan: input.weeklyPlan,
    }),
    thisWeekFocus: input.resourceFocus.focusStack[0]?.reason ?? input.growthDirector.currentFocus.reason,
    growthSignalSummary,
    contentSignalSummary,
    executionSignalSummary,
    topOpportunities: sortedOpportunities.slice(0, 4),
    topRisks: sortedRisks.slice(0, 4),
    recommendedActions: sortedActions.slice(0, 3),
  };
}
