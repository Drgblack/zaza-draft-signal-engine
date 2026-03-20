import Link from "next/link";

import { FlywheelOptimisationPanel } from "@/components/optimisation/flywheel-optimisation-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { buildAudienceMemoryState } from "@/lib/audience-memory";
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
import { buildAutonomousExperimentProposals, buildExperimentProposalInsights, listExperimentProposals } from "@/lib/experiment-proposals";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildFlywheelOptimisation } from "@/lib/flywheel-optimisation";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { listIngestionSources } from "@/lib/ingestion/sources";
import { buildNarrativeSequenceInsights, buildNarrativeSequencesForSignals } from "@/lib/narrative-sequences";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildRevenueSignalInsights, syncRevenueSignals } from "@/lib/revenue-signals";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { buildSourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import { getOperatorTuning } from "@/lib/tuning";
import { formatDateTime } from "@/lib/utils";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { buildWeeklyPostingPack } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

export default async function OptimisationPage() {
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
    storedExperimentProposals,
    strategy,
    tuning,
    ingestionSources,
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
    listExperimentProposals(),
    getCampaignStrategy(),
    getOperatorTuning(),
    listIngestionSources(),
  ]);

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
    24,
    {
      strategy,
      cadence,
      weeklyPlan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId: indexConfirmedClusterByCanonicalSignalId(duplicateClusters),
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
  const weeklyPostingPack = await buildWeeklyPostingPack({
    approvalCandidates: approvalReadyCandidates,
    evergreenSummary,
    strategy,
    weeklyPlan,
    weeklyPlanState,
    postingEntries,
    now: renderNow,
  });
  const weeklyRecap = buildWeeklyRecap({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId,
  });
  const revenueSignals = await syncRevenueSignals({
    signals: signalResult.signals,
    postingEntries,
    strategicOutcomes,
  });
  const revenueInsights = buildRevenueSignalInsights(revenueSignals);
  const audienceMemory = buildAudienceMemoryState({
    strategy,
    signals: signalResult.signals,
    postingEntries,
    strategicOutcomes,
    revenueSignals,
  });
  const sourceAutopilotState = await buildSourceAutopilotV2State({
    source: signalResult.source,
    sourceRegistry: ingestionSources,
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const narrativeSequenceInsights = buildNarrativeSequenceInsights({
    sequences: buildNarrativeSequencesForSignals({
      signals: signalResult.signals,
      strategy,
      maxSequences: 24,
    }),
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const experimentProposalInsights = buildExperimentProposalInsights(
    buildAutonomousExperimentProposals({
      candidates: approvalReadyCandidates,
      experiments,
      storedProposals: storedExperimentProposals,
      maxProposals: 6,
    }),
  );
  const optimisation = buildFlywheelOptimisation({
    weeklyRecap,
    sourceAutopilotState,
    playbookCoverageSummary,
    weeklyPostingPack,
    evergreenSummary,
    experimentProposalInsights,
    narrativeSequenceInsights,
    revenueInsights,
    audienceMemory,
    now: renderNow,
  });

  await appendAuditEventsSafe(
    optimisation.topProposals.map((proposal) => ({
      signalId: `optimisation:${proposal.proposalId}`,
      eventType: "OPTIMISATION_PROPOSAL_GENERATED" as const,
      actor: "system" as const,
      summary: `Optimisation proposal generated for ${proposal.targetLabel}.`,
      metadata: {
        category: proposal.category,
        targetType: proposal.targetType,
        priority: proposal.priority,
        href: proposal.href,
      },
    })),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={signalResult.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {signalResult.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Generated {formatDateTime(renderNow.toISOString())}</Badge>
          </div>
          <CardTitle className="text-3xl">Content Flywheel Self-Optimisation</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            A bounded operator-facing view of what to do more of, reduce, reuse, pause, rebalance, or test next across the content flywheel.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open digest
          </Link>
          <Link href="/plan" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly plan
          </Link>
          <Link href="/weekly-pack" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open weekly pack
          </Link>
          <Link href="/review" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open review
          </Link>
          <Link href="/ingestion" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open source controls
          </Link>
        </CardContent>
      </Card>

      <FlywheelOptimisationPanel optimisation={optimisation} />
    </div>
  );
}
