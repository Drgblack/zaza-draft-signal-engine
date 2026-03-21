import { evaluateAutonomyPolicy, type AutonomyPolicyDecision } from "@/lib/autonomy-policy";
import type { AttributionRecord } from "@/lib/attribution";
import type { AudienceMemoryState } from "@/lib/audience-memory";
import { evaluateApprovalPackageCompleteness, type ApprovalPackageCompleteness } from "@/lib/completeness";
import type { ConflictAssessment } from "@/lib/conflicts";
import type { ConversionIntentAssessment } from "@/lib/conversion-intent";
import {
  applyCtaDestinationSelfHealing,
  buildCtaDestinationHealingInsights,
  type CtaDestinationHealingResult,
} from "@/lib/cta-destination-healing";
import type { ManualExperiment } from "@/lib/experiments";
import { applyFounderVoiceToText, isFounderVoiceOn } from "@/lib/founder-voice";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getPublishPrepPackageForPlatform,
  parsePublishPrepBundle,
  stringifyPublishPrepBundle,
  type PublishPrepBundle,
  type PublishPrepPackage,
  type PublishPrepPlatform,
} from "@/lib/publish-prep";
import type { RevenueSignal } from "@/lib/revenue-signals";
import type { SignalRecord } from "@/types/signal";

export const PRE_REVIEW_REPAIR_TYPES = [
  "add_missing_utm",
  "improve_destination_choice",
  "soften_cta",
  "strengthen_cta",
  "switch_destination",
  "align_cta_to_destination",
  "align_destination_to_conversion_posture",
  "commercial_pair_upgrade",
  "add_alt_text",
  "add_comment_prompt",
  "founder_voice_cleanup",
  "fill_publish_prep_gap",
] as const;

export type PreReviewRepairType = (typeof PRE_REVIEW_REPAIR_TYPES)[number];

export interface PreReviewRepairItem {
  repairType: PreReviewRepairType;
  before: string;
  after: string;
  reason: string;
}

export interface PreReviewRepairResult {
  eligible: boolean;
  decision: "applied" | "skipped" | "blocked";
  policy: AutonomyPolicyDecision;
  signal: SignalRecord;
  repairs: PreReviewRepairItem[];
  ctaDestinationHealing: CtaDestinationHealingResult;
  summary: string;
  completenessBefore: ApprovalPackageCompleteness;
  completenessAfter: ApprovalPackageCompleteness;
}

function trimOrNull(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function getPrimaryPlatform(signal: SignalRecord): Extract<PublishPrepPlatform, "x" | "linkedin" | "reddit"> {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }
  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }
  return "x";
}

function getPrimaryDraftField(
  platform: Extract<PublishPrepPlatform, "x" | "linkedin" | "reddit">,
): "finalXDraft" | "finalLinkedInDraft" | "finalRedditDraft" | "xDraft" | "linkedInDraft" | "redditDraft" {
  switch (platform) {
    case "linkedin":
      return "finalLinkedInDraft";
    case "reddit":
      return "finalRedditDraft";
    case "x":
    default:
      return "finalXDraft";
  }
}

function getFallbackDraftField(
  platform: Extract<PublishPrepPlatform, "x" | "linkedin" | "reddit">,
): "xDraft" | "linkedInDraft" | "redditDraft" {
  switch (platform) {
    case "linkedin":
      return "linkedInDraft";
    case "reddit":
      return "redditDraft";
    case "x":
    default:
      return "xDraft";
  }
}

function hasActiveExperimentForField(
  signalId: string,
  experiments: ManualExperiment[] | undefined,
  types: Array<ManualExperiment["experimentType"]>,
): boolean {
  if (!experiments || types.length === 0) {
    return false;
  }

  return experiments.some(
    (experiment) =>
      experiment.status !== "completed" &&
      experiment.experimentType !== null &&
      types.includes(experiment.experimentType) &&
      experiment.variants.some((variant) => variant.linkedSignalIds.includes(signalId)),
  );
}

