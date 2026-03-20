import Link from "next/link";

import { FollowUpTaskList } from "@/components/follow-up/follow-up-task-list";
import {
  ApprovalQueueSection,
  EvergreenLaterSection,
  EvergreenResurfacingSection,
} from "@/components/signals/approval-queue-section";
import { BorderlineReviewWorkbenchSection } from "@/components/signals/borderline-review-workbench-section";
import { DuplicateClusterReviewSection } from "@/components/signals/duplicate-cluster-review-section";
import { ExperimentProposalSection } from "@/components/signals/experiment-proposal-section";
import { WorkflowQueueSection } from "@/components/signals/workflow-queue-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { appendAuditEventsSafe, listAuditEvents, type AuditEventInput } from "@/lib/audit";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildBorderlineReviewModel, getAutoRepairLabel, getLatestAutoRepairEntry } from "@/lib/auto-repair";
import { buildBatchApprovalPrep } from "@/lib/batch-approval";
import { buildCampaignCadenceSummary, getCampaignStrategy, getSignalContentContextSummary } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { buildAutonomousExperimentProposals, listExperimentProposals } from "@/lib/experiment-proposals";
import { listFeedbackEntries } from "@/lib/feedback";
import { listFollowUpTasks } from "@/lib/follow-up";
import {
  buildDuplicateClusterDifferenceNotes,
  buildSuggestedDuplicateClusters,
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { getExperimentStatusLabel, listExperiments, listExperimentsForSignal } from "@/lib/experiments";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildSignalPostingSummary, indexPostingEntriesBySignalId, listPostingLogEntries } from "@/lib/posting-log";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import type { ReviewCommandCenterViewId } from "@/lib/review-command-center";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { buildStaleQueueOverview } from "@/lib/stale-queue";
import { getOperatorTuning } from "@/lib/tuning";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";
import { getWeeklyPlanStore } from "@/lib/weekly-plan";
import { getScheduledSoonSignals, getWorkflowBuckets, sortSignals } from "@/lib/workflow";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ReviewView =
  | "command_center"
  | "ready_to_approve"
  | "stale"
  | "needs_judgement"
  | "missing_outcomes"
  | "experiment_linked"
  | "fatigued"
  | "campaign_critical"
  | "evergreen"
  | "auto_repaired"
  | "full_queue";

function getSingleSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) ? value[0] ?? null : null;
}

