"use client";

import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReuseMemorySummary } from "@/lib/reuse-memory";

function toneClasses(tone: "positive" | "caution" | "neutral"): string {
  switch (tone) {
    case "positive":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "caution":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "neutral":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

export function ReuseMemoryPanel({
  summary,
  title = "Reuse memory",
  description = "What prior judged outcomes suggest reusing carefully or avoiding.",
  emptyCopy = "No prior judged outcomes are similar enough to surface yet.",
}: {
  summary: ReuseMemorySummary;
  title?: string;
  description?: string;
  emptyCopy?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.highlights.length === 0 ? (
          <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">{emptyCopy}</div>
        ) : (
          summary.highlights.map((highlight) => (
            <div key={highlight.postingLogId} className="rounded-2xl bg-white/80 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClasses(highlight.tone)}`}>
                  {highlight.tone === "positive" ? "Worked before" : highlight.tone === "caution" ? "Use caution" : "Past outcome"}
                </span>
                <span className="text-xs text-slate-500">
                  {highlight.platformLabel} · {highlight.outcomeQualityLabel} · {highlight.reuseRecommendationLabel}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{highlight.text}</p>
              {highlight.matchedOn.length > 0 ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Matched on {highlight.matchedOn.join(", ")}.
                </p>
              ) : null}
              {highlight.note ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">Note: {highlight.note}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <Link href={`/signals/${highlight.signalId}`} className="text-[color:var(--accent)] underline underline-offset-4">
                  Open prior signal
                </Link>
                {highlight.postUrl ? (
                  <Link href={highlight.postUrl} target="_blank" className="text-[color:var(--accent)] underline underline-offset-4">
                    Open posted URL
                  </Link>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
