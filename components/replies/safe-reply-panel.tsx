"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { SafeReplyActionResponse } from "@/types/api";
import type { SafeReplyItem, SafeReplySummary } from "@/lib/safe-replies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getRiskBadgeClass(riskLevel: SafeReplyItem["replyRiskLevel"]) {
  switch (riskLevel) {
    case "high":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "medium":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "low":
    default:
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
}

function getEligibilityBadgeClass(eligibility: SafeReplyItem["replyEligibility"]) {
  switch (eligibility) {
    case "blocked":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "review_required":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "safe_to_stage":
    default:
      return "bg-sky-50 text-sky-700 ring-sky-200";
  }
}

export function SafeReplyPanel({
  initialRows,
  initialSummary,
}: {
  initialRows: SafeReplyItem[];
  initialSummary: SafeReplySummary;
}) {
  const [rows, setRows] = useState(initialRows);
  const [summary, setSummary] = useState(initialSummary);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyReplyId, setBusyReplyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      for (const row of rows) {
        if (next[row.replyId] === undefined) {
          next[row.replyId] = row.suggestedReply ?? "";
        }
      }
      return next;
    });
  }, [rows]);

  const readyRows = rows.filter((row) => row.replyEligibility === "safe_to_stage");
  const manualRows = rows.filter((row) => row.replyEligibility !== "safe_to_stage");

  async function runAction(
    action: "stage_reply" | "approve_reply" | "dismiss_reply",
    reply: SafeReplyItem,
  ) {
    setBusyReplyId(reply.replyId);
    setFeedback(null);

    try {
      const response = await fetch("/api/safe-replies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          replyId: reply.replyId,
          replyText: action === "dismiss_reply" ? undefined : drafts[reply.replyId] ?? reply.suggestedReply ?? null,
        }),
      });
      const data = (await response.json().catch(() => null)) as SafeReplyActionResponse | null;

      if (!response.ok || !data?.success || !data.summary) {
        throw new Error(data?.error ?? "Safe reply action failed.");
      }

      setRows(data.rows);
      setSummary(data.summary);
      setFeedback(data.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Safe reply action failed.");
    } finally {
      setBusyReplyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white/85 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Low-risk ready</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.lowRiskReadyCount}</p>
          <p className="mt-1 text-sm text-slate-600">Reply suggestions that can be staged safely.</p>
        </div>
        <div className="rounded-2xl bg-white/85 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Staged</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.stagedCount}</p>
          <p className="mt-1 text-sm text-slate-600">Low-risk replies already prepared for manual send.</p>
        </div>
        <div className="rounded-2xl bg-white/85 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Needs judgement</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.reviewRequiredCount}</p>
          <p className="mt-1 text-sm text-slate-600">Replies that are ambiguous enough to stay manual.</p>
        </div>
        <div className="rounded-2xl bg-white/85 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Blocked</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.blockedCount}</p>
          <p className="mt-1 text-sm text-slate-600">Complaint, policy, payment, or support-sensitive replies.</p>
        </div>
      </div>

      {feedback ? (
        <div className="rounded-2xl bg-slate-50/85 px-4 py-4 text-sm text-slate-600">{feedback}</div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Low-Risk Reply Suggestions</CardTitle>
            <Link href="/influencers" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open relationship memory
            </Link>
          </div>
          <CardDescription>
            Safe replies stay suggest-only. You can stage, edit, approve for manual sending, or dismiss them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {readyRows.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No low-risk reply is ready right now.
            </div>
          ) : (
            readyRows.map((reply) => (
              <div key={reply.replyId} className="rounded-2xl bg-white/85 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={getEligibilityBadgeClass(reply.replyEligibility)}>
                    {reply.status === "staged" ? "Staged for confirmation" : "Safe to stage"}
                  </Badge>
                  <Badge className={getRiskBadgeClass(reply.replyRiskLevel)}>
                    {titleCase(reply.replyRiskLevel)} risk
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(reply.replyType)}</Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(reply.platform)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">{reply.influencerName}</p>
                    <p className="text-sm text-slate-500">
                      {titleCase(reply.relationshipStage)} · {new Date(reply.receivedAt).toLocaleString()}
                    </p>
                  </div>
                  <Link href={reply.openReplyHref} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                    Open linked context
                  </Link>
                </div>
                <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Inbound message</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {reply.sourceMessage ?? reply.sourceContext ?? "No inbound message was stored."}
                  </p>
                </div>
                <div className="mt-4 grid gap-2">
                  <label className="text-sm font-medium text-slate-700">Suggested reply</label>
                  <Textarea
                    value={drafts[reply.replyId] ?? ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [reply.replyId]: event.target.value }))}
                    rows={4}
                  />
                </div>
                <p className="mt-3 text-sm text-slate-500">{reply.toneLabel}</p>
                <p className="mt-2 text-xs text-slate-500">Autonomy: {reply.policySummary}</p>
                {reply.followUpSuggestion ? (
                  <p className="mt-2 text-xs text-slate-500">{reply.followUpSuggestion}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={() => void runAction("stage_reply", reply)} disabled={busyReplyId === reply.replyId}>
                    {busyReplyId === reply.replyId ? "Working..." : reply.status === "staged" ? "Update staged reply" : "Stage reply"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void runAction("approve_reply", reply)}
                    disabled={busyReplyId === reply.replyId}
                  >
                    Approve for manual send
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void runAction("dismiss_reply", reply)}
                    disabled={busyReplyId === reply.replyId}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Review Required</CardTitle>
          <CardDescription>
            Ambiguous, emotional, commercial, policy, or support-sensitive replies stay in manual review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {manualRows.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No blocked or review-required reply is waiting right now.
            </div>
          ) : (
            manualRows.map((reply) => (
              <div key={reply.replyId} className="rounded-2xl bg-white/85 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={getEligibilityBadgeClass(reply.replyEligibility)}>
                    {reply.replyEligibility === "blocked" ? "Blocked" : "Manual review required"}
                  </Badge>
                  <Badge className={getRiskBadgeClass(reply.replyRiskLevel)}>
                    {titleCase(reply.replyRiskLevel)} risk
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(reply.platform)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">{reply.influencerName}</p>
                    <p className="text-sm text-slate-500">
                      {titleCase(reply.relationshipStage)} · {new Date(reply.receivedAt).toLocaleString()}
                    </p>
                  </div>
                  <Link href={reply.openReplyHref} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                    Open linked context
                  </Link>
                </div>
                <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Inbound message</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {reply.sourceMessage ?? reply.sourceContext ?? "No inbound message was stored."}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {reply.blockReasons.map((reason) => (
                    <Badge key={reason} className="bg-rose-50 text-rose-700 ring-rose-200">
                      {reason}
                    </Badge>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">Autonomy: {reply.policySummary}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => void runAction("dismiss_reply", reply)}
                    disabled={busyReplyId === reply.replyId}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
