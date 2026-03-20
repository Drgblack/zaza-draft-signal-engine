"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FollowUpTask } from "@/lib/follow-up";

function getFollowUpTaskTypeLabel(taskType: FollowUpTask["taskType"]): string {
  switch (taskType) {
    case "rate_post_outcome":
      return "Rate outcome";
    case "complete_strategic_outcome":
      return "Strategic outcome";
    case "complete_experiment_result":
      return "Experiment result";
    case "review_weekly_pack_outcomes":
    default:
      return "Weekly pack review";
  }
}

function getFollowUpTaskDueLabel(task: FollowUpTask, referenceNowMs: number): string {
  const dueAt = new Date(task.dueAt).getTime();
  if (!Number.isFinite(dueAt)) {
    return task.dueAt.slice(0, 10);
  }

  const diff = referenceNowMs - dueAt;
  if (diff > 0) {
    const overdueDays = Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)));
    return overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`;
  }

  return `Due ${task.dueAt.slice(0, 10)}`;
}

function statusBadgeClasses(task: FollowUpTask, referenceNowMs: number): string {
  if (task.status !== "open") {
    return task.status === "done"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-slate-100 text-slate-700 ring-slate-200";
  }

  return getFollowUpTaskDueLabel(task, referenceNowMs).startsWith("Overdue")
    ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-sky-50 text-sky-700 ring-sky-200";
}

export function FollowUpTaskList({
  initialTasks,
  emptyCopy,
  referenceNowIso,
}: {
  initialTasks: FollowUpTask[];
  emptyCopy: string;
  referenceNowIso: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [isPending, startTransition] = useTransition();
  const referenceNowMs = useMemo(() => new Date(referenceNowIso).getTime(), [referenceNowIso]);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === "open"),
    [tasks],
  );

  function updateTask(taskId: string, status: "done" | "dismissed") {
    startTransition(async () => {
      const response = await fetch("/api/follow-up", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId, status }),
      });

      if (!response.ok) {
        return;
      }

      setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)));
    });
  }

  if (openTasks.length === 0) {
    return <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">{emptyCopy}</div>;
  }

  return (
    <div className="space-y-3">
      {openTasks.map((task) => (
        <div key={task.id} className="rounded-2xl bg-white/80 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusBadgeClasses(task, referenceNowMs)}>{getFollowUpTaskTypeLabel(task.taskType)}</Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{getFollowUpTaskDueLabel(task, referenceNowMs)}</Badge>
            {task.platform ? <Badge className="bg-white/80 text-slate-700 ring-slate-200">{task.platform}</Badge> : null}
          </div>
          <p className="mt-3 font-medium text-slate-950">{task.title}</p>
          <p className="mt-2 text-sm text-slate-600">{task.reason}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={task.href}>
              <Button size="sm" variant="secondary">Open item</Button>
            </Link>
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => updateTask(task.id, "done")}>
              Mark done
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => updateTask(task.id, "dismissed")}>
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
