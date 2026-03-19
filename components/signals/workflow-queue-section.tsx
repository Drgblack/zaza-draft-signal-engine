import Link from "next/link";

import { CategoryBadge } from "@/components/signals/category-badge";
import { CopilotHint } from "@/components/signals/copilot-guidance";
import { SeverityBadge } from "@/components/signals/severity-badge";
import { StatusBadge } from "@/components/signals/status-badge";
import { SourceContextBadge } from "@/components/signals/source-context-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCopilotGuidance, type CopilotGuidance } from "@/lib/copilot";
import { buildFinalReviewSummary } from "@/lib/final-review";
import type { SignalPostingSummary } from "@/lib/posting-log";
import { formatDateTime } from "@/lib/utils";
import { hasGeneration, hasInterpretation } from "@/lib/workflow";
import type { SignalRecord } from "@/types/signal";

export function WorkflowQueueSection({
  id,
  title,
  description,
  signals,
  emptyCopy,
  guidanceBySignalId,
  postingSummaryBySignalId,
}: {
  id: string;
  title: string;
  description: string;
  signals: SignalRecord[];
  emptyCopy: string;
  guidanceBySignalId?: Record<string, CopilotGuidance>;
  postingSummaryBySignalId?: Record<string, SignalPostingSummary>;
}) {
  return (
    <div id={id}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <span>{title}</span>
            <span className="text-sm font-medium text-slate-500">{signals.length}</span>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {signals.length === 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">{emptyCopy}</div>
          ) : (
            signals.map((signal) => {
              const finalReviewSummary = buildFinalReviewSummary(signal);
              const postingSummary = postingSummaryBySignalId?.[signal.recordId];

              return (
              <div key={signal.recordId} className="rounded-2xl bg-white/80 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={signal.status} />
                      <CategoryBadge category={signal.signalCategory} />
                      <SeverityBadge severity={signal.severityScore} />
                    </div>
                    <div>
                      <Link href={`/signals/${signal.recordId}`} className="text-lg font-semibold text-slate-950 hover:text-[color:var(--accent)]">
                        {signal.sourceTitle}
                      </Link>
                      <div className="mt-2">
                        <SourceContextBadge signal={signal} />
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        {signal.reviewNotes ?? signal.manualSummary ?? signal.rawExcerpt ?? "No operator notes yet."}
                      </p>
                      {signal.whySelected || signal.whyRejected ? (
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{signal.whySelected ?? signal.whyRejected}</p>
                      ) : null}
                      <div className="mt-3">
                        <CopilotHint guidance={guidanceBySignalId?.[signal.recordId] ?? getCopilotGuidance(signal)} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/signals/${signal.recordId}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Open record
                      </Link>
                      <Link href={`/signals/${signal.recordId}/interpret`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        {hasInterpretation(signal) ? "Review interpretation" : "Interpret"}
                      </Link>
                      {hasInterpretation(signal) ? (
                        <Link href={`/signals/${signal.recordId}/generate`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                          {hasGeneration(signal) ? "Review drafts" : "Generate drafts"}
                        </Link>
                      ) : null}
                      {hasGeneration(signal) ? (
                        <Link href={`/signals/${signal.recordId}/review`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                          Open final review
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-64 rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600">
                    <p>Created {formatDateTime(signal.createdDate)}</p>
                    <p className="mt-2">{signal.platformPriority ?? "Platform not set"}</p>
                    <p className="mt-2">
                      {signal.scheduledDate ? `Scheduled ${formatDateTime(signal.scheduledDate)}` : "No scheduled date"}
                    </p>
                    <p className="mt-2">
                      {signal.postedDate ? `Posted ${formatDateTime(signal.postedDate)}` : "Not posted"}
                    </p>
                    <p className="mt-2">
                      {signal.sourcePublisher ?? "Source publisher not set"}
                    </p>
                    <p className="mt-2">
                      {signal.reviewPriority ? `Priority ${signal.reviewPriority}` : "Priority not set"}
                    </p>
                    <p className="mt-2">
                      {signal.keepRejectRecommendation
                        ? `Recommendation ${signal.keepRejectRecommendation}`
                        : "Recommendation not set"}
                    </p>
                    <p className="mt-2">
                      {signal.qualityGateResult ? `Quality gate ${signal.qualityGateResult}` : "Quality gate not set"}
                    </p>
                    {hasGeneration(signal) ? (
                      <>
                        <p className="mt-2">{finalReviewSummary.summary}</p>
                        <p className="mt-2">
                          {finalReviewSummary.readyCount} ready · {finalReviewSummary.needsEditCount} need edit · {finalReviewSummary.skipCount} skipped
                        </p>
                        {postingSummary ? (
                          <p className="mt-2">
                            {postingSummary.summary}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )})
          )}
        </CardContent>
      </Card>
    </div>
  );
}
