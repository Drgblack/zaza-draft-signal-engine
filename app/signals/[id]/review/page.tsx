import Link from "next/link";
import { notFound } from "next/navigation";

import { FinalReviewWorkspace } from "@/components/signals/final-review-workspace";
import { GuidancePanel } from "@/components/signals/guidance-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSignalWithFallback, listSignalsWithFallback } from "@/lib/airtable";
import { getAuditEvents } from "@/lib/audit";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildFinalReviewSummary } from "@/lib/final-review";
import { assembleGuidanceForSignal } from "@/lib/guidance";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPatterns } from "@/lib/patterns";
import { getPostingLogEntries, listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { getOperatorTuning } from "@/lib/tuning";

export const dynamic = "force-dynamic";

function getLastAppliedPatternName(auditEvents: Awaited<ReturnType<typeof getAuditEvents>>): string | null {
  const latestApplied = [...auditEvents]
    .reverse()
    .find((event) => event.eventType === "PATTERN_APPLIED");

  return typeof latestApplied?.metadata?.patternName === "string" ? latestApplied.metadata.patternName : null;
}

export default async function FinalReviewPage({
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
  const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
  const feedbackEntries = await listFeedbackEntries();
  const auditEvents = await getAuditEvents(signal.recordId);
  const postingEntries = await getPostingLogEntries(signal.recordId);
  const allPostingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const patterns = await listPatterns();
  const playbookCards = await listPlaybookCards();
  const bundles = await listPatternBundles();
  const tuning = await getOperatorTuning();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: allSignals,
    postingEntries: allPostingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: allSignals,
    playbookCards,
    postingEntries: allPostingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const reviewSummary = buildFinalReviewSummary(signal);
  const appliedPatternName = getLastAppliedPatternName(auditEvents);
  const guidance = assembleGuidanceForSignal({
    signal,
    context: "review",
    allSignals,
    feedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning: tuning.settings,
  });

  if (!signal.xDraft || !signal.linkedInDraft || !signal.redditDraft) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Final Review Workspace</CardTitle>
            <CardDescription>
              This workspace needs generated platform drafts before final review can begin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">Generate X, LinkedIn, and Reddit drafts first, then return here for final editing decisions.</p>
            <div className="flex flex-wrap gap-3">
              <Link href={`/signals/${signal.recordId}/generate`} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white">
                Go to generation
              </Link>
              <Link href={`/signals/${signal.recordId}`} className="rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-700">
                Back to record
              </Link>
            </div>
          </CardContent>
        </Card>

        <GuidancePanel
          guidance={guidance}
          variant="compact"
          title="Review guidance"
          description="Compact next-step guidance for this signal before final review can continue."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={result.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {result.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              {reviewSummary.started ? "Final review started" : "Final review not started"}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Final Review</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Final editorial decision workspace for comparing generated drafts, editing the strongest candidates, and recording what is ready to post manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 pt-0 text-sm text-slate-600">
          <span>{signal.sourceTitle}</span>
          <span>{signal.editorialMode ? getEditorialModeDefinition(signal.editorialMode).label : "Editorial mode not set"}</span>
          {appliedPatternName ? <span>Pattern: {appliedPatternName}</span> : null}
          <Link href={`/signals/${signal.recordId}`} className="text-[color:var(--accent)] underline underline-offset-4">
            Back to record
          </Link>
        </CardContent>
      </Card>

      <GuidancePanel
        guidance={guidance}
        variant="compact"
        title="Review guidance"
        description="Compact review-stage guidance that keeps reuse memory, playbook support, pattern support, and any meaningful caution in one place."
      />

      <FinalReviewWorkspace
        signal={signal}
        source={result.source}
        appliedPatternName={appliedPatternName}
        initialPostingEntries={postingEntries}
      />
    </div>
  );
}
