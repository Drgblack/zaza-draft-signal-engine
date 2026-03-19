"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getOutcomeQualityLabel,
  getReuseRecommendationLabel,
  type OutcomeQuality,
  type PostingOutcome,
  type ReuseRecommendation,
} from "@/lib/outcome-memory";
import { getPostingPlatformLabel, type PostingLogEntry, type SignalPostingSummary } from "@/lib/posting-memory";
import { formatDateTime } from "@/lib/utils";

type OutcomeFormState = {
  outcomeQuality: OutcomeQuality;
  reuseRecommendation: ReuseRecommendation;
  note: string;
};

function createOutcomeFormState(outcome: PostingOutcome | null | undefined): OutcomeFormState {
  return {
    outcomeQuality: outcome?.outcomeQuality ?? "acceptable",
    reuseRecommendation: outcome?.reuseRecommendation ?? "adapt_before_reuse",
    note: outcome?.note ?? "",
  };
}

function outcomeBadgeClasses(value: OutcomeQuality): string {
  switch (value) {
    case "strong":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "acceptable":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "weak":
    default:
      return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

function reuseBadgeClasses(value: ReuseRecommendation): string {
  switch (value) {
    case "reuse_this_approach":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "adapt_before_reuse":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "do_not_repeat":
    default:
      return "bg-rose-50 text-rose-700 ring-rose-200";
  }
}

function feedbackClasses(tone: "success" | "error"): string {
  return tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
}

export function PostingHistoryPanel({
  signalId,
  postingEntries,
  initialOutcomesByPostingLogId,
  postingSummary,
  generationReady,
}: {
  signalId: string;
  postingEntries: PostingLogEntry[];
  initialOutcomesByPostingLogId: Record<string, PostingOutcome>;
  postingSummary: SignalPostingSummary;
  generationReady: boolean;
}) {
  const [outcomesByPostingLogId, setOutcomesByPostingLogId] = useState(initialOutcomesByPostingLogId);
  const [editingPostingLogId, setEditingPostingLogId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, OutcomeFormState>>(
    Object.fromEntries(
      postingEntries.map((entry) => [entry.id, createOutcomeFormState(initialOutcomesByPostingLogId[entry.id])]),
    ),
  );
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    title: string;
    body: string;
  } | null>(null);

  function updateForm(postingLogId: string, key: keyof OutcomeFormState, value: string) {
    setForms((current) => ({
      ...current,
      [postingLogId]: {
        ...current[postingLogId],
        [key]: value,
      },
    }));
  }

  async function handleSave(postingLogId: string) {
    setFeedback(null);
    setIsSaving(postingLogId);

    try {
      const form = forms[postingLogId];
      const response = await fetch(`/api/signals/${signalId}/posting-log/${postingLogId}/outcome`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as {
        success?: boolean;
        outcome?: PostingOutcome | null;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.outcome) {
        throw new Error(data.error ?? "Unable to save outcome.");
      }

      setOutcomesByPostingLogId((current) => ({
        ...current,
        [postingLogId]: data.outcome!,
      }));
      setForms((current) => ({
        ...current,
        [postingLogId]: createOutcomeFormState(data.outcome),
      }));
      setEditingPostingLogId(null);
      setFeedback({
        tone: "success",
        title: "Outcome saved",
        body: data.message ?? "Outcome judgement recorded.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Outcome save failed",
        body: error instanceof Error ? error.message : "Unable to save outcome.",
      });
    } finally {
      setIsSaving(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Posting History</CardTitle>
        <CardDescription>
          Manual external publishing memory. This records what was actually posted and how it felt afterward, separate from review state.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl bg-white/75 px-4 py-4 text-sm text-slate-600">
          <p className="font-medium text-slate-900">{postingSummary.summary}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            <span>{postingSummary.totalPosts} posts logged</span>
            <span>{postingSummary.postedPlatformsCount} platforms posted</span>
            {postingSummary.latestPostedAt ? <span>Latest {formatDateTime(postingSummary.latestPostedAt)}</span> : null}
          </div>
          {generationReady ? (
            <Link href={`/signals/${signalId}/review`} className="mt-3 inline-block text-[color:var(--accent)] underline underline-offset-4">
              Open final review workspace
            </Link>
          ) : null}
        </div>

        {postingEntries.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
            No manual publishing entries have been logged for this signal yet.
          </div>
        ) : (
          <div className="space-y-3">
            {postingEntries.map((entry) => {
              const outcome = outcomesByPostingLogId[entry.id] ?? null;
              const form = forms[entry.id] ?? createOutcomeFormState(outcome);

              return (
                <div key={entry.id} className="rounded-2xl bg-white/75 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                        {getPostingPlatformLabel(entry.platform)}
                      </Badge>
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                        {formatDateTime(entry.postedAt)}
                      </Badge>
                      {outcome ? (
                        <>
                          <Badge className={outcomeBadgeClasses(outcome.outcomeQuality)}>
                            {getOutcomeQualityLabel(outcome.outcomeQuality)}
                          </Badge>
                          <Badge className={reuseBadgeClasses(outcome.reuseRecommendation)}>
                            {getReuseRecommendationLabel(outcome.reuseRecommendation)}
                          </Badge>
                        </>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setEditingPostingLogId((current) => (current === entry.id ? null : entry.id))}>
                        {outcome ? "Edit outcome" : "Rate outcome"}
                      </Button>
                      {entry.postUrl ? (
                        <Link href={entry.postUrl} target="_blank" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                          Open live URL
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{entry.finalPostedText}</p>
                  {entry.note ? <p className="mt-3 text-sm text-slate-500">{entry.note}</p> : null}
                  {outcome?.note ? <p className="mt-3 text-sm text-slate-600">Outcome note: {outcome.note}</p> : null}

                  {editingPostingLogId === entry.id ? (
                    <div className="mt-4 space-y-4 rounded-2xl border border-black/8 bg-white/90 p-4">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor={`outcome-quality-${entry.id}`}>Outcome quality</Label>
                          <Select
                            id={`outcome-quality-${entry.id}`}
                            value={form.outcomeQuality}
                            onChange={(event) => updateForm(entry.id, "outcomeQuality", event.target.value)}
                          >
                            <option value="strong">Strong</option>
                            <option value="acceptable">Acceptable</option>
                            <option value="weak">Weak</option>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`reuse-recommendation-${entry.id}`}>Reuse recommendation</Label>
                          <Select
                            id={`reuse-recommendation-${entry.id}`}
                            value={form.reuseRecommendation}
                            onChange={(event) => updateForm(entry.id, "reuseRecommendation", event.target.value)}
                          >
                            <option value="reuse_this_approach">Reuse this approach</option>
                            <option value="adapt_before_reuse">Adapt before reuse</option>
                            <option value="do_not_repeat">Do not repeat</option>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`outcome-note-${entry.id}`}>Outcome note</Label>
                        <Textarea
                          id={`outcome-note-${entry.id}`}
                          value={form.note}
                          onChange={(event) => updateForm(entry.id, "note", event.target.value)}
                          className="min-h-[100px]"
                          placeholder="Why did this feel strong, acceptable, or weak?"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button type="button" onClick={() => handleSave(entry.id)} disabled={isSaving === entry.id}>
                          {isSaving === entry.id ? "Saving..." : "Save outcome"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditingPostingLogId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {feedback ? (
          <div className={`rounded-2xl px-4 py-3 text-sm ${feedbackClasses(feedback.tone)}`}>
            <p className="font-medium">{feedback.title}</p>
            <p className="mt-1">{feedback.body}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
