import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { appendAuditEventsSafe } from "@/lib/audit";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildOperatorDigest } from "@/lib/digest";
import { listDuplicateClusters } from "@/lib/duplicate-clusters";
import { listFeedbackEntries } from "@/lib/feedback";
import { getManagedIngestionSourcesWithFallback } from "@/lib/ingestion/source-performance";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { formatDateTime } from "@/lib/utils";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

export default async function DigestPage() {
  const [
    signalResult,
    feedbackEntries,
    patterns,
    playbookCards,
    bundles,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    duplicateClusters,
    strategy,
    tuning,
    managedSourceResult,
  ] = await Promise.all([
    listSignalsWithFallback({ limit: 1000 }),
    listFeedbackEntries(),
    listPatterns(),
    listPlaybookCards(),
    listPatternBundles(),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
    listDuplicateClusters(),
    getCampaignStrategy(),
    getOperatorTuning(),
    getManagedIngestionSourcesWithFallback(),
  ]);

  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
  const cadence = buildCampaignCadenceSummary(signalResult.signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, signalResult.signals, postingEntries);
  const digest = buildOperatorDigest({
    signals: signalResult.signals,
    feedbackEntries,
    patterns,
    playbookCards,
    bundles,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    duplicateClusters,
    strategy,
    cadence,
    weeklyPlan,
    weeklyPlanState,
    tuning: tuning.settings,
    managedSources: managedSourceResult.sources,
  });

  await appendAuditEventsSafe([
    {
      signalId: `digest:${digest.generatedAt.slice(0, 10)}`,
      eventType: "DIGEST_VIEWED",
      actor: "operator",
      summary: "Viewed operator digest.",
      metadata: {
        topCandidates: digest.topCandidates.length,
        heldItems: digest.heldForJudgement.length,
        weeklyGaps: digest.weeklyGaps.length,
        outcomeFollowUps: digest.outcomeFollowUps.length,
        sourceRecommendations: digest.sourceRecommendations.length,
      },
    },
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={signalResult.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {signalResult.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Generated {formatDateTime(digest.generatedAt)}</Badge>
          </div>
          <CardTitle className="text-3xl">Operator Digest</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            One compact daily command centre for what needs approval, judgement, follow-up, and source attention next.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/review#approval-ready" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open approval queue
          </Link>
          <Link href="/plan" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly plan
          </Link>
          <Link href="/ingestion" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open source controls
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Top Candidates</CardTitle>
              <Link href="/review#approval-ready" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                Approval queue
              </Link>
            </div>
            <CardDescription>Near-finished items most worth operator review next.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {digest.topCandidates.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No approval-ready candidates are active right now.</div>
            ) : (
              digest.topCandidates.map((item) => (
                <Link key={item.signalId} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <p className="font-medium text-slate-950">{item.sourceTitle}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-900">Objective:</span> {item.objective}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{item.whyItMayWork}</p>
                  <p className="mt-2 text-xs text-slate-500">{item.summary}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Held For Judgement</CardTitle>
              <Link href="/review#borderline-workbench" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                Review held items
              </Link>
            </div>
            <CardDescription>Cases that still need an explicit operator decision or bounded next step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {digest.heldForJudgement.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No held items need immediate judgement.</div>
            ) : (
              digest.heldForJudgement.map((item) => (
                <Link key={item.signalId} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-amber-50 text-amber-700 ring-amber-200">{item.stageLabel}</Badge>
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{item.sourceTitle}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Weekly Gaps</CardTitle>
              <Link href="/plan" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                Weekly plan
              </Link>
            </div>
            <CardDescription>Current planning gaps or balance notes that should shape operator attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {digest.weeklyGaps.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No weekly gap is calling for attention right now.</div>
            ) : (
              digest.weeklyGaps.map((item) => (
                <Link key={item.id} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.summary}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome Follow-Ups</CardTitle>
            <CardDescription>Posted items that are old enough to rate but still missing outcome updates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {digest.outcomeFollowUps.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No posting entries are overdue for outcome follow-up.</div>
            ) : (
              digest.outcomeFollowUps.map((item) => (
                <Link key={item.postingLogId} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{item.platformLabel}</Badge>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{formatDateTime(item.postedAt)}</Badge>
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{item.sourceTitle}</p>
                  <p className="mt-2 text-sm text-slate-600">Missing: {item.missing.join(" · ")}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Source Recommendations</CardTitle>
            <Link href="/ingestion" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Source controls
            </Link>
          </div>
          <CardDescription>Advisory source changes worth reviewing next. Nothing changes automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {digest.sourceRecommendations.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No source recommendation needs action right now.</div>
          ) : (
            digest.sourceRecommendations.map((item) => (
              <Link key={`${item.sourceId}-${item.summary}`} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <p className="font-medium text-slate-950">{item.sourceName}</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{item.summary}</p>
                <p className="mt-1 text-sm text-slate-600">{item.rationale}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
