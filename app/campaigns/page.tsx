import { CampaignAllocationPanel } from "@/components/campaigns/campaign-allocation-panel";
import { CampaignStrategyManager } from "@/components/campaigns/campaign-strategy-manager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { buildAudienceMemoryState } from "@/lib/audience-memory";
import { appendAuditEventsSafe } from "@/lib/audit";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { buildCampaignAllocationState } from "@/lib/campaign-allocation";
import { buildCampaignCadenceSummary, CTA_GOAL_DESCRIPTIONS, FUNNEL_STAGE_DESCRIPTIONS, getCampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { filterSignalsForActiveReviewQueue, indexConfirmedClusterByCanonicalSignalId, listDuplicateClusters } from "@/lib/duplicate-clusters";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { syncRevenueSignals } from "@/lib/revenue-signals";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { buildWeeklyPostingPack } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";
import { CTA_GOALS, FUNNEL_STAGES } from "@/types/signal";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const strategy = await getCampaignStrategy();
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
    getOperatorTuning(),
  ]);
  const activeCampaigns = strategy.campaigns.filter((campaign) => campaign.status === "active");
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
  const approvalReadyCandidates = rankApprovalCandidates(
    visibleSignals
      .map((signal) => {
        const guidance = buildUnifiedGuidanceModel({
          signal,
          guidance: guidanceBySignalId[signal.recordId],
          context: "review",
          tuning: tuning.settings,
        });

        return {
          signal,
          guidance,
          assessment: assessAutonomousSignal(signal, guidance),
        };
      })
      .filter((item) => item.assessment.decision === "approval_ready"),
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
  const allocation = buildCampaignAllocationState({
    strategy,
    signals: signalResult.signals,
    weeklyPlan,
    weeklyPackSignalIds: weeklyPostingPack.items.map((item) => item.signalId),
    approvalCandidates: approvalReadyCandidates,
    cadence,
    revenueSignals,
    audienceMemory,
  });

  await appendAuditEventsSafe([
    {
      signalId: `campaign-allocation:${allocation.weekStartDate ?? new Date().toISOString().slice(0, 10)}`,
      eventType: "CAMPAIGN_ALLOCATION_COMPUTED",
      actor: "system",
      summary: `Computed campaign allocation guidance for ${allocation.recommendations.length} campaign${allocation.recommendations.length === 1 ? "" : "s"}.`,
      metadata: {
        increase: allocation.recommendations.filter((item) => item.supportLevel === "increase").length,
        maintain: allocation.recommendations.filter((item) => item.supportLevel === "maintain").length,
        reduce: allocation.recommendations.filter((item) => item.supportLevel === "reduce").length,
        paused: allocation.pausedCount,
      },
    },
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              {activeCampaigns.length} active campaign{activeCampaigns.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <CardTitle className="text-balance text-3xl">Campaign Strategy</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Lightweight strategic context for the signal engine. Campaigns, pillars, audiences, funnel stages, and CTA goals guide content generation and approval ranking without blocking work when context is still thin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Campaigns</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{strategy.campaigns.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Pillars</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{strategy.pillars.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Audience Segments</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{strategy.audienceSegments.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Funnel Stages</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{FUNNEL_STAGES.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <CampaignAllocationPanel state={allocation} />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Funnel Reference</CardTitle>
            <CardDescription>Bounded funnel labels used by the strategy layer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {FUNNEL_STAGES.map((stage) => (
              <div key={stage} className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">{stage}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{FUNNEL_STAGE_DESCRIPTIONS[stage]}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CTA Goals</CardTitle>
            <CardDescription>Simple CTA intent options used when context is assigned or overridden.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {CTA_GOALS.map((goal) => (
              <div key={goal} className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">{goal}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{CTA_GOAL_DESCRIPTIONS[goal]}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <CampaignStrategyManager initialStrategy={strategy} />
    </div>
  );
}
