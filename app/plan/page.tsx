import { CampaignAllocationPanel } from "@/components/campaigns/campaign-allocation-panel";
import { CampaignLifecyclePanel } from "@/components/campaigns/campaign-lifecycle-panel";
import { GrowthMemoryPanel } from "@/components/director/growth-memory-panel";
import { FounderOverrideSummary } from "@/components/overrides/founder-override-summary";
import { PlaybookPackSuggestions } from "@/components/playbook/playbook-pack-suggestions";
import { FunnelEnginePanel } from "@/components/plan/funnel-engine-panel";
import { RevenueAmplifierPanel } from "@/components/plan/revenue-amplifier-panel";
import { RecommendedWeeklyPostingPackSection } from "@/components/plan/recommended-weekly-posting-pack";
import { WeeklyPlanManager } from "@/components/plan/weekly-plan-manager";
import { WeeklyRecapPanel } from "@/components/recap/weekly-recap-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/signal-repository";
import { buildAudienceMemoryInsights, syncAudienceMemory } from "@/lib/audience-memory";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildCampaignAllocationState } from "@/lib/campaign-allocation";
import { buildCampaignLifecycleState } from "@/lib/campaign-lifecycle";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildFatigueModel } from "@/lib/fatigue";
import { syncFounderOverrideState } from "@/lib/founder-overrides";
import { buildAdaptiveFunnelState } from "@/lib/funnel-engine";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { syncPlaybookPacks } from "@/lib/playbook-packs";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildRecommendedWeeklyPostingPack } from "@/lib/recommended-weekly-posting-pack";
import {
  buildAttributionInsights,
  syncAttributionMemory,
} from "@/lib/attribution";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { buildRevenueSignalInsights, buildRevenueSignalsFromInputs } from "@/lib/revenue-signals";
import { buildGrowthMemory } from "@/lib/growth-memory";
import { buildInfluencerGraphState } from "@/lib/influencer-graph";
import { buildRevenueAmplifierState } from "@/lib/revenue-amplifier";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { buildWeeklyPlanState, getCurrentWeeklyPlan, getWeeklyPlanStore, WEEKLY_PLAN_TEMPLATES } from "@/lib/weekly-plan";
import {
  buildZazaConnectBridgeSummary,
  getLatestZazaConnectExport,
  listImportedZazaConnectContexts,
} from "@/lib/zaza-connect-bridge";

export const dynamic = "force-dynamic";

