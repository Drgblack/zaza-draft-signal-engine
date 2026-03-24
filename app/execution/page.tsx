import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/signal-repository";
import { buildAttributionRecordsFromInputs } from "@/lib/attribution";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
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
import { buildAdaptiveFunnelState } from "@/lib/funnel-engine";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingAssistantPackages } from "@/lib/posting-assistant";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { buildRevenueSignalsFromInputs } from "@/lib/revenue-signals";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import { buildWeeklyExecutionInsights, runWeeklyExecutionAutopilot, type WeeklyExecutionItem } from "@/lib/weekly-execution";
import { buildWeeklyPostingPack } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

function statusClasses(status: WeeklyExecutionItem["status"]) {
  switch (status) {
    case "staged_for_posting":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "ready_to_stage":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "blocked":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "ready_to_review":
    default:
      return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

function statusLabel(status: WeeklyExecutionItem["status"]) {
  switch (status) {
    case "staged_for_posting":
      return "Staged for posting";
    case "ready_to_stage":
      return "Ready to stage";
    case "blocked":
      return "Blocked";
    case "ready_to_review":
    default:
      return "Ready to review";
  }
}

function sectionTitle(status: WeeklyExecutionItem["status"]) {
  switch (status) {
    case "staged_for_posting":
      return "Staged now";
    case "ready_to_stage":
      return "Ready to stage next";
    case "blocked":
      return "Blocked by policy";
    case "ready_to_review":
    default:
      return "Review before staging";
  }
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-500">{copy}</div>;
}

export default async function ExecutionPage() {
  const strategy = await getCampaignStrategy();
  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
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
    stagedPostingPackages,
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
    listPostingAssistantPackages({ status: "active" }),
  ]);

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
  const cadence = buildCampaignCadenceSummary(signalResult.signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(
    weeklyPlan,
    strategy,
    signalResult.signals,
    postingEntries,
  );
  const confirmedClustersByCanonicalSignalId =
    indexConfirmedClusterByCanonicalSignalId(duplicateClusters);
  const visibleSignals = filterSignalsForActiveReviewQueue(
    signalResult.signals,
    duplicateClusters,
  );
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
    24,
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
  const attributionRecords = buildAttributionRecordsFromInputs({
    postingEntries,
    strategicOutcomes,
    signals: signalResult.signals,
  });
  const revenueSignals = buildRevenueSignalsFromInputs({
    postingEntries,
    strategicOutcomes,
    signals: signalResult.signals,
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
  const funnelEngine = buildAdaptiveFunnelState({
    signals: signalResult.signals,
    weeklyPackSignalIds: weeklyPostingPack.items.map((item) => item.signalId),
    approvalCandidates: approvalReadyCandidates,
    attributionRecords,
    revenueSignals,
    campaignLifecycle,
  });
  const execution = await runWeeklyExecutionAutopilot({
    weekStartDate: weeklyPostingPack.weekStartDate,
    pack: weeklyPostingPack,
    approvalCandidates: approvalReadyCandidates,
    stagedPackages: stagedPostingPackages,
    experiments,
    lifecycleByCampaignId: Object.fromEntries(
      campaignLifecycle.recommendations.map((recommendation) => [recommendation.campaignId, recommendation]),
    ),
    funnelEngine,
  });
  const executionInsights = buildWeeklyExecutionInsights([execution.flow]);
  const grouped = {
    staged: execution.flow.executionItems.filter((item) => item.status === "staged_for_posting"),
    readyToStage: execution.flow.executionItems.filter((item) => item.status === "ready_to_stage"),
    review: execution.flow.executionItems.filter((item) => item.status === "ready_to_review"),
    blocked: execution.flow.executionItems.filter((item) => item.status === "blocked"),
  };

  return (
    <div className="space-y-7">
      <Card className="border-black/8 bg-white shadow-[0_20px_52px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Weekly execution autopilot</Badge>
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{execution.flow.weekStartDate}</Badge>
          </div>
          <CardTitle className="text-4xl">Execution</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            The operator&apos;s weekly execution path, already ordered, staged where safe, and kept visible where policy still requires review.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/weekly-pack" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly pack
          </Link>
          <Link href="/posting" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open posting assistant
          </Link>
          <Link href="/review" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open review queue
          </Link>
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open digest
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
          <p className="text-[11px] font-medium text-slate-500">Staged now</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{execution.flow.stagedCount}</p>
          <p className="mt-1 text-sm text-slate-600">Posting packages already prepared for manual send.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
          <p className="text-[11px] font-medium text-slate-500">Ready to stage</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{execution.flow.readyToStageCount}</p>
          <p className="mt-1 text-sm text-slate-600">High-confidence weekly items that can be staged next.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
          <p className="text-[11px] font-medium text-slate-500">Needs review</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{execution.flow.reviewCount}</p>
          <p className="mt-1 text-sm text-slate-600">Items still requiring operator judgement before staging.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
          <p className="text-[11px] font-medium text-slate-500">Blocked</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{execution.flow.blockedCount}</p>
          <p className="mt-1 text-sm text-slate-600">Visible blockers that the autopilot refused to stage.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
          <p className="text-[11px] font-medium text-slate-500">Execution-ready rate</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{Math.round(executionInsights.executionReadyRate * 100)}%</p>
          <p className="mt-1 text-sm text-slate-600">Share of this week&apos;s execution flow that is staged or safe to stage.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <CardHeader>
            <CardTitle>Execution order</CardTitle>
            <CardDescription>
              Work ordered by staged readiness, sequence role, campaign urgency, and current weekly-pack strength.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {execution.flow.executionItems.length === 0 ? (
              <EmptyState copy="No weekly execution item is ready to summarize yet." />
            ) : (
              execution.flow.executionItems.map((item) => (
                <Link key={`${item.signalId}:${item.platform}`} href={item.href} className="block rounded-2xl border border-black/5 bg-white/80 px-4 py-3.5 transition hover:bg-white">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">#{item.executionOrder}</Badge>
                    <Badge className={statusClasses(item.status)}>{statusLabel(item.status)}</Badge>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.platform}</Badge>
                    {item.distributionBundleReady ? (
                      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Bundle ready</Badge>
                    ) : null}
                    {item.sequenceLabel ? (
                      <Badge className="bg-violet-50 text-violet-700 ring-violet-200">
                        {item.sequenceStepLabel ? `${item.sequenceStepLabel} · ` : ""}{item.sequenceLabel}
                      </Badge>
                    ) : null}
                    {item.distributionStrategy ? (
                      <Badge className={item.distributionStrategy === "multi" ? "bg-sky-50 text-sky-700 ring-sky-200" : item.distributionStrategy === "experimental" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                        {item.distributionStrategy === "multi"
                          ? "Multi-platform"
                          : item.distributionStrategy === "experimental"
                            ? "Experimental distribution"
                            : "Single-platform"}
                      </Badge>
                    ) : null}
                    {item.riskSeverity ? (
                      <Badge className={item.riskSeverity === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : item.riskSeverity === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                        {item.riskSeverity === "high" ? "High risk" : item.riskSeverity === "medium" ? "Risk fix suggested" : "Risk note"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2.5 font-medium text-slate-950">{item.sourceTitle}</p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.executionReason}</p>
                  {item.distributionReason ? (
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">{item.distributionReason}</p>
                  ) : null}
                  {item.riskSummary ? (
                    <p className="mt-1.5 text-xs leading-5 text-rose-700">{item.riskSummary}</p>
                  ) : null}
                  {item.executionChainSummary ? (
                    <p className="mt-1.5 text-xs leading-5 text-sky-700">Auto-executed chain: {item.executionChainSummary.replace(/^Auto-executed chain:\s*/i, "").replace(/\.$/, "")}</p>
                  ) : null}
                  {item.blockReasons[0] ? (
                    <p className="mt-1.5 text-xs leading-5 text-rose-700">Blocked by: {item.blockReasons[0]}</p>
                  ) : null}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            <CardHeader>
              <CardTitle>Autopilot summary</CardTitle>
              <CardDescription>
                Clear weekly reasons, sequence context, and bundle readiness without hidden posting behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {execution.flow.executionReasons.map((reason) => (
                <div key={reason} className="rounded-2xl border border-black/5 bg-white/80 px-4 py-4 text-sm leading-6 text-slate-600">
                  {reason}
                </div>
              ))}
              {execution.flow.sequenceNotes.map((note) => (
                <div key={note} className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-500">
                  {note}
                </div>
              ))}
            </CardContent>
          </Card>

          {(["staged_for_posting", "ready_to_stage", "ready_to_review", "blocked"] as const).map((status) => {
            const items =
              status === "staged_for_posting"
                ? grouped.staged
                : status === "ready_to_stage"
                  ? grouped.readyToStage
                  : status === "ready_to_review"
                    ? grouped.review
                    : grouped.blocked;

            return (
              <Card key={status} className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                <CardHeader>
                  <CardTitle>{sectionTitle(status)}</CardTitle>
                  <CardDescription>
                    {status === "staged_for_posting"
                      ? "Already staged and ready for manual posting confirmation."
                      : status === "ready_to_stage"
                        ? "Safe to stage next if you want the posting assistant prepared automatically."
                        : status === "ready_to_review"
                          ? "Needs explicit operator review before staging."
                          : "Still visible, but held back by policy or package risk."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.length === 0 ? (
                    <EmptyState
                      copy={
                        status === "blocked"
                          ? "No weekly item is currently blocked."
                          : `No item is currently marked as ${statusLabel(status).toLowerCase()}.`
                      }
                    />
                  ) : (
                    items.map((item) => (
                      <Link key={`${status}:${item.signalId}:${item.platform}`} href={item.href} className="block rounded-2xl border border-black/5 bg-white/80 px-4 py-3.5 transition hover:bg-white">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={statusClasses(item.status)}>{statusLabel(item.status)}</Badge>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.platform}</Badge>
                          {item.riskSeverity ? (
                            <Badge className={item.riskSeverity === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : item.riskSeverity === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                              {item.riskSeverity === "high" ? "High risk" : item.riskSeverity === "medium" ? "Risk fix suggested" : "Risk note"}
                            </Badge>
                          ) : null}
                          {item.distributionStrategy ? (
                            <Badge className={item.distributionStrategy === "multi" ? "bg-sky-50 text-sky-700 ring-sky-200" : item.distributionStrategy === "experimental" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                              {item.distributionStrategy === "multi"
                                ? "Multi-platform"
                                : item.distributionStrategy === "experimental"
                                  ? "Experimental distribution"
                                  : "Single-platform"}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-3 font-medium text-slate-950">{item.sourceTitle}</p>
                        <p className="mt-2 text-sm text-slate-600">{item.executionReason}</p>
                        {item.distributionReason ? <p className="mt-2 text-xs text-slate-500">{item.distributionReason}</p> : null}
                        {item.riskSummary ? <p className="mt-2 text-xs text-rose-700">{item.riskSummary}</p> : null}
                        {item.riskSuggestedFix ? <p className="mt-2 text-xs text-slate-500">Suggested fix: {item.riskSuggestedFix}</p> : null}
                        {item.secondaryPlatforms.length > 0 ? (
                          <p className="mt-2 text-xs text-slate-500">Secondary routes: {item.secondaryPlatforms.map((platform) => getPostingPlatformLabel(platform)).join(" · ")}</p>
                        ) : null}
                        {item.executionChainSummary ? (
                          <p className="mt-2 text-xs text-sky-700">{item.executionChainSummary}</p>
                        ) : null}
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

