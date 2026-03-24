import Link from "next/link";

import { FollowUpTaskList } from "@/components/follow-up/follow-up-task-list";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/signal-repository";
import { listExperiments } from "@/lib/experiments";
import { listFollowUpTasks } from "@/lib/follow-up";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { formatDateTime } from "@/lib/utils";
import { getCampaignStrategy } from "@/lib/campaigns";
import { getWeeklyPlanStore } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

export default async function FollowUpPage() {
  const renderNow = new Date();
  const [signalResult, postingEntries, postingOutcomes, strategicOutcomes, experiments, strategy] = await Promise.all([
    listSignalsWithFallback({ limit: 1000 }),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
    listExperiments(),
    getCampaignStrategy(),
  ]);
  const weeklyPlanStore = await getWeeklyPlanStore(strategy);
  const tasks = await listFollowUpTasks({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    weeklyPlans: weeklyPlanStore.plans,
  });
  const openTasks = tasks.filter((task) => task.status === "open");
  const overdueTasks = openTasks.filter((task) => new Date(task.dueAt).getTime() < renderNow.getTime());

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
          <CardTitle className="text-3xl">Outcome Follow-Up</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Daily autopilot queue for posted items, experiments, and weekly packs that still need manual outcome follow-up.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to digest
          </Link>
          <Link href="/experiments" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open experiments
          </Link>
          <Link href="/plan" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly plan
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Open tasks</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{openTasks.length}</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Overdue</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{overdueTasks.length}</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Experiments waiting</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {openTasks.filter((task) => task.taskType === "complete_experiment_result").length}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Follow-Up Queue</CardTitle>
          <CardDescription>One clear task per missing learning state. Nothing closes automatically without recorded data or an explicit operator action.</CardDescription>
        </CardHeader>
        <CardContent>
          <FollowUpTaskList
            initialTasks={tasks}
            emptyCopy="No follow-up task is currently open."
            referenceNowIso={renderNow.toISOString()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

