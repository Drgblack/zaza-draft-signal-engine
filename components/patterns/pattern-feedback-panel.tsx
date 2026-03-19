"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getPatternFeedbackButtonLabel,
  getPatternFeedbackLabel,
  PATTERN_FEEDBACK_VALUES,
  type PatternFeedbackEntry,
  type PatternFeedbackValue,
} from "@/lib/pattern-feedback-definitions";
import type { PatternFeedbackResponse } from "@/types/api";

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

export function PatternFeedbackPanel({
  patternId,
  initialEntries,
}: {
  patternId: string;
  initialEntries: PatternFeedbackEntry[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [note, setNote] = useState("");
  const [savingValue, setSavingValue] = useState<PatternFeedbackValue | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  const latestEntry = useMemo(() => entries[0] ?? null, [entries]);

  async function handleSave(value: PatternFeedbackValue) {
    setSavingValue(value);
    setFeedback(null);

    try {
      const response = await fetch(`/api/patterns/${patternId}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value,
          note: note.trim().length > 0 ? note.trim() : null,
        }),
      });

      const data = (await response.json()) as PatternFeedbackResponse;
      if (!response.ok || !data.success || !data.feedback) {
        throw new Error(data.error ?? "Unable to save pattern feedback.");
      }

      setEntries((current) => [data.feedback!, ...current]);
      setNote("");
      setFeedback({
        tone: "success",
        title: "Pattern feedback saved",
        body: data.feedback.note
          ? `${getPatternFeedbackLabel(data.feedback.value)} recorded with note.`
          : `${getPatternFeedbackLabel(data.feedback.value)} recorded.`,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Pattern feedback failed",
        body: error instanceof Error ? error.message : "Unable to save pattern feedback.",
      });
    } finally {
      setSavingValue(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pattern Feedback</CardTitle>
        <CardDescription>Mark whether this pattern is still effective, needs refinement, or has become weak.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Optional note for the next feedback click</p>
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Short pattern note"
            maxLength={280}
            className="mt-3"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {PATTERN_FEEDBACK_VALUES.map((value) => (
            <Button
              key={value}
              type="button"
              variant={latestEntry?.value === value ? "primary" : "secondary"}
              size="sm"
              disabled={savingValue !== null}
              onClick={() => handleSave(value)}
            >
              {savingValue === value ? "Saving..." : getPatternFeedbackButtonLabel(value)}
            </Button>
          ))}
        </div>

        <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium text-slate-900">Latest pattern evaluation</p>
            <Badge className="bg-white text-slate-600 ring-slate-200">{entries.length} total</Badge>
          </div>
          {latestEntry ? (
            <>
              <p className="mt-2">{getPatternFeedbackLabel(latestEntry.value)}</p>
              {latestEntry.note ? <p className="mt-2 leading-6 text-slate-500">{latestEntry.note}</p> : null}
            </>
          ) : (
            <p className="mt-2 text-slate-500">No pattern feedback recorded yet.</p>
          )}
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
