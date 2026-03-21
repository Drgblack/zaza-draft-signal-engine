import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { Campaign, CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import type { RevenueSignal } from "@/lib/revenue-signals";
import type { WeeklyPlan } from "@/lib/weekly-plan";
import type { SignalRecord } from "@/types/signal";

export const CAMPAIGN_LIFECYCLE_STAGES = [
  "not_started",
  "early",
  "ramping",
  "peak",
  "tapering",
  "paused",
] as const;

export type CampaignLifecycleStage = (typeof CAMPAIGN_LIFECYCLE_STAGES)[number];

export interface CampaignLifecycleRecommendation {
  campaignId: string;
  campaignName: string;
  lifecycleStage: CampaignLifecycleStage;
  recommendedNextStage: CampaignLifecycleStage;
  recommendedContentFocus: string;
  reason: string;
  supportingSignals: string[];
  linkedWorkflow: string;
}

export interface CampaignLifecycleState {
  generatedAt: string;
  weekStartDate: string | null;
  recommendations: CampaignLifecycleRecommendation[];
  topSummary: string;
  stageCounts: Record<CampaignLifecycleStage, number>;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function isDateValid(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return Number.isFinite(new Date(value).getTime());
}

function getDayDelta(date: string | null | undefined, now: Date) {
  if (!isDateValid(date)) {
    return null;
  }

  const target = new Date(`${date}T00:00:00Z`).getTime();
  return Math.round((target - now.getTime()) / (24 * 60 * 60 * 1000));
}

function getWeeklyShareLabel(count: number, total: number) {
  return `${count} of ${Math.max(total, 5)} weekly pack slot${total === 1 ? "" : "s"} currently support this campaign.`;
}

function getStageContentFocus(stage: CampaignLifecycleStage) {
  switch (stage) {
    case "not_started":
      return "Prepare trust-stage foundation before the campaign starts.";
    case "early":
      return "Lead with awareness and calm trust-building content.";
    case "ramping":
      return "Increase frequency with trust and consideration support.";
    case "peak":
      return "Maximise exposure with the strongest trust-to-conversion content.";
    case "tapering":
      return "Reduce frequency and keep only the strongest supporting content.";
    case "paused":
    default:
      return "Keep campaign-heavy output paused unless fresh evidence appears.";
  }
}

function getStageWeight(stage: CampaignLifecycleStage) {
  switch (stage) {
    case "peak":
      return 5;
    case "ramping":
      return 4;
    case "early":
      return 3;
    case "tapering":
      return 2;
    case "not_started":
    case "paused":
    default:
      return 1;
  }
}

function sortRecommendations(items: CampaignLifecycleRecommendation[]) {
  return [...items].sort(
    (left, right) =>
      getStageWeight(right.lifecycleStage) - getStageWeight(left.lifecycleStage) ||
      getStageWeight(right.recommendedNextStage) - getStageWeight(left.recommendedNextStage) ||
      left.campaignName.localeCompare(right.campaignName),
  );
}

function buildRecommendation(input: {
  campaign: Campaign;
  lifecycleStage: CampaignLifecycleStage;
  recommendedNextStage: CampaignLifecycleStage;
  reason: string;
  supportingSignals: string[];
}) {
  return {
    campaignId: input.campaign.id,
    campaignName: input.campaign.name,
    lifecycleStage: input.lifecycleStage,
    recommendedNextStage: input.recommendedNextStage,
    recommendedContentFocus: getStageContentFocus(input.lifecycleStage),
    reason: input.reason,
    supportingSignals: input.supportingSignals.slice(0, 4),
    linkedWorkflow: "/campaigns",
  } satisfies CampaignLifecycleRecommendation;
}

export function getCampaignLifecycleStageLabel(stage: CampaignLifecycleStage) {
  return stage.replaceAll("_", " ");
}

export function buildCampaignLifecycleState(input: {
  strategy: CampaignStrategy;
  signals: SignalRecord[];
  weeklyPlan: WeeklyPlan | null;
  weeklyPackSignalIds: string[];
  approvalCandidates: ApprovalQueueCandidate[];
  cadence: CampaignCadenceSummary;
  revenueSignals: RevenueSignal[];
  now?: Date;
}): CampaignLifecycleState {
  const now = input.now ?? new Date();
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
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
  const packCounts = new Map(
    input.strategy.campaigns.map((campaign) => [
      campaign.id,
      input.weeklyPackSignalIds.filter((signalId) => signalById.get(signalId)?.campaignId === campaign.id)
        .length,
    ]),
  );
  const recentCounts = new Map(input.cadence.byCampaign.map((row) => [row.id, row.recentCount] as const));
  const revenueCounts = new Map(
    input.strategy.campaigns.map((campaign) => [
      campaign.id,
      input.revenueSignals.filter((signal) => signal.campaignId === campaign.id).length,
    ]),
  );
  const highRevenueCounts = new Map(
    input.strategy.campaigns.map((campaign) => [
      campaign.id,
      input.revenueSignals.filter(
        (signal) => signal.campaignId === campaign.id && signal.strength === "high",
      ).length,
    ]),
  );
  const fatigueCounts = new Map(
    input.strategy.campaigns.map((campaign) => [
      campaign.id,
      input.approvalCandidates.filter(
        (candidate) =>
          candidate.signal.campaignId === campaign.id &&
          candidate.fatigue.warnings.length > 0,
      ).length,
    ]),
  );

  const recommendations = sortRecommendations(
    input.strategy.campaigns.map((campaign) => {
      const queueCount = queueCounts.get(campaign.id) ?? 0;
      const packCount = packCounts.get(campaign.id) ?? 0;
      const recentCount = recentCounts.get(campaign.id) ?? 0;
      const revenueCount = revenueCounts.get(campaign.id) ?? 0;
      const highRevenueCount = highRevenueCounts.get(campaign.id) ?? 0;
      const fatigueCount = fatigueCounts.get(campaign.id) ?? 0;
      const inCurrentPlan = input.weeklyPlan?.activeCampaignIds.includes(campaign.id) ?? false;
      const daysUntilStart = getDayDelta(campaign.startDate, now);
      const daysUntilEnd = getDayDelta(campaign.endDate, now);
      const ended = typeof daysUntilEnd === "number" && daysUntilEnd < 0;
      const notStarted = typeof daysUntilStart === "number" && daysUntilStart > 0;
      const justStarted =
        typeof daysUntilStart === "number" && daysUntilStart <= 0 && daysUntilStart >= -10;
      const nearEnd = typeof daysUntilEnd === "number" && daysUntilEnd >= 0 && daysUntilEnd <= 14;
      const supportingSignals: string[] = [];

      uniquePush(supportingSignals, getWeeklyShareLabel(packCount, input.weeklyPackSignalIds.length));
      uniquePush(
        supportingSignals,
        `${queueCount} approval-ready candidate${queueCount === 1 ? "" : "s"} currently support this campaign.`,
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
          `${revenueCount} revenue-linked signal${revenueCount === 1 ? "" : "s"} are tied to it.`,
        );
      }
      if (fatigueCount > 0) {
        uniquePush(
          supportingSignals,
          `${fatigueCount} queued candidate${fatigueCount === 1 ? "" : "s"} already show fatigue warnings.`,
        );
      }

      if (campaign.status !== "active" || ended) {
        return buildRecommendation({
          campaign,
          lifecycleStage: "paused",
          recommendedNextStage: "paused",
          reason:
            campaign.status !== "active"
              ? "This campaign is not active, so the lifecycle stays paused until you explicitly re-emphasize it."
              : "The campaign window has ended, so new support should stay paused unless you reopen it.",
          supportingSignals,
        });
      }

      if (notStarted) {
        return buildRecommendation({
          campaign,
          lifecycleStage: "not_started",
          recommendedNextStage: "early",
          reason:
            "The campaign start date is still ahead, so this week should focus on preparing a light trust-stage foundation rather than pushing volume early.",
          supportingSignals,
        });
      }

      if (fatigueCount > 0 && recentCount >= 3 && packCount >= 2 && highRevenueCount === 0) {
        return buildRecommendation({
          campaign,
          lifecycleStage: "tapering",
          recommendedNextStage: nearEnd ? "paused" : "tapering",
          reason:
            "Recent support is already heavy and fatigue is appearing without matching strong commercial evidence, so this campaign should taper.",
          supportingSignals,
        });
      }

      if (highRevenueCount > 0 && (packCount >= 1 || queueCount >= 2)) {
        return buildRecommendation({
          campaign,
          lifecycleStage: "peak",
          recommendedNextStage: nearEnd ? "tapering" : "peak",
          reason:
            "This campaign is showing strong commercial traction and enough support depth to justify a short peak phase.",
          supportingSignals,
        });
      }

      if ((queueCount >= 2 || packCount >= 1 || inCurrentPlan) && (revenueCount > 0 || justStarted || recentCount >= 1)) {
        return buildRecommendation({
          campaign,
          lifecycleStage: justStarted ? "early" : "ramping",
          recommendedNextStage: highRevenueCount > 0 ? "peak" : "ramping",
          reason:
            justStarted
              ? "The campaign is newly live, so it should build momentum with trust-stage support before pushing harder."
              : "Support is building and the campaign has enough traction to keep ramping this week.",
          supportingSignals,
        });
      }

      if (!inCurrentPlan && queueCount === 0 && packCount === 0 && revenueCount === 0) {
        return buildRecommendation({
          campaign,
          lifecycleStage: "paused",
          recommendedNextStage: "paused",
          reason:
            "There is no current weekly support, no queue depth, and no commercial evidence strong enough to justify active campaign emphasis.",
          supportingSignals,
        });
      }

      return buildRecommendation({
        campaign,
        lifecycleStage: "early",
        recommendedNextStage: queueCount > 0 ? "ramping" : "early",
        reason:
          "The campaign is active but still lightly supported, so it should stay in an early trust-building phase until stronger momentum appears.",
        supportingSignals,
      });
    }),
  );

  const stageCounts = CAMPAIGN_LIFECYCLE_STAGES.reduce(
    (accumulator, stage) => ({
      ...accumulator,
      [stage]: recommendations.filter((item) => item.lifecycleStage === stage).length,
    }),
    {} as Record<CampaignLifecycleStage, number>,
  );
  const topSummary =
    stageCounts.peak > 0
      ? `${stageCounts.peak} campaign${stageCounts.peak === 1 ? "" : "s"} are in peak mode, while ${stageCounts.ramping} are still ramping.`
      : stageCounts.ramping > 0
        ? `${stageCounts.ramping} campaign${stageCounts.ramping === 1 ? "" : "s"} should keep building momentum this week.`
        : stageCounts.tapering > 0
          ? `${stageCounts.tapering} campaign${stageCounts.tapering === 1 ? "" : "s"} should taper to avoid over-support.`
          : "Campaign lifecycle state looks stable with no strong transition pressure right now.";

  return {
    generatedAt: now.toISOString(),
    weekStartDate: input.weeklyPlan?.weekStartDate ?? null,
    recommendations,
    topSummary,
    stageCounts,
  };
}
