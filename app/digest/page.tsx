import Link from "next/link";

import { CampaignAllocationPanel } from "@/components/campaigns/campaign-allocation-panel";
import { FunnelEnginePanel } from "@/components/plan/funnel-engine-panel";
import { ExecutiveBriefingPanel } from "@/components/director/executive-briefing-panel";
import { FounderOverrideSummary } from "@/components/overrides/founder-override-summary";
import { GrowthMemoryPanel } from "@/components/director/growth-memory-panel";
import { GrowthDirectorPanel } from "@/components/director/growth-director-panel";
import { OpportunityRadarPanel } from "@/components/director/opportunity-radar-panel";
import { ResourceFocusPanel } from "@/components/director/resource-focus-panel";
import { FlywheelOptimisationPanel } from "@/components/optimisation/flywheel-optimisation-panel";
import { FollowUpTaskList } from "@/components/follow-up/follow-up-task-list";
import { WeeklyRecapPanel } from "@/components/recap/weekly-recap-panel";
import { GrowthScorecardPanel } from "@/components/scorecard/growth-scorecard-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/signal-repository";
import { buildAudienceMemoryState } from "@/lib/audience-memory";
import { appendAuditEventsSafe, listAuditEvents } from "@/lib/audit";
import { buildAttributionInsights, buildAttributionRecordsFromInputs } from "@/lib/attribution";
import { buildAutonomyScorecard } from "@/lib/autonomy-scorecard";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildCampaignAllocationState } from "@/lib/campaign-allocation";
import { buildCampaignLifecycleState } from "@/lib/campaign-lifecycle";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildOperatorDigest } from "@/lib/digest";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { buildExecutiveBriefing } from "@/lib/executive-briefing";
import { syncFounderOverrideState } from "@/lib/founder-overrides";
import { buildAdaptiveFunnelState } from "@/lib/funnel-engine";
import { listContentOpportunityState } from "@/lib/content-opportunities";
import { syncExceptionInbox } from "@/lib/exception-inbox";
import { buildAutonomousExperimentProposals, buildExperimentProposalInsights, listExperimentProposals } from "@/lib/experiment-proposals";
import { buildExperimentInsights, listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { listFollowUpTasks } from "@/lib/follow-up";
import { buildFlywheelOptimisation } from "@/lib/flywheel-optimisation";
import { buildGrowthDirector } from "@/lib/growth-director";
import { buildGrowthMemory } from "@/lib/growth-memory";
import { buildGrowthScorecard } from "@/lib/growth-scorecard";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { buildInfluencerGraphState } from "@/lib/influencer-graph";
import { getManagedIngestionSourcesWithFallback } from "@/lib/ingestion/source-performance";
import { listIngestionSources } from "@/lib/ingestion/sources";
import { buildOperatorTaskSummary, listOperatorTasks } from "@/lib/operator-tasks";
import {
  buildNarrativeSequenceInsights,
  buildNarrativeSequencesForSignals,
} from "@/lib/narrative-sequences";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingAssistantPackages } from "@/lib/posting-assistant";
import { buildCommercialOpportunityRadar } from "@/lib/opportunity-radar";
import { buildRevenueAmplifierState } from "@/lib/revenue-amplifier";
import { syncRecommendationTuningState } from "@/lib/recommendation-tuning";
import { buildResourceFocusState } from "@/lib/resource-focus";
import { buildRevenueSignalInsights, syncRevenueSignals } from "@/lib/revenue-signals";
import { buildSafeReplyState } from "@/lib/safe-replies";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { buildQueueTriageInsights } from "@/lib/queue-triage";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { buildStrategicDecisionState } from "@/lib/strategic-decisions";
import { buildSourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import { getOperatorTuning } from "@/lib/tuning";
import { formatDateTime } from "@/lib/utils";
import { runWeeklyExecutionAutopilot } from "@/lib/weekly-execution";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { buildWeeklyPostingPack, buildWeeklyPostingPackInsights } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan, getWeeklyPlanStore } from "@/lib/weekly-plan";
import {
  buildZazaConnectBridgeSummary,
  getLatestZazaConnectExport,
  listImportedZazaConnectContexts,
} from "@/lib/zaza-connect-bridge";

export const dynamic = "force-dynamic";

