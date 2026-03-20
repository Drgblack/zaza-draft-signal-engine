"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { BatchApprovalItem, BatchApprovalPrep } from "@/lib/batch-approval";
import { parsePublishPrepBundle, stringifyPublishPrepBundle } from "@/lib/publish-prep";
import {
  REVIEW_MACROS,
  formatReviewMacroActions,
  softenToneText,
  type ReviewMacroId,
} from "@/lib/review-macros";
import type { BatchApprovalResponse } from "@/types/api";

type BatchAction = "approve" | "hold" | "skip" | "convert_to_experiment";

type BatchItemState = BatchApprovalItem & {
  note: string;
  actionState: "pending" | "done";
};

function confidenceClasses(level: BatchApprovalItem["automationConfidenceLevel"]) {
  if (level === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (level === "low") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function completenessClasses(state: BatchApprovalItem["completenessState"]) {
  if (state === "complete") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (state === "mostly_complete") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function expectedOutcomeClasses(tier: BatchApprovalItem["expectedOutcomeTier"]) {
  if (tier === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (tier === "medium") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function feedbackClasses(tone: "success" | "error") {
  return tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
}

function parseLinkValue(value: string): { url: string; label: string } {
  const [url, label] = value.split("|||");
  return {
    url: url ?? "",
    label: label ?? "Destination",
  };
}

function replaceFirstNonEmptyLine(text: string, nextLine: string): string {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim().length > 0);
  if (index < 0) {
    return nextLine;
  }

  lines[index] = nextLine;
  return lines.join("\n");
}

function replaceLastNonEmptyLine(text: string, nextLine: string): string {
  const lines = text.split(/\r?\n/);
  const index = [...lines].reverse().findIndex((line) => line.trim().length > 0);
  if (index < 0) {
    return nextLine;
  }

  lines[lines.length - index - 1] = nextLine;
  return lines.join("\n");
}

function ctaSoftnessScore(text: string): number {
  const normalized = text.toLowerCase();
  let score = 0;
  if (normalized.includes("dm") || normalized.includes("message")) {
    score += 4;
  }
  if (normalized.includes("sign up") || normalized.includes("start free") || normalized.includes("try")) {
    score += 3;
  }
  if (normalized.includes("book") || normalized.includes("call")) {
    score += 3;
  }
  if (normalized.includes("comment") || normalized.includes("reply")) {
    score += 2;
  }
  if (normalized.includes("if helpful") || normalized.includes("if useful")) {
    score -= 2;
  }
  if (normalized.includes("learn more") || normalized.includes("read more")) {
    score -= 1;
  }
  return score;
}

function buildInitialState(batch: BatchApprovalPrep): BatchItemState[] {
  return batch.items.map((item) => ({
    ...item,
    note: "",
    actionState: "pending",
  }));
}

function mutatePackageOnItem(
  item: BatchItemState,
  mutator: (current: NonNullable<ReturnType<typeof parsePublishPrepBundle>>) => NonNullable<ReturnType<typeof parsePublishPrepBundle>>,
): BatchItemState {
  const bundle = parsePublishPrepBundle(item.publishPrepBundleJson);
  if (!bundle) {
    return item;
  }

  const nextBundle = mutator(bundle);
  return {
    ...item,
    publishPrepBundleJson: stringifyPublishPrepBundle(nextBundle),
  };
}

function applyHookToItem(item: BatchItemState, hookId: string): BatchItemState {
  const hook = item.hookOptions.find((option) => option.id === hookId);
  const nextDraft = hook ? replaceFirstNonEmptyLine(item.draftPreview, hook.text) : item.draftPreview;

  return mutatePackageOnItem(
    {
      ...item,
      selectedHookId: hookId || null,
      draftPreview: nextDraft,
      hookSummary: hook?.text ?? item.hookSummary,
    },
    (bundle) => ({
      ...bundle,
      packages: bundle.packages.map((pkg) =>
        pkg.id === item.primaryPackageId
          ? {
              ...pkg,
              selectedHookId: hookId || null,
            }
          : pkg,
      ),
    }),
  );
}

function applyCtaToItem(item: BatchItemState, ctaId: string): BatchItemState {
  const cta = item.ctaOptions.find((option) => option.id === ctaId);
  const nextDraft = cta ? replaceLastNonEmptyLine(item.draftPreview, cta.text) : item.draftPreview;

  return mutatePackageOnItem(
    {
      ...item,
      selectedCtaId: ctaId || null,
      draftPreview: nextDraft,
      ctaSummary: cta?.text ?? item.ctaSummary,
    },
    (bundle) => ({
      ...bundle,
      packages: bundle.packages.map((pkg) =>
        pkg.id === item.primaryPackageId
          ? {
              ...pkg,
              selectedCtaId: ctaId || null,
            }
          : pkg,
      ),
    }),
  );
}

export function BatchApprovalWorkspace({
  batch,
}: {
  batch: BatchApprovalPrep;
}) {
  const [items, setItems] = useState<BatchItemState[]>(() => buildInitialState(batch));
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    title: string;
    body: string;
  } | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => item.actionState === "pending"),
    [items],
  );

  function updateItem(signalId: string, updater: (current: BatchItemState) => BatchItemState) {
    setItems((current) => current.map((item) => (item.signalId === signalId ? updater(item) : item)));
  }

  function applyHook(signalId: string, hookId: string) {
    updateItem(signalId, (current) => applyHookToItem(current, hookId));
  }

  function applyCta(signalId: string, ctaId: string) {
    updateItem(signalId, (current) => applyCtaToItem(current, ctaId));
  }

  function applyLink(signalId: string, linkValue: string) {
    updateItem(signalId, (current) => {
      const selected = current.linkOptions.find((option) => option.value === linkValue);
      if (!selected) {
        return current;
      }
      const nextLink = parseLinkValue(linkValue);

      return mutatePackageOnItem(
        {
          ...current,
          selectedLinkValue: linkValue,
          destinationLabel: nextLink.label,
          destinationUrl: nextLink.url,
        },
        (bundle) => ({
          ...bundle,
          packages: bundle.packages.map((pkg) => {
            if (pkg.id !== current.primaryPackageId) {
              return pkg;
            }

            const selectedVariant = pkg.linkVariants.find((variant) => variant.url === nextLink.url && variant.label === nextLink.label);
            const remainingVariants = pkg.linkVariants.filter((variant) => !(variant.url === nextLink.url && variant.label === nextLink.label));

            return {
              ...pkg,
              siteLinkLabel: nextLink.label,
              linkVariants: selectedVariant ? [selectedVariant, ...remainingVariants] : pkg.linkVariants,
            };
          }),
        }),
      );
    });
  }

  function applyTiming(signalId: string, timingSuggestion: string) {
    updateItem(signalId, (current) =>
      mutatePackageOnItem(
        {
          ...current,
          timingSuggestion,
        },
        (bundle) => ({
          ...bundle,
          packages: bundle.packages.map((pkg) =>
            pkg.id === current.primaryPackageId
              ? {
                  ...pkg,
                  suggestedPostingTime: timingSuggestion || null,
                }
              : pkg,
          ),
        }),
      ),
    );
  }

  async function submitAction(item: BatchItemState, action: BatchAction, overrideNote?: string, macroId?: ReviewMacroId) {
    setFeedback(null);
    setIsSaving(`${item.signalId}:${action}`);

    try {
      const noteCandidate = overrideNote ?? item.note;
      const note = noteCandidate && noteCandidate.trim().length > 0 ? noteCandidate : null;
      const response = await fetch("/api/batch-approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signalId: item.signalId,
          action,
          platform: item.platform,
          finalDraft: item.draftPreview,
          publishPrepBundleJson: item.publishPrepBundleJson,
          note,
          macroId,
          experimentType: item.suggestedExperimentType,
        }),
      });
      const data = (await response.json()) as BatchApprovalResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Unable to update batch candidate.");
      }

      setItems((current) =>
        current.map((entry) =>
          entry.signalId === item.signalId
            ? {
                ...entry,
                actionState: "done",
              }
            : entry,
        ),
      );
      setFeedback({
        tone: "success",
        title:
          action === "approve"
            ? "Batch item approved"
            : action === "hold"
              ? "Batch item held"
              : action === "convert_to_experiment"
                ? "Converted to experiment"
                : "Batch item skipped",
        body: data.message,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Batch action failed",
        body: error instanceof Error ? error.message : "Unable to update batch candidate.",
      });
    } finally {
      setIsSaving(null);
    }
  }

  function handleSoftenCta(item: BatchItemState) {
    const currentScore = item.ctaSummary ? ctaSoftnessScore(item.ctaSummary) : Number.POSITIVE_INFINITY;
    const softer = [...item.ctaOptions]
      .map((option) => ({
        ...option,
        score: ctaSoftnessScore(option.text),
      }))
      .sort((left, right) => left.score - right.score || left.text.localeCompare(right.text))
      .find((option) => option.id !== item.selectedCtaId && option.score < currentScore);
    const nextItem = softer ? applyCtaToItem(item, softer.id) : item;
    if (softer) {
      setItems((current) => current.map((entry) => (entry.signalId === item.signalId ? nextItem : entry)));
    }
    void submitAction(
      nextItem,
      "approve",
      softer ? `Approved in batch review after softening CTA to "${softer.text}".` : "Approved in batch review.",
      "approve_soften_cta",
    );
  }

  function handleSafeTone(item: BatchItemState) {
    const nextDraft = softenToneText(item.draftPreview);
    const nextItem =
      nextDraft === item.draftPreview
        ? item
        : {
            ...item,
            draftPreview: nextDraft,
          };
    if (nextItem !== item) {
      setItems((current) => current.map((entry) => (entry.signalId === item.signalId ? nextItem : entry)));
    }
    void submitAction(
      nextItem,
      "approve",
      nextDraft === item.draftPreview
        ? "Approved in batch review with safer tone macro."
        : "Approved in batch review after softening phrasing for a safer tone.",
      "approve_with_safe_tone",
    );
  }

  function executeMacro(item: BatchItemState, macroId: ReviewMacroId) {
    switch (macroId) {
      case "approve_keep_package":
        void submitAction(item, "approve", "Approved in batch review with the current package kept intact.", macroId);
        return;
      case "approve_soften_cta":
        handleSoftenCta(item);
        return;
      case "hold_for_destination_fix":
        void submitAction(item, "hold", "Hold for destination fix.", macroId);
        return;
      case "convert_to_experiment":
        void submitAction(item, "convert_to_experiment", "Convert to experiment.", macroId);
        return;
      case "evergreen_later":
        void submitAction(item, "skip", "Evergreen later.", macroId);
        return;
      case "approve_with_safe_tone":
        handleSafeTone(item);
        return;
      default:
        return;
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{batch.items.length} prepared items</Badge>
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{batch.completenessSummary}</Badge>
          </div>
          <CardTitle className="text-3xl">Batch Approval Prep</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            One bounded review surface for near-final candidates. Make light edits, take fast actions, and drop into full review only when a candidate still needs deeper work.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-0">
          <Link href="/review" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to review queue
          </Link>
          <Link href="/digest" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open digest
          </Link>
          <p className="text-sm text-slate-500">
            Ordered by {batch.ordering.join(" · ")}.
          </p>
        </CardContent>
      </Card>

      {visibleItems.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-8 text-sm text-slate-500">
            No batch items remain in this prepared set. Generate a fresh batch from the review queue when you want another compact pass.
          </CardContent>
        </Card>
      ) : (
        visibleItems.map((item, index) => (
          <Card key={item.signalId}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-slate-950 text-white">#{index + 1}</Badge>
                <Badge className={expectedOutcomeClasses(item.expectedOutcomeTier)}>{item.expectedOutcomeTier} expected value</Badge>
                <Badge className={confidenceClasses(item.automationConfidenceLevel)}>{item.automationConfidenceSummary}</Badge>
                <Badge className={completenessClasses(item.completenessState)}>{item.completenessState.replaceAll("_", " ")}</Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.platformLabel}</Badge>
              </div>
              <CardTitle>{item.sourceTitle}</CardTitle>
              <CardDescription>{item.strongestRationale}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`${item.signalId}-hook`}>Hook choice</Label>
                      <Select
                        id={`${item.signalId}-hook`}
                        value={item.selectedHookId ?? ""}
                        onChange={(event) => applyHook(item.signalId, event.target.value)}
                      >
                        <option value="">Keep current hook</option>
                        {item.hookOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.text}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`${item.signalId}-cta`}>CTA choice</Label>
                      <Select
                        id={`${item.signalId}-cta`}
                        value={item.selectedCtaId ?? ""}
                        onChange={(event) => applyCta(item.signalId, event.target.value)}
                      >
                        <option value="">Keep current CTA</option>
                        {item.ctaOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.text}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`${item.signalId}-destination`}>Destination</Label>
                      <Select
                        id={`${item.signalId}-destination`}
                        value={item.selectedLinkValue ?? ""}
                        onChange={(event) => applyLink(item.signalId, event.target.value)}
                      >
                        <option value="">Keep current destination</option>
                        {item.linkOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`${item.signalId}-timing`}>Timing suggestion</Label>
                      <Select
                        id={`${item.signalId}-timing`}
                        value={item.timingSuggestion ?? ""}
                        onChange={(event) => applyTiming(item.signalId, event.target.value)}
                      >
                        <option value="">No timing selected</option>
                        {item.timingOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor={`${item.signalId}-draft`}>Main draft preview</Label>
                    <Textarea
                      id={`${item.signalId}-draft`}
                      value={item.draftPreview}
                      onChange={(event) =>
                        updateItem(item.signalId, (current) => ({
                          ...current,
                          draftPreview: event.target.value,
                        }))
                      }
                      className="min-h-[220px]"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor={`${item.signalId}-note`}>Batch note</Label>
                    <Textarea
                      id={`${item.signalId}-note`}
                      value={item.note}
                      onChange={(event) =>
                        updateItem(item.signalId, (current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      className="min-h-[96px]"
                      placeholder="Optional operator note for this batch decision."
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600">
                  <div>
                    <p className="font-medium text-slate-900">Readiness snapshot</p>
                    <p className="mt-2">
                      Score {item.completenessScore} · {item.completenessState.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Package</p>
                    <p className="mt-2">CTA: {item.ctaSummary ?? "Not set"}</p>
                    <p className="mt-2">Destination: {item.destinationLabel ?? "Not set"}</p>
                    <p className="mt-2">Timing: {item.timingSuggestion ?? "Not set"}</p>
                    <p className="mt-2">Asset: {item.assetSummary}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Rationale</p>
                    <p className="mt-2">{item.rationale[0] ?? item.strongestRationale}</p>
                    {item.rationale[1] ? <p className="mt-2 text-slate-500">{item.rationale[1]}</p> : null}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Key caution</p>
                    <p className="mt-2">{item.caution ?? "No major caution surfaced."}</p>
                  </div>
                  {item.packageAutofillNotes.length > 0 ? (
                    <div>
                      <p className="font-medium text-slate-900">Approval autopilot</p>
                      <p className="mt-2">{item.packageAutofillNotes.slice(0, 3).join(" · ")}</p>
                    </div>
                  ) : null}
                  {item.repurposingSummary ? (
                    <div>
                      <p className="font-medium text-slate-900">Repurposing</p>
                      <p className="mt-2">{item.repurposingSummary}</p>
                    </div>
                  ) : null}
                  {item.publishPrepSummary ? (
                    <div>
                      <p className="font-medium text-slate-900">Publish prep</p>
                      <p className="mt-2">{item.publishPrepSummary}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Review macros</p>
                  <p className="mt-1 text-sm text-slate-500">One click applies the listed decision bundle immediately in batch review.</p>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {REVIEW_MACROS.map((macro) => {
                    const buttonVariant =
                      macro.macroId === "approve_keep_package"
                        ? "primary"
                        : macro.macroId === "approve_soften_cta" || macro.macroId === "approve_with_safe_tone"
                          ? "secondary"
                          : "ghost";
                    const savingKey =
                      macro.macroId === "convert_to_experiment"
                        ? `${item.signalId}:convert_to_experiment`
                        : macro.macroId === "hold_for_destination_fix"
                          ? `${item.signalId}:hold`
                          : macro.macroId === "evergreen_later"
                            ? `${item.signalId}:skip`
                            : `${item.signalId}:approve`;

                    return (
                      <div key={`${item.signalId}:${macro.macroId}`} className="rounded-2xl border border-black/8 bg-white/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">{macro.label}</p>
                            <p className="mt-1 text-sm text-slate-600">{macro.description}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {formatReviewMacroActions(macro.actions).map((action) => (
                            <Badge key={`${macro.macroId}:${action}`} className="bg-slate-100 text-slate-700 ring-slate-200">
                              {action}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-4">
                          <Button
                            type="button"
                            variant={buttonVariant}
                            size="sm"
                            onClick={() => executeMacro(item, macro.macroId)}
                            disabled={isSaving === savingKey}
                          >
                            {isSaving === savingKey ? "Saving..." : macro.label}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                <Link href={item.reviewHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Open full final review
                </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
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
