import { buildAttributionHistorySnapshot, type AttributionRecord } from "@/lib/attribution";
import { buildAudienceSignalGuidance, type AudienceMemoryState } from "@/lib/audience-memory";
import type { ConflictAssessment } from "@/lib/conflicts";
import type { ConversionIntentAssessment } from "@/lib/conversion-intent";
import { getPostingPlatformLabel, type PostingPlatform } from "@/lib/posting-memory";
import {
  getPrimaryLinkVariant,
  getSelectedCtaText,
  type CtaVariant,
  type LinkVariant,
  type PublishPrepPackage,
} from "@/lib/publish-prep";
import { buildRevenueHistorySnapshot, type RevenueSignal } from "@/lib/revenue-signals";
import { getSiteLinkById, isSiteLinkAlignedToCtaGoal, type SiteLinkDefinition } from "@/lib/site-links";
import type { SignalRecord } from "@/types/signal";

export const CTA_DESTINATION_HEALING_TYPES = [
  "soften_cta",
  "strengthen_cta",
  "switch_destination",
  "align_cta_to_destination",
  "align_destination_to_conversion_posture",
  "commercial_pair_upgrade",
] as const;

export type CtaDestinationHealingType = (typeof CTA_DESTINATION_HEALING_TYPES)[number];

export interface CtaDestinationPair {
  ctaText: string | null;
  ctaStyle: "soft" | "direct" | "neutral";
  destinationId: string | null;
  destinationLabel: string | null;
  destinationStyle: "soft" | "direct" | "neutral";
}

export interface CtaDestinationHealingResult {
  eligible: boolean;
  decision: "applied" | "skipped" | "blocked";
  healingType: CtaDestinationHealingType | null;
  reason: string | null;
  summary: string;
  blockReasons: string[];
  originalPair: CtaDestinationPair;
  healedPair: CtaDestinationPair;
  package: PublishPrepPackage;
}

export interface CtaDestinationHealingInsights {
  appliedCount: number;
  blockedCount: number;
  skippedCount: number;
  healedPostedCount: number;
  topHealingTypes: Array<{ label: string; count: number }>;
  strongestPairings: Array<{ label: string; count: number }>;
}

function trimOrNull(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function lower(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getPrimaryPlatform(signal: SignalRecord): PostingPlatform {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }
  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }
  return "x";
}

function classifyCtaStyle(variant: Pick<CtaVariant, "text" | "goalLabel"> | null | undefined): "soft" | "direct" | "neutral" {
  const text = lower(variant?.text);
  const goalLabel = lower(variant?.goalLabel);

  if (
    goalLabel === "click" ||
    /sign up|try product|get started|see pricing|start free|free trial|book a demo|pricing/.test(text)
  ) {
    return "direct";
  }

  if (
    goalLabel === "trust" ||
    /read more|read the full|see how it works|learn more|fuller breakdown|fuller context|save this|keep this|curious|interested/.test(text)
  ) {
    return "soft";
  }

  return "neutral";
}

function classifyDestinationStyle(destinationId: string | null | undefined): "soft" | "direct" | "neutral" {
  if (!destinationId) {
    return "neutral";
  }

  if (destinationId === "get_started" || destinationId === "pricing") {
    return "direct";
  }

  return "soft";
}

function getSelectedCtaVariant(pkg: PublishPrepPackage): CtaVariant | null {
  if (pkg.selectedCtaId) {
    const match = pkg.ctaVariants.find((variant) => variant.id === pkg.selectedCtaId);
    if (match) {
      return match;
    }
  }

  return (
    pkg.ctaVariants.find((variant) => variant.text === pkg.primaryCta) ??
    (pkg.ctaVariants[0] ?? null)
  );
}

function getPair(pkg: PublishPrepPackage): CtaDestinationPair {
  const selectedVariant = getSelectedCtaVariant(pkg);
  const primaryLink = getPrimaryLinkVariant(pkg);
  const destinationId = trimOrNull(pkg.siteLinkId) ?? trimOrNull(primaryLink?.siteLinkId);
  const siteLink = getSiteLinkById(destinationId);

  return {
    ctaText: getSelectedCtaText(pkg),
    ctaStyle: classifyCtaStyle(selectedVariant),
    destinationId,
    destinationLabel:
      trimOrNull(pkg.siteLinkLabel) ??
      trimOrNull(primaryLink?.destinationLabel) ??
      trimOrNull(primaryLink?.label) ??
      siteLink?.label ??
      null,
    destinationStyle: classifyDestinationStyle(destinationId),
  };
}

