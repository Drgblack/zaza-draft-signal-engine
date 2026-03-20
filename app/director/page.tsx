import Link from "next/link";

import { GrowthDirectorPanel } from "@/components/director/growth-director-panel";
import { GrowthScorecardPanel } from "@/components/scorecard/growth-scorecard-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { buildAudienceMemoryState } from "@/lib/audience-memory";
import { appendAuditEventsSafe } from "@/lib/audit";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { buildDistributionBundles, buildDistributionSummary } from "@/lib/distribution";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { buildAutonomousExperimentProposals, buildExperimentProposalInsights, listExperimentProposals } from "@/lib/experiment-proposals";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { listFollowUpTasks } from "@/lib/follow-up";
import { buildFlywheelOptimisation } from "@/lib/flywheel-optimisation";
import { buildGrowthDirector } from "@/lib/growth-director";
import { buildGrowthScorecard } from "@/lib/growth-scorecard";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { buildInfluencerGraphState } from "@/lib/influencer-graph";
import { listIngestionSources } from "@/lib/ingestion/sources";
import { buildNarrativeSequenceInsights, buildNarrativeSequencesForSignals, buildSignalNarrativeSequence, findNarrativeSequenceStep } from "@/lib/narrative-sequences";
import { listOperatorTasks, buildOperatorTaskSummary } from "@/lib/operator-tasks";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingAssistantPackages } from "@/lib/posting-assistant";
import { buildRevenueSignalInsights, syncRevenueSignals } from "@/lib/revenue-signals";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { buildSourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import { getOperatorTuning } from "@/lib/tuning";
import { formatDateTime } from "@/lib/utils";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { buildWeeklyPostingPack, buildWeeklyPostingPackInsights } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";
import {
  buildZazaConnectBridgeSummary,
  getLatestZazaConnectExport,
  listImportedZazaConnectContexts,
} from "@/lib/zaza-connect-bridge";

export const dynamic = "force-dynamic";

export default async function DirectorPage() {
  const renderNow = new Date();
  const [
    signalResult,
    feedbackEntries,
    patterns,
    playbookCards,
    bundles,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    duplicateClusters,
    experiments,
    storedExperimentProposals,
    strategy,
    tuning,
    ingestionSources,
    influencerGraph,
    importedConnectContexts,
    latestConnectExport,
  ] = await Promise.all([
    listSignalsWithFallback({ limit: 1000 }),
    listFeedbackEntries(),
    listPatterns(),
    listPlaybookCards(),
    listPatternBundles(),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
    listDuplicateClusters(),
    listExperiments(),
    listExperimentProposals(),
    getCampaignStrategy(),
    getOperatorTuning(),
    listIngestionSources(),
    buildInfluencerGraphState(),
    listImportedZazaConnectContexts(),
    getLatestZazaConnectExport(),
  ]);

  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, signalResult.signals, postingEntries);
  const cadence = buildCampaignCadenceSummary(signalResult.signals, strategy, postingEntries);
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
      confirmedClustersByCanonicalSignalId: indexConfirmedClusterByCanonicalSignalId(duplicateClusters),
      allSignals: signalResult.signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
    },
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
    now: renderNow,
  });
  const weeklyRecap = buildWeeklyRecap({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId,
  });
  const previousWeekStartDate = new Date(`${weeklyRecap.weekStartDate}T00:00:00Z`);
  previousWeekStartDate.setUTCDate(previousWeekStartDate.getUTCDate() - 7);
  const previousWeeklyRecap = buildWeeklyRecap({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId,
    weekStartDate: previousWeekStartDate.toISOString().slice(0, 10),
    now: renderNow,
  });
  const revenueSignals = await syncRevenueSignals({
    signals: signalResult.signals,
    postingEntries,
    strategicOutcomes,
  });
  const revenueInsights = buildRevenueSignalInsights(revenueSignals);
  const audienceMemory = buildAudienceMemoryState({
    strategy,
    signals: signalResult.signals,
    postingEntries,
    strategicOutcomes,
    revenueSignals,
  });
  const sourceAutopilotState = await buildSourceAutopilotV2State({
    source: signalResult.source,
    sourceRegistry: ingestionSources,
    signals: signalResult.signals,
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
  const experimentProposalInsights = buildExperimentProposalInsights(
    buildAutonomousExperimentProposals({
      candidates: approvalReadyCandidates,
      experiments,
      storedProposals: storedExperimentProposals,
      maxProposals: 6,
    }),
  );
  const optimisation = buildFlywheelOptimisation({
    weeklyRecap,
    sourceAutopilotState,
    playbookCoverageSummary,
    weeklyPostingPack,
    evergreenSummary,
    experimentProposalInsights,
    narrativeSequenceInsights,
    revenueInsights,
    audienceMemory,
    now: renderNow,
  });
  const followUpTasks = await listFollowUpTasks({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    weeklyPlans: weeklyPlan ? [weeklyPlan] : [],
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
    sourceAutopilotState,
  });
  const operatorTaskSummary = buildOperatorTaskSummary(operatorTasks);
  const stagedPostingPackages = await listPostingAssistantPackages({ status: "active" });
  const signalsById = new Map(signalResult.signals.map((signal) => [signal.recordId, signal]));
  const sequenceByPackageId = Object.fromEntries(
    stagedPostingPackages.map((pkg) => {
      const signal = signalsById.get(pkg.signalId);
      const sequence = signal ? buildSignalNarrativeSequence({ signal, strategy }) : null;
      return [pkg.packageId, sequence ? findNarrativeSequenceStep(sequence, pkg.platform) : null];
    }),
  );
  const distributionSummary = buildDistributionSummary(
    buildDistributionBundles({
      packages: stagedPostingPackages,
      sequenceByPackageId,
    }),
  );
  const weeklyPostingPackInsights = buildWeeklyPostingPackInsights(weeklyPostingPack);
  const scorecard = buildGrowthScorecard({
    approvalCandidates: approvalReadyCandidates,
    weeklyPack: weeklyPostingPack,
    weeklyPackInsights: weeklyPostingPackInsights,
    distributionSummary,
    currentRecap: weeklyRecap,
    previousRecap: previousWeeklyRecap,
    revenueSignals,
    experiments,
    cadence,
    strategy,
    now: renderNow,
  });
  const connectBridgeSummary = buildZazaConnectBridgeSummary({
    latestExport: latestConnectExport,
    importedContexts: importedConnectContexts,
    influencerGraphSummary: influencerGraph.summary,
  });
  const director = buildGrowthDirector({
    weeklyPlan,
    weeklyPostingPack,
    approvalCandidates: approvalReadyCandidates,
    operatorTaskSummary,
    operatorTasks,
    followUpTasks,
    weeklyRecap,
    sourceAutopilotState,
    optimisation,
    influencerGraphSummary: influencerGraph.summary,
    distributionSummary,
    revenueInsights,
    narrativeSequenceInsights,
    connectBridgeSummary,
    scorecard,
    now: renderNow,
  });

  await appendAuditEventsSafe([
    {
      signalId: `growth-director:${renderNow.toISOString().slice(0, 10)}`,
      eventType: "GROWTH_DIRECTOR_SUMMARY_GENERATED",
      actor: "system",
      summary: "Generated AI Growth Director summary.",
      metadata: {
        priorities: director.topPriorities.length,
        bottlenecks: director.topBottlenecks.length,
        opportunities: director.strongestOpportunities.length,
        actions: director.recommendedActions.length,
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
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Generated {formatDateTime(renderNow.toISOString())}</Badge>
          </div>
          <CardTitle className="text-3xl">AI Growth Director</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            A bounded strategic meta-layer that turns the system&apos;s planning, queue, outcome, distribution, and outreach memory into a short set of grounded next moves.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open digest
          </Link>
          <Link href="/review" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open review
          </Link>
          <Link href="/weekly-pack" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly pack
          </Link>
          <Link href="/posting" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open posting assistant
          </Link>
          <Link href="/optimisation" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open optimisation
          </Link>
          <Link href="/scorecard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open scorecard
          </Link>
          <Link href="/connect-bridge" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open Zaza Connect bridge
          </Link>
        </CardContent>
      </Card>

      <GrowthScorecardPanel scorecard={scorecard} compact />
      <GrowthDirectorPanel director={director} />
    </div>
  );
}
