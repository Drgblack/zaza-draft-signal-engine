import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { getOutcomeQualityLabel, getReuseRecommendationLabel, type PostingOutcome } from "@/lib/outcomes";
import type { PatternBundle } from "@/lib/pattern-bundles";
import type { PostingLogEntry, PostingPlatform } from "@/lib/posting-memory";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import { buildSignalPublishPrepBundle } from "@/lib/publish-prep";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import { getStrategicValueLabel } from "@/lib/strategic-outcome-memory";
import type { WeeklyPlan, WeeklyPlanState } from "@/lib/weekly-plan";
import { getWeeklyPlanAlignment } from "@/lib/weekly-plan";
import type { EditorialMode, FunnelStage, SignalRecord } from "@/types/signal";

export type EvergreenEligibility = "evergreenEligible" | "evergreenSuppressed";
export type EvergreenReuseMode = "reuse_directly" | "adapt_before_reuse";

export interface EvergreenCandidate {
  id: string;
  signalId: string;
  signal: SignalRecord;
  postingLogId: string;
  surfacedPlatform: PostingPlatform;
  priorPostDate: string;
  priorOutcomeQuality: PostingOutcome["outcomeQuality"];
  priorReuseRecommendation: PostingOutcome["reuseRecommendation"];
  strategicValue: StrategicOutcome["strategicValue"] | null;
  reuseMode: EvergreenReuseMode;
  reasons: string[];
  weeklyGapReasons: string[];
  rankScore: number;
  campaignLabel: string | null;
  pillarLabel: string | null;
  audienceLabel: string | null;
  funnelStage: FunnelStage | null;
  editorialMode: EditorialMode | null;
  editorialModeLabel: string | null;
  destinationLabel: string | null;
  destinationUrl: string | null;
  patternName: string | null;
  bundleNames: string[];
  sourceLineageLabel: string;
}

export interface EvergreenSuppression {
  id: string;
  signalId: string;
  signal: SignalRecord;
  postingLogId: string | null;
  reasons: string[];
  surfacedPlatform: PostingPlatform | null;
  priorPostDate: string | null;
  priorOutcomeQuality: PostingOutcome["outcomeQuality"] | null;
  priorReuseRecommendation: PostingOutcome["reuseRecommendation"] | null;
  strategicValue: StrategicOutcome["strategicValue"] | null;
}

