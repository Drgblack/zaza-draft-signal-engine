import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryBadge } from "@/components/signals/category-badge";
import { SeverityBadge } from "@/components/signals/severity-badge";
import { SignalWorkflowPanel } from "@/components/signals/signal-workflow-panel";
import { StatusBadge } from "@/components/signals/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deriveDisplayEngagementScore, getSignalWithFallback } from "@/lib/airtable";
import { compactNumber, formatDate, formatDateTime } from "@/lib/utils";
import { getAutomationReadinessSnapshot, hasGeneration, hasInterpretation } from "@/lib/workflow";

export const dynamic = "force-dynamic";

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function formatBooleanValue(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "Not set";
  }

  return value ? "Yes" : "No";
}

function formatScoreValue(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "Not set";
  }

  return value.toString();
}

export default async function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getSignalWithFallback(id);

  if (!result.signal) {
    notFound();
  }

  const signal = result.signal;
  const interpretationReady = hasInterpretation(signal);
  const generationReady = hasGeneration(signal);
  const automationReadiness = getAutomationReadinessSnapshot(signal);
  const readinessTone =
    automationReadiness.tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : automationReadiness.tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-700";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={result.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {result.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <StatusBadge status={signal.status} />
            <CategoryBadge category={signal.signalCategory} />
            <SeverityBadge severity={signal.severityScore} />
          </div>
          <CardTitle className="text-3xl">{signal.sourceTitle}</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            One record-level workbench for source context, interpretation, draft outputs, and the final workflow actions that move a signal through review, scheduling, and posting.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-0">
          <Link href="/signals" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to signals
          </Link>
          <Link href={`/signals/${signal.recordId}/interpret`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {interpretationReady ? "Review interpretation" : "Interpret"}
          </Link>
          <Link href={`/signals/${signal.recordId}/generate`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {generationReady ? "Review drafts" : "Generate drafts"}
          </Link>
          <Link href="/review" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open review queue
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Source Context</CardTitle>
              <CardDescription>The operator-facing source inputs that anchor interpretation and generation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem label="Created" value={formatDateTime(signal.createdDate)} />
                <SummaryItem label="Created By" value={signal.createdBy ?? "Not set"} />
                <SummaryItem label="Source Type" value={signal.sourceType ?? "Not set"} />
                <SummaryItem label="Source Publisher" value={signal.sourcePublisher ?? "Not set"} />
                <SummaryItem label="Source Date" value={formatDate(signal.sourceDate)} />
                <SummaryItem label="Engagement" value={compactNumber(deriveDisplayEngagementScore(signal))} />
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Raw Excerpt</p>
                <p className="rounded-2xl bg-white/75 p-4 text-sm leading-6 text-slate-700">
                  {signal.rawExcerpt ?? "No raw excerpt recorded."}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Manual Summary</p>
                <p className="rounded-2xl bg-white/75 p-4 text-sm leading-6 text-slate-700">
                  {signal.manualSummary ?? "No manual summary recorded."}
                </p>
              </div>
              {signal.sourceUrl ? (
                <Link href={signal.sourceUrl} target="_blank" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                  Open original source
                </Link>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Automation Readiness</CardTitle>
              <CardDescription>
                Schema-ready metadata for future ingestion, scoring, deduplication, and queue prioritisation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className={`inline-flex rounded-2xl px-3 py-2 text-sm font-medium ${readinessTone}`}>
                {automationReadiness.label} · {automationReadiness.completedChecks}/{automationReadiness.totalChecks} signals present
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem label="Ingestion Source" value={signal.ingestionSource ?? "Not set"} />
                <SummaryItem label="Ingestion Method" value={signal.ingestionMethod ?? "Not set"} />
                <SummaryItem label="Signal Relevance Score" value={formatScoreValue(signal.signalRelevanceScore)} />
                <SummaryItem label="Signal Novelty Score" value={formatScoreValue(signal.signalNoveltyScore)} />
                <SummaryItem label="Signal Urgency Score" value={formatScoreValue(signal.signalUrgencyScore)} />
                <SummaryItem label="Brand Fit Score" value={formatScoreValue(signal.brandFitScore)} />
                <SummaryItem label="Source Trust Score" value={formatScoreValue(signal.sourceTrustScore)} />
                <SummaryItem label="Keep / Reject" value={signal.keepRejectRecommendation ?? "Not set"} />
                <SummaryItem label="Quality Gate Result" value={signal.qualityGateResult ?? "Not set"} />
                <SummaryItem label="Review Priority" value={signal.reviewPriority ?? "Not set"} />
                <SummaryItem label="Auto-Generated?" value={formatBooleanValue(signal.autoGenerated)} />
                <SummaryItem label="Needs Human Review" value={formatBooleanValue(signal.needsHumanReview)} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem label="Duplicate Cluster ID" value={signal.duplicateClusterId ?? "Not set"} />
                <SummaryItem
                  label="Similarity To Existing Content"
                  value={formatScoreValue(signal.similarityToExistingContent)}
                />
              </div>
              <SummaryItem label="Why Selected" value={signal.whySelected ?? "Not set"} />
              <SummaryItem label="Why Rejected" value={signal.whyRejected ?? "Not set"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interpretation Summary</CardTitle>
              <CardDescription>
                {interpretationReady
                  ? "Current editorial interpretation saved to the record."
                  : "Interpretation has not been completed yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {interpretationReady ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SummaryItem label="Signal Subtype" value={signal.signalSubtype ?? "Not set"} />
                    <SummaryItem label="Emotional Pattern" value={signal.emotionalPattern ?? "Not set"} />
                    <SummaryItem label="Relevance" value={signal.relevanceToZazaDraft ?? "Not set"} />
                    <SummaryItem label="Hook Template" value={signal.hookTemplateUsed ?? "Not set"} />
                    <SummaryItem label="Platform Priority" value={signal.platformPriority ?? "Not set"} />
                    <SummaryItem label="Format Priority" value={signal.suggestedFormatPriority ?? "Not set"} />
                  </div>
                  <SummaryItem label="Teacher Pain Point" value={signal.teacherPainPoint ?? "Not set"} />
                  <SummaryItem label="Risk to Teacher" value={signal.riskToTeacher ?? "Not set"} />
                  <SummaryItem label="Content Angle" value={signal.contentAngle ?? "Not set"} />
                  <SummaryItem label="Interpretation Notes" value={signal.interpretationNotes ?? "Not set"} />
                </>
              ) : (
                <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
                  This signal still needs interpretation before draft generation and workflow review make sense.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Draft Summary</CardTitle>
              <CardDescription>
                {generationReady
                  ? "Current draft outputs and publishing metadata on the record."
                  : "Draft generation has not been completed yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {generationReady ? (
                <>
                  <SummaryItem label="X Draft" value={signal.xDraft ?? "Not set"} />
                  <SummaryItem label="LinkedIn Draft" value={signal.linkedInDraft ?? "Not set"} />
                  <SummaryItem label="Reddit Draft" value={signal.redditDraft ?? "Not set"} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <SummaryItem label="Scheduled Date" value={formatDateTime(signal.scheduledDate)} />
                    <SummaryItem label="Posted Date" value={formatDateTime(signal.postedDate)} />
                    <SummaryItem label="Platform Posted To" value={signal.platformPostedTo ?? "Not set"} />
                    <SummaryItem label="Post URL" value={signal.postUrl ?? "Not set"} />
                  </div>
                </>
              ) : (
                <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
                  Draft assets have not been saved yet. Complete interpretation, then move into generation.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <SignalWorkflowPanel signal={signal} source={result.source} />
      </div>
    </div>
  );
}