function addRepair(repairs: PreReviewRepairItem[], repair: PreReviewRepairItem) {
  if (
    repairs.some(
      (entry) =>
        entry.repairType === repair.repairType &&
        entry.before === repair.before &&
        entry.after === repair.after,
    )
  ) {
    return;
  }

  repairs.push(repair);
}

function hasUtmParams(url: string | null | undefined) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return ["utm_source", "utm_medium", "utm_campaign", "utm_content"].every((key) =>
      parsed.searchParams.has(key),
    );
  } catch {
    return false;
  }
}

function patchPrimaryPackage(input: {
  signal: SignalRecord;
  currentBundle: PublishPrepBundle | null;
  defaultBundle: PublishPrepBundle;
  repairs: PreReviewRepairItem[];
  conversionIntent?: ConversionIntentAssessment | null;
  conflicts?: Pick<ConflictAssessment, "topConflicts" | "summary"> | null;
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
  audienceMemory?: AudienceMemoryState | null;
  experiments?: ManualExperiment[];
}): { bundle: PublishPrepBundle; healing: CtaDestinationHealingResult } {
  const platform = getPrimaryPlatform(input.signal);
  const currentBundle = input.currentBundle ?? input.defaultBundle;
  const currentPackage = getPublishPrepPackageForPlatform(currentBundle, platform);
  const defaultPackage = getPublishPrepPackageForPlatform(input.defaultBundle, platform);

  if (!currentPackage || !defaultPackage) {
    return {
      bundle: currentBundle,
      healing: {
        eligible: false,
        decision: "blocked",
        healingType: null,
        reason: null,
        summary: "CTA/destination self-healing could not run because publish prep was missing.",
        blockReasons: ["Publish prep was missing."],
        originalPair: {
          ctaText: null,
          ctaStyle: "neutral",
          destinationId: null,
          destinationLabel: null,
          destinationStyle: "neutral",
        },
        healedPair: {
          ctaText: null,
          ctaStyle: "neutral",
          destinationId: null,
          destinationLabel: null,
          destinationStyle: "neutral",
        },
        package:
          currentPackage ??
          defaultPackage ?? {
            ...input.defaultBundle.packages[0]!,
          },
      },
    };
  }

  const nextPackage: PublishPrepPackage = {
    ...currentPackage,
    linkVariants: [...currentPackage.linkVariants],
  };

  if (
    input.currentBundle === null ||
    !trimOrNull(input.signal.publishPrepBundleJson) ||
    !getPublishPrepPackageForPlatform(input.currentBundle, platform)
  ) {
    addRepair(input.repairs, {
      repairType: "fill_publish_prep_gap",
      before: "Publish prep was missing or incomplete.",
      after: `${input.defaultBundle.packages.length} publish-prep packages prepared.`,
      reason: "The system could safely restore the default publish-prep structure from existing drafts and assets.",
    });
    return {
      bundle: input.defaultBundle,
      healing: applyCtaDestinationSelfHealing({
        signal: input.signal,
        currentPackage: defaultPackage,
        defaultPackage,
        conversionIntent: input.conversionIntent,
        conflicts: input.conflicts,
        attributionRecords: input.attributionRecords,
        revenueSignals: input.revenueSignals,
        audienceMemory: input.audienceMemory,
        ctaBlocked: hasActiveExperimentForField(input.signal.recordId, input.experiments, ["cta_variant_test"]),
        destinationBlocked: hasActiveExperimentForField(input.signal.recordId, input.experiments, ["destination_test"]),
      }),
    };
  }

  const ctaBlocked = hasActiveExperimentForField(input.signal.recordId, input.experiments, ["cta_variant_test"]);
  const destinationBlocked = hasActiveExperimentForField(input.signal.recordId, input.experiments, ["destination_test"]);

  const healing = applyCtaDestinationSelfHealing({
    signal: input.signal,
    currentPackage: nextPackage,
    defaultPackage,
    conversionIntent: input.conversionIntent,
    conflicts: input.conflicts,
    attributionRecords: input.attributionRecords,
    revenueSignals: input.revenueSignals,
    audienceMemory: input.audienceMemory,
    ctaBlocked,
    destinationBlocked,
  });

  if (healing.decision === "applied" && healing.healingType) {
    const beforePair = healing.originalPair;
    const afterPair = healing.healedPair;
    addRepair(input.repairs, {
      repairType:
        healing.healingType === "switch_destination"
          ? "switch_destination"
          : healing.healingType === "align_cta_to_destination"
            ? "align_cta_to_destination"
            : healing.healingType === "align_destination_to_conversion_posture"
              ? "align_destination_to_conversion_posture"
              : healing.healingType === "commercial_pair_upgrade"
                ? "commercial_pair_upgrade"
                : healing.healingType === "strengthen_cta"
                  ? "strengthen_cta"
                  : "soften_cta",
      before:
        healing.healingType === "soften_cta" || healing.healingType === "strengthen_cta" || healing.healingType === "align_cta_to_destination"
          ? beforePair.ctaText ?? "Current CTA"
          : beforePair.destinationLabel ?? "Current destination",
      after:
        healing.healingType === "soften_cta" || healing.healingType === "strengthen_cta" || healing.healingType === "align_cta_to_destination"
          ? afterPair.ctaText ?? "Updated CTA"
          : afterPair.destinationLabel ?? "Updated destination",
      reason: healing.reason ?? healing.summary,
    });
    Object.assign(nextPackage, healing.package);
  }

  const currentPrimaryLink = getPrimaryLinkVariant(nextPackage);
  const defaultPrimaryLink = getPrimaryLinkVariant(defaultPackage);

  if (
    defaultPrimaryLink &&
    currentPrimaryLink &&
    !hasUtmParams(currentPrimaryLink.url) &&
    hasUtmParams(defaultPrimaryLink.url) &&
    (currentPrimaryLink.siteLinkId ?? defaultPrimaryLink.siteLinkId)
  ) {
    nextPackage.siteLinkId = defaultPackage.siteLinkId;
    nextPackage.siteLinkLabel = defaultPackage.siteLinkLabel;
    nextPackage.siteLinkReason = nextPackage.siteLinkReason ?? defaultPackage.siteLinkReason;
    nextPackage.siteLinkUsedFallback = defaultPackage.siteLinkUsedFallback;
    nextPackage.linkVariants = defaultPackage.linkVariants;
    addRepair(input.repairs, {
      repairType: "add_missing_utm",
      before: currentPrimaryLink.url,
      after: defaultPrimaryLink.url,
      reason: "The selected destination was missing tracked UTM packaging, and the publish-prep default already had a safe tracked link.",
    });
  }

  if (!nextPackage.altText?.text?.trim() && defaultPackage.altText?.text?.trim()) {
    nextPackage.altText = defaultPackage.altText;
    addRepair(input.repairs, {
      repairType: "add_alt_text",
      before: "Missing alt text",
      after: defaultPackage.altText.text,
      reason: "The asset context already supported a safe alt-text fallback.",
    });
  }

  if (!nextPackage.commentPrompt?.text?.trim() && defaultPackage.commentPrompt?.text?.trim()) {
    nextPackage.commentPrompt = defaultPackage.commentPrompt;
    addRepair(input.repairs, {
      repairType: "add_comment_prompt",
      before: "Missing comment prompt",
      after: defaultPackage.commentPrompt.text,
      reason: "Publish prep already had a low-risk follow-up prompt for this platform.",
    });
  }

  if (JSON.stringify(nextPackage) === JSON.stringify(currentPackage)) {
    return {
      bundle: currentBundle,
      healing,
    };
  }

  return {
    bundle: {
      ...currentBundle,
      primaryPlatform: currentBundle.primaryPlatform ?? input.defaultBundle.primaryPlatform,
      packages: currentBundle.packages.map((pkg) => (pkg.id === currentPackage.id ? nextPackage : pkg)),
    },
    healing,
  };
}

