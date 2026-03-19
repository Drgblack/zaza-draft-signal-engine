"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PLAYBOOK_CARD_STATUSES,
  PLAYBOOK_CARD_STATUS_LABELS,
  type PlaybookCard,
  type PlaybookCardFormValues,
} from "@/lib/playbook-card-definitions";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { PatternBundle } from "@/lib/pattern-bundles";
import type { SignalPattern } from "@/lib/pattern-definitions";
import type { PlaybookCardResponse } from "@/types/api";
import { EDITORIAL_MODES, type EditorialMode } from "@/types/signal";

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

type FormState = PlaybookCardFormValues;

export function PlaybookCardFormCard({
  mode,
  title,
  description,
  initialValues,
  availablePatterns,
  availableBundles,
  card,
  prefillLabel,
  sourceGap,
}: {
  mode: "create" | "edit";
  title: string;
  description: string;
  initialValues: PlaybookCardFormValues;
  availablePatterns: SignalPattern[];
  availableBundles: PatternBundle[];
  card?: PlaybookCard | null;
  prefillLabel?: string | null;
  sourceGap?: {
    key: string;
    label: string;
    kind: "uncovered" | "weak_coverage" | "opportunity";
    flag: string;
  } | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialValues);
  const [tagsInput, setTagsInput] = useState(initialValues.relatedTags.join(", "));
  const [saving, setSaving] = useState(false);
  const [savedCard, setSavedCard] = useState<PlaybookCard | null>(card ?? null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleMode(modeValue: EditorialMode) {
    setForm((current) => ({
      ...current,
      suggestedModes: current.suggestedModes.includes(modeValue)
        ? current.suggestedModes.filter((existing) => existing !== modeValue)
        : [...current.suggestedModes, modeValue].slice(0, 4),
    }));
  }

  function togglePattern(patternId: string) {
    setForm((current) => ({
      ...current,
      relatedPatternIds: current.relatedPatternIds.includes(patternId)
        ? current.relatedPatternIds.filter((existing) => existing !== patternId)
        : [...current.relatedPatternIds, patternId].slice(0, 8),
    }));
  }

  function toggleBundle(bundleId: string) {
    setForm((current) => ({
      ...current,
      relatedBundleIds: current.relatedBundleIds.includes(bundleId)
        ? current.relatedBundleIds.filter((existing) => existing !== bundleId)
        : [...current.relatedBundleIds, bundleId].slice(0, 8),
    }));
  }

  async function handleSubmit() {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(mode === "create" ? "/api/playbook-cards" : `/api/playbook-cards/${card?.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          relatedTags: tagsInput
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          sourceGap,
        }),
      });

      const data = (await response.json()) as PlaybookCardResponse;

      if (!response.ok || !data.success || !data.card) {
        throw new Error(data.error ?? "Unable to save playbook card.");
      }

      setSavedCard(data.card);
      setForm({
        title: data.card.title,
        summary: data.card.summary,
        situation: data.card.situation,
        whatWorks: data.card.whatWorks,
        whatToAvoid: data.card.whatToAvoid,
        suggestedModes: data.card.suggestedModes,
        relatedPatternIds: data.card.relatedPatternIds,
        relatedBundleIds: data.card.relatedBundleIds,
        relatedTags: data.card.relatedTags,
        status: data.card.status,
      });
      setTagsInput(data.card.relatedTags.join(", "));
      setFeedback({
        tone: "success",
        title: mode === "create" ? "Playbook card saved" : "Playbook card updated",
        body:
          mode === "create"
            ? sourceGap
              ? `The card is now available in the playbook and linked to the surfaced gap: ${sourceGap.label}.`
              : "The card is now available as compact operator guidance in the playbook."
            : "Playbook card changes are now reflected in the library.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        title: mode === "create" ? "Playbook save failed" : "Playbook update failed",
        body: error instanceof Error ? error.message : "Unable to save playbook card.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {prefillLabel ? (
          <div className="rounded-2xl bg-sky-50/80 px-4 py-4 text-sm text-sky-800">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-white text-sky-700 ring-sky-200">Prefilled</Badge>
            </div>
            <p className="mt-2 leading-6 text-slate-700">Starting from {prefillLabel}. Adjust freely before saving.</p>
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${mode}-playbook-title`}>Title</Label>
            <Input
              id={`${mode}-playbook-title`}
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="When parent tension is rising"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${mode}-playbook-status`}>Status</Label>
            <Select
              id={`${mode}-playbook-status`}
              value={form.status}
              onChange={(event) => updateField("status", event.target.value as FormState["status"])}
            >
              {PLAYBOOK_CARD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PLAYBOOK_CARD_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${mode}-playbook-summary`}>Summary</Label>
          <Textarea
            id={`${mode}-playbook-summary`}
            value={form.summary}
            onChange={(event) => updateField("summary", event.target.value)}
            className="min-h-20"
            placeholder="Compact reusable guidance for this kind of communication moment."
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${mode}-playbook-situation`}>Situation</Label>
          <Textarea
            id={`${mode}-playbook-situation`}
            value={form.situation}
            onChange={(event) => updateField("situation", event.target.value)}
            className="min-h-24"
            placeholder="What kind of situation is this card meant to help with?"
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${mode}-playbook-works`}>What works</Label>
            <Textarea
              id={`${mode}-playbook-works`}
              value={form.whatWorks}
              onChange={(event) => updateField("whatWorks", event.target.value)}
              className="min-h-28"
              placeholder="De-escalation, factual explanation, concrete next step."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${mode}-playbook-avoid`}>What to avoid</Label>
            <Textarea
              id={`${mode}-playbook-avoid`}
              value={form.whatToAvoid}
              onChange={(event) => updateField("whatToAvoid", event.target.value)}
              className="min-h-28"
              placeholder="Blame language, generic commentary, over-defensiveness."
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Suggested editorial modes</Label>
          <div className="grid gap-2 md:grid-cols-2">
            {EDITORIAL_MODES.map((modeValue) => (
              <label key={modeValue} className="flex items-start gap-3 rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.suggestedModes.includes(modeValue)}
                  onChange={() => toggleMode(modeValue)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <div>
                  <p className="font-medium text-slate-900">{getEditorialModeDefinition(modeValue).label}</p>
                  <p className="mt-1 leading-6 text-slate-500">{getEditorialModeDefinition(modeValue).purpose}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${mode}-playbook-tags`}>Related tags / family labels</Label>
          <Input
            id={`${mode}-playbook-tags`}
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="parent complaint / de-escalation, conflict, boundary-setting"
          />
          <p className="text-xs text-slate-400">Comma-separated. Use short family labels or practical tags only.</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="grid gap-2">
            <Label>Related patterns</Label>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl bg-white/80 p-3">
              {availablePatterns.length === 0 ? (
                <p className="text-sm text-slate-500">No patterns available yet.</p>
              ) : (
                availablePatterns.map((pattern) => (
                  <label key={pattern.id} className="flex items-start gap-3 rounded-2xl px-3 py-3 text-sm text-slate-700 hover:bg-slate-50/80">
                    <input
                      type="checkbox"
                      checked={form.relatedPatternIds.includes(pattern.id)}
                      onChange={() => togglePattern(pattern.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <div>
                      <p className="font-medium text-slate-900">{pattern.name}</p>
                      <p className="mt-1 leading-6 text-slate-500">{pattern.description}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Related bundles</Label>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl bg-white/80 p-3">
              {availableBundles.length === 0 ? (
                <p className="text-sm text-slate-500">No bundles available yet.</p>
              ) : (
                availableBundles.map((bundle) => (
                  <label key={bundle.id} className="flex items-start gap-3 rounded-2xl px-3 py-3 text-sm text-slate-700 hover:bg-slate-50/80">
                    <input
                      type="checkbox"
                      checked={form.relatedBundleIds.includes(bundle.id)}
                      onChange={() => toggleBundle(bundle.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <div>
                      <p className="font-medium text-slate-900">{bundle.name}</p>
                      <p className="mt-1 leading-6 text-slate-500">{bundle.description}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? (mode === "create" ? "Saving..." : "Updating...") : mode === "create" ? "Create playbook card" : "Save changes"}
          </Button>
          {savedCard ? (
            <Link href={`/playbook/${savedCard.id}`} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open playbook card
            </Link>
          ) : null}
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
