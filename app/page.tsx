import Link from "next/link";
import { ArrowRight, Clock3, Inbox } from "lucide-react";

import { OverviewCards } from "@/components/signals/overview-cards";
import { SignalsTable } from "@/components/signals/signals-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { STATUS_DISPLAY_ORDER } from "@/lib/constants";
import { listSignalsWithFallback } from "@/lib/signal-repository";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPatterns } from "@/lib/patterns";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";
import { formatDateTime } from "@/lib/utils";
import { getScheduledSoonSignals, getWorkflowBuckets } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { signals, source, error } = await listSignalsWithFallback();
  const feedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const playbookCards = await listPlaybookCards();
  const bundles = await listPatternBundles();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const strategicOutcomes = await listStrategicOutcomes();
  const duplicateClusters = await listDuplicateClusters();
  const experiments = await listExperiments();
  const strategy = await getCampaignStrategy();
  const tuning = await getOperatorTuning();
  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
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
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, signals, postingEntries);
  const confirmedClustersByCanonicalSignalId = indexConfirmedClusterByCanonicalSignalId(duplicateClusters);
  const visibleSignals = filterSignalsForActiveReviewQueue(signals, duplicateClusters);
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
  const approvalReadyCandidates = rankApprovalCandidates(
    signals
      .filter((signal) => visibleSignals.some((item) => item.recordId === signal.recordId))
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
    5,
    {
      strategy,
      cadence,
      weeklyPlan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
    },
  );
  const workflowBuckets = getWorkflowBuckets(visibleSignals);
  const scheduledSoon = getScheduledSoonSignals(visibleSignals);
  const statusCounts = STATUS_DISPLAY_ORDER.map((status) => ({
    status,
    count: signals.filter((signal) => signal.status === status).length,
  })).filter((item) => item.count > 0);

  const recentSignals = signals.slice(0, 5);

  return (
    <div className="space-y-10">
      <section className="grid gap-8 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="overflow-hidden border-black/8 bg-white shadow-[0_20px_52px_rgba(15,23,42,0.08)]">
          <CardHeader className="pb-2">
            <p className="text-[11px] font-medium tracking-[0.16em] text-slate-500">Dashboard</p>
            <CardTitle className="max-w-3xl text-balance text-4xl leading-tight sm:text-5xl">
              Quiet structure for signal intake, classification, and draft preparation.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base leading-8 text-slate-600">
              V1 stays intentionally tight: one signal in, light interpretation, placeholder draft outputs, then review and scheduling visibility.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/signals/new" className={buttonVariants({})}>
                Intake a signal
              </Link>
              <Link href="/review" className={buttonVariants({ variant: "secondary" })}>
                Open review queue
              </Link>
              <Link href="/ingestion" className={buttonVariants({ variant: "secondary" })}>
                Run pipeline
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-sm text-slate-500">
              <Link href="/playbook" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Playbook
              </Link>
              <Link href="/campaigns" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Campaigns
              </Link>
              <Link href="/plan" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Weekly plan
              </Link>
              <Link href="/digest" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Digest
              </Link>
              <Link href="/experiments" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Experiments
              </Link>
              <Link href="/settings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Adjust tuning
              </Link>
            </div>
            <p className="text-xs text-slate-500">
              Data source: <span className="font-semibold text-slate-800">{source === "airtable" ? "Airtable" : "Mock fallback"}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-black/6 bg-white/72 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Current Queue Shape</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-500">Status distribution across the internal workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {statusCounts.map((item) => (
              <div key={item.status} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white/80 px-4 py-3">
                <span className="text-sm text-slate-600">{item.status}</span>
                <span className="text-lg font-semibold text-slate-950">{item.count}</span>
              </div>
            ))}
            {error ? <p className="text-sm text-amber-700">{error}</p> : null}
          </CardContent>
        </Card>
      </section>

      <OverviewCards
        totalSignals={signals.length}
        needsInterpretation={workflowBuckets.needsInterpretation.length}
        inReview={workflowBuckets.readyForReview.length + workflowBuckets.readyToSchedule.length}
        scheduledOrPosted={signals.filter((signal) => ["Scheduled", "Posted"].includes(signal.status)).length}
      />

      <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <SignalsTable
          signals={recentSignals}
          title="Recent Signals"
          description="Latest signal records surfaced through mock or Airtable-backed data."
          guidanceBySignalId={guidanceBySignalId}
        />

        <Card className="border-black/6 bg-white/70 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Pipeline Watch</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-500">What needs operator attention next and what is scheduled soon.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3.5">
            {[
              {
                href: "/review#approval-ready",
                title: "Approval-ready",
                copy: `${approvalReadyCandidates.length} near-finished candidates are ready for final review.`,
                icon: ArrowRight,
              },
              {
                href: "/review#needs-interpretation",
                title: "Needs interpretation",
                copy: `${workflowBuckets.needsInterpretation.length} records still need structured editorial judgement.`,
                icon: Inbox,
              },
              {
                href: "/review#ready-for-generation",
                title: "Ready for generation",
                copy: `${workflowBuckets.readyForGeneration.length} records are interpreted and ready for draft creation.`,
                icon: ArrowRight,
              },
              {
                href: "/review#ready-for-review",
                title: "Ready for review",
                copy: `${workflowBuckets.readyForReview.length} drafted records are waiting for review or approval.`,
                icon: Clock3,
              },
              {
                href: "/plan",
                title: "Weekly plan",
                copy: weeklyPlanState.summaries[0] ?? "Set the week’s balance across campaigns, funnels, platforms, and modes.",
                icon: Clock3,
              },
              {
                href: "/ingestion",
                title: "Run pipeline",
                copy: "Fetch configured feeds, score candidates, and auto-advance only the strongest records into interpretation and draft prep.",
                icon: Inbox,
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-3xl border border-black/5 bg-white/78 p-4 transition hover:bg-white/92"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-slate-100/80 p-3 text-slate-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="text-sm leading-6 text-slate-500">{item.copy}</p>
                    </div>
                  </div>
                </Link>
              );
            })}

            <div className="rounded-3xl border border-black/5 bg-white/78 p-5">
              <p className="text-sm font-semibold text-slate-900">Scheduled soon</p>
              <div className="mt-3.5 space-y-2.5">
                {scheduledSoon.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing is scheduled in the next seven days.</p>
                ) : (
                  scheduledSoon.slice(0, 3).map((signal) => (
                    <Link key={signal.recordId} href={`/signals/${signal.recordId}`} className="block rounded-2xl border border-black/5 bg-white/82 px-4 py-3.5 hover:bg-white">
                      <p className="font-medium text-slate-900">{signal.sourceTitle}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(signal.scheduledDate)}</p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

