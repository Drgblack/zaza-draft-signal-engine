"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SOURCE_TYPE_OPTIONS } from "@/lib/constants";
import { SEVERITY_SCORES, SIGNAL_CATEGORIES, SIGNAL_STATUSES } from "@/types/signal";

type NewSignalFormState = {
  sourceUrl: string;
  sourceTitle: string;
  sourceType: string;
  sourcePublisher: string;
  sourceDate: string;
  rawExcerpt: string;
  manualSummary: string;
  signalCategory: (typeof SIGNAL_CATEGORIES)[number] | null;
  severityScore: (typeof SEVERITY_SCORES)[number] | null;
  hookTemplateUsed: string;
  status: (typeof SIGNAL_STATUSES)[number];
};

const initialFormState: NewSignalFormState = {
  sourceUrl: "",
  sourceTitle: "",
  sourceType: "",
  sourcePublisher: "",
  sourceDate: "",
  rawExcerpt: "",
  manualSummary: "",
  signalCategory: null,
  severityScore: null,
  hookTemplateUsed: "",
  status: "New",
};

export function NewSignalForm() {
  const [formState, setFormState] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return formState.sourceTitle.trim().length > 0 && (formState.rawExcerpt.trim().length > 0 || formState.manualSummary.trim().length > 0);
  }, [formState]);

  function updateField<K extends keyof NewSignalFormState>(key: K, value: NewSignalFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!canSubmit) {
      setError("Add a source title and at least one of raw excerpt or manual summary.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/signals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formState),
      });

      const data = (await response.json()) as { success?: boolean; message?: string; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Unable to submit signal.");
      }

      setSuccess(data.message ?? "Signal submitted.");
      setFormState(initialFormState);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit signal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual Signal Intake</CardTitle>
        <CardDescription>Capture one signal, classify it lightly, and store it cleanly for the next review step.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-6" onSubmit={handleSubmit}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sourceTitle">Source title</Label>
              <Input id="sourceTitle" value={formState.sourceTitle} onChange={(event) => updateField("sourceTitle", event.target.value)} placeholder="Short operator-friendly title" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sourceUrl">Source URL</Label>
              <Input id="sourceUrl" value={formState.sourceUrl} onChange={(event) => updateField("sourceUrl", event.target.value)} placeholder="https://..." />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sourceType">Source type</Label>
              <Select id="sourceType" value={formState.sourceType} onChange={(event) => updateField("sourceType", event.target.value)}>
                <option value="">Select source type</option>
                {SOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sourcePublisher">Source publisher</Label>
              <Input id="sourcePublisher" value={formState.sourcePublisher} onChange={(event) => updateField("sourcePublisher", event.target.value)} placeholder="Newsletter, community, founder note..." />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sourceDate">Source date</Label>
              <Input id="sourceDate" type="date" value={formState.sourceDate} onChange={(event) => updateField("sourceDate", event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" value={formState.status} onChange={(event) => updateField("status", event.target.value as (typeof initialFormState)["status"])}>
                {SIGNAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="signalCategory">Signal category</Label>
              <Select
                id="signalCategory"
                value={formState.signalCategory ?? ""}
                onChange={(event) => updateField("signalCategory", event.target.value ? (event.target.value as (typeof SIGNAL_CATEGORIES)[number]) : null)}
              >
                <option value="">Select category</option>
                {SIGNAL_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="severityScore">Severity score</Label>
              <Select
                id="severityScore"
                value={formState.severityScore?.toString() ?? ""}
                onChange={(event) => updateField("severityScore", event.target.value ? Number(event.target.value) as (typeof SEVERITY_SCORES)[number] : null)}
              >
                <option value="">Select severity</option>
                {SEVERITY_SCORES.map((score) => (
                  <option key={score} value={score}>
                    {score}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="rawExcerpt">Raw excerpt</Label>
            <Textarea id="rawExcerpt" value={formState.rawExcerpt} onChange={(event) => updateField("rawExcerpt", event.target.value)} placeholder="Paste the raw signal, quote, or note that triggered this entry." />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="manualSummary">Manual summary</Label>
            <Textarea id="manualSummary" value={formState.manualSummary} onChange={(event) => updateField("manualSummary", event.target.value)} placeholder="Summarize the operator read on why this matters." />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="hookTemplateUsed">Hook template used</Label>
            <Input id="hookTemplateUsed" value={formState.hookTemplateUsed} onChange={(event) => updateField("hookTemplateUsed", event.target.value)} placeholder="Name the hidden friction" />
          </div>

          {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
          {success ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-500">If Airtable is not configured, submission still succeeds in mock mode for UI testing.</p>
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? "Submitting..." : "Submit signal"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
