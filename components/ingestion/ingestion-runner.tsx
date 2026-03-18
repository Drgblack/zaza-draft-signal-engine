"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { IngestionRunSummary, IngestionSourceDefinition } from "@/lib/ingestion/types";

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

export function IngestionRunner({
  sources,
  mode,
}: {
  sources: IngestionSourceDefinition[];
  mode: "airtable" | "mock";
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<IngestionRunSummary | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  async function handleRunIngestion() {
    setFeedback(null);
    setIsRunning(true);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = (await response.json()) as {
        success?: boolean;
        mode?: "airtable" | "mock";
        result?: IngestionRunSummary;
        error?: string;
      };

      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error ?? "Unable to run ingestion.");
      }

      setResult(data.result);
      setFeedback({
        tone: data.mode === "airtable" ? "success" : "warning",
        title: data.mode === "airtable" ? "Ingestion completed" : "Mock ingestion completed",
        body: data.result.message,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Ingestion failed",
        body: error instanceof Error ? error.message : "Unable to run ingestion.",
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Run Ingestion</CardTitle>
          <CardDescription>
            Fetch enabled sources, normalise candidate items, skip obvious duplicates, and save new records for human review.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Button onClick={handleRunIngestion} disabled={isRunning}>
            {isRunning ? "Running..." : "Run ingestion now"}
          </Button>
          <p className="text-sm text-slate-500">
            Current mode: <span className="font-medium text-slate-700">{mode === "airtable" ? "Airtable" : "Mock mode"}</span>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Configured Sources</CardTitle>
            <CardDescription>{sources.length} enabled sources in the registry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sources.map((source) => (
              <div key={source.id} className="rounded-2xl bg-white/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-950">{source.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{source.publisher} · {source.topic}</p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {source.kind}
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">{source.notes ?? source.url}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest Result</CardTitle>
            <CardDescription>Operator-facing summary of the most recent ingestion run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedback ? (
              <div className={`rounded-2xl px-4 py-3 text-sm ${toneClasses(feedback.tone)}`}>
                <p className="font-medium">{feedback.title}</p>
                <p className="mt-1">{feedback.body}</p>
              </div>
            ) : null}

            {!result ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
                No ingestion run has been executed in this session yet.
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sources checked</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{result.sourcesChecked}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Items fetched</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{result.itemsFetched}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Imported</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{result.itemsImported}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Skipped duplicates</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{result.itemsSkippedDuplicates}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {result.sourceResults.map((source) => (
                    <div key={source.sourceId} className="rounded-2xl bg-white/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-slate-950">{source.sourceName}</p>
                        <p className="text-sm text-slate-500">
                          {source.itemsImported} imported · {source.itemsSkippedDuplicates} skipped
                        </p>
                      </div>
                      {source.errors.length > 0 ? (
                        <p className="mt-2 text-sm text-amber-700">{source.errors.join(" ")}</p>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">{source.itemsFetched} items fetched.</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
