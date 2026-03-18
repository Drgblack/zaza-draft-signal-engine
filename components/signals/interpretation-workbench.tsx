"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  HOOK_TEMPLATES,
  PLATFORM_PRIORITIES,
  RELEVANCE_LEVELS,
  SEVERITY_SCORES,
  SIGNAL_CATEGORIES,
  SUGGESTED_FORMAT_PRIORITIES,
  type SignalDataSource,
  type SignalInterpretationResult,
  type SignalRecord,
} from "@/types/signal";

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

export function InterpretationWorkbench({
  signal,
  initialInterpretation,
  source,
}: {
  signal: SignalRecord;
  initialInterpretation: SignalInterpretationResult | null;
  source: SignalDataSource;
}) {
  const [interpretation, setInterpretation] = useState<SignalInterpretationResult | null>(initialInterpretation);
  const [currentStatus, setCurrentStatus] = useState(signal.status);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  const hasInterpretation = useMemo(() => interpretation !== null, [interpretation]);

  function updateField<K extends keyof SignalInterpretationResult>(key: K, value: SignalInterpretationResult[K]) {
    setInterpretation((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleRunInterpretation() {
    setFeedback(null);
    setIsRunning(true);

    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signal: {
            recordId: signal.recordId,
            sourceTitle: signal.sourceTitle,
            sourceType: signal.sourceType,
            sourcePublisher: signal.sourcePublisher,
            sourceDate: signal.sourceDate,
            sourceUrl: signal.sourceUrl,
            rawExcerpt: signal.rawExcerpt,
            manualSummary: signal.manualSummary,
          },
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        interpretation?: SignalInterpretationResult;
        error?: string;
      };

      if (!response.ok || !data.success || !data.interpretation) {
        throw new Error(data.error ?? "Unable to interpret this signal.");
      }

      setInterpretation(data.interpretation);
      setFeedback({
        tone: "success",
        title: "Interpretation generated",
        body: "The rules-based interpretation layer returned a structured editorial read. Review and adjust before saving.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Interpretation failed",
        body: error instanceof Error ? error.message : "Unable to interpret this signal.",
      });
    } finally {
      setIsRunning(false);
    }
  }

  async function handleSaveInterpretation() {
    if (!interpretation) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/signals/${signal.recordId}/interpret`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...interpretation,
          status: "Interpreted",
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        source?: SignalDataSource;
        persisted?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Unable to save interpretation.");
      }

      setCurrentStatus("Interpreted");
      setFeedback({
        tone: data.source === "airtable" ? "success" : "warning",
        title: data.source === "airtable" ? "Saved to Airtable" : "Saved in mock mode",
        body: data.message ?? "Interpretation saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Save failed",
        body: error instanceof Error ? error.message : "Unable to save interpretation.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <CardTitle>Source Signal</CardTitle>
          <CardDescription>Operator context used by the interpretation layer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Status</p>
            <p className="text-sm font-medium text-slate-700">
              {currentStatus} · {source === "airtable" ? "Airtable" : "Mock mode"}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Title</p>
            <p className="text-lg font-semibold text-slate-950">{signal.sourceTitle}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Source Type</p>
              <p className="text-sm text-slate-700">{signal.sourceType ?? "Not set"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Publisher</p>
              <p className="text-sm text-slate-700">{signal.sourcePublisher ?? "Not set"}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Raw Excerpt</p>
            <p className="rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
              {signal.rawExcerpt ?? "No raw excerpt recorded."}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Manual Summary</p>
            <p className="rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
              {signal.manualSummary ?? "No manual summary recorded."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleRunInterpretation} disabled={isRunning}>
              {isRunning ? "Running..." : hasInterpretation ? "Refresh interpretation" : "Run interpretation"}
            </Button>
            <p className="text-sm text-slate-500">
              Rules-based V1 interpretation. Human review stays in the loop before anything is saved.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interpretation Workbench</CardTitle>
          <CardDescription>Review, adjust, and save the editorial interpretation back to the record.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!interpretation ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
              No interpretation has been generated yet. Run the interpretation layer to populate the structured fields.
            </div>
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="signalCategory">Signal Category</Label>
                  <Select
                    id="signalCategory"
                    value={interpretation.signalCategory}
                    onChange={(event) => updateField("signalCategory", event.target.value as SignalInterpretationResult["signalCategory"])}
                  >
                    {SIGNAL_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="severityScore">Severity Score</Label>
                  <Select
                    id="severityScore"
                    value={interpretation.severityScore.toString()}
                    onChange={(event) => updateField("severityScore", Number(event.target.value) as SignalInterpretationResult["severityScore"])}
                  >
                    {SEVERITY_SCORES.map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="relevanceToZazaDraft">Relevance to Zaza Draft</Label>
                  <Select
                    id="relevanceToZazaDraft"
                    value={interpretation.relevanceToZazaDraft}
                    onChange={(event) =>
                      updateField("relevanceToZazaDraft", event.target.value as SignalInterpretationResult["relevanceToZazaDraft"])
                    }
                  >
                    {RELEVANCE_LEVELS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hookTemplateUsed">Hook Template Used</Label>
                  <Select
                    id="hookTemplateUsed"
                    value={interpretation.hookTemplateUsed}
                    onChange={(event) => updateField("hookTemplateUsed", event.target.value as SignalInterpretationResult["hookTemplateUsed"])}
                  >
                    {HOOK_TEMPLATES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="platformPriority">Platform Priority</Label>
                  <Select
                    id="platformPriority"
                    value={interpretation.platformPriority}
                    onChange={(event) => updateField("platformPriority", event.target.value as SignalInterpretationResult["platformPriority"])}
                  >
                    {PLATFORM_PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="suggestedFormatPriority">Suggested Format Priority</Label>
                  <Select
                    id="suggestedFormatPriority"
                    value={interpretation.suggestedFormatPriority}
                    onChange={(event) =>
                      updateField("suggestedFormatPriority", event.target.value as SignalInterpretationResult["suggestedFormatPriority"])
                    }
                  >
                    {SUGGESTED_FORMAT_PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="signalSubtype">Signal Subtype</Label>
                  <Input
                    id="signalSubtype"
                    value={interpretation.signalSubtype}
                    onChange={(event) => updateField("signalSubtype", event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="emotionalPattern">Emotional Pattern</Label>
                  <Input
                    id="emotionalPattern"
                    value={interpretation.emotionalPattern}
                    onChange={(event) => updateField("emotionalPattern", event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="teacherPainPoint">Teacher Pain Point</Label>
                <Textarea
                  id="teacherPainPoint"
                  value={interpretation.teacherPainPoint}
                  onChange={(event) => updateField("teacherPainPoint", event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="riskToTeacher">Risk to Teacher</Label>
                <Textarea
                  id="riskToTeacher"
                  value={interpretation.riskToTeacher}
                  onChange={(event) => updateField("riskToTeacher", event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="contentAngle">Content Angle</Label>
                <Textarea
                  id="contentAngle"
                  value={interpretation.contentAngle}
                  onChange={(event) => updateField("contentAngle", event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="interpretationNotes">Interpretation Notes</Label>
                <Textarea
                  id="interpretationNotes"
                  value={interpretation.interpretationNotes}
                  onChange={(event) => updateField("interpretationNotes", event.target.value)}
                />
              </div>

              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-800">Interpreter metadata</p>
                <p className="mt-1">
                  Source: {interpretation.interpretationSource} · Confidence: {interpretation.interpretationConfidence} ·
                  Interpreted at: {new Date(interpretation.interpretedAt).toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Metadata is shown for operator trust but is not persisted to Airtable in this run.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleSaveInterpretation} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save interpretation"}
                </Button>
                <p className="text-sm text-slate-500">Saving sets the record status to `Interpreted`.</p>
              </div>
            </>
          )}

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