export interface EvergreenSummary {
  eligibleCount: number;
  surfacedCount: number;
  suppressedCount: number;
  directReuseCount: number;
  adaptBeforeReuseCount: number;
  candidates: EvergreenCandidate[];
  suppressed: EvergreenSuppression[];
  topPlatformRows: Array<{ platform: PostingPlatform; label: string; count: number }>;
  topPatternRows: Array<{ label: string; count: number }>;
  topBundleRows: Array<{ label: string; count: number }>;
  platformGapFillRows: Array<{ label: string; count: number }>;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LAST_POST_COOLDOWN_DAYS = 21;
const PLATFORM_MODE_COOLDOWN_DAYS = 14;
const PATTERN_PLATFORM_COOLDOWN_DAYS = 21;
const DESTINATION_COOLDOWN_DAYS = 10;
const SATURATION_LIMIT = 2;

function daysSince(value: string | null | undefined, now: Date): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.floor((now.getTime() - parsed) / DAY_IN_MS);
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function hasReusableDraftMaterial(signal: SignalRecord): boolean {
  return Boolean(
    signal.finalXDraft ||
      signal.finalLinkedInDraft ||
      signal.finalRedditDraft ||
      signal.xDraft ||
      signal.linkedInDraft ||
      signal.redditDraft ||
      signal.repurposingBundleJson ||
      signal.publishPrepBundleJson,
  );
}

function getMostRecentBySignal<T extends { signalId: string }>(
  values: T[],
  timestampSelector: (value: T) => string,
): Map<string, T> {
  const map = new Map<string, T>();

  for (const value of values) {
    const current = map.get(value.signalId);
    if (!current) {
      map.set(value.signalId, value);
      continue;
    }

    const currentTime = new Date(timestampSelector(current)).getTime();
    const nextTime = new Date(timestampSelector(value)).getTime();
    if (nextTime >= currentTime) {
      map.set(value.signalId, value);
    }
  }

  return map;
}

function getMostRecentByPostingLog<T extends { postingLogId: string }>(
  values: T[],
  timestampSelector: (value: T) => string,
): Map<string, T> {
  const map = new Map<string, T>();

  for (const value of values) {
    const current = map.get(value.postingLogId);
    if (!current) {
      map.set(value.postingLogId, value);
      continue;
    }

    const currentTime = new Date(timestampSelector(current)).getTime();
    const nextTime = new Date(timestampSelector(value)).getTime();
    if (nextTime >= currentTime) {
      map.set(value.postingLogId, value);
    }
  }

  return map;
}

function findLatestPostingEntry(entries: PostingLogEntry[]): PostingLogEntry | null {
  return [...entries].sort(
    (left, right) =>
      new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime() || right.id.localeCompare(left.id),
  )[0] ?? null;
}

function bucketCount<K extends string>(rows: Map<K, number>, key: K | null | undefined) {
  if (!key) {
    return 0;
  }

  return rows.get(key) ?? 0;
}

function increment<K extends string>(map: Map<K, number>, key: K | null | undefined) {
  if (!key) {
    return;
  }

  map.set(key, (map.get(key) ?? 0) + 1);
}

function scoreStrategicValue(value: StrategicOutcome["strategicValue"] | null): number {
  switch (value) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return -2;
    case "unclear":
      return 0;
    default:
      return 0;
  }
}

function buildBundleNames(patternId: string | null, bundles: PatternBundle[]): string[] {
  if (!patternId) {
    return [];
  }

  return bundles.filter((bundle) => bundle.patternIds.includes(patternId)).map((bundle) => bundle.name);
}

function buildSignalLineageLabel(signal: SignalRecord, entry: PostingLogEntry): string {
  return entry.patternName ?? signal.sourcePublisher ?? signal.sourceType ?? "Prior posted content";
}

