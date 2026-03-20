"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ExperimentStatus = "draft" | "active" | "completed";
type ExperimentType =
  | "hook_variant_test"
  | "cta_variant_test"
  | "destination_test"
  | "editorial_mode_test"
  | "platform_expression_test"
  | "pattern_vs_no_pattern_test";
type ExperimentSource = "operator" | "system_proposal";

type ExperimentVariant = {
  variantId: string;
  variantLabel: string;
  linkedSignalIds: string[];
  linkedPostingIds: string[];
  linkedWeekStartDates: string[];
};

type ManualExperiment = {
  experimentId: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  experimentType: ExperimentType | null;
  learningGoal: string | null;
  comparisonTarget: string | null;
  source: ExperimentSource;
  proposalId: string | null;
  variants: ExperimentVariant[];
  updatedAt: string;
};

type ExperimentVariantOutcomeSummary = {
  variantId: string;
  variantLabel: string;
  linkedSignalIds: string[];
  linkedPostingIds: string[];
  linkedWeekStartDates: string[];
  postingCount: number;
  strongQualityCount: number;
  acceptableQualityCount: number;
  weakQualityCount: number;
  highValueCount: number;
  mediumValueCount: number;
  lowValueCount: number;
  unclearValueCount: number;
  clickTotal: number;
  leadTotal: number;
  latestPostedAt: string | null;
};

type ExperimentOutcomeSummary = {
  experimentId: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  experimentType: ExperimentType | null;
  learningGoal: string | null;
  comparisonTarget: string | null;
  source: ExperimentSource;
  proposalId: string | null;
  variantCount: number;
  totalPostingCount: number;
  highValueCount: number;
  mediumValueCount: number;
  lowValueCount: number;
  clickTotal: number;
  leadTotal: number;
  comparisonSummary: string | null;
  variants: ExperimentVariantOutcomeSummary[];
};

type ExperimentInsights = {
  activeCount: number;
  draftCount: number;
  completedCount: number;
  systemProposedCount: number;
  byType: Array<{ experimentType: ExperimentType; label: string; count: number }>;
  allExperiments: ExperimentOutcomeSummary[];
  activeExperiments: ExperimentOutcomeSummary[];
  completedExperiments: ExperimentOutcomeSummary[];
  summaries: string[];
};

type ExperimentResponse = {
  success: boolean;
  persisted: boolean;
  experiment: ManualExperiment | null;
  experiments: ManualExperiment[];
  insights: ExperimentInsights;
  message: string;
  error?: string;
};

type SignalOption = {
  id: string;
  title: string;
};

type PostingOption = {
  id: string;
  signalId: string;
  label: string;
};

type WeekOption = {
  weekStartDate: string;
  label: string;
};

type VariantFormState = {
  variantLabel: string;
  signalId: string;
  postingId: string;
  weekStartDate: string;
};

const EMPTY_VARIANT_FORM: VariantFormState = {
  variantLabel: "",
  signalId: "",
  postingId: "",
  weekStartDate: "",
};

function statusBadgeClasses(status: ExperimentStatus): string {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "draft") {
    return "bg-slate-100 text-slate-700 ring-slate-200";
  }

  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function statusLabel(status: ExperimentStatus): string {
  if (status === "completed") {
    return "Completed";
  }

  if (status === "draft") {
    return "Draft";
  }

  return "Active";
}

function experimentTypeLabel(value: ExperimentType | null): string | null {
  switch (value) {
    case "hook_variant_test":
      return "Hook variant test";
    case "cta_variant_test":
      return "CTA variant test";
    case "destination_test":
      return "Destination test";
    case "editorial_mode_test":
      return "Editorial mode test";
    case "platform_expression_test":
      return "Platform expression test";
    case "pattern_vs_no_pattern_test":
      return "Pattern vs no-pattern";
    default:
      return null;
  }
}