export default async function WeeklyPlanPage() {
  const strategy = await getCampaignStrategy();
  const plan = await getCurrentWeeklyPlan(strategy);
  const store = await getWeeklyPlanStore(strategy);
  const { signals } = await listSignalsWithFallback();
  const feedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const playbookCards = await listPlaybookCards();
  const bundles = await listPatternBundles();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const strategicOutcomes = await listStrategicOutcomes();
  const duplicateClusters = await listDuplicateClusters();
  const experiments = await listExperiments();
  const tuning = await getOperatorTuning();
  const founderOverrides = await syncFounderOverrideState();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const cadence = buildCampaignCadenceSummary(signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(plan, strategy, signals, postingEntries);
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    signals,
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
  const visibleSignals = filterSignalsForActiveReviewQueue(signals, duplicateClusters);
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
    10,
    {
      strategy,
      cadence,
      weeklyPlan: plan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
      founderOverrides,
    },
  );
  const evergreenSummary = buildEvergreenSummary({
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    strategy,
    cadence,
    weeklyPlan: plan,
    weeklyPlanState,
    bundles,
    maxCandidates: 5,
  });
  const postingPack = buildRecommendedWeeklyPostingPack({
    weeklyPlan: plan,
    weeklyPlanState,
    strategy,
    approvalReadyCandidates,
    evergreenCandidates: evergreenSummary.candidates,
  });
  const fatigueModel = buildFatigueModel({
    subjects: approvalReadyCandidates.map((candidate) => ({
      id: candidate.signal.recordId,
      signal: candidate.signal,
      guidance: candidate.guidance,
    })),
    signals,
    postingEntries,
  });
  const recap = buildWeeklyRecap({
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId,
  });
  const playbookPacks = await syncPlaybookPacks({
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    reuseMemoryCases,
    recap,
  });
  const attributionRecords = await syncAttributionMemory({
    signals,
    postingEntries,
    strategicOutcomes,
  });
  const revenueSignals = buildRevenueSignalsFromInputs({
    signals,
    postingEntries,
    strategicOutcomes,
  });
  const audienceMemory = await syncAudienceMemory({
    strategy,
    signals,
    postingEntries,
    strategicOutcomes,
    attributionRecords,
    revenueSignals,
  });
  const audienceInsights = buildAudienceMemoryInsights(audienceMemory);
  const campaignLifecycle = buildCampaignLifecycleState({
    strategy,
    signals,
    weeklyPlan: plan,
    weeklyPackSignalIds: postingPack.items.map((item) => item.signalId),
    approvalCandidates: approvalReadyCandidates,
    cadence,
    revenueSignals,
  });
  const campaignAllocation = buildCampaignAllocationState({
    strategy,
    signals,
    weeklyPlan: plan,
    weeklyPackSignalIds: postingPack.items.map((item) => item.signalId),
    approvalCandidates: approvalReadyCandidates,
    cadence,
    revenueSignals,
    audienceMemory,
    lifecycle: campaignLifecycle,
  });
  const funnelEngine = buildAdaptiveFunnelState({
    signals,
    weeklyPackSignalIds: postingPack.items.map((item) => item.signalId),
    approvalCandidates: approvalReadyCandidates,
    attributionRecords,
    revenueSignals,
    campaignLifecycle,
  });
  const [importedConnectContexts, latestConnectExport] = await Promise.all([
    listImportedZazaConnectContexts(),
    getLatestZazaConnectExport(),
  ]);
  const connectBridgeSummary = buildZazaConnectBridgeSummary({
    latestExport: latestConnectExport,
    importedContexts: importedConnectContexts,
  });
  const attributionInsights = buildAttributionInsights(attributionRecords);
  const revenueInsights = buildRevenueSignalInsights(revenueSignals);
  const influencerGraph = await buildInfluencerGraphState();
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
    signals,
    revenueSignals,
    attributionRecords,
    growthMemory,
    weeklyRecap: recap,
  });

  return (
    <div className="space-y-7">
      <Card className="border-black/8 bg-white shadow-[0_20px_52px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Planning layer</Badge>
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{plan.weekStartDate}</Badge>
          </div>
          <CardTitle className="text-balance text-4xl">Weekly Plan</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Lightweight weekly intent for balancing fresh signals, evergreen content, campaigns, funnel coverage, platforms, and editorial modes. This guides ranking and review without turning the product into a scheduler.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
            <p className="text-[11px] font-medium text-slate-500">Templates</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{WEEKLY_PLAN_TEMPLATES.length}</p>
            <p className="mt-1 text-sm text-slate-500">Quick starting points for common planning modes.</p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
            <p className="text-[11px] font-medium text-slate-500">Active campaigns</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{plan.activeCampaignIds.length}</p>
            <p className="mt-1 text-sm text-slate-500">Campaigns currently emphasized this week.</p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
            <p className="text-[11px] font-medium text-slate-500">Target platforms</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{plan.targetPlatforms.length}</p>
            <p className="mt-1 text-sm text-slate-500">Platforms the queue should keep visible this week.</p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
            <p className="text-[11px] font-medium text-slate-500">Stored weeks</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{store.plans.length}</p>
            <p className="mt-1 text-sm text-slate-500">Simple planning history for light comparison.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <FounderOverrideSummary state={founderOverrides} compact />
        <Card className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <CardHeader>
            <CardTitle>Latest Winner Recap</CardTitle>
            <CardDescription>
              Advisory weekly synthesis used as light planning context only. Nothing from the recap is applied automatically.
            </CardDescription>
          </CardHeader>
        </Card>
        <WeeklyRecapPanel recap={recap} compact />
      </div>

      <Card className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle>Zaza Connect Context</CardTitle>
          <CardDescription>
            Imported outreach and relationship context that can lightly shape this week&apos;s content choices without turning planning into a CRM workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
            <p className="text-[11px] font-medium text-slate-500">Current bridge signal</p>
            <p className="mt-2 text-sm text-slate-700">
              {connectBridgeSummary.importedThemeCount} imported themes · {connectBridgeSummary.collaborationOpportunityCount} collaboration opportunities · {connectBridgeSummary.influencerRelevantExportCount} influencer-relevant export items
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {connectBridgeSummary.topNotes[0] ??
                "No imported cross-app context is strong enough to change this week’s plan yet."}
            </p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-4">
            <p className="text-[11px] font-medium text-slate-500">Planning hint</p>
            <p className="mt-2 text-sm text-slate-700">
              {importedConnectContexts[0]?.outreachCampaignThemes[0]
                ? `Outreach theme "${importedConnectContexts[0].outreachCampaignThemes[0].label}" is worth reflecting in trust-stage and collaboration-ready content this week.`
                : latestConnectExport?.outreachRelevantThemes[0]
                  ? `Latest export theme "${latestConnectExport.outreachRelevantThemes[0].label}" looks most reusable across content and outreach this week.`
                  : "No imported bridge theme is stable enough to summarize."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle>Audience Memory</CardTitle>
          <CardDescription>
            Segment-level memory that lightly informs planning with what each audience is actually responding to.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
            <p className="text-[11px] font-medium text-slate-500">Top audience guidance</p>
            <p className="mt-2 text-sm text-slate-700">
              {audienceInsights.topNotes[0] ??
                "No audience segment has enough response memory to shape this week's plan yet."}
            </p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-4">
            <p className="text-[11px] font-medium text-slate-500">Planning caution</p>
            <p className="mt-2 text-sm text-slate-700">
              {audienceMemory.segments[0]?.toneCautions[0]
                ? audienceMemory.segments[0].toneCautions[0]
                : audienceMemory.segments[0]?.preferredCtaStyles[0]
                  ? `${audienceMemory.segments[0].segmentName} currently prefers ${audienceMemory.segments[0].preferredCtaStyles[0].toLowerCase()}.`
                  : "No audience-specific caution is strong enough to surface yet."}
            </p>
          </div>
        </CardContent>
      </Card>

      <GrowthMemoryPanel memory={growthMemory} compact />

      <RevenueAmplifierPanel state={revenueAmplifier} compact />

      <Card className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle>Content fatigue</CardTitle>
          <CardDescription>
            Advisory repetition warnings across the current approval-ready mix and recent posting history. Nothing is suppressed automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fatigueModel.topWarnings.length === 0 ? (
            <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4 text-sm leading-6 text-slate-500">
              No strong fatigue pattern is dominating the current weekly mix.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {fatigueModel.topWarnings.map((warning) => (
                <div key={`${warning.dimension}:${warning.key}`} className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={warning.severity === "moderate" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                      {warning.severity === "moderate" ? "Moderate fatigue" : "Light fatigue"}
                    </Badge>
                    <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{warning.count} / {warning.total}</Badge>
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{warning.summary}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{warning.label}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RecommendedWeeklyPostingPackSection pack={postingPack} />

      <CampaignAllocationPanel state={campaignAllocation} compact />

      <CampaignLifecyclePanel state={campaignLifecycle} compact />

      <FunnelEnginePanel state={funnelEngine} />

      <PlaybookPackSuggestions
        title="Reusable Playbook Packs"
        description="Repeated winners promoted into compact planning hints. Use these to keep next week grounded in structures that already worked."
        matches={playbookPacks.slice(0, 3).map((pack) => ({
          pack,
          score: pack.strengthScore,
          reason: `Strong planning hint for ${pack.platform === "x" ? "X" : pack.platform === "linkedin" ? "LinkedIn" : "Reddit"} based on repeated winning evidence.`,
          matchedOn: [pack.mode ?? "cross-mode", pack.ctaStyle],
        }))}
        emptyCopy="No repeat-winning playbook pack is stable enough to suggest for planning yet."
      />

      <WeeklyPlanManager
        initialPlan={plan}
        recentPlans={store.plans.slice(0, 6)}
        templates={WEEKLY_PLAN_TEMPLATES}
        strategy={strategy}
        funnelEngine={funnelEngine}
      />
    </div>
  );
}

