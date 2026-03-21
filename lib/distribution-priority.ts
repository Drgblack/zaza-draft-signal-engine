import type { AttributionRecord } from "@/lib/attribution";
import type { AudienceMemoryState } from "@/lib/audience-memory";
import { getAudienceMemorySegment } from "@/lib/audience-memory";
import type { ConversionIntentAssessment } from "@/lib/conversion-intent";
import type { FatigueAssessment } from "@/lib/fatigue";
import {
  getFounderOverrideDistributionAdjustment,
  matchFounderOverrideThemesToSignal,
  type FounderOverrideState,
} from "@/lib/founder-overrides";
import type { GrowthMemoryState } from "@/lib/growth-memory";
import {
  matchRevenueAmplifierToSignal,
  type RevenueAmplifierState,
} from "@/lib/revenue-amplifier";
import type { PostingLogEntry, PostingPlatform } from "@/lib/posting-memory";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getPublishPrepPackageForPlatform,
  getSelectedCtaText,
} from "@/lib/publish-prep";
import type { RevenueSignal } from "@/lib/revenue-signals";
import type { SignalRecord } from "@/types/signal";

export const DISTRIBUTION_STRATEGIES = ["single", "multi", "experimental"] as const;

export type DistributionStrategy = (typeof DISTRIBUTION_STRATEGIES)[number];

export interface DistributionPriorityAssessment {
  primaryPlatform: PostingPlatform;
  primaryPlatformLabel: string;
  secondaryPlatforms: PostingPlatform[];
  secondaryPlatformLabels: string[];
  distributionStrategy: DistributionStrategy;
  reason: string;
  supportingSignals: string[];
  fitRows: Array<{
    platform: PostingPlatform;
    label: string;
    score: number;
  }>;
}

export interface DistributionPriorityInsights {
  primaryPlatformRows: Array<{ label: string; count: number }>;
  strategyRows: Array<{ label: string; count: number }>;
  multiPlatformCount: number;
  singlePlatformCount: number;
  experimentalCount: number;
  summaries: string[];
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function increment(map: Map<PostingPlatform, number>, platform: PostingPlatform, amount: number) {
  map.set(platform, (map.get(platform) ?? 0) + amount);
}

function getBasePrimaryPlatform(signal: SignalRecord): PostingPlatform {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }

  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "x";
}

function getAvailablePlatforms(signal: SignalRecord): PostingPlatform[] {
  const bundle = buildSignalPublishPrepBundle(signal);
  const bundlePlatforms = Array.from(
    new Set((bundle?.packages ?? []).map((pkg) => pkg.platform)),
  ).filter((platform): platform is PostingPlatform =>
    platform === "x" || platform === "linkedin" || platform === "reddit",
  );

  if (bundlePlatforms.length > 0) {
    return bundlePlatforms;
  }

  return ["linkedin", "x", "reddit"];
}

function findCurrentDestination(signal: SignalRecord, platform: PostingPlatform) {
  const bundle = buildSignalPublishPrepBundle(signal);
  const primaryPackage = getPublishPrepPackageForPlatform(bundle, platform);
  return normalizeText(
    primaryPackage
      ? getPrimaryLinkVariant(primaryPackage)?.destinationLabel ?? primaryPackage.siteLinkLabel
      : null,
  );
}

function findCurrentCta(signal: SignalRecord, platform: PostingPlatform) {
  const bundle = buildSignalPublishPrepBundle(signal);
  const primaryPackage = getPublishPrepPackageForPlatform(bundle, platform);
  return normalizeText(primaryPackage ? getSelectedCtaText(primaryPackage) : null);
}

function scoreRevenueSignal(signal: RevenueSignal) {
  let score =
    signal.type === "paid"
      ? 4
      : signal.type === "trial"
        ? 3
        : signal.type === "signup"
          ? 2
          : 0.5;

  if (signal.strength === "high") {
    score += 2;
  } else if (signal.strength === "medium") {
    score += 1;
  }

  if (signal.confidence === "high") {
    score += 1;
  }

  return score;
}