function feedbackClasses(tone: "success" | "error"): string {
  return tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No posts linked yet";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function ExperimentManager({
  initialExperiments,
  initialInsights,
  signalOptions,
  postingOptions,
  weekOptions,
}: {
  initialExperiments: ManualExperiment[];
  initialInsights: ExperimentInsights;
  signalOptions: SignalOption[];
  postingOptions: PostingOption[];
  weekOptions: WeekOption[];
}) {
  const [experiments, setExperiments] = useState(initialExperiments);
  const [insights, setInsights] = useState(initialInsights);
  const [createForm, setCreateForm] = useState({
    name: "",
    hypothesis: "",
    status: "active" as ExperimentStatus,
    variantLabel: "",
    signalId: "",
    postingId: "",
    weekStartDate: "",
  });
  const [variantForms, setVariantForms] = useState<Record<string, VariantFormState>>({});
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    title: string;
    body: string;
  } | null>(null);

  const experimentsById = useMemo(
    () => Object.fromEntries(experiments.map((experiment) => [experiment.experimentId, experiment])),
    [experiments],
  );

  function setCreateValue(key: keyof typeof createForm, value: string) {
    setCreateForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function setVariantValue(experimentId: string, key: keyof VariantFormState, value: string) {
    setVariantForms((current) => ({
      ...current,
      [experimentId]: {
        ...(current[experimentId] ?? EMPTY_VARIANT_FORM),
        [key]: value,
      },
    }));
  }

  async function submitAction(key: string, payload: object, successTitle: string, reset?: () => void) {
    setFeedback(null);
    setIsSaving(key);

    try {
      const response = await fetch("/api/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ExperimentResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Unable to update experiment.");
      }

      setExperiments(data.experiments);
      setInsights(data.insights);
      reset?.();
      setFeedback({
        tone: "success",
        title: successTitle,
        body: data.message,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Experiment update failed",
        body: error instanceof Error ? error.message : "Unable to update experiment.",
      });
    } finally {
      setIsSaving(null);
    }
  }

  async function handleCreate() {
    await submitAction(
      "create",
      {
        action: "create",
        data: {
          name: createForm.name,
          hypothesis: createForm.hypothesis,
          status: createForm.status,
          variantLabel: createForm.variantLabel || undefined,
          signalId: createForm.signalId || undefined,
          postingId: createForm.postingId || undefined,
          weekStartDate: createForm.weekStartDate || undefined,
        },
      },
      "Experiment created",
      () =>
        setCreateForm({
          name: "",
          hypothesis: "",
          status: "active",
          variantLabel: "",
          signalId: "",
          postingId: "",
          weekStartDate: "",
        }),
    );
  }

  async function handleAssignVariant(experimentId: string) {
    const form = variantForms[experimentId] ?? EMPTY_VARIANT_FORM;
    await submitAction(
      `assign:${experimentId}`,
      {
        action: "assign_variant",
        data: {
          experimentId,
          variantLabel: form.variantLabel,
          signalId: form.signalId || undefined,
          postingId: form.postingId || undefined,
          weekStartDate: form.weekStartDate || undefined,
        },
      },
      "Variant assigned",
      () =>
        setVariantForms((current) => ({
          ...current,
          [experimentId]: { ...EMPTY_VARIANT_FORM },
        })),
    );
  }

  async function handleClose(experimentId: string) {
    await submitAction(
      `close:${experimentId}`,
      {
        action: "close",
        data: { experimentId },
      },
      "Experiment closed",
    );
  }

  const experimentSummaries = insights.allExperiments;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Manual Experiment Tracking</CardTitle>
          <CardDescription>
            Define bounded comparisons intentionally. No automated testing engine, no auto-routing, and no automatic winner selection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Active experiments</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{insights.activeCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Completed experiments</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{insights.completedCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Draft experiments</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{insights.draftCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tracked experiments</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{experiments.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 md:col-span-2 xl:col-span-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Strongest signal</p>
              <p className="mt-2 text-sm font-medium text-slate-950">
                {insights.summaries[0] ?? "No experiment has enough outcome evidence yet."}
              </p>
            </div>
          </div>

          {insights.summaries.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {insights.summaries.map((summary) => (
                <div key={summary} className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  {summary}
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-3xl border border-black/8 bg-white/80 p-5">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="experiment-name">Experiment name</Label>
                  <Input
                    id="experiment-name"
                    value={createForm.name}
                    onChange={(event) => setCreateValue("name", event.target.value)}
                    placeholder="LinkedIn CTA style A vs B"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="experiment-hypothesis">Hypothesis</Label>
                  <Textarea
                    id="experiment-hypothesis"
                    value={createForm.hypothesis}
                    onChange={(event) => setCreateValue("hypothesis", event.target.value)}
                    className="min-h-[96px]"
                    placeholder="Softer trust-stage CTA language will produce more leads than a direct product CTA."
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="experiment-status">Status</Label>
                  <Select
                    id="experiment-status"
                    value={createForm.status}
                    onChange={(event) => setCreateValue("status", event.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="experiment-variant-label">First variant label</Label>
                  <Input
                    id="experiment-variant-label"
                    value={createForm.variantLabel}
                    onChange={(event) => setCreateValue("variantLabel", event.target.value)}
                    placeholder="Variant A"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="experiment-signal">Optional signal</Label>
                  <Select
                    id="experiment-signal"
                    value={createForm.signalId}
                    onChange={(event) => setCreateValue("signalId", event.target.value)}
                  >
                    <option value="">No signal yet</option>
                    {signalOptions.map((signal) => (
                      <option key={signal.id} value={signal.id}>
                        {signal.title}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="experiment-posting">Optional posted variant</Label>
                  <Select
                    id="experiment-posting"
                    value={createForm.postingId}
                    onChange={(event) => setCreateValue("postingId", event.target.value)}
                  >
                    <option value="">No posting yet</option>
                    {postingOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="experiment-week">Optional weekly set</Label>
                  <Select
                    id="experiment-week"
                    value={createForm.weekStartDate}
                    onChange={(event) => setCreateValue("weekStartDate", event.target.value)}
                  >
                    <option value="">No weekly set</option>
                    {weekOptions.map((week) => (
                      <option key={week.weekStartDate} value={week.weekStartDate}>
                        {week.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" onClick={handleCreate} disabled={isSaving === "create"}>
                {isSaving === "create" ? "Saving..." : "Create experiment"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {experimentSummaries.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-8 text-sm text-slate-500">
            No experiments recorded yet. Create one when you want to compare hooks, editorial modes, CTA styles, destinations, or a bounded weekly set.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {experimentSummaries.map((experiment) => {
            const rawExperiment = experimentsById[experiment.experimentId];
            const variantForm = variantForms[experiment.experimentId] ?? EMPTY_VARIANT_FORM;

            return (
              <Card key={experiment.experimentId}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className={statusBadgeClasses(experiment.status)}>{statusLabel(experiment.status)}</Badge>
                    {experiment.source === "system_proposal" ? (
                      <Badge className="bg-sky-50 text-sky-700 ring-sky-200">System proposed</Badge>
                    ) : null}
                    {experimentTypeLabel(experiment.experimentType) ? (
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                        {experimentTypeLabel(experiment.experimentType)}
                      </Badge>
                    ) : null}
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                      {experiment.variantCount} variants
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                      {experiment.totalPostingCount} posts linked
                    </Badge>
                  </div>
                  <CardTitle>{experiment.name}</CardTitle>
                  <CardDescription>{experiment.hypothesis}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {experiment.learningGoal || experiment.comparisonTarget ? (
                    <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                      {experiment.learningGoal ? <p><span className="font-medium text-slate-900">Learning goal:</span> {experiment.learningGoal}</p> : null}
                      {experiment.comparisonTarget ? <p className="mt-2"><span className="font-medium text-slate-900">Compare:</span> {experiment.comparisonTarget}</p> : null}
                    </div>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Strategic mix</p>
                      <p className="mt-2 text-sm text-slate-900">
                        {experiment.highValueCount} high · {experiment.mediumValueCount} medium · {experiment.lowValueCount} low
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Clicks</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{experiment.clickTotal}</p>
                    </div>
                    <div className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Leads</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{experiment.leadTotal}</p>
                    </div>
                    <div className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Comparison</p>
                      <p className="mt-2 text-sm text-slate-900">
                        {experiment.comparisonSummary ?? "Outcome evidence is still too thin to compare variants cleanly."}
                      </p>
                    </div>
                  </div>

                  {experiment.variants.length === 0 ? (
                    <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                      No variants assigned yet.
                    </div>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {experiment.variants.map((variant) => (
                        <div key={variant.variantId} className="rounded-2xl bg-white/80 px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-950">{variant.variantLabel}</p>
                            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                              {variant.postingCount} posts
                            </Badge>
                          </div>
                          <p className="mt-3 text-sm text-slate-600">
                            High {variant.highValueCount} · Medium {variant.mediumValueCount} · Low {variant.lowValueCount} · Unclear {variant.unclearValueCount}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Strong {variant.strongQualityCount} · Acceptable {variant.acceptableQualityCount} · Weak {variant.weakQualityCount}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Clicks {variant.clickTotal} · Leads {variant.leadTotal}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">Latest linked post: {formatDateTime(variant.latestPostedAt)}</p>

                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {variant.linkedSignalIds.map((signalId) => {
                              const signal = signalOptions.find((entry) => entry.id === signalId);

                              return (
                                <Link
                                  key={`signal:${variant.variantId}:${signalId}`}
                                  href={`/signals/${signalId}`}
                                  className="rounded-full bg-slate-100 px-3 py-1 text-slate-700"
                                >
                                  {signal?.title ?? signalId}
                                </Link>
                              );
                            })}
                            {variant.linkedPostingIds.map((postingId) => {
                              const posting = postingOptions.find((entry) => entry.id === postingId);

                              return posting ? (
                                <Link
                                  key={`posting:${variant.variantId}:${postingId}`}
                                  href={`/signals/${posting.signalId}#posting-log-${postingId}`}
                                  className="rounded-full bg-sky-50 px-3 py-1 text-sky-700"
                                >
                                  {posting.label}
                                </Link>
                              ) : null;
                            })}
                            {variant.linkedWeekStartDates.map((weekStartDate) => {
                              const week = weekOptions.find((entry) => entry.weekStartDate === weekStartDate);

                              return (
                                <Link
                                  key={`week:${variant.variantId}:${weekStartDate}`}
                                  href={`/plan?weekStartDate=${encodeURIComponent(weekStartDate)}`}
                                  className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"
                                >
                                  {week?.label ?? weekStartDate}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {experiment.status !== "completed" ? (
                    <div className="rounded-3xl border border-black/8 bg-slate-50/80 p-4">
                      <p className="text-sm font-medium text-slate-900">Assign another variant or observation</p>
                      <div className="mt-4 grid gap-4 xl:grid-cols-4">
                        <div className="grid gap-2 xl:col-span-1">
                          <Label htmlFor={`variant-label-${experiment.experimentId}`}>Variant label</Label>
                          <Input
                            id={`variant-label-${experiment.experimentId}`}
                            value={variantForm.variantLabel}
                            onChange={(event) => setVariantValue(experiment.experimentId, "variantLabel", event.target.value)}
                            placeholder="Variant B"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`variant-signal-${experiment.experimentId}`}>Signal</Label>
                          <Select
                            id={`variant-signal-${experiment.experimentId}`}
                            value={variantForm.signalId}
                            onChange={(event) => setVariantValue(experiment.experimentId, "signalId", event.target.value)}
                          >
                            <option value="">No signal</option>
                            {signalOptions.map((signal) => (
                              <option key={signal.id} value={signal.id}>
                                {signal.title}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`variant-posting-${experiment.experimentId}`}>Posted variant</Label>
                          <Select
                            id={`variant-posting-${experiment.experimentId}`}
                            value={variantForm.postingId}
                            onChange={(event) => setVariantValue(experiment.experimentId, "postingId", event.target.value)}
                          >
                            <option value="">No posting</option>
                            {postingOptions.map((posting) => (
                              <option key={posting.id} value={posting.id}>
                                {posting.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`variant-week-${experiment.experimentId}`}>Weekly set</Label>
                          <Select
                            id={`variant-week-${experiment.experimentId}`}
                            value={variantForm.weekStartDate}
                            onChange={(event) => setVariantValue(experiment.experimentId, "weekStartDate", event.target.value)}
                          >
                            <option value="">No weekly set</option>
                            {weekOptions.map((week) => (
                              <option key={week.weekStartDate} value={week.weekStartDate}>
                                {week.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => handleAssignVariant(experiment.experimentId)}
                          disabled={isSaving === `assign:${experiment.experimentId}`}
                        >
                          {isSaving === `assign:${experiment.experimentId}` ? "Saving..." : "Assign variant"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleClose(experiment.experimentId)}
                          disabled={isSaving === `close:${experiment.experimentId}`}
                        >
                          {isSaving === `close:${experiment.experimentId}` ? "Closing..." : "Close experiment"}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {rawExperiment?.variants.length === 0 ? (
                    <p className="text-sm text-slate-500">This experiment exists, but the operator still needs to link actual posts or weekly sets.</p>
                  ) : null}
                </CardContent>
              </Card>
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
    </div>
  );
}
