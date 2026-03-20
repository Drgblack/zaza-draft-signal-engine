import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import type { DistributionSummary } from "@/lib/distribution";
import type { ManualExperiment } from "@/lib/experiments";
import type { RevenueSignal } from "@/lib/revenue-signals";
import type { WeeklyPostingPack, WeeklyPostingPackInsights } from "@/lib/weekly-posting-pack";
import type { WeeklyRecap } from "@/lib/weekly-recap";

export const GROWTH_SCORECARD_TRENDS = ["improving", "flat", "declining"] as const;
export type GrowthScorecardTrend = (typeof GROWTH_SCORECARD_TRENDS)[number];

export interface GrowthScorecardMetric {
  key: string;
  label: string;
  value: string;
  detail: string;
  trend: GrowthScorecardTrend;
  href: string;
}

export interface GrowthScorecardNote {
  id: string;
  label: string;
  reason: string;
  href: string;
}

export interface GrowthScorecardSummary {
  generatedAt: string;
  weekLabel: string;
  overallHealth: "strong" | "steady" | "watch";
  overallSummary: string;
  metrics: GrowthScorecardMetric[];
  topConcerns: GrowthScorecardNote[];
  topPositives: GrowthScorecardNote[];
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function compareDirectional(current: number, previous: number, options?: { inverse?: boolean; tolerance?: number }) {
  const tolerance = options?.tolerance ?? 0.05;
  if (previous === 0) {
    if (current === 0) {
      return "flat" as const;
    }

    return options?.inverse ? "declining" : "improving";
  }

  const deltaRatio = (current - previous) / Math.max(Math.abs(previous), 1);
  if (Math.abs(deltaRatio) <= tolerance) {
    return "flat" as const;
  }

  if (deltaRatio > 0) {
    return options?.inverse ? "declining" : "improving";
  }

  return options?.inverse ? "improving" : "declining";
}

function thresholdTrend(value: number, thresholds: { improving: number; declining: number }, options?: { inverse?: boolean }) {
  if (value >= thresholds.improving) {
    return options?.inverse ? "declining" : "improving";
  }

  if (value <= thresholds.declining) {
    return options?.inverse ? "improving" : "declining";
  }

  return "flat" as const;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function note(id: string, label: string, reason: string, href: string): GrowthScorecardNote {
  return { id, label, reason, href };
}

function countRevenueSignalsInWeek(records: RevenueSignal[], weekStartDate: string) {
  const start = new Date(`${weekStartDate}T00:00:00Z`).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return records.filter((record) => {
    const ts = new Date(record.timestamp).getTime();
    return Number.isFinite(ts) && ts >= start && ts < end;
  }).length;
}

function buildCampaignCoverage(input: {
  strategy: CampaignStrategy;
  weeklyPack: WeeklyPostingPack;
  approvalCandidates: ApprovalQueueCandidate[];
}) {
  const activeCampaigns = input.strategy.campaigns.filter((campaign) => campaign.status === "active");
  const represented = new Set<string>();

  for (const item of input.weeklyPack.items) {
    const candidate = input.approvalCandidates.find((entry) => entry.signal.recordId === item.signalId);
    if (candidate?.signal.campaignId) {
      represented.add(candidate.signal.campaignId);
    }
  }

  for (const candidate of input.approvalCandidates) {
    if (candidate.signal.campaignId) {
      represented.add(candidate.signal.campaignId);
    }
  }

  const representedActiveCount = activeCampaigns.filter((campaign) => represented.has(campaign.id)).length;
  return {
    activeCount: activeCampaigns.length,
    representedCount: representedActiveCount,
    rate: activeCampaigns.length === 0 ? 1 : representedActiveCount / activeCampaigns.length,
  };
}

export function buildGrowthScorecard(input: {
  approvalCandidates: ApprovalQueueCandidate[];
  weeklyPack: WeeklyPostingPack;
  weeklyPackInsights: WeeklyPostingPackInsights;
  distributionSummary: DistributionSummary;
  currentRecap: WeeklyRecap;
  previousRecap: WeeklyRecap;
  revenueSignals: RevenueSignal[];
  experiments: ManualExperiment[];
  cadence: CampaignCadenceSummary;
  strategy: CampaignStrategy;
  now?: Date;
}): GrowthScorecardSummary {
  const now = input.now ?? new Date();
  const approvalReadyCount = input.approvalCandidates.length;
  const highConfidenceCount = input.approvalCandidates.filter((candidate) => candidate.automationConfidence.level === "high").length;
  const staleQueueCount = input.approvalCandidates.filter((candidate) =>
    ["stale", "stale_but_reusable", "stale_needs_refresh"].includes(candidate.stale.state),
  ).length;
  const staleRatio = approvalReadyCount === 0 ? 0 : staleQueueCount / approvalReadyCount;
  const outcomeCompletionRate =
    input.currentRecap.supportingMetrics.postCount === 0
      ? 0
      : input.currentRecap.supportingMetrics.judgedPostCount / input.currentRecap.supportingMetrics.postCount;
  const previousOutcomeCompletionRate =
    input.previousRecap.supportingMetrics.postCount === 0
      ? 0
      : input.previousRecap.supportingMetrics.judgedPostCount / input.previousRecap.supportingMetrics.postCount;
  const currentRevenueCount = countRevenueSignalsInWeek(input.revenueSignals, input.currentRecap.weekStartDate);
  const previousRevenueCount = countRevenueSignalsInWeek(input.revenueSignals, input.previousRecap.weekStartDate);
  const stagedRatio =
    input.weeklyPack.items.length === 0
      ? 0
      : input.distributionSummary.readyCount / input.weeklyPack.items.length;
  const experimentCompletionRate =
    input.experiments.length === 0
      ? 0
      : input.experiments.filter((experiment) => experiment.status === "completed").length / input.experiments.length;
  const campaignCoverage = buildCampaignCoverage({
    strategy: input.strategy,
    weeklyPack: input.weeklyPack,
    approvalCandidates: input.approvalCandidates,
  });

  const metrics: GrowthScorecardMetric[] = [
    {
      key: "approval_ready",
      label: "Approval-ready",
      value: String(approvalReadyCount),
      detail: `${highConfidenceCount} high-confidence · ${staleQueueCount} stale in queue`,
      trend:
        approvalReadyCount === 0
          ? "declining"
          : staleRatio <= 0.2 && highConfidenceCount >= Math.max(1, Math.floor(approvalReadyCount / 2))
            ? "improving"
            : staleRatio >= 0.4
              ? "declining"
              : "flat",
      href: "/review",
    },
    {
      key: "staged_posting",
      label: "Staged for posting",
      value: String(input.distributionSummary.readyCount),
      detail: `${input.distributionSummary.bundleCount} bundle${input.distributionSummary.bundleCount === 1 ? "" : "s"} ready`,
      trend: thresholdTrend(stagedRatio, { improving: 0.6, declining: 0.2 }),
      href: "/posting",
    },
    {
      key: "posted_this_week",
      label: "Posted this week",
      value: String(input.currentRecap.supportingMetrics.postCount),
      detail: `${input.currentRecap.supportingMetrics.activePlatformCount} active platform${input.currentRecap.supportingMetrics.activePlatformCount === 1 ? "" : "s"}`,
      trend: compareDirectional(
        input.currentRecap.supportingMetrics.postCount,
        input.previousRecap.supportingMetrics.postCount,
      ),
      href: "/recap",
    },
    {
      key: "outcome_completion",
      label: "Outcome completion",
      value: formatPercent(outcomeCompletionRate),
      detail: `${input.currentRecap.supportingMetrics.postsMissingStrategicOutcome} strategic outcome gap${input.currentRecap.supportingMetrics.postsMissingStrategicOutcome === 1 ? "" : "s"}`,
      trend: compareDirectional(outcomeCompletionRate, previousOutcomeCompletionRate),
      href: "/follow-up",
    },
    {
      key: "strategic_value",
      label: "Strong strategic outcomes",
      value: String(input.currentRecap.supportingMetrics.highValueCount),
      detail: `${input.currentRecap.supportingMetrics.leadTotal} leads or signups recorded`,
      trend: compareDirectional(
        input.currentRecap.supportingMetrics.highValueCount,
        input.previousRecap.supportingMetrics.highValueCount,
      ),
      href: "/recap",
    },
    {
      key: "revenue_signals",
      label: "Revenue signals",
      value: String(currentRevenueCount),
      detail: `${input.revenueSignals.filter((record) => record.strength === "high").length} high-strength total on record`,
      trend: compareDirectional(currentRevenueCount, previousRevenueCount),
      href: "/insights",
    },
    {
      key: "weekly_pack",
      label: "Weekly pack completion",
      value: formatPercent(input.weeklyPackInsights.completionRate),
      detail: input.weeklyPackInsights.coverageQuality,
      trend: thresholdTrend(input.weeklyPackInsights.completionRate, { improving: 0.67, declining: 0.34 }),
      href: "/weekly-pack",
    },
    {
      key: "stale_queue",
      label: "Stale queue",
      value: String(staleQueueCount),
      detail: `${Math.round(staleRatio * 100)}% of approval-ready candidates`,
      trend: thresholdTrend(staleRatio, { improving: 0.15, declining: 0.35 }, { inverse: true }),
      href: "/review?view=stale",
    },
    {
      key: "experiment_learning",
      label: "Experiment completion",
      value: formatPercent(experimentCompletionRate),
      detail: `${input.experiments.filter((experiment) => experiment.status === "completed").length} completed of ${input.experiments.length}`,
      trend: thresholdTrend(experimentCompletionRate, { improving: 0.5, declining: 0.2 }),
      href: "/experiments",
    },
    {
      key: "campaign_alignment",
      label: "Campaign coverage",
      value: formatPercent(campaignCoverage.rate),
      detail: `${campaignCoverage.representedCount} of ${campaignCoverage.activeCount} active campaign${campaignCoverage.activeCount === 1 ? "" : "s"} represented`,
      trend: thresholdTrend(campaignCoverage.rate, { improving: 0.8, declining: 0.45 }),
      href: "/plan",
    },
  ];

  const topConcerns: GrowthScorecardNote[] = [];
  const topPositives: GrowthScorecardNote[] = [];

  if (outcomeCompletionRate < 0.75 && input.currentRecap.supportingMetrics.postCount > 0) {
    topConcerns.push(
      note(
        "outcome-gaps",
        "Outcome memory is thinning",
        `${input.currentRecap.supportingMetrics.postsMissingStrategicOutcome} posted item${input.currentRecap.supportingMetrics.postsMissingStrategicOutcome === 1 ? "" : "s"} still lack strategic outcomes this week.`,
        "/follow-up",
      ),
    );
  }

  if (staleRatio >= 0.35 && staleQueueCount > 0) {
    topConcerns.push(
      note(
        "stale-pressure",
        "Queue health is slipping",
        `${staleQueueCount} approval-ready candidate${staleQueueCount === 1 ? "" : "s"} are already stale or need refresh.`,
        "/review?view=stale",
      ),
    );
  }

  if (stagedRatio < 0.34 && input.weeklyPack.items.length > 0) {
    topConcerns.push(
      note(
        "staging-gap",
        "Execution is lagging behind planning",
        `Only ${input.distributionSummary.readyCount} of ${input.weeklyPack.items.length} weekly-pack item${input.weeklyPack.items.length === 1 ? "" : "s"} are staged for posting.`,
        "/posting",
      ),
    );
  }

  if (campaignCoverage.rate < 0.5 && campaignCoverage.activeCount > 0) {
    topConcerns.push(
      note(
        "campaign-gap",
        "Active campaigns are underrepresented",
        `${campaignCoverage.activeCount - campaignCoverage.representedCount} active campaign${campaignCoverage.activeCount - campaignCoverage.representedCount === 1 ? "" : "s"} still lack visible support in the current queue or pack.`,
        "/plan",
      ),
    );
  }

  if (input.currentRecap.supportingMetrics.highValueCount > input.previousRecap.supportingMetrics.highValueCount) {
    topPositives.push(
      note(
        "strategic-wins",
        "High-value outcomes are improving",
        `${input.currentRecap.supportingMetrics.highValueCount} high-value strategic outcome${input.currentRecap.supportingMetrics.highValueCount === 1 ? "" : "s"} landed this week, up from ${input.previousRecap.supportingMetrics.highValueCount}.`,
        "/recap",
      ),
    );
  }

  if (currentRevenueCount > previousRevenueCount) {
    topPositives.push(
      note(
        "revenue-wins",
        "Revenue-linked signals are rising",
        `${currentRevenueCount} revenue signal${currentRevenueCount === 1 ? "" : "s"} were recorded this week, versus ${previousRevenueCount} last week.`,
        "/insights",
      ),
    );
  }

  if (stagedRatio >= 0.6 && input.weeklyPack.items.length > 0) {
    topPositives.push(
      note(
        "execution-ready",
        "The weekly pack is turning into action",
        `${input.distributionSummary.readyCount} weekly-pack item${input.distributionSummary.readyCount === 1 ? "" : "s"} are already staged for posting.`,
        "/weekly-pack",
      ),
    );
  }

  if (campaignCoverage.rate >= 0.8 && campaignCoverage.activeCount > 0) {
    topPositives.push(
      note(
        "campaign-coverage",
        "Campaign support is broad",
        `${campaignCoverage.representedCount} active campaign${campaignCoverage.representedCount === 1 ? "" : "s"} are already represented in the queue or weekly pack.`,
        "/plan",
      ),
    );
  }

  if (experimentCompletionRate >= 0.5 && input.experiments.length > 0) {
    topPositives.push(
      note(
        "experiment-learning",
        "Experiments are closing the loop",
        `${input.experiments.filter((experiment) => experiment.status === "completed").length} experiment${input.experiments.filter((experiment) => experiment.status === "completed").length === 1 ? "" : "s"} have already been completed.`,
        "/experiments",
      ),
    );
  }

  const improvingCount = metrics.filter((metric) => metric.trend === "improving").length;
  const decliningCount = metrics.filter((metric) => metric.trend === "declining").length;
  const overallHealth =
    decliningCount >= 4 ? "watch" : improvingCount >= 5 && decliningCount <= 2 ? "strong" : "steady";

  const overallSummaryParts: string[] = [];
  uniquePush(
    overallSummaryParts,
    overallHealth === "strong"
      ? "Commercial and operational signals are moving in the right direction."
      : overallHealth === "watch"
        ? "The flywheel is still producing output, but a few health signals need attention."
        : "The system is broadly stable, with a mix of improving and flat signals.",
  );
  uniquePush(overallSummaryParts, topConcerns[0]?.reason);
  uniquePush(overallSummaryParts, topPositives[0]?.reason);

  return {
    generatedAt: now.toISOString(),
    weekLabel: input.currentRecap.weekLabel,
    overallHealth,
    overallSummary: overallSummaryParts.join(" "),
    metrics,
    topConcerns: topConcerns.slice(0, 3),
    topPositives: topPositives.slice(0, 3),
  };
}
