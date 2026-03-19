import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditTrail } from "@/components/signals/audit-trail";
import { CategoryBadge } from "@/components/signals/category-badge";
import { CopilotGuidanceCard } from "@/components/signals/copilot-guidance";
import { FeedbackPanel } from "@/components/signals/feedback-panel";
import { PostingHistoryPanel } from "@/components/signals/posting-history-panel";
import { PatternCandidatePanel } from "@/components/patterns/pattern-candidate-panel";
import { PatternCoveragePanel } from "@/components/patterns/pattern-coverage-panel";
import { PatternFormCard } from "@/components/patterns/pattern-form-card";
import { RelatedPatternsPanel } from "@/components/patterns/related-patterns-panel";
import { ScoringPanel } from "@/components/signals/scoring-panel";
import { SeverityBadge } from "@/components/signals/severity-badge";
import { SignalWorkflowPanel } from "@/components/signals/signal-workflow-panel";
import { StatusBadge } from "@/components/signals/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deriveDisplayEngagementScore, getSignalWithFallback, listSignalsWithFallback } from "@/lib/airtable";
import { getAuditEvents, listAuditEvents } from "@/lib/audit";
import { buildBundleCoverageSummary, getSignalBundleCoverageHint } from "@/lib/bundle-coverage";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { getFeedbackAwareCopilotGuidance } from "@/lib/copilot";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { getFeedbackEntries, listFeedbackEntries } from "@/lib/feedback";
import { buildFinalReviewSummary } from "@/lib/final-review";
import { indexOutcomesByPostingLogId, listPostingOutcomes } from "@/lib/outcomes";
import { buildPatternCoverageRecords, buildPatternDraftFromCoverageGap } from "@/lib/pattern-coverage";
import { listPatternFeedbackEntries } from "@/lib/pattern-feedback";
import { assessPatternCandidate } from "@/lib/pattern-discovery";
import { buildSignalPostingSummary, getPostingLogEntries } from "@/lib/posting-log";
import {
  buildPatternDraftFromSignal,
  buildPatternEffectivenessSummaries,
  findRelatedPatterns,
  indexPatternEffectivenessSummaries,
  listPatterns,
} from "@/lib/patterns";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import { buildInitialScoringFromSignal } from "@/lib/scoring";
import { assessTransformability } from "@/lib/transformability";
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
  const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
  const auditEvents = await getAuditEvents(signal.recordId);
  const feedbackEntries = await getFeedbackEntries(signal.recordId);
  const allFeedbackEntries = await listFeedbackEntries();
  const postingEntries = await getPostingLogEntries(signal.recordId);
  const postingOutcomes = await listPostingOutcomes({ signalIds: [signal.recordId] });
  const patterns = await listPatterns();
  const allPatterns = await listPatterns({ includeRetired: true });
  const bundles = await listPatternBundles();
  const allAuditEvents = await listAuditEvents();
  const allPatternFeedbackEntries = await listPatternFeedbackEntries();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const patternEffectivenessById = indexPatternEffectivenessSummaries(
    buildPatternEffectivenessSummaries(patterns, allAuditEvents, allPatternFeedbackEntries, allFeedbackEntries),
  );
  const coverageAssessment =
    buildPatternCoverageRecords(allSignals, allFeedbackEntries, patterns, allAuditEvents).find(
      (record) => record.signalId === signal.recordId,
    ) ?? null;
  const bundleCoverageSummary = buildBundleCoverageSummary({
    signals: allSignals,
    bundles,
    patterns: allPatterns,
    auditEvents: allAuditEvents,
    feedbackEntries: allFeedbackEntries,
    patternFeedbackEntries: allPatternFeedbackEntries,
  });
  const bundleCoverageHint = getSignalBundleCoverageHint({
    signal,
    coverageRecord: coverageAssessment,
    summary: bundleCoverageSummary,
  });
  const relatedPatterns = findRelatedPatterns(signal, patterns, { limit: 3 });
  const patternCandidate = assessPatternCandidate(signal, {
    feedbackEntries,
    patterns,
  });
  const patternDraft = coverageAssessment
    ? buildPatternDraftFromCoverageGap(signal, coverageAssessment)
    : buildPatternDraftFromSignal(signal);
  const interpretationReady = hasInterpretation(signal);
  const generationReady = hasGeneration(signal);
  const finalReviewSummary = buildFinalReviewSummary(signal);
  const postingSummary = buildSignalPostingSummary(signal, postingEntries);
  const postingOutcomesByPostingLogId = indexOutcomesByPostingLogId(postingOutcomes);
  const automationReadiness = getAutomationReadinessSnapshot(signal);
  const initialScoring = buildInitialScoringFromSignal(signal);
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const transformability = assessTransformability(signal);
  const copilotGuidance = getFeedbackAwareCopilotGuidance(signal, {
    allSignals,
    feedbackEntries: allFeedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    patternEffectivenessById,
  });
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
          {generationReady ? (
            <Link href={`/signals/${signal.recordId}/review`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open final review
            </Link>
          ) : null}
          <Link href="/review" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open review queue
          </Link>
          <Link href="/patterns" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open pattern library
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
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Scenario Angle</p>
                  {signal.scenarioAngle ? (
                    <Badge
                      className={
                        scenarioAssessment.quality === "strong"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : scenarioAssessment.quality === "usable"
                            ? "bg-sky-50 text-sky-700 ring-sky-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200"
                      }
                    >
                      {scenarioAssessment.quality}
                    </Badge>
                  ) : null}
                </div>
                <p className="rounded-2xl bg-white/75 p-4 text-sm leading-6 text-slate-700">
                  {signal.scenarioAngle ?? "Not set"}
                </p>
                {signal.scenarioAngle ? (
                  <p className="text-xs text-slate-500">{scenarioAssessment.reason}</p>
                ) : null}
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
                Schema-ready metadata for ingestion, scoring, deduplication heuristics, and queue prioritisation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className={`inline-flex rounded-2xl px-3 py-2 text-sm font-medium ${readinessTone}`}>
                {automationReadiness.label} · {automationReadiness.completedChecks}/{automationReadiness.totalChecks} signals present
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem label="Ingestion Source" value={signal.ingestionSource ?? "Not set"} />
                <SummaryItem label="Ingestion Method" value={signal.ingestionMethod ?? "Not set"} />
                <SummaryItem label="Auto-Generated?" value={formatBooleanValue(signal.autoGenerated)} />
                <SummaryItem label="Needs Human Review" value={formatBooleanValue(signal.needsHumanReview)} />
              </div>
              <div className="rounded-2xl bg-white/75 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">{transformability.label}</p>
                <p className="mt-2 leading-6">{transformability.reason}</p>
              </div>
            </CardContent>
          </Card>

          <CopilotGuidanceCard signalId={signal.recordId} guidance={copilotGuidance} suggestedPatterns={patterns} />

          <RelatedPatternsPanel
            title="Related patterns"
            description="Saved examples that look relevant to this record. Use them as references, not automatic templates."
            emptyCopy="No related patterns match this record yet."
            patterns={relatedPatterns}
          />

          <PatternCandidatePanel
            assessment={patternCandidate}
            actionHref={patternCandidate.alreadyCaptured ? null : "#save-pattern"}
          />

          {coverageAssessment ? (
            <PatternCoveragePanel
              assessment={coverageAssessment}
              actionHref="#save-pattern"
              bundleHint={bundleCoverageHint}
            />
          ) : null}

          <PatternFormCard
            cardId="save-pattern"
            mode="create"
            signalId={signal.recordId}
            title="Save as pattern"
            description="Capture the reusable core of this signal so it can help with future framing and output work."
            initialValues={patternDraft}
            suggestion={patternCandidate}
            coverageAssessment={coverageAssessment}
          />

          <FeedbackPanel
            signalId={signal.recordId}
            initialEntries={feedbackEntries}
            categories={["signal", "scenario", "copilot", "output", "source"]}
            title="Operator Feedback"
            description="Capture explicit judgement about signal quality, framing quality, co-pilot guidance, outputs, and source quality. This does not change scoring or workflow automatically."
          />

          <AuditTrail events={auditEvents} />

          <ScoringPanel signal={signal} source={result.source} initialScoring={initialScoring} />

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
                  <div className="rounded-2xl bg-white/75 px-4 py-4 text-sm text-slate-600">
                    <p className="font-medium text-slate-900">Final review</p>
                    <p className="mt-2 leading-6">{finalReviewSummary.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{finalReviewSummary.readyCount} ready</span>
                      <span>{finalReviewSummary.needsEditCount} need edit</span>
                      <span>{finalReviewSummary.skipCount} skipped</span>
                    </div>
                    <Link href={`/signals/${signal.recordId}/review`} className="mt-3 inline-block text-[color:var(--accent)] underline underline-offset-4">
                      Open final review workspace
                    </Link>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SummaryItem
                      label="Editorial Mode"
                      value={signal.editorialMode ? getEditorialModeDefinition(signal.editorialMode).label : "Not set"}
                    />
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

          <PostingHistoryPanel
            signalId={signal.recordId}
            postingEntries={postingEntries}
            initialOutcomesByPostingLogId={postingOutcomesByPostingLogId}
            postingSummary={postingSummary}
            generationReady={generationReady}
          />
        </div>

        <SignalWorkflowPanel signal={signal} source={result.source} />
      </div>
    </div>
  );
}
