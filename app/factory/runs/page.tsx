import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildFactoryProviderRunBenchmarkReport } from "@/lib/video-factory-provider-benchmarks";
import {
  listFactoryRunsObservability,
  type FactoryRunObservabilityItem,
} from "@/lib/video-factory-runs";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function lifecycleTone(status: string) {
  if (status === "accepted") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "review_pending" || status === "pending_review") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (status === "failed" || status === "failed_permanent" || status === "rejected") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (status === "discarded") {
    return "bg-slate-100 text-slate-700 ring-slate-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function qcTone(passed: boolean | null) {
  if (passed === true) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (passed === false) {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function formatUsd(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "Not captured";
  }

  return `$${value.toFixed(2)}`;
}

function formatRate(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "Not enough data";
  }

  return `${Math.round(value * 1000) / 10}%`;
}

function formatDuration(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "Not captured";
  }

  const totalMinutes = Math.round(value / 6000) / 10;
  return `${totalMinutes.toFixed(1)} min`;
}

function evidenceTone(level: "low_sample" | "directional" | "usable") {
  if (level === "usable") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (level === "directional") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function providerLabel(item: FactoryRunObservabilityItem) {
  const providers = [
    item.providerSet.renderProvider,
    item.providerSet.narrationProvider,
    ...item.providerSet.visualProviders,
    item.providerSet.captionProvider,
    item.providerSet.compositionProvider,
  ].filter((provider, index, all): provider is string => Boolean(provider) && all.indexOf(provider) === index);

  return providers.length > 0 ? providers.join(" / ") : "Not captured";
}

function defaultsLabel(item: FactoryRunObservabilityItem) {
  if (!item.defaultsProfileId) {
    return "Not captured";
  }

  return item.defaultsVersion
    ? `${item.defaultsProfileId} · v${item.defaultsVersion}`
    : item.defaultsProfileId;
}

function qcLabel(item: FactoryRunObservabilityItem) {
  if (item.qcSummary.passed === true) {
    return `Passed${item.qcSummary.sceneCount ? ` · ${item.qcSummary.sceneCount} scenes` : ""}`;
  }

  if (item.qcSummary.passed === false) {
    return "Failed";
  }

  return "Not checked";
}

function reviewLabel(item: FactoryRunObservabilityItem) {
  const status = item.reviewOutcome.status;

  if (!status) {
    return "No review recorded";
  }

  if (status === "pending_review" || status === "review_pending") {
    return "Pending review";
  }

  return status.replace(/_/g, " ");
}

function ArtifactPill({
  label,
  present,
}: {
  label: string;
  present: boolean;
}) {
  return (
    <span
      className={
        present
          ? "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
          : "inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
      }
    >
      {label}
    </span>
  );
}

export default async function FactoryRunsPage() {
  const observability = await listFactoryRunsObservability();
  const benchmarkReport = buildFactoryProviderRunBenchmarkReport({
    runs: observability.items,
    generatedAt: observability.generatedAt,
  });

  return (
    <div className="space-y-6 bg-[#F6F4EF]">
      <Card className="bg-white/78">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              Factory runs
            </Badge>
            <Badge className="bg-stone-100 text-stone-700 ring-stone-200">
              Past {observability.lookbackDays} days
            </Badge>
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">
              Snapshot {formatDateTime(observability.generatedAt)}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Factory Runs</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Calm operator-facing visibility into recent factory execution, retries,
            defaults usage, quality checks, and failures without leaving the current
            workflow data model.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link
            href="/factory-inputs"
            className="rounded-full border border-black/6 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Open ZazaReel
          </Link>
          <Link
            href="/insights"
            className="rounded-full border border-black/6 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Open insights
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Runs</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{observability.runCount}</p>
          <p className="mt-1 text-sm text-slate-600">Ledger-backed runs and current in-flight work.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Active</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{observability.activeCount}</p>
          <p className="mt-1 text-sm text-slate-600">Current attempts that have not reached a terminal ledger state.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Pending review</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{observability.pendingReviewCount}</p>
          <p className="mt-1 text-sm text-slate-600">Rendered outputs waiting for operator review.</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Failures</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{observability.failedCount}</p>
          <p className="mt-1 text-sm text-slate-600">Runs that terminated at failed or failed-permanent.</p>
        </div>
      </div>

      <Card className="bg-white/74">
        <CardHeader>
          <CardTitle>Provider comparisons</CardTitle>
          <CardDescription>
            Descriptive benchmark rollups from recent runs. Low-sample rows are labeled
            explicitly so weak evidence is not overstated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {benchmarkReport.providerSummaries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/8 bg-white/70 px-4 py-5 text-sm leading-6 text-slate-500">
              No provider-backed runs are available yet for comparison.
            </div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-3">
                {benchmarkReport.providerSummaries.map((summary) => (
                  <div
                    key={summary.provider}
                    className="rounded-2xl border border-black/5 bg-[color:var(--panel-strong)]/80 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{summary.provider}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {summary.runCount} runs · {summary.terminalRunCount} terminal
                        </p>
                      </div>
                      <Badge className={evidenceTone(summary.evidence.level)}>
                        {summary.evidence.label}
                      </Badge>
                    </div>

                    <dl className="mt-4 grid gap-3 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Approval rate</dt>
                        <dd className="text-right font-medium text-slate-900">
                          {formatRate(summary.approvalRate)}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Regeneration rate</dt>
                        <dd className="text-right font-medium text-slate-900">
                          {formatRate(summary.regenerationRate)}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Average retries</dt>
                        <dd className="text-right font-medium text-slate-900">
                          {summary.averageRetries.toFixed(2)}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Average cost</dt>
                        <dd className="text-right font-medium text-slate-900">
                          {formatUsd(summary.averageCostUsd)}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-slate-500">Time to terminal</dt>
                        <dd className="text-right font-medium text-slate-900">
                          {formatDuration(summary.averageTimeToTerminalMs)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4 space-y-2 text-xs text-slate-600">
                      <p>
                        Defaults versions:{" "}
                        {summary.defaultsVersions.length > 0
                          ? summary.defaultsVersions.map((version) => `v${version}`).join(", ")
                          : "Not captured"}
                      </p>
                      <p>
                        Formats:{" "}
                        {summary.formats.length > 0
                          ? summary.formats.join(", ")
                          : "Not captured"}
                      </p>
                      <p>
                        Trust:{" "}
                        {summary.trustStatuses.length > 0
                          ? summary.trustStatuses.join(", ")
                          : "Not captured"}
                        {summary.adjustedCount > 0
                          ? ` · adjusted ${summary.adjustedCount}x`
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.5rem] border border-black/5 bg-white/70">
                <div className="border-b border-black/5 px-5 py-3">
                  <p className="text-sm font-semibold text-slate-950">A/B-ready cuts</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Grouped by provider, defaults version, format, and trust state for
                    practical side-by-side inspection.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[920px]">
                    <div className="grid grid-cols-[1.05fr_0.75fr_0.85fr_0.9fr_0.55fr_0.75fr_0.75fr_0.7fr_0.85fr_0.9fr_1fr] gap-4 border-b border-black/5 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                      <span>Provider</span>
                      <span>Defaults</span>
                      <span>Format</span>
                      <span>Trust</span>
                      <span>Runs</span>
                      <span>Approval</span>
                      <span>Regen</span>
                      <span>Retries</span>
                      <span>Terminal</span>
                      <span>Cost</span>
                      <span>Evidence</span>
                    </div>
                    <div className="divide-y divide-black/5">
                      {benchmarkReport.comparisonGroups.slice(0, 12).map((group) => (
                        <div
                          key={group.groupKey}
                          className="grid grid-cols-[1.05fr_0.75fr_0.85fr_0.9fr_0.55fr_0.75fr_0.75fr_0.7fr_0.85fr_0.9fr_1fr] gap-4 px-5 py-3 text-sm text-slate-700"
                        >
                          <span className="font-medium text-slate-950">{group.provider}</span>
                          <span>{group.defaultsVersion ? `v${group.defaultsVersion}` : "None"}</span>
                          <span>{group.format ?? "None"}</span>
                          <span>
                            {group.trustStatus ?? "None"}
                            {group.trustAdjusted === true
                              ? " · adjusted"
                              : group.trustAdjusted === false
                                ? " · clean"
                                : ""}
                          </span>
                          <span>{group.runCount}</span>
                          <span>{formatRate(group.approvalRate)}</span>
                          <span>{formatRate(group.regenerationRate)}</span>
                          <span>{group.averageRetries.toFixed(2)}</span>
                          <span>{formatDuration(group.averageTimeToTerminalMs)}</span>
                          <span>{formatUsd(group.averageCostUsd)}</span>
                          <span>
                            <Badge className={evidenceTone(group.evidence.level)}>
                              {group.evidence.label}
                            </Badge>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white/74">
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>
            Summary list with expandable run details. Defaults version is shown only when
            the current persisted render snapshot still carries it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {observability.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/8 bg-white/70 px-4 py-5 text-sm leading-6 text-slate-500">
              No factory runs were found in the current {observability.lookbackDays}-day window.
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-black/5 bg-white/70">
              <div className="hidden border-b border-black/5 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 xl:grid xl:grid-cols-[1.8fr_0.9fr_1.35fr_1.1fr_0.7fr_0.95fr_1fr_1fr] xl:gap-4">
                <span>Run</span>
                <span>Status</span>
                <span>Providers</span>
                <span>Defaults</span>
                <span>Retries</span>
                <span>QC</span>
                <span>Created</span>
                <span>Updated</span>
              </div>
              <div className="divide-y divide-black/5">
                {observability.items.map((item, index) => (
                  <details
                    key={item.id}
                    className="group px-5 py-4"
                    open={item.isActive || index === 0}
                  >
                    <summary className="list-none cursor-pointer">
                      <div className="grid gap-4 xl:grid-cols-[1.8fr_0.9fr_1.35fr_1.1fr_0.7fr_0.95fr_1fr_1fr] xl:items-center">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-950">{item.opportunityTitle}</p>
                            {item.isActive ? (
                              <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
                                In flight
                              </Badge>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="font-mono">{item.factoryJobId}</span>
                            <span>Brief {item.videoBriefId ?? "Not set"}</span>
                            <span>{item.briefTitle ?? "No brief title"}</span>
                            {item.finalScriptTrustScore !== null ? (
                              <span>Final script trust {item.finalScriptTrustScore}/100</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={lifecycleTone(item.lifecycleStatus)}>
                            {item.lifecycleStatus.replace(/_/g, " ")}
                          </Badge>
                        </div>

                        <div className="text-sm text-slate-700">{providerLabel(item)}</div>
                        <div className="text-sm text-slate-700">{defaultsLabel(item)}</div>
                        <div className="text-sm text-slate-700">
                          {item.retryCount}
                          {item.retryExhausted ? " · exhausted" : ""}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={qcTone(item.qcSummary.passed)}>
                            {qcLabel(item)}
                          </Badge>
                        </div>
                        <div className="text-sm text-slate-600">{formatDateTime(item.createdAt)}</div>
                        <div className="text-sm text-slate-600">{formatDateTime(item.updatedAt)}</div>
                      </div>
                    </summary>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-black/5 bg-[color:var(--panel-strong)]/80 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-950">Stage timeline</p>
                            <Link
                              href={`/factory-inputs?opportunityId=${item.opportunityId}`}
                              className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline"
                            >
                              Open in ZazaReel
                            </Link>
                          </div>
                          <div className="mt-3 space-y-2">
                            {item.timeline.length > 0 ? (
                              item.timeline.map((transition) => (
                                <div
                                  key={`${item.id}:${transition.status}:${transition.at}`}
                                  className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-3 py-2 text-sm"
                                >
                                  <span className="font-medium text-slate-800">
                                    {transition.status.replace(/_/g, " ")}
                                  </span>
                                  <span className="text-slate-500">{formatDateTime(transition.at)}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-slate-500">No stage transitions recorded.</p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-black/5 bg-[color:var(--panel-strong)]/80 p-4">
                          <p className="text-sm font-semibold text-slate-950">Artifact presence</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <ArtifactPill label="Rendered asset" present={item.artifactSummary.hasRenderedAsset} />
                            <ArtifactPill label="Narration" present={item.artifactSummary.hasNarration} />
                            <ArtifactPill label="Captions" present={item.artifactSummary.hasCaptions} />
                            <ArtifactPill label="Composed video" present={item.artifactSummary.hasComposedVideo} />
                            <ArtifactPill label="Thumbnail" present={item.artifactSummary.hasThumbnail} />
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                              Visual assets {item.artifactSummary.visualAssetCount}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                              Artifact IDs {item.artifactSummary.artifactCount}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-black/5 bg-[color:var(--panel-strong)]/80 p-4">
                          <p className="text-sm font-semibold text-slate-950">Run summary</p>
                          <dl className="mt-3 grid gap-3 text-sm">
                            <div className="flex items-start justify-between gap-4">
                              <dt className="text-slate-500">Estimated cost</dt>
                              <dd className="text-right font-medium text-slate-900">{formatUsd(item.estimatedCostUsd)}</dd>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                              <dt className="text-slate-500">Actual cost</dt>
                              <dd className="text-right font-medium text-slate-900">{formatUsd(item.actualCostUsd)}</dd>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                              <dt className="text-slate-500">Review outcome</dt>
                              <dd className="text-right font-medium text-slate-900">{reviewLabel(item)}</dd>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                              <dt className="text-slate-500">Final script trust</dt>
                              <dd className="text-right font-medium text-slate-900">
                                {item.finalScriptTrustScore !== null
                                  ? `${item.finalScriptTrustScore}/100`
                                  : "Not captured"}
                              </dd>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                              <dt className="text-slate-500">Reasons</dt>
                              <dd className="max-w-[16rem] text-right text-slate-700">
                                {item.reviewOutcome.reasonCodes.length > 0
                                  ? item.reviewOutcome.reasonCodes.join(", ")
                                  : "None recorded"}
                              </dd>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                              <dt className="text-slate-500">Review notes</dt>
                              <dd className="max-w-[16rem] text-right text-slate-700">
                                {item.reviewOutcome.notes ?? "None recorded"}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        <div className="rounded-2xl border border-black/5 bg-[color:var(--panel-strong)]/80 p-4">
                          <p className="text-sm font-semibold text-slate-950">Failure surface</p>
                          {item.failureStage || item.failureMessage ? (
                            <div className="mt-3 rounded-2xl bg-rose-50/70 px-3 py-3 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
                              <p className="font-medium">
                                {item.failureStage
                                  ? item.failureStage.replace(/_/g, " ")
                                  : "Failure recorded"}
                              </p>
                              <p className="mt-1 leading-6">
                                {item.failureMessage ?? "No failure message recorded."}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-3 text-sm leading-6 text-slate-500">
                              No failure stage or error message recorded for this run.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
