import type { AutoAdvanceAssessment } from "@/lib/auto-advance";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import { evaluateApprovalPackageCompleteness, type ApprovalPackageCompleteness } from "@/lib/completeness";
import { buildFatigueModel, type FatigueAssessment } from "@/lib/fatigue";
import type { UnifiedGuidance } from "@/lib/guidance";
import { buildCandidateHypothesis, type CandidateHypothesis } from "@/lib/hypotheses";
import type { PostingLogEntry } from "@/lib/posting-memory";
import { buildSignalRepurposingBundle } from "@/lib/repurposing";
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
      return 5;
    case "moderate":
      return 3;
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
    postingEntries?: PostingLogEntry[];
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
      const resolvedContext =
        options?.strategy ? getSignalContentContextSummary(candidate.signal, options.strategy) : null;
      const repurposingBundle = buildSignalRepurposingBundle(candidate.signal);
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
      const completeness = evaluateApprovalPackageCompleteness({
        signal: candidate.signal,
        guidanceConfidenceLevel: candidate.guidance.confidence.confidenceLevel,
      });
      const fatigue = fatigueModel.assessmentsById[candidate.signal.recordId] ?? {
        warnings: [],
        scorePenalty: 0,
        summary: "No clear fatigue signal surfaced.",
      };
      const hypothesis = buildCandidateHypothesis({
        signal: candidate.signal,
        guidance: candidate.guidance,
        assessment: candidate.assessment,
        strategy: options?.strategy,
        weeklyBoosts: planAlignment?.boosts,
        weeklyCautions: planAlignment?.cautions,
      });

      rankScore += scoreConfidence(candidate.guidance.confidence.confidenceLevel);
      if (candidate.guidance.confidence.confidenceLevel === "high") {
        uniquePush(rankReasons, "High confidence");
      } else if (candidate.guidance.confidence.confidenceLevel === "moderate") {
        uniquePush(rankReasons, "Moderate confidence");
      }

      if (candidate.guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "positive")) {
        rankScore += 3;
        uniquePush(rankReasons, "Strong reuse support");
      }

      if (candidate.guidance.relatedPlaybookCards[0]) {
        rankScore += 2;
        uniquePush(rankReasons, "Playbook support exists");
      }

      if (candidate.guidance.relatedPatterns[0]) {
        rankScore += 2;
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

      if (candidate.signal.reviewPriority === "Urgent") {
        rankScore += 2;
        uniquePush(rankReasons, "Urgent review priority");
      } else if (candidate.signal.reviewPriority === "High") {
        rankScore += 1;
        uniquePush(rankReasons, "High review priority");
      }

      if ((candidate.signal.signalNoveltyScore ?? 0) >= 70) {
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

      if (fatigue.scorePenalty > 0) {
        rankScore -= fatigue.scorePenalty;
        uniquePush(rankReasons, fatigue.summary);
      }

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

      if ((candidate.signal.similarityToExistingContent ?? 0) >= 80) {
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
        completeness,
        fatigue,
        hypothesis,
        rankScore,
        rankReasons: rankReasons.slice(0, 3),
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
