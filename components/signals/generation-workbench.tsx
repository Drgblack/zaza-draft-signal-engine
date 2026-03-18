"use client";

import Link from "next/link";
import { useState } from "react";

import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SignalDataSource, SignalGenerationInput, SignalGenerationResult, SignalRecord } from "@/types/signal";

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

export function GenerationWorkbench({
  signal,
  generationInput,
  initialGeneration,
  source,
}: {
  signal: SignalRecord;
  generationInput: SignalGenerationInput | null;
  initialGeneration: SignalGenerationResult | null;
  source: SignalDataSource;
}) {
  const [generation, setGeneration] = useState<SignalGenerationResult | null>(initialGeneration);
  const [currentStatus, setCurrentStatus] = useState(signal.status);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  function updateField<K extends keyof SignalGenerationResult>(key: K, value: SignalGenerationResult[K]) {
    setGeneration((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleGenerate() {
    if (!generationInput) {
      return;
    }

    setFeedback(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signal: generationInput,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        outputs?: SignalGenerationResult;
        error?: string;
      };

      if (!response.ok || !data.success || !data.outputs) {
        throw new Error(data.error ?? "Unable to generate drafts.");
      }

      setGeneration(data.outputs);
      setFeedback({
        tone: data.outputs.generationSource === "mock" ? "warning" : "success",
        title: data.outputs.generationSource === "mock" ? "Mock drafts generated" : "Drafts generated",
        body:
          data.outputs.generationSource === "mock"
            ? "No AI provider key is configured, so deterministic mock drafts were generated."
            : `Drafts generated via ${data.outputs.generationSource} using ${data.outputs.generationModelVersion}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Generation failed",
        body: error instanceof Error ? error.message : "Unable to generate drafts.",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    if (!generation) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/signals/${signal.recordId}/generate`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...generation,
          status: "Draft Generated",
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        source?: SignalDataSource;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Unable to save generated drafts.");
      }

      setCurrentStatus("Draft Generated");
      setFeedback({
        tone: data.source === "airtable" ? "success" : "warning",
        title: data.source === "airtable" ? "Saved to Airtable" : "Saved in mock mode",
        body: data.message ?? "Generated drafts saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Save failed",
        body: error instanceof Error ? error.message : "Unable to save generated drafts.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Generation Context</CardTitle>
          <CardDescription>Source and interpretation inputs that govern the draft outputs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Status</p>
            <p className="text-sm font-medium text-slate-700">
              {currentStatus} · {source === "airtable" ? "Airtable" : "Mock mode"}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Signal</p>
            <p className="text-lg font-semibold text-slate-950">{signal.sourceTitle}</p>
            <p className="text-sm leading-6 text-slate-600">{signal.manualSummary ?? signal.rawExcerpt ?? "No summary recorded."}</p>
          </div>

          {generationInput ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-white/75 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Interpretation</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    {generationInput.signalCategory} · Severity {generationInput.severityScore}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{generationInput.signalSubtype}</p>
                </div>
                <div className="rounded-2xl bg-white/75 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Editorial Direction</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">{generationInput.hookTemplateUsed}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{generationInput.contentAngle}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-white/75 p-4 text-sm leading-6 text-slate-600">
                <p className="font-medium text-slate-800">Risk to Teacher</p>
                <p className="mt-2">{generationInput.riskToTeacher}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? "Generating..." : generation ? "Refresh drafts" : "Generate drafts"}
                </Button>
                <p className="text-sm text-slate-500">
                  Fixed-template V1 generation in UK English. The interpretation remains the governing angle.
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-700">
              This record is missing interpretation fields. Complete the interpretation workflow before generating drafts.
              <div className="mt-3">
                <Link href={`/signals/${signal.recordId}/interpret`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Go to interpretation
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Draft Outputs</CardTitle>
          <CardDescription>Review, lightly edit, and save the generated assets back to the signal record.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!generation ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
              No drafts generated yet. Run generation to produce the fixed-format outputs for manual review.
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="xDraft">X Draft</Label>
                <Textarea id="xDraft" value={generation.xDraft} onChange={(event) => updateField("xDraft", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="linkedInDraft">LinkedIn Draft</Label>
                <Textarea
                  id="linkedInDraft"
                  value={generation.linkedInDraft}
                  onChange={(event) => updateField("linkedInDraft", event.target.value)}
                  className="min-h-[180px]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="redditDraft">Reddit Draft</Label>
                <Textarea
                  id="redditDraft"
                  value={generation.redditDraft}
                  onChange={(event) => updateField("redditDraft", event.target.value)}
                  className="min-h-[180px]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="imagePrompt">Image Prompt</Label>
                <Textarea
                  id="imagePrompt"
                  value={generation.imagePrompt}
                  onChange={(event) => updateField("imagePrompt", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="videoScript">Video Script</Label>
                <Textarea
                  id="videoScript"
                  value={generation.videoScript}
                  onChange={(event) => updateField("videoScript", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ctaOrClosingLine">CTA / Closing Line</Label>
                <Textarea
                  id="ctaOrClosingLine"
                  value={generation.ctaOrClosingLine}
                  onChange={(event) => updateField("ctaOrClosingLine", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="hashtagsOrKeywords">Hashtags / Keywords</Label>
                <Textarea
                  id="hashtagsOrKeywords"
                  value={generation.hashtagsOrKeywords}
                  onChange={(event) => updateField("hashtagsOrKeywords", event.target.value)}
                />
              </div>

              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-800">Generation metadata</p>
                <p className="mt-1">
                  Source: {generation.generationSource} · Model: {generation.generationModelVersion} · Prompt: {generation.promptVersion}
                </p>
                <p className="mt-2 text-xs text-slate-500">Model version and prompt version are persisted when you save.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save drafts"}
                </Button>
                <p className="text-sm text-slate-500">Saving sets the record status to `Draft Generated`.</p>
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
