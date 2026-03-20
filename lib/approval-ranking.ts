import type { AutoAdvanceAssessment } from "@/lib/auto-advance";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import { evaluateApprovalPackageCompleteness, type ApprovalPackageCompleteness } from "@/lib/completeness";
import { assessExpectedOutcome, type ExpectedOutcomeAssessment } from "@/lib/expected-outcome-ranking";
import type { ManualExperiment } from "@/lib/experiments";
import { buildFatigueModel, type FatigueAssessment } from "@/lib/fatigue";
import type { UnifiedGuidance } from "@/lib/guidance";
import { buildCandidateHypothesis, type CandidateHypothesis } from "@/lib/hypotheses";
import type { PostingOutcome } from "@/lib/outcomes";
import { applyApprovalPackageAutofill, type PackageAutofillResult } from "@/lib/package-filler";
import type { PostingLogEntry } from "@/lib/posting-memory";
import { buildSignalRepurposingBundle } from "@/lib/repurposing";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { WeeklyPlan, WeeklyPlanState } from "@/lib/weekly-plan";
import { getWeeklyPlanAlignment } from "@/lib/weekly-plan";
import type { SignalRecord } from "@/types/signal";
import type { DuplicateCluster } from "@/lib/duplicate-clusters";

export interface ApprovalQueueCandidate {
  signal: SignalRecord;
  guidance: UnifiedGuidance;
  assessment: AutoAdvanceAssessment;
  completeness: ApprovalPackageCompleteness;
  fatigue: FatigueAssessment;
  hypothesis: CandidateHypothesis;
  expectedOutcome: ExpectedOutcomeAssessment;
  packageAutofill: PackageAutofillResult;
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
  },
): ApprovalQueueCandidate[] {
  const fatigueModel = buildFatigueModel({
    subjects: candidates.map((candidate) => ({
      id: candidate.signal.recordId,
      signal: candidate.signal,
      guidance: candidate.guidance,
    })),
    signals: candidates.map((candidate) => candidate.signal),
    postingEntries: options?.postingEntries ?? [],
  });

  return candidates
    .map((candidate) => {
      let rankScore = 0;
      const rankReasons: string[] = [];
      const packageAutofill = applyApprovalPackageAutofill({
        signal: candidate.signal,
        guidanceConfidenceLevel: candidate.guidance.confidence.confidenceLevel,
        assessment: candidate.assessment,
        allSignals: options?.allSignals ?? candidates.map((item) => item.signal),
        postingEntries: options?.postingEntries ?? [],
        postingOutcomes: options?.postingOutcomes ?? [],
        strategicOutcomes: options?.strategicOutcomes ?? [],
        experiments: options?.experiments ?? [],
      });
      const rankedSignal = packageAutofill.signal;
      const resolvedContext =
        options?.strategy ? getSignalContentContextSummary(rankedSignal, options.strategy) : null;
      const repurposingBundle = buildSignalRepurposingBundle(rankedSignal);
      const confirmedCluster = options?.confirmedClustersByCanonicalSignalId?.[rankedSignal.recordId] ?? null;
      const planAlignment =
        options?.strategy && options?.weeklyPlan
          ? getWeeklyPlanAlignment(
              rankedSignal,
              options.weeklyPlan,
              options.strategy,
              options.weeklyPlanState,
            )
          : null;
      const completeness = evaluateApprovalPackageCompleteness({
        signal: rankedSignal,
        guidanceConfidenceLevel: candidate.guidance.confidence.confidenceLevel,
      });
      const fatigue = fatigueModel.assessmentsById[rankedSignal.recordId] ?? {
        warnings: [],
        scorePenalty: 0,
        summary: "No clear fatigue signal surfaced.",
      };
      const hypothesis = buildCandidateHypothesis({
        signal: rankedSignal,
        guidance: candidate.guidance,
        assessment: candidate.assessment,
        strategy: options?.strategy,
        weeklyBoosts: planAlignment?.boosts,
        weeklyCautions: planAlignment?.cautions,
      });
      const expectedOutcome = assessExpectedOutcome({
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
        experiments: options?.experiments ?? [],
        strategy: options?.strategy,
        cadence: options?.cadence,
      });

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

      if ((repurposingBundle?.outputs.length ?? 0) >= 4) {
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

      if (packageAutofill.notes.length > 0) {
        rankScore += Math.min(2, packageAutofill.notes.length);
        uniquePush(rankReasons, `Approval autopilot filled ${packageAutofill.notes.slice(0, 2).map((note) => note.field.replaceAll("_", " ")).join(" and ")}`);
      }

      rankScore += expectedOutcome.expectedOutcomeScore;
      uniquePush(
        rankReasons,
        `${expectedOutcome.expectedOutcomeTier === "high" ? "High" : expectedOutcome.expectedOutcomeTier === "medium" ? "Medium" : "Low"} expected value`,
      );
      uniquePush(rankReasons, expectedOutcome.expectedOutcomeReasons[0]);

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

      return {
        ...candidate,
        signal: rankedSignal,
        completeness,
        fatigue,
        hypothesis,
        expectedOutcome,
        packageAutofill,
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