function isOperatorLockedDestination(currentPackage: PublishPrepPackage, defaultPackage: PublishPrepPackage): boolean {
  const reason = lower(currentPackage.siteLinkReason);
  if (reason.includes("operator-selected")) {
    return true;
  }

  const currentId = trimOrNull(currentPackage.siteLinkId);
  const defaultId = trimOrNull(defaultPackage.siteLinkId);
  if (!currentId || !defaultId || currentId === defaultId) {
    return false;
  }

  return !reason.includes("conversion posture") && !reason.includes("self-heal") && !reason.includes("pre-review repair");
}

function isOperatorLockedCta(currentPackage: PublishPrepPackage, defaultPackage: PublishPrepPackage): boolean {
  const currentId = trimOrNull(currentPackage.selectedCtaId);
  const defaultId = trimOrNull(defaultPackage.selectedCtaId);
  return Boolean(currentId && defaultId && currentId !== defaultId);
}

function toCandidateLinkVariant(siteLinkId: string, pkg: PublishPrepPackage, defaultPackage: PublishPrepPackage): LinkVariant | null {
  const siteLink = getSiteLinkById(siteLinkId);
  const existing =
    pkg.linkVariants.find((variant) => variant.siteLinkId === siteLinkId) ??
    defaultPackage.linkVariants.find((variant) => variant.siteLinkId === siteLinkId);

  if (existing) {
    return existing;
  }

  if (!siteLink) {
    return null;
  }

  return {
    url: siteLink.url,
    label: siteLink.label,
    siteLinkId: siteLink.id,
    destinationLabel: siteLink.label,
    usedFallback: siteLink.routeStatus === "fallback",
  };
}

function buildDestinationCandidateIds(
  currentPackage: PublishPrepPackage,
  defaultPackage: PublishPrepPackage,
  conversionIntent: ConversionIntentAssessment | null | undefined,
): string[] {
  const ids = new Set<string>();

  for (const id of conversionIntent?.preferredDestinationIds ?? []) {
    if (id) {
      ids.add(id);
    }
  }

  for (const variant of [...currentPackage.linkVariants, ...defaultPackage.linkVariants]) {
    if (variant.siteLinkId) {
      ids.add(variant.siteLinkId);
    }
  }

  return [...ids];
}

function scoreDestinationCandidate(input: {
  signal: SignalRecord;
  platform: PostingPlatform;
  siteLink: SiteLinkDefinition;
  conversionIntent: ConversionIntentAssessment | null | undefined;
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
  audienceMemory?: AudienceMemoryState | null;
}): number {
  const attribution = buildAttributionHistorySnapshot({
    records: input.attributionRecords ?? [],
    platform: input.platform,
    destination: input.siteLink.label,
    editorialMode: input.signal.editorialMode,
  });
  const revenue = buildRevenueHistorySnapshot({
    records: input.revenueSignals ?? [],
    platform: input.platform,
    destination: input.siteLink.label,
    editorialMode: input.signal.editorialMode,
  });
  const audienceGuidance = buildAudienceSignalGuidance({
    state: input.audienceMemory,
    signal: input.signal,
    primaryPlatform: input.platform,
    destinationLabel: input.siteLink.label,
  });

  const preferredIndex = input.conversionIntent?.preferredDestinationIds.findIndex((id) => id === input.siteLink.id) ?? -1;
  const postureAlignment =
    input.conversionIntent?.posture === "direct_conversion"
      ? classifyDestinationStyle(input.siteLink.id) === "direct"
        ? 3
        : -1
      : input.conversionIntent?.posture === "soft_conversion"
        ? input.siteLink.id === "product_overview" || input.siteLink.id === "product_education" || input.siteLink.id === "get_started"
          ? 2
          : 0
        : classifyDestinationStyle(input.siteLink.id) === "soft"
          ? 2
          : -2;

  const ctaGoalAlignment = isSiteLinkAlignedToCtaGoal(input.siteLink, input.signal.ctaGoal) === true ? 1 : isSiteLinkAlignedToCtaGoal(input.siteLink, input.signal.ctaGoal) === false ? -1 : 0;
  const routeStatusScore = input.siteLink.routeStatus === "confirmed" ? 1 : 0;
  const attributionScore = attribution.leadCount * 2 + attribution.signupCount + attribution.strongCount - attribution.weakCount;
  const revenueScore = revenue.paidCount * 3 + revenue.trialCount * 2 + revenue.signupCount + revenue.highStrengthCount;
  const audienceScore = audienceGuidance.positiveSignals.length - audienceGuidance.riskSignals.length;
  const preferenceScore = preferredIndex === 0 ? 3 : preferredIndex > 0 ? 1 : 0;

  return postureAlignment + ctaGoalAlignment + routeStatusScore + attributionScore + revenueScore + audienceScore + preferenceScore;
}

