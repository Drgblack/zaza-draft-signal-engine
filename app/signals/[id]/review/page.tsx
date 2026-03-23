import Link from "next/link";
import { notFound } from "next/navigation";

import { FinalReviewWorkspace } from "@/components/signals/final-review-workspace";
import { GuidancePanel } from "@/components/signals/guidance-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSignalWithFallback, listSignalsWithFallback } from "@/lib/airtable";
import { getAuditEvents } from "@/lib/audit";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildEditPatternSuggestions, listLearnedEditPatterns } from "@/lib/edit-patterns";
import { buildEvergreenSummary, getEvergreenCandidateById } from "@/lib/evergreen";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildFinalReviewSummary } from "@/lib/final-review";
import { getExperimentStatusLabel, listExperiments, listExperimentsForSignal } from "@/lib/experiments";
import { syncFounderOverrideState } from "@/lib/founder-overrides";
import { assembleGuidanceForSignal } from "@/lib/guidance";
import { appendAuditEventsSafe } from "@/lib/audit";
import { listPostingOutcomes } from "@/lib/outcomes";
import {
  buildSignalNarrativeSequence,
  findNarrativeSequenceStep,
} from "@/lib/narrative-sequences";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { matchPlaybookPacksForSignal, syncPlaybookPacks } from "@/lib/playbook-packs";
import { listPatterns } from "@/lib/patterns";
import { getPostingLogEntries, listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { getOperatorTuning } from "@/lib/tuning";
import { applyApprovalPackageAutofill } from "@/lib/package-filler";
import { applyPreReviewRepairs } from "@/lib/review-repair";
import { buildRevisionGuidance } from "@/lib/revision-guidance";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { buildWeeklyPlanState, getCurrentWeeklyPlan, getWeeklyPlanAlignment } from "@/lib/weekly-plan";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { assessAutomationConfidence } from "@/lib/confidence";
import { assessConversionIntent } from "@/lib/conversion-intent";
import { assessDistributionPriority } from "@/lib/distribution-priority";
import { assessCommercialRisk } from "@/lib/risk-guardrails";
import { buildAttributionRecordsFromInputs } from "@/lib/attribution";
import { buildRevenueSignalsFromInputs } from "@/lib/revenue-signals";
import { buildRevenueAmplifierState, matchRevenueAmplifierToSignal } from "@/lib/revenue-amplifier";

export const dynamic = "force-dynamic";

function getLastAppliedPatternName(auditEvents: Awaited<ReturnType<typeof getAuditEvents>>): string | null {
  const latestApplied = [...auditEvents]
    .reverse()
    .find((event) => event.eventType === "PATTERN_APPLIED");

  return typeof latestApplied?.metadata?.patternName === "string" ? latestApplied.metadata.patternName : null;
}

export default async function FinalReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const evergreenCandidateId =
    typeof resolvedSearchParams.evergreenCandidateId === "string"
      ? resolvedSearchParams.evergreenCandidateId
      : Array.isArray(resolvedSearchParams.evergreenCandidateId)
        ? resolvedSearchParams.evergreenCandidateId[0]
        : null;
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
  const strategicOutcomes = await listStrategicOutcomes();
  const patterns = await listPatterns();
  const playbookCards = await listPlaybookCards();
  const bundles = await listPatternBundles();
  const experiments = await listExperiments();
  const tuning = await getOperatorTuning();
  const founderOverrides = await syncFounderOverrideState();
  const strategy = await getCampaignStrategy();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: allSignals,
    postingEntries: allPostingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const weeklyRecap = buildWeeklyRecap({
    signals: allSignals,
    postingEntries: allPostingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId,
  });
  const playbookPacks = await syncPlaybookPacks({
    signals: allSignals,
    postingEntries: allPostingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    reuseMemoryCases,
    recap: weeklyRecap,
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
  const learnedEditPatterns = await listLearnedEditPatterns({
    signals: allSignals,
    excludeSignalId: signal.recordId,
  });
  const reviewableSignals = allSignals
    .filter(
      (item) =>
        Boolean(item.xDraft) &&
        Boolean(item.linkedInDraft) &&
        Boolean(item.redditDraft) &&
        item.status !== "Archived" &&
        item.status !== "Rejected" &&
        item.status !== "Posted",
    )
    .sort((left, right) => new Date(right.createdDate ?? 0).getTime() - new Date(left.createdDate ?? 0).getTime());
  const reviewableIndex = reviewableSignals.findIndex((item) => item.recordId === signal.recordId);
  const navigation =
    reviewableIndex >= 0
      ? {
          previousHref:
            reviewableSignals[reviewableIndex - 1]
              ? `/signals/${reviewableSignals[reviewableIndex - 1].recordId}/review`
              : null,
          nextHref:
            reviewableSignals[reviewableIndex + 1]
              ? `/signals/${reviewableSignals[reviewableIndex + 1].recordId}/review`
              : null,
          index: reviewableIndex + 1,
          total: reviewableSignals.length,
        }
      : null;
  const editSuggestions = buildEditPatternSuggestions(signal, learnedEditPatterns);
  const revisionGuidance = buildRevisionGuidance({
    signal,
    allSignals,
    postingEntries: allPostingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, allSignals, allPostingEntries);
  const weeklyPlanAlignment = getWeeklyPlanAlignment(signal, weeklyPlan, strategy, weeklyPlanState);
  const narrativeSequence = buildSignalNarrativeSequence({
    signal,
    strategy,
  });
  const narrativeSequenceSteps = {
    x: findNarrativeSequenceStep(narrativeSequence, "x"),
    linkedin: findNarrativeSequenceStep(narrativeSequence, "linkedin"),
    reddit: findNarrativeSequenceStep(narrativeSequence, "reddit"),
  };
  const cadence = buildCampaignCadenceSummary(allSignals, strategy, allPostingEntries);
  const attributionRecords = buildAttributionRecordsFromInputs({
    signals: allSignals,
    postingEntries: allPostingEntries,
    strategicOutcomes,
  });
  const revenueSignals = buildRevenueSignalsFromInputs({
    signals: allSignals,
    postingEntries: allPostingEntries,
    strategicOutcomes,
  });
  const revenueAmplifier = buildRevenueAmplifierState({
    signals: allSignals,
    revenueSignals,
    attributionRecords,
    weeklyRecap,
  });
  const evergreenSummary = buildEvergreenSummary({
    signals: allSignals,
    postingEntries: allPostingEntries,
    postingOutcomes,
    strategicOutcomes: [],
    strategy,
    weeklyPlan,
    weeklyPlanState,
    bundles,
    maxCandidates: 10,
  });
  const evergreenContext = getEvergreenCandidateById(evergreenSummary, evergreenCandidateId);
  const playbookPackMatches = matchPlaybookPacksForSignal(signal, playbookPacks);
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
  const autonomousAssessment = assessAutonomousSignal(signal, guidance);
  const rankedCandidate =
    rankApprovalCandidates(
      [
        {
          signal,
          guidance,
          assessment: autonomousAssessment,
        },
      ],
      1,
      {
        strategy,
        cadence,
        weeklyPlan,
        weeklyPlanState,
        allSignals,
        postingEntries: allPostingEntries,
        postingOutcomes,
        strategicOutcomes,
        experiments,
        founderOverrides,
      },
    )[0] ?? null;
  const staleAssessment = rankedCandidate?.stale ?? null;
  const conflictAssessment = rankedCandidate?.conflicts ?? null;
  const hypothesis =
    rankedCandidate?.hypothesis ?? {
      objective: "review manually",
      whyItMayWork: "This package still needs direct operator judgement before approval.",
      keyLevers: [],
      riskNote: "Confidence is still unresolved.",
    };
  const fallbackConversionIntent = assessConversionIntent({
    signal,
    strategy,
    conflicts: conflictAssessment,
  });
  const packageAutofill =
    rankedCandidate?.packageAutofill ??
    applyApprovalPackageAutofill({
      signal,
      guidanceConfidenceLevel: guidance.confidence.confidenceLevel,
      automationConfidenceLevel: "medium",
      conversionIntent: fallbackConversionIntent,
      conflicts: conflictAssessment,
      assessment: autonomousAssessment,
      allSignals,
      postingEntries: allPostingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
    });
  const preReviewRepair =
    rankedCandidate?.preReviewRepair ??
    applyPreReviewRepairs({
      signal: packageAutofill.signal,
      strategy,
      guidanceConfidenceLevel: guidance.confidence.confidenceLevel,
      automationConfidenceLevel: rankedCandidate?.automationConfidence.level ?? "medium",
      completeness: packageAutofill.completenessAfter,
      conflicts: conflictAssessment,
      conversionIntent: fallbackConversionIntent,
      experiments,
    });
  const automationConfidence =
    rankedCandidate?.automationConfidence ??
    assessAutomationConfidence({
      signal,
      guidance,
      completeness: preReviewRepair.completenessAfter,
      conflicts:
        conflictAssessment ?? {
          highestSeverity: null,
          requiresJudgement: false,
          summary: [],
        },
      expectedOutcome:
        rankedCandidate?.expectedOutcome ?? {
          expectedOutcomeTier: "medium",
          expectedOutcomeReasons: [],
          positiveSignals: [],
          riskSignals: [],
        },
      hypothesis,
      fatigue:
        rankedCandidate?.fatigue ?? {
          warnings: [],
        },
    });
  const conversionIntent =
    rankedCandidate?.conversionIntent ??
    assessConversionIntent({
      signal: preReviewRepair.signal,
      strategy,
      conflicts: conflictAssessment,
    });
  const commercialRisk =
    rankedCandidate?.commercialRisk ??
    assessCommercialRisk({
      signal: preReviewRepair.signal,
      completeness: preReviewRepair.completenessAfter,
      confidenceLevel: automationConfidence.level,
      conflicts: conflictAssessment,
      fatigue:
        rankedCandidate?.fatigue ?? {
          warnings: [],
          scorePenalty: 0,
          summary: "No clear fatigue signal surfaced.",
        },
      conversionIntent,
    });
  const distributionPriority =
    rankedCandidate?.distributionPriority ??
    assessDistributionPriority({
      signal: preReviewRepair.signal,
      confidenceLevel: automationConfidence.level,
      expectedOutcomeTier: rankedCandidate?.expectedOutcome.expectedOutcomeTier ?? "medium",
      conversionIntent,
      attributionRecords,
      revenueSignals,
      postingEntries: allPostingEntries,
      fatigue:
        rankedCandidate?.fatigue ?? {
          warnings: [],
          scorePenalty: 0,
          summary: "No clear fatigue signal surfaced.",
        },
      revenueAmplifier,
      founderOverrides,
    });
  const revenueAmplifierMatch = matchRevenueAmplifierToSignal(preReviewRepair.signal, revenueAmplifier);
  await appendAuditEventsSafe([
    {
      signalId: signal.recordId,
      eventType: "HYPOTHESIS_GENERATED",
      actor: "system",
      summary: `Generated candidate hypothesis for ${hypothesis.objective}.`,
      metadata: {
        objective: hypothesis.objective,
        topLever: hypothesis.keyLevers[0] ?? null,
        riskNote: hypothesis.riskNote,
      },
    },
    {
      signalId: signal.recordId,
      eventType: "CONVERSION_INTENT_ASSIGNED",
      actor: "system",
      summary: `Assigned ${conversionIntent.posture.replaceAll("_", " ")} conversion posture for ${signal.sourceTitle}.`,
      metadata: {
        posture: conversionIntent.posture,
        preferredCtaVariant: conversionIntent.preferredCtaVariant,
        topReason: conversionIntent.whyChosen[0] ?? null,
      },
    },
    {
      signalId: signal.recordId,
      eventType: "CONFIDENCE_ASSIGNED",
      actor: "system",
      summary: `${automationConfidence.summary}.`,
      metadata: {
        level: automationConfidence.level,
        allowAutofill: automationConfidence.allowAutofill,
        allowBatchInclusion: automationConfidence.allowBatchInclusion,
        allowExperimentProposal: automationConfidence.allowExperimentProposal,
        topReason: automationConfidence.reasons[0] ?? null,
      },
    },
    ...(packageAutofill.mode === "applied" && packageAutofill.notes.length > 0
      ? [
          {
            signalId: signal.recordId,
            eventType: "PACKAGE_AUTOFILL_APPLIED" as const,
            actor: "system" as const,
            summary: `Approval autopilot filled ${packageAutofill.notes.slice(0, 2).map((note) => note.field.replaceAll("_", " ")).join(" and ")} for ${signal.sourceTitle}.`,
            metadata: {
              fields: packageAutofill.appliedFields.join(","),
              completenessBefore: packageAutofill.completenessBefore.completenessState,
              completenessAfter: packageAutofill.completenessAfter.completenessState,
            },
          },
        ]
      : []),
    ...(preReviewRepair.decision === "applied" && preReviewRepair.repairs.length > 0
      ? [
          {
            signalId: signal.recordId,
            eventType: "PRE_REVIEW_REPAIR_APPLIED" as const,
            actor: "system" as const,
            summary: preReviewRepair.summary,
            metadata: {
              repairTypes: preReviewRepair.repairs.map((repair) => repair.repairType).join(","),
              completenessBefore: preReviewRepair.completenessBefore.completenessState,
              completenessAfter: preReviewRepair.completenessAfter.completenessState,
            },
          },
        ]
      : preReviewRepair.decision === "blocked"
        ? [
            {
              signalId: signal.recordId,
              eventType: "PRE_REVIEW_REPAIR_BLOCKED" as const,
              actor: "system" as const,
              summary: preReviewRepair.summary,
              metadata: {
                reason: preReviewRepair.policy.reasons[0] ?? null,
                policyDecision: preReviewRepair.policy.decision,
              },
            },
          ]
        : []),
    ...(preReviewRepair.ctaDestinationHealing.decision === "applied"
      ? [
          {
            signalId: signal.recordId,
            eventType: "CTA_DESTINATION_SELF_HEAL_APPLIED" as const,
            actor: "system" as const,
            summary: preReviewRepair.ctaDestinationHealing.summary,
            metadata: {
              healingType: preReviewRepair.ctaDestinationHealing.healingType ?? null,
              beforeCta: preReviewRepair.ctaDestinationHealing.originalPair.ctaText,
              beforeDestination: preReviewRepair.ctaDestinationHealing.originalPair.destinationLabel,
              afterCta: preReviewRepair.ctaDestinationHealing.healedPair.ctaText,
              afterDestination: preReviewRepair.ctaDestinationHealing.healedPair.destinationLabel,
            },
          },
        ]
      : preReviewRepair.ctaDestinationHealing.decision === "blocked"
        ? [
            {
              signalId: signal.recordId,
              eventType: "CTA_DESTINATION_SELF_HEAL_BLOCKED" as const,
              actor: "system" as const,
              summary: preReviewRepair.ctaDestinationHealing.summary,
              metadata: {
                reason: preReviewRepair.ctaDestinationHealing.blockReasons[0] ?? null,
              },
            },
          ]
        : []),
    ...(commercialRisk.risks.length > 0
      ? [
          {
            signalId: signal.recordId,
            eventType: "RISK_DETECTED" as const,
            actor: "system" as const,
            summary: commercialRisk.summary,
            metadata: {
              riskType: commercialRisk.topRisk?.riskType ?? null,
              severity: commercialRisk.highestSeverity ?? null,
              suggestedFix: commercialRisk.topRisk?.suggestedFix ?? null,
            },
          },
          ...(commercialRisk.decision === "block"
            ? [
                {
                  signalId: signal.recordId,
                  eventType: "RISK_BLOCKED" as const,
                  actor: "system" as const,
                  summary: commercialRisk.summary,
                  metadata: {
                    riskType: commercialRisk.topRisk?.riskType ?? null,
                    severity: commercialRisk.highestSeverity ?? null,
                  },
                },
              ]
            : []),
        ]
      : []),
  ]);
  if (signal.platformPriority) {
    const platform =
      signal.platformPriority === "X First"
        ? "x"
        : signal.platformPriority === "Reddit First"
          ? "reddit"
          : "linkedin";
    const sequenceStep = findNarrativeSequenceStep(narrativeSequence, platform);
    if (sequenceStep) {
      await appendAuditEventsSafe([
        {
          signalId: signal.recordId,
          eventType: "NARRATIVE_SEQUENCE_REFERENCED",
          actor: "operator",
          summary: `Referenced ${sequenceStep.narrativeLabel} from final review.`,
          metadata: {
            sequenceId: sequenceStep.sequenceId,
            role: sequenceStep.contentRole,
            order: sequenceStep.stepNumber,
            platform: sequenceStep.platform,
            source: "final_review",
          },
        },
      ]);
    }
  }
  const experimentContexts = listExperimentsForSignal(experiments, signal.recordId, allPostingEntries)
    .map((experiment) => {
      const matchingVariants = experiment.variants.filter((variant) => variant.linkedSignalIds.includes(signal.recordId));
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
          {navigation ? <span>Queue position {navigation.index} / {navigation.total}</span> : null}
          <Link href={`/signals/${signal.recordId}`} className="text-[color:var(--accent)] underline underline-offset-4">
            Back to record
          </Link>
          <Link href={`/signals/${signal.recordId}/outreach`} className="text-[color:var(--accent)] underline underline-offset-4">
            Open outreach branch
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
        signal={preReviewRepair.signal}
        source={result.source}
        appliedPatternName={appliedPatternName}
        editSuggestions={editSuggestions}
        revisionGuidance={revisionGuidance.insightsByPlatform}
        guidanceConfidenceLevel={guidance.confidence.confidenceLevel}
        automationConfidence={automationConfidence}
        hypothesis={hypothesis}
        packageAutofillMode={packageAutofill.mode}
        packageAutofillNotes={packageAutofill.notes}
        preReviewRepair={preReviewRepair}
        conversionIntent={conversionIntent}
        experimentContexts={experimentContexts}
        initialPostingEntries={postingEntries}
        evergreenContext={evergreenContext?.signalId === signal.recordId ? evergreenContext : null}
        staleContext={staleAssessment}
        conflicts={conflictAssessment}
        distributionPriority={distributionPriority}
        commercialRisk={commercialRisk}
        revenueAmplifierMatch={revenueAmplifierMatch}
        playbookPackMatches={playbookPackMatches}
        narrativeSequenceSteps={{
          x: narrativeSequenceSteps.x
            ? {
                ...narrativeSequenceSteps.x,
                roleLabel: narrativeSequenceSteps.x.contentRole.replaceAll("_", " "),
              }
            : undefined,
          linkedin: narrativeSequenceSteps.linkedin
            ? {
                ...narrativeSequenceSteps.linkedin,
                roleLabel: narrativeSequenceSteps.linkedin.contentRole.replaceAll("_", " "),
              }
            : undefined,
          reddit: narrativeSequenceSteps.reddit
            ? {
                ...narrativeSequenceSteps.reddit,
                roleLabel: narrativeSequenceSteps.reddit.contentRole.replaceAll("_", " "),
              }
            : undefined,
        }}
        weeklyPlanContext={{
          weekLabel: weeklyPlanState.weekLabel,
          theme: weeklyPlan.theme,
          summary: weeklyPlanAlignment.summary,
          boosts: weeklyPlanAlignment.boosts,
          cautions: weeklyPlanAlignment.cautions,
        }}
        navigation={navigation}
      />
    </div>
  );
}