export default async function DigestPage() {
  const [
    signalResult,
    feedbackEntries,
    patterns,
    playbookCards,
    bundles,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    storedExperimentProposals,
    duplicateClusters,
    strategy,
    tuning,
    auditEvents,
    ingestionSources,
    managedSourceResult,
    influencerGraph,
    safeReplies,
    importedConnectContexts,
    latestConnectExport,
    founderOverrides,
    factoryInputState,
  ] = await Promise.all([
    listSignalsWithFallback({ limit: 1000 }),
    listFeedbackEntries(),
    listPatterns(),
    listPlaybookCards(),
    listPatternBundles(),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
    listExperiments(),
    listExperimentProposals(),
    listDuplicateClusters(),
    getCampaignStrategy(),
    getOperatorTuning(),
    listAuditEvents(),
    listIngestionSources(),
    getManagedIngestionSourcesWithFallback(),
    buildInfluencerGraphState(),
    buildSafeReplyState(),
    listImportedZazaConnectContexts(),
    getLatestZazaConnectExport(),
    syncFounderOverrideState(),
    listContentOpportunityState(),
  ]);

  const weeklyPlanStore = await getWeeklyPlanStore(strategy);
  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
  const existingStagedPostingPackages = await listPostingAssistantPackages({ status: "active" });
  const cadence = buildCampaignCadenceSummary(signalResult.signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, signalResult.signals, postingEntries);
  const followUpTasks = await listFollowUpTasks({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    weeklyPlans: weeklyPlanStore.plans,
  });
  const operatorTasks = await listOperatorTasks({
    signals: signalResult.signals,
    feedbackEntries,
    patterns,
    playbookCards,
    bundles,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    duplicateClusters,
    strategy,
    cadence,
    weeklyPlan,
    weeklyPlanState,
    tuning: tuning.settings,
    experiments,
  });
  const operatorTaskSummary = buildOperatorTaskSummary(operatorTasks);
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: signalResult.signals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    signalResult.signals,
    feedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    undefined,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning.settings,
  );
  const confirmedClustersByCanonicalSignalId = indexConfirmedClusterByCanonicalSignalId(duplicateClusters);
  const visibleSignals = filterSignalsForActiveReviewQueue(signalResult.signals, duplicateClusters);
  const autonomousAssessments = visibleSignals.map((signal) => ({
    signal,
    guidance: buildUnifiedGuidanceModel({
      signal,
      guidance: guidanceBySignalId[signal.recordId],
      context: "review",
      tuning: tuning.settings,
    }),
    assessment: assessAutonomousSignal(
      signal,
      buildUnifiedGuidanceModel({
        signal,
        guidance: guidanceBySignalId[signal.recordId],
        context: "review",
        tuning: tuning.settings,
      }),
    ),
  }));
  const approvalReadyCandidates = rankApprovalCandidates(
    autonomousAssessments.filter((item) => item.assessment.decision === "approval_ready"),
    28,
    {
      strategy,
      cadence,
      weeklyPlan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: signalResult.signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
      founderOverrides,
    },
  );
  const queueTriageInsights = buildQueueTriageInsights(
    approvalReadyCandidates.map((candidate) => candidate.triage),
  );
  const evergreenSummary = buildEvergreenSummary({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    strategy,
    cadence,
    weeklyPlan,
    weeklyPlanState,
  });
  const weeklyPostingPack = await buildWeeklyPostingPack({
    approvalCandidates: approvalReadyCandidates,
    evergreenSummary,
    strategy,
    weeklyPlan,
    weeklyPlanState,
    postingEntries,
  });
  const revenueSignals = await syncRevenueSignals({
    signals: signalResult.signals,
    postingEntries,
    strategicOutcomes,
  });
  const audienceMemory = buildAudienceMemoryState({
    strategy,
    signals: signalResult.signals,
    postingEntries,
    strategicOutcomes,
    revenueSignals,
  });
  const campaignLifecycle = buildCampaignLifecycleState({
    strategy,
    signals: signalResult.signals,
    weeklyPlan,
    weeklyPackSignalIds: weeklyPostingPack.items.map((item) => item.signalId),
    approvalCandidates: approvalReadyCandidates,
    cadence,
    revenueSignals,
  });
  const attributionRecords = buildAttributionRecordsFromInputs({
    postingEntries,
    strategicOutcomes,
    signals: signalResult.signals,
  });
  const funnelEngine = buildAdaptiveFunnelState({
    signals: signalResult.signals,
    weeklyPackSignalIds: weeklyPostingPack.items.map((item) => item.signalId),
    approvalCandidates: approvalReadyCandidates,
    attributionRecords,
    revenueSignals,
    campaignLifecycle,
  });
  const weeklyPostingPackInsights = buildWeeklyPostingPackInsights(weeklyPostingPack);
  const weeklyExecution = await runWeeklyExecutionAutopilot({
    weekStartDate: weeklyPostingPack.weekStartDate,
    pack: weeklyPostingPack,
    approvalCandidates: approvalReadyCandidates,
    stagedPackages: existingStagedPostingPackages,
    experiments,
    lifecycleByCampaignId: Object.fromEntries(
      campaignLifecycle.recommendations.map((recommendation) => [recommendation.campaignId, recommendation]),
    ),
    funnelEngine,
  });
  const exceptionInbox = await syncExceptionInbox({
    approvalCandidates: approvalReadyCandidates,
    operatorTasks,
    executionFlow: weeklyExecution.flow,
  });
  const autonomyScorecard = buildAutonomyScorecard({
    approvalCandidates: approvalReadyCandidates,
    executionFlow: weeklyExecution.flow,
    auditEvents,
  });
  const stagedPostingPackages = weeklyExecution.stagedPackages;
  const distributionBundles = weeklyExecution.distributionBundles;
  const distributionSummary = weeklyExecution.distributionSummary;
  const digest = buildOperatorDigest({
    signals: signalResult.signals,
    feedbackEntries,
    patterns,
    playbookCards,
    bundles,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    duplicateClusters,
    strategy,
    cadence,
    weeklyPlan,
    weeklyPlanState,
    tuning: tuning.settings,
    managedSources: managedSourceResult.sources,
    followUpTasks,
    experiments,
  });
  const recap = buildWeeklyRecap({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId,
  });
  const previousWeekStartDate = new Date(`${recap.weekStartDate}T00:00:00Z`);
  previousWeekStartDate.setUTCDate(previousWeekStartDate.getUTCDate() - 7);
  const previousRecap = buildWeeklyRecap({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId,
    weekStartDate: previousWeekStartDate.toISOString().slice(0, 10),
  });
  const revenueInsights = buildRevenueSignalInsights(revenueSignals);
  const attributionInsights = buildAttributionInsights(attributionRecords);
  const scorecard = buildGrowthScorecard({
    approvalCandidates: approvalReadyCandidates,
    weeklyPack: weeklyPostingPack,
    weeklyPackInsights: weeklyPostingPackInsights,
    distributionSummary,
    currentRecap: recap,
    previousRecap,
    revenueSignals,
    experiments,
    cadence,
    strategy,
  });
  const sourceAutopilotState = await buildSourceAutopilotV2State({
    source: signalResult.source,
    sourceRegistry: ingestionSources,
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const experimentProposalInsights = buildExperimentProposalInsights(
    buildAutonomousExperimentProposals({
      candidates: approvalReadyCandidates,
      experiments,
      storedProposals: storedExperimentProposals,
      founderOverrides,
      maxProposals: 6,
    }),
  );
  const experimentInsights = buildExperimentInsights({
    experiments,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const narrativeSequenceInsights = buildNarrativeSequenceInsights({
    sequences: buildNarrativeSequencesForSignals({
      signals: signalResult.signals,
      strategy,
      maxSequences: 20,
    }),
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const connectBridgeSummary = buildZazaConnectBridgeSummary({
    latestExport: latestConnectExport,
    importedContexts: importedConnectContexts,
    influencerGraphSummary: influencerGraph.summary,
  });
  const campaignAllocation = buildCampaignAllocationState({
    strategy,
    signals: signalResult.signals,
    weeklyPlan,
    weeklyPackSignalIds: weeklyPostingPack.items.map((item) => item.signalId),
    approvalCandidates: approvalReadyCandidates,
    cadence,
    revenueSignals,
    audienceMemory,
    lifecycle: campaignLifecycle,
  });
  const recommendationTuning = await syncRecommendationTuningState({
    auditEvents,
    approvalCandidates: approvalReadyCandidates,
    weeklyExecution: weeklyExecution.flow,
    campaignAllocation,
    growthScorecard: scorecard,
    weeklyRecap: recap,
    revenueInsights,
    attributionInsights,
    sourceAutopilotState,
    audienceMemory,
    exceptionInbox,
    influencerGraphSummary: influencerGraph.summary,
    activeExperimentCount: experiments.filter((experiment) => experiment.status !== "completed").length,
  });
  const growthMemory = buildGrowthMemory({
    attributionInsights,
    revenueInsights,
    audienceMemory,
    reuseCases: reuseMemoryCases,
    influencerGraph,
    campaignAllocation,
    weeklyRecap: recap,
  });
  const revenueAmplifier = buildRevenueAmplifierState({
    signals: signalResult.signals,
    revenueSignals,
    attributionRecords,
    growthMemory,
    weeklyRecap: recap,
  });
  const optimisation = buildFlywheelOptimisation({
    weeklyRecap: recap,
    sourceAutopilotState,
    playbookCoverageSummary,
    weeklyPostingPack,
    evergreenSummary,
    experimentProposalInsights,
    narrativeSequenceInsights,
    revenueInsights,
    audienceMemory,
    recommendationTuning,
  });
  const growthDirector = buildGrowthDirector({
    weeklyPlan,
    weeklyPostingPack,
    approvalCandidates: approvalReadyCandidates,
    operatorTaskSummary,
    operatorTasks,
    followUpTasks,
    weeklyRecap: recap,
    sourceAutopilotState,
    optimisation,
    influencerGraphSummary: influencerGraph.summary,
    distributionSummary,
    revenueInsights,
    narrativeSequenceInsights,
    connectBridgeSummary,
    scorecard,
    growthMemory,
    recommendationTuning,
  });
  const strategicDecisions = buildStrategicDecisionState({
    growthDirector,
    weeklyRecap: recap,
    optimisation,
    weeklyPostingPack,
    approvalCandidates: approvalReadyCandidates,
    sourceAutopilotState,
    revenueInsights,
    audienceMemory,
    influencerGraphSummary: influencerGraph.summary,
    funnelEngine,
    growthMemory,
    revenueAmplifier,
    activeExperimentCount: experiments.filter((experiment) => experiment.status !== "completed").length,
    recommendationTuning,
    founderOverrides,
  });
  const resourceFocus = buildResourceFocusState({
    exceptionInbox,
    operatorTaskSummary,
    operatorTasks,
    weeklyExecution: weeklyExecution.flow,
    campaignAllocation,
    strategicDecisions,
    followUpTasks,
    approvalCandidates: approvalReadyCandidates,
    sourceAutopilotState,
    influencerGraphSummary: influencerGraph.summary,
    revenueInsights,
    activeExperimentCount: experiments.filter((experiment) => experiment.status !== "completed").length,
    recommendationTuning,
    founderOverrides,
  });
  const opportunityRadar = buildCommercialOpportunityRadar({
    approvalCandidates: approvalReadyCandidates,
    weeklyPostingPack,
    weeklyRecap: recap,
    growthScorecard: scorecard,
    attributionInsights,
    revenueInsights,
    audienceMemory,
    sourceAutopilotState,
    influencerGraph,
    campaignAllocation,
    evergreenSummary,
    growthMemory,
  });
  const executiveBriefing = buildExecutiveBriefing({
    weeklyPlan,
    growthDirector,
    strategicDecisions,
    campaignAllocation,
    resourceFocus,
    weeklyExecution: weeklyExecution.flow,
    autonomyScorecard,
    growthScorecard: scorecard,
    weeklyRecap: recap,
    revenueInsights,
    attributionInsights,
    sourceAutopilotState,
    exceptionInbox,
    opportunityRadar,
    growthMemory,
    recommendationTuning,
    founderOverrides,
  });

  await appendAuditEventsSafe([
    {
      signalId: `growth-memory:${digest.generatedAt.slice(0, 10)}`,
      eventType: "GROWTH_MEMORY_CONSOLIDATED",
      actor: "system",
      summary: `Consolidated growth memory with ${growthMemory.currentBestCombos.length} best combo${growthMemory.currentBestCombos.length === 1 ? "" : "s"} and ${growthMemory.currentWeakCombos.length} caution combo${growthMemory.currentWeakCombos.length === 1 ? "" : "s"}.`,
      metadata: {
        bestCombos: growthMemory.currentBestCombos.length,
        weakCombos: growthMemory.currentWeakCombos.length,
        topCommercialHeadline: growthMemory.commercialMemory.headline,
      },
    },
    {
      signalId: `commercial-opportunity:${digest.generatedAt.slice(0, 10)}`,
      eventType: "COMMERCIAL_OPPORTUNITY_DETECTED",
      actor: "system",
      summary: `Detected ${opportunityRadar.opportunities.length} commercial opportunit${opportunityRadar.opportunities.length === 1 ? "y" : "ies"} worth surfacing.`,
      metadata: {
        count: opportunityRadar.opportunities.length,
        topCategory: opportunityRadar.opportunities[0]?.category ?? null,
      },
    },
    {
      signalId: `executive-briefing:${digest.generatedAt.slice(0, 10)}`,
      eventType: "EXECUTIVE_BRIEFING_GENERATED",
      actor: "system",
      summary: `Generated executive briefing with ${executiveBriefing.topOpportunities.length} opportunities and ${executiveBriefing.topRisks.length} risks.`,
      metadata: {
        opportunities: executiveBriefing.topOpportunities.length,
        risks: executiveBriefing.topRisks.length,
        actions: executiveBriefing.recommendedActions.length,
      },
    },
    {
      signalId: `autonomy-scorecard:${weeklyExecution.flow.weekStartDate}`,
      eventType: "AUTONOMY_SCORECARD_COMPUTED",
      actor: "system",
      summary: "Computed autonomy scorecard snapshot.",
      metadata: {
        totalCandidates: autonomyScorecard.totalCandidates,
        autonomyRate: Math.round(autonomyScorecard.autonomyRate * 100),
        partialAutonomyRate: Math.round(autonomyScorecard.partialAutonomyRate * 100),
        blockedRate: Math.round(autonomyScorecard.blockedRate * 100),
      },
    },
    {
      signalId: `resource-focus:${digest.generatedAt.slice(0, 10)}`,
      eventType: "RESOURCE_FOCUS_COMPUTED",
      actor: "system",
      summary: `Computed resource focus stack with ${resourceFocus.focusStack.length} recommendation${resourceFocus.focusStack.length === 1 ? "" : "s"}.`,
      metadata: {
        focusCount: resourceFocus.focusStack.length,
        topFocusArea: resourceFocus.focusStack[0]?.focusArea ?? null,
      },
    },
    {
      signalId: `digest:${digest.generatedAt.slice(0, 10)}`,
      eventType: "DIGEST_VIEWED",
      actor: "operator",
      summary: "Viewed operator digest.",
      metadata: {
        topCandidates: digest.topCandidates.length,
        heldItems: digest.heldForJudgement.length,
        weeklyGaps: digest.weeklyGaps.length,
        followUpTasks: digest.followUpTasks.length,
        sourceRecommendations: digest.sourceRecommendations.length,
        conflictCalls: digest.conflictSummary.count,
        operatorTasks: operatorTaskSummary.openCount,
        weeklyPostingPackItems: weeklyPostingPack.items.length,
        stagedPostingPackages: stagedPostingPackages.length,
        distributionBundles: distributionSummary.bundleCount,
        weeklyExecutionStaged: weeklyExecution.flow.stagedCount,
        weeklyExecutionBlocked: weeklyExecution.flow.blockedCount,
        weeklyExecutionReview: weeklyExecution.flow.reviewCount,
        exceptionInboxCount: exceptionInbox.openCount,
        followUpRelationships: influencerGraph.summary.followUpNeededCount,
        optimisationProposals: optimisation.proposalCount,
        connectImports: connectBridgeSummary.importCount,
        connectExports: connectBridgeSummary.exportCount,
        directorPriorities: growthDirector.topPriorities.length,
        strategicDecisions: strategicDecisions.proposals.length,
        resourceFocusCount: resourceFocus.focusStack.length,
      },
    },
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={signalResult.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {signalResult.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Generated {formatDateTime(digest.generatedAt)}</Badge>
          </div>
          <CardTitle className="text-3xl">Operator Digest</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            One compact daily command centre for what needs approval, judgement, follow-up, and source attention next.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/review#approval-ready" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open approval queue
          </Link>
          <Link href={digest.batchReview.href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open batch approval
          </Link>
          <Link href="/plan" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly plan
          </Link>
          <Link href="/ingestion" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open source controls
          </Link>
          <Link href="/follow-up" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open follow-up queue
          </Link>
          <Link href="/tasks" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open operator tasks
          </Link>
          <Link href="/recap" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly recap
          </Link>
          <Link href="/weekly-pack" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly pack
          </Link>
          <Link href="/optimisation" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open optimisation
          </Link>
          <Link href="/posting" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open posting assistant
          </Link>
          <Link href="/execution" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open execution flow
          </Link>
          <Link href="/exceptions" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open exception inbox
          </Link>
          <Link href="/influencers" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open influencer graph
          </Link>
          <Link href="/connect-bridge" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open Zaza Connect bridge
          </Link>
          <Link href="/director" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open growth director
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-10">
        <Link href={digest.batchReview.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Start Here</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{digest.batchReview.count}</p>
          <p className="mt-1 text-sm text-slate-600">Candidates already staged for batch approval.</p>
        </Link>
        <Link href="/follow-up" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Outcome Gaps</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{digest.followUpTasks.length}</p>
          <p className="mt-1 text-sm text-slate-600">Follow-up tasks still blocking commercial learning.</p>
        </Link>
        <Link href="/review?view=needs_judgement" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Judgement Calls</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{digest.heldForJudgement.length}</p>
          <p className="mt-1 text-sm text-slate-600">Held items that still need an explicit operator decision.</p>
        </Link>
        <Link href="/review?view=ready_to_approve" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top Queue</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{digest.topCandidates.length}</p>
          <p className="mt-1 text-sm text-slate-600">Approval-ready candidates with the strongest current support.</p>
        </Link>
        <Link href={digest.conflictSummary.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Conflict Calls</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{digest.conflictSummary.count}</p>
          <p className="mt-1 text-sm text-slate-600">
            {digest.conflictSummary.highSeverityCount > 0
              ? `${digest.conflictSummary.highSeverityCount} high-severity package conflicts need judgement.`
              : "Top-queue package alignment checks are mostly clean."}
          </p>
        </Link>
        <Link href="/tasks" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Operator Tasks</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{operatorTaskSummary.openCount}</p>
          <p className="mt-1 text-sm text-slate-600">
            {operatorTaskSummary.highPriorityCount > 0
              ? `${operatorTaskSummary.highPriorityCount} high-priority tasks need attention.`
              : "No high-priority operator backlog is building right now."}
          </p>
        </Link>
        <Link href="/weekly-pack" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Weekly Pack</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{weeklyPostingPack.items.length}</p>
          <p className="mt-1 text-sm text-slate-600">
            {weeklyPostingPack.sequences.length > 0
              ? `${weeklyPostingPack.sequences.length} recommended sequence${weeklyPostingPack.sequences.length === 1 ? "" : "s"} this week.`
              : weeklyPostingPack.platformMix.slice(0, 3).map((row) => `${row.count} ${row.label}`).join(" · ") || "No balanced weekly pack is stable enough yet."}
          </p>
        </Link>
        <Link href="/posting" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Ready To Post</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{stagedPostingPackages.length}</p>
          <p className="mt-1 text-sm text-slate-600">
            {distributionSummary.bundleCount > 0
              ? `${distributionSummary.bundleCount} distribution bundle${distributionSummary.bundleCount === 1 ? "" : "s"} ready for manual execution.`
              : "No staged posting packages are waiting right now."}
          </p>
        </Link>
        <Link href="/execution" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Execution Flow</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{weeklyExecution.flow.stagedCount}</p>
          <p className="mt-1 text-sm text-slate-600">
            {weeklyExecution.flow.blockedCount > 0
              ? `${weeklyExecution.flow.blockedCount} blocked and ${weeklyExecution.flow.reviewCount} still need review.`
              : `${weeklyExecution.flow.readyToStageCount} additional item${weeklyExecution.flow.readyToStageCount === 1 ? "" : "s"} can be staged next.`}
          </p>
        </Link>
        <Link href="/exceptions" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Exceptions</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{exceptionInbox.openCount}</p>
          <p className="mt-1 text-sm text-slate-600">
            {exceptionInbox.groups[0]
              ? `${exceptionInbox.groups[0].count} item${exceptionInbox.groups[0].count === 1 ? "" : "s"} are concentrated in ${exceptionInbox.groups[0].label.toLowerCase()}.`
              : "No operator-only exception is currently open."}
          </p>
        </Link>
        <Link href="/influencers" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Relationship Memory</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{influencerGraph.summary.followUpNeededCount}</p>
          <p className="mt-1 text-sm text-slate-600">
            {influencerGraph.summary.newRepliesPendingCount > 0
              ? `${influencerGraph.summary.newRepliesPendingCount} reply${influencerGraph.summary.newRepliesPendingCount === 1 ? "" : "ies"} are waiting on a response.`
              : "No influencer reply is pending right now."}
          </p>
        </Link>
        <Link href="/replies" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Safe Replies</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{safeReplies.summary.lowRiskReadyCount}</p>
          <p className="mt-1 text-sm text-slate-600">
            {safeReplies.summary.reviewRequiredCount + safeReplies.summary.blockedCount > 0
              ? `${safeReplies.summary.reviewRequiredCount + safeReplies.summary.blockedCount} replies still need manual judgement.`
              : "Low-risk reply suggestions are ready for review."}
          </p>
        </Link>
        <Link href="/connect-bridge" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Cross-App Context</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{connectBridgeSummary.importedThemeCount}</p>
          <p className="mt-1 text-sm text-slate-600">
            {connectBridgeSummary.topNotes[0] ??
              "No imported Zaza Connect theme is shaping content and outreach yet."}
          </p>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Queue Triage</CardTitle>
            <Link href="/review#approval-ready" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open triaged queue
            </Link>
          </div>
          <CardDescription>
            The current approval queue is continuously routed into bounded operational buckets so it is easier to scan and act on quickly.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {queueTriageInsights.distribution.map((row) => (
            <div key={row.triageState} className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{row.count}</p>
              <p className="mt-1 text-sm text-slate-600">
                {row.triageState === "approve_ready"
                  ? "Fastest approval lane."
                  : row.triageState === "repairable"
                    ? "Low-risk cleanup still available."
                    : row.triageState === "needs_judgement"
                      ? "Operator call still needed."
                      : row.triageState === "stale_but_reusable"
                        ? "Preserve for a later reuse moment."
                        : "Visible, but demoted out of the top queue."}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <FounderOverrideSummary state={founderOverrides} compact />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>ZazaReel</CardTitle>
            <Link href="/factory-inputs" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open ZazaReel
            </Link>
          </div>
          <CardDescription>
            Founder-facing video review and generation, backed by the same production queue and trust-aware opportunity selection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Queue summary</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{factoryInputState.openCount}</p>
            <p className="mt-2 text-sm text-slate-600">
              {factoryInputState.topSummary[0] ??
                "No content opportunity queue has been refreshed yet."}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ready now</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {
                  factoryInputState.opportunities.filter(
                    (item) =>
                      item.status === "open" &&
                      item.priority === "high" &&
                      item.trustRisk !== "high",
                  ).length
                }
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">High commercial</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {
                  factoryInputState.opportunities.filter(
                    (item) =>
                      item.status === "open" &&
                      item.commercialPotential === "high",
                  ).length
                }
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Trust-risk flagged</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">
                {
                  factoryInputState.opportunities.filter(
                    (item) => item.status === "open" && item.trustRisk === "high",
                  ).length
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <ExecutiveBriefingPanel briefing={executiveBriefing} compact />
      <FunnelEnginePanel state={funnelEngine} compact />
      <GrowthMemoryPanel memory={growthMemory} compact />
      <OpportunityRadarPanel state={opportunityRadar} compact />
      <ResourceFocusPanel state={resourceFocus} compact />
      <CampaignAllocationPanel state={campaignAllocation} compact />
      <GrowthDirectorPanel director={growthDirector} compact />
      <GrowthScorecardPanel scorecard={scorecard} compact />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Strategic Decisions</CardTitle>
            <Link href="/director" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open director
            </Link>
          </div>
          <CardDescription>
            Short bounded decisions that reduce founder-level strategy drift without changing anything automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {strategicDecisions.proposals.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No strategic decision is strong enough to surface right now.
            </div>
          ) : (
            strategicDecisions.proposals.slice(0, 3).map((proposal) => (
              <Link key={proposal.proposalId} href={proposal.linkedWorkflow} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={proposal.priority === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : proposal.priority === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                    {proposal.priority}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {proposal.category.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="mt-3 font-medium text-slate-950">{proposal.title}</p>
                <p className="mt-2 text-sm text-slate-600">{proposal.recommendation}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Autonomy Scorecard</CardTitle>
            <Link href="/insights" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open insights
            </Link>
          </div>
          <CardDescription>
            One compact read on how much of the current workflow is autonomous, where it is only partially assisted, and where humans are still doing the heavy lifting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Autonomy rate</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{Math.round(autonomyScorecard.autonomyRate * 100)}%</p>
              <p className="mt-1 text-sm text-slate-600">{autonomyScorecard.approvalReadyWithoutChanges} approval-ready without extra cleanup.</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Partial autonomy</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{Math.round(autonomyScorecard.partialAutonomyRate * 100)}%</p>
              <p className="mt-1 text-sm text-slate-600">{autonomyScorecard.autoRepairedCount} repaired · {autonomyScorecard.autoHealedCount} healed.</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Blocked rate</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{Math.round(autonomyScorecard.blockedRate * 100)}%</p>
              <p className="mt-1 text-sm text-slate-600">{autonomyScorecard.blockedByPolicyCount} policy · {autonomyScorecard.blockedByConflictCount} conflict.</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Operator effort</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{autonomyScorecard.operatorInterventionsRequired}</p>
              <p className="mt-1 text-sm text-slate-600">Candidates still needing direct human attention.</p>
            </div>
          </div>

          {autonomyScorecard.summaries.length > 0 ? (
            <div className="space-y-3">
              {autonomyScorecard.summaries.slice(0, 3).map((summary) => (
                <div key={summary} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  {summary}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Exception Inbox</CardTitle>
            <Link href="/exceptions" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open exceptions
            </Link>
          </div>
          <CardDescription>
            One bounded inbox for blocked, unresolved, or judgement-required items so the operator can resolve the top issues without jumping between pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Attention needed</p>
            <p className="mt-2 text-sm text-slate-700">
              You have {exceptionInbox.openCount} item{exceptionInbox.openCount === 1 ? "" : "s"} needing attention.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {exceptionInbox.topSummary[0] ?? "No open exception is stable enough to summarize right now."}
            </p>
          </div>
          {exceptionInbox.topItems.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No operator exception is open right now.
            </div>
          ) : (
            exceptionInbox.topItems.slice(0, 3).map((item) => (
              <Link key={item.id} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={item.priority === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : item.priority === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                    {item.priority === "high" ? "High priority" : item.priority === "medium" ? "Medium priority" : "Low priority"}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.issueType.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-3 font-medium text-slate-950">{item.title}</p>
                <p className="mt-2 text-sm text-slate-600">{item.recommendedAction}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <WeeklyRecapPanel recap={recap} compact />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Revenue Signals</CardTitle>
            <Link href="/insights" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open insights
            </Link>
          </div>
          <CardDescription>
            Directional business-value memory: what content, destination, and platform combinations are producing the strongest revenue-linked signals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Recorded</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{revenueInsights.recordedCount}</p>
              <p className="mt-1 text-sm text-slate-600">Revenue-linked signals recorded or inferred.</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">High strength</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{revenueInsights.highStrengthCount}</p>
              <p className="mt-1 text-sm text-slate-600">Signals strong enough to influence ranking.</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top destination</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{revenueInsights.topDestinationRows[0]?.label ?? "None yet"}</p>
              <p className="mt-1 text-sm text-slate-600">Best current destination path for commercial follow-through.</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top pattern</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{revenueInsights.topPatternRows[0]?.label ?? "None yet"}</p>
              <p className="mt-1 text-sm text-slate-600">Strongest current revenue-linked pattern or mode.</p>
            </div>
          </div>
          {revenueInsights.summaries.length > 0 ? (
            <div className="space-y-3">
              {revenueInsights.summaries.map((summary) => (
                <div key={summary} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  {summary}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <FlywheelOptimisationPanel optimisation={optimisation} compact />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Experiment Autopilot V2</CardTitle>
            <Link href="/experiments" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open experiments
            </Link>
          </div>
          <CardDescription>
            Bounded one-variable tests the system can now construct automatically when confidence is high and the package is stable enough.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Open autopilot proposals</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{experimentProposalInsights.openCount}</p>
              <p className="mt-1 text-sm text-slate-600">{experimentProposalInsights.summaries[0] ?? "No strong autopilot experiment is open right now."}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Autopilot built</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{experimentInsights.autopilotBuiltCount}</p>
              <p className="mt-1 text-sm text-slate-600">Accepted bounded tests now tracked in the experiment manager.</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top variable</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{experimentProposalInsights.byVariable[0]?.label ?? "None yet"}</p>
              <p className="mt-1 text-sm text-slate-600">Most common current one-variable test family.</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Completion rate</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{Math.round(experimentInsights.autopilotCompletionRate * 100)}%</p>
              <p className="mt-1 text-sm text-slate-600">Accepted autopilot-built experiments the operator has already closed.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>This Week&apos;s Execution Flow</CardTitle>
            <Link href="/execution" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open execution
            </Link>
          </div>
          <CardDescription>
            The weekly preparation autopilot stages the safest work first, keeps blocked items visible, and orders the rest in practical execution sequence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Execution summary</p>
            <p className="mt-2 text-sm text-slate-700">
              {weeklyExecution.flow.stagedCount} staged · {weeklyExecution.flow.readyToStageCount} ready to stage · {weeklyExecution.flow.reviewCount} needs review · {weeklyExecution.flow.blockedCount} blocked
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {weeklyExecution.flow.executionReasons[0] ?? "No weekly execution summary is stable enough yet."}
            </p>
          </div>
          {weeklyExecution.flow.executionItems.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No weekly execution item is ready to summarize yet.
            </div>
          ) : (
            weeklyExecution.flow.executionItems.slice(0, 4).map((item) => (
              <Link key={`${item.signalId}:${item.platform}`} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">#{item.executionOrder}</Badge>
                  <Badge className={item.status === "staged_for_posting" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : item.status === "ready_to_stage" ? "bg-sky-50 text-sky-700 ring-sky-200" : item.status === "blocked" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
                    {item.status === "staged_for_posting" ? "Staged" : item.status === "ready_to_stage" ? "Ready to stage" : item.status === "blocked" ? "Blocked" : "Needs review"}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.platform}</Badge>
                  {item.sequenceLabel ? (
                    <Badge className="bg-violet-50 text-violet-700 ring-violet-200">
                      {item.sequenceStepLabel ? `${item.sequenceStepLabel} · ` : ""}{item.sequenceLabel}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-3 font-medium text-slate-950">{item.sourceTitle}</p>
                <p className="mt-2 text-sm text-slate-600">{item.executionReason}</p>
                {item.executionChainSummary ? (
                  <p className="mt-2 text-xs text-sky-700">{item.executionChainSummary}</p>
                ) : null}
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Ready To Post</CardTitle>
            <Link href="/posting" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open posting assistant
            </Link>
          </div>
          <CardDescription>
            Staged posting packages that already bundle final caption, link, asset, timing, comment prompt, and alt text for manual publishing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stagedPostingPackages.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No posting package is staged for manual publishing yet.
            </div>
          ) : (
            stagedPostingPackages.slice(0, 4).map((pkg) => (
              <Link key={pkg.packageId} href={pkg.reviewHref} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-sky-50 text-sky-700 ring-sky-200">Staged</Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{pkg.platform}</Badge>
                </div>
                <p className="mt-3 font-medium text-slate-950">{pkg.sourceTitle}</p>
                <p className="mt-2 text-sm text-slate-600">{pkg.readinessReason}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {pkg.selectedDestination?.label ?? "No destination"} · {pkg.selectedAssetLabel ?? "Text-first"} · {pkg.timingSuggestion ?? "No timing suggestion"}
                </p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Safe Replies</CardTitle>
            <Link href="/replies" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open safe reply queue
            </Link>
          </div>
          <CardDescription>
            Low-risk inbound replies can be staged for manual send. Ambiguous or high-stakes replies stay manual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current reply load</p>
            <p className="mt-2 text-sm text-slate-600">
              {safeReplies.summary.lowRiskReadyCount} low-risk ready · {safeReplies.summary.stagedCount} staged · {safeReplies.summary.reviewRequiredCount} needs judgement · {safeReplies.summary.blockedCount} blocked
            </p>
          </div>
          {safeReplies.rows.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No reply is waiting right now.
            </div>
          ) : (
            safeReplies.rows.slice(0, 3).map((reply) => (
              <Link key={reply.replyId} href="/replies" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={reply.replyEligibility === "safe_to_stage" ? "bg-sky-50 text-sky-700 ring-sky-200" : reply.replyEligibility === "blocked" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
                    {reply.replyEligibility === "safe_to_stage" ? "Low-risk ready" : reply.replyEligibility === "blocked" ? "Blocked" : "Needs judgement"}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{reply.platform}</Badge>
                </div>
                <p className="mt-3 font-medium text-slate-950">{reply.influencerName}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {reply.sourceMessage ?? reply.sourceContext ?? "No inbound message was recorded."}
                </p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Relationship Memory</CardTitle>
            <Link href="/influencers" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open influencer graph
            </Link>
          </div>
          <CardDescription>
            Follow-up awareness and reply context for influencer, creator, and collaboration relationships.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current relationship pressure</p>
            <p className="mt-2 text-sm text-slate-600">
              {influencerGraph.summary.followUpNeededCount} follow-up needed · {influencerGraph.summary.newRepliesPendingCount} replies pending · {influencerGraph.summary.relationshipOpportunityCount} new relationship opportunities
            </p>
          </div>
          {influencerGraph.rows.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No influencer relationship memory is stored yet.
            </div>
          ) : (
            influencerGraph.rows
              .filter((row) => row.followUpNeeded || row.newReplyPending)
              .slice(0, 3)
              .map((row) => (
                <Link key={row.influencer.influencerId} href="/influencers" className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                      {row.influencer.relationshipStage}
                    </Badge>
                    {row.newReplyPending ? (
                      <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Reply pending</Badge>
                    ) : null}
                    {row.followUpNeeded ? (
                      <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Follow up needed</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{row.influencer.name}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {row.latestInteraction?.context ?? row.influencer.notes ?? "No saved context."}
                  </p>
                </Link>
              ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Zaza Connect Bridge</CardTitle>
            <Link href="/connect-bridge" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open bridge
            </Link>
          </div>
          <CardDescription>
            Lightweight cross-app memory linking content intelligence here with outreach and relationship context from Zaza Connect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Bridge summary</p>
            <p className="mt-2 text-sm text-slate-700">
              {connectBridgeSummary.importCount} imports · {connectBridgeSummary.exportCount} exports · {connectBridgeSummary.influencerRelevantExportCount} influencer-relevant item{connectBridgeSummary.influencerRelevantExportCount === 1 ? "" : "s"} in the latest export
            </p>
            {connectBridgeSummary.topNotes[0] ? (
              <p className="mt-2 text-sm text-slate-600">{connectBridgeSummary.topNotes[0]}</p>
            ) : null}
          </div>
          {(latestConnectExport?.outreachRelevantThemes[0] || importedConnectContexts[0]?.outreachCampaignThemes[0]) ? (
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
              {latestConnectExport?.outreachRelevantThemes[0]
                ? `Latest export theme: ${latestConnectExport.outreachRelevantThemes[0].label}.`
                : null}
              {latestConnectExport?.outreachRelevantThemes[0] && importedConnectContexts[0]?.outreachCampaignThemes[0]
                ? " "
                : null}
              {importedConnectContexts[0]?.outreachCampaignThemes[0]
                ? `Imported outreach theme: ${importedConnectContexts[0].outreachCampaignThemes[0].label}.`
                : null}
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No imported or exported bridge context is active yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Distribution Bundles</CardTitle>
            <Link href="/posting" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open distribution view
            </Link>
          </div>
          <CardDescription>
            Safe-mode grouped variants that keep LinkedIn, X, Reddit, and follow-up materials together for manual execution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current distribution readiness</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{distributionSummary.bundleCount}</p>
            <p className="mt-2 text-sm text-slate-600">
              {distributionSummary.multiPlatformBundleCount > 0
                ? `${distributionSummary.multiPlatformBundleCount} multi-platform bundle${distributionSummary.multiPlatformBundleCount === 1 ? "" : "s"} and ${distributionSummary.readyCount} staged package${distributionSummary.readyCount === 1 ? "" : "s"} are ready for manual distribution.`
                : "No multi-platform bundle is staged yet."}
            </p>
          </div>
          {distributionBundles.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No grouped distribution bundle is ready yet.
            </div>
          ) : (
            distributionBundles.slice(0, 3).map((bundle) => (
              <Link key={bundle.bundleId} href={bundle.reviewHref} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                    {bundle.platforms.length > 1 ? "Multi-platform" : "Single-platform"}
                  </Badge>
                  {bundle.platforms.map((platform) => (
                    <Badge key={`${bundle.bundleId}:${platform}`} className="bg-slate-100 text-slate-700 ring-slate-200">
                      {platform}
                    </Badge>
                  ))}
                  {bundle.sequenceLabel ? (
                    <Badge className="bg-violet-50 text-violet-700 ring-violet-200">{bundle.sequenceLabel}</Badge>
                  ) : null}
                </div>
                <p className="mt-3 font-medium text-slate-950">{bundle.sourceTitle}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {bundle.sequenceReason ??
                    "Prepared variants, copy-ready prompts, and follow-up notes are grouped for manual distribution."}
                </p>
                <p className="mt-2 text-xs text-slate-500">{bundle.checklist.slice(0, 2).join(" · ")}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>This Week&apos;s Posting Pack</CardTitle>
            <Link href="/weekly-pack" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open pack
            </Link>
          </div>
          <CardDescription>
            A bounded 3 to 5 item recommendation that balances the weekly mix instead of just taking the top raw queue scores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Coverage</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{weeklyPostingPack.coverageSummary.summary}</p>
            <p className="mt-2 text-sm text-slate-600">
              {weeklyPostingPack.platformMix.slice(0, 3).map((row) => `${row.count} ${row.label}`).join(" · ")}
              {weeklyPostingPack.includedEvergreenCount > 0
                ? ` · ${weeklyPostingPack.includedEvergreenCount} evergreen`
                : ""}
            </p>
            {weeklyPostingPack.sequences[0] ? (
              <p className="mt-2 text-sm text-slate-600">
                Sequence: {weeklyPostingPack.sequences[0].narrativeLabel}
              </p>
            ) : null}
          </div>
          {weeklyPostingPack.items.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No balanced weekly pack is stable enough yet.
            </div>
          ) : (
            weeklyPostingPack.items.slice(0, 4).map((item) => (
              <Link key={item.itemId} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={item.source === "evergreen" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                    {item.source === "evergreen" ? "Evergreen" : "Fresh"}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.platformLabel}</Badge>
                  {item.isCampaignCritical ? (
                    <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Campaign-critical</Badge>
                  ) : null}
                </div>
                <p className="mt-3 font-medium text-slate-950">{item.sourceTitle}</p>
                <p className="mt-2 text-sm text-slate-600">{item.whySelected}</p>
                {item.sequenceContext ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Step {item.sequenceContext.stepNumber} of {item.sequenceContext.totalSteps} · {item.sequenceContext.roleLabel} · {item.sequenceContext.narrativeLabel}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">
                  {item.destinationLabel ?? "No destination yet"} · {item.publishPrepReadiness}
                </p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Operator Tasks</CardTitle>
            <Link href="/tasks" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open task queue
            </Link>
          </div>
          <CardDescription>One practical queue for judgement calls, confirmations, incomplete packages, conflicts, stale refresh, and strategic follow-up.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current backlog</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{operatorTaskSummary.openCount}</p>
            <p className="mt-2 text-sm text-slate-600">
              {operatorTaskSummary.topBottlenecks[0]
                ? `${operatorTaskSummary.topBottlenecks[0].label} is the top recurring task type right now.`
                : "No operator task bottleneck is stable enough to summarize."}
            </p>
          </div>
          {operatorTasks.filter((task) => task.status === "open").slice(0, 3).map((task) => (
            <Link key={task.id} href={task.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={task.priority === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : task.priority === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                  {task.priority}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  {task.taskType.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="mt-3 font-medium text-slate-950">{task.title}</p>
              <p className="mt-2 text-sm text-slate-600">{task.reason}</p>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Package Conflicts</CardTitle>
            <Link href={digest.conflictSummary.href} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Review conflicts
            </Link>
          </div>
          <CardDescription>High-signal package conflicts that are worth resolving before final review time gets wasted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current signal</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{digest.conflictSummary.count}</p>
            <p className="mt-2 text-sm text-slate-600">{digest.conflictSummary.summary}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Batch Approval</CardTitle>
              <Link href={digest.batchReview.href} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                Batch review
              </Link>
            </div>
            <CardDescription>A bounded one-pass review surface for the strongest near-final candidates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Prepared items</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{digest.batchReview.count}</p>
              <p className="mt-2 text-sm text-slate-600">{digest.batchReview.summary}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Top Candidates</CardTitle>
              <Link href="/review#approval-ready" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                Approval queue
              </Link>
            </div>
            <CardDescription>Near-finished items most worth operator review next.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {digest.topCandidates.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No approval-ready candidates are active right now.</div>
            ) : (
              digest.topCandidates.map((item) => (
                <Link key={item.signalId} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <p className="font-medium text-slate-950">{item.sourceTitle}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">Objective:</span> {item.objective}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{item.whyItMayWork}</p>
                  {item.conflictSummary ? (
                    <p className="mt-2 text-xs text-amber-700">Watch: {item.conflictSummary}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">{item.summary}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Held For Judgement</CardTitle>
              <Link href="/review#borderline-workbench" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                Review held items
              </Link>
            </div>
            <CardDescription>Cases that still need an explicit operator decision or bounded next step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {digest.heldForJudgement.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No held items need immediate judgement.</div>
            ) : (
              digest.heldForJudgement.map((item) => (
                <Link key={item.signalId} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-amber-50 text-amber-700 ring-amber-200">{item.stageLabel}</Badge>
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{item.sourceTitle}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Weekly Gaps</CardTitle>
              <Link href="/plan" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                Weekly plan
              </Link>
            </div>
            <CardDescription>Current planning gaps or balance notes that should shape operator attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {digest.weeklyGaps.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No weekly gap is calling for attention right now.</div>
            ) : (
              digest.weeklyGaps.map((item) => (
                <Link key={item.id} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.summary}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Outcome Follow-Ups</CardTitle>
              <Link href="/follow-up" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                Follow-up queue
              </Link>
            </div>
            <CardDescription>Tasks for posted items, experiments, and weekly packs that still need manual learning updates.</CardDescription>
          </CardHeader>
          <CardContent>
            <FollowUpTaskList
              initialTasks={digest.followUpTasks}
              emptyCopy="No outcome follow-up task is currently open."
              referenceNowIso={digest.generatedAt}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Source Recommendations</CardTitle>
            <Link href="/ingestion" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Source controls
            </Link>
          </div>
          <CardDescription>Advisory source changes worth reviewing next. Nothing changes automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {digest.sourceRecommendations.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No source recommendation needs action right now.</div>
          ) : (
            digest.sourceRecommendations.map((item) => (
              <Link key={`${item.sourceId}-${item.summary}`} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <p className="font-medium text-slate-950">{item.sourceName}</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{item.summary}</p>
                <p className="mt-1 text-sm text-slate-600">{item.rationale}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

