import Link from "next/link";

import { GrowthMemoryPanel } from "@/components/director/growth-memory-panel";
import { OpportunityRadarPanel } from "@/components/director/opportunity-radar-panel";
import { RecommendationTuningPanel } from "@/components/settings/recommendation-tuning-panel";
import { FlywheelOptimisationPanel } from "@/components/optimisation/flywheel-optimisation-panel";
import { PlaybookPackSuggestions } from "@/components/playbook/playbook-pack-suggestions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { buildAudienceMemoryInsights, syncAudienceMemory } from "@/lib/audience-memory";
import { buildAttributionInsights, syncAttributionMemory } from "@/lib/attribution";
import { buildAutonomyPolicyInsights, evaluateAutonomyPolicy } from "@/lib/autonomy-policy";
import { appendAuditEventsSafe, listAuditEvents } from "@/lib/audit";
import { buildAutonomyScorecard } from "@/lib/autonomy-scorecard";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildBatchApprovalPrep } from "@/lib/batch-approval";
import { buildCampaignAllocationState } from "@/lib/campaign-allocation";
import { BUNDLE_COVERAGE_STRENGTH_LABELS, type BundleCoverageStrength } from "@/lib/bundle-coverage";
import { buildCampaignCadenceSummary, buildCampaignDistributionInsights, getCampaignStrategy } from "@/lib/campaigns";
import { buildConflictInsights } from "@/lib/conflicts";
import { buildConversionIntentInsights, getConversionIntentLabel } from "@/lib/conversion-intent";
import { buildDistributionPriorityInsights } from "@/lib/distribution-priority";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { buildExpectedOutcomeInsights } from "@/lib/expected-outcome-ranking";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { syncExceptionInbox } from "@/lib/exception-inbox";
import { buildExperimentInsights, listExperiments } from "@/lib/experiments";
import { buildExperimentAutopilotV2 } from "@/lib/experiment-autopilot-v2";
import { buildAutonomousExperimentProposals, buildExperimentProposalInsights, listExperimentProposals } from "@/lib/experiment-proposals";
import { buildFatigueModel } from "@/lib/fatigue";
import { listFeedbackEntries } from "@/lib/feedback";
import { listFollowUpTasks } from "@/lib/follow-up";
import { buildFlywheelOptimisation } from "@/lib/flywheel-optimisation";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { buildGrowthMemory } from "@/lib/growth-memory";
import { buildGrowthScorecard } from "@/lib/growth-scorecard";
import { buildInfluencerGraphState } from "@/lib/influencer-graph";
import { buildNarrativeSequenceInsights, buildNarrativeSequencesForSignals } from "@/lib/narrative-sequences";
import { buildOperatorTaskSummary, listOperatorTasks } from "@/lib/operator-tasks";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPatternBundleUsageRows, indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { buildPatternHealthAssessments, buildPatternHealthSummary } from "@/lib/pattern-health";
import { PATTERN_TYPE_LABELS } from "@/lib/pattern-definitions";
import { listPatternFeedbackEntries } from "@/lib/pattern-feedback";
import { buildPatternEffectivenessSummaries, listPatterns } from "@/lib/patterns";
import { listPostingAssistantPackages } from "@/lib/posting-assistant";
import { buildCommercialOpportunityRadar } from "@/lib/opportunity-radar";
import { syncRecommendationTuningState } from "@/lib/recommendation-tuning";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildQueueTriageInsights } from "@/lib/queue-triage";
import { buildRevenueSignalInsights, syncRevenueSignals } from "@/lib/revenue-signals";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { syncPlaybookPacks } from "@/lib/playbook-packs";
import { buildPreReviewHealingInsights, buildPreReviewRepairInsights } from "@/lib/review-repair";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { buildCommercialRiskInsights } from "@/lib/risk-guardrails";
import { buildSafePostingEligibilityMap, buildSafePostingInsights } from "@/lib/safe-posting";
import { buildSafeReplyState } from "@/lib/safe-replies";
import { listIngestionSources } from "@/lib/ingestion/sources";
import { buildStaleQueueOverview } from "@/lib/stale-queue";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { buildSourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import { getOperatorTuning } from "@/lib/tuning";
import { buildWeeklyExecutionInsights, listStoredWeeklyExecutionFlows, prepareWeeklyExecutionFlow } from "@/lib/weekly-execution";
import { buildWeeklyPostingPack, buildWeeklyPostingPackInsights } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanInsights, buildWeeklyPlanState, getCurrentWeeklyPlan, getWeeklyPlanStore } from "@/lib/weekly-plan";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { buildSignalInsights, INSIGHT_WINDOWS, type InsightObservation, type InsightWindow } from "@/lib/insights";

