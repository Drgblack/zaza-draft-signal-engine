"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { ContentContextFields, type ContentContextFormValue } from "@/components/campaigns/content-context-fields";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import type { ScenarioAngleSuggestion } from "@/lib/scenario-angle";
import { PatternSuggestionList } from "@/components/patterns/pattern-suggestion-list";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RelatedPatternsPanel } from "@/components/patterns/related-patterns-panel";
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
import type { SignalPattern } from "@/lib/pattern-definitions";
import type { PatternMatchSuggestion } from "@/lib/pattern-match";
import type { AudienceSegment, Campaign, ContentPillar } from "@/lib/campaigns";

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

function hasContent(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateInterpretationForSave(
  interpretation: SignalInterpretationResult,
) {
  if (!hasContent(interpretation.signalSubtype)) {
    return "Signal subtype is required before you can save interpretation.";
  }

  if (!hasContent(interpretation.emotionalPattern)) {
    return "Emotional pattern is required before you can save interpretation.";
  }

  if (!hasContent(interpretation.teacherPainPoint)) {
    return "Teacher pain point is required before you can save interpretation.";
  }

  if (!hasContent(interpretation.riskToTeacher)) {
    return "Risk to teacher is required before you can save interpretation.";
  }

  if (!hasContent(interpretation.contentAngle)) {
    return "Content angle is required before you can save interpretation.";
  }

  if (!hasContent(interpretation.interpretationNotes)) {
    return "Interpretation notes are required before you can save interpretation.";
  }

  return null;
}

export function InterpretationWorkbench({
  signal,
  initialInterpretation,
  source,
  relatedPatterns,
  suggestedPatterns,
  campaigns,
  pillars,
  audienceSegments,
}: {
  signal: SignalRecord;
  initialInterpretation: SignalInterpretationResult | null;
  source: SignalDataSource;
  relatedPatterns: SignalPattern[];
  suggestedPatterns: PatternMatchSuggestion[];
  campaigns: Campaign[];
  pillars: ContentPillar[];
  audienceSegments: AudienceSegment[];
}) {
  const [interpretation, setInterpretation] = useState<SignalInterpretationResult | null>(initialInterpretation);
  const [scenarioAngle, setScenarioAngle] = useState(signal.scenarioAngle ?? "");
  const [currentStatus, setCurrentStatus] = useState(signal.status);
  const [contentContext, setContentContext] = useState<ContentContextFormValue>({
    campaignId: signal.campaignId ?? "",
    pillarId: signal.pillarId ?? "",
    audienceSegmentId: signal.audienceSegmentId ?? "",
    funnelStage: signal.funnelStage ?? "",
    ctaGoal: signal.ctaGoal ?? "",
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [didSaveInterpretation, setDidSaveInterpretation] = useState(
    signal.status === "Interpreted",
  );
  const [suggestions, setSuggestions] = useState<ScenarioAngleSuggestion[]>([]);
  const [suggestionMeta, setSuggestionMeta] = useState<{
    source: "anthropic" | "openai" | "mock";
    message: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  const hasInterpretation = useMemo(() => interpretation !== null, [interpretation]);
  const scenarioAssessment = useMemo(
    () =>
      assessScenarioAngle({
        scenarioAngle,
        sourceTitle: signal.sourceTitle,
      }),
    [scenarioAngle, signal.sourceTitle],
  );

  function updateField<K extends keyof SignalInterpretationResult>(key: K, value: SignalInterpretationResult[K]) {
    setInterpretation((current) => (current ? { ...current, [key]: value } : current));
  }

  function scenarioBadgeClasses() {
    switch (scenarioAssessment.quality) {
      case "strong":
        return "bg-emerald-50 text-emerald-700 ring-emerald-200";
      case "usable":
        return "bg-sky-50 text-sky-700 ring-sky-200";
      case "weak":
        return "bg-amber-50 text-amber-700 ring-amber-200";
      case "missing":
      default:
        return "bg-slate-100 text-slate-700 ring-slate-200";
    }
  }

  async function handleSuggestAngles() {
    setFeedback(null);
    setIsSuggesting(true);

    try {
      const response = await fetch("/api/scenario-angle/suggest", {
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
            scenarioAngle,
          },
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        suggestions?: ScenarioAngleSuggestion[];
        source?: "anthropic" | "openai" | "mock";
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.suggestions) {
        throw new Error(data.error ?? "Unable to suggest scenario angles.");
      }

      setSuggestions(data.suggestions);
      setSuggestionMeta({
        source: data.source ?? "mock",
        message: data.message ?? "Scenario-angle suggestions ready.",
      });
      setFeedback({
        tone: data.source === "mock" ? "warning" : "success",
        title: "Scenario angles suggested",
        body: data.message ?? "Select a suggestion to insert it into the field.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Suggestion failed",
        body: error instanceof Error ? error.message : "Unable to suggest scenario angles.",
      });
    } finally {
      setIsSuggesting(false);
    }
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
            scenarioAngle,
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

    const validationError = validateInterpretationForSave(interpretation);
    if (validationError) {
      setFeedback({
        tone: "error",
        title: "Interpretation is incomplete",
        body: validationError,
      });
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
          scenarioAngle,
          campaignId: contentContext.campaignId || null,
          pillarId: contentContext.pillarId || null,
          audienceSegmentId: contentContext.audienceSegmentId || null,
          funnelStage: contentContext.funnelStage || null,
          ctaGoal: contentContext.ctaGoal || null,
          status: "Interpreted",
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        source?: SignalDataSource;
        persisted?: boolean;
        message?: string;
        error?: string;
        errorCode?: "validation_error" | "airtable_error" | "unknown_error";
      };

      if (!response.ok || !data.success) {
        if (data.errorCode === "airtable_error") {
          throw new Error(
            data.error ??
              "Airtable rejected the save. Check the field mapping and try again.",
          );
        }

        throw new Error(data.error ?? "Unable to save interpretation.");
      }

      setCurrentStatus("Interpreted");
      setDidSaveInterpretation(true);
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

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="scenarioAngle">Scenario Angle</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={scenarioBadgeClasses()}>{scenarioAssessment.quality}</Badge>
                <span className="text-xs text-slate-400">Optional but recommended for indirect signals</span>
              </div>
            </div>
            <Textarea
              id="scenarioAngle"
              value={scenarioAngle}
              onChange={(event) => setScenarioAngle(event.target.value)}
              placeholder="e.g. How should a teacher email parents after a serious classroom incident without sounding accusatory?"
              className="min-h-28"
            />
            <p className="text-sm leading-6 text-slate-500">
              A good scenario angle describes the teacher communication situation, not just the headline.
            </p>
            <p className="text-xs text-slate-400">
              Example framings: “Responding to a parent complaint without escalating tension” or “Documenting student behaviour professionally for leadership or parents”.
            </p>
            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Angle guidance</p>
              <p className="mt-1">{scenarioAssessment.reason}</p>
              {scenarioAssessment.suggestions.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {scenarioAssessment.suggestions.map((item) => (
                    <p key={item}>- {item}</p>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={handleSuggestAngles} disabled={isSuggesting}>
                {isSuggesting ? "Suggesting..." : "Suggest angles"}
              </Button>
              <p className="text-sm text-slate-500">
                For indirect news or policy signals, this helps the system move from general news to a usable Zaza-style scenario.
              </p>
            </div>
            {suggestions.length > 0 ? (
              <div className="space-y-3 rounded-2xl bg-white/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">Suggested scenario angles</p>
                  {suggestionMeta ? (
                    <span className="text-xs text-slate-400">{suggestionMeta.source} assist</span>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.angle}
                      type="button"
                      onClick={() => setScenarioAngle(suggestion.angle)}
                      className="w-full rounded-2xl border border-black/6 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <p className="font-medium text-slate-900">{suggestion.angle}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{suggestion.rationale}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {scenarioAngle !== (signal.scenarioAngle ?? "") ? (
              <p className="text-xs text-amber-700">
                Scenario angle changed. Run interpretation again before saving so the structured fields reflect the new framing.
              </p>
            ) : null}
          </div>

          <RelatedPatternsPanel
            title="Related patterns"
            description="Manual pattern examples you can reuse when this signal needs stronger framing."
            emptyCopy="No related patterns match this signal yet."
            patterns={relatedPatterns}
            allowScenarioUse
            onUseScenario={(pattern) => {
              if (!pattern.exampleScenarioAngle) {
                return;
              }

              setScenarioAngle(pattern.exampleScenarioAngle);
              setFeedback({
                tone: "success",
                title: "Pattern framing inserted",
                body: `Loaded the Scenario Angle from ${pattern.name}. Review it and rerun interpretation before saving.`,
              });
            }}
          />

          <PatternSuggestionList
            signalId={signal.recordId}
            title="Suggested patterns for this signal"
            description="Co-pilot pattern suggestions stay optional. Use one when it clearly fits the communication situation."
            suggestions={suggestedPatterns}
            emptyCopy="No stronger pattern suggestions surfaced for this signal."
            location="interpretation"
            applyHrefBuilder={(patternId) => `/signals/${signal.recordId}/generate?pattern=${patternId}&suggested=1`}
            onUseScenario={(patternId) => {
              const matched = suggestedPatterns.find((suggestion) => suggestion.pattern.id === patternId);
              if (!matched?.pattern.exampleScenarioAngle) {
                return;
              }

              setScenarioAngle(matched.pattern.exampleScenarioAngle);
              setFeedback({
                tone: "success",
                title: "Suggested pattern angle inserted",
                body: `Loaded the Scenario Angle from ${matched.pattern.name}. Review it and rerun interpretation before saving.`,
              });
            }}
          />

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
          <CardDescription>
            Review, adjust, and save the editorial interpretation back to the record. Scenario framing helps the system move from general news to a usable Zaza-style teacher communication scenario.
          </CardDescription>
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

              <ContentContextFields
                value={contentContext}
                onChange={setContentContext}
                campaigns={campaigns}
                pillars={pillars}
                audienceSegments={audienceSegments}
                helperText="These fields help the autonomous queue and insights layer balance campaign, audience, funnel, and CTA mix."
              />

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
                {!didSaveInterpretation ? (
                  <>
                    <Button onClick={handleSaveInterpretation} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save interpretation"}
                    </Button>
                    <Link
                      href={`/signals/${signal.recordId}`}
                      className={buttonVariants({ variant: "ghost", size: "md" })}
                    >
                      View record
                    </Link>
                    <p className="text-sm text-slate-500">
                      Saving sets the record status to `Interpreted`.
                    </p>
                  </>
                ) : (
                  <>
                    <Link
                      href="/review?view=ready_to_approve#approval-ready"
                      className={buttonVariants({ size: "md" })}
                    >
                      Continue to Review
                    </Link>
                    <Link
                      href={`/signals/${signal.recordId}`}
                      className={buttonVariants({ variant: "secondary", size: "md" })}
                    >
                      View record
                    </Link>
                    <p className="text-sm text-slate-500">
                      Brief creation only starts after this signal is approved in Review.
                    </p>
                  </>
                )}
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
