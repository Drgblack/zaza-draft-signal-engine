import Link from "next/link";

import { WorkflowQueueSection } from "@/components/signals/workflow-queue-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { listFeedbackEntries } from "@/lib/feedback";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildSignalPostingSummary, indexPostingEntriesBySignalId, listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { getOperatorTuning } from "@/lib/tuning";
import { getScheduledSoonSignals, getWorkflowBuckets, sortSignals } from "@/lib/workflow";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { signals, source, error } = await listSignalsWithFallback();
  const feedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const playbookCards = await listPlaybookCards();
  const bundles = await listPatternBundles();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const tuning = await getOperatorTuning();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    signals,
    feedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    undefined,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning.settings,
  );
  const sortedSignals = sortSignals(signals, "createdDate-desc");
  const postingEntriesBySignalId = indexPostingEntriesBySignalId(postingEntries);
  const postingSummaryBySignalId = Object.fromEntries(
    sortedSignals.map((signal) => [
      signal.recordId,
      buildSignalPostingSummary(signal, postingEntriesBySignalId[signal.recordId] ?? []),
    ]),
  );
  const buckets = getWorkflowBuckets(sortedSignals);
  const scheduledSoon = getScheduledSoonSignals(sortedSignals);

  const queueSummary = [
    { label: "Needs interpretation", count: buckets.needsInterpretation.length, href: "#needs-interpretation" },
    { label: "Ready for generation", count: buckets.readyForGeneration.length, href: "#ready-for-generation" },
    { label: "Ready for review", count: buckets.readyForReview.length, href: "#ready-for-review" },
    { label: "Ready to schedule", count: buckets.readyToSchedule.length, href: "#ready-to-schedule" },
    { label: "Scheduled / awaiting posting", count: buckets.scheduledAwaitingPosting.length, href: "#scheduled-awaiting-posting" },
    { label: "Filtered out", count: buckets.filteredOut.length, href: "#filtered-out" },
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
            Operator queue for what needs attention next. It groups records by the actual editorial stages and now keeps subtle source-aware context visible so teacher discussion signals are easier to spot than generic sector coverage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      />

      <WorkflowQueueSection
        id="ready-for-generation"
        title="Ready For Generation"
        description="Signals with interpretation saved but no draft outputs yet."
        signals={buckets.readyForGeneration}
        emptyCopy="Nothing is queued for generation."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      />

      <WorkflowQueueSection
        id="ready-for-review"
        title="Ready For Review"
        description="Drafted records that need operator review, approval, or final refinements."
        signals={buckets.readyForReview}
        emptyCopy="No drafted records need review right now."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      />

      <WorkflowQueueSection
        id="ready-to-schedule"
        title="Approved / Ready To Schedule"
        description="Approved records that can be assigned a scheduled date."
        signals={buckets.readyToSchedule}
        emptyCopy="No approved records are waiting for scheduling."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      />

      <WorkflowQueueSection
        id="scheduled-awaiting-posting"
        title="Scheduled / Awaiting Posting"
        description="Records already scheduled and waiting to be logged as posted."
        signals={buckets.scheduledAwaitingPosting}
        emptyCopy="No scheduled records are waiting to be posted."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      />

      <WorkflowQueueSection
        id="filtered-out"
        title="Filtered Out"
        description="Signals the scoring layer marked as reject or quality-gate fail. These stay visible for auditability without crowding the active queue."
        signals={buckets.filteredOut}
        emptyCopy="No signals are currently filtered out by the scoring gate."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      />
    </div>
  );
}
