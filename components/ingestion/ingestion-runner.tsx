"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { IngestionRunSummary, IngestionSourceDefinition } from "@/lib/ingestion/types";
import type { PipelineRunSummary } from "@/lib/pipeline";

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
  const redditSourceIds = useMemo(() => sources.filter((source) => source.kind === "reddit").map((source) => source.id), [sources]);
  const feedSourceIds = useMemo(
    () => sources.filter((source) => source.kind !== "reddit").map((source) => source.id),
    [sources],
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [lastRunLabel, setLastRunLabel] = useState("all enabled sources");
  const [result, setResult] = useState<IngestionRunSummary | null>(null);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineRunSummary | null>(null);
  const [scoreSummary, setScoreSummary] = useState<{
    processed: number;
    saved: number;
    results: Array<{
      recordId: string;
      sourceTitle: string;
      recommendation: string;
      reviewPriority: string;
      persisted: boolean;
      error?: string;
    }>;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  async function handleRunIngestion(sourceIds?: string[], label = "all enabled sources") {
    setFeedback(null);
    setIsRunning(true);
    setLastRunLabel(label);

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sourceIds?.length ? { sourceIds } : {}),
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
        body: `${data.result.message} Scope: ${label}.`,
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

  async function handleBatchScoring() {
    setFeedback(null);
    setIsScoring(true);

    try {
      const response = await fetch("/api/score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          save: true,
          batch: {
            status: "New",
            onlyMissingScores: true,
            limit: 20,
          },
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        source?: "airtable" | "mock";
        processed?: number;
        saved?: number;
        results?: Array<{
          recordId: string;
          sourceTitle: string;
          recommendation: string;
          reviewPriority: string;
          persisted: boolean;
          error?: string;
        }>;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.results) {
        throw new Error(data.error ?? "Unable to score candidate signals.");
      }

      setScoreSummary({
        processed: data.processed ?? 0,
        saved: data.saved ?? 0,
        results: data.results,
      });
      setFeedback({
        tone: data.source === "airtable" ? "success" : "warning",
        title: data.source === "airtable" ? "Batch scoring completed" : "Mock batch scoring completed",
        body: data.message ?? "Candidate signals were scored.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Batch scoring failed",
        body: error instanceof Error ? error.message : "Unable to score candidate signals.",
      });
    } finally {
      setIsScoring(false);
    }
  }

  async function handleRunPipeline() {
    setFeedback(null);
    setIsRunningPipeline(true);

    try {
      const response = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ingestFresh: true,
          maxCandidates: 15,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        source?: "airtable" | "mock";
        result?: PipelineRunSummary;
        error?: string;
      };

      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error ?? "Unable to run the pipeline.");
      }

      setPipelineSummary(data.result);
      setFeedback({
        tone: data.source === "airtable" ? "success" : "warning",
        title: data.source === "airtable" ? "Pipeline completed" : "Mock pipeline completed",
        body: data.result.message,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Pipeline failed",
        body: error instanceof Error ? error.message : "Unable to run the pipeline.",
      });
    } finally {
      setIsRunningPipeline(false);
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
          <Button onClick={() => void handleRunIngestion(undefined, "all enabled sources")} disabled={isRunning}>
            {isRunning ? "Running..." : "Run all sources"}
          </Button>
          {feedSourceIds.length > 0 ? (
            <Button variant="secondary" onClick={() => void handleRunIngestion(feedSourceIds, "feed sources")} disabled={isRunning}>
              {isRunning ? "Running..." : "Run feed sources"}
            </Button>
          ) : null}
          {redditSourceIds.length > 0 ? (
            <Button variant="secondary" onClick={() => void handleRunIngestion(redditSourceIds, "Reddit sources")} disabled={isRunning}>
              {isRunning ? "Running..." : "Run Reddit sources"}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={handleBatchScoring} disabled={isRunning || isScoring}>
            {isScoring ? "Scoring..." : "Score new candidates"}
          </Button>
          <Button variant="secondary" onClick={handleRunPipeline} disabled={isRunning || isScoring || isRunningPipeline}>
            {isRunningPipeline ? "Running pipeline..." : "Run pipeline"}
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
            <CardDescription>
              {sources.length} enabled sources in the registry. {feedSourceIds.length} feed sources and {redditSourceIds.length} Reddit sources are currently available.
            </CardDescription>
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
                <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Last run scope:</span> {lastRunLabel}
                </div>
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {(["rss", "atom", "json", "reddit"] as const).map((kind) => {
                    const checked = result.sourcesCheckedByKind[kind];
                    const fetched = result.itemsFetchedByKind[kind];
                    const imported = result.itemsImportedByKind[kind];
                    const skipped = result.itemsSkippedDuplicatesByKind[kind];

                    if (checked === 0 && fetched === 0 && imported === 0 && skipped === 0) {
                      return null;
                    }

                    return (
                      <div key={kind} className="rounded-2xl bg-white/80 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{kind}</p>
                        <p className="mt-2 text-sm text-slate-600">
                          {checked} checked · {fetched} fetched
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {imported} imported · {skipped} skipped
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-3">
                  {result.sourceResults.map((source) => (
                    <div key={source.sourceId} className="rounded-2xl bg-white/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-950">{source.sourceName}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{source.kind}</p>
                        </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Batch Scoring</CardTitle>
          <CardDescription>
            Controlled scoring pass for newly imported records that still have missing evaluation fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!scoreSummary ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
              No batch scoring run has been executed in this session yet.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Processed</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{scoreSummary.processed}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Saved</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{scoreSummary.saved}</p>
                </div>
              </div>
              <div className="space-y-3">
                {scoreSummary.results.map((item) => (
                  <div key={item.recordId} className="rounded-2xl bg-white/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-950">{item.sourceTitle}</p>
                      <p className="text-sm text-slate-500">
                        {item.recommendation} · {item.reviewPriority}
                      </p>
                    </div>
                    {item.error ? (
                      <p className="mt-2 text-sm text-amber-700">{item.error}</p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        {item.persisted ? "Saved to the current data source." : "Preview only."}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Run</CardTitle>
          <CardDescription>
            Controlled chain: ingest, score, gate, interpret strong keepers, generate drafts only for high-priority keepers, then place everything back in the manual review flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!pipelineSummary ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
              No pipeline run has been executed in this session yet.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Imported</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{pipelineSummary.ingestion?.itemsImported ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Scored</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{pipelineSummary.candidatesScored}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Rejected</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{pipelineSummary.rejected}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Review-only</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{pipelineSummary.reviewOnly}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Interpreted</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{pipelineSummary.interpreted}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Generated</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{pipelineSummary.generated}</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Advanced Records</p>
                  {pipelineSummary.records.generated.length === 0 && pipelineSummary.records.interpreted.length === 0 ? (
                    <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
                      No records advanced past scoring in this run.
                    </div>
                  ) : (
                    <>
                      {pipelineSummary.records.generated.map((record) => (
                        <div key={record.recordId} className="rounded-2xl bg-white/80 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-slate-950">{record.sourceTitle}</p>
                            <p className="text-sm text-slate-500">Draft Generated</p>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{record.decisionSummary}</p>
                        </div>
                      ))}
                      {pipelineSummary.records.interpreted.map((record) => (
                        <div key={record.recordId} className="rounded-2xl bg-white/80 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-slate-950">{record.sourceTitle}</p>
                            <p className="text-sm text-slate-500">Interpreted</p>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{record.decisionSummary}</p>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Filtered Or Held</p>
                  {[...pipelineSummary.records.reviewOnly, ...pipelineSummary.records.rejected].length === 0 ? (
                    <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
                      No records were held or filtered in this run.
                    </div>
                  ) : (
                    [...pipelineSummary.records.reviewOnly, ...pipelineSummary.records.rejected].map((record) => (
                      <div key={record.recordId} className="rounded-2xl bg-white/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-slate-950">{record.sourceTitle}</p>
                          <p className="text-sm text-slate-500">
                            {record.recommendation} · {record.qualityGateResult}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{record.decisionSummary}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {pipelineSummary.errors.length > 0 ? (
                <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-800">
                  <p className="font-medium">Pipeline warnings</p>
                  <div className="mt-2 space-y-2">
                    {pipelineSummary.errors.map((error, index) => (
                      <p key={`${error.stage}-${error.recordId ?? error.sourceId ?? index}`}>
                        {error.stage}: {error.message}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