function getStrongerDestinationCandidate(input: {
  signal: SignalRecord;
  currentPackage: PublishPrepPackage;
  defaultPackage: PublishPrepPackage;
  conversionIntent: ConversionIntentAssessment | null | undefined;
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
  audienceMemory?: AudienceMemoryState | null;
}) {
  const platform = getPrimaryPlatform(input.signal);
  const currentPair = getPair(input.currentPackage);
  const currentSiteLink = getSiteLinkById(currentPair.destinationId);
  const currentScore = currentSiteLink
    ? scoreDestinationCandidate({
        signal: input.signal,
        platform,
        siteLink: currentSiteLink,
        conversionIntent: input.conversionIntent,
        attributionRecords: input.attributionRecords,
        revenueSignals: input.revenueSignals,
        audienceMemory: input.audienceMemory,
      })
    : -10;

  const candidates = buildDestinationCandidateIds(input.currentPackage, input.defaultPackage, input.conversionIntent)
    .map((siteLinkId) => {
      const siteLink = getSiteLinkById(siteLinkId);
      if (!siteLink) {
        return null;
      }

      return {
        siteLink,
        variant: toCandidateLinkVariant(siteLinkId, input.currentPackage, input.defaultPackage),
        score: scoreDestinationCandidate({
          signal: input.signal,
          platform,
          siteLink,
          conversionIntent: input.conversionIntent,
          attributionRecords: input.attributionRecords,
          revenueSignals: input.revenueSignals,
          audienceMemory: input.audienceMemory,
        }),
      };
    })
    .filter((value): value is { siteLink: SiteLinkDefinition; variant: LinkVariant | null; score: number } => Boolean(value))
    .sort((left, right) => right.score - left.score || left.siteLink.label.localeCompare(right.siteLink.label));

  const best = candidates.find((candidate) => candidate.siteLink.id !== currentPair.destinationId && candidate.variant);
  if (!best || best.score < currentScore + 2) {
    return null;
  }

  return {
    ...best,
    currentScore,
  };
}

function reorderLinkVariants(pkg: PublishPrepPackage, selected: LinkVariant): LinkVariant[] {
  const next = [selected, ...pkg.linkVariants.filter((variant) => variant.siteLinkId !== selected.siteLinkId && variant.url !== selected.url)];
  return next.slice(0, 3);
}

function buildSummary(result: Pick<CtaDestinationHealingResult, "decision" | "healingType" | "reason" | "blockReasons">) {
  if (result.decision === "blocked") {
    return result.blockReasons[0] ?? "CTA/destination self-healing is blocked.";
  }

  if (result.decision === "skipped" || !result.healingType) {
    return "No CTA/destination self-heal was needed.";
  }

  return `CTA/destination self-healed before review: ${result.healingType.replaceAll("_", " ")}.`;
}