export function buildEvergreenSummary(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  strategy: CampaignStrategy;
  cadence?: CampaignCadenceSummary | null;
  weeklyPlan?: WeeklyPlan | null;
  weeklyPlanState?: WeeklyPlanState | null;
  bundles?: PatternBundle[];
  maxCandidates?: number;
  now?: Date;
}): EvergreenSummary {
  const now = input.now ?? new Date();
  const bundles = input.bundles ?? [];
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const entriesBySignalId = new Map<string, PostingLogEntry[]>();
  const postingOutcomeByPostingLogId = getMostRecentByPostingLog(input.postingOutcomes, (outcome) => outcome.timestamp);
  const strategicOutcomeByPostingLogId = getMostRecentByPostingLog(input.strategicOutcomes, (outcome) => outcome.recordedAt);

  for (const entry of input.postingEntries) {
    entriesBySignalId.set(entry.signalId, [...(entriesBySignalId.get(entry.signalId) ?? []), entry]);
  }

  const recentPlatformModeCounts = new Map<string, number>();
  const recentPatternPlatformCounts = new Map<string, number>();
  const recentDestinationCounts = new Map<string, number>();
  const recentSaturationCounts = new Map<string, number>();

  for (const entry of input.postingEntries) {
    const entryAgeDays = daysSince(entry.postedAt, now);
    const signal = signalById.get(entry.signalId);

    if (entryAgeDays !== null && entryAgeDays <= PLATFORM_MODE_COOLDOWN_DAYS && signal?.editorialMode) {
      increment(recentPlatformModeCounts, `${entry.platform}|${signal.editorialMode}`);
    }

    if (entryAgeDays !== null && entryAgeDays <= PATTERN_PLATFORM_COOLDOWN_DAYS && entry.patternId) {
      increment(recentPatternPlatformCounts, `${entry.platform}|${entry.patternId}`);
    }

    if (entryAgeDays !== null && entryAgeDays <= DESTINATION_COOLDOWN_DAYS && entry.selectedSiteLinkId) {
      increment(recentDestinationCounts, entry.selectedSiteLinkId);
    }

    if (entryAgeDays !== null && entryAgeDays <= PLATFORM_MODE_COOLDOWN_DAYS && signal?.editorialMode) {
      increment(
        recentSaturationCounts,
        `${entry.platform}|${signal.editorialMode}|${signal.funnelStage ?? "none"}`,
      );
    }
  }

  const candidates: EvergreenCandidate[] = [];
  const suppressed: EvergreenSuppression[] = [];
  const topPlatformCounts = new Map<PostingPlatform, number>();
  const topPatternCounts = new Map<string, number>();
  const topBundleCounts = new Map<string, number>();
  const platformGapFillCounts = new Map<string, number>();

  for (const signal of input.signals) {
    const postingEntries = entriesBySignalId.get(signal.recordId) ?? [];
    const latestEntry = findLatestPostingEntry(postingEntries);
    const latestOutcome = latestEntry ? postingOutcomeByPostingLogId.get(latestEntry.id) ?? null : null;
    const latestStrategic = latestEntry ? strategicOutcomeByPostingLogId.get(latestEntry.id) ?? null : null;

    if (!latestEntry) {
      continue;
    }

    const suppressionReasons: string[] = [];

    if (signal.status === "Archived" || signal.status === "Rejected") {
      uniquePush(suppressionReasons, "Archived or rejected records do not resurface.");
    }

    if (!latestOutcome) {
      uniquePush(suppressionReasons, "No qualitative outcome is recorded yet.");
    } else {
      if (latestOutcome.outcomeQuality === "weak") {
        uniquePush(suppressionReasons, "Weak outcomes are not eligible for evergreen reuse.");
      }
      if (latestOutcome.reuseRecommendation === "do_not_repeat") {
        uniquePush(suppressionReasons, "Marked do not repeat.");
      }
    }

    if (!hasReusableDraftMaterial(signal)) {
      uniquePush(suppressionReasons, "No reusable draft or packaging material is saved.");
    }

    const lastPostedDays = daysSince(latestEntry.postedAt, now);
    if (lastPostedDays !== null && lastPostedDays < LAST_POST_COOLDOWN_DAYS) {
      uniquePush(suppressionReasons, `Posted ${lastPostedDays} day${lastPostedDays === 1 ? "" : "s"} ago, still inside cooldown.`);
    }

    if (signal.editorialMode && bucketCount(recentPlatformModeCounts, `${latestEntry.platform}|${signal.editorialMode}`) >= SATURATION_LIMIT) {
      uniquePush(suppressionReasons, "Recent platform and editorial-mode mix is already saturated.");
    }

    if (latestEntry.patternId && bucketCount(recentPatternPlatformCounts, `${latestEntry.platform}|${latestEntry.patternId}`) >= SATURATION_LIMIT) {
      uniquePush(suppressionReasons, "Recent pattern and platform combination has already been used heavily.");
    }

    if (latestEntry.selectedSiteLinkId && bucketCount(recentDestinationCounts, latestEntry.selectedSiteLinkId) >= SATURATION_LIMIT) {
      uniquePush(suppressionReasons, "Recent destination-page usage is already saturated.");
    }

    if (
      signal.editorialMode &&
      bucketCount(
        recentSaturationCounts,
        `${latestEntry.platform}|${signal.editorialMode}|${signal.funnelStage ?? "none"}`,
      ) >= SATURATION_LIMIT
    ) {
      uniquePush(suppressionReasons, "Recent weekly mix already contains similar platform, mode, and funnel combinations.");
    }

    const context = getSignalContentContextSummary(signal, input.strategy);
    const campaign = context.campaignId
      ? input.strategy.campaigns.find((item) => item.id === context.campaignId) ?? null
      : null;
    if (campaign && campaign.status === "inactive") {
      uniquePush(suppressionReasons, `Campaign "${campaign.name}" is inactive.`);
    }
    if (campaign?.endDate) {
      const endDate = new Date(campaign.endDate).getTime();
      if (Number.isFinite(endDate) && endDate < now.getTime() - 7 * DAY_IN_MS) {
        uniquePush(suppressionReasons, `Campaign "${campaign.name}" is stale for current resurfacing.`);
      }
    }

    if (suppressionReasons.length > 0) {
      suppressed.push({
        id: `evergreen-suppressed:${latestEntry.id}`,
        signalId: signal.recordId,
        signal,
        postingLogId: latestEntry.id,
        reasons: suppressionReasons,
        surfacedPlatform: latestEntry.platform,
        priorPostDate: latestEntry.postedAt,
        priorOutcomeQuality: latestOutcome?.outcomeQuality ?? null,
        priorReuseRecommendation: latestOutcome?.reuseRecommendation ?? null,
        strategicValue: latestStrategic?.strategicValue ?? null,
      });
      continue;
    }

    const reasons: string[] = [];
    const weeklyGapReasons: string[] = [];
    let rankScore = 0;

    if (latestOutcome?.outcomeQuality === "strong") {
      rankScore += 4;
      uniquePush(reasons, `Previously ${getOutcomeQualityLabel(latestOutcome.outcomeQuality).toLowerCase()} on ${getPostingPlatformLabel(latestEntry.platform)}.`);
    } else if (latestOutcome?.outcomeQuality === "acceptable") {
      rankScore += 2;
      uniquePush(reasons, "Previous result was acceptable and still reusable.");
    }

    if (latestOutcome?.reuseRecommendation === "reuse_this_approach") {
      rankScore += 3;
      uniquePush(reasons, "Marked reuse this approach.");
    } else if (latestOutcome?.reuseRecommendation === "adapt_before_reuse") {
      rankScore += 1;
      uniquePush(reasons, "Marked adapt before reuse.");
    }

    rankScore += scoreStrategicValue(latestStrategic?.strategicValue ?? null);
    if (latestStrategic?.strategicValue === "high") {
      uniquePush(reasons, `High strategic value on ${getPostingPlatformLabel(latestEntry.platform)}.`);
    }

    const planAlignment = getWeeklyPlanAlignment(signal, input.weeklyPlan ?? null, input.strategy, input.weeklyPlanState ?? null);
    rankScore += Math.max(0, planAlignment.scoreDelta);
    for (const boost of planAlignment.boosts.slice(0, 2)) {
      uniquePush(weeklyGapReasons, boost);
    }

    if (input.cadence?.underrepresentedFunnels.includes(signal.funnelStage ?? "Awareness")) {
      rankScore += 1;
      if (signal.funnelStage) {
        uniquePush(weeklyGapReasons, `Fills a ${signal.funnelStage.toLowerCase()} gap in the current mix.`);
      }
    }

    if (context.pillarName && input.cadence?.underrepresentedPillars.includes(context.pillarName)) {
      rankScore += 1;
      uniquePush(weeklyGapReasons, `${context.pillarName} is underrepresented this week.`);
    }

    if (context.campaignName && campaign?.status === "active") {
      rankScore += 1;
      uniquePush(weeklyGapReasons, `Supports active campaign "${context.campaignName}".`);
    }

    const lastPostedDaysSafe = lastPostedDays ?? LAST_POST_COOLDOWN_DAYS;
    if (lastPostedDaysSafe >= 35) {
      rankScore += 1;
    }

    const bundleNames = buildBundleNames(latestEntry.patternId, bundles);
    if (latestEntry.patternName) {
      rankScore += 1;
      increment(topPatternCounts, latestEntry.patternName);
    }
    for (const bundleName of bundleNames) {
      rankScore += 1;
      increment(topBundleCounts, bundleName);
    }

    increment(topPlatformCounts, latestEntry.platform);
    for (const weeklyReason of weeklyGapReasons) {
      const lower = weeklyReason.toLowerCase();
      if (lower.includes("platform") || lower.includes("linkedin") || lower.includes("reddit") || lower.includes("x")) {
        increment(platformGapFillCounts, getPostingPlatformLabel(latestEntry.platform));
      }
    }

    const candidate: EvergreenCandidate = {
      id: `evergreen:${signal.recordId}:${latestEntry.id}`,
      signalId: signal.recordId,
      signal,
      postingLogId: latestEntry.id,
      surfacedPlatform: latestEntry.platform,
      priorPostDate: latestEntry.postedAt,
      priorOutcomeQuality: latestOutcome!.outcomeQuality,
      priorReuseRecommendation: latestOutcome!.reuseRecommendation,
      strategicValue: latestStrategic?.strategicValue ?? null,
      reuseMode: latestOutcome!.reuseRecommendation === "reuse_this_approach" ? "reuse_directly" : "adapt_before_reuse",
      reasons: reasons.slice(0, 3),
      weeklyGapReasons: weeklyGapReasons.slice(0, 3),
      rankScore,
      campaignLabel: context.campaignName,
      pillarLabel: context.pillarName,
      audienceLabel: context.audienceSegmentName,
      funnelStage: context.funnelStage,
      editorialMode: signal.editorialMode,
      editorialModeLabel: signal.editorialMode ? getEditorialModeDefinition(signal.editorialMode).label : null,
      destinationLabel: latestEntry.destinationLabel ?? latestEntry.selectedSiteLinkId ?? buildSignalPublishPrepBundle(signal)?.packages[0]?.siteLinkLabel ?? null,
      destinationUrl: latestEntry.destinationUrl,
      patternName: latestEntry.patternName,
      bundleNames,
      sourceLineageLabel: buildSignalLineageLabel(signal, latestEntry),
    };

    candidates.push(candidate);
  }

  const sortedCandidates = [...candidates].sort(
    (left, right) =>
      right.rankScore - left.rankScore ||
      new Date(left.priorPostDate).getTime() - new Date(right.priorPostDate).getTime() ||
      left.signal.sourceTitle.localeCompare(right.signal.sourceTitle),
  );
  const surfacedCandidates = sortedCandidates.slice(0, input.maxCandidates ?? 5);

  return {
    eligibleCount: candidates.length,
    surfacedCount: surfacedCandidates.length,
    suppressedCount: suppressed.length,
    directReuseCount: surfacedCandidates.filter((candidate) => candidate.reuseMode === "reuse_directly").length,
    adaptBeforeReuseCount: surfacedCandidates.filter((candidate) => candidate.reuseMode === "adapt_before_reuse").length,
    candidates: surfacedCandidates,
    suppressed: suppressed
      .sort(
        (left, right) =>
          new Date(right.priorPostDate ?? 0).getTime() - new Date(left.priorPostDate ?? 0).getTime() ||
          left.signal.sourceTitle.localeCompare(right.signal.sourceTitle),
      )
      .slice(0, 8),
    topPlatformRows: [...topPlatformCounts.entries()]
      .map(([platform, count]) => ({ platform, label: getPostingPlatformLabel(platform), count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 3),
    topPatternRows: [...topPatternCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 3),
    topBundleRows: [...topBundleCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 3),
    platformGapFillRows: [...platformGapFillCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 3),
  };
}

export function getEvergreenCandidateById(summary: EvergreenSummary, candidateId: string | null | undefined): EvergreenCandidate | null {
  if (!candidateId) {
    return null;
  }

  return summary.candidates.find((candidate) => candidate.id === candidateId) ?? null;
}
