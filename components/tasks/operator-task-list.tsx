"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OperatorTask } from "@/lib/operator-tasks";
import type { OperatorTaskActionResponse, DuplicateClusterActionResponse, SourceProposalActionResponse } from "@/types/api";

function getOperatorTaskTypeLabel(taskType: OperatorTask["taskType"]): string {
  switch (taskType) {
    case "fill_missing_strategic_outcome":
      return "Missing strategic outcome";
    case "resolve_borderline_case":
      return "Borderline case";
    case "confirm_duplicate_cluster":
      return "Duplicate cluster";
    case "approve_source_recommendation":
      return "Source recommendation";
    case "finish_incomplete_package":
      return "Incomplete package";
    case "resolve_conflict":
      return "Conflict resolution";
    case "complete_experiment_result":
      return "Experiment result";
    case "refresh_stale_candidate":
    default:
      return "Stale refresh";
  }
}

function getOperatorTaskPriorityLabel(priority: OperatorTask["priority"]): string {
  return priority === "high" ? "High priority" : priority === "medium" ? "Medium priority" : "Low priority";
}

function getDueLabel(task: OperatorTask, referenceNowMs: number): string | null {
  if (!task.dueAt) {
    return null;
  }

  const dueMs = new Date(task.dueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return task.dueAt.slice(0, 10);
  }

  const diff = referenceNowMs - dueMs;
  if (diff > 0) {
    const overdueDays = Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)));
    return overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`;
  }

  return `Due ${task.dueAt.slice(0, 10)}`;
}

function priorityBadgeClasses(priority: OperatorTask["priority"]): string {
  if (priority === "high") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (priority === "medium") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function OperatorTaskList({
  initialTasks,
  emptyCopy,
  referenceNowIso,
}: {
  initialTasks: OperatorTask[];
  emptyCopy: string;
  referenceNowIso: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const referenceNowMs = useMemo(() => new Date(referenceNowIso).getTime(), [referenceNowIso]);
  const openTasks = useMemo(() => tasks.filter((task) => task.status === "open"), [tasks]);

  function updateTask(taskId: string, status: "done" | "dismissed") {
    startTransition(async () => {
      try {
        const response = await fetch("/api/operator-tasks", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ taskId, status }),
        });
        const data = (await response.json().catch(() => null)) as OperatorTaskActionResponse | null;

        if (!response.ok || !data?.success || !data.task) {
          throw new Error(data?.error ?? "Unable to update operator task.");
        }

        setTasks((current) => current.map((task) => (task.id === taskId ? data.task! : task)));
        setFeedback(data.message);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to update operator task.");
      }
    });
  }

  function runQuickAction(task: OperatorTask) {
    const quickAction = task.quickAction;
    if (!quickAction) {
      return;
    }

    startTransition(async () => {
      try {
        if (quickAction.type === "approve_source_recommendation") {
          const response = await fetch("/api/source-proposals", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              proposalId: quickAction.proposalId,
              action: "approve",
            }),
          });
          const data = (await response.json().catch(() => null)) as SourceProposalActionResponse | null;
          if (!response.ok || !data?.success) {
            throw new Error(data?.error ?? "Unable to approve source recommendation.");
          }
        } else if (quickAction.type === "confirm_duplicate_cluster") {
          const response = await fetch("/api/duplicate-clusters", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "confirm_cluster",
              cluster: quickAction.cluster,
            }),
          });
          const data = (await response.json().catch(() => null)) as DuplicateClusterActionResponse | null;
          if (!response.ok || !data?.success) {
            throw new Error(data?.error ?? "Unable to confirm duplicate cluster.");
          }
        }

        const updateResponse = await fetch("/api/operator-tasks", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId: task.id,
            status: "done",
          }),
        });
        const updateData = (await updateResponse.json().catch(() => null)) as OperatorTaskActionResponse | null;

        if (!updateResponse.ok || !updateData?.success || !updateData.task) {
          throw new Error(updateData?.error ?? "Underlying action succeeded, but the task could not be completed.");
        }

        setTasks((current) => current.map((item) => (item.id === task.id ? updateData.task! : item)));
        setFeedback(updateData.message);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to run task quick action.");
      }
    });
  }

  if (openTasks.length === 0) {
    return <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">{emptyCopy}</div>;
  }

  return (
    <div className="space-y-3">
      {feedback ? <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">{feedback}</div> : null}
      {openTasks.map((task) => {
        const dueLabel = getDueLabel(task, referenceNowMs);

        return (
          <div key={task.id} className="rounded-2xl bg-white/80 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={priorityBadgeClasses(task.priority)}>{getOperatorTaskPriorityLabel(task.priority)}</Badge>
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{getOperatorTaskTypeLabel(task.taskType)}</Badge>
              {dueLabel ? <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{dueLabel}</Badge> : null}
            </div>
            <p className="mt-3 font-medium text-slate-950">{task.title}</p>
            <p className="mt-2 text-sm text-slate-600">{task.reason}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={task.href}>
                <Button size="sm" variant="secondary">Open item</Button>
              </Link>
              {task.quickAction ? (
                <Button size="sm" variant="secondary" disabled={isPending} onClick={() => runQuickAction(task)}>
                  {task.quickAction.label}
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" disabled={isPending} onClick={() => updateTask(task.id, "done")}>
                Mark done
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => updateTask(task.id, "dismissed")}>
                Dismiss
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
