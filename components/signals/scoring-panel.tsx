"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSourceProfile } from "@/lib/source-profiles";
import { assessTransformability } from "@/lib/transformability";
import type { SignalDataSource, SignalRecord, SignalScoringResult } from "@/types/signal";

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

function pillClasses(value: string) {
  if (value === "Keep" || value === "Pass" || value === "High" || value === "Urgent") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (value === "Reject" || value === "Fail" || value === "Low") {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-amber-50 text-amber-700";
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "Not set";
  }

  return `${value}/100`;
}

export function ScoringPanel({
  signal,
  source,
  initialScoring,
}: {
  signal: SignalRecord;
  source: SignalDataSource;
  initialScoring: SignalScoringResult | null;
}) {
  const sourceProfile = getSourceProfile(signal);
  const transformability = assessTransformability(signal);
  const [scoring, setScoring] = useState<SignalScoringResult | null>(initialScoring);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  async function handleRunScoring(save: boolean) {
    setFeedback(null);
    if (save) {
      setIsSaving(true);
    } else {
      setIsRunning(true);
    }

    try {
      const response = await fetch("/api/score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signalId: signal.recordId,
          save,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        source?: SignalDataSource;
        scoring?: SignalScoringResult;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.scoring) {
        throw new Error(data.error ?? "Unable to score this signal.");
      }

      setScoring(data.scoring);
      setFeedback({
        tone: save ? (data.source === "airtable" ? "success" : "warning") : "success",
        title: save
          ? data.source === "airtable"
            ? "Scoring saved"
            : "Scoring saved in mock mode"
          : "Scoring preview ready",
        body: data.message ?? "Scoring completed.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: save ? "Save failed" : "Scoring failed",
        body: error instanceof Error ? error.message : "Unable to score this signal.",
      });
    } finally {
      setIsRunning(false);
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signal Evaluation</CardTitle>
        <CardDescription>
          Rules-based scoring for relevance, novelty, urgency, brand fit, and source trust before a record moves deeper into the editorial queue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => handleRunScoring(false)} disabled={isRunning || isSaving}>
            {isRunning ? "Scoring..." : "Run scoring"}
          </Button>
          <Button variant="secondary" onClick={() => handleRunScoring(true)} disabled={isRunning || isSaving}>
            {isSaving ? "Saving..." : "Save scoring"}
          </Button>
          <p className="text-sm text-slate-500">
            Current source: <span className="font-medium text-slate-700">{source === "airtable" ? "Airtable" : "Mock mode"}</span>
          </p>
          <p className="text-sm text-slate-500">
            Source profile: <span className="font-medium text-slate-700">{sourceProfile.contextLabel}</span>
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
          <p className="font-medium text-slate-900">{transformability.label}</p>
          <p className="mt-2 leading-6">{transformability.reason}</p>
        </div>

        {!scoring ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
            No scoring result yet. Run scoring to see whether this signal should be kept, reviewed, or rejected.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <div className={`rounded-full px-3 py-1 text-sm font-medium ${pillClasses(scoring.keepRejectRecommendation)}`}>
                {scoring.keepRejectRecommendation}
              </div>
              <div className={`rounded-full px-3 py-1 text-sm font-medium ${pillClasses(scoring.qualityGateResult)}`}>
                {scoring.qualityGateResult}
              </div>
              <div className={`rounded-full px-3 py-1 text-sm font-medium ${pillClasses(scoring.reviewPriority)}`}>
                {scoring.reviewPriority}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <SummaryItem label="Signal Relevance Score" value={formatScore(scoring.signalRelevanceScore)} />
              <SummaryItem label="Signal Novelty Score" value={formatScore(scoring.signalNoveltyScore)} />
              <SummaryItem label="Signal Urgency Score" value={formatScore(scoring.signalUrgencyScore)} />
              <SummaryItem label="Brand Fit Score" value={formatScore(scoring.brandFitScore)} />
              <SummaryItem label="Source Trust Score" value={formatScore(scoring.sourceTrustScore)} />
              <SummaryItem
                label="Similarity To Existing Content"
                value={formatScore(scoring.similarityToExistingContent)}
              />
              <SummaryItem label="Needs Human Review" value={scoring.needsHumanReview ? "Yes" : "No"} />
              <SummaryItem label="Duplicate Cluster ID" value={scoring.duplicateClusterId ?? "Not set"} />
            </div>

            <SummaryItem label="Why Selected" value={scoring.whySelected ?? "Not set"} />
            <SummaryItem label="Why Rejected" value={scoring.whyRejected ?? "Not set"} />
            <SummaryItem label="Scoring Version" value={`${scoring.scoringVersion} · ${new Date(scoring.scoredAt).toLocaleString()}`} />
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
  );
}
