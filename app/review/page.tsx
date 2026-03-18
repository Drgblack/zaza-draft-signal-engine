import Link from "next/link";

import { WorkflowQueueSection } from "@/components/signals/workflow-queue-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { getScheduledSoonSignals, getWorkflowBuckets, sortSignals } from "@/lib/workflow";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { signals, source, error } = await listSignalsWithFallback();
  const sortedSignals = sortSignals(signals, "createdDate-desc");
  const buckets = getWorkflowBuckets(sortedSignals);
  const scheduledSoon = getScheduledSoonSignals(sortedSignals);

  const queueSummary = [
    { label: "Needs interpretation", count: buckets.needsInterpretation.length, href: "#needs-interpretation" },
    { label: "Ready for generation", count: buckets.readyForGeneration.length, href: "#ready-for-generation" },
    { label: "Ready for review", count: buckets.readyForReview.length, href: "#ready-for-review" },
    { label: "Ready to schedule", count: buckets.readyToSchedule.length, href: "#ready-to-schedule" },
    { label: "Scheduled / awaiting posting", count: buckets.scheduledAwaitingPosting.length, href: "#scheduled-awaiting-posting" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Review Queue</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Operator queue for what needs attention next. It groups records by the actual editorial stages rather than leaving review as a placeholder page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {queueSummary.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{item.count}</p>
              </Link>
            ))}
          </div>
          {error ? <p className="text-sm text-amber-700">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled Soon</CardTitle>
          <CardDescription>Records already scheduled in the next seven days.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {scheduledSoon.length === 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">Nothing is scheduled in the next seven days.</div>
          ) : (
            scheduledSoon.map((signal) => (
              <div key={signal.recordId} className="flex flex-col gap-3 rounded-2xl bg-white/80 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link href={`/signals/${signal.recordId}`} className="font-medium text-slate-950 hover:text-[color:var(--accent)]">
                    {signal.sourceTitle}
                  </Link>
                  <p className="mt-1 text-sm text-slate-600">{signal.platformPriority ?? "Platform not set"}</p>
                </div>
                <p className="text-sm text-slate-500">{formatDateTime(signal.scheduledDate)}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <WorkflowQueueSection
        id="needs-interpretation"
        title="Needs Interpretation"
        description="New records or records still missing the structured editorial judgement layer."
        signals={buckets.needsInterpretation}
        emptyCopy="No signals are waiting on interpretation."
      />

      <WorkflowQueueSection
        id="ready-for-generation"
        title="Ready For Generation"
        description="Signals with interpretation saved but no draft outputs yet."
        signals={buckets.readyForGeneration}
        emptyCopy="Nothing is queued for generation."
      />

      <WorkflowQueueSection
        id="ready-for-review"
        title="Ready For Review"
        description="Drafted records that need operator review, approval, or final refinements."
        signals={buckets.readyForReview}
        emptyCopy="No drafted records need review right now."
      />

      <WorkflowQueueSection
        id="ready-to-schedule"
        title="Approved / Ready To Schedule"
        description="Approved records that can be assigned a scheduled date."
        signals={buckets.readyToSchedule}
        emptyCopy="No approved records are waiting for scheduling."
      />

      <WorkflowQueueSection
        id="scheduled-awaiting-posting"
        title="Scheduled / Awaiting Posting"
        description="Records already scheduled and waiting to be logged as posted."
        signals={buckets.scheduledAwaitingPosting}
        emptyCopy="No scheduled records are waiting to be posted."
      />
    </div>
  );
}