function applyFounderVoiceCleanup(
  signal: SignalRecord,
  repairs: PreReviewRepairItem[],
): SignalRecord {
  if (!isFounderVoiceOn(signal.founderVoiceMode) || signal.finalReviewStartedAt || signal.finalReviewedAt) {
    return signal;
  }

  const platform = getPrimaryPlatform(signal);
  const draftField = getPrimaryDraftField(platform);
  const fallbackField = getFallbackDraftField(platform);
  const currentDraft = trimOrNull(signal[draftField]) ?? trimOrNull(signal[fallbackField]);
  if (!currentDraft) {
    return signal;
  }

  const cleanedDraft = applyFounderVoiceToText(currentDraft, signal.founderVoiceMode);
  if (!cleanedDraft || cleanedDraft === currentDraft) {
    return signal;
  }

  addRepair(repairs, {
    repairType: "founder_voice_cleanup",
    before: currentDraft,
    after: cleanedDraft,
    reason: "Minor founder-voice cleanup removed hypey or overly promotional language without changing the core message.",
  });

  return {
    ...signal,
    [draftField]: cleanedDraft,
  };
}

function buildSummary(
  decision: PreReviewRepairResult["decision"],
  repairs: PreReviewRepairItem[],
  policy: AutonomyPolicyDecision,
  healing: CtaDestinationHealingResult,
) {
  if (decision === "blocked") {
    return policy.summary;
  }
  if (repairs.length === 0) {
    return healing.decision === "applied" || healing.decision === "blocked"
      ? healing.summary
      : "No low-risk pre-review repair was needed.";
  }
  const repairSummary = `Auto-repaired before review: ${repairs
    .slice(0, 3)
    .map((repair) => repair.repairType.replaceAll("_", " "))
    .join(" + ")}.`;
  return healing.decision === "applied" ? `${healing.summary} ${repairSummary}` : repairSummary;
}

