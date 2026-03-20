"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BorderlineReviewResponse } from "@/types/api";

type BorderlineRow = {
  recordId: string;
  sourceTitle: string;
  status: string;
  stageLabel: string;
  confidenceLabel: string;
  confidenceTone: "success" | "warning" | "neutral";
  assessmentSummary: string;
  reasons: string[];
  strongestCaution: string | null;
  platformPriority: string | null;
  editorialModeLabel: string | null;
  pillarLabel: string | null;
  funnelStage: string | null;
  latestRepairLabel: string | null;
  nextStepHref: string;
  workbench: {
    borderlineReason: string;
    bestCaseKeep: string;
    bestCaseReject: string;
    missingEvidence: string;
    suggestedRepairActions: Array<{
      key: string;
      label: string;
      summary: string;
    }>;
  };
};

function toneClass(tone: BorderlineRow["confidenceTone"]) {
  switch (tone) {
    case "success":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "warning":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "neutral":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

async function postBorderlineAction(recordId: string, action: string) {
  const response = await fetch(`/api/signals/${recordId}/borderline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  });

  return (await response.json()) as BorderlineReviewResponse;
}

function BorderlineCard({ item }: { item: BorderlineRow }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; body: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(action: "open_workbench" | "approve_anyway" | "reject" | "apply_repair" | "request_more_context", openAfter = false) {
    startTransition(() => {
      void (async () => {
        const result = await postBorderlineAction(item.recordId, action);
        if (!result.success) {
          setFeedback({
            tone: "error",
            body: result.error ?? result.message,
          });
          return;
        }

        setFeedback({
          tone: "success",
          body: result.message,
        });
        if (openAfter) {
          setIsOpen(true);
        }
        router.refresh();
      })();
    });
  }

  return (
    <div className="rounded-2xl bg-white/80 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
              {item.stageLabel}
            </span>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClass(item.confidenceTone)}`}>
              {item.confidenceLabel}
            </span>
          </div>
          <div>
            <Link href={`/signals/${item.recordId}`} className="text-lg font-semibold text-slate-950 hover:text-[color:var(--accent)]">
              {item.sourceTitle}
            </Link>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{item.assessmentSummary}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-slate-500">
            {item.reasons.map((reason) => (
              <span key={reason} className="rounded-full bg-slate-100 px-3 py-1">
                {reason}
              </span>
            ))}
          </div>
          {item.latestRepairLabel ? <p className="text-sm text-slate-600">{item.latestRepairLabel}</p> : null}
          {feedback ? (
            <p className={`text-sm ${feedback.tone === "success" ? "text-emerald-700" : "text-rose-700"}`}>{feedback.body}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => runAction("open_workbench", true)} disabled={isPending || isOpen}>
              {isOpen ? "Workbench open" : "Open borderline workbench"}
            </Button>
            <Link href={`/signals/${item.recordId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open record
            </Link>
            <Link href={item.nextStepHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open next step
            </Link>
          </div>
        </div>
        <div className="min-w-64 rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600">
          <p>{item.platformPriority ?? "Platform not set"}</p>
          <p className="mt-2">{item.editorialModeLabel ?? "Editorial mode not set"}</p>
          <p className="mt-2">{item.pillarLabel ?? "Pillar not set"}</p>
          <p className="mt-2">{item.funnelStage ?? "Funnel not set"}</p>
          <p className="mt-2">{item.strongestCaution ?? "No additional caution surfaced"}</p>
        </div>
      </div>

      {isOpen ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">Strongest Case To Keep</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{item.workbench.bestCaseKeep}</p>
            </div>
            <div className="rounded-2xl bg-rose-50/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-rose-700">Strongest Case To Reject</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{item.workbench.bestCaseReject}</p>
            </div>
            <div className="rounded-2xl bg-amber-50/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-amber-700">What’s Missing</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{item.workbench.missingEvidence}</p>
            </div>
          </div>
          <div className="space-y-4 rounded-2xl bg-slate-50/80 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Borderline Reason</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.workbench.borderlineReason}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Repair Suggestions</p>
              <div className="mt-2 space-y-3">
                {item.workbench.suggestedRepairActions.map((action) => (
                  <div key={action.key} className="rounded-2xl bg-white/90 p-3">
                    <p className="text-sm font-medium text-slate-900">{action.label}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{action.summary}</p>
                    {action.key !== "request_more_context" ? (
                      <div className="mt-3">
                        <Button size="sm" variant="secondary" onClick={() => runAction("apply_repair")} disabled={isPending}>
                          Apply repair
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => runAction("approve_anyway")} disabled={isPending}>
                Approve anyway
              </Button>
              <Button size="sm" variant="secondary" onClick={() => runAction("request_more_context")} disabled={isPending}>
                Request more context
              </Button>
              <Button size="sm" variant="ghost" onClick={() => runAction("reject")} disabled={isPending}>
                Reject
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BorderlineReviewWorkbenchSection({ items }: { items: BorderlineRow[] }) {
  return (
    <div id="borderline-workbench">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <span>Borderline Review Workbench</span>
            <span className="text-sm font-medium text-slate-500">{items.length}</span>
          </CardTitle>
          <CardDescription>
            Fast compare-style review for held records. These stay held until the operator explicitly approves, rejects, or applies a bounded repair.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">
              No borderline held cases are active in the current queue.
            </div>
          ) : (
            items.map((item) => <BorderlineCard key={item.recordId} item={item} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
