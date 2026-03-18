import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { SignalsTable } from "@/components/signals/signals-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const { signals, source, error } = await listSignalsWithFallback();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Signals</CardTitle>
          <CardDescription className="max-w-2xl text-base leading-7">
            Shared view across mock and Airtable-backed records. V1 keeps this intentionally lean: table visibility, not advanced filtering or analytics.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-0 text-sm text-slate-600">
          <Badge className={source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
            {source === "airtable" ? "Airtable" : "Mock mode"}
          </Badge>
          <span>Total records: {signals.length}</span>
          {error ? (
            <span className="text-amber-700">
              {error}{" "}
              <Link href="/api/signals/health" target="_blank" className="underline underline-offset-4">
                View diagnostics
              </Link>
            </span>
          ) : (
            <span>{source === "airtable" ? "Live records from Airtable." : "Using mock records because Airtable is not configured."}</span>
          )}
        </CardContent>
      </Card>

      <SignalsTable
        signals={signals}
        title="Signal Registry"
        description="Status, classification, draft readiness, and timing cues in one place."
      />
    </div>
  );
}