export function applyPreReviewRepairs(input: {
  signal: SignalRecord;
  guidanceConfidenceLevel: "high" | "moderate" | "low";
  automationConfidenceLevel: "high" | "medium" | "low";
  completeness: ApprovalPackageCompleteness;
  conflicts?: ConflictAssessment | null;
  conversionIntent?: ConversionIntentAssessment | null;
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
  audienceMemory?: AudienceMemoryState | null;
  experiments?: ManualExperiment[];
}): PreReviewRepairResult {
  const completenessBefore = input.completeness;
  const policy = evaluateAutonomyPolicy({
    actionType: "auto_repair",
    confidenceLevel: input.automationConfidenceLevel,
    completenessState:
      completenessBefore.completenessState === "complete" || completenessBefore.completenessState === "mostly_complete"
        ? completenessBefore.completenessState
        : "incomplete",
    hasUnresolvedConflicts: (input.conflicts?.conflicts.length ?? 0) > 0,
    experimentLinked: false,
  });
  const emptyHealing: CtaDestinationHealingResult = {
    eligible: false,
    decision: "blocked",
    healingType: null,
    reason: null,
    summary: "CTA/destination self-healing did not run.",
    blockReasons: ["Pre-review repair did not run."],
    originalPair: {
      ctaText: null,
      ctaStyle: "neutral",
      destinationId: null,
      destinationLabel: null,
      destinationStyle: "neutral",
    },
    healedPair: {
      ctaText: null,
      ctaStyle: "neutral",
      destinationId: null,
      destinationLabel: null,
      destinationStyle: "neutral",
    },
    package: buildSignalPublishPrepBundle(input.signal)?.packages[0] ?? {
      id: "repair-fallback",
      targetId: "repair-fallback",
      outputKind: "primary_draft",
      platform: "linkedin",
      outputLabel: null,
      primaryHook: null,
      selectedHookId: null,
      hookVariants: [],
      primaryCta: null,
      selectedCtaId: null,
      ctaVariants: [],
      hashtagsOrKeywords: { id: "repair-fallback", items: [] },
      altText: null,
      commentPrompt: null,
      suggestedPostingTime: null,
      siteLinkId: null,
      siteLinkLabel: null,
      siteLinkReason: null,
      siteLinkUsedFallback: false,
      linkVariants: [],
      notes: null,
    },
  };

  if (input.guidanceConfidenceLevel !== "high") {
    return {
      eligible: false,
      decision: "blocked",
      policy: {
        ...policy,
        decision: "block",
        reasons: ["Only high-guidance-confidence items can use pre-review repair."],
        summary: "Only high-guidance-confidence items can use pre-review repair.",
      },
      signal: input.signal,
      repairs: [],
      ctaDestinationHealing: emptyHealing,
      summary: "Only high-guidance-confidence items can use pre-review repair.",
      completenessBefore,
      completenessAfter: completenessBefore,
    };
  }

  if (
    policy.decision !== "allow" ||
    input.signal.finalReviewStartedAt ||
    input.signal.finalReviewedAt
  ) {
    return {
      eligible: false,
      decision: "blocked",
      policy,
      signal: input.signal,
      repairs: [],
      ctaDestinationHealing: emptyHealing,
      summary: buildSummary("blocked", [], policy, emptyHealing),
      completenessBefore,
      completenessAfter: completenessBefore,
    };
  }

  const repairs: PreReviewRepairItem[] = [];
  let nextSignal = { ...input.signal };
  const defaultBundle = buildSignalPublishPrepBundle(nextSignal);
  const currentBundle = parsePublishPrepBundle(nextSignal.publishPrepBundleJson);
  let ctaDestinationHealing = emptyHealing;

  if (defaultBundle) {
    const nextBundleResult = patchPrimaryPackage({
      signal: nextSignal,
      currentBundle,
      defaultBundle,
      repairs,
      conversionIntent: input.conversionIntent,
      conflicts: input.conflicts,
      attributionRecords: input.attributionRecords,
      revenueSignals: input.revenueSignals,
      audienceMemory: input.audienceMemory,
      experiments: input.experiments,
    });
    ctaDestinationHealing = nextBundleResult.healing;
    if (JSON.stringify(nextBundleResult.bundle) !== JSON.stringify(currentBundle ?? null) || !nextSignal.publishPrepBundleJson) {
      nextSignal = {
        ...nextSignal,
        publishPrepBundleJson: stringifyPublishPrepBundle(nextBundleResult.bundle),
      };
    }
  }

  nextSignal = applyFounderVoiceCleanup(nextSignal, repairs);

  const completenessAfter = evaluateApprovalPackageCompleteness({
    signal: nextSignal,
    guidanceConfidenceLevel: input.guidanceConfidenceLevel,
  });

  return {
    eligible: true,
    decision: repairs.length > 0 ? "applied" : "skipped",
    policy,
    signal: nextSignal,
    repairs,
    ctaDestinationHealing,
    summary: buildSummary(repairs.length > 0 ? "applied" : "skipped", repairs, policy, ctaDestinationHealing),
    completenessBefore,
    completenessAfter,
  };
}

