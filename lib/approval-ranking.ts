import type { AutoAdvanceAssessment } from "@/lib/auto-advance";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import { evaluateApprovalPackageCompleteness, type ApprovalPackageCompleteness } from "@/lib/completeness";
import { assessAutomationConfidence, type AutomationConfidenceAssessment } from "@/lib/confidence";
import { assessConversionIntent, type ConversionIntentAssessment } from "@/lib/conversion-intent";
import { assessCandidateConflicts, type ConflictAssessment } from "@/lib/conflicts";
import { buildAttributionRecordsFromInputs } from "@/lib/attribution";
import { buildAudienceMemoryState } from "@/lib/audience-memory";
import {
  assessDistributionPriority,
  type DistributionPriorityAssessment,
} from "@/lib/distribution-priority";
import { assessExpectedOutcome, type ExpectedOutcomeAssessment } from "@/lib/expected-outcome-ranking";
import { assessExecutionChain, type ExecutionChainAssessment } from "@/lib/execution-chains";
import type { ManualExperiment } from "@/lib/experiments";
import { buildFatigueModel, type FatigueAssessment } from "@/lib/fatigue";
import type { UnifiedGuidance } from "@/lib/guidance";
import { buildCandidateHypothesis, type CandidateHypothesis } from "@/lib/hypotheses";
import type { PostingOutcome } from "@/lib/outcomes";
import { applyApprovalPackageAutofill, type PackageAutofillResult } from "@/lib/package-filler";
import type { PostingLogEntry } from "@/lib/posting-memory";
import { applyPreReviewRepairs, type PreReviewRepairResult } from "@/lib/review-repair";
import { assessQueueTriage, type QueueTriageAssessment } from "@/lib/queue-triage";
import {
  assessCommercialRisk,
  type CommercialRiskAssessment,
} from "@/lib/risk-guardrails";
import { buildSignalRepurposingBundle } from "@/lib/repurposing";
import {
  assessStaleQueueCandidate,
  readStaleQueueOperatorStateMapSync,
  type StaleQueueAssessment,
} from "@/lib/stale-queue";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { WeeklyPlan, WeeklyPlanState } from "@/lib/weekly-plan";
import { getWeeklyPlanAlignment } from "@/lib/weekly-plan";
import type { SignalRecord } from "@/types/signal";
import type { DuplicateCluster } from "@/lib/duplicate-clusters";
import { buildRevenueSignalsFromInputs } from "@/lib/revenue-signals";
import {
  buildRevenueAmplifierState,
  matchRevenueAmplifierToSignal,
  type RevenueAmplifierMatch,
} from "@/lib/revenue-amplifier";
import type { FounderOverrideState } from "@/lib/founder-overrides";

