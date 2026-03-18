import { IngestionRunner } from "@/components/ingestion/ingestion-runner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppConfig } from "@/lib/config";
import { INGESTION_SOURCES } from "@/lib/ingestion/sources";

export const dynamic = "force-dynamic";

export default function IngestionPage() {
  const config = getAppConfig();
  const mode = config.isAirtableConfigured ? "airtable" : "mock";

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
            Controlled front door for candidate signals. This run fetches enabled structured feeds, normalises items, prevents obvious re-imports, and saves new candidates for human review.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-slate-600">
          No interpretation, generation, or scoring automation runs here yet. Imported items enter the normal workflow as new signals.
        </CardContent>
      </Card>

      <IngestionRunner sources={INGESTION_SOURCES.filter((source) => source.enabled)} mode={mode} />
    </div>
  );
}
