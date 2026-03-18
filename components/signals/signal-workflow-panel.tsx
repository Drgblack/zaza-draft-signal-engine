"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import type { SignalDataSource, SignalRecord, SignalStatus } from "@/types/signal";

interface WorkflowFormState {
  status: SignalStatus;
  scheduledDate: string;
  postedDate: string;
  platformPostedTo: string;
  postUrl: string;
  finalCaptionUsed: string;
  reviewNotes: string;
}

function toneClasses(tone: "success" | "warning" | "error") {
  switch (tone) {
    case "success":
      return "bg-emerald-50 text-emerald-700";
    case "warning":
      return "bg-amber-50 text-amber-700";
    case "error":
    default:
      return "bg-rose-50 text-rose-700";
  }
}

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function createFormState(signal: SignalRecord): WorkflowFormState {
  return {
    status: signal.status,
    scheduledDate: toDateTimeLocal(signal.scheduledDate),
    postedDate: toDateTimeLocal(signal.postedDate),
    platformPostedTo: signal.platformPostedTo ?? "",
    postUrl: signal.postUrl ?? "",
    finalCaptionUsed: signal.finalCaptionUsed ?? signal.xDraft ?? signal.linkedInDraft ?? "",
    reviewNotes: signal.reviewNotes ?? "",
  };
}

const STATUS_SHORTCUTS: SignalStatus[] = ["Reviewed", "Approved", "Archived", "Rejected"];

export function SignalWorkflowPanel({
  signal,
  source,
}: {
  signal: SignalRecord;
  source: SignalDataSource;
}) {
  const [currentSignal, setCurrentSignal] = useState(signal);
  const [formState, setFormState] = useState<WorkflowFormState>(() => createFormState(signal));
  const [savedState, setSavedState] = useState<WorkflowFormState>(() => createFormState(signal));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(formState) !== JSON.stringify(savedState),
    [formState, savedState],
  );

  function updateField<K extends keyof WorkflowFormState>(key: K, value: WorkflowFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function saveWorkflow(payload: {
    status: SignalStatus;
    scheduledDate?: string;
    postedDate?: string;
    platformPostedTo?: string;
    postUrl?: string;
    finalCaptionUsed?: string;
    reviewNotes?: string;
  }) {
    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/signals/${currentSignal.recordId}/workflow`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        success?: boolean;
        source?: SignalDataSource;
        signal?: SignalRecord | null;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.signal) {
        throw new Error(data.error ?? "Unable to update workflow.");
      }

      const nextState = createFormState(data.signal);
      setCurrentSignal(data.signal);
      setFormState(nextState);
      setSavedState(nextState);
      setFeedback({
        tone: data.source === "airtable" ? "success" : "warning",
        title: data.source === "airtable" ? "Saved to Airtable" : "Saved in mock mode",
        body: data.message ?? "Workflow updated.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Save failed",
        body: error instanceof Error ? error.message : "Unable to update workflow.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Actions</CardTitle>
        <CardDescription>
          Move the record through review, approval, scheduling, and posting without leaving the editorial flow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-2xl bg-white/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current status</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{currentSignal.status}</p>
            </div>
            <div className="text-sm text-slate-500">
              <p>{source === "airtable" ? "Live Airtable workflow" : "Mock session workflow"}</p>
              <p>{isDirty ? "Unsaved changes" : "All workflow fields saved"}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/signals/${currentSignal.recordId}/interpret`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Interpret
            </Link>
            <Link href={`/signals/${currentSignal.recordId}/generate`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Generate
            </Link>
            <Link href="/review" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Review queue
            </Link>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl bg-white/75 p-4">
          <div className="grid gap-2">
            <Label htmlFor="workflowStatus">Status</Label>
            <Select
              id="workflowStatus"
              value={formState.status}
              onChange={(event) => updateField("status", event.target.value as SignalStatus)}
            >
              {[
                "New",
                "Interpreted",
                "Draft Generated",
                "Reviewed",
                "Approved",
                "Scheduled",
                "Posted",
                "Archived",
                "Rejected",
              ].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reviewNotes">Review Notes</Label>
            <Textarea
              id="reviewNotes"
              value={formState.reviewNotes}
              onChange={(event) => updateField("reviewNotes", event.target.value)}
              className="min-h-[120px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() =>
                saveWorkflow({
                  status: formState.status,
                  reviewNotes: formState.reviewNotes,
                })
              }
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save status update"}
            </Button>
            {STATUS_SHORTCUTS.map((status) => (
              <button
                key={status}
                type="button"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                onClick={() =>
                  saveWorkflow({
                    status,
                    reviewNotes: formState.reviewNotes,
                  })
                }
                disabled={isSaving}
              >
                Mark {status}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl bg-white/75 p-4">
          <div>
            <p className="text-sm font-medium text-slate-900">Scheduling</p>
            <p className="mt-1 text-sm text-slate-500">
              Set a scheduled date and move the record to <span className="font-medium text-slate-700">Scheduled</span>.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scheduledDate">Scheduled Date</Label>
            <Input
              id="scheduledDate"
              type="datetime-local"
              value={formState.scheduledDate}
              onChange={(event) => updateField("scheduledDate", event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() =>
                saveWorkflow({
                  status: "Scheduled",
                  scheduledDate: formState.scheduledDate,
                  reviewNotes: formState.reviewNotes,
                })
              }
              disabled={isSaving}
            >
              Mark Scheduled
            </Button>
            <p className="text-sm text-slate-500">
              Current scheduled date: {currentSignal.scheduledDate ? formatDateTime(currentSignal.scheduledDate) : "Not set"}
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl bg-white/75 p-4">
          <div>
            <p className="text-sm font-medium text-slate-900">Posting Log</p>
            <p className="mt-1 text-sm text-slate-500">
              Record what went live and set the signal to <span className="font-medium text-slate-700">Posted</span>.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="postedDate">Posted Date</Label>
              <Input
                id="postedDate"
                type="datetime-local"
                value={formState.postedDate}
                onChange={(event) => updateField("postedDate", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="platformPostedTo">Platform Posted To</Label>
              <Input
                id="platformPostedTo"
                value={formState.platformPostedTo}
                onChange={(event) => updateField("platformPostedTo", event.target.value)}
                placeholder="X, LinkedIn, Reddit"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="postUrl">Post URL</Label>
            <Input
              id="postUrl"
              type="url"
              value={formState.postUrl}
              onChange={(event) => updateField("postUrl", event.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="finalCaptionUsed">Final Caption Used</Label>
            <Textarea
              id="finalCaptionUsed"
              value={formState.finalCaptionUsed}
              onChange={(event) => updateField("finalCaptionUsed", event.target.value)}
              className="min-h-[140px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() =>
                saveWorkflow({
                  status: "Posted",
                  postedDate: formState.postedDate,
                  platformPostedTo: formState.platformPostedTo,
                  postUrl: formState.postUrl,
                  finalCaptionUsed: formState.finalCaptionUsed,
                  reviewNotes: formState.reviewNotes,
                })
              }
              disabled={isSaving}
            >
              Mark Posted
            </Button>
            <p className="text-sm text-slate-500">
              Current posted date: {currentSignal.postedDate ? formatDateTime(currentSignal.postedDate) : "Not set"}
            </p>
          </div>
        </div>

        {feedback ? (
          <div className={`rounded-2xl px-4 py-3 text-sm ${toneClasses(feedback.tone)}`}>
            <p className="font-medium">{feedback.title}</p>
            <p className="mt-1">{feedback.body}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