export function buildPreReviewRepairInsights(
  results: PreReviewRepairResult[],
  postedSignalIds?: Set<string>,
) {
  const applied = results.filter((result) => result.decision === "applied");
  const blocked = results.filter((result) => result.decision === "blocked");
  const repairCounts = new Map<string, number>();

  for (const result of applied) {
    for (const repair of result.repairs) {
      repairCounts.set(repair.repairType, (repairCounts.get(repair.repairType) ?? 0) + 1);
    }
  }

  const repairedPostedCount = postedSignalIds
    ? applied.filter((result) => postedSignalIds.has(result.signal.recordId)).length
    : 0;

  return {
    appliedCount: applied.length,
    blockedCount: blocked.length,
    skippedCount: results.filter((result) => result.decision === "skipped").length,
    repairedPostedCount,
    topRepairTypes: [...repairCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4),
  };
}

export function buildPreReviewHealingInsights(
  results: PreReviewRepairResult[],
  postedSignalIds?: Set<string>,
) {
  const signalIdsByResult = new Map<CtaDestinationHealingResult, string>();
  for (const result of results) {
    signalIdsByResult.set(result.ctaDestinationHealing, result.signal.recordId);
  }

  return buildCtaDestinationHealingInsights({
    results: results.map((result) => result.ctaDestinationHealing),
    postedSignalIds,
    signalIdsByResult,
  });
}
