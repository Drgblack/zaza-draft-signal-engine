import Link from "next/link";

import { ExceptionInboxPanel } from "@/components/exceptions/exception-inbox-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { prepareWeeklyExecutionFlow } from "@/lib/weekly-execution";
import { syncExceptionInbox } from "@/lib/exception-inbox";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { buildOperatorTaskSummary, listOperatorTasks } from "@/lib/operator-tasks";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingAssistantPackages } from "@/lib/posting-assistant";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { formatDateTime } from "@/lib/utils";
import { buildWeeklyPostingPack } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage() {
  const renderNow = new Date();
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
    36,
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
    now: renderNow,
  });
  const operatorTaskSummary = buildOperatorTaskSummary(operatorTasks);
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
  const executionFlow = prepareWeeklyExecutionFlow({
    weekStartDate: weeklyPostingPack.weekStartDate,
    pack: weeklyPostingPack,
    approvalCandidates: approvalReadyCandidates,
    stagedPackages: stagedPostingPackages,
  }).flow;
  const exceptionInbox = await syncExceptionInbox({
    approvalCandidates: approvalReadyCandidates,
    operatorTasks,
    executionFlow,
    now: renderNow,
  });
  const topGroup = exceptionInbox.groups[0] ?? null;
  const highPriorityCount = exceptionInbox.groups
    .flatMap((group) => group.items)
    .filter((item) => item.priority === "high").length;

  return (
    <div className="space-y-7">
      <Card className="border-black/8 bg-white shadow-[0_20px_52px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              className={
                signalResult.source === "airtable"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-amber-50 text-amber-700 ring-amber-200"
              }
            >
              {signalResult.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              Updated {formatDateTime(renderNow.toISOString())}
            </Badge>
          </div>
          <CardTitle className="text-4xl">Exception Inbox</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            One bounded operator-only inbox for blocked, unresolved, or judgement-required work, already grouped by issue type and ordered for fastest resolution.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to digest
          </Link>
          <Link href="/review?view=needs_judgement" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open review judgement lane
          </Link>
          <Link href="/tasks" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open operator tasks
          </Link>
          <Link href="/execution" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open execution flow
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
          <p className="text-[11px] font-medium text-slate-500">Needs attention</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{exceptionInbox.openCount}</p>
          <p className="mt-1 text-sm text-slate-600">Open exception items requiring operator intervention.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
          <p className="text-[11px] font-medium text-slate-500">High priority</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{highPriorityCount}</p>
          <p className="mt-1 text-sm text-slate-600">Most urgent exceptions by commercial value or workflow pressure.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
          <p className="text-[11px] font-medium text-slate-500">Top issue type</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{topGroup?.label ?? "None"}</p>
          <p className="mt-1 text-sm text-slate-600">
            {topGroup ? `${topGroup.count} item${topGroup.count === 1 ? "" : "s"} are concentrated here.` : "No stable exception cluster is open right now."}
          </p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
          <p className="text-[11px] font-medium text-slate-500">Related task load</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{operatorTaskSummary.openCount}</p>
          <p className="mt-1 text-sm text-slate-600">Operator tasks still open across outcome, package, duplicate, and experiment loops.</p>
        </div>
      </div>

      {exceptionInbox.topSummary.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-3">
          {exceptionInbox.topSummary.slice(0, 3).map((summary) => (
            <div key={summary} className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4 text-sm leading-6 text-slate-600">
              {summary}
            </div>
          ))}
        </div>
      ) : null}

      <Card className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle>Exception Queue</CardTitle>
          <CardDescription>
            Compact grouped cards with a clear why, one recommended next action, and optional one-click resolution where that is low-risk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExceptionInboxPanel initialState={exceptionInbox} />
        </CardContent>
      </Card>
    </div>
  );
}