function isReviewView(value: string | null): value is ReviewView {
  return (
    value === "command_center" ||
    value === "ready_to_approve" ||
    value === "stale" ||
    value === "needs_judgement" ||
    value === "missing_outcomes" ||
    value === "experiment_linked" ||
    value === "fatigued" ||
    value === "campaign_critical" ||
    value === "evergreen" ||
    value === "auto_repaired" ||
    value === "full_queue"
  );
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const maybeView = getSingleSearchParam(resolvedSearchParams.view);
  const selectedView: ReviewView = isReviewView(maybeView) ? maybeView : "command_center";
  const { signals, source, error } = await listSignalsWithFallback();
  const feedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const playbookCards = await listPlaybookCards();
  const bundles = await listPatternBundles();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const strategicOutcomes = await listStrategicOutcomes();
  const duplicateClusters = await listDuplicateClusters();
  const experiments = await listExperiments();
  const storedExperimentProposals = await listExperimentProposals();
  const strategy = await getCampaignStrategy();
  const tuning = await getOperatorTuning();
  const weeklyPlanStore = await getWeeklyPlanStore(strategy);
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
  const cadence = buildCampaignCadenceSummary(signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, signals, postingEntries);
  const followUpTasks = await listFollowUpTasks({
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    weeklyPlans: weeklyPlanStore.plans,
  });
  const evergreenSummary = buildEvergreenSummary({
    signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    strategy,
    cadence,
    weeklyPlan,
    weeklyPlanState,
    bundles,
    maxCandidates: 5,
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
  const suggestedDuplicateClusters = buildSuggestedDuplicateClusters(sortedSignals, duplicateClusters);
  const confirmedClustersByCanonicalSignalId = indexConfirmedClusterByCanonicalSignalId(duplicateClusters);
  const visibleSignals = filterSignalsForActiveReviewQueue(sortedSignals, duplicateClusters);
  const signalById = new Map(sortedSignals.map((signal) => [signal.recordId, signal]));
  const unifiedGuidanceBySignalId = Object.fromEntries(
    sortedSignals.map((signal) => [
      signal.recordId,
      buildUnifiedGuidanceModel({
        signal,
        guidance: guidanceBySignalId[signal.recordId],
        context: "review",
        tuning: tuning.settings,
      }),
    ]),
  );
  const autonomousAssessments = visibleSignals.map((signal) => ({
    signal,
    guidance: unifiedGuidanceBySignalId[signal.recordId],
    assessment: assessAutonomousSignal(signal, unifiedGuidanceBySignalId[signal.recordId]),
  }));
  const approvalReadyCandidates = rankApprovalCandidates(
    autonomousAssessments.filter((item) => item.assessment.decision === "approval_ready"),
    30,
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
  const staleAuditHistory = await listAuditEvents({
    signalIds: approvalReadyCandidates.map((candidate) => candidate.signal.recordId),
  });
  const staleAuditEventsBySignalId = staleAuditHistory.reduce<Record<string, typeof staleAuditHistory>>((index, event) => {
    index[event.signalId] = [...(index[event.signalId] ?? []), event];
    return index;
  }, {});
  const experimentProposals = buildAutonomousExperimentProposals({
    candidates: approvalReadyCandidates,
    experiments,
    storedProposals: storedExperimentProposals,
    maxProposals: 5,
  }).filter((proposal) => proposal.status === "open");
  const staleOverview = buildStaleQueueOverview(approvalReadyCandidates.map((candidate) => candidate.stale));
  const highConflictApprovalCandidates = approvalReadyCandidates.filter(
    (candidate) => candidate.conflicts.requiresJudgement || candidate.automationConfidence.requiresOperatorJudgement,
  );
  const evergreenLaterCandidates = approvalReadyCandidates.filter(
    (candidate) => candidate.stale.operatorAction === "move_to_evergreen_later",
  );
  const batchPrep = buildBatchApprovalPrep({
    candidates: approvalReadyCandidates,
    strategy,
    maxItems: 5,
  });
  await appendAuditEventsSafe(
    approvalReadyCandidates.flatMap((candidate) => {
      const events: AuditEventInput[] = [
        {
          signalId: candidate.signal.recordId,
          eventType: "HYPOTHESIS_GENERATED" as const,
          actor: "system" as const,
          summary: `Generated candidate hypothesis for ${candidate.hypothesis.objective}.`,
          metadata: {
            objective: candidate.hypothesis.objective,
            topLever: candidate.hypothesis.keyLevers[0] ?? null,
            riskNote: candidate.hypothesis.riskNote,
          },
        },
        {
          signalId: candidate.signal.recordId,
          eventType: "EXPECTED_OUTCOME_RANKING_COMPUTED" as const,
          actor: "system" as const,
          summary: `Assigned ${candidate.expectedOutcome.expectedOutcomeTier} expected outcome tier for approval ranking.`,
          metadata: {
            tier: candidate.expectedOutcome.expectedOutcomeTier,
            score: candidate.expectedOutcome.expectedOutcomeScore,
            topPositive: candidate.expectedOutcome.positiveSignals[0] ?? null,
            topRisk: candidate.expectedOutcome.riskSignals[0] ?? null,
          },
        },
        {
          signalId: candidate.signal.recordId,
          eventType: "CONVERSION_INTENT_ASSIGNED",
          actor: "system",
          summary: `Assigned ${candidate.conversionIntent.posture.replaceAll("_", " ")} conversion posture for ${candidate.signal.sourceTitle}.`,
          metadata: {
            posture: candidate.conversionIntent.posture,
            preferredCtaVariant: candidate.conversionIntent.preferredCtaVariant,
            topReason: candidate.conversionIntent.whyChosen[0] ?? null,
          },
        },
        {
          signalId: candidate.signal.recordId,
          eventType: "CONFIDENCE_ASSIGNED",
          actor: "system",
          summary: `${candidate.automationConfidence.summary}.`,
          metadata: {
            level: candidate.automationConfidence.level,
            allowAutofill: candidate.automationConfidence.allowAutofill,
            allowBatchInclusion: candidate.automationConfidence.allowBatchInclusion,
            allowExperimentProposal: candidate.automationConfidence.allowExperimentProposal,
            topReason: candidate.automationConfidence.reasons[0] ?? null,
          },
        },
      ];
      const autofillEvents: AuditEventInput[] =
        candidate.packageAutofill.mode === "applied" && candidate.packageAutofill.notes.length
        ? [
            {
              signalId: candidate.signal.recordId,
              eventType: "PACKAGE_AUTOFILL_APPLIED",
              actor: "system",
              summary: `Approval autopilot filled ${candidate.packageAutofill.notes.slice(0, 2).map((note) => note.field.replaceAll("_", " ")).join(" and ")} for ${candidate.signal.sourceTitle}.`,
              metadata: {
                fields: candidate.packageAutofill.appliedFields.join(","),
                completenessBefore: candidate.packageAutofill.completenessBefore.completenessState,
                completenessAfter: candidate.packageAutofill.completenessAfter.completenessState,
              },
            },
            ...candidate.packageAutofill.notes.flatMap((note): AuditEventInput[] =>
              note.field === "cta"
                ? [
                    {
                      signalId: candidate.signal.recordId,
                      eventType: "CTA_AUTOFILLED",
                      actor: "system",
                      summary: `Auto-filled CTA for ${candidate.signal.sourceTitle}.`,
                      metadata: {
                        value: note.value,
                      },
                    },
                  ]
                : note.field === "destination"
                  ? [
                      {
                        signalId: candidate.signal.recordId,
                        eventType: "DESTINATION_AUTOFILLED",
                        actor: "system",
                        summary: `Auto-selected destination for ${candidate.signal.sourceTitle}.`,
                        metadata: {
                          value: note.value,
                        },
                      },
                    ]
                  : note.field === "asset_direction" || note.field === "asset_selection"
                    ? [
                        {
                          signalId: candidate.signal.recordId,
                          eventType: "ASSET_DIRECTION_AUTOFILLED",
                          actor: "system",
                          summary: `Auto-selected asset direction for ${candidate.signal.sourceTitle}.`,
                          metadata: {
                            value: note.value,
                          },
                        },
                      ]
                    : [],
            ),
          ]
        : [];

      if (!candidate.fatigue.warnings[0]) {
        return [...events, ...autofillEvents];
      }

      return [
        ...events,
        {
          signalId: candidate.signal.recordId,
          eventType: "FATIGUE_WARNING_SHOWN" as const,
          actor: "system" as const,
          summary: candidate.fatigue.warnings[0].summary,
          metadata: {
            dimension: candidate.fatigue.warnings[0].dimension,
            label: candidate.fatigue.warnings[0].label,
            severity: candidate.fatigue.warnings[0].severity,
          },
        },
        ...autofillEvents,
      ];
    }),
  );
  await appendAuditEventsSafe(
    approvalReadyCandidates.flatMap((candidate): AuditEventInput[] => {
      if (
        candidate.stale.state !== "stale" &&
        candidate.stale.state !== "stale_but_reusable" &&
        candidate.stale.state !== "stale_needs_refresh"
      ) {
        return [];
      }

      const lastMarkedEvent = [...(staleAuditEventsBySignalId[candidate.signal.recordId] ?? [])]
        .reverse()
        .find((event) => event.eventType === "QUEUE_ITEM_MARKED_STALE");
      const previousState =
        typeof lastMarkedEvent?.metadata?.staleState === "string" ? lastMarkedEvent.metadata.staleState : null;

      if (previousState === candidate.stale.state) {
        return [];
      }

      return [
        {
          signalId: candidate.signal.recordId,
          eventType: "QUEUE_ITEM_MARKED_STALE",
          actor: "system",
          summary: `${candidate.signal.sourceTitle} is now ${candidate.stale.summary.toLowerCase()}.`,
          metadata: {
            staleState: candidate.stale.state,
            suggestedAction: candidate.stale.suggestedAction,
            topReason: candidate.stale.reasons[0]?.code ?? null,
            ageDays: candidate.stale.ageDays,
          },
        },
      ];
    }),
  );
  await appendAuditEventsSafe(
    approvalReadyCandidates.flatMap((candidate): AuditEventInput[] => {
      const lastConflictEvent = [...(staleAuditEventsBySignalId[candidate.signal.recordId] ?? [])]
        .reverse()
        .find(
          (event) =>
            event.eventType === "CONFLICT_DETECTED" ||
            event.eventType === "CONFLICT_RESOLVED",
        );

      if (candidate.conflicts.fingerprint) {
        const previousFingerprint =
          lastConflictEvent?.eventType === "CONFLICT_DETECTED" &&
          typeof lastConflictEvent.metadata?.fingerprint === "string"
            ? lastConflictEvent.metadata.fingerprint
            : null;

        if (lastConflictEvent?.eventType === "CONFLICT_DETECTED" && previousFingerprint === candidate.conflicts.fingerprint) {
          return [];
        }

        return [
          {
            signalId: candidate.signal.recordId,
            eventType: "CONFLICT_DETECTED",
            actor: "system",
            summary: `${candidate.signal.sourceTitle} has package conflicts that need explicit judgement.`,
            metadata: {
              fingerprint: candidate.conflicts.fingerprint,
              highestSeverity: candidate.conflicts.highestSeverity,
              topConflictType: candidate.conflicts.topConflicts[0]?.conflictType ?? null,
              topConflictFix: candidate.conflicts.topConflicts[0]?.suggestedFix ?? null,
            },
          },
        ];
      }

      if (lastConflictEvent?.eventType !== "CONFLICT_DETECTED") {
        return [];
      }

      return [
        {
          signalId: candidate.signal.recordId,
          eventType: "CONFLICT_RESOLVED",
          actor: "system",
          summary: `${candidate.signal.sourceTitle} no longer has a meaningful package conflict.`,
          metadata: {
            previousFingerprint:
              typeof lastConflictEvent.metadata?.fingerprint === "string"
                ? lastConflictEvent.metadata.fingerprint
                : null,
          },
        },
      ];
    }),
  );
  await appendAuditEventsSafe(
    experimentProposals.slice(0, 4).map((proposal) => ({
      signalId: proposal.signalId,
      eventType: "EXPERIMENT_PROPOSED" as const,
      actor: "system" as const,
      summary: `Proposed ${proposal.experimentType.replaceAll("_", " ")} for ${proposal.sourceTitle}.`,
      metadata: {
        proposalId: proposal.proposalId,
        experimentType: proposal.experimentType,
        comparisonTarget: proposal.comparisonTarget,
      },
    })),
  );
  const heldCases = autonomousAssessments.filter((item) => item.assessment.decision === "hold");
  const experimentContextsBySignalId = Object.fromEntries(
    approvalReadyCandidates.map((candidate) => {
      const signalExperiments = listExperimentsForSignal(experiments, candidate.signal.recordId, postingEntries)
        .map((experiment) => {
          const matchingVariants = experiment.variants.filter((variant) => variant.linkedSignalIds.includes(candidate.signal.recordId));
          if (matchingVariants.length === 0) {
            return null;
          }

          return {
            name: experiment.name,
            statusLabel: getExperimentStatusLabel(experiment.status),
            learningGoal: experiment.learningGoal,
            comparisonTarget: experiment.comparisonTarget,
            variantLabels: matchingVariants.map((variant) => variant.variantLabel),
          };
        })
        .filter((experiment): experiment is NonNullable<typeof experiment> => Boolean(experiment));

      return [candidate.signal.recordId, signalExperiments];
    }),
  );
  const postingEntriesBySignalId = indexPostingEntriesBySignalId(postingEntries);
  const postingSummaryBySignalId = Object.fromEntries(
    visibleSignals.map((signal) => [
      signal.recordId,
      buildSignalPostingSummary(signal, postingEntriesBySignalId[signal.recordId] ?? []),
    ]),
  );
  const buckets = getWorkflowBuckets(visibleSignals);
  const scheduledSoon = getScheduledSoonSignals(visibleSignals);
  const duplicateClusterRows = duplicateClusters
    .filter((cluster) => cluster.status === "confirmed")
    .map((cluster) => ({
      clusterId: cluster.clusterId,
      similarityType: cluster.similarityType,
      clusterConfidence: cluster.clusterConfidence,
      clusterReason: cluster.clusterReason,
      canonicalSignalId: cluster.canonicalSignalId,
      signalIds: cluster.signalIds,
      suppressedSignalIds: cluster.suppressedSignalIds,
      differenceNotes: buildDuplicateClusterDifferenceNotes(cluster, signalById),
      members: cluster.signalIds
        .map((signalId) => signalById.get(signalId))
        .filter((signal): signal is (typeof signals)[number] => Boolean(signal))
        .map((signal) => ({
          recordId: signal.recordId,
          sourceTitle: signal.sourceTitle,
          status: signal.status,
          reviewPriority: signal.reviewPriority,
          sourcePublisher: signal.sourcePublisher,
          scenarioAngle: signal.scenarioAngle,
          createdDate: signal.createdDate,
        })),
    }));
  const suggestedDuplicateClusterRows = suggestedDuplicateClusters.map((cluster) => ({
    clusterId: cluster.clusterId,
    similarityType: cluster.similarityType,
    clusterConfidence: cluster.clusterConfidence,
    clusterReason: cluster.clusterReason,
    canonicalSignalId: cluster.canonicalSignalId,
    signalIds: cluster.signalIds,
    suppressedSignalIds: cluster.suppressedSignalIds,
    differenceNotes: buildDuplicateClusterDifferenceNotes(cluster, signalById),
    members: cluster.signalIds
      .map((signalId) => signalById.get(signalId))
      .filter((signal): signal is (typeof signals)[number] => Boolean(signal))
      .map((signal) => ({
        recordId: signal.recordId,
        sourceTitle: signal.sourceTitle,
        status: signal.status,
        reviewPriority: signal.reviewPriority,
        sourcePublisher: signal.sourcePublisher,
        scenarioAngle: signal.scenarioAngle,
        createdDate: signal.createdDate,
      })),
  }));
  const borderlineRows = heldCases
    .map((item) => {
      const workbench = buildBorderlineReviewModel(item.signal, item.guidance, item.assessment);
      if (!workbench) {
        return null;
      }
      const context = getSignalContentContextSummary(item.signal, strategy);
      const latestRepair = getLatestAutoRepairEntry(item.signal);
      return {
        recordId: item.signal.recordId,
        sourceTitle: item.signal.sourceTitle,
        status: item.signal.status,
        stageLabel:
          item.assessment.stage === "auto_interpret"
            ? "Held before interpretation"
            : item.assessment.stage === "auto_generate"
              ? "Held before generation"
              : "Held before approval queue",
        confidenceLabel: `${item.guidance.confidence.confidenceLevel} confidence`,
        confidenceTone:
          item.guidance.confidence.confidenceLevel === "high"
            ? ("success" as const)
            : item.guidance.confidence.confidenceLevel === "low"
              ? ("warning" as const)
              : ("neutral" as const),
        assessmentSummary: item.assessment.summary,
        reasons: item.assessment.reasons,
        strongestCaution: item.assessment.strongestCaution,
        platformPriority: item.signal.platformPriority,
        editorialModeLabel: item.signal.editorialMode ? getEditorialModeDefinition(item.signal.editorialMode).label : null,
        pillarLabel: context.pillarName,
        funnelStage: context.funnelStage,
        latestRepairLabel: latestRepair ? getAutoRepairLabel(latestRepair) : null,
        nextStepHref:
          item.assessment.stage === "auto_interpret"
            ? `/signals/${item.signal.recordId}/interpret`
            : item.assessment.stage === "auto_generate"
              ? `/signals/${item.signal.recordId}/generate`
              : `/signals/${item.signal.recordId}/review`,
        workbench,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const approvalCandidatesForView = approvalReadyCandidates.filter((candidate) => {
    if (selectedView === "experiment_linked") {
      return (experimentContextsBySignalId[candidate.signal.recordId] ?? []).length > 0;
    }
    if (selectedView === "needs_judgement") {
      return candidate.conflicts.requiresJudgement || candidate.automationConfidence.requiresOperatorJudgement;
    }
    if (selectedView === "stale") {
      return candidate.stale.state !== "fresh";
    }
    if (selectedView === "fatigued") {
      return candidate.fatigue.warnings.length > 0;
    }
    if (selectedView === "campaign_critical") {
      return candidate.rankReasons.some((reason) => reason.toLowerCase().includes("campaign"));
    }
    if (selectedView === "auto_repaired") {
      return Boolean(getLatestAutoRepairEntry(candidate.signal));
    }
    return true;
  });
  const viewLinks: Array<{ value: ReviewView; label: string; count: number }> = [
    { value: "command_center", label: "Command center", count: approvalReadyCandidates.length + borderlineRows.length + followUpTasks.length },
    { value: "ready_to_approve", label: "Ready to approve", count: approvalReadyCandidates.length },
    { value: "stale", label: "Stale queue", count: approvalReadyCandidates.filter((candidate) => candidate.stale.state !== "fresh").length },
    { value: "needs_judgement", label: "Needs judgement", count: borderlineRows.length + suggestedDuplicateClusterRows.length + experimentProposals.length + highConflictApprovalCandidates.length },
    { value: "missing_outcomes", label: "Missing outcomes", count: followUpTasks.length },
    { value: "experiment_linked", label: "Experiment-linked", count: approvalReadyCandidates.filter((candidate) => (experimentContextsBySignalId[candidate.signal.recordId] ?? []).length > 0).length },
    { value: "fatigued", label: "Fatigued", count: approvalReadyCandidates.filter((candidate) => candidate.fatigue.warnings.length > 0).length },
    { value: "campaign_critical", label: "Campaign-critical", count: approvalReadyCandidates.filter((candidate) => candidate.rankReasons.some((reason) => reason.toLowerCase().includes("campaign"))).length },
    { value: "evergreen", label: "Evergreen", count: evergreenSummary.surfacedCount },
    { value: "auto_repaired", label: "Auto-repaired", count: approvalReadyCandidates.filter((candidate) => Boolean(getLatestAutoRepairEntry(candidate.signal))).length },
    { value: "full_queue", label: "Full queue", count: visibleSignals.length },
  ];
  const commandCenterStats = [
    {
      label: "Scan now",
      value:
        selectedView === "needs_judgement"
          ? `${borderlineRows.length + highConflictApprovalCandidates.length} judgement calls`
          : selectedView === "stale"
            ? `${approvalCandidatesForView.length} aging or stale`
          : selectedView === "missing_outcomes"
            ? `${followUpTasks.length} follow-ups`
            : `${approvalCandidatesForView.length} ready candidates`,
      detail:
        selectedView === "campaign_critical"
          ? "Campaign-weighted view"
          : selectedView === "needs_judgement"
            ? highConflictApprovalCandidates.length > 0
              ? `${highConflictApprovalCandidates.length} approval-ready items also have package conflicts`
              : "Held items and edge cases needing operator judgement"
          : selectedView === "stale"
            ? "Queue drift and refresh calls"
          : selectedView === "fatigued"
            ? "Repetition risks surfaced"
            : selectedView === "evergreen"
              ? "Reuse lane active"
              : "Fastest next operator lane",
    },
    {
      label: "Batch review",
      value: `${batchPrep.items.length} staged`,
      detail: batchPrep.items.length > 0 ? "Prepared for one-pass approval" : "No batch staged right now",
    },
    {
      label: "Stale queue",
      value: `${staleOverview.staleCount} stale`,
      detail:
        staleOverview.topReasons[0]
          ? `${staleOverview.topReasons[0].label} is the top stale reason`
          : "No stale queue pressure right now",
    },
    {
      label: "Outcome gaps",
      value: `${followUpTasks.length} open`,
      detail: followUpTasks.length > 0 ? "Posted items or experiments still need manual learning updates" : "No overdue follow-up tasks",
    },
  ];

  const queueSummary = [
    { label: "Approval-ready", count: approvalReadyCandidates.length, href: "#approval-ready" },
    { label: "Stale queue", count: staleOverview.staleCount, href: "#approval-ready" },
    { label: "Evergreen later", count: evergreenLaterCandidates.length, href: "#evergreen-later" },
    { label: "Batch review", count: batchPrep.items.length, href: "/review/batch" },
    { label: "Experiment proposals", count: experimentProposals.length, href: "#experiment-proposals" },
    { label: "Duplicate clusters", count: duplicateClusterRows.length + suggestedDuplicateClusterRows.length, href: "#duplicate-clusters" },
    { label: "Evergreen", count: evergreenSummary.surfacedCount, href: "#evergreen-resurfacing" },
    { label: "Borderline", count: borderlineRows.length, href: "#borderline-workbench" },
    { label: "Needs interpretation", count: buckets.needsInterpretation.length, href: "#needs-interpretation" },
    { label: "Ready for generation", count: buckets.readyForGeneration.length, href: "#ready-for-generation" },
    { label: "Ready for review", count: buckets.readyForReview.length, href: "#ready-for-review" },
    { label: "Ready to schedule", count: buckets.readyToSchedule.length, href: "#ready-to-schedule" },
    { label: "Scheduled / awaiting posting", count: buckets.scheduledAwaitingPosting.length, href: "#scheduled-awaiting-posting" },
    { label: "Filtered out", count: buckets.filteredOut.length, href: "#filtered-out" },
  ];
  const showScheduledSoon = selectedView === "command_center" || selectedView === "full_queue";
  const showWeeklyPlan = selectedView === "command_center" || selectedView === "campaign_critical" || selectedView === "full_queue";
  const showDuplicates = selectedView === "command_center" || selectedView === "needs_judgement" || selectedView === "full_queue";
  const showExperimentProposals =
    selectedView === "command_center" || selectedView === "needs_judgement" || selectedView === "experiment_linked" || selectedView === "full_queue";
  const showApprovalQueue =
    selectedView !== "missing_outcomes" && selectedView !== "evergreen";
  const showEvergreen = selectedView === "command_center" || selectedView === "evergreen" || selectedView === "full_queue";
  const showEvergreenLater = selectedView === "command_center" || selectedView === "stale" || selectedView === "full_queue";
  const showBorderline = selectedView === "command_center" || selectedView === "needs_judgement" || selectedView === "full_queue";
  const showFollowUp = selectedView === "command_center" || selectedView === "missing_outcomes";
  const showWorkflow =
    selectedView === "command_center" ||
    selectedView === "full_queue" ||
    selectedView === "ready_to_approve";
  const approvalQueueInitialView: ReviewCommandCenterViewId =
    selectedView === "ready_to_approve"
      ? "ready_to_approve"
      : selectedView === "needs_judgement"
        ? "needs_judgement"
      : selectedView === "stale"
        ? "stale"
      : selectedView === "missing_outcomes"
        ? "missing_outcomes"
        : selectedView === "experiment_linked"
          ? "experiment_linked"
          : selectedView === "fatigued"
            ? "fatigued"
            : selectedView === "campaign_critical"
              ? "campaign_critical"
              : selectedView === "auto_repaired"
                ? "auto_repaired"
                : "all";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              {selectedView.replaceAll("_", " ")}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Review Command Center</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Approval-first operator queue compressed into focused lanes. Switch views fast, scan compact cards, and drop into final review only when a candidate actually needs deeper work.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {commandCenterStats.map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
                <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {viewLinks.map((view) => (
              <Link
                key={view.value}
                href={view.value === "command_center" ? "/review" : `/review?view=${view.value}`}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  selectedView === view.value
                    ? "bg-slate-950 text-white"
                    : "bg-white/80 text-slate-700 hover:bg-white"
                }`}
              >
                {view.label} ({view.count})
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/review/batch" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800">
              {batchPrep.items.length} candidates ready in batch review
            </Link>
            <Link href="/digest" className="rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white">
              Open digest start page
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
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

      {showScheduledSoon ? (
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
      ) : null}

      {showWeeklyPlan ? (
      <Card>
        <CardHeader>
          <CardTitle>Weekly Plan</CardTitle>
          <CardDescription>
            Soft planning guidance for this week. It nudges ranking and highlights mix gaps without blocking strong candidates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Week</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{weeklyPlanState.weekLabel}</p>
              <p className="mt-1 text-sm text-slate-500">{weeklyPlan.theme ?? "No weekly theme set."}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Campaigns</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{weeklyPlan.activeCampaignIds.length}</p>
              <p className="mt-1 text-sm text-slate-500">
                {weeklyPlanState.activeCampaignNames.length > 0 ? weeklyPlanState.activeCampaignNames.join(" · ") : "No campaign emphasis set."}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Platforms</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{weeklyPlan.targetPlatforms.length}</p>
              <p className="mt-1 text-sm text-slate-500">
                {weeklyPlan.targetPlatforms.length > 0
                  ? weeklyPlan.targetPlatforms.map((platform) => getPostingPlatformLabel(platform)).join(" · ")
                  : "No platform emphasis set."}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current gaps</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{weeklyPlanState.gaps.length}</p>
              <p className="mt-1 text-sm text-slate-500">
                {weeklyPlanState.summaries[0] ?? "Current queue looks broadly aligned."}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {(weeklyPlanState.gaps.length > 0 ? weeklyPlanState.gaps : weeklyPlanState.summaries).slice(0, 4).map((note) => (
              <div key={note} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {note}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      ) : null}

      {showFollowUp ? (
        <div id="missing-outcomes">
        <Card>
          <CardHeader>
            <CardTitle>Missing Outcomes</CardTitle>
            <CardDescription>Open follow-up tasks that still block commercial learning.</CardDescription>
          </CardHeader>
          <CardContent>
            <FollowUpTaskList
              initialTasks={followUpTasks}
              emptyCopy="No outcome follow-up tasks are open right now."
              referenceNowIso={new Date().toISOString()}
            />
          </CardContent>
        </Card>
        </div>
      ) : null}

      {showDuplicates ? (
        <DuplicateClusterReviewSection
          suggestedClusters={suggestedDuplicateClusterRows}
          confirmedClusters={duplicateClusterRows}
        />
      ) : null}

      {showExperimentProposals ? <ExperimentProposalSection proposals={experimentProposals} /> : null}

      {showApprovalQueue ? (
        <ApprovalQueueSection
          candidates={approvalReadyCandidates}
          strategy={strategy}
          cadence={cadence}
          weeklyPlan={weeklyPlan}
          weeklyPlanState={weeklyPlanState}
          initialView={approvalQueueInitialView}
          experimentContextsBySignalId={experimentContextsBySignalId}
        />
      ) : null}

      {showEvergreenLater ? <EvergreenLaterSection candidates={evergreenLaterCandidates} /> : null}

      {showEvergreen ? <EvergreenResurfacingSection candidates={evergreenSummary.candidates} /> : null}

      {showBorderline ? <BorderlineReviewWorkbenchSection items={borderlineRows} /> : null}

      {showWorkflow ? <WorkflowQueueSection
        id="needs-interpretation"
        title="Needs Interpretation"
        description="New records or records still missing the structured editorial judgement layer."
        signals={buckets.needsInterpretation}
        emptyCopy="No signals are waiting on interpretation."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      /> : null}

      {showWorkflow ? <WorkflowQueueSection
        id="ready-for-generation"
        title="Ready For Generation"
        description="Signals with interpretation saved but no draft outputs yet."
        signals={buckets.readyForGeneration}
        emptyCopy="Nothing is queued for generation."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      /> : null}

      {showWorkflow ? <WorkflowQueueSection
        id="ready-for-review"
        title="Ready For Review"
        description="Drafted records that need operator review, approval, or final refinements."
        signals={buckets.readyForReview}
        emptyCopy="No drafted records need review right now."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      /> : null}

      {showWorkflow ? <WorkflowQueueSection
        id="ready-to-schedule"
        title="Approved / Ready To Schedule"
        description="Approved records that can be assigned a scheduled date."
        signals={buckets.readyToSchedule}
        emptyCopy="No approved records are waiting for scheduling."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      /> : null}

      {showWorkflow ? <WorkflowQueueSection
        id="scheduled-awaiting-posting"
        title="Scheduled / Awaiting Posting"
        description="Records already scheduled and waiting to be logged as posted."
        signals={buckets.scheduledAwaitingPosting}
        emptyCopy="No scheduled records are waiting to be posted."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      /> : null}

      {showWorkflow ? <WorkflowQueueSection
        id="filtered-out"
        title="Filtered Out"
        description="Signals the scoring layer marked as reject or quality-gate fail. These stay visible for auditability without crowding the active queue."
        signals={buckets.filteredOut}
        emptyCopy="No signals are currently filtered out by the scoring gate."
        guidanceBySignalId={guidanceBySignalId}
        postingSummaryBySignalId={postingSummaryBySignalId}
      /> : null}
    </div>
  );
}
