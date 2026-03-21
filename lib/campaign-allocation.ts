import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { AudienceMemoryState } from "@/lib/audience-memory";
import type { Campaign, CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import type {
  CampaignLifecycleRecommendation,
  CampaignLifecycleStage,
  CampaignLifecycleState,
} from "@/lib/campaign-lifecycle";
import type { RevenueSignal } from "@/lib/revenue-signals";
import type { WeeklyPlan } from "@/lib/weekly-plan";
import type { SignalRecord } from "@/types/signal";

export const CAMPAIGN_ALLOCATION_SUPPORT_LEVELS = [
  "increase",
  "maintain",
  "reduce",
  "pause_temporarily",
] as const;

export const CAMPAIGN_ALLOCATION_URGENCY_LEVELS = ["high", "medium", "low"] as const;

export type CampaignAllocationSupportLevel = (typeof CAMPAIGN_ALLOCATION_SUPPORT_LEVELS)[number];
export type CampaignAllocationUrgency = (typeof CAMPAIGN_ALLOCATION_URGENCY_LEVELS)[number];

export interface CampaignAllocationRecommendation {
  campaignId: string;
  campaignName: string;
  allocationRecommendation: string;
  supportLevel: CampaignAllocationSupportLevel;
  lifecycleStage: CampaignLifecycleStage | null;
  recommendedNextStage: CampaignLifecycleStage | null;
  recommendedContentFocus: string | null;
  reason: string;
  urgency: CampaignAllocationUrgency;
  suggestedWeeklyShare: string;
  supportingSignals: string[];
  linkedWorkflow: string;
}

export interface CampaignAllocationState {
  generatedAt: string;
  weekStartDate: string | null;
  recommendations: CampaignAllocationRecommendation[];
  topSummary: string;
  underSupportedCount: number;
  overSupportedCount: number;
  pausedCount: number;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function priorityWeight(level: CampaignAllocationSupportLevel) {
  switch (level) {
    case "increase":
      return 4;
    case "maintain":
      return 3;
    case "reduce":
      return 2;
    case "pause_temporarily":
    default:
      return 1;
  }
}

function urgencyWeight(level: CampaignAllocationUrgency) {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function isDateValid(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return Number.isFinite(new Date(value).getTime());
}

function getDaysUntil(date: string | null | undefined, now: Date) {
  if (!isDateValid(date)) {
    return null;
  }

  const target = new Date(`${date}T00:00:00Z`).getTime();
  return Math.round((target - now.getTime()) / (24 * 60 * 60 * 1000));
}

function getCampaignAudienceSignal(
  campaignId: string,
  approvalCandidates: ApprovalQueueCandidate[],
  audienceMemory: AudienceMemoryState,
) {
  const matchingSegmentIds = new Set(
    approvalCandidates
      .filter((candidate) => candidate.signal.campaignId === campaignId)
      .map((candidate) => candidate.signal.audienceSegmentId)
      .filter((segmentId): segmentId is string => Boolean(segmentId)),
  );

  for (const segment of audienceMemory.segments) {
    if (!matchingSegmentIds.has(segment.segmentId)) {
      continue;
    }

    return segment.summary[0] ?? segment.supportingOutcomeSignals[0] ?? null;
  }

  return null;
}

function getSupportLevelLabel(level: CampaignAllocationSupportLevel) {
  switch (level) {
    case "increase":
      return "Increase";
    case "maintain":
      return "Maintain";
    case "reduce":
      return "Reduce";
    case "pause_temporarily":
    default:
      return "Pause temporarily";
  }
}

function getSuggestedShare(level: CampaignAllocationSupportLevel) {
  switch (level) {
    case "increase":
      return "2 of 5 weekly slots";
    case "maintain":
      return "1 of 5 weekly slots";
    case "reduce":
      return "0 to 1 of 5 weekly slots";
    case "pause_temporarily":
    default:
      return "0 of 5 weekly slots";
  }
}

function lifecycleSupportShift(
  lifecycle: CampaignLifecycleRecommendation | null,
  currentSupportLevel: CampaignAllocationSupportLevel,
): CampaignAllocationSupportLevel {
  if (!lifecycle) {
    return currentSupportLevel;
  }

  if (lifecycle.lifecycleStage === "peak") {
    return "increase";
  }

  if (lifecycle.lifecycleStage === "ramping" && currentSupportLevel === "maintain") {
    return "increase";
  }

  if (lifecycle.lifecycleStage === "tapering" && currentSupportLevel === "increase") {
    return "maintain";
  }

  if (
    (lifecycle.lifecycleStage === "tapering" || lifecycle.lifecycleStage === "paused") &&
    currentSupportLevel === "maintain"
  ) {
    return "reduce";
  }

  if (lifecycle.lifecycleStage === "not_started") {
    return currentSupportLevel === "increase" ? "maintain" : currentSupportLevel;
  }

  return currentSupportLevel;
}

function sortRecommendations(items: CampaignAllocationRecommendation[]) {
  return [...items].sort(
    (left, right) =>
      priorityWeight(right.supportLevel) - priorityWeight(left.supportLevel) ||
      urgencyWeight(right.urgency) - urgencyWeight(left.urgency) ||
      left.campaignName.localeCompare(right.campaignName),
  );
}

function buildRecommendation(input: {
  campaign: Campaign;
  supportLevel: CampaignAllocationSupportLevel;
  urgency: CampaignAllocationUrgency;
  lifecycle: CampaignLifecycleRecommendation | null;
  reason: string;
  supportingSignals: string[];
  linkedWorkflow: string;
}) {
  const shiftedSupportLevel = lifecycleSupportShift(input.lifecycle, input.supportLevel);

  return {
    campaignId: input.campaign.id,
    campaignName: input.campaign.name,
    allocationRecommendation: `${getSupportLevelLabel(shiftedSupportLevel)} ${input.campaign.name} this week.`,
    supportLevel: shiftedSupportLevel,
    lifecycleStage: input.lifecycle?.lifecycleStage ?? null,
    recommendedNextStage: input.lifecycle?.recommendedNextStage ?? null,
    recommendedContentFocus: input.lifecycle?.recommendedContentFocus ?? null,
    reason: input.reason,
    urgency: input.urgency,
    suggestedWeeklyShare: getSuggestedShare(shiftedSupportLevel),
    supportingSignals: input.supportingSignals.slice(0, 4),
    linkedWorkflow: input.linkedWorkflow,
  } satisfies CampaignAllocationRecommendation;
}

export function buildCampaignAllocationState(input: {
  strategy: CampaignStrategy;
  signals: SignalRecord[];
  weeklyPlan: WeeklyPlan | null;
  weeklyPackSignalIds: string[];
  approvalCandidates: ApprovalQueueCandidate[];
  cadence: CampaignCadenceSummary;
  revenueSignals: RevenueSignal[];
  audienceMemory: AudienceMemoryState;
  lifecycle?: CampaignLifecycleState | null;
  now?: Date;
}): CampaignAllocationState {
  const now = input.now ?? new Date();
  const lifecycleByCampaignId = new Map(
    (input.lifecycle?.recommendations ?? []).map((recommendation) => [recommendation.campaignId, recommendation]),
  );
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const recommendedPackCounts = new Map(
    input.strategy.campaigns.map((campaign) => [
      campaign.id,
      input.weeklyPackSignalIds.filter((signalId) => signalById.get(signalId)?.campaignId === campaign.id)
        .length,
    ]),
  );
  const queueCounts = new Map(
    input.strategy.campaigns.map((campaign) => [
      campaign.id,
      input.approvalCandidates.filter(
        (candidate) =>
          candidate.signal.campaignId === campaign.id &&
          candidate.triage.triageState !== "suppress",
      ).length,
    ]),
  );
  const recentCounts = new Map(
    input.cadence.byCampaign.map((row) => [row.id, row.recentCount] as const),
  );
  const revenueCounts = new Map(
    input.strategy.campaigns.map((campaign) => [
      campaign.id,
      input.revenueSignals.filter((record) => record.campaignId === campaign.id).length,
    ]),
  );
  const highStrengthRevenueCounts = new Map(
    input.strategy.campaigns.map((campaign) => [
      campaign.id,
      input.revenueSignals.filter(
        (record) => record.campaignId === campaign.id && record.strength === "high",
      ).length,
    ]),
  );

  const recommendations = sortRecommendations(
    input.strategy.campaigns.map((campaign) => {
      const packCount = recommendedPackCounts.get(campaign.id) ?? 0;
      const queueCount = queueCounts.get(campaign.id) ?? 0;
      const recentCount = recentCounts.get(campaign.id) ?? 0;
      const revenueCount = revenueCounts.get(campaign.id) ?? 0;
      const highStrengthRevenueCount = highStrengthRevenueCounts.get(campaign.id) ?? 0;
      const isInCurrentPlan = input.weeklyPlan?.activeCampaignIds.includes(campaign.id) ?? false;
      const daysUntilEnd = getDaysUntil(campaign.endDate, now);
      const ended = typeof daysUntilEnd === "number" && daysUntilEnd < 0;
      const nearEnd = typeof daysUntilEnd === "number" && daysUntilEnd >= 0 && daysUntilEnd <= 10;
      const lifecycle = lifecycleByCampaignId.get(campaign.id) ?? null;
      const audienceSignal = getCampaignAudienceSignal(
        campaign.id,
        input.approvalCandidates,
        input.audienceMemory,
      );
      const supportingSignals: string[] = [];
      uniquePush(
        supportingSignals,
        `${packCount} of ${Math.max(5, input.weeklyPackSignalIds.length || 0)} current pack slots support this campaign.`,
      );
      uniquePush(
        supportingSignals,
        `${queueCount} approval-ready candidate${queueCount === 1 ? "" : "s"} are available for it.`,
      );
      if (recentCount > 0) {
        uniquePush(
          supportingSignals,
          `${recentCount} recent content item${recentCount === 1 ? "" : "s"} already supported it.`,
        );
      }
      if (revenueCount > 0) {
        uniquePush(
          supportingSignals,
          `${revenueCount} revenue-linked signal${revenueCount === 1 ? "" : "s"} are tied to this campaign.`,
        );
      }
      if (audienceSignal) {
        uniquePush(supportingSignals, audienceSignal);
      }
      if (lifecycle) {
        uniquePush(
          supportingSignals,
          `Lifecycle: ${lifecycle.lifecycleStage.replaceAll("_", " ")} now, ${lifecycle.recommendedNextStage.replaceAll("_", " ")} next.`,
        );
      }

      if (campaign.status !== "active" || ended) {
        return buildRecommendation({
          campaign,
          supportLevel: "pause_temporarily",
          urgency: "low",
          lifecycle,
          reason:
            campaign.status !== "active"
              ? "This campaign is not currently active, so it should not take weekly content share right now."
              : "Its end date has already passed, so new weekly allocation should stay paused until you reactivate it.",
          supportingSignals,
          linkedWorkflow: "/campaigns",
        });
      }

      if (packCount >= 2 && recentCount >= 3 && highStrengthRevenueCount === 0) {
        return buildRecommendation({
          campaign,
          supportLevel: "reduce",
          urgency: nearEnd ? "medium" : "low",
          lifecycle,
          reason:
            "This campaign is already well represented in the recent mix, but it is not showing matching high-strength commercial payoff right now.",
          supportingSignals,
          linkedWorkflow: "/plan",
        });
      }

      if (
        (packCount === 0 || recentCount === 0) &&
        (queueCount > 0 || highStrengthRevenueCount > 0 || isInCurrentPlan || nearEnd)
      ) {
        return buildRecommendation({
          campaign,
          supportLevel: "increase",
          urgency: nearEnd || highStrengthRevenueCount > 0 ? "high" : "medium",
          lifecycle,
          reason:
            highStrengthRevenueCount > 0
              ? "The campaign has commercial traction but is under-supported in this week’s content mix."
              : nearEnd
                ? "The campaign window is time-sensitive, but current weekly support is still light."
                : "This campaign is active and strategically relevant, but it is not yet getting enough weekly content support.",
          supportingSignals,
          linkedWorkflow: queueCount > 0 ? "/weekly-pack" : "/plan",
        });
      }

      if (queueCount === 0 && packCount === 0 && recentCount <= 1 && revenueCount === 0 && !isInCurrentPlan) {
        return buildRecommendation({
          campaign,
          supportLevel: "pause_temporarily",
          urgency: "low",
          lifecycle,
          reason:
            "There is very little current queue support or commercial evidence behind this campaign, so it can stay out of the weekly mix for now.",
          supportingSignals,
          linkedWorkflow: "/campaigns",
        });
      }

      return buildRecommendation({
        campaign,
        supportLevel: "maintain",
        urgency: nearEnd ? "medium" : "low",
        lifecycle,
        reason:
          highStrengthRevenueCount > 0
            ? "Current support looks directionally healthy, so keep this campaign visible without letting it dominate the week."
            : "Current support is adequate. Keep a presence, but do not over-allocate more slots unless evidence strengthens.",
        supportingSignals,
        linkedWorkflow: "/plan",
      });
    }),
  );

  const increaseCount = recommendations.filter((item) => item.supportLevel === "increase").length;
  const reduceCount = recommendations.filter((item) => item.supportLevel === "reduce").length;
  const pausedCount = recommendations.filter((item) => item.supportLevel === "pause_temporarily").length;
  const topSummary =
    increaseCount > 0
      ? `${increaseCount} campaign${increaseCount === 1 ? "" : "s"} should gain more weekly share, while ${reduceCount} should be reduced or held lighter.`
      : reduceCount > 0 || pausedCount > 0
        ? `${reduceCount} campaign${reduceCount === 1 ? "" : "s"} should be reduced and ${pausedCount} can stay paused for now.`
        : "Active campaigns look broadly balanced against this week’s content support.";

  return {
    generatedAt: now.toISOString(),
    weekStartDate: input.weeklyPlan?.weekStartDate ?? null,
    recommendations,
    topSummary,
    underSupportedCount: increaseCount,
    overSupportedCount: reduceCount,
    pausedCount,
  };
}
