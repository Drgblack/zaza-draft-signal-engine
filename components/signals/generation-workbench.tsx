"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { PatternCandidatePanel } from "@/components/patterns/pattern-candidate-panel";
import { PatternSuggestionList } from "@/components/patterns/pattern-suggestion-list";
import { RelatedPatternsPanel } from "@/components/patterns/related-patterns-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PatternBundleSummary } from "@/lib/pattern-bundles";
import { assessScenarioAngle, getScenarioPriority } from "@/lib/scenario-angle";
import { evaluateDraftQuality, evaluateGenerationReadiness } from "@/lib/generation-quality";
import type { PatternMatchSuggestion } from "@/lib/pattern-match";
import type { PatternCandidateAssessment } from "@/lib/pattern-discovery";
import { PATTERN_TYPE_LABELS, type PatternSummary, type SignalPattern } from "@/lib/pattern-definitions";
import { PLATFORM_INTENT_PROFILE_VERSION, getPlatformIntentProfile } from "@/lib/platform-profiles";
import { EDITORIAL_MODES, type EditorialMode, type SignalDataSource, type SignalGenerationInput, type SignalGenerationResult, type SignalRecord } from "@/types/signal";

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
  relatedPatterns,
  availablePatterns,
  lastAppliedPattern,
  patternCandidate,
  patternSuggestions,
  initialSelectedPatternId,
  initialSuggestedPatternId,
  initialSelectedEditorialMode,
  suggestedEditorialMode,
  bundleSummariesByPatternId,
  initialSelectedPatternBundles,
}: {
  signal: SignalRecord;
  generationInput: SignalGenerationInput | null;
  initialGeneration: SignalGenerationResult | null;
  source: SignalDataSource;
  relatedPatterns: SignalPattern[];
  availablePatterns: SignalPattern[];
  lastAppliedPattern: PatternSummary | null;
  patternCandidate: PatternCandidateAssessment;
  patternSuggestions: PatternMatchSuggestion[];
  initialSelectedPatternId: string;
  initialSuggestedPatternId: string | null;
  initialSelectedEditorialMode: EditorialMode;
  suggestedEditorialMode: {
    mode: EditorialMode;
    reason: string;
  } | null;
  bundleSummariesByPatternId: Record<string, PatternBundleSummary[]>;
  initialSelectedPatternBundles: PatternBundleSummary[];
}) {
  const [generation, setGeneration] = useState<SignalGenerationResult | null>(initialGeneration);
  const [currentStatus, setCurrentStatus] = useState(signal.status);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPatternId, setSelectedPatternId] = useState(initialSelectedPatternId);
  const [suggestedPatternId, setSuggestedPatternId] = useState(initialSuggestedPatternId);
  const [selectedEditorialMode, setSelectedEditorialMode] = useState<EditorialMode>(initialSelectedEditorialMode);
  const [appliedPattern, setAppliedPattern] = useState<PatternSummary | null>(lastAppliedPattern);
  const [selectedPatternBundles, setSelectedPatternBundles] = useState<PatternBundleSummary[]>(initialSelectedPatternBundles);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);
  const scenarioAssessment = useMemo(
    () =>
      assessScenarioAngle({
        scenarioAngle: signal.scenarioAngle,
        sourceTitle: signal.sourceTitle,
      }),
    [signal.scenarioAngle, signal.sourceTitle],
  );
  const readiness = useMemo(() => evaluateGenerationReadiness(signal), [signal]);
  const scenarioPriority = useMemo(
    () =>
      getScenarioPriority({
        scenarioAngle: signal.scenarioAngle,
        sourceTitle: signal.sourceTitle,
      }),
    [signal.scenarioAngle, signal.sourceTitle],
  );
  const draftQuality = useMemo(
    () => (generation && generationInput ? evaluateDraftQuality(generationInput, generation) : null),
    [generation, generationInput],
  );
  const selectedPattern = useMemo(
    () => availablePatterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
    [availablePatterns, selectedPatternId],
  );
  const editorialModeDefinition = useMemo(
    () => getEditorialModeDefinition(selectedEditorialMode),
    [selectedEditorialMode],
  );
  const xProfile = useMemo(() => getPlatformIntentProfile("x"), []);
  const linkedInProfile = useMemo(() => getPlatformIntentProfile("linkedin"), []);
  const redditProfile = useMemo(() => getPlatformIntentProfile("reddit"), []);

  function badgeClasses(value: "ready" | "caution" | "blocked" | "strong" | "usable" | "weak" | "missing" | "Strong" | "Needs Review" | "Weak") {
    switch (value) {
      case "ready":
      case "strong":
      case "Strong":
        return "bg-emerald-50 text-emerald-700 ring-emerald-200";
      case "usable":
        return "bg-sky-50 text-sky-700 ring-sky-200";
      case "caution":
      case "Needs Review":
      case "weak":
        return "bg-amber-50 text-amber-700 ring-amber-200";
      case "blocked":
      case "Weak":
        return "bg-rose-50 text-rose-700 ring-rose-200";
      case "missing":
      default:
        return "bg-slate-100 text-slate-700 ring-slate-200";
    }
  }

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
          patternId: selectedPatternId || undefined,
          suggestedPatternId: selectedPatternId && selectedPatternId === suggestedPatternId ? suggestedPatternId : undefined,
          editorialMode: selectedEditorialMode,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        outputs?: SignalGenerationResult;
        appliedPattern?: PatternSummary | null;
        message?: string;
        usedFallback?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success || !data.outputs) {
        throw new Error(data.error ?? "Unable to generate drafts.");
      }

      setGeneration(data.outputs);
      setAppliedPattern(data.appliedPattern ?? null);
      setFeedback({
        tone: data.usedFallback || data.outputs.generationSource === "mock" ? "warning" : "success",
        title: data.usedFallback || data.outputs.generationSource === "mock" ? "Fallback drafts generated" : "Drafts generated",
        body: data.message ?? "Drafts generated for review.",
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
          editorialMode: selectedEditorialMode,
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
          <CardDescription>Scenario, interpretation, and source context that govern the draft outputs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Status</p>
            <p className="text-sm font-medium text-slate-700">
              {currentStatus} · {source === "airtable" ? "Airtable" : "Mock mode"}
            </p>
            {appliedPattern ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Pattern applied</Badge>
                <span className="text-sm text-slate-600">{appliedPattern.name}</span>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge className="bg-sky-50 text-sky-700 ring-sky-200">Editorial mode</Badge>
              <span className="text-sm text-slate-600">{editorialModeDefinition.label}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Signal</p>
            <p className="text-lg font-semibold text-slate-950">{signal.sourceTitle}</p>
            <p className="text-sm leading-6 text-slate-600">{signal.manualSummary ?? signal.rawExcerpt ?? "No summary recorded."}</p>
          </div>

          <div className="rounded-2xl bg-white/75 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Generation readiness</p>
              <Badge className={badgeClasses(readiness.status)}>{readiness.label}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{readiness.message}</p>
            {readiness.notes.length > 0 ? (
              <div className="mt-2 space-y-1 text-sm text-slate-500">
                {readiness.notes.map((note) => (
                  <p key={note}>- {note}</p>
                ))}
              </div>
            ) : null}
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

              <div className="rounded-2xl bg-white/75 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Scenario Angle</p>
                  <Badge className={badgeClasses(scenarioAssessment.quality)}>{scenarioAssessment.quality}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-800">{signal.scenarioAngle ?? "Not set"}</p>
                <p className="mt-2 text-sm text-slate-500">{scenarioAssessment.reason}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-white/75 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Generation framing</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    {scenarioPriority.preferredScenario ? "Scenario-led" : "Interpretation-led"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {scenarioPriority.preferredScenario
                      ? "Drafts will prioritise the current scenario angle, then the saved interpretation, then the source evidence."
                      : "Drafts will lean on the saved interpretation and source evidence because the current scenario angle is missing or weak."}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/75 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Packaging</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">{generationInput.platformPriority}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Format priority: {generationInput.suggestedFormatPriority}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-white/75 p-4 text-sm leading-6 text-slate-600">
                <p className="font-medium text-slate-800">Risk to Teacher</p>
                <p className="mt-2">{generationInput.riskToTeacher}</p>
              </div>

              <div className="rounded-2xl bg-white/75 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Editorial Mode</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Editorial Mode shapes the intent of the draft, for example awareness, risk warning, or helpful tip.
                    </p>
                  </div>
                  <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{editorialModeDefinition.label}</Badge>
                </div>
                <div className="mt-4 grid gap-3">
                  <Select
                    value={selectedEditorialMode}
                    onChange={(event) => {
                      setSelectedEditorialMode(event.target.value as EditorialMode);
                    }}
                  >
                    {EDITORIAL_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {getEditorialModeDefinition(mode).label}
                      </option>
                    ))}
                  </Select>
                  <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                    <p className="font-medium text-slate-900">{editorialModeDefinition.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{editorialModeDefinition.purpose}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tone</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{editorialModeDefinition.tone}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Framing</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{editorialModeDefinition.framing}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Guardrails</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Avoid {editorialModeDefinition.avoid.join(", ")}.
                      </p>
                    </div>
                    {suggestedEditorialMode ? (
                      <div className="mt-3 rounded-2xl bg-white/80 px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Co-pilot suggestion</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Suggested mode: {getEditorialModeDefinition(suggestedEditorialMode.mode).label}. {suggestedEditorialMode.reason}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white/75 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Apply pattern</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Optional generation guidance from the saved pattern library. This influences tone and structure without overriding the current Scenario Angle.
                    </p>
                  </div>
                  {selectedPattern ? (
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                      {PATTERN_TYPE_LABELS[selectedPattern.patternType]}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3">
                  <Select
                    value={selectedPatternId}
                    onChange={(event) => {
                      setSelectedPatternId(event.target.value);
                      setSelectedPatternBundles(bundleSummariesByPatternId[event.target.value] ?? []);
                    }}
                  >
                    <option value="">No pattern</option>
                    {availablePatterns.map((pattern) => (
                      <option key={pattern.id} value={pattern.id}>
                        {pattern.name} - {pattern.description.slice(0, 56)}
                      </option>
                    ))}
                  </Select>
                  {selectedPattern ? (
                    <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                      <p className="font-medium text-slate-900">{selectedPattern.name}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{selectedPattern.description}</p>
                      {selectedPattern.exampleScenarioAngle ? (
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Example angle: {selectedPattern.exampleScenarioAngle}
                        </p>
                      ) : null}
                      {selectedPatternBundles.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedPatternBundles.map((bundle) => (
                            <Badge key={bundle.id} className="bg-sky-50 text-sky-700 ring-sky-200">
                              {bundle.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPatternId("");
                            setSelectedPatternBundles([]);
                          }}
                          className="text-sm text-[color:var(--accent)] underline underline-offset-4"
                        >
                          Clear selection
                        </button>
                        <Link href={`/patterns/${selectedPattern.id}`} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                          View pattern
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No pattern selected. Generation will rely on the current signal, Scenario Angle, and interpretation only.</p>
                  )}
                </div>
              </div>

              <PatternSuggestionList
                signalId={signal.recordId}
                title="Suggested patterns for this signal"
                description="Co-pilot suggestions based on the current signal, framing, tags, and saved pattern examples."
                suggestions={patternSuggestions}
                emptyCopy="No stronger pattern suggestions surfaced for this signal."
                location="generation"
                onApplyPattern={(patternId) => {
                  setSelectedPatternId(patternId);
                  setSuggestedPatternId(patternId);
                  setSelectedPatternBundles(bundleSummariesByPatternId[patternId] ?? []);
                  const matched = patternSuggestions.find((suggestion) => suggestion.pattern.id === patternId);
                  if (matched) {
                    setFeedback({
                      tone: "success",
                      title: "Suggested pattern selected",
                      body: `${matched.pattern.name} is selected as optional generation guidance.`,
                    });
                  }
                }}
              />

              <RelatedPatternsPanel
                title="Pattern inspiration"
                description="Reusable pattern examples that worked for similar signals. Use them as framing references, not presets."
                emptyCopy="No related patterns are available for this signal yet."
                patterns={relatedPatterns}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleGenerate} disabled={isGenerating || !readiness.canGenerate}>
                  {isGenerating ? "Generating..." : generation ? "Regenerate drafts" : "Generate from current framing"}
                </Button>
                {readiness.interpretationLikelyStale ? (
                  <Link href={`/signals/${signal.recordId}/interpret`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Refresh interpretation first
                  </Link>
                ) : null}
                <p className="text-sm text-slate-500">
                  Fixed-template V1 generation in UK English. Drafts are shaped by Editorial Mode + Platform Intent Profile, with Scenario Angle leading when usable and interpretation acting as the main editorial guardrail.
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
          <CardDescription>Review, lightly edit, and save the generated assets back to the signal record. Platform intent profiles stay explicit and inspectable.</CardDescription>
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
                <p className="text-xs leading-5 text-slate-500">
                  {xProfile.label}: {xProfile.helperNote}. {xProfile.structure}
                </p>
                <Textarea id="xDraft" value={generation.xDraft} onChange={(event) => updateField("xDraft", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="linkedInDraft">LinkedIn Draft</Label>
                <p className="text-xs leading-5 text-slate-500">
                  {linkedInProfile.label}: {linkedInProfile.helperNote}. {linkedInProfile.structure}
                </p>
                <Textarea
                  id="linkedInDraft"
                  value={generation.linkedInDraft}
                  onChange={(event) => updateField("linkedInDraft", event.target.value)}
                  className="min-h-[180px]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="redditDraft">Reddit Draft</Label>
                <p className="text-xs leading-5 text-slate-500">
                  {redditProfile.label}: {redditProfile.helperNote}. {redditProfile.structure}
                </p>
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

              {draftQuality ? (
                <div className="rounded-2xl bg-white/75 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Draft quality checks</p>
                    <Badge className={badgeClasses(draftQuality.label)}>{draftQuality.label}</Badge>
                  </div>
                  <div className="mt-3 space-y-3">
                    {draftQuality.checks.map((check) => (
                      <div key={check.label} className="rounded-2xl bg-slate-50/80 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${check.status === "pass" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
                            {check.status === "pass" ? "Pass" : "Review"}
                          </span>
                          <p className="text-sm font-medium text-slate-900">{check.label}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{check.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <PatternCandidatePanel
                assessment={patternCandidate}
                title="Reusable Pattern Check"
                description="A light suggestion only. If this signal, Scenario Angle, or output feels reusable, save it from the detail page."
                actionHref={
                  patternCandidate.alreadyCaptured
                    ? null
                    : `/signals/${signal.recordId}#save-pattern`
                }
              />

              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-800">Generation metadata</p>
                <p className="mt-1">
                  Source: {generation.generationSource} · Model: {generation.generationModelVersion} · Prompt: {generation.promptVersion}
                </p>
                <p className="mt-1">Editorial mode: {editorialModeDefinition.label}</p>
                <p className="mt-1">Platform profiles: {PLATFORM_INTENT_PROFILE_VERSION}</p>
                {appliedPattern ? <p className="mt-1">Pattern: {appliedPattern.name}</p> : null}
                <p className="mt-1">Generated at: {new Date(generation.generatedAt).toLocaleString()}</p>
                <p className="mt-2 text-xs text-slate-500">Model version and prompt version are persisted when you save.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save drafts"}
                </Button>
                <Link
                  href={`/signals/${signal.recordId}`}
                  className={buttonVariants({ variant: "ghost", size: "md" })}
                >
                  View record
                </Link>
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