export function applyCtaDestinationSelfHealing(input: {
  signal: SignalRecord;
  currentPackage: PublishPrepPackage;
  defaultPackage: PublishPrepPackage;
  conversionIntent?: ConversionIntentAssessment | null;
  conflicts?: Pick<ConflictAssessment, "topConflicts" | "summary"> | null;
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
  audienceMemory?: AudienceMemoryState | null;
  ctaBlocked?: boolean;
  destinationBlocked?: boolean;
}): CtaDestinationHealingResult {
  const originalPair = getPair(input.currentPackage);
  const nextPackage: PublishPrepPackage = {
    ...input.currentPackage,
    ctaVariants: [...input.currentPackage.ctaVariants],
    linkVariants: [...input.currentPackage.linkVariants],
  };
  const blockReasons: string[] = [];
  const posture = input.conversionIntent?.posture ?? null;
  const hasPairConflict = Boolean(
    input.conflicts?.topConflicts.some(
      (conflict) =>
        conflict.conflictType === "cta_destination_mismatch" ||
        conflict.conflictType === "destination_overreach",
    ),
  );
  const operatorLockedDestination = isOperatorLockedDestination(input.currentPackage, input.defaultPackage);
  const operatorLockedCta = isOperatorLockedCta(input.currentPackage, input.defaultPackage);
  const currentVariant = getSelectedCtaVariant(input.currentPackage);
  const softVariant =
    input.currentPackage.ctaVariants.find(
      (variant) =>
        variant.id !== currentVariant?.id &&
        (variant.goalLabel.toLowerCase() === "trust" || classifyCtaStyle(variant) === "soft"),
    ) ?? null;
  const directVariant =
    input.currentPackage.ctaVariants.find(
      (variant) =>
        variant.id !== currentVariant?.id &&
        (variant.goalLabel.toLowerCase() === "click" || classifyCtaStyle(variant) === "direct"),
    ) ?? null;
  const betterDestination = getStrongerDestinationCandidate({
    signal: input.signal,
    currentPackage: input.currentPackage,
    defaultPackage: input.defaultPackage,
    conversionIntent: input.conversionIntent,
    attributionRecords: input.attributionRecords,
    revenueSignals: input.revenueSignals,
    audienceMemory: input.audienceMemory,
  });

  if (input.ctaBlocked && input.destinationBlocked) {
    blockReasons.push("CTA and destination are experiment-locked, so self-healing cannot change the pair.");
  }

  if (operatorLockedDestination && betterDestination) {
    blockReasons.push("The destination was already operator-selected, so self-healing will not override it.");
  }

  if (operatorLockedCta && (softVariant || directVariant)) {
    blockReasons.push("The CTA was already adjusted away from the default package, so self-healing will not override it.");
  }

  if (blockReasons.length > 0) {
    return {
      eligible: false,
      decision: "blocked",
      healingType: null,
      reason: null,
      summary: buildSummary({
        decision: "blocked",
        healingType: null,
        reason: null,
        blockReasons,
      }),
      blockReasons,
      originalPair,
      healedPair: originalPair,
      package: input.currentPackage,
    };
  }

  const currentDestinationIsDirect = originalPair.destinationStyle === "direct";
  const currentCtaIsDirect = originalPair.ctaStyle === "direct";
  const currentCtaIsSoft = originalPair.ctaStyle === "soft";
  const strongCommercialSupport = Boolean(
    betterDestination &&
      betterDestination.score >= betterDestination.currentScore + 3 &&
      classifyDestinationStyle(betterDestination.siteLink.id) === "direct",
  );

  let healingType: CtaDestinationHealingType | null = null;
  let reason: string | null = null;

  if (
    !input.ctaBlocked &&
    !operatorLockedCta &&
    (posture === "trust_first" || posture === "awareness_first") &&
    currentCtaIsDirect &&
    softVariant
  ) {
    nextPackage.selectedCtaId = softVariant.id;
    healingType = "soften_cta";
    reason = `${input.conversionIntent ? input.conversionIntent.posture.replaceAll("_", " ") : "Trust-first"} posture made the current CTA more aggressive than the package needed.`;
  } else if (
    !input.destinationBlocked &&
    !operatorLockedDestination &&
    betterDestination &&
    (currentDestinationIsDirect && (posture === "trust_first" || posture === "awareness_first" || currentCtaIsSoft))
  ) {
    nextPackage.siteLinkId = betterDestination.siteLink.id;
    nextPackage.siteLinkLabel = betterDestination.siteLink.label;
    nextPackage.siteLinkReason = `CTA/destination self-heal aligned the destination to ${input.conversionIntent?.posture.replaceAll("_", " ") ?? "the current posture"}.`;
    nextPackage.siteLinkUsedFallback = betterDestination.siteLink.routeStatus === "fallback";
    nextPackage.linkVariants = reorderLinkVariants(nextPackage, betterDestination.variant!);
    healingType = currentCtaIsSoft ? "align_destination_to_conversion_posture" : "switch_destination";
    reason = `${betterDestination.siteLink.label} is a calmer destination fit for ${input.conversionIntent?.posture.replaceAll("_", " ") ?? "the current conversion posture"}.`;
  } else if (
    !input.destinationBlocked &&
    !operatorLockedDestination &&
    betterDestination &&
    hasPairConflict
  ) {
    nextPackage.siteLinkId = betterDestination.siteLink.id;
    nextPackage.siteLinkLabel = betterDestination.siteLink.label;
    nextPackage.siteLinkReason = "CTA/destination self-heal aligned the destination to the package promise.";
    nextPackage.siteLinkUsedFallback = betterDestination.siteLink.routeStatus === "fallback";
    nextPackage.linkVariants = reorderLinkVariants(nextPackage, betterDestination.variant!);
    healingType = classifyDestinationStyle(betterDestination.siteLink.id) === originalPair.destinationStyle ? "commercial_pair_upgrade" : "align_cta_to_destination";
    reason =
      input.conflicts?.summary[0] ??
      `${betterDestination.siteLink.label} had stronger support than the current destination for this platform and mode.`;
  } else if (
    !input.ctaBlocked &&
    !operatorLockedCta &&
    posture === "direct_conversion" &&
    strongCommercialSupport &&
    originalPair.destinationStyle === "direct" &&
    currentCtaIsSoft &&
    directVariant
  ) {
    nextPackage.selectedCtaId = directVariant.id;
    healingType = "strengthen_cta";
    reason = `${getPostingPlatformLabel(getPrimaryPlatform(input.signal))} already shows strong commercial support for this direct destination, so a clearer CTA is justified.`;
  }

  const healedPair = getPair(nextPackage);
  if (!healingType || JSON.stringify(healedPair) === JSON.stringify(originalPair)) {
    return {
      eligible: true,
      decision: "skipped",
      healingType: null,
      reason: null,
      summary: buildSummary({
        decision: "skipped",
        healingType: null,
        reason: null,
        blockReasons: [],
      }),
      blockReasons: [],
      originalPair,
      healedPair: originalPair,
      package: input.currentPackage,
    };
  }

  return {
    eligible: true,
    decision: "applied",
    healingType,
    reason,
    summary: buildSummary({
      decision: "applied",
      healingType,
      reason,
      blockReasons: [],
    }),
    blockReasons: [],
    originalPair,
    healedPair,
    package: nextPackage,
  };
}