export interface ApprovalQueueCandidate {
  signal: SignalRecord;
  guidance: UnifiedGuidance;
  assessment: AutoAdvanceAssessment;
  completeness: ApprovalPackageCompleteness;
  fatigue: FatigueAssessment;
  hypothesis: CandidateHypothesis;
  expectedOutcome: ExpectedOutcomeAssessment;
  conflicts: ConflictAssessment;
  conversionIntent: ConversionIntentAssessment;
  automationConfidence: AutomationConfidenceAssessment;
  packageAutofill: PackageAutofillResult;
  preReviewRepair: PreReviewRepairResult;
  commercialRisk: CommercialRiskAssessment;
  distributionPriority: DistributionPriorityAssessment;
  revenueAmplifierMatch: RevenueAmplifierMatch | null;
  executionChain: ExecutionChainAssessment;
  triage: QueueTriageAssessment;
  stale: StaleQueueAssessment;
  rankScore: number;
  rankReasons: string[];
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function scoreConfidence(level: UnifiedGuidance["confidence"]["confidenceLevel"]): number {
  switch (level) {
    case "high":
      return 3;
    case "moderate":
      return 1;
    case "low":
    default:
      return 0;
  }
}

export function rankApprovalCandidates(
  candidates: Array<{
    signal: SignalRecord;
    guidance: UnifiedGuidance;
    assessment: AutoAdvanceAssessment;
  }>,
  limit = 10,
  options?: {
    strategy?: CampaignStrategy;
    cadence?: CampaignCadenceSummary;
    weeklyPlan?: WeeklyPlan | null;
    weeklyPlanState?: WeeklyPlanState | null;
    confirmedClustersByCanonicalSignalId?: Record<string, DuplicateCluster>;
    allSignals?: SignalRecord[];
    postingEntries?: PostingLogEntry[];
    postingOutcomes?: PostingOutcome[];
      strategicOutcomes?: StrategicOutcome[];
      experiments?: ManualExperiment[];
      founderOverrides?: FounderOverrideState | null;
    },
): ApprovalQueueCandidate[] {
  const now = new Date();
  const fatigueModel = buildFatigueModel({
    subjects: candidates.map((candidate) => ({
      id: candidate.signal.recordId,
      signal: candidate.signal,
      guidance: candidate.guidance,
    })),
    signals: candidates.map((candidate) => candidate.signal),
    postingEntries: options?.postingEntries ?? [],
  });
  const staleOperatorStatesBySignalId = readStaleQueueOperatorStateMapSync(now);
  const attributionRecords = buildAttributionRecordsFromInputs({
    postingEntries: options?.postingEntries ?? [],
    strategicOutcomes: options?.strategicOutcomes ?? [],
    signals: options?.allSignals ?? candidates.map((item) => item.signal),
  });
  const revenueSignals = buildRevenueSignalsFromInputs({
    postingEntries: options?.postingEntries ?? [],
    strategicOutcomes: options?.strategicOutcomes ?? [],
    signals: options?.allSignals ?? candidates.map((item) => item.signal),
  });
  const audienceMemory = options?.strategy
    ? buildAudienceMemoryState({
        strategy: options.strategy,
        signals: options?.allSignals ?? candidates.map((item) => item.signal),
        postingEntries: options?.postingEntries ?? [],
        strategicOutcomes: options?.strategicOutcomes ?? [],
        attributionRecords,
        revenueSignals,
      })
    : null;
  const revenueAmplifier = buildRevenueAmplifierState({
    signals: options?.allSignals ?? candidates.map((item) => item.signal),
    revenueSignals,
    attributionRecords,
  });

  return candidates
    .map((candidate) => {
      let rankScore = 0;
      const rankReasons: string[] = [];
      const baseRepurposingBundle = buildSignalRepurposingBundle(candidate.signal);
      const confirmedCluster = options?.confirmedClustersByCanonicalSignalId?.[candidate.signal.recordId] ?? null;
      const planAlignment =
        options?.strategy && options?.weeklyPlan
          ? getWeeklyPlanAlignment(
              candidate.signal,
              options.weeklyPlan,
              options.strategy,
              options.weeklyPlanState,
            )
          : null;
      const baseCompleteness = evaluateApprovalPackageCompleteness({
        signal: candidate.signal,
        guidanceConfidenceLevel: candidate.guidance.confidence.confidenceLevel,
      });
      const fatigue = fatigueModel.assessmentsById[candidate.signal.recordId] ?? {
        warnings: [],
        scorePenalty: 0,
        summary: "No clear fatigue signal surfaced.",
      };
      const baseHypothesis = buildCandidateHypothesis({
        signal: candidate.signal,
        guidance: candidate.guidance,
        assessment: candidate.assessment,
        strategy: options?.strategy,
        weeklyBoosts: planAlignment?.boosts,
        weeklyCautions: planAlignment?.cautions,
      });
      const baseExpectedOutcome = assessExpectedOutcome({
        signal: candidate.signal,
        guidance: candidate.guidance,
        assessment: candidate.assessment,
        completeness: baseCompleteness,
        fatigue,
        hypothesis: baseHypothesis,
        allSignals: options?.allSignals ?? candidates.map((item) => item.signal),
        postingEntries: options?.postingEntries ?? [],
        postingOutcomes: options?.postingOutcomes ?? [],
        strategicOutcomes: options?.strategicOutcomes ?? [],
        attributionRecords,
        revenueSignals,
        audienceMemory,
        experiments: options?.experiments ?? [],
        strategy: options?.strategy,
        cadence: options?.cadence,
      });
      const baseConflicts = assessCandidateConflicts({
        signal: candidate.signal,
        hypothesis: baseHypothesis,
        expectedOutcome: baseExpectedOutcome,
        fatigue,
        strategy: options?.strategy,
        experiments: options?.experiments ?? [],
      });
      const automationConfidence = assessAutomationConfidence({
        signal: candidate.signal,
        guidance: candidate.guidance,
        completeness: baseCompleteness,
        conflicts: baseConflicts,
        expectedOutcome: baseExpectedOutcome,
        hypothesis: baseHypothesis,
        fatigue,
      });
      const baseConversionIntent = assessConversionIntent({
        signal: candidate.signal,
        strategy: options?.strategy,
        conflicts: baseConflicts,
        attributionRecords,
        revenueSignals,
        audienceMemory,
      });
      const packageAutofill = applyApprovalPackageAutofill({
        signal: candidate.signal,
        guidanceConfidenceLevel: candidate.guidance.confidence.confidenceLevel,
        automationConfidenceLevel: automationConfidence.level,
        conversionIntent: baseConversionIntent,
        conflicts: baseConflicts,
        attributionRecords,
        revenueSignals,
        audienceMemory,
        assessment: candidate.assessment,
        allSignals: options?.allSignals ?? candidates.map((item) => item.signal),
        postingEntries: options?.postingEntries ?? [],
        postingOutcomes: options?.postingOutcomes ?? [],
        strategicOutcomes: options?.strategicOutcomes ?? [],
        experiments: options?.experiments ?? [],
      });
      const autofilledSignal = packageAutofill.signal;
      const resolvedContext =
        options?.strategy ? getSignalContentContextSummary(autofilledSignal, options.strategy) : null;
      const autofillCompleteness =
        packageAutofill.mode === "applied"
          ? packageAutofill.completenessAfter
          : baseCompleteness;
      const autofillHypothesis =
        packageAutofill.mode === "applied"
          ? buildCandidateHypothesis({
              signal: autofilledSignal,
              guidance: candidate.guidance,
              assessment: candidate.assessment,
              strategy: options?.strategy,
              weeklyBoosts: planAlignment?.boosts,
              weeklyCautions: planAlignment?.cautions,
            })
          : baseHypothesis;
      const autofillExpectedOutcome =
        packageAutofill.mode === "applied"
          ? assessExpectedOutcome({
              signal: autofilledSignal,
              guidance: candidate.guidance,
              assessment: candidate.assessment,
              completeness: autofillCompleteness,
              fatigue,
              hypothesis: autofillHypothesis,
              allSignals: options?.allSignals ?? candidates.map((item) => item.signal),
              postingEntries: options?.postingEntries ?? [],
              postingOutcomes: options?.postingOutcomes ?? [],
              strategicOutcomes: options?.strategicOutcomes ?? [],
              attributionRecords,
              revenueSignals,
              audienceMemory,
              experiments: options?.experiments ?? [],
              strategy: options?.strategy,
              cadence: options?.cadence,
            })
          : baseExpectedOutcome;
      const autofillConflicts =
        packageAutofill.mode === "applied"
          ? assessCandidateConflicts({
              signal: autofilledSignal,
              hypothesis: autofillHypothesis,
              expectedOutcome: autofillExpectedOutcome,
              fatigue,
              strategy: options?.strategy,
              experiments: options?.experiments ?? [],
            })
          : baseConflicts;
      const autofillConversionIntent =
        packageAutofill.mode === "applied"
          ? assessConversionIntent({
              signal: autofilledSignal,
              strategy: options?.strategy,
              conflicts: autofillConflicts,
              attributionRecords,
              revenueSignals,
              audienceMemory,
            })
          : baseConversionIntent;
      const preReviewRepair = applyPreReviewRepairs({
        signal: autofilledSignal,
        strategy: options?.strategy,
        guidanceConfidenceLevel: candidate.guidance.confidence.confidenceLevel,
        automationConfidenceLevel: automationConfidence.level,
        completeness: autofillCompleteness,
        conflicts: autofillConflicts,
        conversionIntent: autofillConversionIntent,
        attributionRecords,
        revenueSignals,
        audienceMemory,
        experiments: options?.experiments ?? [],
      });
      const rankedSignal = preReviewRepair.signal;
      const completeness =
        preReviewRepair.decision === "applied"
          ? preReviewRepair.completenessAfter
          : autofillCompleteness;
      const hypothesis =
        preReviewRepair.decision === "applied"
          ? buildCandidateHypothesis({
              signal: rankedSignal,
              guidance: candidate.guidance,
              assessment: candidate.assessment,
              strategy: options?.strategy,
              weeklyBoosts: planAlignment?.boosts,
              weeklyCautions: planAlignment?.cautions,
            })
          : autofillHypothesis;
      const expectedOutcome =
        preReviewRepair.decision === "applied"
          ? assessExpectedOutcome({
              signal: rankedSignal,
              guidance: candidate.guidance,
              assessment: candidate.assessment,
              completeness,
              fatigue,
              hypothesis,
              allSignals: options?.allSignals ?? candidates.map((item) => item.signal),
              postingEntries: options?.postingEntries ?? [],
              postingOutcomes: options?.postingOutcomes ?? [],
              strategicOutcomes: options?.strategicOutcomes ?? [],
              attributionRecords,
              revenueSignals,
              audienceMemory,
              experiments: options?.experiments ?? [],
              strategy: options?.strategy,
              cadence: options?.cadence,
            })
          : autofillExpectedOutcome;
      const conflicts =
        preReviewRepair.decision === "applied"
          ? assessCandidateConflicts({
              signal: rankedSignal,
              hypothesis,
              expectedOutcome,
              fatigue,
              strategy: options?.strategy,
              experiments: options?.experiments ?? [],
            })
          : autofillConflicts;
      const conversionIntent =
        preReviewRepair.decision === "applied"
          ? assessConversionIntent({
              signal: rankedSignal,
              strategy: options?.strategy,
              conflicts,
              attributionRecords,
              revenueSignals,
              audienceMemory,
            })
          : autofillConversionIntent;
      const commercialRisk = assessCommercialRisk({
        signal: rankedSignal,
        completeness,
        confidenceLevel: automationConfidence.level,
        conflicts,
        fatigue,
        conversionIntent,
        audienceMemory,
        postingEntries: options?.postingEntries ?? [],
        postingOutcomes: options?.postingOutcomes ?? [],
        strategicOutcomes: options?.strategicOutcomes ?? [],
      });
      const experimentLinked = (options?.experiments ?? []).some(
        (experiment) =>
          experiment.status !== "completed" &&
          experiment.variants.some((variant) => variant.linkedSignalIds.includes(rankedSignal.recordId)),
      );
      const distributionPriority = assessDistributionPriority({
        signal: rankedSignal,
        confidenceLevel: candidate.guidance.confidence.confidenceLevel,
        expectedOutcomeTier: expectedOutcome.expectedOutcomeTier,
        conversionIntent,
        audienceMemory,
        attributionRecords,
        revenueSignals,
        postingEntries: options?.postingEntries ?? [],
        fatigue,
        revenueAmplifier,
        founderOverrides: options?.founderOverrides,
        experimentLinked,
      });
      const revenueAmplifierMatch = matchRevenueAmplifierToSignal(
        rankedSignal,
        revenueAmplifier,
      );

      rankScore += scoreConfidence(candidate.guidance.confidence.confidenceLevel);
      if (candidate.guidance.confidence.confidenceLevel === "high") {
        uniquePush(rankReasons, "High confidence");
      } else if (candidate.guidance.confidence.confidenceLevel === "moderate") {
        uniquePush(rankReasons, "Moderate confidence");
      }

      if (candidate.guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "positive")) {
        rankScore += 2;
        uniquePush(rankReasons, "Strong reuse support");
      }

      if (candidate.guidance.relatedPlaybookCards[0]) {
        rankScore += 1;
        uniquePush(rankReasons, "Playbook support exists");
      }

      if (candidate.guidance.relatedPatterns[0]) {
        rankScore += 1;
        uniquePush(rankReasons, "Pattern support exists");
      }

      if (candidate.guidance.relatedBundles[0]) {
        rankScore += 1;
        uniquePush(rankReasons, "Bundle context exists");
      }

      if (candidate.assessment.draftQuality?.label === "Strong") {
        rankScore += 2;
        uniquePush(rankReasons, "Draft quality checks are strong");
      } else if (candidate.assessment.draftQuality?.label === "Needs Review") {
        rankScore += 1;
      }

      if (rankedSignal.reviewPriority === "Urgent") {
        rankScore += 2;
        uniquePush(rankReasons, "Urgent review priority");
      } else if (rankedSignal.reviewPriority === "High") {
        rankScore += 1;
        uniquePush(rankReasons, "High review priority");
      }

      if ((rankedSignal.signalNoveltyScore ?? 0) >= 70) {
        rankScore += 1;
        uniquePush(rankReasons, "Strong novelty");
      }

      if ((baseRepurposingBundle?.outputs.length ?? 0) >= 4) {
        rankScore += 1;
        uniquePush(rankReasons, "Repurposes well across formats");
      }

      if ((confirmedCluster?.signalIds.length ?? 0) > 1) {
        uniquePush(rankReasons, `Represents ${confirmedCluster!.signalIds.length} similar signals`);
      }

      if (completeness.completenessState === "complete") {
        rankScore += 4;
        uniquePush(rankReasons, "Approval package is complete");
      } else if (completeness.completenessState === "mostly_complete") {
        rankScore += 1;
        uniquePush(rankReasons, "Approval package is mostly complete");
      } else {
        rankScore -= 3;
        uniquePush(rankReasons, `Missing ${completeness.missingElements[0] ?? "package pieces"}`);
      }

      rankScore += automationConfidence.rankAdjustment;
      uniquePush(rankReasons, automationConfidence.summary);

      if (packageAutofill.mode === "applied" && packageAutofill.notes.length > 0) {
        rankScore += Math.min(2, packageAutofill.notes.length);
        uniquePush(rankReasons, `Approval autopilot filled ${packageAutofill.notes.slice(0, 2).map((note) => note.field.replaceAll("_", " ")).join(" and ")}`);
      } else if (packageAutofill.mode === "suggested" && packageAutofill.notes.length > 0) {
        uniquePush(rankReasons, `Approval autopilot suggests ${packageAutofill.notes[0]?.field.replaceAll("_", " ") ?? "package fixes"}`);
      }

      if (preReviewRepair.decision === "applied" && preReviewRepair.repairs.length > 0) {
        rankScore += 1;
        uniquePush(
          rankReasons,
          `Pre-review repair applied ${preReviewRepair.repairs
            .slice(0, 2)
            .map((repair) => repair.repairType.replaceAll("_", " "))
            .join(" and ")}`,
        );
      }

      rankScore += expectedOutcome.expectedOutcomeScore;
      uniquePush(
        rankReasons,
        `${expectedOutcome.expectedOutcomeTier === "high" ? "High" : expectedOutcome.expectedOutcomeTier === "medium" ? "Medium" : "Low"} expected value`,
      );
      uniquePush(rankReasons, expectedOutcome.expectedOutcomeReasons[0]);
      rankScore += conversionIntent.rankAdjustment;
      uniquePush(rankReasons, `Conversion posture: ${conversionIntent.posture.replaceAll("_", " ")}`);
      uniquePush(rankReasons, conversionIntent.whyChosen[0]);
      if (conflicts.summary[0]) {
        uniquePush(rankReasons, `Conflict: ${conflicts.summary[0]}`);
      }
      if (commercialRisk.topRisk) {
        uniquePush(
          rankReasons,
          `Risk: ${commercialRisk.topRisk.riskType.replaceAll("_", " ")}`,
        );
      }
      uniquePush(
        rankReasons,
        `Distribution: ${distributionPriority.primaryPlatformLabel} ${distributionPriority.distributionStrategy === "single" ? "first" : distributionPriority.distributionStrategy}`,
      );
      uniquePush(rankReasons, revenueAmplifierMatch?.recommendation);

      if (planAlignment) {
        rankScore += planAlignment.scoreDelta;
        for (const reason of planAlignment.boosts) {
          uniquePush(rankReasons, reason);
        }
        for (const caution of planAlignment.cautions) {
          uniquePush(rankReasons, caution);
        }
      }

      if (resolvedContext?.campaignName && options?.cadence) {
        const campaignRow = options.cadence.byCampaign.find((row) => row.id === resolvedContext.campaignId);
        if (campaignRow?.status === "active") {
          rankScore += 1;
          uniquePush(rankReasons, "Supports an active campaign");
        }
      }

      if (resolvedContext?.pillarName && options?.cadence?.underrepresentedPillars.includes(resolvedContext.pillarName)) {
        rankScore += 1;
        uniquePush(rankReasons, "Helps rebalance pillar mix");
      }

      if (resolvedContext?.funnelStage && options?.cadence?.underrepresentedFunnels.includes(resolvedContext.funnelStage)) {
        rankScore += 1;
        uniquePush(rankReasons, "Helps rebalance funnel mix");
      }

      if ((rankedSignal.similarityToExistingContent ?? 0) >= 80) {
        rankScore -= 1;
        uniquePush(rankReasons, "Some repetition risk");
      }

      if (resolvedContext?.pillarId && options?.cadence) {
        const pillarRow = options.cadence.byPillar.find((row) => row.id === resolvedContext.pillarId);
        if ((pillarRow?.recentCount ?? 0) >= 3) {
          rankScore -= 1;
          uniquePush(rankReasons, "Recent pillar repetition");
        }
      }

      if (resolvedContext?.audienceSegmentId && options?.cadence) {
        const audienceRow = options.cadence.byAudience.find((row) => row.id === resolvedContext.audienceSegmentId);
        if ((audienceRow?.recentCount ?? 0) >= 3) {
          rankScore -= 1;
          uniquePush(rankReasons, "Recent audience repetition");
        }
      }

      if (candidate.guidance.gapWarnings[0] && candidate.guidance.relatedPlaybookCards.length === 0) {
        rankScore -= 1;
      }

      if (candidate.guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "caution")) {
        rankScore -= 1;
      }
      if (commercialRisk.decision === "block") {
        rankScore -= 3;
      } else if (commercialRisk.decision === "suggest_fix") {
        rankScore -= 1;
      }

      const stale = assessStaleQueueCandidate({
        signal: rankedSignal,
        fatigue,
        expectedOutcome,
        rankReasons,
        planAlignment,
        strategy: options?.strategy,
        operatorState: staleOperatorStatesBySignalId[rankedSignal.recordId] ?? null,
        now,
      });
      const triage = assessQueueTriage({
        automationConfidence,
        completeness,
        conflicts,
        expectedOutcome,
        stale,
        packageAutofill,
        preReviewRepair,
        commercialRisk,
        distributionPriority,
        experimentLinked,
      });
      const executionChain = assessExecutionChain({
        candidate: {
          signal: rankedSignal,
          packageAutofill,
          preReviewRepair,
          automationConfidence,
          conflicts,
          completeness,
          triage,
          commercialRisk,
          distributionPriority,
        },
        experimentLinked,
      });

      rankScore -= conflicts.rankPenalty;
      rankScore -= stale.rankPenalty;
      uniquePush(rankReasons, `Queue triage: ${triage.summary.toLowerCase()}`);

      return {
        ...candidate,
        signal: rankedSignal,
        completeness,
        fatigue,
        hypothesis,
        expectedOutcome,
        conflicts,
        conversionIntent,
        automationConfidence,
        packageAutofill,
        preReviewRepair,
        commercialRisk,
        distributionPriority,
        revenueAmplifierMatch,
        executionChain,
        triage,
        stale,
        rankScore,
        rankReasons: rankReasons.slice(0, 4),
      };
    })
    .sort(
      (left, right) =>
        right.rankScore - left.rankScore ||
        (right.signal.signalUrgencyScore ?? 0) - (left.signal.signalUrgencyScore ?? 0) ||
        new Date(right.signal.createdDate).getTime() - new Date(left.signal.createdDate).getTime() ||
        left.signal.sourceTitle.localeCompare(right.signal.sourceTitle),
    )
    .slice(0, limit);
}
