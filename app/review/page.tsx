import { StatusBadge } from "@/components/signals/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { signals, source } = await listSignalsWithFallback();
  const reviewSignals = signals.filter((signal) => ["Reviewed", "Approved", "Scheduled"].includes(signal.status));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Review</CardTitle>
          <CardDescription className="max-w-2xl text-base leading-7">
            Shell for the future review workflow. For now it highlights records already in reviewed, approved, or scheduled states and keeps the experience intentional.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-slate-600">Current data source: {source === "airtable" ? "Airtable" : "Mock fallback"}.</CardContent>
      </Card>

      <div className="grid gap-4">
        {reviewSignals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-slate-500">Nothing is in the review queue yet.</CardContent>
          </Card>
        ) : (
          reviewSignals.map((signal) => (
            <Card key={signal.recordId}>
              <CardContent className="flex flex-col gap-4 py-6 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={signal.status} />
                    <span className="text-sm text-slate-500">{signal.platformPriority ?? "Platform not set"}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-950">{signal.sourceTitle}</h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    {signal.reviewNotes ?? signal.manualSummary ?? signal.rawExcerpt ?? "No review notes added yet."}
                  </p>
                </div>
                <div className="min-w-52 rounded-2xl bg-white/70 p-4 text-sm text-slate-600">
                  <p>Created {formatDateTime(signal.createdDate)}</p>
                  <p className="mt-2">
                    {signal.scheduledDate ? `Scheduled ${formatDateTime(signal.scheduledDate)}` : "No scheduled date yet"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