export function buildCtaDestinationHealingInsights(input: {
  results: CtaDestinationHealingResult[];
  postedSignalIds?: Set<string>;
  signalIdsByResult?: Map<CtaDestinationHealingResult, string>;
}) : CtaDestinationHealingInsights {
  const applied = input.results.filter((result) => result.decision === "applied");
  const blocked = input.results.filter((result) => result.decision === "blocked");
  const healingTypeCounts = new Map<string, number>();
  const pairingCounts = new Map<string, number>();

  for (const result of applied) {
    if (result.healingType) {
      healingTypeCounts.set(result.healingType, (healingTypeCounts.get(result.healingType) ?? 0) + 1);
    }
    if (result.healedPair.destinationLabel && result.healedPair.ctaText !== undefined) {
      const pairing = `${result.healedPair.ctaText ?? "No CTA"} → ${result.healedPair.destinationLabel}`;
      pairingCounts.set(pairing, (pairingCounts.get(pairing) ?? 0) + 1);
    }
  }

  const healedPostedCount =
    input.postedSignalIds && input.signalIdsByResult
      ? applied.filter((result) => input.postedSignalIds?.has(input.signalIdsByResult?.get(result) ?? "")).length
      : 0;

  return {
    appliedCount: applied.length,
    blockedCount: blocked.length,
    skippedCount: input.results.filter((result) => result.decision === "skipped").length,
    healedPostedCount,
    topHealingTypes: [...healingTypeCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4),
    strongestPairings: [...pairingCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4),
  };
}
