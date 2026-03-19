"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PATTERN_TYPES,
  PATTERN_TYPE_LABELS,
  type PatternFormValues,
  type PatternType,
} from "@/lib/pattern-definitions";
import type { PatternCoverageAssessment } from "@/lib/pattern-coverage";
import type { PatternCandidateAssessment } from "@/lib/pattern-discovery";
import type { PatternResponse } from "@/types/api";

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

export function PatternFormCard({
  cardId,
  mode,
  title,
  description,
  initialValues,
  signalId,
  patternId,
  suggestion,
  coverageAssessment,
}: {
  cardId?: string;
  mode: "create" | "edit";
  title: string;
  description: string;
  initialValues: PatternFormValues;
  signalId?: string;
  patternId?: string;
  suggestion?: PatternCandidateAssessment | null;
  coverageAssessment?: PatternCoverageAssessment | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialValues);
  const [tagsInput, setTagsInput] = useState(initialValues.tags.join(", "));
  const [saving, setSaving] = useState(false);
  const [savedPattern, setSavedPattern] = useState<{ id: string; name: string } | null>(
    mode === "edit" && patternId ? { id: patternId, name: initialValues.name } : null,
  );
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  function updateField<K extends keyof PatternFormValues>(key: K, value: PatternFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(mode === "create" ? "/api/patterns" : `/api/patterns/${patternId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signalId,
          createdFromCoverageGap: coverageAssessment?.gapCandidate === true,
          coverageGapType: coverageAssessment?.gapType ?? null,
          coverageGapReason: coverageAssessment?.gapReason ?? null,
          name: form.name,
          description: form.description,
          patternType: form.patternType,
          sourceContext: form.sourceContext || null,
          exampleSignalId: form.exampleSignalId || null,
          exampleSignalTitle: form.exampleSignalTitle || null,
          exampleSignalSummary: form.exampleSignalSummary || null,
          exampleScenarioAngle: form.exampleScenarioAngle || null,
          exampleOutput: form.exampleOutput || null,
          tags: tagsInput
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });

      const data = (await response.json()) as PatternResponse;

      if (!response.ok || !data.success || !data.pattern) {
        throw new Error(data.error ?? "Unable to save pattern.");
      }

      setForm({
        name: data.pattern.name,
        description: data.pattern.description,
        patternType: data.pattern.patternType,
        sourceContext: data.pattern.sourceContext ?? "",
        exampleSignalId: data.pattern.exampleSignalId ?? "",
        exampleSignalTitle: data.pattern.exampleSignalTitle ?? "",
        exampleSignalSummary: data.pattern.exampleSignalSummary ?? "",
        exampleScenarioAngle: data.pattern.exampleScenarioAngle ?? "",
        exampleOutput: data.pattern.exampleOutput ?? "",
        tags: data.pattern.tags,
      });
      setTagsInput(data.pattern.tags.join(", "));
      setSavedPattern({ id: data.pattern.id, name: data.pattern.name });
      setFeedback({
        tone: "success",
        title: mode === "create" ? "Pattern saved" : "Pattern updated",
        body:
          mode === "create"
            ? "The pattern is now available in the library and can be reused from future signal workbenches."
            : "Pattern changes are now reflected in the library.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        title: mode === "create" ? "Pattern save failed" : "Pattern update failed",
        body: error instanceof Error ? error.message : "Unable to save pattern.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id={cardId}>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {mode === "create" && suggestion && suggestion.flag !== "no" ? (
            <div className="rounded-2xl bg-sky-50/80 p-4 text-sm text-sky-800">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white text-sky-700 ring-sky-200">
                  Suggested {PATTERN_TYPE_LABELS[suggestion.suggestedPatternType].toLowerCase()} pattern
                </Badge>
                <Badge className="bg-white text-slate-700 ring-slate-200">
                  {suggestion.strength === "strong" ? "Strong candidate" : "Possible candidate"}
                </Badge>
              </div>
              <p className="mt-3 font-medium text-slate-900">Why this was suggested</p>
              <p className="mt-2 leading-6 text-slate-700">{suggestion.reason}</p>
            </div>
          ) : null}

          {mode === "create" && coverageAssessment?.gapCandidate && coverageAssessment.gapReason ? (
            <div className="rounded-2xl bg-amber-50/80 p-4 text-sm text-amber-900">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white text-amber-700 ring-amber-200">Coverage gap</Badge>
                {coverageAssessment.gapType ? (
                  <Badge className="bg-white text-slate-700 ring-slate-200">{coverageAssessment.gapType}</Badge>
                ) : null}
              </div>
              <p className="mt-3 font-medium text-slate-900">Why this pattern matters</p>
              <p className="mt-2 leading-6 text-slate-700">{coverageAssessment.gapReason}</p>
              <p className="mt-2 text-xs text-slate-500">
                This pattern will be logged as filling a current library gap.
              </p>
            </div>
          ) : null}

          {form.exampleSignalTitle || form.exampleSignalSummary ? (
            <div className="rounded-2xl bg-white/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-slate-950">Example signal</p>
                {savedPattern ? (
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {PATTERN_TYPE_LABELS[form.patternType]}
                  </Badge>
                ) : null}
              </div>
              {form.exampleSignalTitle ? <p className="mt-2 text-sm font-medium text-slate-800">{form.exampleSignalTitle}</p> : null}
              {form.exampleSignalSummary ? <p className="mt-2 text-sm leading-6 text-slate-600">{form.exampleSignalSummary}</p> : null}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${mode}-pattern-name`}>Pattern name</Label>
              <Input
                id={`${mode}-pattern-name`}
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Boundary-reset parent reply"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${mode}-pattern-type`}>Pattern type</Label>
              <Select
                id={`${mode}-pattern-type`}
                value={form.patternType}
                onChange={(event) => updateField("patternType", event.target.value as PatternType)}
              >
                {PATTERN_TYPES.map((patternType) => (
                  <option key={patternType} value={patternType}>
                    {PATTERN_TYPE_LABELS[patternType]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${mode}-pattern-description`}>Description</Label>
            <Textarea
              id={`${mode}-pattern-description`}
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              className="min-h-24"
              placeholder="Reusable editorial pattern that explains why this framing or output worked."
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${mode}-pattern-tags`}>Tags</Label>
              <Input
                id={`${mode}-pattern-tags`}
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="conflict, scenario-led, output-ready"
              />
              <p className="text-xs text-slate-400">Comma-separated. Keep tags short and practical.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${mode}-pattern-source-context`}>Source context</Label>
              <Input
                id={`${mode}-pattern-source-context`}
                value={form.sourceContext}
                onChange={(event) => updateField("sourceContext", event.target.value)}
                placeholder="Community Thread · Teacher Community"
              />
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${mode}-pattern-scenario`}>Example Scenario Angle</Label>
              <Textarea
                id={`${mode}-pattern-scenario`}
                value={form.exampleScenarioAngle}
                onChange={(event) => updateField("exampleScenarioAngle", event.target.value)}
                className="min-h-28"
                placeholder="Optional reusable framing example"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${mode}-pattern-output`}>Example output</Label>
              <Textarea
                id={`${mode}-pattern-output`}
                value={form.exampleOutput}
                onChange={(event) => updateField("exampleOutput", event.target.value)}
                className="min-h-28"
                placeholder="Optional draft excerpt or closing line"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleSubmit} disabled={saving}>
              {saving ? (mode === "create" ? "Saving..." : "Updating...") : mode === "create" ? "Save as pattern" : "Save changes"}
            </Button>
            {savedPattern ? (
              <Link href={`/patterns/${savedPattern.id}`} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                Open pattern
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
    </div>
  );
}
