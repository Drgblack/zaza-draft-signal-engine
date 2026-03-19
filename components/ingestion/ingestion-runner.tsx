"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { IngestionRunSummary, IngestionSourceKind, ManagedIngestionSource } from "@/lib/ingestion/types";
import type { PipelineRunSummary } from "@/lib/pipeline";
import type { IngestApiResponse, SourceRegistryResponse, UpdateSourceRegistryResponse } from "@/types/api";

type ResultTone = "success" | "warning" | "error";
type SourceFamily = "feed" | "reddit" | "query";

function toneClasses(tone: ResultTone) {
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

function getSourceFamily(kind: IngestionSourceKind): SourceFamily {
  if (kind === "reddit") {
    return "reddit";
  }

  if (kind === "query") {
    return "query";
  }

  return "feed";
}

function mergeSourceRecord(
  sources: ManagedIngestionSource[],
  updatedSource: ManagedIngestionSource,
): ManagedIngestionSource[] {
  return sources
    .map((source) => (source.id === updatedSource.id ? updatedSource : source))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function sourcePerformanceSummary(source: ManagedIngestionSource) {
  const parts = [
    `${source.performance.totalSignals} seen`,
    `${source.performance.keepSignals} keep`,
    `${source.performance.reviewSignals} review`,
    `${source.performance.interpretedSignals} interpreted`,
    `${source.performance.generatedSignals} generated`,
  ];

  if (source.performance.rejectedSignals > 0) {
    parts.push(`${source.performance.rejectedSignals} rejected`);
  }

  return parts.join(" · ");
}

function buildFamilySummary(result: IngestionRunSummary) {
  return {
    feed: {
      checked: result.sourcesCheckedByKind.rss + result.sourcesCheckedByKind.atom + result.sourcesCheckedByKind.json,
      fetched: result.itemsFetchedByKind.rss + result.itemsFetchedByKind.atom + result.itemsFetchedByKind.json,
      imported: result.itemsImportedByKind.rss + result.itemsImportedByKind.atom + result.itemsImportedByKind.json,
      skipped: result.itemsSkippedByKind.rss + result.itemsSkippedByKind.atom + result.itemsSkippedByKind.json,
    },
    reddit: {
      checked: result.sourcesCheckedByKind.reddit,
      fetched: result.itemsFetchedByKind.reddit,
      imported: result.itemsImportedByKind.reddit,
      skipped: result.itemsSkippedByKind.reddit,
    },
    query: {
      checked: result.sourcesCheckedByKind.query,
      fetched: result.itemsFetchedByKind.query,
      imported: result.itemsImportedByKind.query,
      skipped: result.itemsSkippedByKind.query,
    },
  };
}

export function IngestionRunner({
  sources,
  mode,
}: {
  sources: ManagedIngestionSource[];
  mode: "airtable" | "mock";
}) {
  const [managedSources, setManagedSources] = useState<ManagedIngestionSource[]>(sources);
  const [savedSources, setSavedSources] = useState<ManagedIngestionSource[]>(sources);
  const [isRunning, setIsRunning] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [savingSourceId, setSavingSourceId] = useState<string | null>(null);
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
    tone: ResultTone;
    title: string;
    body: string;
  } | null>(null);
  const [sourceFeedback, setSourceFeedback] = useState<{
    tone: ResultTone;
    title: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    setManagedSources(sources);
    setSavedSources(sources);
  }, [sources]);

  const enabledSources = useMemo(() => managedSources.filter((source) => source.enabled), [managedSources]);
  const redditSourceIds = useMemo(
    () => enabledSources.filter((source) => source.kind === "reddit").map((source) => source.id),
    [enabledSources],
  );
  const feedSourceIds = useMemo(
    () => enabledSources.filter((source) => ["rss", "atom", "json"].includes(source.kind)).map((source) => source.id),
    [enabledSources],
  );
  const querySourceIds = useMemo(
    () => enabledSources.filter((source) => source.kind === "query").map((source) => source.id),
    [enabledSources],
  );
  const familyCounts = useMemo(
    () =>
      managedSources.reduce(
        (counts, source) => {
          const family = getSourceFamily(source.kind);
          counts[family] += 1;
          return counts;
        },
        { feed: 0, reddit: 0, query: 0 } satisfies Record<SourceFamily, number>,
      ),
    [managedSources],
  );
  const hasUnsavedSourceChanges = useMemo(
    () =>
      managedSources.some((source) => {
        const saved = savedSources.find((item) => item.id === source.id);
        return (
          saved &&
          (saved.enabled !== source.enabled ||
            saved.maxItemsPerRun !== source.maxItemsPerRun ||
            saved.priority !== source.priority)
        );
      }),
    [managedSources, savedSources],
  );

  function updateSourceField<T extends keyof ManagedIngestionSource>(
    sourceId: string,
    field: T,
    value: ManagedIngestionSource[T],
  ) {
    setManagedSources((current) =>
      current.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              [field]: value,
            }
          : source,
      ),
    );
  }

  async function refreshSources() {
    const response = await fetch("/api/sources", {
      cache: "no-store",
    });
    const data = (await response.json()) as SourceRegistryResponse;

    if (!response.ok || !data.success || !data.sources) {
      throw new Error(data.error ?? "Unable to refresh source metrics.");
    }

    setManagedSources(data.sources);
    setSavedSources(data.sources);
  }

  async function handleSaveSource(source: ManagedIngestionSource) {
    setSourceFeedback(null);
    setSavingSourceId(source.id);

    try {
      const response = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: source.enabled,
          maxItemsPerRun: source.maxItemsPerRun,
          priority: source.priority,
        }),
      });

      const data = (await response.json()) as UpdateSourceRegistryResponse;

      if (!response.ok || !data.success || !data.sourceRecord) {
        throw new Error(data.error ?? "Unable to update source settings.");
      }

      setManagedSources((current) => mergeSourceRecord(current, data.sourceRecord!));
      setSavedSources((current) => mergeSourceRecord(current, data.sourceRecord!));
      setSourceFeedback({
        tone: "success",
        title: "Source settings updated",
        body: `${data.sourceRecord.name} now runs with a cap of ${data.sourceRecord.maxItemsPerRun} items per pass.`,
      });
    } catch (error) {
      setSourceFeedback({
        tone: "error",
        title: "Source update failed",
        body: error instanceof Error ? error.message : "Unable to update source settings.",
      });
    } finally {
      setSavingSourceId(null);
    }
  }

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

      const data = (await response.json()) as IngestApiResponse;

      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error ?? "Unable to run ingestion.");
      }

      setResult(data.result);
      await refreshSources();
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
      await refreshSources();
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
      await refreshSources();
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

  const latestFamilySummary = result ? buildFamilySummary(result) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Run Ingestion</CardTitle>
          <CardDescription>
            Fetch enabled sources, normalise candidate items, skip obvious duplicates, and save new records for human review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={() => void handleRunIngestion(undefined, "all enabled sources")}
              disabled={isRunning || hasUnsavedSourceChanges}
            >
              {isRunning ? "Running..." : "Run all sources"}
            </Button>
            {feedSourceIds.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => void handleRunIngestion(feedSourceIds, "feed sources")}
                disabled={isRunning || hasUnsavedSourceChanges}
              >
                {isRunning ? "Running..." : "Run feed sources"}
              </Button>
            ) : null}
            {redditSourceIds.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => void handleRunIngestion(redditSourceIds, "Reddit sources")}
                disabled={isRunning || hasUnsavedSourceChanges}
              >
                {isRunning ? "Running..." : "Run Reddit sources"}
              </Button>
            ) : null}
            {querySourceIds.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => void handleRunIngestion(querySourceIds, "query sources")}
                disabled={isRunning || hasUnsavedSourceChanges}
              >
                {isRunning ? "Running..." : "Run query sources"}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={handleBatchScoring} disabled={isRunning || isScoring || hasUnsavedSourceChanges}>
              {isScoring ? "Scoring..." : "Score new candidates"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleRunPipeline}
              disabled={isRunning || isScoring || isRunningPipeline || hasUnsavedSourceChanges}
            >
              {isRunningPipeline ? "Running pipeline..." : "Run pipeline"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <p>
              Current mode: <span className="font-medium text-slate-700">{mode === "airtable" ? "Airtable" : "Mock mode"}</span>
            </p>
            {hasUnsavedSourceChanges ? (
              <p className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                Save source changes before running ingestion or pipeline actions.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Source Registry</CardTitle>
            <CardDescription>
              {managedSources.length} configured sources. {familyCounts.feed} feed sources, {familyCounts.reddit} Reddit sources, and{" "}
              {familyCounts.query} query sources are available. Tune the mix here without changing the downstream pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sourceFeedback ? (
              <div className={`rounded-2xl px-4 py-3 text-sm ${toneClasses(sourceFeedback.tone)}`}>
                <p className="font-medium">{sourceFeedback.title}</p>
                <p className="mt-1">{sourceFeedback.body}</p>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="px-3 py-3 font-medium">Source</th>
                    <th className="px-3 py-3 font-medium">Kind</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Items / run</th>
                    <th className="px-3 py-3 font-medium">Priority</th>
                    <th className="px-3 py-3 font-medium">Useful signal hints</th>
                    <th className="px-3 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {managedSources.map((source) => {
                    const savedSource = savedSources.find((item) => item.id === source.id);
                    const isDirty =
                      !!savedSource &&
                      (savedSource.enabled !== source.enabled ||
                        savedSource.maxItemsPerRun !== source.maxItemsPerRun ||
                        savedSource.priority !== source.priority);

                    return (
                      <tr key={source.id} className="align-top">
                        <td className="px-3 py-4">
                          <p className="font-medium text-slate-950">{source.name}</p>
                          <p className="mt-1 text-slate-600">
                            {source.publisher} · {source.topic}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {source.kind === "query" && source.query ? `Query: ${source.query}` : source.notes ?? source.url}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                            {getSourceFamily(source.kind)}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <label className="flex items-center gap-2 text-slate-700">
                            <input
                              type="checkbox"
                              checked={source.enabled}
                              onChange={(event) => updateSourceField(source.id, "enabled", event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-[color:var(--accent)] focus:ring-[color:var(--accent-soft)]"
                            />
                            {source.enabled ? "Enabled" : "Disabled"}
                          </label>
                        </td>
                        <td className="px-3 py-4">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={source.maxItemsPerRun}
                            onChange={(event) =>
                              updateSourceField(
                                source.id,
                                "maxItemsPerRun",
                                Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                              )
                            }
                            className="h-10 w-24"
                          />
                        </td>
                        <td className="px-3 py-4">
                          <Select
                            value={source.priority}
                            onChange={(event) => updateSourceField(source.id, "priority", event.target.value as ManagedIngestionSource["priority"])}
                            className="h-10 min-w-28"
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                          </Select>
                        </td>
                        <td className="px-3 py-4 text-slate-600">
                          <p>{sourcePerformanceSummary(source)}</p>
                        </td>
                        <td className="px-3 py-4">
                          <Button
                            variant={isDirty ? "primary" : "secondary"}
                            onClick={() => void handleSaveSource(source)}
                            disabled={savingSourceId === source.id || !isDirty}
                          >
                            {savingSourceId === source.id ? "Saving..." : isDirty ? "Save" : "Saved"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latest Ingestion Result</CardTitle>
            <CardDescription>Compact source-by-source comparison for the most recent ingestion run.</CardDescription>
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
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Imported</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{result.itemsImported}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Fetched</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{result.itemsFetched}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Skipped</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{result.itemsSkipped}</p>
                  </div>
                </div>

                {latestFamilySummary ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {(["feed", "reddit", "query"] as const).map((family) => {
                      const metrics = latestFamilySummary[family];
                      if (metrics.checked === 0 && metrics.fetched === 0 && metrics.imported === 0 && metrics.skipped === 0) {
                        return null;
                      }

                      return (
                        <div key={family} className="rounded-2xl bg-white/80 px-4 py-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{family}</p>
                          <p className="mt-2 text-sm text-slate-600">
                            {metrics.checked} checked · {metrics.fetched} fetched
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {metrics.imported} imported · {metrics.skipped} skipped
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="space-y-3">
                  {result.sourceResults.map((source) => (
                    <div key={source.sourceId} className="rounded-2xl bg-white/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-950">{source.sourceName}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                            {getSourceFamily(source.kind)} · cap {source.maxItemsPerRun}
                          </p>
                        </div>
                        <p className="text-sm text-slate-500">
                          {source.itemsImported} imported · {source.itemsSkipped} skipped
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {source.itemsFetched} fetched · {source.itemsSkippedDuplicates} duplicate skips
                      </p>
                      {source.errors.length > 0 ? (
                        <p className="mt-2 text-sm text-amber-700">{source.errors.join(" ")}</p>
                      ) : null}
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
