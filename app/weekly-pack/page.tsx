import Link from "next/link";

import { WeeklyPostingPackPanel } from "@/components/weekly-pack/weekly-posting-pack-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { appendAuditEventsSafe } from "@/lib/audit";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingAssistantPackages } from "@/lib/posting-assistant";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { formatDateTime } from "@/lib/utils";
import {
  buildWeeklyPostingPack,
  buildWeeklyPostingPackInsights,
} from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

export default async function WeeklyPackPage() {
  const renderNow = new Date();
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
    experiments,
    strategy,
    tuning,
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
    listExperiments(),
    getCampaignStrategy(),
    getOperatorTuning(),
  ]);
  const stagedPostingPackages = await listPostingAssistantPackages({ status: "active" });
  const stagedKeySet = stagedPostingPackages.map((pkg) => `${pkg.signalId}:${pkg.platform}`);

  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, signalResult.signals, postingEntries);
  const cadence = buildCampaignCadenceSummary(signalResult.signals, strategy, postingEntries);
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: signalResult.signals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    signalResult.signals,
    feedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    undefined,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning.settings,
  );
  const confirmedClustersByCanonicalSignalId = indexConfirmedClusterByCanonicalSignalId(duplicateClusters);
  const visibleSignals = filterSignalsForActiveReviewQueue(signalResult.signals, duplicateClusters);
  const autonomousAssessments = visibleSignals.map((signal) => ({
    signal,
    guidance: buildUnifiedGuidanceModel({
      signal,
      guidance: guidanceBySignalId[signal.recordId],
      context: "review",
      tuning: tuning.settings,
    }),
    assessment: assessAutonomousSignal(
      signal,
      buildUnifiedGuidanceModel({
        signal,
        guidance: guidanceBySignalId[signal.recordId],
        context: "review",
        tuning: tuning.settings,
      }),
    ),
  }));
  const approvalReadyCandidates = rankApprovalCandidates(
    autonomousAssessments.filter((item) => item.assessment.decision === "approval_ready"),
    28,
    {
      strategy,
      cadence,
      weeklyPlan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: signalResult.signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
    },
  );
  const evergreenSummary = buildEvergreenSummary({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    strategy,
    cadence,
    weeklyPlan,
    weeklyPlanState,
  });
  const pack = await buildWeeklyPostingPack({
    approvalCandidates: approvalReadyCandidates,
    evergreenSummary,
    strategy,
    weeklyPlan,
    weeklyPlanState,
    postingEntries,
    now: renderNow,
  });
  const packInsights = buildWeeklyPostingPackInsights(pack);

  await appendAuditEventsSafe([
    {
      signalId: `weekly-pack:${pack.weekStartDate}`,
      eventType: "WEEKLY_POSTING_PACK_GENERATED",
      actor: "operator",
      summary: "Viewed the recommended weekly posting pack.",
      metadata: {
        itemCount: pack.items.length,
        freshCount: pack.includedFreshCount,
        evergreenCount: pack.includedEvergreenCount,
        approvedCount: packInsights.approvedCount,
        postedCount: packInsights.postedCount,
      },
    },
    ...pack.sequences.flatMap((sequence) => [
      {
        signalId: sequence.sequenceId,
        eventType: "NARRATIVE_SEQUENCE_CREATED" as const,
        actor: "system" as const,
        summary: `Created narrative sequence: ${sequence.narrativeLabel}.`,
        metadata: {
          steps: sequence.orderedSteps.length,
          goal: sequence.sequenceGoal,
        },
      },
      ...sequence.orderedSteps.map((step) => ({
        signalId: step.signalId,
        eventType: "NARRATIVE_SEQUENCE_STEP_ASSIGNED" as const,
        actor: "system" as const,
        summary: `Assigned ${step.contentRole.replaceAll("_", " ")} as step ${step.order} in ${sequence.narrativeLabel}.`,
        metadata: {
          sequenceId: sequence.sequenceId,
          platform: step.platform,
          role: step.contentRole,
          order: step.order,
        },
      })),
    ]),
    ...(pack.items[0]?.sequenceContext
      ? [
          {
            signalId: pack.items[0].signalId,
            eventType: "NARRATIVE_SEQUENCE_REFERENCED" as const,
            actor: "operator" as const,
            summary: `Referenced ${pack.items[0].sequenceContext.narrativeLabel} from weekly pack.`,
            metadata: {
              sequenceId: pack.items[0].sequenceContext.sequenceId,
              role: pack.items[0].sequenceContext.role,
              order: pack.items[0].sequenceContext.stepNumber,
              platform: pack.items[0].platform,
              source: "weekly_pack",
            },
          },
        ]
      : []),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={signalResult.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {signalResult.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              Generated {formatDateTime(pack.generatedAt)}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Recommended Weekly Posting Pack</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            A bounded manual posting set for this week. The pack stays small, balances the current mix, and keeps the operator in control.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to digest
          </Link>
          <Link href="/review?view=ready_to_approve" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open approval queue
          </Link>
          <Link href="/plan" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly plan
          </Link>
          <Link href="/posting" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open posting assistant
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Recommended items</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{pack.items.length}</p>
          <p className="mt-1 text-sm text-slate-600">Default weekly pack size stays bounded between 3 and 5 items.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Fresh vs evergreen</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {pack.includedFreshCount} / {pack.includedEvergreenCount}
          </p>
          <p className="mt-1 text-sm text-slate-600">Fresh items lead unless evergreen closes a real weekly gap.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top platform mix</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{pack.platformMix[0]?.label ?? "None yet"}</p>
          <p className="mt-1 text-sm text-slate-600">{pack.platformMix.map((row) => `${row.count} ${row.label}`).join(" · ") || "No platform mix is stable enough yet."}</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Coverage quality</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{Math.round(packInsights.completionRate * 100)}%</p>
          <p className="mt-1 text-sm text-slate-600">{pack.coverageSummary.summary}</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Campaign-critical</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{packInsights.campaignCriticalCount}</p>
          <p className="mt-1 text-sm text-slate-600">Items kept because they matter for the current campaign window.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Staged for posting</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{stagedPostingPackages.length}</p>
          <p className="mt-1 text-sm text-slate-600">Weekly-pack items can be pushed straight into the ready-to-post surface.</p>
        </div>
      </div>

      {pack.sequences.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Narrative Sequences</CardTitle>
            <CardDescription>
              Compact cross-platform arcs surfaced from this week&apos;s strongest signals. They stay advisory and never schedule automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {pack.sequences.slice(0, 3).map((sequence) => (
              <div key={sequence.sequenceId} className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">{sequence.narrativeLabel}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{sequence.sequenceGoal}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {sequence.orderedSteps.map((step) => `${step.order}. ${step.platform === "linkedin" ? "LinkedIn" : step.platform === "x" ? "X" : "Reddit"}`).join(" · ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Weekly Coverage</CardTitle>
          <CardDescription>{pack.coverageSummary.summary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Platforms</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {pack.platformMix.map((row) => `${row.count} ${row.label}`).join(" · ") || "No platform mix yet."}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Funnels</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {pack.funnelMix.map((row) => `${row.count} ${row.label}`).join(" · ") || "No funnel mix yet."}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Modes</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {pack.modeMix.map((row) => `${row.count} ${row.label}`).join(" · ") || "No mode mix yet."}
              </p>
            </div>
          </div>

          {pack.coverageSummary.notes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {pack.coverageSummary.notes.map((note) => (
                <Badge key={note} className="bg-slate-100 text-slate-700 ring-slate-200">
                  {note}
                </Badge>
              ))}
            </div>
          ) : null}

          {pack.coverageSummary.underrepresented.length > 0 ? (
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Still underrepresented</p>
              <div className="mt-3 space-y-2">
                {pack.coverageSummary.underrepresented.map((note) => (
                  <p key={note} className="text-sm leading-6 text-slate-700">{note}</p>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommended Set</CardTitle>
          <CardDescription>
            Use the pack as the manual posting short list for this week. Removing an item keeps the set bounded and swaps in the next best alternate after refresh.
          </CardDescription>
        </CardHeader>
        <CardContent>
      <WeeklyPostingPackPanel pack={pack} stagedKeys={stagedKeySet} />
        </CardContent>
      </Card>
    </div>
  );
}
