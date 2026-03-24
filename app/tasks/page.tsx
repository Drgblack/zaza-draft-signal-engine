import Link from "next/link";

import { OperatorTaskList } from "@/components/tasks/operator-task-list";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/signal-repository";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { listDuplicateClusters } from "@/lib/duplicate-clusters";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import {
  buildOperatorTaskSummary,
  listOperatorTasks,
} from "@/lib/operator-tasks";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { formatDateTime } from "@/lib/utils";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
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
  const cadence = buildCampaignCadenceSummary(signalResult.signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, signalResult.signals, postingEntries);
  const tasks = await listOperatorTasks({
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
  const summary = buildOperatorTaskSummary(tasks);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={signalResult.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {signalResult.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Updated {formatDateTime(renderNow.toISOString())}</Badge>
          </div>
          <CardTitle className="text-3xl">Operator Tasks</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            A bounded operational work queue for judgement calls, completion gaps, confirmations, and fixes that unblock better automation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to digest
          </Link>
          <Link href="/review?view=needs_judgement" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open review judgement lane
          </Link>
          <Link href="/ingestion" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open source controls
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Open tasks</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.openCount}</p>
          <p className="mt-1 text-sm text-slate-600">Current unresolved operator work items.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">High priority</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.highPriorityCount}</p>
          <p className="mt-1 text-sm text-slate-600">Tasks with the highest leverage or blocking pressure.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top bottleneck</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.topBottlenecks[0]?.label ?? "None yet"}</p>
          <p className="mt-1 text-sm text-slate-600">
            {summary.topBottlenecks[0]
              ? `${summary.topBottlenecks[0].count} tasks are currently concentrated here.`
              : "No recurring operator bottleneck is stable enough to surface."}
          </p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Auto-closed or done</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.doneCount}</p>
          <p className="mt-1 text-sm text-slate-600">Resolved tasks still recorded for bounded visibility.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task Queue</CardTitle>
          <CardDescription>
            Tasks stay explicit, linked to real entities, and disappear automatically when the underlying state is resolved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OperatorTaskList
            initialTasks={tasks}
            emptyCopy="No operator task is currently open."
            referenceNowIso={renderNow.toISOString()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

