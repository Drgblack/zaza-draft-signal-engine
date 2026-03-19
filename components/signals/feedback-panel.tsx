"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  FEEDBACK_CATEGORY_DEFINITIONS,
  getFeedbackButtonLabel,
  getFeedbackCountByCategory,
  getFeedbackLabel,
  getFeedbackValuesForCategory,
  getLatestFeedbackByCategory,
  type FeedbackCategory,
  type FeedbackValue,
  type SignalFeedback,
} from "@/lib/feedback-definitions";
import type { SaveFeedbackResponse } from "@/types/api";

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

export function FeedbackPanel({
  signalId,
  initialEntries,
  categories,
  title,
  description,
}: {
  signalId: string;
  initialEntries: SignalFeedback[];
  categories: FeedbackCategory[];
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [note, setNote] = useState("");
  const [savingValue, setSavingValue] = useState<FeedbackValue | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  const latestByCategory = useMemo(() => getLatestFeedbackByCategory(entries), [entries]);
  const countsByCategory = useMemo(() => getFeedbackCountByCategory(entries), [entries]);

  async function handleSave(category: FeedbackCategory, value: FeedbackValue) {
    setSavingValue(value);
    setFeedback(null);

    try {
      const response = await fetch(`/api/signals/${signalId}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          value,
          note: note.trim().length > 0 ? note.trim() : null,
        }),
      });

      const data = (await response.json()) as SaveFeedbackResponse;

      if (!response.ok || !data.success || !data.feedback) {
        throw new Error(data.error ?? "Unable to save feedback.");
      }

      setEntries((current) => [data.feedback!, ...current]);
      setNote("");
      setFeedback({
        tone: "success",
        title: "Feedback saved",
        body: data.feedback.note ? `${getFeedbackLabel(data.feedback.value)} recorded with note.` : `${getFeedbackLabel(data.feedback.value)} recorded.`,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Feedback failed",
        body: error instanceof Error ? error.message : "Unable to save feedback.",
      });
    } finally {
      setSavingValue(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Optional note for the next feedback click</p>
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Short operator note"
            maxLength={280}
            className="mt-3"
          />
          <p className="mt-2 text-xs text-slate-400">Leave this blank for one-click feedback.</p>
        </div>

        <div className="space-y-4">
          {categories.map((category) => {
            const latest = latestByCategory[category];
            const values = getFeedbackValuesForCategory(category);

            return (
              <div key={category} className="rounded-2xl bg-white/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">{FEEDBACK_CATEGORY_DEFINITIONS[category].label}</p>
                    <p className="mt-1 text-sm text-slate-500">{FEEDBACK_CATEGORY_DEFINITIONS[category].description}</p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {countsByCategory[category]} total
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {values.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={latest?.value === value ? "primary" : "secondary"}
                      size="sm"
                      disabled={savingValue !== null}
                      onClick={() => handleSave(category, value)}
                    >
                      {savingValue === value ? "Saving..." : getFeedbackButtonLabel(value)}
                    </Button>
                  ))}
                </div>

                {latest ? (
                  <div className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-900">Latest</p>
                    <p className="mt-1">{getFeedbackLabel(latest.value)}</p>
                    {latest.note ? <p className="mt-2 leading-6 text-slate-500">{latest.note}</p> : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">No feedback recorded here yet.</p>
                )}
              </div>
            );
          })}
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