export const dynamic = "force-dynamic";

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function toneClasses(tone: InsightObservation["tone"]): string {
  if (tone === "success") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (tone === "warning") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function bundleCoverageClasses(strength: BundleCoverageStrength): string {
  if (strength === "strong_coverage") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (strength === "partial_coverage") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (strength === "thin_bundle") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function playbookGapClasses(kind: "uncovered" | "weak_coverage" | "opportunity"): string {
  if (kind === "weak_coverage") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (kind === "opportunity") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function confidenceClasses(level: "high" | "moderate" | "low"): string {
  if (level === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (level === "low") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function automationConfidenceClasses(level: "high" | "medium" | "low"): string {
  if (level === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (level === "low") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function expectedOutcomeClasses(tier: "high" | "medium" | "low"): string {
  if (tier === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (tier === "low") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function WindowLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full border border-slate-900 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-50 shadow-[0_8px_18px_rgba(15,23,42,0.14)]"
          : "rounded-full bg-white/88 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-950"
      }
    >
      {label}
    </Link>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl bg-white/84 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function EmptyState({
  copy,
}: {
  copy: string;
}) {
  return <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-600">{copy}</div>;
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const renderNow = new Date();
  const windowParam = getSingleValue(params.window);
  const window = INSIGHT_WINDOWS.includes(windowParam as InsightWindow) ? (windowParam as InsightWindow) : "all";

  const { signals, source, error } = await listSignalsWithFallback({ limit: 1000 });
  const auditEvents = await listAuditEvents();
  const feedbackEntries = await listFeedbackEntries();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const strategicOutcomes = await listStrategicOutcomes();
  const ingestionSources = await listIngestionSources();
  const experiments = await listExperiments();
  const storedExperimentProposals = await listExperimentProposals();
  const patterns = await listPatterns();
  const allPatterns = await listPatterns({ includeRetired: true });
  const bundles = await listPatternBundles();
  const playbookCards = await listPlaybookCards({ status: "all" });
  const patternFeedbackEntries = await listPatternFeedbackEntries();
  const tuning = await getOperatorTuning();
  const strategy = await getCampaignStrategy();
  const currentWeeklyPlan = await getCurrentWeeklyPlan(strategy);
  const weeklyPlanStore = await getWeeklyPlanStore(strategy);
  const duplicateClusters = await listDuplicateClusters();
  const postingAssistantPackages = await listPostingAssistantPackages();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const weeklyRecap = buildWeeklyRecap({
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId,
  });
  const attributionRecords = await syncAttributionMemory({
    signals,
    postingEntries,
    strategicOutcomes,
  });
  const attributionInsights = buildAttributionInsights(attributionRecords);
  const revenueSignals = await syncRevenueSignals({
    signals,
    postingEntries,
    strategicOutcomes,
  });
  const revenueInsights = buildRevenueSignalInsights(revenueSignals);
  const audienceMemory = await syncAudienceMemory({
    strategy,
    signals,
    postingEntries,
    strategicOutcomes,
    attributionRecords,
    revenueSignals,
  });
  const audienceInsights = buildAudienceMemoryInsights(audienceMemory);
  const playbookPacks = await syncPlaybookPacks({
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    reuseMemoryCases,
    recap: weeklyRecap,
    revenueSignals,
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
  const patternEffectivenessSummaries = buildPatternEffectivenessSummaries(
    allPatterns,
    auditEvents,
    patternFeedbackEntries,
    feedbackEntries,
  );
  const patternHealthSummary = buildPatternHealthSummary(
    buildPatternHealthAssessments(allPatterns, auditEvents, patternFeedbackEntries, feedbackEntries),
  );
  const bundleUsageRows = buildPatternBundleUsageRows(
    bundles,
    allPatterns,
    Object.fromEntries(patternEffectivenessSummaries.map((summary) => [summary.patternId, summary.usedCount])),
  );
  const topActiveBundle = [...bundleUsageRows].sort(
    (left, right) => right.activePatternCount - left.activePatternCount || left.name.localeCompare(right.name),
  )[0];
  const insights = buildSignalInsights(signals, auditEvents, feedbackEntries, {
    window,
    patterns,
    allPatterns,
    bundles,
    playbookCards,
    patternFeedbackEntries,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    tuning,
  });
  const sourceAutopilot = await buildSourceAutopilotV2State({
    source,
    sourceRegistry: ingestionSources,
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const operatorTasks = await listOperatorTasks({
    signals,
    feedbackEntries,
    patterns,
    playbookCards,
    bundles,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    duplicateClusters,
    strategy,
    cadence: buildCampaignCadenceSummary(signals, strategy, postingEntries),
    weeklyPlan: currentWeeklyPlan,
    weeklyPlanState: buildWeeklyPlanState(currentWeeklyPlan, strategy, signals, postingEntries),
    tuning: tuning.settings,
    experiments,
    sourceAutopilotState: sourceAutopilot,
    now: renderNow,
  });
  const operatorTaskSummary = buildOperatorTaskSummary(operatorTasks);
  const campaignInsights = buildCampaignDistributionInsights(signals, strategy, postingEntries);
  const campaignCadence = buildCampaignCadenceSummary(signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(currentWeeklyPlan, strategy, signals, postingEntries);
  const confirmedClustersByCanonicalSignalId = indexConfirmedClusterByCanonicalSignalId(duplicateClusters);
  const visibleSignals = filterSignalsForActiveReviewQueue(signals, duplicateClusters);
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
      cadence: campaignCadence,
      weeklyPlan: currentWeeklyPlan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
    },
  );
  const evergreenSummary = buildEvergreenSummary({
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    strategy,
    cadence: campaignCadence,
    weeklyPlan: currentWeeklyPlan,
    weeklyPlanState,
  });
  const weeklyPostingPack = await buildWeeklyPostingPack({
    approvalCandidates: approvalReadyCandidates,
    evergreenSummary,
    strategy,
    weeklyPlan: currentWeeklyPlan,
    weeklyPlanState,
    postingEntries,
    now: renderNow,
  });
  const weeklyPostingPackInsights = buildWeeklyPostingPackInsights(weeklyPostingPack);
  const narrativeSequences = buildNarrativeSequencesForSignals({
    signals,
    strategy,
    maxSequences: 40,
  });
  const narrativeSequenceInsights = buildNarrativeSequenceInsights({
    sequences: narrativeSequences,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const safePostingCandidateBySignalId = new Map(
    rankApprovalCandidates(
      visibleSignals.map((signal) => ({
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
      })),
      Math.max(visibleSignals.length, 1),
      {
        strategy,
        cadence: campaignCadence,
        weeklyPlan: currentWeeklyPlan,
        weeklyPlanState,
        confirmedClustersByCanonicalSignalId,
        allSignals: signals,
        postingEntries,
        postingOutcomes,
        strategicOutcomes,
        experiments,
      },
    ).map((candidate) => [candidate.signal.recordId, candidate] as const),
  );
  const stagedPostingPackages = postingAssistantPackages.filter((pkg) => pkg.status === "staged_for_posting");
  const postedPostingPackages = postingAssistantPackages.filter((pkg) => pkg.status === "posted");
  const storedWeeklyExecutionFlows = await listStoredWeeklyExecutionFlows();
  const weeklyExecutionPreview =
    storedWeeklyExecutionFlows.find((flow) => flow.weekStartDate === weeklyPostingPack.weekStartDate) ??
    prepareWeeklyExecutionFlow({
      weekStartDate: weeklyPostingPack.weekStartDate,
      pack: weeklyPostingPack,
      approvalCandidates: approvalReadyCandidates,
      stagedPackages: stagedPostingPackages,
    }).flow;
  const weeklyExecutionInsights = buildWeeklyExecutionInsights(
    storedWeeklyExecutionFlows.length > 0 ? storedWeeklyExecutionFlows : [weeklyExecutionPreview],
  );
  const commercialRiskInsights = buildCommercialRiskInsights(
    approvalReadyCandidates.map((candidate) => candidate.commercialRisk),
    auditEvents,
  );
  const exceptionInbox = await syncExceptionInbox({
    approvalCandidates: approvalReadyCandidates,
    operatorTasks,
    executionFlow: weeklyExecutionPreview,
    now: renderNow,
  });
  const autonomyScorecard = buildAutonomyScorecard({
    approvalCandidates: approvalReadyCandidates,
    executionFlow: weeklyExecutionPreview,
    auditEvents,
    now: renderNow,
  });
  const influencerGraph = await buildInfluencerGraphState();
  const campaignAllocation = buildCampaignAllocationState({
    strategy,
    signals,
    weeklyPlan: currentWeeklyPlan,
    weeklyPackSignalIds: weeklyPostingPack.items.map((item) => item.signalId),
    approvalCandidates: approvalReadyCandidates,
    cadence: campaignCadence,
    revenueSignals,
    audienceMemory,
    now: renderNow,
  });
  const recommendationScorecard = buildGrowthScorecard({
    approvalCandidates: approvalReadyCandidates,
    weeklyPack: weeklyPostingPack,
    weeklyPackInsights: weeklyPostingPackInsights,
    distributionSummary: {
      readyCount: stagedPostingPackages.length,
      bundleCount: stagedPostingPackages.length,
      multiPlatformBundleCount: 0,
      sequencedBundleCount: 0,
      platformRows: [],
    },
    currentRecap: weeklyRecap,
    previousRecap: buildWeeklyRecap({
      signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
      bundleSummariesByPatternId,
      weekStartDate: new Date(new Date(`${weeklyRecap.weekStartDate}T00:00:00Z`).getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
    }),
    revenueSignals,
    experiments,
    cadence: campaignCadence,
    strategy,
    now: renderNow,
  });
  const recommendationTuning = await syncRecommendationTuningState({
    auditEvents,
    approvalCandidates: approvalReadyCandidates,
    weeklyExecution: weeklyExecutionPreview,
    campaignAllocation,
    growthScorecard: recommendationScorecard,
    weeklyRecap,
    revenueInsights,
    attributionInsights,
    sourceAutopilotState: sourceAutopilot,
    audienceMemory,
    exceptionInbox,
    influencerGraphSummary: influencerGraph.summary,
    activeExperimentCount: experiments.filter((experiment) => experiment.status !== "completed").length,
    now: renderNow,
  });
  const growthMemory = buildGrowthMemory({
    attributionInsights,
    revenueInsights,
    audienceMemory,
    reuseCases: reuseMemoryCases,
    influencerGraph,
    campaignAllocation,
    weeklyRecap,
    now: renderNow,
  });
  const opportunityRadar = buildCommercialOpportunityRadar({
    approvalCandidates: approvalReadyCandidates,
    weeklyPostingPack,
    weeklyRecap,
    growthScorecard: recommendationScorecard,
    attributionInsights,
    revenueInsights,
    audienceMemory,
    sourceAutopilotState: sourceAutopilot,
    influencerGraph,
    campaignAllocation,
    evergreenSummary,
    growthMemory,
    now: renderNow,
  });
  const safeReplyState = await buildSafeReplyState();
  const safePostingEligibilityByPackageId = buildSafePostingEligibilityMap({
    packages: postingAssistantPackages,
    candidateBySignalId: safePostingCandidateBySignalId,
    tuning,
    experiments,
  });
  const safePostingInsights = buildSafePostingInsights({
    packages: postingAssistantPackages,
    eligibilityByPackageId: safePostingEligibilityByPackageId,
  });
  const autonomyPolicyInsights = buildAutonomyPolicyInsights([
    ...approvalReadyCandidates.map((candidate) => candidate.packageAutofill.policy),
    ...approvalReadyCandidates.map((candidate) => candidate.preReviewRepair.policy),
    ...approvalReadyCandidates.map((candidate) =>
      evaluateAutonomyPolicy({
        actionType: "auto_route_to_queue_bucket",
        confidenceLevel: candidate.automationConfidence.level,
        completenessState:
          candidate.completeness.completenessState === "complete"
            ? "complete"
            : candidate.completeness.completenessState === "mostly_complete"
              ? "mostly_complete"
              : "incomplete",
        hasUnresolvedConflicts: candidate.conflicts.conflicts.length > 0,
      }),
    ),
    ...approvalReadyCandidates.map((candidate) =>
      evaluateAutonomyPolicy({
        actionType: "create_experiment_variant",
        confidenceLevel: candidate.automationConfidence.level,
        completenessState:
          candidate.completeness.completenessState === "complete"
            ? "complete"
            : candidate.completeness.completenessState === "mostly_complete"
              ? "mostly_complete"
              : "incomplete",
        hasUnresolvedConflicts: candidate.conflicts.conflicts.length > 0,
      }),
    ),
    ...stagedPostingPackages.map((pkg) => {
      const eligibility = safePostingEligibilityByPackageId[pkg.packageId];
      const decision =
        eligibility?.postingEligibility === "eligible_safe_post"
          ? ("allow" as const)
          : eligibility?.postingEligibility === "manual_only"
            ? ("suggest_only" as const)
            : ("block" as const);
      return {
        actionType: "safe_post" as const,
        decision,
        reasons: eligibility?.blockReasons ?? [eligibility?.manualOnlyReason ?? eligibility?.summary ?? "Safe posting is blocked."],
        policyLane: "strict_guardrails",
        relatedSignals: [],
        summary: eligibility?.summary ?? "Safe posting is blocked.",
      };
    }),
    ...safeReplyState.rows.map((row) => ({
      actionType: "suggest_reply" as const,
      decision: row.policyDecision,
      reasons: row.blockReasons.length > 0 ? row.blockReasons : [row.policySummary],
      policyLane: "reply_guardrails",
      relatedSignals: [`risk:${row.replyRiskLevel}`],
      summary: row.policySummary,
    })),
  ]);
  const stagedPostingPlatformRows = [...new Set(stagedPostingPackages.map((pkg) => pkg.platform))]
    .map((platform) => ({
      platform,
      count: stagedPostingPackages.filter((pkg) => pkg.platform === platform).length,
    }))
    .sort((left, right) => right.count - left.count || left.platform.localeCompare(right.platform));
  const stagedPostedConversionRate =
    stagedPostingPackages.length + postedPostingPackages.length === 0
      ? 0
      : postedPostingPackages.length / (stagedPostingPackages.length + postedPostingPackages.length);
  const postedStagedStrongOutcomeCount = postedPostingPackages.filter((pkg) =>
    postingEntries
      .filter((entry) => entry.signalId === pkg.signalId && entry.platform === pkg.platform)
      .some((entry) => {
        const postingOutcome = postingOutcomes.find((outcome) => outcome.postingLogId === entry.id);
        const strategicOutcome = strategicOutcomes.find((outcome) => outcome.postingLogId === entry.id);
        return postingOutcome?.outcomeQuality === "strong" || strategicOutcome?.strategicValue === "high";
      }),
  ).length;
  const staleQueueOverview = buildStaleQueueOverview(approvalReadyCandidates.map((candidate) => candidate.stale));
  const conflictInsights = buildConflictInsights(
    approvalReadyCandidates.map((candidate) => ({
      conflicts: candidate.conflicts,
      signal: candidate.signal,
    })),
  );
  const conversionIntentInsights = buildConversionIntentInsights({
    signals,
    postingEntries,
    strategicOutcomes,
    attributionRecords,
    revenueSignals,
    strategy,
    audienceMemory,
  });
  const expectedOutcomeInsights = buildExpectedOutcomeInsights(approvalReadyCandidates);
  const currentBatch = buildBatchApprovalPrep({
    candidates: approvalReadyCandidates,
    strategy,
    maxItems: 5,
  });
  const automationConfidenceRows = [
    {
      level: "high" as const,
      label: "High",
      count: approvalReadyCandidates.filter((candidate) => candidate.automationConfidence.level === "high").length,
    },
    {
      level: "medium" as const,
      label: "Medium",
      count: approvalReadyCandidates.filter((candidate) => candidate.automationConfidence.level === "medium").length,
    },
    {
      level: "low" as const,
      label: "Low",
      count: approvalReadyCandidates.filter((candidate) => candidate.automationConfidence.level === "low").length,
    },
  ];
  const autofilledCandidates = approvalReadyCandidates.filter((candidate) => candidate.packageAutofill.mode === "applied");
  const autofillSuggestedCandidates = approvalReadyCandidates.filter((candidate) => candidate.packageAutofill.mode === "suggested");
  const autofillFieldCounts = new Map<string, number>();
  for (const candidate of [...autofilledCandidates, ...autofillSuggestedCandidates]) {
    for (const note of candidate.packageAutofill.notes) {
      autofillFieldCounts.set(note.label, (autofillFieldCounts.get(note.label) ?? 0) + 1);
    }
  }
  const autofillTopFields = [...autofillFieldCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5);
  const postingIdsBySignalId = new Map<string, string[]>();
  for (const entry of postingEntries) {
    postingIdsBySignalId.set(entry.signalId, [...(postingIdsBySignalId.get(entry.signalId) ?? []), entry.id]);
  }
  const postedSignalIds = new Set(postingEntries.map((entry) => entry.signalId));
  const postingOutcomeById = new Map(postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicOutcomeById = new Map(strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const autofilledPostedCount = autofilledCandidates.filter(
    (candidate) => (postingIdsBySignalId.get(candidate.signal.recordId)?.length ?? 0) > 0,
  ).length;
  const autofilledStrongOutcomeCount = autofilledCandidates.filter((candidate) =>
    (postingIdsBySignalId.get(candidate.signal.recordId) ?? []).some((postingId) => {
      const postingOutcome = postingOutcomeById.get(postingId);
      const strategicOutcome = strategicOutcomeById.get(postingId);
      return postingOutcome?.outcomeQuality === "strong" || strategicOutcome?.strategicValue === "high";
    }),
  ).length;
  const preReviewRepairInsights = buildPreReviewRepairInsights(
    approvalReadyCandidates.map((candidate) => candidate.preReviewRepair),
    postedSignalIds,
  );
  const ctaDestinationHealingInsights = buildPreReviewHealingInsights(
    approvalReadyCandidates.map((candidate) => candidate.preReviewRepair),
    postedSignalIds,
  );
  const queueTriageInsights = buildQueueTriageInsights(
    approvalReadyCandidates.map((candidate) => candidate.triage),
  );
  const distributionPriorityInsights = buildDistributionPriorityInsights(
    approvalReadyCandidates.map((candidate) => candidate.distributionPriority),
  );
  const experimentProposals = buildAutonomousExperimentProposals({
    candidates: approvalReadyCandidates,
    experiments,
    storedProposals: storedExperimentProposals,
    maxProposals: 6,
  });
  const automationAuditEvents = auditEvents.filter((event) => event.eventType === "CONFIDENCE_ASSIGNED");
  const automationUsageByLevel = automationConfidenceRows.map((row) => ({
    ...row,
    autofillAppliedCount: approvalReadyCandidates.filter(
      (candidate) => candidate.automationConfidence.level === row.level && candidate.packageAutofill.mode === "applied",
    ).length,
    autofillSuggestedCount: approvalReadyCandidates.filter(
      (candidate) => candidate.automationConfidence.level === row.level && candidate.packageAutofill.mode === "suggested",
    ).length,
    autofillBlockedCount: approvalReadyCandidates.filter(
      (candidate) => candidate.automationConfidence.level === row.level && candidate.packageAutofill.mode === "blocked",
    ).length,
    batchEligibleCount: approvalReadyCandidates.filter(
      (candidate) => candidate.automationConfidence.level === row.level && candidate.automationConfidence.allowBatchInclusion,
    ).length,
  }));
  const experimentProposalInsights = buildExperimentProposalInsights(experimentProposals);
  const flywheelOptimisation = buildFlywheelOptimisation({
    weeklyRecap,
    sourceAutopilotState: sourceAutopilot,
    playbookCoverageSummary,
    weeklyPostingPack,
    evergreenSummary,
    experimentProposalInsights,
    narrativeSequenceInsights,
    revenueInsights,
    audienceMemory,
    recommendationTuning,
    now: renderNow,
  });
  const experimentAutopilotEvaluations = approvalReadyCandidates.map((candidate) =>
    buildExperimentAutopilotV2({
      candidate,
      experiments,
    }),
  );
  const experimentAutopilotBlocked = experimentAutopilotEvaluations.filter((entry) => entry.decision === "blocked");
  const experimentAutopilotCreated = experimentAutopilotEvaluations.filter((entry) => entry.decision === "created");
  const experimentAutopilotTypeRows = Array.from(
    experimentAutopilotCreated.reduce((map, entry) => {
      if (!entry.variable) {
        return map;
      }

      map.set(entry.variable, (map.get(entry.variable) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .map(([label, count]) => ({
      label: label.replaceAll("_", " "),
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  const experimentAutopilotBlockRows = Array.from(
    experimentAutopilotBlocked.reduce((map, entry) => {
      const label = entry.blockReasons[0] ?? "Experiment autopilot stayed blocked.";
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .map(([label, count]) => ({
      label,
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 4);
  const weeklyPlanInsights = buildWeeklyPlanInsights(
    weeklyPlanStore.plans,
    strategy,
    signals,
    postingEntries,
    strategicOutcomes,
  );
  const followUpTasks = await listFollowUpTasks({
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    weeklyPlans: weeklyPlanStore.plans,
  });
  const openFollowUpTasks = followUpTasks.filter((task) => task.status === "open");
  const overdueFollowUpTasks = openFollowUpTasks.filter((task) => new Date(task.dueAt).getTime() < renderNow.getTime());
  const strategicCoverageRatio =
    postingEntries.length === 0
      ? 0
      : strategicOutcomes.length / postingEntries.length;
  const experimentInsights = buildExperimentInsights({
    experiments,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const batchPrepCreatedCount = auditEvents.filter((event) => event.eventType === "BATCH_APPROVAL_PREP_CREATED").length;
  const batchApprovedEvents = auditEvents.filter((event) => event.eventType === "BATCH_ITEM_APPROVED");
  const batchHeldEvents = auditEvents.filter((event) => event.eventType === "BATCH_ITEM_HELD");
  const batchSkippedEvents = auditEvents.filter((event) => event.eventType === "BATCH_ITEM_SKIPPED");
  const batchConvertedCount = auditEvents.filter((event) => event.eventType === "BATCH_ITEM_CONVERTED_TO_EXPERIMENT").length;
  const batchReasonCounts = new Map<string, number>();
  for (const event of [...batchHeldEvents, ...batchSkippedEvents]) {
    const reason = typeof event.metadata?.reason === "string" && event.metadata.reason.trim().length > 0
      ? event.metadata.reason.trim()
      : event.eventType === "BATCH_ITEM_HELD"
        ? "Held for follow-up"
        : "Skipped without note";
    batchReasonCounts.set(reason, (batchReasonCounts.get(reason) ?? 0) + 1);
  }
  const topBatchReasons = [...batchReasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 4);
  const batchApprovedSignalIds = new Set(batchApprovedEvents.map((event) => event.signalId));
  const batchPostedSignalIds = new Set(
    postingEntries.filter((entry) => batchApprovedSignalIds.has(entry.signalId)).map((entry) => entry.signalId),
  );
  const recentSignals = [...signals]
    .sort(
      (left, right) =>
        new Date(right.createdDate).getTime() - new Date(left.createdDate).getTime() ||
        left.sourceTitle.localeCompare(right.sourceTitle),
    )
    .slice(0, 16);
  const fatigueModel = buildFatigueModel({
    subjects: recentSignals.map((signal) => ({
      id: signal.recordId,
      signal,
    })),
    signals,
    postingEntries,
  });
  await appendAuditEventsSafe(
    insights.playbook.topCoverageGaps.map((gap) => ({
      signalId: `playbook-gap:${gap.key}`,
      eventType: "PLAYBOOK_GAP_DETECTED",
      actor: "system",
      summary: `Playbook coverage gap detected: ${gap.summary}`,
      metadata: {
        gapKind: gap.kind,
        flag: gap.flag,
        coverageArea: gap.label,
        signalCount: gap.signalCount,
        strongOutcomeCount: gap.strongOutcomeCount,
        weakOutcomeCount: gap.weakOutcomeCount,
        cautionCount: gap.cautionCount,
        cardCount: gap.cardCount,
      },
    })),
  );
  await appendAuditEventsSafe(
    fatigueModel.topWarnings.map((warning) => ({
      signalId: `fatigue:${warning.dimension}:${warning.key}`,
      eventType: "FATIGUE_WARNING_SHOWN",
      actor: "system",
      summary: warning.summary,
      metadata: {
        dimension: warning.dimension,
        label: warning.label,
        severity: warning.severity,
        count: warning.count,
        total: warning.total,
      },
    })),
  );
  const topDestinationInsight = insights.publishPrep.strongestDestinationRows[0];
  if (topDestinationInsight && (topDestinationInsight.highValueCount >= 2 || topDestinationInsight.leadTotal > 0)) {
    await appendAuditEventsSafe([
      {
        signalId: `destination-insight:${topDestinationInsight.key}`,
        eventType: "DESTINATION_INSIGHT_COMPUTED",
        actor: "system",
        summary: `${topDestinationInsight.label} is currently the strongest destination for manual strategic value.`,
        metadata: {
          destinationKey: topDestinationInsight.key,
          label: topDestinationInsight.label,
          highValueCount: topDestinationInsight.highValueCount,
          leadTotal: topDestinationInsight.leadTotal,
          clickTotal: topDestinationInsight.clickTotal,
          topPlatformLabel: topDestinationInsight.topPlatformLabel,
          topFunnelLabel: topDestinationInsight.topFunnelLabel,
        },
      },
    ]);
  }
  const scoredStage = insights.pipeline.stages.find((stage) => stage.key === "scored");
  const interpretedStage = insights.pipeline.stages.find((stage) => stage.key === "interpreted");
  const generatedStage = insights.pipeline.stages.find((stage) => stage.key === "generated");
  const filteredStage = insights.pipeline.stages.find((stage) => stage.key === "filteredOut");
  const topSourceKind = insights.sourceKinds[0];
  const topSource = insights.topSources[0];
  const topOverrideStage = insights.operator.overrideStageRows[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{insights.windowLabel}</Badge>
          </div>
          <CardTitle className="text-balance text-3xl">Insights</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            A compact operating summary derived from current record state and the audit trail. It stays descriptive on purpose: the goal is to show what is moving, what is stalling, and where operator judgement is stepping in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap gap-2">
            <WindowLink href="/insights" label="All time" active={window === "all"} />
            <WindowLink href="/insights?window=7d" label="Last 7 days" active={window === "7d"} />
            <WindowLink href="/insights?window=30d" label="Last 30 days" active={window === "30d"} />
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span>{insights.totalSignals} records in view</span>
            <span>{insights.dateRangeLabel}</span>
            {error ? <span className="text-amber-700">{error}</span> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Operator Tuning</CardTitle>
          <CardDescription>
            Results in this view reflect the active operator mode and its bounded behavior shifts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{insights.tuning.presetLabel}</Badge>
            <span className="text-sm text-slate-500">{insights.tuning.summary}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.tuning.rows.map((row) => (
              <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{row.valueLabel}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <RecommendationTuningPanel state={recommendationTuning} compact />
      <GrowthMemoryPanel memory={growthMemory} />
      <OpportunityRadarPanel state={opportunityRadar} />

      <Card>
        <CardHeader>
          <CardTitle>Content Fatigue</CardTitle>
          <CardDescription>
            Repetition warnings across recent records and posting history. This layer is advisory only and never auto-suppresses content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fatigueModel.topWarnings.length === 0 ? (
            <EmptyState copy="No strong fatigue signal is dominating the recent mix." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {fatigueModel.topWarnings.map((warning) => (
                <div key={`${warning.dimension}:${warning.key}`} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={warning.severity === "moderate" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                      {warning.severity === "moderate" ? "Moderate fatigue" : "Light fatigue"}
                    </Badge>
                    <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{warning.count} / {warning.total}</Badge>
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{warning.summary}</p>
                  <p className="mt-2 text-sm text-slate-600">{warning.label}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expected Outcome Ranking</CardTitle>
          <CardDescription>
            Bounded expected-value assessment for approval-ready candidates. It combines readiness with strategic support such as destination history, prior outcomes, source quality, fatigue, experiments, and campaign fit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="High expected value"
              value={String(expectedOutcomeInsights.highCount)}
              detail="Approval-ready candidates with the strongest combined commercial support."
            />
            <MetricCard
              label="Medium expected value"
              value={String(expectedOutcomeInsights.mediumCount)}
              detail="Candidates with enough support to stay near the top but not dominate the queue."
            />
            <MetricCard
              label="Low expected value"
              value={String(expectedOutcomeInsights.lowCount)}
              detail="Candidates that are still viable but held back by weak support or visible risks."
            />
            <MetricCard
              label="Top high-value platform"
              value={expectedOutcomeInsights.platformRows[0]?.label ?? "None yet"}
              detail={
                expectedOutcomeInsights.platformRows[0]
                  ? `${expectedOutcomeInsights.platformRows[0].count} high-tier candidates in the current queue.`
                  : "No platform has enough high-tier support yet."
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              {approvalReadyCandidates.length === 0 ? (
                <EmptyState copy="No approval-ready candidates are available yet, so expected-value ranking has nothing to summarize." />
              ) : (
                approvalReadyCandidates.slice(0, 5).map((candidate) => (
                  <div key={candidate.signal.recordId} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={expectedOutcomeClasses(candidate.expectedOutcome.expectedOutcomeTier)}>
                        {candidate.expectedOutcome.expectedOutcomeTier} expected value
                      </Badge>
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                        #{approvalReadyCandidates.findIndex((item) => item.signal.recordId === candidate.signal.recordId) + 1}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Link href={`/signals/${candidate.signal.recordId}/review`} className="font-medium text-slate-950 hover:text-[color:var(--accent)]">
                        {candidate.signal.sourceTitle}
                      </Link>
                      <span className="text-sm text-slate-500">{candidate.expectedOutcome.platformLabel}</span>
                      {candidate.expectedOutcome.modeLabel ? <span className="text-sm text-slate-500">{candidate.expectedOutcome.modeLabel}</span> : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {candidate.expectedOutcome.expectedOutcomeReasons[0] ?? "Expected outcome support is still forming."}
                    </p>
                    {candidate.expectedOutcome.expectedOutcomeReasons[1] ? (
                      <p className="mt-2 text-sm text-slate-500">{candidate.expectedOutcome.expectedOutcomeReasons[1]}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">Most common positive supports</p>
                <div className="mt-3 space-y-2">
                  {expectedOutcomeInsights.topPositiveFactors.length === 0 ? (
                    <p className="text-sm text-slate-500">No stable positive support factors yet.</p>
                  ) : (
                    expectedOutcomeInsights.topPositiveFactors.map((factor) => (
                      <div key={factor.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-600">{factor.label}</span>
                        <span className="font-medium text-slate-950">{factor.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">Most common drag factors</p>
                <div className="mt-3 space-y-2">
                  {expectedOutcomeInsights.topRiskFactors.length === 0 ? (
                    <p className="text-sm text-slate-500">No recurring risk cluster is strong enough to surface yet.</p>
                  ) : (
                    expectedOutcomeInsights.topRiskFactors.map((factor) => (
                      <div key={factor.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-600">{factor.label}</span>
                        <span className="font-medium text-slate-950">{factor.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {expectedOutcomeInsights.destinationRows[0]
                  ? `${expectedOutcomeInsights.destinationRows[0].label} is the destination most often attached to high expected-value candidates in the current queue.`
                  : "No destination pattern is strong enough to call out yet."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {expectedOutcomeInsights.modeRows[0]
                  ? `${expectedOutcomeInsights.modeRows[0].label} is the editorial mode most often appearing in the current high expected-value tier.`
                  : "No editorial mode is dominating the current high expected-value tier."}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversion-Intent Optimisation</CardTitle>
          <CardDescription>
            Lightweight posture guidance showing when the current system is learning to stay awareness-led, trust-first, softly conversion-oriented, or ready for a direct ask.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Top posture"
              value={conversionIntentInsights.postureRows[0]?.label ?? "None yet"}
              detail={
                conversionIntentInsights.postureRows[0]
                  ? `${conversionIntentInsights.postureRows[0].count} posted examples currently support this posture most often.`
                  : "No stable conversion-posture evidence has formed yet."
              }
            />
            <MetricCard
              label="Strong trust-first"
              value={String(conversionIntentInsights.postureRows.find((row) => row.posture === "trust_first")?.strongCount ?? 0)}
              detail="Posted items with stronger strategic support while staying trust-first."
            />
            <MetricCard
              label="Revenue-backed soft conversion"
              value={String(conversionIntentInsights.postureRows.find((row) => row.posture === "soft_conversion")?.revenueCount ?? 0)}
              detail="Revenue-linked examples that still kept the CTA gentler than a hard conversion ask."
            />
            <MetricCard
              label="Top platform fit"
              value={conversionIntentInsights.platformRows[0]?.label ?? "None yet"}
              detail={
                conversionIntentInsights.platformRows[0]
                  ? `${conversionIntentInsights.platformRows[0].label} most often supports ${getConversionIntentLabel(conversionIntentInsights.platformRows[0].posture).toLowerCase()}.`
                  : "No platform conversion-posture pattern is stable enough to call out yet."
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Posture performance</p>
              {conversionIntentInsights.postureRows.length === 0 ? (
                <EmptyState copy="No posted evidence is stable enough yet to summarize conversion posture." />
              ) : (
                conversionIntentInsights.postureRows.map((row) => (
                  <div key={row.posture} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">{row.label}</p>
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {row.strongCount} strong strategic outcomes · {row.revenueCount} revenue-linked outcomes
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">Platform posture pairs</p>
                <div className="mt-3 space-y-2">
                  {conversionIntentInsights.platformRows.length === 0 ? (
                    <p className="text-sm text-slate-500">No platform posture pair is stable enough yet.</p>
                  ) : (
                    conversionIntentInsights.platformRows.slice(0, 5).map((row) => (
                      <div key={`${row.label}-${row.posture}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-600">{row.label} · {getConversionIntentLabel(row.posture)}</span>
                        <span className="font-medium text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {conversionIntentInsights.summary.length === 0 ? (
                <EmptyState copy="No bounded conversion-intent summary is ready yet." />
              ) : (
                conversionIntentInsights.summary.map((item) => (
                  <div key={item} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {item}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approval Autopilot</CardTitle>
          <CardDescription>
            Bounded package-filler visibility for near-complete candidates. It only fills low-risk package gaps and never bypasses final review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Autofilled candidates"
              value={String(autofilledCandidates.length)}
              detail="Approval-ready candidates that received at least one bounded package fill."
            />
            <MetricCard
              label="Most common fill"
              value={autofillTopFields[0]?.label ?? "None yet"}
              detail={
                autofillTopFields[0]
                  ? `${autofillTopFields[0].count} candidates used this autofill most recently.`
                  : "No package autofill pattern is stable enough yet."
              }
            />
            <MetricCard
              label="Autofilled already posted"
              value={String(autofilledPostedCount)}
              detail="Signals that later moved from approval prep into the manual posting log."
            />
            <MetricCard
              label="Autofilled strong outcomes"
              value={String(autofilledStrongOutcomeCount)}
              detail="Autofilled candidates with strong qualitative or strategic outcomes where data exists."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Most common autofill fields</p>
              <div className="mt-3 space-y-2">
                {autofillTopFields.length === 0 ? (
                  <p className="text-sm text-slate-500">No approval-ready candidate required package autofill recently.</p>
                ) : (
                  autofillTopFields.map((field) => (
                    <div key={field.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600">{field.label}</span>
                      <span className="font-medium text-slate-950">{field.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Recent autofill examples</p>
              <div className="mt-3 space-y-3">
                {autofilledCandidates.length === 0 ? (
                  <p className="text-sm text-slate-500">No recent approval-ready candidate needed bounded packaging help.</p>
                ) : (
                  autofilledCandidates.slice(0, 4).map((candidate) => (
                    <div key={candidate.signal.recordId} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                      <Link href={`/signals/${candidate.signal.recordId}/review`} className="font-medium text-slate-950 hover:text-[color:var(--accent)]">
                        {candidate.signal.sourceTitle}
                      </Link>
                      <p className="mt-2 text-sm text-slate-600">
                        {candidate.packageAutofill.notes.slice(0, 2).map((note) => `${note.label}: ${note.value}`).join(" · ")}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pre-Review Repair Autopilot</CardTitle>
          <CardDescription>
            Low-risk package cleanup that runs before final review for high-confidence, non-conflicted candidates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Repairs applied"
              value={String(preReviewRepairInsights.appliedCount)}
              detail="Approval-ready candidates that reached review with bounded cleanup already applied."
            />
            <MetricCard
              label="Top repair"
              value={preReviewRepairInsights.topRepairTypes[0]?.label.replaceAll("_", " ") ?? "None yet"}
              detail={
                preReviewRepairInsights.topRepairTypes[0]
                  ? `${preReviewRepairInsights.topRepairTypes[0].count} candidates used this repair most often.`
                  : "No repair pattern is stable enough yet."
              }
            />
            <MetricCard
              label="Repairs blocked"
              value={String(preReviewRepairInsights.blockedCount)}
              detail="Candidates kept out of the repair lane because trust guardrails failed."
            />
            <MetricCard
              label="Repaired then posted"
              value={String(preReviewRepairInsights.repairedPostedCount)}
              detail="Repaired candidates that later reached the posting log."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Most common repair types</p>
              <div className="mt-3 space-y-2">
                {preReviewRepairInsights.topRepairTypes.length === 0 ? (
                  <p className="text-sm text-slate-500">No pre-review repair pattern is stable enough yet.</p>
                ) : (
                  preReviewRepairInsights.topRepairTypes.map((repair) => (
                    <div key={repair.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600">{repair.label.replaceAll("_", " ")}</span>
                      <span className="font-medium text-slate-950">{repair.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Recent repaired candidates</p>
              <div className="mt-3 space-y-3">
                {approvalReadyCandidates.filter((candidate) => candidate.preReviewRepair.decision === "applied").length === 0 ? (
                  <p className="text-sm text-slate-500">No approval-ready candidate needed bounded repair recently.</p>
                ) : (
                  approvalReadyCandidates
                    .filter((candidate) => candidate.preReviewRepair.decision === "applied")
                    .slice(0, 4)
                    .map((candidate) => (
                      <div key={candidate.signal.recordId} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                        <Link href={`/signals/${candidate.signal.recordId}/review`} className="font-medium text-slate-950 hover:text-[color:var(--accent)]">
                          {candidate.signal.sourceTitle}
                        </Link>
                        <p className="mt-2 text-sm text-slate-600">{candidate.preReviewRepair.summary}</p>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CTA / Destination Self-Healing</CardTitle>
          <CardDescription>
            Bounded commercial pair repair that only adjusts clearly weak CTA and destination combinations when a safer aligned pair already exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Self-heals applied"
              value={String(ctaDestinationHealingInsights.appliedCount)}
              detail="Candidates where CTA or destination alignment was improved automatically before review."
            />
            <MetricCard
              label="Top self-heal"
              value={ctaDestinationHealingInsights.topHealingTypes[0]?.label.replaceAll("_", " ") ?? "None yet"}
              detail={
                ctaDestinationHealingInsights.topHealingTypes[0]
                  ? `${ctaDestinationHealingInsights.topHealingTypes[0].count} candidates used this healing pattern most often.`
                  : "No healing pattern is stable enough yet."
              }
            />
            <MetricCard
              label="Healing blocked"
              value={String(ctaDestinationHealingInsights.blockedCount)}
              detail="Candidates left untouched because policy, experiment locks, or manual ownership blocked the change."
            />
            <MetricCard
              label="Healed then posted"
              value={String(ctaDestinationHealingInsights.healedPostedCount)}
              detail="Self-healed candidates that later reached the posting log."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Most common healing types</p>
              <div className="mt-3 space-y-2">
                {ctaDestinationHealingInsights.topHealingTypes.length === 0 ? (
                  <p className="text-sm text-slate-500">No CTA or destination healing pattern is stable enough yet.</p>
                ) : (
                  ctaDestinationHealingInsights.topHealingTypes.map((healing) => (
                    <div key={healing.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600">{healing.label.replaceAll("_", " ")}</span>
                      <span className="font-medium text-slate-950">{healing.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Strongest healed pairings</p>
              <div className="mt-3 space-y-2">
                {ctaDestinationHealingInsights.strongestPairings.length === 0 ? (
                  <p className="text-sm text-slate-500">No healed pairing is repeated often enough yet.</p>
                ) : (
                  ctaDestinationHealingInsights.strongestPairings.map((pairing) => (
                    <div key={pairing.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600">{pairing.label}</span>
                      <span className="font-medium text-slate-950">{pairing.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autonomous Queue Triage</CardTitle>
          <CardDescription>
            One bounded classifier now routes current queue items into explainable operational buckets instead of leaving the operator to infer the lane manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Repairable"
              value={String(queueTriageInsights.repairableCount)}
              detail="Near-ready items where bounded cleanup is still the best next step."
            />
            <MetricCard
              label="Needs judgement"
              value={String(queueTriageInsights.distribution.find((row) => row.triageState === "needs_judgement")?.count ?? 0)}
              detail="Candidates that still need an explicit operator call."
            />
            <MetricCard
              label="Evergreen later"
              value={String(queueTriageInsights.staleButReusableCount)}
              detail="Strong items currently better parked for later reuse."
            />
            <MetricCard
              label="Suppressed"
              value={String(queueTriageInsights.suppressionCount)}
              detail="Visible but demoted items that should stay out of the top queue for now."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Triage distribution</p>
              <div className="mt-3 space-y-2">
                {queueTriageInsights.distribution.map((row) => (
                  <div key={row.triageState} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-600">{row.label}</span>
                    <span className="font-medium text-slate-950">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Common needs-judgement reasons</p>
              <div className="mt-3 space-y-2">
                {queueTriageInsights.topNeedsJudgementReasons.length === 0 ? (
                  <p className="text-sm text-slate-500">No repeated judgement reason is stable enough yet.</p>
                ) : (
                  queueTriageInsights.topNeedsJudgementReasons.map((reason) => (
                    <div key={reason.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600">{reason.label}</span>
                      <span className="font-medium text-slate-950">{reason.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Batch Approval Prep</CardTitle>
          <CardDescription>
            Small bounded review sets built from the strongest near-final candidates. This layer is for faster operator throughput, not bulk publishing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Current batch"
              value={String(currentBatch.items.length)}
              detail="Candidates currently staged for one-pass batch review."
            />
            <MetricCard
              label="Batch openings"
              value={String(batchPrepCreatedCount)}
              detail="Recorded batch review openings in the audit trail."
            />
            <MetricCard
              label="Batch approvals"
              value={String(batchApprovedEvents.length)}
              detail="Items approved directly from the batch surface."
            />
            <MetricCard
              label="Approved then posted"
              value={String(batchPostedSignalIds.size)}
              detail="Batch-approved signals that later reached the posting log."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Current prepared set</p>
              <div className="mt-3 space-y-3">
                {currentBatch.items.length === 0 ? (
                  <p className="text-sm text-slate-500">No current batch is strong enough to stage yet.</p>
                ) : (
                  currentBatch.items.map((item) => (
                    <div key={item.signalId} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={expectedOutcomeClasses(item.expectedOutcomeTier)}>{item.expectedOutcomeTier} expected value</Badge>
                        <Badge className={automationConfidenceClasses(item.automationConfidenceLevel)}>{item.automationConfidenceSummary}</Badge>
                      </div>
                      <Link href={item.reviewHref} className="mt-3 block font-medium text-slate-950 hover:text-[color:var(--accent)]">
                        {item.sourceTitle}
                      </Link>
                      <p className="mt-2 text-sm text-slate-600">{item.strongestRationale}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">Batch outcomes</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>Held in batch</span>
                    <span className="font-medium text-slate-950">{batchHeldEvents.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Skipped in batch</span>
                    <span className="font-medium text-slate-950">{batchSkippedEvents.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Converted to experiment</span>
                    <span className="font-medium text-slate-950">{batchConvertedCount}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">Common hold or skip reasons</p>
                <div className="mt-3 space-y-2">
                  {topBatchReasons.length === 0 ? (
                    <p className="text-sm text-slate-500">No repeated batch hold or skip reason is stable enough yet.</p>
                  ) : (
                    topBatchReasons.map((entry) => (
                      <div key={entry.reason} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-600">{entry.reason}</span>
                        <span className="font-medium text-slate-950">{entry.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automation Confidence</CardTitle>
          <CardDescription>
            Explicit confidence lanes that gate package autofill, batch inclusion, experiment suggestions, and review priority.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Assigned lanes"
              value={String(automationAuditEvents.length)}
              detail="Confidence assignments recorded in the audit trail."
            />
            <MetricCard
              label="Autofill applied"
              value={String(autofilledCandidates.length)}
              detail="High-confidence candidates that were safe for bounded autofill."
            />
            <MetricCard
              label="Autofill suggested"
              value={String(autofillSuggestedCandidates.length)}
              detail="Medium-confidence candidates where the system only suggested package help."
            />
            <MetricCard
              label="Hold lane"
              value={String(automationConfidenceRows.find((row) => row.level === "low")?.count ?? 0)}
              detail="Low-confidence candidates that should stay in operator judgement."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Current lane distribution</p>
              <div className="mt-3 space-y-3">
                {automationUsageByLevel.map((row) => (
                  <div key={row.level} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Badge className={automationConfidenceClasses(row.level)}>{row.label} confidence</Badge>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {row.level === "high"
                        ? `${row.autofillAppliedCount} autofill-ready · ${row.batchEligibleCount} batch-ready`
                        : row.level === "medium"
                          ? `${row.autofillSuggestedCount} suggest-only candidates · ${experimentProposalInsights.openCount} open experiment proposals`
                          : `${row.autofillBlockedCount} blocked from autopilot`}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Confidence rules in practice</p>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-50/80 px-3 py-3">
                  <p className="font-medium text-slate-900">High</p>
                  <p className="mt-1">Safe to autopilot. Allows bounded autofill, stronger ranking lift, and batch inclusion.</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 px-3 py-3">
                  <p className="font-medium text-slate-900">Medium</p>
                  <p className="mt-1">Suggest only. Allows experiment proposals and bounded package suggestions, but no silent automation.</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 px-3 py-3">
                  <p className="font-medium text-slate-900">Low</p>
                  <p className="mt-1">Hold for operator judgement. Low-confidence candidates remain visible, but autopilot is blocked.</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commercial Risk Guardrails</CardTitle>
          <CardDescription>
            A bounded risk layer that flags trust, tone, repetition, evidence, and audience-fit issues before approval or staging.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Risky candidates"
              value={String(commercialRiskInsights.riskyCount)}
              detail="Approval candidates currently carrying at least one commercial risk flag."
            />
            <MetricCard
              label="Blocked"
              value={String(commercialRiskInsights.blockedCount)}
              detail="High-risk cases that should not stage automatically."
            />
            <MetricCard
              label="Fix suggested"
              value={String(commercialRiskInsights.suggestFixCount)}
              detail="Medium-risk cases that should be adjusted before approval or staging."
            />
            <MetricCard
              label="Top risk"
              value={commercialRiskInsights.topRiskTypes[0]?.label ?? "None yet"}
              detail={commercialRiskInsights.topRiskTypes[0] ? `${commercialRiskInsights.topRiskTypes[0].count} current candidates.` : "No repeated risk type is stable enough yet."}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current risk read</p>
              {commercialRiskInsights.trendSummary.length === 0 ? (
                <EmptyState copy="No stable commercial risk pattern is visible right now." />
              ) : (
                commercialRiskInsights.trendSummary.map((summary) => (
                  <div key={summary} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {summary}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">Most common risks</p>
                <div className="mt-3 space-y-2">
                  {commercialRiskInsights.topRiskTypes.length === 0 ? (
                    <p className="text-sm text-slate-500">No repeated commercial risk is stable enough to call out yet.</p>
                  ) : (
                    commercialRiskInsights.topRiskTypes.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-600">{row.label}</span>
                        <span className="font-medium text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">Suggested fixes</p>
                <div className="mt-3 space-y-2">
                  {commercialRiskInsights.topSuggestedFixes.length === 0 ? (
                    <p className="text-sm text-slate-500">No repeated suggested fix is stable enough yet.</p>
                  ) : (
                    commercialRiskInsights.topSuggestedFixes.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-600">{row.label}</span>
                        <span className="font-medium text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autonomy Scorecard</CardTitle>
          <CardDescription>
            A compact operational snapshot of how much of the workflow is fully autonomous, partially assisted, or still concentrated in human review and policy blocks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Autonomy rate"
              value={formatPercent(autonomyScorecard.autonomyRate)}
              detail={`${autonomyScorecard.approvalReadyWithoutChanges} approval-ready without extra intervention.`}
            />
            <MetricCard
              label="Partial autonomy"
              value={formatPercent(autonomyScorecard.partialAutonomyRate)}
              detail={`${autonomyScorecard.autoRepairedCount} repaired · ${autonomyScorecard.autoHealedCount} healed · ${autonomyScorecard.autoAdvancedCount} auto-advanced.`}
            />
            <MetricCard
              label="Blocked rate"
              value={formatPercent(autonomyScorecard.blockedRate)}
              detail={`${autonomyScorecard.blockedByPolicyCount} policy · ${autonomyScorecard.blockedByConflictCount} conflict · ${autonomyScorecard.blockedByMissingData} missing data.`}
            />
            <MetricCard
              label="Operator effort"
              value={String(autonomyScorecard.operatorInterventionsRequired)}
              detail="Candidates still concentrating direct human attention."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Operational read</p>
              {autonomyScorecard.summaries.length === 0 ? (
                <EmptyState copy="No autonomy scorecard summary is stable enough yet." />
              ) : (
                autonomyScorecard.summaries.map((summary) => (
                  <div key={summary} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {summary}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">Top blockers</p>
                <div className="mt-3 space-y-2">
                  {autonomyScorecard.topBlockers.length === 0 ? (
                    <p className="text-sm text-slate-500">No repeated autonomy blocker is stable enough to call out yet.</p>
                  ) : (
                    autonomyScorecard.topBlockers.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-600">{row.label}</span>
                        <span className="font-medium text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">Operator effort concentration</p>
                <div className="mt-3 space-y-2">
                  {autonomyScorecard.operatorEffortAreas.length === 0 ? (
                    <p className="text-sm text-slate-500">No operator effort concentration is strong enough to summarize yet.</p>
                  ) : (
                    autonomyScorecard.operatorEffortAreas.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-600">{row.label}</span>
                        <span className="font-medium text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autonomy Policy Engine</CardTitle>
          <CardDescription>
            One central guardrail layer now decides when the engine may act, when it should stay suggest-only, and when it must block.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Allowed"
              value={String(autonomyPolicyInsights.allowedCount)}
              detail="Low-risk evaluations currently allowed by the shared policy engine."
            />
            <MetricCard
              label="Suggest only"
              value={String(autonomyPolicyInsights.suggestOnlyCount)}
              detail="Cases where the engine can help, but should not apply changes silently."
            />
            <MetricCard
              label="Blocked"
              value={String(autonomyPolicyInsights.blockedCount)}
              detail="Evaluations blocked because confidence, completeness, conflict, or risk guardrails failed."
            />
            <MetricCard
              label="Top blocker"
              value={autonomyPolicyInsights.topBlockReasons[0]?.count ? String(autonomyPolicyInsights.topBlockReasons[0].count) : "0"}
              detail={autonomyPolicyInsights.topBlockReasons[0]?.label ?? "No repeated block reason is stable enough yet."}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Policy lanes in practice</p>
              <div className="mt-3 space-y-3">
                {autonomyPolicyInsights.byAction.slice(0, 5).map((row) => (
                  <div key={row.actionType} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-slate-900">{row.actionType.replaceAll("_", " ")}</p>
                      <span className="text-sm text-slate-500">
                        {row.allowedCount} allow · {row.suggestOnlyCount} suggest · {row.blockedCount} block
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Common block reasons</p>
              <div className="mt-3 space-y-3">
                {autonomyPolicyInsights.topBlockReasons.length === 0 ? (
                  <p className="text-sm text-slate-500">No stable block reason is repeated enough to call out yet.</p>
                ) : (
                  autonomyPolicyInsights.topBlockReasons.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50/80 px-3 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outcome Follow-Up</CardTitle>
          <CardDescription>
            Bounded autopilot visibility for posted items, experiments, and weekly packs that still need manual learning updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Open follow-up tasks"
              value={String(openFollowUpTasks.length)}
              detail="Visible manual follow-up tasks currently generated from posted items and experimental gaps."
            />
            <MetricCard
              label="Overdue tasks"
              value={String(overdueFollowUpTasks.length)}
              detail="Tasks whose due window has already passed."
            />
            <MetricCard
              label="Experiment gaps"
              value={String(openFollowUpTasks.filter((task) => task.taskType === "complete_experiment_result").length)}
              detail="Open experiment tasks still waiting on manual results."
            />
            <MetricCard
              label="Strategic coverage"
              value={`${Math.round(strategicCoverageRatio * 100)}%`}
              detail="Posted items with completed strategic outcomes."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="font-medium text-slate-950">Most urgent follow-up tasks</p>
              <div className="mt-3 space-y-3">
                {openFollowUpTasks.length === 0 ? (
                  <p className="text-sm text-slate-500">No follow-up gap is currently open.</p>
                ) : (
                  openFollowUpTasks.slice(0, 5).map((task) => (
                    <div key={task.id} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                      <Link href={task.href} className="font-medium text-slate-950 hover:text-[color:var(--accent)]">
                        {task.title}
                      </Link>
                      <p className="mt-2 text-sm text-slate-600">{task.reason}</p>
                      <p className="mt-2 text-xs text-slate-500">{task.dueAt.slice(0, 10)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {overdueFollowUpTasks[0]
                ? `${overdueFollowUpTasks[0].title} is currently the most urgent missed learning loop in the system.`
                : "No overdue follow-up queue is building up right now."}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Campaign Strategy</CardTitle>
            <CardDescription>
              Current strategic context that is shaping content assignment and approval ranking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Active campaigns"
                value={String(campaignCadence.activeCampaignCount)}
                detail={campaignCadence.activeCampaignNames[0] ? campaignCadence.activeCampaignNames.join(" · ") : "No active campaigns yet."}
              />
              <MetricCard
                label="Pillars"
                value={String(strategy.pillars.length)}
                detail="Strategic themes available for assignment and balancing."
              />
              <MetricCard
                label="Audiences"
                value={String(strategy.audienceSegments.length)}
                detail="Audience segments available for light targeting."
              />
              <MetricCard
                label="Recent mix window"
                value={`${campaignCadence.recentWindowDays}d`}
                detail={`${campaignCadence.recentSignalsCount} recent generated, reviewed, approved, scheduled, or posted records in the cadence window.`}
              />
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {campaignCadence.underrepresentedFunnels.length > 0 || campaignCadence.underrepresentedPillars.length > 0
                ? `Current strategic gaps: ${campaignCadence.underrepresentedFunnels.slice(0, 2).join(", ") || "No funnel gap"}${campaignCadence.underrepresentedFunnels.length > 0 && campaignCadence.underrepresentedPillars.length > 0 ? " funnel content and " : ""}${campaignCadence.underrepresentedPillars.slice(0, 2).join(", ") || "no pillar gap"} pillar coverage are underrepresented in recent output.`
                : "Recent output looks reasonably balanced across the current strategy layer."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Distribution</CardTitle>
            <CardDescription>
              How current records distribute across campaigns, pillars, and funnel stages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By campaign</p>
              <div className="mt-3 space-y-3">
                {campaignInsights.byCampaign.length === 0 ? (
                  <EmptyState copy="No campaign-linked records are available yet." />
                ) : (
                  campaignInsights.byCampaign.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By pillar</p>
                <div className="mt-3 space-y-3">
                  {campaignInsights.byPillar.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By funnel stage</p>
                <div className="mt-3 space-y-3">
                  {campaignInsights.byFunnelStage.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Distribution Priority Engine</CardTitle>
          <CardDescription>
            Bounded platform-priority guidance for where strong candidates should go first, when cross-posting is worth it, and when a single-platform route is cleaner.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Top primary platform"
              value={distributionPriorityInsights.primaryPlatformRows[0]?.label ?? "None yet"}
              detail={
                distributionPriorityInsights.primaryPlatformRows[0]
                  ? `${distributionPriorityInsights.primaryPlatformRows[0].count} current approval-ready candidate${distributionPriorityInsights.primaryPlatformRows[0].count === 1 ? "" : "s"} lead there.`
                  : "No platform lead is stable enough yet."
              }
            />
            <MetricCard
              label="Multi-platform"
              value={String(distributionPriorityInsights.multiPlatformCount)}
              detail="High-value candidates with bounded cross-platform upside."
            />
            <MetricCard
              label="Single-platform"
              value={String(distributionPriorityInsights.singlePlatformCount)}
              detail="Candidates that should stay focused on one route first."
            />
            <MetricCard
              label="Experimental"
              value={String(distributionPriorityInsights.experimentalCount)}
              detail="Candidates where platform expansion should stay deliberately bounded."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current read</p>
              {distributionPriorityInsights.summaries.length === 0 ? (
                <EmptyState copy="No stable distribution pattern is strong enough to summarize yet." />
              ) : (
                distributionPriorityInsights.summaries.map((summary) => (
                  <div key={summary} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {summary}
                  </div>
                ))
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Primary platform mix</p>
                <div className="mt-3 space-y-3">
                  {distributionPriorityInsights.primaryPlatformRows.length === 0 ? (
                    <EmptyState copy="No primary-platform pattern is stable enough yet." />
                  ) : (
                    distributionPriorityInsights.primaryPlatformRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Distribution patterns</p>
                <div className="mt-3 space-y-3">
                  {distributionPriorityInsights.strategyRows.length === 0 ? (
                    <EmptyState copy="No distribution-strategy pattern is stable enough yet." />
                  ) : (
                    distributionPriorityInsights.strategyRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Posting Pack</CardTitle>
          <CardDescription>
            A bounded recommendation layer for the best manual posting set this week. It stays advisory, balanced, and separate from scheduling.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Recommended items"
              value={String(weeklyPostingPackInsights.itemCount)}
              detail="Bounded weekly pack size stays between 3 and 5 when enough strong candidates exist."
            />
            <MetricCard
              label="Completion rate"
              value={formatPercent(weeklyPostingPackInsights.completionRate)}
              detail={`${weeklyPostingPackInsights.approvedCount} approved and ${weeklyPostingPackInsights.postedCount} already posted this week.`}
            />
            <MetricCard
              label="High-value support"
              value={String(weeklyPostingPackInsights.highValueCount)}
              detail="Pack items currently carrying high expected or strategic value support."
            />
            <MetricCard
              label="Campaign-critical"
              value={String(weeklyPostingPackInsights.campaignCriticalCount)}
              detail="Recommended items preserved because they still matter for the current campaign window."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Coverage quality</p>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {weeklyPostingPackInsights.coverageQuality}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {weeklyPostingPack.coverageSummary.summary}
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current mix</p>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {weeklyPostingPack.platformMix.map((row) => `${row.count} ${row.label}`).join(" · ") || "No platform mix is stable enough yet."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {weeklyPostingPack.funnelMix.map((row) => `${row.count} ${row.label}`).join(" · ") || "No funnel mix is stable enough yet."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {weeklyPostingPack.modeMix.map((row) => `${row.count} ${row.label}`).join(" · ") || "No mode mix is stable enough yet."}
              </div>
            </div>
          </div>

          {weeklyPostingPack.coverageSummary.underrepresented.length > 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              Still underrepresented: {weeklyPostingPack.coverageSummary.underrepresented.join(" · ")}
            </div>
          ) : null}

          <Link href="/weekly-pack" className="inline-flex text-sm text-[color:var(--accent)] underline underline-offset-4">
            Open weekly posting pack
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Weekly Execution Autopilot</CardTitle>
            <Link href="/execution" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open execution
            </Link>
          </div>
          <CardDescription>
            A bounded weekly preparation layer that stages safe items, keeps blocked work visible, and orders the operator&apos;s execution path without auto-posting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Autopilot runs"
              value={String(weeklyExecutionInsights.runCount)}
              detail="Current and stored weekly execution flow snapshots available for comparison."
            />
            <MetricCard
              label="Staged vs blocked"
              value={weeklyExecutionInsights.stagedToBlockedRatio}
              detail="Directional balance between execution-ready work and items still held back."
            />
            <MetricCard
              label="Execution-ready rate"
              value={formatPercent(weeklyExecutionInsights.executionReadyRate)}
              detail="Share of visible execution items that are already staged or safe to stage next."
            />
            <MetricCard
              label="Review-required"
              value={String(weeklyExecutionInsights.readyToReviewCount)}
              detail="Items still needing explicit operator review before staging."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current execution read</p>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {weeklyExecutionPreview.executionReasons[0] ?? "No weekly execution summary is stable enough yet."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {weeklyExecutionPreview.sequenceNotes[0] ?? "No sequence note is shaping this week&apos;s execution order yet."}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Most common block reasons</p>
              {weeklyExecutionInsights.commonBlockReasons.length === 0 ? (
                <EmptyState copy="No recurring weekly execution blocker is stable enough yet." />
              ) : (
                weeklyExecutionInsights.commonBlockReasons.map((reason) => (
                  <div key={reason.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                    <span className="text-sm text-slate-600">{reason.label}</span>
                    <span className="text-lg font-semibold text-slate-950">{reason.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cross-Platform Narrative Sequencing</CardTitle>
          <CardDescription>
            Compact multi-platform arcs that keep one strong signal moving forward instead of fragmenting into isolated posts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Sequences"
              value={String(narrativeSequenceInsights.sequenceCount)}
              detail="Current compact cross-platform arcs the system can explain explicitly."
            />
            <MetricCard
              label="Sequenced signals"
              value={String(narrativeSequenceInsights.sequencedSignalCount)}
              detail="Signals currently carrying a reusable narrative arc across platforms."
            />
            <MetricCard
              label="Sequenced posts"
              value={String(narrativeSequenceInsights.sequencedPostedCount)}
              detail="Posted items tied back to signals that carried a sequence."
            />
            <MetricCard
              label="Strong outcomes"
              value={String(narrativeSequenceInsights.strongOutcomeCount)}
              detail="Sequenced posts later judged strong or strategically high value."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top role and platform combinations</p>
              {narrativeSequenceInsights.topRolePlatformRows.length === 0 ? (
                <EmptyState copy="No stable sequence role pattern is visible yet." />
              ) : (
                narrativeSequenceInsights.topRolePlatformRows.map((row) => (
                  <div key={row.key} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                    <span className="text-sm text-slate-600">{row.label}</span>
                    <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Operational read</p>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {narrativeSequenceInsights.summary}
              </div>
              {weeklyPostingPack.sequences[0] ? (
                <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  This week&apos;s clearest arc is {weeklyPostingPack.sequences[0].narrativeLabel}:{" "}
                  {weeklyPostingPack.sequences[0].orderedSteps.map((step) => `${step.order}. ${step.platform === "linkedin" ? "LinkedIn" : step.platform === "x" ? "X" : "Reddit"}`).join(" -> ")}.
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Semi-Autonomous Posting Assistant</CardTitle>
          <CardDescription>
            A bounded manual-confirmation layer that stages the final caption, CTA, destination, asset direction, and posting context so external publishing becomes copy-and-confirm instead of reassembly work.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Staged now"
              value={String(stagedPostingPackages.length)}
              detail="Posting packages currently waiting for manual publishing confirmation."
            />
            <MetricCard
              label="Confirmed posted"
              value={String(postedPostingPackages.length)}
              detail="Packages already carried through from staging into posting memory."
            />
            <MetricCard
              label="Stage to posted"
              value={formatPercent(stagedPostedConversionRate)}
              detail="Conversion from staged package to confirmed manual posting."
            />
            <MetricCard
              label="Strong outcomes"
              value={String(postedStagedStrongOutcomeCount)}
              detail="Confirmed staged packages that later recorded strong qualitative or high strategic outcomes."
            />
            <MetricCard
              label="Safe-post eligible"
              value={String(safePostingInsights.eligibleCount)}
              detail="Strict-guardrail staged packages that currently qualify for safe-mode posting."
            />
            <MetricCard
              label="Safe-posted"
              value={String(safePostingInsights.safePostedCount)}
              detail={`${safePostingInsights.manualPostedCount} posted manually · ${safePostingInsights.failedCount} staged failures preserved.`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Platforms most often staged</p>
              {stagedPostingPlatformRows.length === 0 ? (
                <EmptyState copy="No posting packages are staged right now." />
              ) : (
                stagedPostingPlatformRows.map((row) => (
                  <div key={row.platform} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                    <span className="text-sm text-slate-600">
                      {row.platform === "linkedin" ? "LinkedIn" : row.platform === "x" ? "X" : "Reddit"}
                    </span>
                    <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Operational read</p>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {stagedPostingPackages.length === 0
                  ? "No manual-ready packages are staged yet, so final review is still the main last-mile bottleneck."
                  : `${stagedPostingPackages.length} package${stagedPostingPackages.length === 1 ? "" : "s"} are already assembled for manual posting. ${postedStagedStrongOutcomeCount > 0 ? `${postedStagedStrongOutcomeCount} staged package${postedStagedStrongOutcomeCount === 1 ? "" : "s"} already map to strong judged outcomes.` : "Outcome evidence is still thin, so the assistant is currently best treated as execution compression rather than a proven performance lift."}`}
              </div>
              <Link href="/posting" className="inline-flex text-sm text-[color:var(--accent)] underline underline-offset-4">
                Open posting assistant
              </Link>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {safePostingInsights.topBlockReasons.length > 0
                  ? `Top safe-post blocker: ${safePostingInsights.topBlockReasons[0]?.label}`
                  : "No persistent safe-post blocker is visible right now."}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Experiments</CardTitle>
          <CardDescription>
            Bounded operator-run comparisons, plus system-proposed experiments when uncertainty is strong enough to justify a deliberate test.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Active"
              value={String(experimentInsights.activeCount)}
              detail="Experiments still gathering evidence."
            />
            <MetricCard
              label="Completed"
              value={String(experimentInsights.completedCount)}
              detail="Experiments the operator has explicitly closed."
            />
            <MetricCard
              label="Open proposals"
              value={String(experimentProposalInsights.openCount)}
              detail={experimentProposalInsights.summaries[0] ?? "No open proposal is strong enough to surface right now."}
            />
            <MetricCard
              label="Autopilot built"
              value={String(experimentInsights.autopilotBuiltCount)}
              detail={
                experimentAutopilotTypeRows[0]
                  ? `${experimentAutopilotTypeRows[0].label} is the most common current autopilot variable.`
                  : "No autopilot-built variable trend is stable enough yet."
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Open proposals</p>
              <div className="mt-3 space-y-3">
                {experimentProposalInsights.openProposals.length === 0 ? (
                  <EmptyState copy="No autonomous experiment proposal is strong enough to surface right now." />
                ) : (
                  experimentProposalInsights.openProposals.map((proposal) => (
                    <div key={proposal.proposalId} className="rounded-2xl bg-white/80 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-950">{proposal.sourceTitle}</p>
                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{proposal.candidateVariants.length} variants</Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{proposal.whyProposed}</p>
                      <p className="mt-2 text-sm text-slate-500">{proposal.expectedLearningGoal}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Active experiments</p>
              <div className="mt-3 space-y-3">
                {experimentInsights.activeExperiments.length === 0 ? (
                  <EmptyState copy="No active experiments are being tracked right now." />
                ) : (
                  experimentInsights.activeExperiments.map((experiment) => (
                    <div key={experiment.experimentId} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{experiment.name}</p>
                      <p className="mt-2 text-sm text-slate-600">{experiment.comparisonSummary ?? experiment.hypothesis}</p>
                      <p className="mt-2 text-sm text-slate-500">
                        {experiment.highValueCount} high-value · {experiment.leadTotal} leads · {experiment.clickTotal} clicks
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Autopilot V2</p>
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  {experimentAutopilotCreated.length === 0
                    ? "No bounded one-variable autopilot experiment is justified right now."
                    : `${experimentAutopilotCreated.length} candidate${experimentAutopilotCreated.length === 1 ? "" : "s"} currently qualify for autopilot-built experiment construction.`}
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  {experimentInsights.autopilotBuiltCount === 0
                    ? "No autopilot-built experiment has been accepted yet."
                    : `${experimentInsights.autopilotCompletedCount} of ${experimentInsights.autopilotBuiltCount} accepted autopilot-built experiments are already completed.`}
                </div>
                {experimentAutopilotBlockRows.length > 0 ? (
                  experimentAutopilotBlockRows.map((row) => (
                    <div key={row.label} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                      Blocked: {row.label} ({row.count})
                    </div>
                  ))
                ) : (
                  <EmptyState copy="No repeated autopilot block reason is strong enough to call out right now." />
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Experiment types</p>
              <div className="mt-3 space-y-3">
                {experimentInsights.byType.length === 0 && experimentProposalInsights.byType.length === 0 ? (
                  <EmptyState copy="No proposal or experiment type is stable enough to summarize cleanly yet." />
                ) : (
                  <>
                    {experimentProposalInsights.byType.map((row) => (
                      <div key={`proposal:${row.experimentType}`} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                        Proposed {row.label}: {row.count}
                      </div>
                    ))}
                    {experimentProposalInsights.byVariable.map((row) => (
                      <div key={`variable:${row.variable}`} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                        Autopilot variable {row.label}: {row.count}
                      </div>
                    ))}
                    {experimentInsights.byType.map((row) => (
                      <div key={`experiment:${row.experimentType}`} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                        Tracked {row.label}: {row.count}
                      </div>
                    ))}
                  </>
                )}
                <Link href="/experiments" className="inline-block text-sm text-[color:var(--accent)] underline underline-offset-4">
                  Open experiments
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Plan Alignment</CardTitle>
            <CardDescription>
              Current-week intent versus what the system is actually preparing and posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Week"
                value={weeklyPlanInsights.currentState?.weekLabel ?? currentWeeklyPlan.weekStartDate}
                detail={weeklyPlanInsights.currentPlan?.theme ?? "No weekly theme set."}
              />
              <MetricCard
                label="Goals"
                value={String(weeklyPlanInsights.currentPlan?.goals.length ?? 0)}
                detail={weeklyPlanInsights.currentPlan?.goals[0] ?? "No weekly goals saved."}
              />
              <MetricCard
                label="Plan gaps"
                value={String(weeklyPlanInsights.currentState?.gaps.length ?? 0)}
                detail={weeklyPlanInsights.currentState?.summaries[0] ?? "Current output looks broadly aligned."}
              />
              <MetricCard
                label="Stored weeks"
                value={String(weeklyPlanStore.plans.length)}
                detail="Light planning history for weekly comparison."
              />
              <MetricCard
                label="Plan source"
                value={
                  weeklyPlanInsights.currentPlanSource === "auto_draft"
                    ? "Auto-draft"
                    : weeklyPlanInsights.currentPlanSource === "manual"
                      ? "Manual"
                      : "None yet"
                }
                detail={
                  weeklyPlanInsights.currentPlanSource === "auto_draft"
                    ? "Current week came from an accepted weekly auto-draft."
                    : "Current week is being driven manually."
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Platforms vs target</p>
                <div className="mt-3 space-y-3">
                  {weeklyPlanInsights.currentState?.platformRows.map((row) => (
                    <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.actualCount}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">Target: {row.target > 1 ? "Focus" : row.target === 1 ? "Light" : "Off"}</p>
                    </div>
                  )) ?? <EmptyState copy="No weekly plan state is available yet." />}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Funnels vs target</p>
                <div className="mt-3 space-y-3">
                  {weeklyPlanInsights.currentState?.funnelRows.map((row) => (
                    <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.actualCount}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">Target: {row.target > 1 ? "Focus" : row.target === 1 ? "Light" : "Off"}</p>
                    </div>
                  )) ?? <EmptyState copy="No weekly plan state is available yet." />}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Modes vs target</p>
                <div className="mt-3 space-y-3">
                  {weeklyPlanInsights.currentState?.modeRows
                    .filter((row) => row.target > 0 || row.actualCount > 0)
                    .slice(0, 6)
                    .map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-600">{row.label}</span>
                          <span className="text-lg font-semibold text-slate-950">{row.actualCount}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">Target: {row.target > 1 ? "Focus" : row.target === 1 ? "Light" : "Off"}</p>
                      </div>
                    )) ?? <EmptyState copy="No weekly mode data is available yet." />}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Plan gaps</p>
                <div className="mt-3 space-y-3">
                  {(weeklyPlanInsights.currentState?.gaps.length ? weeklyPlanInsights.currentState.gaps : weeklyPlanInsights.currentState?.summaries ?? []).slice(0, 5).map((note) => (
                    <div key={note} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                      {note}
                    </div>
                  ))}
                  {!weeklyPlanInsights.currentState ? <EmptyState copy="No weekly plan state is available yet." /> : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Plan Effectiveness</CardTitle>
            <CardDescription>
              Lightweight comparison of recent planned weeks against strategic-value outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Auto-drafted weeks"
                value={String(weeklyPlanInsights.autoDraftPlanCount)}
                detail="Stored weeks that originated from an accepted auto-draft."
              />
              <MetricCard
                label="Accepted drafts"
                value={String(weeklyPlanInsights.acceptedAutoDraftCount)}
                detail="Accepted auto-drafts recorded in weekly plan history."
              />
              <MetricCard
                label="Edited after draft"
                value={String(weeklyPlanInsights.editedAutoDraftCount)}
                detail="Accepted drafts that were adjusted before saving."
              />
            </div>

            {weeklyPlanInsights.commonAdjustmentTriggers.length > 0 ? (
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                Common auto-draft triggers: {weeklyPlanInsights.commonAdjustmentTriggers.join(" · ")}
              </div>
            ) : null}

            {weeklyPlanInsights.effectivenessRows.length === 0 ? (
              <EmptyState copy="No weekly plan history is stable enough to compare yet." />
            ) : (
              weeklyPlanInsights.effectivenessRows.slice(0, 5).map((row) => (
                <div key={row.weekLabel} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.weekLabel}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.theme ?? "No theme"}</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">High strategic value</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{row.highValueCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Leads</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{row.leadTotal}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top platform</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{row.topPlatformLabel ?? "None yet"}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>At A Glance</CardTitle>
          <CardDescription>Core volume and progression across the current window.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Signals in scope"
            value={String(insights.totalSignals)}
            detail={topSourceKind ? `${topSourceKind.label} is the largest source family in this view.` : "No source family dominates this window yet."}
          />
          <MetricCard
            label="Reached interpretation"
            value={String(interpretedStage?.count ?? 0)}
            detail={scoredStage ? `${formatPercent(interpretedStage?.share ?? 0)} of all records in scope.` : "No scored records yet."}
          />
          <MetricCard
            label="Reached generation"
            value={String(generatedStage?.count ?? 0)}
            detail={`${formatPercent(insights.scenarioAngles.strongOrUsableGenerationRate)} generation rate for usable or strong framing.`}
          />
          <MetricCard
            label="Operator overrides"
            value={String(insights.operator.overrides)}
            detail={topOverrideStage ? `${topOverrideStage.label} is the most common override stage.` : "No audited overrides in this window."}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Editorial Confidence</CardTitle>
            <CardDescription>
              A lightweight view of how much trust the current guidance appears to deserve based on structured support, not objective correctness.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {insights.editorialConfidence.rows.map((row) => (
                <div key={row.level} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label} confidence</p>
                    <Badge className={confidenceClasses(row.level)}>{row.label}</Badge>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">{row.count}</p>
                  <p className="mt-1 text-sm text-slate-500">Records in the current window.</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.editorialConfidence.lowCount > 0
                ? `${insights.editorialConfidence.lowCount} records currently need heavier human judgement because framing, support memory, or coverage is still thin.`
                : "No records in this window are currently surfacing as low-confidence guidance cases."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Low-Confidence Clusters</CardTitle>
            <CardDescription>
              Where uncertainty is concentrating most often right now, by source kind, family, and recurring uncertainty flag.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Source kinds</p>
              <div className="mt-3 space-y-3">
                {insights.editorialConfidence.lowConfidenceSourceKinds.length === 0 ? (
                  <EmptyState copy="No low-confidence source-kind cluster is stable enough to surface yet." />
                ) : (
                  insights.editorialConfidence.lowConfidenceSourceKinds.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Families</p>
              <div className="mt-3 space-y-3">
                {insights.editorialConfidence.lowConfidenceFamilies.length === 0 ? (
                  <EmptyState copy="No low-confidence family cluster is stable enough to surface yet." />
                ) : (
                  insights.editorialConfidence.lowConfidenceFamilies.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top uncertainty flags</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {insights.editorialConfidence.topUncertaintyFlags.length === 0 ? (
                  <EmptyState copy="No uncertainty flags are stable enough to summarize yet." />
                ) : (
                  insights.editorialConfidence.topUncertaintyFlags.map((row) => (
                    <Badge key={row.code} className="bg-slate-100 text-slate-700 ring-slate-200">
                      {row.label}: {row.count}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Source Autopilot V2</CardTitle>
          <CardDescription>
            Compact visibility into explicit source-change drafts and recently approved source moves.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Open proposals"
              value={String(sourceAutopilot.proposalSummary.openCount)}
              detail={`${sourceAutopilot.proposalSummary.openPauseCount} pause drafts are currently open.`}
            />
            <MetricCard
              label="Query rewrites"
              value={String(sourceAutopilot.proposalSummary.openQueryRewriteCount)}
              detail={`${sourceAutopilot.proposalSummary.approvedQueryRewriteCount} query rewrites have already been approved.`}
            />
            <MetricCard
              label="Approved changes"
              value={String(sourceAutopilot.proposalSummary.approvedCount)}
              detail={`${sourceAutopilot.proposalSummary.approvedPauseCount} pauses and ${sourceAutopilot.proposalSummary.approvedResumeCount} resumes are on record.`}
            />
            <MetricCard
              label="Disabled sources"
              value={String(sourceAutopilot.proposalSummary.disabledSourceCount)}
              detail="Current paused sources in the registry."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Open source changes</p>
              {sourceAutopilot.proposals.filter((proposal) => proposal.status === "open").length === 0 ? (
                <EmptyState copy="No explicit source changes are open right now." />
              ) : (
                sourceAutopilot.proposals
                  .filter((proposal) => proposal.status === "open")
                  .slice(0, 4)
                  .map((proposal) => (
                    <div key={proposal.proposalId} className="rounded-2xl bg-white/80 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-medium text-slate-950">{proposal.scopeLabel}</p>
                        <Badge className="bg-amber-50 text-amber-700 ring-amber-200">{proposal.title}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{proposal.changeSummary}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{proposal.reason}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        {proposal.supportingSignals.map((item) => (
                          <span key={`${proposal.proposalId}-${item}`} className="rounded-full bg-slate-100 px-2.5 py-1">
                            {item}
                          </span>
                        ))}
                      </div>
                      <Link href={`/ingestion#source-${proposal.sourceId ?? proposal.proposalId}`} className="mt-3 inline-flex text-sm text-[color:var(--accent)] underline underline-offset-4">
                        Review source proposal
                      </Link>
                    </div>
                  ))
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Recent approved or dismissed changes</p>
              {sourceAutopilot.recentChanges.length === 0 ? (
                <EmptyState copy="No source proposal decisions have been recorded yet." />
              ) : (
                sourceAutopilot.recentChanges.slice(0, 4).map((proposal) => (
                  <div key={`recent-${proposal.proposalId}`} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">{proposal.scopeLabel}</p>
                      <Badge className={proposal.status === "approved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                        {proposal.status === "approved" ? "Approved" : "Dismissed"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{proposal.title} · {proposal.changeSummary}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conflict Detector</CardTitle>
          <CardDescription>
            Compact visibility into the package contradictions most likely to waste final-review time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Conflicted candidates"
              value={String(conflictInsights.conflictedCandidateCount)}
              detail="Approval-ready candidates currently carrying one or more meaningful package conflicts."
            />
            <MetricCard
              label="High severity"
              value={String(conflictInsights.highSeverityCount)}
              detail="Conflicts that should usually be treated as judgement calls before approval."
            />
            <MetricCard
              label="Top platform"
              value={conflictInsights.platformRows[0]?.label ?? "None yet"}
              detail={
                conflictInsights.platformRows[0]
                  ? `${conflictInsights.platformRows[0].count} conflicted candidates are surfacing here most often.`
                  : "No platform conflict pattern is stable enough to surface."
              }
            />
            <MetricCard
              label="Top mode"
              value={conflictInsights.modeRows[0]?.label ?? "None yet"}
              detail={
                conflictInsights.modeRows[0]
                  ? `${conflictInsights.modeRows[0].count} conflicted candidates are using this mode most often.`
                  : "No editorial-mode conflict cluster is stable enough yet."
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Common conflict types</p>
              {conflictInsights.topConflictTypes.length === 0 ? (
                <EmptyState copy="No meaningful package conflict pattern is stable enough to summarize right now." />
              ) : (
                conflictInsights.topConflictTypes.map((row) => (
                  <div key={row.type} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-4">
                    <span className="text-sm text-slate-600">{row.label}</span>
                    <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Where they show up most</p>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {conflictInsights.topConflictTypes[0]
                  ? `${conflictInsights.topConflictTypes[0].label} is the most common package conflict in the current approval-ready queue.`
                  : "Current approval-ready candidates are mostly clean from a package-alignment perspective."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {conflictInsights.platformRows[0]
                  ? `${conflictInsights.platformRows[0].label} is the platform where package conflicts are surfacing most often right now.`
                  : "No platform-specific conflict cluster is stable enough to call out."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {conflictInsights.modeRows[0]
                  ? `${conflictInsights.modeRows[0].label} is the editorial mode most often associated with the current conflict queue.`
                  : "No editorial mode is generating a repeated conflict pattern right now."}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stale Queue Cleanup</CardTitle>
          <CardDescription>
            Lightweight visibility into queue items drifting out of date, plus the operator actions already applied to keep them from silently rotting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Stale queue"
              value={String(staleQueueOverview.staleCount)}
              detail={`${staleQueueOverview.agingCount} additional items are aging.`}
            />
            <MetricCard
              label="Reusable later"
              value={String(staleQueueOverview.staleButReusableCount)}
              detail={`${staleQueueOverview.evergreenLaterCount} items are already parked in evergreen later.`}
            />
            <MetricCard
              label="Needs refresh"
              value={String(staleQueueOverview.staleNeedsRefreshCount)}
              detail={`${staleQueueOverview.refreshRequestedCount} refresh requests are already on record.`}
            />
            <MetricCard
              label="Suppressed"
              value={String(staleQueueOverview.suppressCount)}
              detail={`${staleQueueOverview.keepAnywayCount} keep-anyway overrides are currently active.`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top stale reasons</p>
              {staleQueueOverview.topReasons.length === 0 ? (
                <EmptyState copy="No stale reason is dominating the current approval-ready queue." />
              ) : (
                staleQueueOverview.topReasons.map((reason) => (
                  <div key={reason.code} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">{reason.label}</p>
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{reason.count}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Queue actions in motion</p>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {staleQueueOverview.staleCount === 0
                  ? "No bounded stale cleanup is active right now."
                  : `${staleQueueOverview.refreshRequestedCount} refresh requests, ${staleQueueOverview.evergreenLaterCount} evergreen-later moves, and ${staleQueueOverview.suppressCount} suppressions are currently shaping the top queue.`}
              </div>
              <Link href="/review?view=stale" className="inline-flex text-sm text-[color:var(--accent)] underline underline-offset-4">
                Open stale queue in review
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operator Task Generation</CardTitle>
          <CardDescription>
            A bounded view of the recurring unresolved work the system is turning into explicit operator tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Open tasks"
              value={String(operatorTaskSummary.openCount)}
              detail="Current unresolved operator tasks across judgement, completion, confirmation, and repair work."
            />
            <MetricCard
              label="High-priority backlog"
              value={String(operatorTaskSummary.highPriorityCount)}
              detail="Tasks that are carrying the highest leverage or blocking pressure."
            />
            <MetricCard
              label="Top bottleneck"
              value={operatorTaskSummary.topBottlenecks[0]?.label ?? "None yet"}
              detail={
                operatorTaskSummary.topBottlenecks[0]
                  ? `${operatorTaskSummary.topBottlenecks[0].count} open tasks are concentrated here.`
                  : "No recurring task bottleneck is stable enough to surface."
              }
            />
            <MetricCard
              label="Dismissed"
              value={String(operatorTaskSummary.dismissedCount)}
              detail="Tasks intentionally suppressed while the linked unresolved state still exists."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Open task types</p>
              {operatorTaskSummary.byType.length === 0 ? (
                <EmptyState copy="No operator-task backlog is open right now." />
              ) : (
                operatorTaskSummary.byType.map((row) => (
                  <div key={row.taskType} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-4">
                    <span className="text-sm text-slate-600">{row.label}</span>
                    <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current friction</p>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {operatorTaskSummary.topBottlenecks[0]
                  ? `${operatorTaskSummary.topBottlenecks[0].label} is the most common operator task type in the current backlog.`
                  : "No recurring operator friction pattern is stable enough to call out."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {operatorTaskSummary.highPriorityCount > 0
                  ? `${operatorTaskSummary.highPriorityCount} tasks are currently marked high priority and should clear the fastest operational bottlenecks first.`
                  : "No high-priority operator task backlog is building up right now."}
              </div>
              <Link href="/tasks" className="inline-flex text-sm text-[color:var(--accent)] underline underline-offset-4">
                Open operator task queue
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <FlywheelOptimisationPanel optimisation={flywheelOptimisation} compact />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Source Mix Insights</CardTitle>
            <CardDescription>
              Which source families are producing volume, interpretation-ready records, and generation-ready records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {topSourceKind ? (
              <div className="rounded-2xl bg-white/80 p-4 text-sm leading-6 text-slate-700">
                {topSourceKind.label} contributed {topSourceKind.total} records; {topSourceKind.interpreted} reached interpretation; {topSourceKind.generated} reached generation.
                {topSource ? ` The strongest individual contributor in this window is ${topSource.label}.` : ""}
              </div>
            ) : (
              <EmptyState copy="No source mix insight is available until records exist in the selected window." />
            )}

            {insights.sourceKinds.length === 0 ? (
              <EmptyState copy="No source families are present in this window." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    <tr>
                      <th className="pb-3 pr-4 font-medium">Source kind</th>
                      <th className="pb-3 pr-4 font-medium">Total</th>
                      <th className="pb-3 pr-4 font-medium">Interpreted</th>
                      <th className="pb-3 pr-4 font-medium">Generated</th>
                      <th className="pb-3 pr-4 font-medium">Filtered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.sourceKinds.map((row) => (
                      <tr key={row.key} className="border-t border-black/6">
                        <td className="py-3 pr-4 font-medium text-slate-900">{row.label}</td>
                        <td className="py-3 pr-4 text-slate-600">{row.total}</td>
                        <td className="py-3 pr-4 text-slate-600">
                          {row.interpreted} <span className="text-slate-400">({formatPercent(row.interpretationRate)})</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {row.generated} <span className="text-slate-400">({formatPercent(row.generationRate)})</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {row.filteredOut} <span className="text-slate-400">({formatPercent(row.filteredRate)})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Specific Sources</CardTitle>
            <CardDescription>Compact watchlists for the strongest and weakest current contributors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Strongest current contributors</p>
              <div className="mt-3 space-y-3">
                {insights.topSources.length === 0 ? (
                  <EmptyState copy="No specific source contributors are available yet." />
                ) : (
                  insights.topSources.map((row) => (
                    <div key={`top-${row.key}`} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{row.label}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {row.total} total; {row.interpreted} interpreted; {row.generated} generated.
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Watchlist</p>
              <div className="mt-3 space-y-3">
                {insights.watchSources.length === 0 ? (
                  <EmptyState copy="No weak-source watchlist is available yet." />
                ) : (
                  insights.watchSources.map((row) => (
                    <div key={`watch-${row.key}`} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{row.label}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {row.filteredOut} filtered out; {row.generated} generated; {row.total} total.
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scenario Angle Insights</CardTitle>
            <CardDescription>
              Framing quality is measured with the existing Scenario Angle rules, not a separate scoring model.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Blocked by framing"
                value={String(insights.scenarioAngles.blockedSignals)}
                detail="Current records where co-pilot guidance is asking for stronger scenario framing."
              />
              <MetricCard
                label="Usable/strong to generation"
                value={formatPercent(insights.scenarioAngles.strongOrUsableGenerationRate)}
                detail="Generation rate for records with workable framing."
              />
              <MetricCard
                label="Weak/missing to generation"
                value={formatPercent(insights.scenarioAngles.weakOrMissingGenerationRate)}
                detail="Generation rate when framing is still weak or absent."
              />
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Quality</th>
                    <th className="pb-3 pr-4 font-medium">Total</th>
                    <th className="pb-3 pr-4 font-medium">Interpreted</th>
                    <th className="pb-3 pr-4 font-medium">Generated</th>
                    <th className="pb-3 pr-4 font-medium">Blocked now</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.scenarioAngles.rows.map((row) => (
                    <tr key={row.quality} className="border-t border-black/6">
                      <td className="py-3 pr-4 font-medium text-slate-900">{row.label}</td>
                      <td className="py-3 pr-4 text-slate-600">{row.total}</td>
                      <td className="py-3 pr-4 text-slate-600">
                        {row.interpreted} <span className="text-slate-400">({formatPercent(row.interpretationRate)})</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {row.generated} <span className="text-slate-400">({formatPercent(row.generationRate)})</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{row.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline Stage Insights</CardTitle>
            <CardDescription>Simple stage counts using the current workflow definitions and saved record state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {insights.pipeline.stages.map((stage) => (
                <MetricCard
                  key={stage.key}
                  label={stage.label}
                  value={String(stage.count)}
                  detail={stage.key === "ingested" ? "Current records in the selected window." : `${formatPercent(stage.share)} of records in scope.`}
                />
              ))}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {scoredStage?.count ?? 0} records have been scored. {generatedStage?.count ?? 0} have reached generation, and {filteredStage?.count ?? 0} have been filtered out.
              {insights.pipeline.reviewRecommended > 0
                ? ` ${insights.pipeline.reviewRecommended} still carry a review recommendation or human-review flag.`
                : " No records are currently marked for human review."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Operator Override Insights</CardTitle>
            <CardDescription>
              Derived only from the bounded audit events already recorded for manual actions and override comparisons.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <MetricCard
                label="Manual actions"
                value={String(insights.operator.manualActions)}
                detail={`${insights.operator.auditEvents} audit events attached to records in this window.`}
              />
              <MetricCard
                label="Followed current guidance"
                value={String(insights.operator.followedGuidance)}
                detail={
                  insights.operator.trackedGuidanceActions > 0
                    ? `${formatPercent(1 - insights.operator.overrideRate)} of tracked guidance-comparison actions.`
                    : "No tracked operator actions with guidance comparison yet."
                }
              />
              <MetricCard
                label="Overrides"
                value={String(insights.operator.overrides)}
                detail={`${insights.operator.overrideSignals} records with at least one audited override.`}
              />
              <MetricCard
                label="Override rate"
                value={formatPercent(insights.operator.overrideRate)}
                detail="Based on interpretation, generation, and workflow actions that currently emit override comparisons."
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Manual intervention by stage</p>
                <div className="mt-3 space-y-3">
                  {insights.operator.stageRows.length === 0 ? (
                    <EmptyState copy="No operator actions are audited in this window yet." />
                  ) : (
                    insights.operator.stageRows.map((row) => (
                      <div key={row.key} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Override concentration</p>
                <div className="mt-3 space-y-3">
                  {insights.operator.overrideStageRows.length === 0 ? (
                    <EmptyState copy="No override concentration is visible in this window." />
                  ) : (
                    insights.operator.overrideStageRows.map((row) => (
                      <div key={row.key} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Practical Observations</CardTitle>
            <CardDescription>Rule-based notes derived from the current metrics. No model-generated commentary is used here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.observations.length === 0 ? (
              <EmptyState copy="No practical observations are stable enough to show yet." />
            ) : (
              insights.observations.map((observation, index) => (
                <div key={`${observation.text}-${index}`} className="flex gap-3 rounded-2xl bg-white/80 p-4">
                  <Badge className={toneClasses(observation.tone)}>{observation.tone}</Badge>
                  <p className="text-sm leading-6 text-slate-700">{observation.text}</p>
                </div>
              ))
            )}

            <div className="rounded-2xl bg-slate-100 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current limitations</p>
              <div className="mt-3 space-y-2">
                {insights.limitations.map((item) => (
                  <p key={item} className="text-sm leading-6 text-slate-600">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div id="bundle-coverage-missing-kits" className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Bundle Coverage &amp; Missing Kits</CardTitle>
            <CardDescription>
              Strategic visibility into which communication families already have robust kits, which bundles look thin, and which recurring families still need a kit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Strong coverage"
                value={String(insights.bundleCoverage.strongCoverageCount)}
                detail="Bundles that look active and stable for their family."
              />
              <MetricCard
                label="Partial coverage"
                value={String(insights.bundleCoverage.partialCoverageCount)}
                detail="Bundles that help, but still leave related signals partially or fully uncovered."
              />
              <MetricCard
                label="Thin bundles"
                value={String(insights.bundleCoverage.thinBundleCount)}
                detail="Existing kits that likely need one stronger supporting pattern."
              />
              <MetricCard
                label="Missing kits"
                value={String(insights.bundleCoverage.missingKitCandidates.length)}
                detail="Recurring uncovered families with no meaningful current kit."
              />
            </div>

            {insights.bundleCoverage.bundles.length === 0 ? (
              <EmptyState copy="No bundles exist yet, so there is no bundle-level coverage picture to summarize." />
            ) : (
              <div className="space-y-3">
                {insights.bundleCoverage.bundles.map((bundle) => (
                  <div key={bundle.bundleId} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{bundle.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {bundle.familyLabel ?? "Unclassified family"}
                        </p>
                      </div>
                      <Badge className={bundleCoverageClasses(bundle.coverageStrength)}>
                        {BUNDLE_COVERAGE_STRENGTH_LABELS[bundle.coverageStrength]}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{bundle.note}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      {bundle.activePatternCount} active pattern{bundle.activePatternCount === 1 ? "" : "s"}, {bundle.retiredPatternCount} retired, {bundle.gapCandidateCount} related gap candidate{bundle.gapCandidateCount === 1 ? "" : "s"}.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                      <Link href={`/pattern-bundles/${bundle.bundleId}`} className="text-[color:var(--accent)] underline underline-offset-4">
                        Open bundle
                      </Link>
                      <span className="text-slate-600">{bundle.suggestedAction}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Missing Kit Candidates</CardTitle>
            <CardDescription>
              Recurring uncovered families that look reusable enough to justify a new bundle or a stronger bundle expansion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.bundleCoverage.missingKitCandidates.length === 0 ? (
              <EmptyState copy="No recurring missing-kit family is stable enough to surface right now." />
            ) : (
              insights.bundleCoverage.missingKitCandidates.map((candidate) => (
                <div key={candidate.familyLabel} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{candidate.familyLabel}</p>
                    <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
                      {candidate.count} signals
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{candidate.familyDescription}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{candidate.reason}</p>
                  {candidate.relatedBundleNames.length > 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      Related bundles: {candidate.relatedBundleNames.join(", ")}.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <span className="text-slate-700">{candidate.suggestedAction}</span>
                    {candidate.exampleSignalIds[0] ? (
                      <Link href={`/signals/${candidate.exampleSignalIds[0]}`} className="text-[color:var(--accent)] underline underline-offset-4">
                        Open example signal
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Playbook Coverage Gaps</CardTitle>
            <CardDescription>
              High-signal areas where operators are still improvising, adapting too often, or seeing clear opportunities without a saved card.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Coverage areas"
                value={String(insights.playbook.coverageAreaCount)}
                detail={`${insights.playbook.coveredAreaCount} covered and ${insights.playbook.lowSignalAreaCount} still low-signal.`}
              />
              <MetricCard
                label="Uncovered"
                value={String(insights.playbook.uncoveredAreaCount)}
                detail="Areas with enough activity but no relevant playbook card."
              />
              <MetricCard
                label="Weak coverage"
                value={String(insights.playbook.weaklyCoveredAreaCount)}
                detail={
                  insights.playbook.weakCoverageGaps[0]
                    ? "Areas where current card guidance is not holding up cleanly."
                    : "No weakly covered area is stable enough to call out yet."
                }
              />
              <MetricCard
                label="Opportunities"
                value={String(insights.playbook.opportunityGaps.length)}
                detail="Areas with strong outcomes but no saved playbook guidance yet."
              />
            </div>

            {insights.playbook.topCoverageGaps.length === 0 ? (
              <EmptyState copy="No stable playbook coverage gaps are visible in this window yet." />
            ) : (
              <div className="space-y-4">
                {[
                  {
                    title: "Uncovered",
                    rows: insights.playbook.uncoveredGaps,
                    emptyCopy: "No uncovered playbook gaps are stable enough to surface.",
                  },
                  {
                    title: "Weak Coverage",
                    rows: insights.playbook.weakCoverageGaps,
                    emptyCopy: "No weakly covered area is stable enough to surface.",
                  },
                  {
                    title: "Opportunity",
                    rows: insights.playbook.opportunityGaps,
                    emptyCopy: "No strong no-card opportunity is visible right now.",
                  },
                ].map((group) => (
                  <div key={group.title} className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{group.title}</p>
                    {group.rows.length === 0 ? (
                      <EmptyState copy={group.emptyCopy} />
                    ) : (
                      group.rows.map((gap) => (
                        <div key={gap.key} className="rounded-2xl bg-white/80 px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="font-medium text-slate-950">{gap.label}</p>
                            <Badge className={playbookGapClasses(gap.kind)}>
                              {gap.kind === "weak_coverage"
                                ? "Weak coverage"
                                : gap.kind === "opportunity"
                                  ? "Opportunity"
                                  : "Uncovered"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{gap.summary}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-500">{gap.whyFlagged}</p>
                          <p className="mt-3 text-sm text-slate-700">{gap.suggestedAction}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                            <Link
                              href={`/playbook?gapKey=${encodeURIComponent(gap.key)}`}
                              className="text-[color:var(--accent)] underline underline-offset-4"
                            >
                              Create playbook card
                            </Link>
                            {gap.signalIds[0] ? (
                              <Link
                                href={`/signals/${gap.signalIds[0]}`}
                                className="text-[color:var(--accent)] underline underline-offset-4"
                              >
                                Open example signal
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Playbook Cards</CardTitle>
            <CardDescription>
              Compact operator guidance cards derived manually from recurring editorial judgement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Cards"
                value={String(insights.playbook.cardCount)}
                detail={`${insights.playbook.activeCount} active and ${insights.playbook.retiredCount} retired.`}
              />
              <MetricCard
                label="Referenced cards"
                value={String(insights.playbook.referencedCount)}
                detail="Cards that surfaced at least once as relevant guidance in this window."
              />
              <MetricCard
                label="Top card"
                value={insights.playbook.topCards[0]?.title ?? "None yet"}
                detail={
                  insights.playbook.topCards[0]
                    ? `${insights.playbook.topCards[0].count} relevant matches in this window.`
                    : "No card has surfaced often enough to call out yet."
                }
              />
              <MetricCard
                label="Families without cards"
                value={String(insights.playbook.uncoveredFamiliesWithoutCard.length)}
                detail="Recurring family labels still not represented in active cards."
              />
            </div>

            {insights.playbook.topCards.length === 0 ? (
              <EmptyState copy="No playbook cards are being surfaced for current signals yet." />
            ) : (
              <div className="space-y-3">
                {insights.playbook.topCards.map((card) => (
                  <div key={card.cardId} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">{card.title}</p>
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{card.count} matches</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                      <Link href={`/playbook/${card.cardId}`} className="text-[color:var(--accent)] underline underline-offset-4">
                        Open playbook card
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {insights.playbook.topCards[0]
                  ? `${insights.playbook.topCards[0].title} is currently the most frequently surfaced playbook card in this window.`
                  : "No playbook card is surfacing often enough to call out yet."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {insights.playbook.topCoverageGaps[0]
                  ? insights.playbook.topCoverageGaps[0].summary
                  : "No playbook coverage gap is clearly dominant right now."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {insights.playbook.activeCount > 0
                  ? `${insights.playbook.activeCount} active card${insights.playbook.activeCount === 1 ? "" : "s"} are currently available as operator guidance.`
                  : "There are no active playbook cards available yet."}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reusable Playbook Packs</CardTitle>
            <CardDescription>
              System-derived packs promoted from repeated winners. They stay lightweight, read-only, and grounded in stored outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Packs"
                value={String(playbookPacks.length)}
                detail="Derived packs currently stable enough to surface."
              />
              <MetricCard
                label="Platforms covered"
                value={String(new Set(playbookPacks.map((pack) => pack.platform)).size)}
                detail="Distinct posting platforms represented by current packs."
              />
              <MetricCard
                label="Created events"
                value={String(auditEvents.filter((event) => event.eventType === "PLAYBOOK_PACK_CREATED").length)}
                detail="Times a new derived pack first qualified for promotion."
              />
              <MetricCard
                label="Used events"
                value={String(auditEvents.filter((event) => event.eventType === "PLAYBOOK_PACK_USED").length)}
                detail="Explicit operator references to a surfaced pack."
              />
            </div>

            <PlaybookPackSuggestions
              title="Current top packs"
              description="These are the strongest reusable packs in the current evidence window."
              matches={playbookPacks.slice(0, 3).map((pack) => ({
                pack,
                score: pack.strengthScore,
                reason: `Promoted from repeated strong outcomes on ${pack.platform === "x" ? "X" : pack.platform === "linkedin" ? "LinkedIn" : "Reddit"}.`,
                matchedOn: [pack.mode ?? "cross-mode", pack.ctaStyle],
              }))}
              emptyCopy="No playbook pack has enough repeated winning evidence yet."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Feedback Summary</CardTitle>
            <CardDescription>
              Explicit operator labels captured on records, framing, recommendations, outputs, and sources.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Feedback entries"
                value={String(insights.feedback.totalEntries)}
                detail="Append-only operator feedback labels in the current window."
              />
              <MetricCard
                label="Useful signals"
                value={String(insights.feedback.categories.find((category) => category.category === "signal")?.rows.find((row) => row.value === "useful_signal")?.count ?? 0)}
                detail="Signals explicitly marked useful by the operator."
              />
              <MetricCard
                label="Strong outputs"
                value={String(insights.feedback.categories.find((category) => category.category === "output")?.rows.find((row) => row.value === "strong_output")?.count ?? 0)}
                detail="Interpretation or generation outputs marked strong."
              />
            </div>

            <div className="space-y-4">
              {insights.feedback.categories.map((category) => (
                <div key={category.category} className="rounded-2xl bg-white/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{category.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{category.total} total</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {category.rows.map((row) => (
                      <div key={row.value} className="rounded-2xl bg-slate-50/80 px-4 py-3">
                        <p className="text-sm text-slate-600">{row.label}</p>
                        <p className="mt-2 text-xl font-semibold text-slate-950">{row.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source Feedback</CardTitle>
            <CardDescription>
              Passive source-tuning support only. These labels help manual source control without changing ingestion automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.feedback.sourceRows.length === 0 ? (
              <EmptyState copy="No source-level feedback has been recorded in this window yet." />
            ) : (
              insights.feedback.sourceRows.map((row) => (
                <div key={row.label} className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="font-medium text-slate-950">{row.label}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {row.highQuality} marked high quality; {row.noisy} marked noisy; {row.total} source labels total.
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pattern Bundles</CardTitle>
            <CardDescription>
              Manual kit coverage across the active playbook. Bundles organise related patterns; they do not apply automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Bundle count"
              value={String(bundles.length)}
              detail="Total saved bundle families."
            />
            <MetricCard
              label="Most-used bundle"
              value={bundleUsageRows[0]?.name ?? "None yet"}
              detail={
                bundleUsageRows[0]
                  ? `${bundleUsageRows[0].usedCount} total pattern applications across the bundle.`
                  : "No bundle usage is visible yet."
              }
            />
            <MetricCard
              label="Most active patterns"
              value={topActiveBundle?.name ?? "None yet"}
              detail={
                topActiveBundle
                  ? `${topActiveBundle.activePatternCount} active patterns in that bundle.`
                  : "No bundle membership is visible yet."
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bundle Notes</CardTitle>
            <CardDescription>Small bundle-level observations only. No ranking or automatic grouping exists here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bundleUsageRows.length === 0 ? (
              <EmptyState copy="No pattern bundles exist yet." />
            ) : (
              bundleUsageRows.slice(0, 3).map((bundle) => (
                <div key={bundle.bundleId} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  {bundle.name} contains {bundle.totalPatterns} patterns, {bundle.activePatternCount} active, and has been used {bundle.usedCount} times through its member patterns.
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Editorial Modes</CardTitle>
            <CardDescription>
              Intent-profile usage across saved drafts. Modes shape framing, but they do not replace Scenario Angle or pattern guidance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Mode-tagged drafts"
                value={String(insights.editorialModes.usedCount)}
                detail="Signals in this window with a saved editorial mode."
              />
              <MetricCard
                label="Top mode"
                value={insights.editorialModes.topModeLabel ?? "None yet"}
                detail={
                  insights.editorialModes.topModeLabel
                    ? `${insights.editorialModes.topModeCount} saved drafts used that mode.`
                    : "No saved drafts carry editorial mode metadata yet."
                }
              />
              <MetricCard
                label="Strong outputs"
                value={String(insights.editorialModes.rows.reduce((sum, row) => sum + row.strongOutputCount, 0))}
                detail="Saved mode-tagged signals with strong output feedback."
              />
              <MetricCard
                label="Rarely used modes"
                value={String(insights.editorialModes.underusedLabels.length)}
                detail={
                  insights.editorialModes.underusedLabels.length > 0
                    ? insights.editorialModes.underusedLabels.join(", ")
                    : "No obvious underused modes in this window."
                }
              />
            </div>

            <div className="space-y-3">
              {insights.editorialModes.rows.map((row) => (
                <div key={row.mode} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.usedCount} uses</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {row.strongOutputCount} strong-output signals have been saved with this mode in the current window.
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Editorial Mode Notes</CardTitle>
            <CardDescription>
              Light visibility only. This does not optimise, rank, or auto-select modes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.editorialModes.topModeLabel
                ? `${insights.editorialModes.topModeLabel} is currently the most-used editorial mode in this window.`
                : "No saved draft in this window has editorial mode metadata yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.editorialModes.rows.some((row) => row.strongOutputCount > 0)
                ? `${[...insights.editorialModes.rows].sort((left, right) => right.strongOutputCount - left.strongOutputCount || left.label.localeCompare(right.label))[0]?.label} currently has the clearest strong-output pairing.`
                : "No editorial mode has strong-output feedback attached in this window yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.editorialModes.underusedLabels.length > 0
                ? `${insights.editorialModes.underusedLabels.join(", ")} are currently underused, so they may be worth testing on the next suitable signal.`
                : "No editorial mode is underused enough to call out in this window."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pattern Lifecycle</CardTitle>
            <CardDescription>
              Current library health across active, retired, review-needed, and overlap-prone patterns.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Active patterns"
              value={String(patternHealthSummary.activeCount)}
              detail="Available for normal suggestions and generation."
            />
            <MetricCard
              label="Retired patterns"
              value={String(patternHealthSummary.retiredCount)}
              detail="Kept for reference only."
            />
            <MetricCard
              label="Needs review"
              value={String(patternHealthSummary.needsReviewCount)}
              detail="Active patterns with lifecycle or overlap hints."
            />
            <MetricCard
              label="Weak/refinement signals"
              value={String(patternHealthSummary.repeatedWeakOrRefinementCount)}
              detail="Patterns with repeated weak or refinement feedback."
            />
            <MetricCard
              label="Overlap hints"
              value={String(patternHealthSummary.possibleOverlapCount)}
              detail="Patterns that may need consolidation review."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pattern Lifecycle Notes</CardTitle>
            <CardDescription>
              Manual curation guidance only. Lifecycle hints do not retire or merge anything automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {patternHealthSummary.retiredCount > 0
                ? `${patternHealthSummary.retiredCount} patterns are currently retired and excluded from normal suggestions and generation.`
                : "No patterns are retired right now."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {patternHealthSummary.needsReviewCount > 0
                ? `${patternHealthSummary.needsReviewCount} active patterns currently show enough lifecycle friction to justify review.`
                : "No active pattern is currently noisy enough to surface as review-needed."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {patternHealthSummary.possibleOverlapCount > 0
                ? `${patternHealthSummary.possibleOverlapCount} patterns currently carry overlap hints, so the library may have consolidation opportunities.`
                : "No stable overlap hints are visible right now."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Final Review</CardTitle>
            <CardDescription>
              Lightweight last-mile review visibility for generated drafts before manual posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Review started"
                value={String(insights.finalReview.startedCount)}
                detail="Signals with a saved final-review state."
              />
              <MetricCard
                label="Review completed"
                value={String(insights.finalReview.completedCount)}
                detail="Signals where every generated platform is now ready or skipped."
              />
              <MetricCard
                label="Best ready rate"
                value={insights.finalReview.highestReadyPlatformLabel ?? "None yet"}
                detail={
                  insights.finalReview.highestReadyPlatformLabel
                    ? "Current platform most often marked ready."
                    : "No platform has been marked ready yet."
                }
              />
              <MetricCard
                label="Most skipped"
                value={
                  [...insights.finalReview.platformRows].sort((left, right) => right.skipCount - left.skipCount || left.label.localeCompare(right.label))[0]?.label ?? "None yet"
                }
                detail="Platform most often skipped in final review."
              />
            </div>

            <div className="space-y-3">
              {insights.finalReview.platformRows.map((row) => (
                <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.readyCount} ready</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {row.needsEditCount} need edit; {row.skipCount} skipped.
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Final Review Notes</CardTitle>
            <CardDescription>
              Final review remains a manual judgement layer. It supports readiness decisions but does not post content automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.finalReview.highestReadyPlatformLabel
                ? `${insights.finalReview.highestReadyPlatformLabel} is currently the platform most often marked ready during final review.`
                : "No platform is being marked ready often enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.finalReview.startedCount > 0
                ? `${insights.finalReview.startedCount} signals in this window already have final review underway.`
                : "No signal in this window has started final review yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.finalReview.completedCount > 0
                ? `${insights.finalReview.completedCount} signals have fully resolved final platform decisions in this window.`
                : "No signal has fully completed final review decisions in this window yet."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Posting Memory</CardTitle>
            <CardDescription>
              Manual publishing history logged after external posting. This does not connect to social APIs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Posts logged"
                value={String(insights.posting.totalPostsLogged)}
                detail="Manual external publishing entries recorded in this window."
              />
              <MetricCard
                label="Signals posted"
                value={String(insights.posting.signalsPostedCount)}
                detail="Signals with at least one logged published post."
              />
              <MetricCard
                label="Top platform"
                value={insights.posting.topPlatformLabel ?? "None yet"}
                detail={
                  insights.posting.topPlatformLabel
                    ? "Platform most often logged as posted."
                    : "No platform posting history recorded yet."
                }
              />
              <MetricCard
                label="Top posted mode"
                value={insights.posting.topEditorialModeLabel ?? "None yet"}
                detail="Editorial mode most often represented in posting memory."
              />
            </div>

            <div className="space-y-3">
              {attributionInsights.topPlatformDestinationRows[0] ? (
                <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  Attribution memory: {attributionInsights.topPlatformDestinationRows[0].label} currently carries the strongest commercial link in posting history.
                </div>
              ) : null}
              {insights.posting.platformRows.map((row) => (
                <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count} posts</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Posting Memory Notes</CardTitle>
            <CardDescription>
              This layer preserves what was actually posted. It stays separate from final review and does not automate publishing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.posting.topPatternName
                ? `${insights.posting.topPatternName} is currently the pattern most often associated with logged posts in this window.`
                : "No posted output in this window is tied to a saved pattern strongly enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.posting.topSourceKindLabel
                ? `${insights.posting.topSourceKindLabel} is currently the source family most often reaching actual posting.`
                : "No source family stands out in posting memory yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.posting.topEditorialModeLabel
                ? `${insights.posting.topEditorialModeLabel} is the editorial mode showing up most often in logged published posts.`
                : "No editorial mode has enough posting-memory history to surface yet."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Asset Mix</CardTitle>
            <CardDescription>
              Lightweight visibility into how approval-ready content is currently packaging visual support.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {insights.assets.rows.map((row) => (
                <MetricCard
                  key={row.type}
                  label={row.label}
                  value={String(row.count)}
                  detail={row.strongCount > 0 ? `${row.strongCount} strong posted outcomes.` : "No strong posted outcomes recorded yet."}
                />
              ))}
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.assets.topUsedLabel
                ? `${insights.assets.topUsedLabel} is the most-used asset posture in the current window.`
                : "No asset usage pattern is stable enough to surface yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.assets.topStrongLabel
                ? `${insights.assets.topStrongLabel} assets are currently most often tied to strong posted outcomes.`
                : "There is not enough posted outcome history yet to call out one asset type as strongest."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Repurposing Mix</CardTitle>
            <CardDescription>
              How often one signal is being expanded into additional bounded platform variants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Bundles"
                value={String(insights.repurposing.totalBundles)}
                detail="Signals carrying a saved repurposing bundle."
              />
              <MetricCard
                label="Outputs"
                value={String(insights.repurposing.totalOutputs)}
                detail="Total bounded repurposed variants in scope."
              />
              <MetricCard
                label="Top platform"
                value={insights.repurposing.topPlatformLabel ?? "None yet"}
                detail="Most common platform across repurposed outputs."
              />
              <MetricCard
                label="Top strong"
                value={insights.repurposing.topStrongPlatformLabel ?? "None yet"}
                detail="Platform most often associated with strong posted outcomes where selection history exists."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By platform</p>
                <div className="mt-3 space-y-3">
                  {insights.repurposing.platformRows.length === 0 ? (
                    <EmptyState copy="No repurposing bundles are stable enough to summarize yet." />
                  ) : (
                    insights.repurposing.platformRows.map((row) => (
                      <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {row.strongCount > 0 ? `${row.strongCount} strong posted outcomes.` : "No strong posted outcomes recorded yet."}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By format</p>
                <div className="mt-3 space-y-3">
                  {insights.repurposing.formatRows.length === 0 ? (
                    <EmptyState copy="No repurposed formats are visible yet." />
                  ) : (
                    insights.repurposing.formatRows.map((row) => (
                      <div key={row.formatType} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publish Prep Usage</CardTitle>
            <CardDescription>
              Lightweight visibility into the last-mile posting packages being prepared for manual publishing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Packages"
                value={String(insights.publishPrep.totalPackages)}
                detail="Saved publish-prep packages in the current window."
              />
              <MetricCard
                label="Top platform"
                value={insights.publishPrep.topPlatformLabel ?? "None yet"}
                detail="Platform most often receiving a posting package."
              />
              <MetricCard
                label="Top hook style"
                value={insights.publishPrep.topHookStyleLabel ?? "None yet"}
                detail="Most common selected hook posture across packages."
              />
              <MetricCard
                label="Top CTA style"
                value={insights.publishPrep.topCtaStyleLabel ?? "None yet"}
                detail="Most common selected CTA posture across packages."
              />
              <MetricCard
                label="Top destination"
                value={insights.publishPrep.topDestinationLabel ?? "None yet"}
                detail={
                  insights.publishPrep.topDestinationGuidance
                    ? insights.publishPrep.topDestinationGuidance
                    : insights.publishPrep.topHighValueDestinationLabel
                      ? `${insights.publishPrep.topHighValueDestinationLabel} currently has the strongest high-value outcome linkage.`
                    : "No destination-outcome pattern is stable enough yet."
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By platform</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.platformRows.length === 0 ? (
                    <EmptyState copy="No publish-prep packages are visible yet." />
                  ) : (
                    insights.publishPrep.platformRows.map((row) => (
                      <div key={row.platform} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top destinations used</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.destinationRows.length === 0 ? (
                    <EmptyState copy="No site-link destination usage is stable enough to summarize yet." />
                  ) : (
                    insights.publishPrep.destinationRows.slice(0, 5).map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-600">{row.label}</span>
                          <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {row.highValueCount} high · {row.mediumValueCount} medium · {row.lowValueCount} low
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {row.clickTotal} clicks · {row.leadTotal} leads
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          CTA alignment: {row.alignedCtaCount} aligned{row.misalignedCtaCount > 0 ? ` · ${row.misalignedCtaCount} misaligned` : ""}
                        </p>
                        {row.guidanceNote ? <p className="mt-2 text-xs text-slate-600">{row.guidanceNote}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Strongest destinations</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.strongestDestinationRows.length === 0 ? (
                    <EmptyState copy="No destination has enough manual strategic outcome data to stand out yet." />
                  ) : (
                    insights.publishPrep.strongestDestinationRows.map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-600">{row.label}</span>
                          <span className="text-lg font-semibold text-slate-950">{row.highValueCount}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {row.topPlatformLabel ?? "Posted"}{row.topFunnelLabel ? ` · ${row.topFunnelLabel}` : ""} · {row.leadTotal} leads
                        </p>
                        {row.guidanceNote ? <p className="mt-2 text-xs text-slate-600">{row.guidanceNote}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Underperforming destinations</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.underperformingDestinationRows.length === 0 ? (
                    <EmptyState copy="No destination is clearly underperforming yet." />
                  ) : (
                    insights.publishPrep.underperformingDestinationRows.map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-600">{row.label}</span>
                          <span className="text-lg font-semibold text-slate-950">{row.lowValueCount}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {row.highValueCount} high · {row.mediumValueCount} medium · {row.lowValueCount} low
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">CTA goal to destination</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.ctaGoalDestinationRows.length === 0 ? (
                    <EmptyState copy="No CTA-to-destination pairing is stable enough to summarize yet." />
                  ) : (
                    insights.publishPrep.ctaGoalDestinationRows.slice(0, 5).map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">CTA styles</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.ctaStyleRows.length === 0 ? (
                    <EmptyState copy="No selected CTA patterns are visible yet." />
                  ) : (
                    insights.publishPrep.ctaStyleRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome Quality</CardTitle>
            <CardDescription>
              Operator judgement about whether posted outputs felt strong, reusable, or disappointing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Outcomes recorded"
                value={String(insights.outcomes.recordedCount)}
                detail="Posted items with a saved qualitative outcome judgement."
              />
              {insights.outcomes.qualityRows.map((row) => (
                <MetricCard
                  key={row.quality}
                  label={row.label}
                  value={String(row.count)}
                  detail={`Posts marked ${row.label.toLowerCase()}.`}
                />
              ))}
            </div>

            <div className="space-y-3">
              {insights.outcomes.platformRows.map((row) => (
                <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.strongCount} strong</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {row.acceptableCount} acceptable; {row.weakCount} weak.
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Strategic Outcomes</CardTitle>
            <CardDescription>
              Manual business-facing outcomes tied back to platform, framing, mode, source, asset posture, and campaign context.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Recorded"
                value={String(insights.strategicOutcomes.recordedCount)}
                detail="Posted items with saved strategic outcome data."
              />
              <MetricCard
                label="Top high-value platform"
                value={insights.strategicOutcomes.topHighValuePlatformLabel ?? "None yet"}
                detail="Platform with the strongest high-value strategic outcomes."
              />
              <MetricCard
                label="Top lead platform"
                value={insights.strategicOutcomes.topLeadPlatformLabel ?? "None yet"}
                detail="Platform currently driving the most leads or signups."
              />
              <MetricCard
                label="Top mode"
                value={insights.strategicOutcomes.topModeLabel ?? "None yet"}
                detail="Editorial mode most often linked to high strategic value."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {insights.strategicOutcomes.valueRows.map((row) => (
                <div key={row.value} className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{row.count}</p>
                  <p className="mt-1 text-sm text-slate-500">Strategic value marked {row.label.toLowerCase()}.</p>
                </div>
              ))}
            </div>

            {insights.strategicOutcomes.summaries.length > 0 ? (
              <div className="space-y-3">
                {insights.strategicOutcomes.summaries.map((summary) => (
                  <div key={summary} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {summary}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By platform</p>
                <div className="mt-3 space-y-3">
                  {insights.strategicOutcomes.platformRows.length === 0 ? (
                    <EmptyState copy="No strategic outcomes are available yet." />
                  ) : (
                    insights.strategicOutcomes.platformRows.map((row) => (
                      <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.total}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {row.highCount} high-value · {row.clickTotal} clicks · {row.leadTotal} leads or conversions
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Modes and patterns</p>
                <div className="mt-3 space-y-3">
                  {insights.strategicOutcomes.editorialModeRows.slice(0, 3).map((row) => (
                    <div key={`mode-${row.label}`} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{row.label}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        {row.highCount} high-value · {row.clickTotal} clicks · {row.leadTotal} leads
                      </p>
                    </div>
                  ))}
                  {insights.strategicOutcomes.patternRows.slice(0, 2).map((row) => (
                    <div key={`pattern-${row.label}`} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{row.label}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        Pattern-linked outcomes: {row.highCount} high-value · {row.leadTotal} leads
                      </p>
                    </div>
                  ))}
                  {insights.strategicOutcomes.editorialModeRows.length === 0 && insights.strategicOutcomes.patternRows.length === 0 ? (
                    <EmptyState copy="No stable mode or pattern outcome signals are available yet." />
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Source, asset, and strategy</p>
                <div className="mt-3 space-y-3">
                  {[
                    insights.strategicOutcomes.sourceKindRows[0]
                      ? `Source kind: ${insights.strategicOutcomes.sourceKindRows[0].label} · ${insights.strategicOutcomes.sourceKindRows[0].highCount} high-value`
                      : null,
                    insights.strategicOutcomes.assetRows[0]
                      ? `Asset type: ${insights.strategicOutcomes.assetRows[0].label} · ${insights.strategicOutcomes.assetRows[0].highCount} high-value`
                      : null,
                    insights.strategicOutcomes.funnelRows[0]
                      ? `Funnel: ${insights.strategicOutcomes.funnelRows[0].label} · ${insights.strategicOutcomes.funnelRows[0].leadTotal} leads`
                      : null,
                    insights.strategicOutcomes.campaignRows[0]
                      ? `Campaign: ${insights.strategicOutcomes.campaignRows[0].label} · ${insights.strategicOutcomes.campaignRows[0].highCount} high-value`
                      : null,
                    insights.strategicOutcomes.bundleRows[0]
                      ? `Bundle: ${insights.strategicOutcomes.bundleRows[0].label} · ${insights.strategicOutcomes.bundleRows[0].highCount} high-value`
                      : null,
                  ]
                    .filter(Boolean)
                    .map((line) => (
                      <div key={line} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                        {line}
                      </div>
                    ))}
                  {insights.strategicOutcomes.sourceKindRows.length === 0 &&
                  insights.strategicOutcomes.assetRows.length === 0 &&
                  insights.strategicOutcomes.funnelRows.length === 0 &&
                  insights.strategicOutcomes.campaignRows.length === 0 &&
                  insights.strategicOutcomes.bundleRows.length === 0 ? (
                    <EmptyState copy="No source, asset, bundle, or campaign-level strategic pattern is stable enough to surface yet." />
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commercial Attribution Memory</CardTitle>
            <CardDescription>
              Lightweight internal attribution linking posted content, destination, platform, and business-facing outcome strength.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Attribution records"
                value={String(attributionInsights.recordedCount)}
                detail="Posts with linked commercial attribution memory."
              />
              <MetricCard
                label="Strong records"
                value={String(attributionInsights.strongCount)}
                detail="Attributed outcomes marked strong enough to influence future prioritisation."
              />
              <MetricCard
                label="Lead-linked"
                value={String(attributionInsights.leadCount + attributionInsights.signupCount)}
                detail="Attribution records tied to leads, signups, trials, or conversions."
              />
              <MetricCard
                label="Top combo"
                value={attributionInsights.topPlatformDestinationRows[0]?.label ?? "None yet"}
                detail="Strongest current platform and destination pairing."
              />
            </div>

            {attributionInsights.summaries.length > 0 ? (
              <div className="space-y-3">
                {attributionInsights.summaries.map((summary) => (
                  <div key={summary} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {summary}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top destinations</p>
                <div className="mt-3 space-y-3">
                  {attributionInsights.topDestinationRows.length === 0 ? (
                    <EmptyState copy="No destination has enough attribution memory yet." />
                  ) : (
                    attributionInsights.topDestinationRows.map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{row.strongCount} strong attributed outcomes</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Platform + destination</p>
                <div className="mt-3 space-y-3">
                  {attributionInsights.topPlatformDestinationRows.length === 0 ? (
                    <EmptyState copy="No platform and destination combo is stable enough yet." />
                  ) : (
                    attributionInsights.topPlatformDestinationRows.map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{row.strongCount} strong attributed outcomes</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Pattern and mode links</p>
                <div className="mt-3 space-y-3">
                  {attributionInsights.topPatternRows.length === 0 ? (
                    <EmptyState copy="No pattern or mode has enough commercial attribution evidence yet." />
                  ) : (
                    attributionInsights.topPatternRows.map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{row.strongCount} strong attributed outcomes</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Signal Feedback Loop</CardTitle>
            <CardDescription>
              Directional internal revenue memory linking posted content, destination, platform, and business-value strength without requiring exact revenue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Revenue signals"
                value={String(revenueInsights.recordedCount)}
                detail="Recorded or inferred revenue-linked signals tied back to posted content."
              />
              <MetricCard
                label="High strength"
                value={String(revenueInsights.highStrengthCount)}
                detail="Signals strong enough to matter for ranking and optimisation."
              />
              <MetricCard
                label="Trial or paid"
                value={String(revenueInsights.trialCount + revenueInsights.paidCount)}
                detail="Signals with clearer downstream business movement."
              />
              <MetricCard
                label="Top revenue combo"
                value={revenueInsights.topPlatformDestinationRows[0]?.label ?? "None yet"}
                detail="Strongest current platform and destination revenue pairing."
              />
            </div>

            {revenueInsights.summaries.length > 0 ? (
              <div className="space-y-3">
                {revenueInsights.summaries.map((summary) => (
                  <div key={summary} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {summary}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top destinations</p>
                <div className="mt-3 space-y-3">
                  {revenueInsights.topDestinationRows.length === 0 ? (
                    <EmptyState copy="No destination has enough revenue-linked evidence yet." />
                  ) : (
                    revenueInsights.topDestinationRows.map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{row.highStrengthCount} high-strength revenue signals</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Platform contribution</p>
                <div className="mt-3 space-y-3">
                  {revenueInsights.topPlatformRows.length === 0 ? (
                    <EmptyState copy="No platform has enough revenue-linked evidence yet." />
                  ) : (
                    revenueInsights.topPlatformRows.map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{row.highStrengthCount} high-strength revenue signals</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Patterns and modes</p>
                <div className="mt-3 space-y-3">
                  {revenueInsights.topPatternRows.length === 0 ? (
                    <EmptyState copy="No pattern or mode has enough revenue-linked evidence yet." />
                  ) : (
                    revenueInsights.topPatternRows.map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{row.highStrengthCount} high-strength revenue signals</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audience Memory Layer</CardTitle>
            <CardDescription>
              Segment-level memory showing which modes, platforms, destinations, and CTA styles are landing best with each audience segment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Segments with memory"
                value={String(audienceMemory.segmentCount)}
                detail="Audience segments with enough evidence to surface guidance."
              />
              <MetricCard
                label="Top segment"
                value={audienceInsights.segmentRows[0]?.label ?? "None yet"}
                detail={audienceInsights.segmentRows[0]?.note ?? "No segment has enough directional evidence yet."}
              />
              <MetricCard
                label="Top platform fit"
                value={audienceInsights.topPlatformRows[0]?.label ?? "None yet"}
                detail="Best current platform fit by audience segment."
              />
              <MetricCard
                label="Top destination fit"
                value={audienceInsights.topDestinationRows[0]?.label ?? "None yet"}
                detail="Best current destination path by segment response."
              />
            </div>

            {audienceInsights.topNotes.length > 0 ? (
              <div className="space-y-3">
                {audienceInsights.topNotes.map((note) => (
                  <div key={note} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {note}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Audience segments</p>
                <div className="mt-3 space-y-3">
                  {audienceInsights.segmentRows.length === 0 ? (
                    <EmptyState copy="No audience segment has enough response memory yet." />
                  ) : (
                    audienceInsights.segmentRows.map((row) => (
                      <div key={row.label} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{row.note}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Strongest modes and platforms</p>
                <div className="mt-3 space-y-3">
                  {audienceMemory.segments.length === 0 ? (
                    <EmptyState copy="No mode or platform audience fit is stable enough yet." />
                  ) : (
                    audienceMemory.segments.slice(0, 3).map((segment) => (
                      <div key={segment.segmentId} className="rounded-2xl bg-white/80 px-4 py-4">
                        <p className="font-medium text-slate-950">{segment.segmentName}</p>
                        <p className="mt-2 text-sm text-slate-600">
                          {segment.strongestModes[0]?.label ?? "No mode yet"} · {segment.strongestPlatforms[0]?.label ?? "No platform yet"}
                        </p>
                        {segment.toneCautions[0] ? (
                          <p className="mt-2 text-xs text-slate-500">{segment.toneCautions[0]}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Destinations and CTA styles</p>
                <div className="mt-3 space-y-3">
                  {audienceMemory.segments.length === 0 ? (
                    <EmptyState copy="No destination or CTA audience fit is stable enough yet." />
                  ) : (
                    audienceMemory.segments.slice(0, 3).map((segment) => (
                      <div key={`${segment.segmentId}-destination`} className="rounded-2xl bg-white/80 px-4 py-4">
                        <p className="font-medium text-slate-950">{segment.segmentName}</p>
                        <p className="mt-2 text-sm text-slate-600">
                          {segment.strongestDestinations[0]?.label ?? "No destination yet"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {segment.preferredCtaStyles[0] ?? "No CTA preference yet"}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome Quality Notes</CardTitle>
            <CardDescription>
              This layer is qualitative only. It records operator judgement after posting rather than platform metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topStrongPlatformLabel
                ? `${insights.outcomes.topStrongPlatformLabel} is currently the platform most often marked strong after posting.`
                : "No platform has enough strong outcome judgements to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topReuseModeLabel
                ? `${insights.outcomes.topReuseModeLabel} is the editorial mode most often marked as worth reusing.`
                : "No editorial mode has enough reuse recommendations to surface yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topStrongPatternName
                ? `${insights.outcomes.topStrongPatternName} is currently the pattern most often associated with strong posted outcomes.`
                : "No saved pattern is linked to strong posted outcomes often enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topStrongSourceKindLabel
                ? `${insights.outcomes.topStrongSourceKindLabel} is the source family most often tied to strong outcomes right now.`
                : "No source family stands out strongly in outcome quality yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topDoNotRepeatModeLabel
                ? `${insights.outcomes.topDoNotRepeatModeLabel} is the mode most often marked do not repeat in this window.`
                : "No editorial mode is collecting enough do-not-repeat judgments to surface yet."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Reuse Memory</CardTitle>
            <CardDescription>
              Prior judged outcomes that now act as bounded editorial memory for reuse and caution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Judged cases"
                value={String(insights.reuseMemory.totalCases)}
                detail="Posted items with qualitative outcomes available for reuse memory."
              />
              <MetricCard
                label="Reusable"
                value={String(insights.reuseMemory.reusableCount)}
                detail="Cases marked strong or worth reusing."
              />
              <MetricCard
                label="Caution"
                value={String(insights.reuseMemory.cautionCount)}
                detail="Cases marked weak or do not repeat."
              />
              <MetricCard
                label="Top reusable combo"
                value={insights.reuseMemory.topReusableCombinationLabel ?? "None yet"}
                detail="Most common reusable combination in current judged history."
              />
            </div>

            <div className="space-y-3">
              {insights.reuseMemory.platformRows.map((row) => (
                <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.reusableCount} reusable</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{row.cautionCount} cautionary outcomes.</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reuse Memory Notes</CardTitle>
            <CardDescription>
              This layer is advisory only. It helps the operator remember what worked before without auto-reusing anything.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.reuseMemory.topReusableCombinationLabel
                ? `${insights.reuseMemory.topReusableCombinationLabel} is currently the strongest reusable combination in judged history.`
                : "No reusable combination is stable enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.reuseMemory.topDoNotRepeatCombinationLabel
                ? `${insights.reuseMemory.topDoNotRepeatCombinationLabel} is the combination most often marked do not repeat.`
                : "No combination is collecting enough do-not-repeat memory to surface yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.reuseMemory.strongestPlatformLabel
                ? `${insights.reuseMemory.strongestPlatformLabel} is currently the platform where reuse memory is strongest.`
                : "No platform has enough positive reuse-memory history to stand out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.reuseMemory.weakestPlatformLabel
                ? `${insights.reuseMemory.weakestPlatformLabel} is currently the platform with the most cautionary reuse memory.`
                : "No platform has enough cautionary reuse-memory history to surface yet."}
            </div>
            {insights.reuseMemory.reusableRows.length > 0 ? (
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                <p className="font-medium text-slate-900">Top reusable combinations</p>
                <div className="mt-3 space-y-2">
                  {insights.reuseMemory.reusableRows.map((row) => (
                    <p key={row.label}>{row.label}: {row.count}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pattern Coverage</CardTitle>
            <CardDescription>
              Where the current pattern library covers incoming signals well, only partially, or not at all.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Covered"
                value={formatPercent(insights.patternCoverage.coveredRate)}
                detail={`${insights.patternCoverage.coveredCount} records with a strong existing pattern match.`}
              />
              <MetricCard
                label="Partially covered"
                value={formatPercent(insights.patternCoverage.partiallyCoveredRate)}
                detail={`${insights.patternCoverage.partiallyCoveredCount} records with only indirect or weak coverage.`}
              />
              <MetricCard
                label="Uncovered"
                value={formatPercent(insights.patternCoverage.uncoveredRate)}
                detail={`${insights.patternCoverage.uncoveredCount} records with no meaningful existing pattern coverage.`}
              />
              <MetricCard
                label="Gap candidates"
                value={String(insights.patternCoverage.gapCandidateCount)}
                detail={`${insights.patternCoverage.uncoveredGapCandidateCount} uncovered and ${insights.patternCoverage.recurringPartialGapCount} recurring partial gaps.`}
              />
            </div>

            {insights.patternCoverage.topGapTypes.length === 0 ? (
              <EmptyState copy="No stable coverage gaps are visible in this window yet." />
            ) : (
              <div className="space-y-3">
                {insights.patternCoverage.topGapTypes.map((gap) => (
                  <div key={gap.label} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">{gap.label}</p>
                      <Badge className="bg-amber-50 text-amber-700 ring-amber-200">{gap.count} signals</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gap.description}</p>
                    <p className="mt-3 text-sm text-slate-700">{gap.suggestedAction}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coverage Gap Notes</CardTitle>
            <CardDescription>
              Small operator-facing guidance about where the library looks thin enough to justify a new reusable pattern.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternCoverage.topGapTypes[0]
                ? `${insights.patternCoverage.topGapTypes[0].label} is the strongest current gap type. Consider creating one reusable pattern before broadening the library further.`
                : "No recurring coverage gap is strong enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternCoverage.uncoveredCount > 0
                ? `${insights.patternCoverage.uncoveredCount} records in this window have no meaningful pattern support at all.`
                : "Every record in this window has at least some pattern support."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternCoverage.recurringPartialGapCount > 0
                ? `${insights.patternCoverage.recurringPartialGapCount} records are only partially covered in recurring situations, which usually signals a missing middle-ground pattern.`
                : "No recurring partial-coverage gap is currently stable enough to surface."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pattern Discovery</CardTitle>
            <CardDescription>
              Lightweight candidate tracking for records that may be worth saving as reusable patterns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Candidate-worthy"
                value={String(insights.patternDiscovery.candidateCount)}
                detail="Records currently surfacing as yes or maybe pattern candidates."
              />
              <MetricCard
                label="Strong candidates"
                value={String(insights.patternDiscovery.strongCandidateCount)}
                detail="Higher-confidence candidates worth reviewing first."
              />
              <MetricCard
                label="Saved as patterns"
                value={String(insights.patternDiscovery.savedCount)}
                detail="Candidate-worthy records already represented in the pattern library."
              />
              <MetricCard
                label="Still unsaved"
                value={String(insights.patternDiscovery.unsavedCount)}
                detail={
                  insights.patternDiscovery.topShapeLabel
                    ? `${insights.patternDiscovery.topShapeLabel} is the most common candidate shape.`
                    : "No stable candidate shape yet."
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Suggestion interactions"
                value={String(insights.patternSuggestions.interactionCount)}
                detail="Explicit uses of a suggested pattern action recorded in the audit trail."
              />
              <MetricCard
                label="Suggested applies"
                value={String(insights.patternSuggestions.appliedCount)}
                detail="Generation runs where the applied pattern came from a recorded suggestion."
              />
              <MetricCard
                label="Top suggested pattern"
                value={insights.patternSuggestions.topPatterns[0]?.name ?? "None yet"}
                detail={
                  insights.patternSuggestions.topPatterns[0]
                    ? `${insights.patternSuggestions.topPatterns[0]?.count} suggestion interactions in this window.`
                    : "No explicit suggestion interactions yet."
                }
              />
            </div>

            {insights.patternDiscovery.recentCandidates.length === 0 ? (
              <EmptyState copy="No unsaved pattern candidates are stable enough to surface in this window yet." />
            ) : (
              <div className="space-y-3">
                {insights.patternDiscovery.recentCandidates.map((candidate) => (
                  <div key={candidate.signalId} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={candidate.flag === "yes" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
                        {candidate.flag === "yes" ? "Strong candidate" : "Possible candidate"}
                      </Badge>
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                        {PATTERN_TYPE_LABELS[candidate.suggestedPatternType]}
                      </Badge>
                    </div>
                    <p className="mt-3 font-medium text-slate-950">{candidate.sourceTitle}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{candidate.reason}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                      <Link href={`/signals/${candidate.signalId}`} className="text-[color:var(--accent)] underline underline-offset-4">
                        Open signal
                      </Link>
                      <Link href={`/signals/${candidate.signalId}#save-pattern`} className="text-[color:var(--accent)] underline underline-offset-4">
                        Save as pattern
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pattern Discovery Notes</CardTitle>
            <CardDescription>
              Compact observations about how candidate-worthy records are currently taking shape.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternDiscovery.topShapeLabel
                ? `${insights.patternDiscovery.topShapeLabel} is the most common pattern candidate shape in this window.`
                : "No recurring pattern candidate shape is stable enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternDiscovery.savedCount > 0
                ? `${insights.patternDiscovery.savedCount} candidate-worthy records have already made it into the pattern library.`
                : "No candidate-worthy records in this window have been saved as patterns yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternDiscovery.unsavedCount > 0
                ? `${insights.patternDiscovery.unsavedCount} candidate-worthy records still need an operator decision before they become reusable patterns.`
                : "There is no current backlog of unsaved pattern candidates in this window."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternSuggestions.topPatterns[0]
                ? `${insights.patternSuggestions.topPatterns[0].name} is the most frequently used pattern suggestion in this window.`
                : "No explicit pattern suggestion interactions have been recorded in this window yet."}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
