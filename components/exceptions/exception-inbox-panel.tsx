"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ExceptionInboxActionResponse,
} from "@/types/api";
import type {
  ExceptionInboxGroup,
  ExceptionInboxItem,
  ExceptionInboxState,
  ExceptionIssueType,
} from "@/lib/exception-inbox";

function issueTone(issueType: ExceptionIssueType) {
  switch (issueType) {
    case "blocked_by_policy":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "conflict_detected":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "missing_outcome":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "experiment_unresolved":
      return "bg-violet-50 text-violet-700 ring-violet-200";
    case "duplicate_unresolved":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "incomplete_package":
      return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "needs_judgement":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function priorityTone(priority: ExceptionInboxItem["priority"]) {
  if (priority === "high") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (priority === "medium") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function priorityLabel(priority: ExceptionInboxItem["priority"]) {
  if (priority === "high") {
    return "High priority";
  }

  if (priority === "medium") {
    return "Medium priority";
  }

  return "Low priority";
}

function compactIssueCopy(issueType: ExceptionIssueType) {
  switch (issueType) {
    case "needs_judgement":
      return "Judgement";
    case "blocked_by_policy":
      return "Policy blocked";
    case "conflict_detected":
      return "Conflict";
    case "missing_outcome":
      return "Missing outcome";
    case "incomplete_package":
      return "Incomplete";
    case "experiment_unresolved":
      return "Experiment";
    case "duplicate_unresolved":
    default:
      return "Duplicate";
  }
}

function removeItem(groups: ExceptionInboxGroup[], itemId: string) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== itemId),
    }))
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      ...group,
      count: group.items.length,
    }));
}

export function ExceptionInboxPanel({
  initialState,
}: {
  initialState: ExceptionInboxState;
}) {
  const [groups, setGroups] = useState(initialState.groups);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const openCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.items.length, 0),
    [groups],
  );

  function updateLocalState(itemId: string) {
    setGroups((current) => removeItem(current, itemId));
  }

  function runAction(
    input:
      | { action: "dismiss"; item: ExceptionInboxItem }
      | { action: "resolve"; item: ExceptionInboxItem }
      | { action: "resolve_duplicate"; item: ExceptionInboxItem },
  ) {
    startTransition(async () => {
      try {
        const response = await fetch("/api/exceptions", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            input.action === "resolve_duplicate"
              ? {
                  action: "resolve_duplicate",
                  exceptionId: input.item.id,
                  taskId: input.item.taskId,
                  quickAction: input.item.quickAction,
                }
              : {
                  action: input.action,
                  exceptionId: input.item.id,
                  taskId: input.item.taskId,
                },
          ),
        });
        const data = (await response.json().catch(() => null)) as ExceptionInboxActionResponse | null;

        if (!response.ok || !data?.success) {
          throw new Error(data?.error ?? "Unable to update exception item.");
        }

        updateLocalState(input.item.id);
        setFeedback(data.message);
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "Unable to update exception item.",
        );
      }
    });
  }

  if (openCount === 0) {
    return (
      <div className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-500">
        No operator exception is open right now.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {feedback ? (
        <div className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-500">
          {feedback}
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.issueType} className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{group.label}</h3>
            <Badge className={issueTone(group.issueType)}>{group.count}</Badge>
          </div>

          <div className="space-y-2.5">
            {group.items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-black/5 bg-white/80 px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={priorityTone(item.priority)}>
                    {priorityLabel(item.priority)}
                  </Badge>
                  <Badge className={issueTone(item.issueType)}>
                    {compactIssueCopy(item.issueType)}
                  </Badge>
                </div>

                <p className="mt-2.5 font-medium text-slate-950">{item.title}</p>
                {item.sourceTitle ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {item.sourceTitle}
                  </p>
                ) : null}

                <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-3">
                    <p className="text-[11px] font-medium text-slate-500">
                      Why it matters
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">
                      {item.whyItMatters}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-3">
                    <p className="text-[11px] font-medium text-slate-500">
                      Recommended action
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">
                      {item.recommendedAction}
                    </p>
                  </div>
                </div>

                {item.supportingSignals.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {item.supportingSignals.map((signal) => (
                      <Badge
                        key={`${item.id}:${signal}`}
                        className="bg-slate-100 text-slate-700 ring-slate-200"
                      >
                        {signal}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={item.href}>
                    <Button size="sm" variant="secondary">
                      {item.actionLabel}
                    </Button>
                  </Link>
                  {item.quickAction?.type === "confirm_duplicate_cluster" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isPending}
                      onClick={() =>
                        runAction({ action: "resolve_duplicate", item })
                      }
                    >
                      Resolve duplicate
                    </Button>
                  ) : null}
                  {item.taskId && item.quickAction?.type !== "confirm_duplicate_cluster" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isPending}
                      onClick={() => runAction({ action: "resolve", item })}
                    >
                      Resolve
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => runAction({ action: "dismiss", item })}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