function scoreAttributionRecord(record: AttributionRecord) {
  let score =
    record.outcomeType === "lead"
      ? 2.5
      : record.outcomeType === "signup"
        ? 2
        : record.outcomeType === "click"
          ? 1
          : 0.25;

  if (record.outcomeStrength === "strong") {
    score += 1.5;
  } else if (record.outcomeStrength === "medium") {
    score += 0.75;
  }

  return score;
}

function countRows(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function labelStrategy(strategy: DistributionStrategy) {
  switch (strategy) {
    case "multi":
      return "Multi-platform";
    case "experimental":
      return "Experimental";
    case "single":
    default:
      return "Single-platform";
  }
}

export function assessDistributionPriority(input: {
  signal: SignalRecord;
  confidenceLevel?: "high" | "medium" | "moderate" | "low";
  expectedOutcomeTier?: "high" | "medium" | "low";
  conversionIntent?: ConversionIntentAssessment | null;
  audienceMemory?: AudienceMemoryState | null;
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
  postingEntries?: PostingLogEntry[];
  fatigue?: FatigueAssessment | null;
  growthMemory?: GrowthMemoryState | null;
  revenueAmplifier?: RevenueAmplifierState | null;
  founderOverrides?: FounderOverrideState | null;
  experimentLinked?: boolean;
}): DistributionPriorityAssessment {
  const availablePlatforms = getAvailablePlatforms(input.signal);
  const scores = new Map<PostingPlatform, number>();
  const supportingSignals: string[] = [];
  const basePlatform = getBasePrimaryPlatform(input.signal);
  const destinationLabel = findCurrentDestination(input.signal, basePlatform);
  const ctaText = findCurrentCta(input.signal, basePlatform)?.toLowerCase() ?? "";
  const segment = getAudienceMemorySegment(input.audienceMemory, input.signal.audienceSegmentId);
  const revenueAmplifierMatch = matchRevenueAmplifierToSignal(
    input.signal,
    input.revenueAmplifier,
  );

  for (const platform of availablePlatforms) {
    increment(scores, platform, 0);
  }

  increment(scores, basePlatform, input.signal.platformPriority === "Multi-platform" ? 1.25 : 2);
  uniquePush(
    supportingSignals,
    input.signal.platformPriority === "Multi-platform"
      ? "Signal is already marked multi-platform."
      : `${getPostingPlatformLabel(basePlatform)} is the current platform priority.`,
  );

  if (
    input.signal.funnelStage === "Trust" ||
    input.signal.funnelStage === "Consideration" ||
    input.signal.editorialMode === "helpful_tip" ||
    input.signal.editorialMode === "professional_guidance" ||
    input.signal.editorialMode === "thought_leadership" ||
    input.signal.editorialMode === "calm_insight"
  ) {
    increment(scores, "linkedin", 2);
    uniquePush(supportingSignals, "Trust-stage or professional guidance content leans strongest on LinkedIn.");
  }

  if (
    input.signal.signalCategory === "Conflict" ||
    input.signal.signalCategory === "Stress" ||
    input.signal.editorialMode === "reassurance_deescalation" ||
    input.signal.editorialMode === "risk_warning"
  ) {
    increment(scores, "reddit", 1.5);
    uniquePush(supportingSignals, "Discussion-heavy teacher pain points usually land better in Reddit-style discussion contexts.");
  }

  if (
    input.signal.editorialMode === "this_could_happen_to_you" ||
    input.signal.severityScore === 3 ||
    input.signal.funnelStage === "Awareness"
  ) {
    increment(scores, "x", 1.5);
    uniquePush(supportingSignals, "Reactive awareness framing gives X more upside for fast reach.");
  }

  if (
    input.signal.suggestedFormatPriority === "Video" ||
    input.signal.suggestedFormatPriority === "Carousel" ||
    input.signal.suggestedFormatPriority === "Multi-format"
  ) {
    increment(scores, "linkedin", 0.75);
    increment(scores, "x", 0.75);
    uniquePush(supportingSignals, "Multi-format or visual packaging raises cross-platform distribution value.");
  }

  if (
    input.signal.ctaGoal === "Sign up" ||
    input.signal.ctaGoal === "Try product" ||
    input.conversionIntent?.posture === "soft_conversion" ||
    input.conversionIntent?.posture === "direct_conversion"
  ) {
    increment(scores, "linkedin", 1.25);
    increment(scores, "reddit", -1.25);
    uniquePush(supportingSignals, "Commercial CTA pressure is safer on LinkedIn than Reddit.");
  }

  if (
    input.signal.ctaGoal === "Awareness" ||
    input.signal.ctaGoal === "Share / engage" ||
    ctaText.includes("learn more") ||
    ctaText.includes("share")
  ) {
    increment(scores, "x", 0.75);
    increment(scores, "reddit", 0.5);
  }

  if (destinationLabel) {
    const normalizedDestination = destinationLabel.toLowerCase();
    if (normalizedDestination.includes("overview") || normalizedDestination.includes("guide")) {
      increment(scores, "linkedin", 0.75);
      increment(scores, "x", 0.5);
    }
    if (
      normalizedDestination.includes("pricing") ||
      normalizedDestination.includes("demo") ||
      normalizedDestination.includes("trial") ||
      normalizedDestination.includes("signup")
    ) {
      increment(scores, "linkedin", 1);
      increment(scores, "reddit", -1);
    }
  }

  if (segment) {
    for (const row of segment.strongestPlatforms.slice(0, 2)) {
      const platform = row.id as PostingPlatform;
      if (availablePlatforms.includes(platform)) {
        increment(scores, platform, Math.min(1.5, row.score / Math.max(1, row.count * 2)));
      }
    }

    uniquePush(supportingSignals, segment.summary[0]);
  }

  const relevantAttribution = (input.attributionRecords ?? []).filter(
    (record) =>
      record.editorialMode === input.signal.editorialMode ||
      (destinationLabel && record.destination?.toLowerCase() === destinationLabel.toLowerCase()),
  );
  for (const record of relevantAttribution) {
    if (availablePlatforms.includes(record.platform)) {
      increment(scores, record.platform, scoreAttributionRecord(record) * 0.4);
    }
  }

  const relevantRevenue = (input.revenueSignals ?? []).filter(
    (signal) =>
      signal.editorialMode === input.signal.editorialMode ||
      (destinationLabel && signal.destination?.toLowerCase() === destinationLabel.toLowerCase()),
  );
  for (const signal of relevantRevenue) {
    if (availablePlatforms.includes(signal.platform)) {
      increment(scores, signal.platform, scoreRevenueSignal(signal) * 0.35);
    }
  }

  if (relevantRevenue[0]) {
    uniquePush(
      supportingSignals,
      `${relevantRevenue.length} revenue-linked signal${relevantRevenue.length === 1 ? "" : "s"} support the current mode or destination.`,
    );
  } else if (relevantAttribution[0]) {
    uniquePush(
      supportingSignals,
      `${relevantAttribution.length} attribution signal${relevantAttribution.length === 1 ? "" : "s"} support the current mode or destination.`,
    );
  }

  if (revenueAmplifierMatch) {
    const matchedPlatform = input.revenueAmplifier?.amplifiedPatterns.find(
      (pattern) => pattern.label === revenueAmplifierMatch.label,
    )?.platform;
    if (matchedPlatform && availablePlatforms.includes(matchedPlatform)) {
      increment(
        scores,
        matchedPlatform,
        revenueAmplifierMatch.revenueStrength === "high" ? 1.5 : 0.9,
      );
    }
    uniquePush(supportingSignals, revenueAmplifierMatch.recommendation);
  }

  for (const platform of availablePlatforms) {
    const adjustment = getFounderOverrideDistributionAdjustment(input.founderOverrides, platform);
    if (adjustment.scoreDelta !== 0) {
      increment(scores, platform, adjustment.scoreDelta);
    }
    for (const reason of adjustment.reasons) {
      uniquePush(supportingSignals, reason);
    }
  }

  for (const matchedTheme of matchFounderOverrideThemesToSignal(input.signal, input.founderOverrides).slice(0, 2)) {
    increment(scores, basePlatform, 0.35);
    uniquePush(supportingSignals, `Founder override currently emphasizes ${matchedTheme}.`);
  }

  for (const cautionPattern of input.revenueAmplifier?.cautionPatterns ?? []) {
    if (
      cautionPattern.platform &&
      availablePlatforms.includes(cautionPattern.platform) &&
      cautionPattern.ctaGoal &&
      input.signal.ctaGoal === cautionPattern.ctaGoal
    ) {
      increment(scores, cautionPattern.platform, -1);
      uniquePush(supportingSignals, cautionPattern.recommendation);
    }
  }

  for (const warning of input.fatigue?.warnings ?? []) {
    if (warning.dimension === "platform_emphasis") {
      const lowered = warning.label.toLowerCase();
      if (lowered.includes("linkedin")) {
        increment(scores, "linkedin", warning.severity === "moderate" ? -1.5 : -0.75);
      }
      if (lowered.includes("reddit")) {
        increment(scores, "reddit", warning.severity === "moderate" ? -1.5 : -0.75);
      }
      if (lowered === "x") {
        increment(scores, "x", warning.severity === "moderate" ? -1.5 : -0.75);
      }
      uniquePush(supportingSignals, warning.summary);
    }
  }

  for (const combo of input.growthMemory?.currentBestCombos ?? []) {
    const label = combo.label.toLowerCase();
    if (destinationLabel && label.includes(destinationLabel.toLowerCase())) {
      if (label.includes("linkedin")) increment(scores, "linkedin", 0.8);
      if (label.includes("reddit")) increment(scores, "reddit", 0.8);
      if (label.includes("x")) increment(scores, "x", 0.8);
    }
  }
  for (const combo of input.growthMemory?.currentWeakCombos ?? []) {
    const label = combo.label.toLowerCase();
    if (destinationLabel && label.includes(destinationLabel.toLowerCase())) {
      if (label.includes("linkedin")) increment(scores, "linkedin", -0.8);
      if (label.includes("reddit")) increment(scores, "reddit", -0.8);
      if (label.includes("x")) increment(scores, "x", -0.8);
    }
  }

  const fitRows = availablePlatforms
    .map((platform) => ({
      platform,
      label: getPostingPlatformLabel(platform),
      score: Number((scores.get(platform) ?? 0).toFixed(2)),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.label.localeCompare(right.label),
    );
  const primaryPlatform = fitRows[0]?.platform ?? basePlatform;
  const topScore = fitRows[0]?.score ?? 0;
  const secondScore = fitRows[1]?.score ?? -99;
  const primaryPlatformLabel = getPostingPlatformLabel(primaryPlatform);

  const shouldGoMulti =
    !input.experimentLinked &&
    input.confidenceLevel !== "low" &&
    input.expectedOutcomeTier === "high" &&
    (input.signal.platformPriority === "Multi-platform" ||
      input.signal.suggestedFormatPriority === "Multi-format" ||
      input.signal.suggestedFormatPriority === "Carousel" ||
      topScore - secondScore <= 1.1);
  const shouldStayExperimental =
    Boolean(input.experimentLinked) ||
    (input.expectedOutcomeTier !== "low" &&
      input.confidenceLevel === "high" &&
      topScore - secondScore <= 0.5 &&
      input.signal.platformPriority === "Multi-platform");

  let distributionStrategy: DistributionStrategy = shouldStayExperimental
    ? "experimental"
    : shouldGoMulti
      ? "multi"
      : "single";

  if (input.founderOverrides?.distributionDirection === "single" && distributionStrategy === "multi") {
    distributionStrategy = "single";
    uniquePush(supportingSignals, "Founder override is temporarily favoring a tighter single-platform push.");
  } else if (
    input.founderOverrides?.distributionDirection === "multi" &&
    distributionStrategy === "single" &&
    !input.experimentLinked &&
    input.confidenceLevel !== "low" &&
    topScore - secondScore <= 1.25
  ) {
    distributionStrategy = "multi";
    uniquePush(supportingSignals, "Founder override is temporarily allowing broader multi-platform reuse.");
  }

  const secondaryPlatforms =
    distributionStrategy === "single"
      ? []
      : fitRows
          .slice(1)
          .filter((row) => row.score >= topScore - 1.5)
          .map((row) => row.platform)
          .slice(0, 2);
  const secondaryPlatformLabels = secondaryPlatforms.map((platform) =>
    getPostingPlatformLabel(platform),
  );

  const reason =
    distributionStrategy === "multi"
      ? `${primaryPlatformLabel} should lead, with ${secondaryPlatformLabels.join(" and ")} as bounded secondary distribution because the package has high value and cross-platform fit.`
      : distributionStrategy === "experimental"
        ? `${primaryPlatformLabel} should lead, but keep ${secondaryPlatformLabels[0] ?? "a secondary platform"} as the bounded experiment route while the variable stays under test.`
        : `${primaryPlatformLabel} is the clearest first distribution route for this package right now.`;

  uniquePush(
    supportingSignals,
    distributionStrategy === "multi"
      ? "High-value package supports a bounded multi-platform push."
      : distributionStrategy === "experimental"
        ? "Platform choice stays deliberately bounded because this item is still experimental."
        : `Use ${primaryPlatformLabel} first before expanding distribution.`,
  );

  return {
    primaryPlatform,
    primaryPlatformLabel,
    secondaryPlatforms,
    secondaryPlatformLabels,
    distributionStrategy,
    reason,
    supportingSignals: supportingSignals.slice(0, 5),
    fitRows,
  };
}

export function buildDistributionPriorityInsights(
  priorities: DistributionPriorityAssessment[],
): DistributionPriorityInsights {
  const primaryPlatformRows = countRows(
    priorities.map((priority) => priority.primaryPlatformLabel),
  ).slice(0, 4);
  const strategyRows = countRows(
    priorities.map((priority) => labelStrategy(priority.distributionStrategy)),
  ).slice(0, 4);
  const multiPlatformCount = priorities.filter(
    (priority) => priority.distributionStrategy === "multi",
  ).length;
  const singlePlatformCount = priorities.filter(
    (priority) => priority.distributionStrategy === "single",
  ).length;
  const experimentalCount = priorities.filter(
    (priority) => priority.distributionStrategy === "experimental",
  ).length;
  const summaries: string[] = [];

  uniquePush(
    summaries,
    primaryPlatformRows[0]
      ? `${primaryPlatformRows[0].label} is the strongest current primary distribution route.`
      : null,
  );
  uniquePush(
    summaries,
    multiPlatformCount > 0
      ? `${multiPlatformCount} candidate${multiPlatformCount === 1 ? "" : "s"} deserve bounded multi-platform distribution.`
      : null,
  );
  uniquePush(
    summaries,
    experimentalCount > 0
      ? `${experimentalCount} candidate${experimentalCount === 1 ? "" : "s"} should keep platform choice experimental for now.`
      : null,
  );
  uniquePush(
    summaries,
    singlePlatformCount > 0
      ? `${singlePlatformCount} candidate${singlePlatformCount === 1 ? "" : "s"} are strongest when kept single-platform first.`
      : null,
  );

  return {
    primaryPlatformRows,
    strategyRows,
    multiPlatformCount,
    singlePlatformCount,
    experimentalCount,
    summaries: summaries.slice(0, 4),
  };
}
