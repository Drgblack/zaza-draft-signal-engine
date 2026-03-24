import { BatchApprovalWorkspace } from "@/components/signals/batch-approval-workspace";
import { listSignalsWithFallback } from "@/lib/signal-repository";
import { appendAuditEventsSafe } from "@/lib/audit";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildBatchApprovalPrep } from "@/lib/batch-approval";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

export default async function BatchReviewPage() {
  const { signals } = await listSignalsWithFallback({ limit: 1000 });
  const feedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const playbookCards = await listPlaybookCards();
  const bundles = await listPatternBundles();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const strategicOutcomes = await listStrategicOutcomes();
  const duplicateClusters = await listDuplicateClusters();
  const experiments = await listExperiments();
  const strategy = await getCampaignStrategy();
  const tuning = await getOperatorTuning();
  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
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
  const visibleSignals = filterSignalsForActiveReviewQueue(signals, duplicateClusters);
  const confirmedClustersByCanonicalSignalId = indexConfirmedClusterByCanonicalSignalId(duplicateClusters);
  const cadence = buildCampaignCadenceSummary(signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, signals, postingEntries);
  const autonomousAssessments = visibleSignals.map((signal) => {
    const guidance = buildUnifiedGuidanceModel({
      signal,
      guidance: guidanceBySignalId[signal.recordId],
      context: "review",
      tuning: tuning.settings,
    });

    return {
      signal,
      guidance,
      assessment: assessAutonomousSignal(signal, guidance),
    };
  });
  const approvalReadyCandidates = rankApprovalCandidates(
    autonomousAssessments.filter((item) => item.assessment.decision === "approval_ready"),
    12,
    {
      strategy,
      cadence,
      weeklyPlan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
    },
  );
  const batch = buildBatchApprovalPrep({
    candidates: approvalReadyCandidates,
    strategy,
    maxItems: 5,
  });

  await appendAuditEventsSafe([
    {
      signalId: batch.batchId,
      eventType: "BATCH_APPROVAL_PREP_CREATED",
      actor: "operator",
      summary: `Opened batch approval prep with ${batch.items.length} candidates.`,
      metadata: {
        candidateCount: batch.items.length,
        candidateIds: batch.candidateIds.join(","),
      },
    },
  ]);

  return <BatchApprovalWorkspace batch={batch} />;
}

