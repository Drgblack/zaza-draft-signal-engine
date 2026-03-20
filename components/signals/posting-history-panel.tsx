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
import type {
  RevenueSignal,
  RevenueSignalConfidence,
  RevenueSignalStrength,
  RevenueSignalType,
} from "@/lib/revenue-signals";
import {
  getStrategicValueLabel,
  type StrategicOutcome,
  type StrategicValue,
} from "@/lib/strategic-outcome-memory";
import { formatDateTime } from "@/lib/utils";

type OutcomeFormState = {
  outcomeQuality: OutcomeQuality;
  reuseRecommendation: ReuseRecommendation;
  note: string;
};

type StrategicFormState = {
  impressionsOrReach: string;
  savesOrBookmarks: string;
  sharesOrReposts: string;
  commentsOrReplies: string;
  clicks: string;
  leadsOrSignups: string;
  trialsOrConversions: string;
  strategicValue: StrategicValue;
  note: string;
};

type RevenueFormState = {
  type: RevenueSignalType;
  strength: RevenueSignalStrength;
  confidence: RevenueSignalConfidence;
  notes: string;
};

function createOutcomeFormState(outcome: PostingOutcome | null | undefined): OutcomeFormState {
  return {
    outcomeQuality: outcome?.outcomeQuality ?? "acceptable",
    reuseRecommendation: outcome?.reuseRecommendation ?? "adapt_before_reuse",
    note: outcome?.note ?? "",
  };
}

function createStrategicFormState(outcome: StrategicOutcome | null | undefined): StrategicFormState {
  return {
    impressionsOrReach: outcome?.impressionsOrReach?.toString() ?? "",
    savesOrBookmarks: outcome?.savesOrBookmarks?.toString() ?? "",
    sharesOrReposts: outcome?.sharesOrReposts?.toString() ?? "",
    commentsOrReplies: outcome?.commentsOrReplies?.toString() ?? "",
    clicks: outcome?.clicks?.toString() ?? "",
    leadsOrSignups: outcome?.leadsOrSignups?.toString() ?? "",
    trialsOrConversions: outcome?.trialsOrConversions?.toString() ?? "",
    strategicValue: outcome?.strategicValue ?? "unclear",
    note: outcome?.note ?? "",
  };
}

