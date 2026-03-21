import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { AttributionRecord } from "@/lib/attribution";
import type { CampaignLifecycleState } from "@/lib/campaign-lifecycle";
import type { RevenueSignal } from "@/lib/revenue-signals";
import type { FunnelStage, SignalRecord } from "@/types/signal";

export const ADAPTIVE_FUNNEL_STAGES = [
  "Awareness",
  "Trust",
  "Consideration",
  "Conversion",
] as const;

export type AdaptiveFunnelStage = (typeof ADAPTIVE_FUNNEL_STAGES)[number];

export interface FunnelEngineRow {
  stage: AdaptiveFunnelStage;
  label: string;
  currentCount: number;
  currentShare: number;
  queueCount: number;
  revenueSignalCount: number;
  attributionCount: number;
  performanceScore: number;
  currentPriority: 0 | 1 | 2 | 3;
  recommendedPriority: 0 | 1 | 2 | 3;
  recommendedAdjustment: "increase" | "maintain" | "reduce";
  reason: string;
}

export interface FunnelEngineState {
  generatedAt: string;
  currentFunnelBalance: string;
  recommendedShift: string;
  recommendedNextMix: FunnelEngineRow[];
  boostedStages: AdaptiveFunnelStage[];
  reducedStages: AdaptiveFunnelStage[];
  supportingSignals: string[];
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function isAdaptiveStage(stage: FunnelStage | null | undefined): stage is AdaptiveFunnelStage {
  return ADAPTIVE_FUNNEL_STAGES.includes(stage as AdaptiveFunnelStage);
}

function createCountMap<T extends string>(values: T[]) {
  const map = new Map<T, number>();
  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return map;
}

function getStageLabel(stage: AdaptiveFunnelStage) {
  switch (stage) {
    case "Awareness":
      return "Awareness";
    case "Trust":
      return "Trust";
    case "Consideration":
      return "Consideration";
    case "Conversion":
    default:
      return "Conversion";
  }
}

function getCurrentPriority(share: number, count: number): 0 | 1 | 2 | 3 {
  if (count === 0) {
    return 0;
  }
  if (share < 0.16) {
    return 1;
  }
  if (share < 0.34) {
    return 2;
  }
  return 3;
}

function getLifecyclePressure(state: CampaignLifecycleState | null | undefined) {
  const pressure = {
    Awareness: 0,
    Trust: 0,
    Consideration: 0,
    Conversion: 0,
  } satisfies Record<AdaptiveFunnelStage, number>;

  for (const recommendation of state?.recommendations ?? []) {
    switch (recommendation.lifecycleStage) {
      case "not_started":
        pressure.Awareness += 2;
        pressure.Trust += 1;
        break;
      case "early":
        pressure.Awareness += 1;
        pressure.Trust += 2;
        break;
      case "ramping":
        pressure.Trust += 2;
        pressure.Consideration += 1;
        break;
      case "peak":
        pressure.Consideration += 1;
        pressure.Conversion += 2;
        break;
      case "tapering":
        pressure.Trust += 1;
        pressure.Conversion -= 1;
        break;
      case "paused":
      default:
        break;
    }
  }

  return pressure;
}

function clampPriority(value: number): 0 | 1 | 2 | 3 {
  if (value <= 0) {
    return 0;
  }
  if (value >= 3) {
    return 3;
  }
  return value as 0 | 1 | 2 | 3;
}

function buildStagePerformanceMap(input: {
  signalsById: Map<string, SignalRecord>;
  attributionRecords: AttributionRecord[];
  revenueSignals: RevenueSignal[];
}) {
  const map = new Map<AdaptiveFunnelStage, number>(
    ADAPTIVE_FUNNEL_STAGES.map((stage) => [stage, 0]),
  );

  for (const record of input.attributionRecords) {
    const stage = input.signalsById.get(record.signalId)?.funnelStage;
    if (!isAdaptiveStage(stage)) {
      continue;
    }

    const points =
      record.outcomeStrength === "strong"
        ? 3
        : record.outcomeStrength === "medium"
          ? 2
          : 1;
    map.set(stage, (map.get(stage) ?? 0) + points);
  }

  for (const record of input.revenueSignals) {
    const stage = input.signalsById.get(record.signalId)?.funnelStage;
    if (!isAdaptiveStage(stage)) {
      continue;
    }

    const points =
      record.strength === "high"
        ? 5
        : record.strength === "medium"
          ? 3
          : 1;
    map.set(stage, (map.get(stage) ?? 0) + points);
  }

  return map;
}

function buildRecommendedPriority(input: {
  stage: AdaptiveFunnelStage;
  currentPriority: 0 | 1 | 2 | 3;
  currentShare: number;
  currentCount: number;
  queueCount: number;
  performanceScore: number;
  lifecyclePressure: number;
  fatigueCount: number;
  trustCount: number;
  conversionCount: number;
  trustPriority: number;
  conversionPriority: number;
  trustPerformance: number;
  conversionPerformance: number;
}): 0 | 1 | 2 | 3 {
  let priority = input.currentPriority;

  if (input.stage === "Awareness") {
    if (input.currentCount === 0 || (input.currentShare < 0.15 && input.lifecyclePressure > 0)) {
      priority += 1;
    }
  }

  if (input.stage === "Trust") {
    if (input.currentCount === 0 || input.currentShare < 0.22 || input.conversionPriority >= 3) {
      priority += 1;
    }
    if (input.lifecyclePressure >= 2) {
      priority += 1;
    }
  }

  if (input.stage === "Consideration") {
    if (
      input.trustPriority >= 3 &&
      input.currentPriority <= 1 &&
      input.trustPerformance >= input.conversionPerformance &&
      input.queueCount > 0
    ) {
      priority += 1;
    }
    if (input.lifecyclePressure >= 1) {
      priority += 1;
    }
  }

  if (input.stage === "Conversion") {
    if (
      (input.currentShare > 0.36 && input.fatigueCount > 0) ||
      input.conversionCount > input.trustCount + 1
    ) {
      priority -= 1;
    }
    if (input.trustPerformance >= input.conversionPerformance + 3 && input.currentPriority === 0) {
      priority += 1;
    }
    if (input.lifecyclePressure >= 2 && input.performanceScore > 0) {
      priority += 1;
    }
  }

  if (input.performanceScore > 6 && input.queueCount > 0) {
    priority += 1;
  }
  if (input.fatigueCount > 1 && input.stage !== "Awareness") {
    priority -= 1;
  }

  return clampPriority(priority);
}

export function buildAdaptiveFunnelState(input: {
  signals: SignalRecord[];
  weeklyPackSignalIds: string[];
  approvalCandidates: ApprovalQueueCandidate[];
  attributionRecords: AttributionRecord[];
  revenueSignals: RevenueSignal[];
  campaignLifecycle?: CampaignLifecycleState | null;
  now?: Date;
}): FunnelEngineState {
  const now = input.now ?? new Date();
  const signalsById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const packStageCounts = createCountMap(
    input.weeklyPackSignalIds
      .map((signalId) => signalsById.get(signalId)?.funnelStage)
      .filter((stage): stage is AdaptiveFunnelStage => isAdaptiveStage(stage)),
  );
  const queueStageCounts = createCountMap(
    input.approvalCandidates
      .map((candidate) => candidate.signal.funnelStage)
      .filter((stage): stage is AdaptiveFunnelStage => isAdaptiveStage(stage)),
  );
  const fatigueCounts = createCountMap(
    input.approvalCandidates
      .filter((candidate) => candidate.fatigue.warnings.length > 0)
      .map((candidate) => candidate.signal.funnelStage)
      .filter((stage): stage is AdaptiveFunnelStage => isAdaptiveStage(stage)),
  );
  const attributionCounts = createCountMap(
    input.attributionRecords
      .map((record) => signalsById.get(record.signalId)?.funnelStage)
      .filter((stage): stage is AdaptiveFunnelStage => isAdaptiveStage(stage)),
  );
  const revenueCounts = createCountMap(
    input.revenueSignals
      .map((record) => signalsById.get(record.signalId)?.funnelStage)
      .filter((stage): stage is AdaptiveFunnelStage => isAdaptiveStage(stage)),
  );
  const performanceByStage = buildStagePerformanceMap({
    signalsById,
    attributionRecords: input.attributionRecords,
    revenueSignals: input.revenueSignals,
  });
  const lifecyclePressure = getLifecyclePressure(input.campaignLifecycle);
  const totalPackItems = Math.max(1, input.weeklyPackSignalIds.length);
  const currentPriorities = Object.fromEntries(
    ADAPTIVE_FUNNEL_STAGES.map((stage) => [
      stage,
      getCurrentPriority((packStageCounts.get(stage) ?? 0) / totalPackItems, packStageCounts.get(stage) ?? 0),
    ]),
  ) as Record<AdaptiveFunnelStage, 0 | 1 | 2 | 3>;

  const rows = ADAPTIVE_FUNNEL_STAGES.map((stage) => {
    const currentCount = packStageCounts.get(stage) ?? 0;
    const currentShare = currentCount / totalPackItems;
    const currentPriority = currentPriorities[stage];
    const performanceScore = performanceByStage.get(stage) ?? 0;
    const recommendedPriority = buildRecommendedPriority({
      stage,
      currentPriority,
      currentShare,
      currentCount,
      queueCount: queueStageCounts.get(stage) ?? 0,
      performanceScore,
      lifecyclePressure: lifecyclePressure[stage],
      fatigueCount: fatigueCounts.get(stage) ?? 0,
      trustCount: packStageCounts.get("Trust") ?? 0,
      conversionCount: packStageCounts.get("Conversion") ?? 0,
      trustPriority: currentPriorities.Trust,
      conversionPriority: currentPriorities.Conversion,
      trustPerformance: performanceByStage.get("Trust") ?? 0,
      conversionPerformance: performanceByStage.get("Conversion") ?? 0,
    });
    const recommendedAdjustment =
      recommendedPriority > currentPriority
        ? "increase"
        : recommendedPriority < currentPriority
          ? "reduce"
          : "maintain";
    let reason = "Current funnel emphasis looks directionally healthy.";

    if (stage === "Awareness" && recommendedAdjustment === "increase") {
      reason =
        currentCount === 0
          ? "Top-of-funnel visibility is missing from the current pack."
          : "Awareness is lighter than current campaign and queue context suggest.";
    } else if (stage === "Trust" && recommendedAdjustment === "increase") {
      reason = "Trust coverage needs reinforcing to avoid pushing conversion too early.";
    } else if (stage === "Consideration" && recommendedAdjustment === "increase") {
      reason = "Trust is performing, so a little more consideration content can move the funnel forward.";
    } else if (stage === "Conversion" && recommendedAdjustment === "increase") {
      reason = "Commercial signals support introducing more conversion pressure on selected items.";
    } else if (stage === "Conversion" && recommendedAdjustment === "reduce") {
      reason = "Conversion pressure is running hot relative to trust support or fatigue risk.";
    } else if (recommendedAdjustment === "reduce") {
      reason = "This stage is already well represented in the current weekly mix.";
    }

    return {
      stage,
      label: getStageLabel(stage),
      currentCount,
      currentShare,
      queueCount: queueStageCounts.get(stage) ?? 0,
      revenueSignalCount: revenueCounts.get(stage) ?? 0,
      attributionCount: attributionCounts.get(stage) ?? 0,
      performanceScore,
      currentPriority,
      recommendedPriority,
      recommendedAdjustment,
      reason,
    } satisfies FunnelEngineRow;
  });

  const boostedStages = rows
    .filter((row) => row.recommendedAdjustment === "increase" && row.recommendedPriority >= 2)
    .map((row) => row.stage);
  const reducedStages = rows
    .filter((row) => row.recommendedAdjustment === "reduce")
    .map((row) => row.stage);
  const supportingSignals: string[] = [];

  const topStage = [...rows].sort((left, right) => right.currentCount - left.currentCount)[0];
  if (topStage) {
    uniquePush(
      supportingSignals,
      `${topStage.label} currently leads the weekly pack with ${topStage.currentCount} item${topStage.currentCount === 1 ? "" : "s"}.`,
    );
  }
  if (boostedStages[0]) {
    uniquePush(
      supportingSignals,
      `${boostedStages.map((stage) => getStageLabel(stage)).join(" and ")} should gain more emphasis next.`,
    );
  }
  if (reducedStages[0]) {
    uniquePush(
      supportingSignals,
      `${reducedStages.map((stage) => getStageLabel(stage)).join(" and ")} should be held lighter for now.`,
    );
  }

  const currentFunnelBalance =
    topStage && topStage.currentCount > 0
      ? `${topStage.label} currently dominates the weekly mix, while ${rows
          .filter((row) => row.currentCount === 0)
          .slice(0, 2)
          .map((row) => row.label.toLowerCase())
          .join(" and ") || "other stages remain present"} are lighter.`
      : "No weekly funnel mix is strong enough to summarize yet.";
  const recommendedShift =
    boostedStages.length === 0 && reducedStages.length === 0
      ? "Keep the funnel mix broadly balanced this week."
      : boostedStages.length > 0 && reducedStages.length > 0
        ? `Increase ${boostedStages.map((stage) => getStageLabel(stage).toLowerCase()).join(" and ")} while reducing ${reducedStages.map((stage) => getStageLabel(stage).toLowerCase()).join(" and ")} pressure.`
        : boostedStages.length > 0
          ? `Increase ${boostedStages.map((stage) => getStageLabel(stage).toLowerCase()).join(" and ")} emphasis next.`
          : `Reduce ${reducedStages.map((stage) => getStageLabel(stage).toLowerCase()).join(" and ")} pressure next.`;

  return {
    generatedAt: now.toISOString(),
    currentFunnelBalance,
    recommendedShift,
    recommendedNextMix: rows,
    boostedStages,
    reducedStages,
    supportingSignals: supportingSignals.slice(0, 4),
  };
}
