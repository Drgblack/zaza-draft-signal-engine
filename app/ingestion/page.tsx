import { FactoryInputsPanel } from "@/components/factory/factory-inputs-panel";
import { IngestionRunner } from "@/components/ingestion/ingestion-runner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppConfig } from "@/lib/config";
import { listContentOpportunityState } from "@/lib/content-opportunities";
import { getSourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import { getVideoFactoryDiagnostics } from "@/lib/video-factory-diagnostics";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IngestionPage() {
  const config = getAppConfig();
  const mode = config.isAirtableConfigured ? "airtable" : "mock";
  const sourceRegistry = await getSourceAutopilotV2State();
  const factoryState = await listContentOpportunityState();
  const diagnostics = getVideoFactoryDiagnostics();
  const readyNowCount = factoryState.opportunities.filter(
    (item) => item.status === "open" && item.priority === "high" && item.trustRisk !== "high",
  ).length;
  const highRiskCount = factoryState.opportunities.filter(
    (item) => item.status === "open" && item.trustRisk === "high",
  ).length;
  const highCommercialCount = factoryState.opportunities.filter(
    (item) => item.status === "open" && item.commercialPotential === "high",
  ).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={mode === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {mode === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Ingestion</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Controlled front door for candidate signals. This run fetches enabled structured feeds, bounded Reddit discussion sources, and curated query sources, normalises items, prevents obvious re-imports, and saves new candidates for human review.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-slate-600">
          Imported items enter the normal workflow as new signals. This page now supports bounded feed ingestion, bounded Reddit ingestion, bounded curated-query ingestion, a controlled pipeline run, and an autonomous approval queue run that can push strong records toward approval-ready while holding weaker ones back for human judgement. Source settings below let the operator cap noisy sources without changing the downstream pipeline.
        </CardContent>
      </Card>

      <IngestionRunner
        sources={sourceRegistry.sources}
        proposals={sourceRegistry.proposals}
        proposalSummary={sourceRegistry.proposalSummary}
        recentProposalChanges={sourceRegistry.recentChanges}
        mode={mode}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              Factory operator tools
            </Badge>
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">
              Snapshot {formatDateTime(factoryState.generatedAt)}
            </Badge>
          </div>
          <CardTitle className="text-2xl">Video factory operator queue</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Diagnostics and queue controls for selecting briefs and checking production context now live here, separate from the founder-facing ZazaReel review surface.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white/84 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Open</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{factoryState.openCount}</p>
          <p className="mt-1 text-sm text-slate-600">Opportunities still waiting for a production decision.</p>
        </div>
        <div className="rounded-2xl bg-white/84 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ready now</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{readyNowCount}</p>
          <p className="mt-1 text-sm text-slate-600">High-priority opportunities without high trust risk.</p>
        </div>
        <div className="rounded-2xl bg-white/84 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">High commercial potential</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{highCommercialCount}</p>
          <p className="mt-1 text-sm text-slate-600">Signals that look commercially promising enough to review first.</p>
        </div>
        <div className="rounded-2xl bg-white/84 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Trust-risk flagged</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{highRiskCount}</p>
          <p className="mt-1 text-sm text-slate-600">Never promoted as top ready-now items without clear flagging.</p>
        </div>
      </div>

      {factoryState.topSummary.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-3">
          {factoryState.topSummary.slice(0, 3).map((summary) => (
            <div
              key={summary}
              className="rounded-2xl bg-white/84 px-4 py-4 text-sm leading-6 text-slate-700"
            >
              {summary}
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              className={
                diagnostics.status === "ready"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : diagnostics.status === "degraded"
                    ? "bg-amber-50 text-amber-700 ring-amber-200"
                    : "bg-rose-50 text-rose-700 ring-rose-200"
              }
            >
              Factory {diagnostics.status}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              Mode {diagnostics.providerMode}
            </Badge>
          </div>
          <CardTitle>Factory diagnostics</CardTitle>
          <CardDescription>
            Provider configuration, Blob readiness, and composition assumptions for the operator workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {diagnostics.checks.map((check) => (
              <div key={check.key} className="rounded-2xl bg-white/84 px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{check.label}</p>
                  <Badge
                    className={
                      check.status === "ready"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : check.status === "degraded"
                          ? "bg-amber-50 text-amber-700 ring-amber-200"
                          : "bg-rose-50 text-rose-700 ring-rose-200"
                    }
                  >
                    {check.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {check.configured ? "Configured" : "Not configured"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {check.messages[0]}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Checked {formatDateTime(diagnostics.checkedAt)}. Route: <span className="font-mono">/api/factory-inputs/diagnostics</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Video brief queue</CardTitle>
          <CardDescription>
            Operator-facing controls for selecting briefs and checking production context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FactoryInputsPanel key={factoryState.generatedAt} initialState={factoryState} />
        </CardContent>
      </Card>
    </div>
  );
}
