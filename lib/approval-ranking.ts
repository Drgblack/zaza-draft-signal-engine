import type { AutoAdvanceAssessment } from "@/lib/auto-advance";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import type { UnifiedGuidance } from "@/lib/guidance";
import { buildSignalRepurposingBundle } from "@/lib/repurposing";
import type { WeeklyPlan, WeeklyPlanState } from "@/lib/weekly-plan";
import { getWeeklyPlanAlignment } from "@/lib/weekly-plan";
import type { SignalRecord } from "@/types/signal";

export interface ApprovalQueueCandidate {
  signal: SignalRecord;
  guidance: UnifiedGuidance;
  assessment: AutoAdvanceAssessment;
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
  },
): ApprovalQueueCandidate[] {
  return candidates
    .map((candidate) => {
      let rankScore = 0;
      const rankReasons: string[] = [];
      const resolvedContext =
        options?.strategy ? getSignalContentContextSummary(candidate.signal, options.strategy) : null;
      const repurposingBundle = buildSignalRepurposingBundle(candidate.signal);

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

      if (options?.strategy && options?.weeklyPlan) {
        const planAlignment = getWeeklyPlanAlignment(
          candidate.signal,
          options.weeklyPlan,
          options.strategy,
          options.weeklyPlanState,
        );
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
