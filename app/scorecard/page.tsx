import Link from "next/link";

import { GrowthScorecardPanel } from "@/components/scorecard/growth-scorecard-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/signal-repository";
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
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildGrowthScorecard } from "@/lib/growth-scorecard";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingAssistantPackages } from "@/lib/posting-assistant";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildRevenueSignalInsights, syncRevenueSignals } from "@/lib/revenue-signals";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { formatDateTime } from "@/lib/utils";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { buildWeeklyPostingPack, buildWeeklyPostingPackInsights } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";
import {
  buildSignalNarrativeSequence,
  findNarrativeSequenceStep,
} from "@/lib/narrative-sequences";

export const dynamic = "force-dynamic";

export default async function ScorecardPage() {
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
    strategy,
    tuning,
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
    getCampaignStrategy(),
    getOperatorTuning(),
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
  const weeklyPostingPackInsights = buildWeeklyPostingPackInsights(weeklyPostingPack);
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

  await appendAuditEventsSafe([
    {
      signalId: `growth-scorecard:${renderNow.toISOString().slice(0, 10)}`,
      eventType: "GROWTH_SCORECARD_COMPUTED",
      actor: "system",
      summary: "Computed growth scorecard snapshot.",
      metadata: {
        overallHealth: scorecard.overallHealth,
        metricCount: scorecard.metrics.length,
        concerns: scorecard.topConcerns.length,
        positives: scorecard.topPositives.length,
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
          <CardTitle className="text-balance text-3xl">Growth Scorecard</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Compact growth health snapshot for content quality, execution readiness, outcome memory, commercial learning, queue health, experiments, and campaign support.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/director" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open director
          </Link>
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open digest
          </Link>
          <Link href="/review" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open review
          </Link>
          <Link href="/weekly-pack" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open weekly pack
          </Link>
          <Link href="/posting" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open posting assistant
          </Link>
          <Link href="/insights" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open insights
          </Link>
        </CardContent>
      </Card>

      <GrowthScorecardPanel scorecard={scorecard} />

      <Card>
        <CardHeader>
          <CardTitle>Scorecard Context</CardTitle>
          <CardDescription>
            A few grounding numbers behind the current health snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Revenue-linked summary</p>
            <p className="mt-2 text-sm text-slate-700">{revenueInsights.summaries[0] ?? "No revenue-linked summary is stable enough yet."}</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Weekly pack</p>
            <p className="mt-2 text-sm text-slate-700">{weeklyPostingPackInsights.coverageQuality}</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current week recap</p>
            <p className="mt-2 text-sm text-slate-700">{weeklyRecap.summary[0] ?? "No recap summary is available yet."}</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Previous week</p>
            <p className="mt-2 text-sm text-slate-700">{previousWeeklyRecap.summary[0] ?? "No previous-week summary is available yet."}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

