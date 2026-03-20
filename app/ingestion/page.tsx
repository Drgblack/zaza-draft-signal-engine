import { IngestionRunner } from "@/components/ingestion/ingestion-runner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppConfig } from "@/lib/config";
import { getSourceAutopilotV2State } from "@/lib/source-autopilot-v2";

export const dynamic = "force-dynamic";

export default async function IngestionPage() {
  const config = getAppConfig();
  const mode = config.isAirtableConfigured ? "airtable" : "mock";
  const sourceRegistry = await getSourceAutopilotV2State();

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
    </div>
  );
}