function createRevenueFormState(revenueSignal: RevenueSignal | null | undefined): RevenueFormState {
  return {
    type: revenueSignal?.type ?? "unknown",
    strength: revenueSignal?.strength ?? "low",
    confidence: revenueSignal?.confidence ?? "low",
    notes: revenueSignal?.notes ?? "",
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

function strategicValueBadgeClasses(value: StrategicValue): string {
  switch (value) {
    case "high":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "medium":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "low":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "unclear":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function revenueStrengthBadgeClasses(value: RevenueSignalStrength): string {
  switch (value) {
    case "high":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "medium":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "low":
    default:
      return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

function revenueTypeLabel(value: RevenueSignalType): string {
  switch (value) {
    case "signup":
      return "Signup";
    case "trial":
      return "Trial";
    case "paid":
      return "Paid";
    case "unknown":
    default:
      return "Unknown";
  }
}

function revenueConfidenceLabel(value: RevenueSignalConfidence): string {
  switch (value) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
    default:
      return "Low confidence";
  }
}

function formatMetricSummary(outcome: StrategicOutcome | null): string | null {
  if (!outcome) {
    return null;
  }

  const parts = [
    outcome.impressionsOrReach ? `Reach ${outcome.impressionsOrReach.toLocaleString()}` : null,
    outcome.clicks ? `Clicks ${outcome.clicks.toLocaleString()}` : null,
    outcome.leadsOrSignups ? `Leads ${outcome.leadsOrSignups.toLocaleString()}` : null,
    outcome.trialsOrConversions ? `Trials ${outcome.trialsOrConversions.toLocaleString()}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function parseMetricInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

export function PostingHistoryPanel({
  signalId,
  postingEntries,
  initialOutcomesByPostingLogId,
  initialStrategicOutcomesByPostingLogId,
  initialRevenueSignalsByPostingLogId,
  postingSummary,
  generationReady,
}: {
  signalId: string;
  postingEntries: PostingLogEntry[];
  initialOutcomesByPostingLogId: Record<string, PostingOutcome>;
  initialStrategicOutcomesByPostingLogId: Record<string, StrategicOutcome>;
  initialRevenueSignalsByPostingLogId: Record<string, RevenueSignal>;
  postingSummary: SignalPostingSummary;
  generationReady: boolean;
}) {
  const [outcomesByPostingLogId, setOutcomesByPostingLogId] = useState(initialOutcomesByPostingLogId);
  const [strategicOutcomesByPostingLogId, setStrategicOutcomesByPostingLogId] = useState(initialStrategicOutcomesByPostingLogId);
  const [revenueSignalsByPostingLogId, setRevenueSignalsByPostingLogId] = useState(initialRevenueSignalsByPostingLogId);
  const [editingPostingLogId, setEditingPostingLogId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, OutcomeFormState>>(
    Object.fromEntries(
      postingEntries.map((entry) => [entry.id, createOutcomeFormState(initialOutcomesByPostingLogId[entry.id])]),
    ),
  );
  const [strategicForms, setStrategicForms] = useState<Record<string, StrategicFormState>>(
    Object.fromEntries(
      postingEntries.map((entry) => [entry.id, createStrategicFormState(initialStrategicOutcomesByPostingLogId[entry.id])]),
    ),
  );
  const [revenueForms, setRevenueForms] = useState<Record<string, RevenueFormState>>(
    Object.fromEntries(
      postingEntries.map((entry) => [entry.id, createRevenueFormState(initialRevenueSignalsByPostingLogId[entry.id])]),
    ),
  );
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [isSavingStrategic, setIsSavingStrategic] = useState<string | null>(null);
  const [isSavingRevenue, setIsSavingRevenue] = useState<string | null>(null);
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

  function updateStrategicForm(postingLogId: string, key: keyof StrategicFormState, value: string) {
    setStrategicForms((current) => ({
      ...current,
      [postingLogId]: {
        ...current[postingLogId],
        [key]: value,
      },
    }));
  }

  function updateRevenueForm(postingLogId: string, key: keyof RevenueFormState, value: string) {
    setRevenueForms((current) => ({
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

  async function handleSaveStrategic(postingLogId: string) {
    setFeedback(null);
    setIsSavingStrategic(postingLogId);

    try {
      const form = strategicForms[postingLogId];
      const response = await fetch(`/api/signals/${signalId}/posting-log/${postingLogId}/strategic-outcome`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          impressionsOrReach: parseMetricInput(form.impressionsOrReach),
          savesOrBookmarks: parseMetricInput(form.savesOrBookmarks),
          sharesOrReposts: parseMetricInput(form.sharesOrReposts),
          commentsOrReplies: parseMetricInput(form.commentsOrReplies),
          clicks: parseMetricInput(form.clicks),
          leadsOrSignups: parseMetricInput(form.leadsOrSignups),
          trialsOrConversions: parseMetricInput(form.trialsOrConversions),
          strategicValue: form.strategicValue,
          note: form.note,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        outcome?: StrategicOutcome | null;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.outcome) {
        throw new Error(data.error ?? "Unable to save strategic outcome.");
      }

      setStrategicOutcomesByPostingLogId((current) => ({
        ...current,
        [postingLogId]: data.outcome!,
      }));
      setStrategicForms((current) => ({
        ...current,
        [postingLogId]: createStrategicFormState(data.outcome),
      }));
      setFeedback({
        tone: "success",
        title: "Strategic outcome saved",
        body: data.message ?? "Strategic result recorded.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Strategic outcome save failed",
        body: error instanceof Error ? error.message : "Unable to save strategic outcome.",
      });
    } finally {
      setIsSavingStrategic(null);
    }
  }

  async function handleSaveRevenue(postingLogId: string) {
    setFeedback(null);
    setIsSavingRevenue(postingLogId);

    try {
      const form = revenueForms[postingLogId];
      const response = await fetch(`/api/signals/${signalId}/posting-log/${postingLogId}/revenue-signal`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as {
        success?: boolean;
        revenueSignal?: RevenueSignal | null;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.revenueSignal) {
        throw new Error(data.error ?? "Unable to save revenue signal.");
      }

      setRevenueSignalsByPostingLogId((current) => ({
        ...current,
        [postingLogId]: data.revenueSignal!,
      }));
      setRevenueForms((current) => ({
        ...current,
        [postingLogId]: createRevenueFormState(data.revenueSignal),
      }));
      setFeedback({
        tone: "success",
        title: "Revenue signal saved",
        body: data.message ?? "Revenue signal recorded.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Revenue signal save failed",
        body: error instanceof Error ? error.message : "Unable to save revenue signal.",
      });
    } finally {
      setIsSavingRevenue(null);
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
              const strategicOutcome = strategicOutcomesByPostingLogId[entry.id] ?? null;
              const revenueSignal = revenueSignalsByPostingLogId[entry.id] ?? null;
              const form = forms[entry.id] ?? createOutcomeFormState(outcome);
              const strategicForm = strategicForms[entry.id] ?? createStrategicFormState(strategicOutcome);
              const revenueForm = revenueForms[entry.id] ?? createRevenueFormState(revenueSignal);

              return (
                <div id={`posting-log-${entry.id}`} key={entry.id} className="rounded-2xl bg-white/75 px-4 py-4">
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
                      {strategicOutcome ? (
                        <Badge className={strategicValueBadgeClasses(strategicOutcome.strategicValue)}>
                          Strategic value: {getStrategicValueLabel(strategicOutcome.strategicValue)}
                        </Badge>
                      ) : null}
                      {revenueSignal ? (
                        <>
                          <Badge className={revenueStrengthBadgeClasses(revenueSignal.strength)}>
                            Revenue: {revenueTypeLabel(revenueSignal.type)}
                          </Badge>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                            {revenueConfidenceLabel(revenueSignal.confidence)}
                          </Badge>
                        </>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setEditingPostingLogId((current) => (current === entry.id ? null : entry.id))}>
                        {outcome || strategicOutcome ? "Edit outcomes" : "Rate outcomes"}
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
                  {entry.destinationUrl ? (
                    <div className="mt-3 rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-900">
                        Destination: {entry.destinationLabel ?? entry.selectedSiteLinkId ?? "Site link"}
                      </p>
                      <p className="mt-2 break-all">{entry.destinationUrl}</p>
                      {entry.utmSource || entry.utmMedium || entry.utmCampaign || entry.utmContent ? (
                        <p className="mt-2 text-xs text-slate-500">
                          UTM: {entry.utmSource ?? "n/a"} / {entry.utmMedium ?? "n/a"} / {entry.utmCampaign ?? "n/a"} / {entry.utmContent ?? "n/a"}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {outcome?.note ? <p className="mt-3 text-sm text-slate-600">Outcome note: {outcome.note}</p> : null}
                  {strategicOutcome ? (
                    <div className="mt-3 rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-900">Strategic outcome</p>
                      <p className="mt-2">
                        {formatMetricSummary(strategicOutcome) ?? "No quantitative strategic metrics recorded yet."}
                      </p>
                      {strategicOutcome.note ? <p className="mt-2">{strategicOutcome.note}</p> : null}
                    </div>
                  ) : null}
                  {revenueSignal ? (
                    <div className="mt-3 rounded-2xl bg-emerald-50/60 px-4 py-3 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">Revenue signal</p>
                      <p className="mt-2">
                        {revenueTypeLabel(revenueSignal.type)} · {revenueSignal.strength} strength · {revenueConfidenceLabel(revenueSignal.confidence).toLowerCase()}
                      </p>
                      {revenueSignal.notes ? <p className="mt-2">{revenueSignal.notes}</p> : null}
                    </div>
                  ) : null}

                  {editingPostingLogId === entry.id ? (
                    <div className="mt-4 space-y-4 rounded-2xl border border-black/8 bg-white/90 p-4">
                      <div className="grid gap-4 xl:grid-cols-3">
                        <div className="space-y-4 rounded-2xl bg-slate-50/70 p-4">
                          <p className="text-sm font-medium text-slate-900">Qualitative outcome</p>
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
                              {isSaving === entry.id ? "Saving..." : "Save qualitative outcome"}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-4 rounded-2xl bg-slate-50/70 p-4">
                          <p className="text-sm font-medium text-slate-900">Strategic outcome</p>
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="grid gap-2">
                              <Label htmlFor={`strategic-value-${entry.id}`}>Strategic value</Label>
                              <Select
                                id={`strategic-value-${entry.id}`}
                                value={strategicForm.strategicValue}
                                onChange={(event) => updateStrategicForm(entry.id, "strategicValue", event.target.value)}
                              >
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                                <option value="unclear">Unclear</option>
                              </Select>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor={`strategic-impressions-${entry.id}`}>Reach / impressions</Label>
                              <input
                                id={`strategic-impressions-${entry.id}`}
                                type="number"
                                min="0"
                                value={strategicForm.impressionsOrReach}
                                onChange={(event) => updateStrategicForm(entry.id, "impressionsOrReach", event.target.value)}
                                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                              />
                            </div>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {[
                              ["savesOrBookmarks", "Saves / bookmarks"],
                              ["sharesOrReposts", "Shares / reposts"],
                              ["commentsOrReplies", "Comments / replies"],
                              ["clicks", "Clicks"],
                              ["leadsOrSignups", "Leads / signups"],
                              ["trialsOrConversions", "Trials / conversions"],
                            ].map(([key, label]) => (
                              <div key={key} className="grid gap-2">
                                <Label htmlFor={`${key}-${entry.id}`}>{label}</Label>
                                <input
                                  id={`${key}-${entry.id}`}
                                  type="number"
                                  min="0"
                                  value={strategicForm[key as keyof StrategicFormState] as string}
                                  onChange={(event) => updateStrategicForm(entry.id, key as keyof StrategicFormState, event.target.value)}
                                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`strategic-note-${entry.id}`}>Strategic note</Label>
                            <Textarea
                              id={`strategic-note-${entry.id}`}
                              value={strategicForm.note}
                              onChange={(event) => updateStrategicForm(entry.id, "note", event.target.value)}
                              className="min-h-[100px]"
                              placeholder="Did this create useful awareness, clicks, leads, or commercial movement?"
                            />
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button type="button" onClick={() => handleSaveStrategic(entry.id)} disabled={isSavingStrategic === entry.id}>
                              {isSavingStrategic === entry.id ? "Saving..." : "Save strategic outcome"}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-4 rounded-2xl bg-slate-50/70 p-4">
                          <p className="text-sm font-medium text-slate-900">Revenue signal</p>
                          <p className="text-sm leading-6 text-slate-600">
                            Record the simplest directional business-value signal you observed here. This is lightweight and does not need exact revenue.
                          </p>
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="grid gap-2">
                              <Label htmlFor={`revenue-type-${entry.id}`}>Type</Label>
                              <Select
                                id={`revenue-type-${entry.id}`}
                                value={revenueForm.type}
                                onChange={(event) => updateRevenueForm(entry.id, "type", event.target.value)}
                              >
                                <option value="signup">Signup</option>
                                <option value="trial">Trial</option>
                                <option value="paid">Paid</option>
                                <option value="unknown">Unknown</option>
                              </Select>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor={`revenue-strength-${entry.id}`}>Strength</Label>
                              <Select
                                id={`revenue-strength-${entry.id}`}
                                value={revenueForm.strength}
                                onChange={(event) => updateRevenueForm(entry.id, "strength", event.target.value)}
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </Select>
                            </div>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`revenue-confidence-${entry.id}`}>Confidence</Label>
                            <Select
                              id={`revenue-confidence-${entry.id}`}
                              value={revenueForm.confidence}
                              onChange={(event) => updateRevenueForm(entry.id, "confidence", event.target.value)}
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor={`revenue-notes-${entry.id}`}>Revenue note</Label>
                            <Textarea
                              id={`revenue-notes-${entry.id}`}
                              value={revenueForm.notes}
                              onChange={(event) => updateRevenueForm(entry.id, "notes", event.target.value)}
                              className="min-h-[100px]"
                              placeholder="Example: this led to a trial, stronger signup intent, or a paid conversation."
                            />
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button type="button" onClick={() => handleSaveRevenue(entry.id)} disabled={isSavingRevenue === entry.id}>
                              {isSavingRevenue === entry.id ? "Saving..." : "Save revenue signal"}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
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
