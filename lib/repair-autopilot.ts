import type { AutonomyPolicyDecision } from "@/lib/autonomy-policy";
import {
  assignSignalContentContext,
  type CampaignStrategy,
} from "@/lib/campaigns";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getPublishPrepPackageForPlatform,
  getSelectedCtaText,
  parsePublishPrepBundle,
  stringifyPublishPrepBundle,
  type PublishPrepPackage,
  type PublishPrepPlatform,
} from "@/lib/publish-prep";
import { getRepairAutopilotLearningAdjustmentSync } from "@/lib/learning-loop";
import type { SignalRecord } from "@/types/signal";

export const REPAIR_AUTOPILOT_FIXES = [
  "add_default_utm",
  "apply_fallback_cta",
  "generate_placeholder_alt_text",
  "normalize_minor_tone",
  "choose_default_destination",
  "fill_campaign_metadata_defaults",
] as const;

export type RepairAutopilotFix = (typeof REPAIR_AUTOPILOT_FIXES)[number];

export type RepairResult = {
  appliedFixes: string[];
  skippedFixes: string[];
};

export interface RepairAutopilotInput {
  signal: SignalRecord;
  autonomyPolicy: Pick<AutonomyPolicyDecision, "allowAutoProceed" | "riskLevel">;
  strategy?: CampaignStrategy | null;
}

function trimOrNull(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function getPrimaryPlatform(
  signal: SignalRecord,
): Extract<PublishPrepPlatform, "x" | "linkedin" | "reddit"> {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }
  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }
  return "x";
}

function hasUtmParams(url: string | null | undefined) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return ["utm_source", "utm_medium", "utm_campaign", "utm_content"].every(
      (key) => parsed.searchParams.has(key),
    );
  } catch {
    return false;
  }
}

function withUtmParameters(
  url: string,
  utmParameters: Record<string, string | null | undefined>,
) {
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(utmParameters)) {
      if (value) {
        parsed.searchParams.set(key, value);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function isWeakCta(text: string | null | undefined) {
  const normalized = trimOrNull(text)?.toLowerCase() ?? "";
  if (!normalized) {
    return true;
  }

  const genericCtas = new Set([
    "learn more",
    "click here",
    "read more",
    "check it out",
    "link in bio",
  ]);

  return genericCtas.has(normalized) || normalized.split(/\s+/).length < 3;
}

function isToneNormalizationNeeded(text: string | null | undefined) {
  const normalized = trimOrNull(text);
  if (!normalized) {
    return false;
  }

  return (
    normalized !== text ||
    /!{2,}/.test(normalized) ||
    /\?{2,}/.test(normalized) ||
    /\s{2,}/.test(normalized) ||
    /^[A-Z0-9\s'",.!?-]+$/.test(normalized)
  );
}

function normalizeMinorTone(text: string | null | undefined) {
  const normalized = trimOrNull(text);
  if (!normalized) {
    return null;
  }

  let next = normalized
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/!{2,}/g, ".")
    .replace(/\?{2,}/g, "?");

  if (/^[A-Z0-9\s'",.!?-]+$/.test(next)) {
    const lower = next.toLowerCase();
    next = `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
  }

  if (next.endsWith("!")) {
    next = `${next.slice(0, -1)}.`;
  }

  return next;
}

function buildPlaceholderAltText(signal: SignalRecord, platform: PublishPrepPlatform) {
  const subject =
    trimOrNull(signal.teacherPainPoint) ??
    trimOrNull(signal.contentAngle) ??
    trimOrNull(signal.sourceTitle) ??
    "teacher communication guidance";
  const platformLabel =
    platform === "linkedin"
      ? "LinkedIn"
      : platform === "reddit"
        ? "Reddit"
        : "X";

  return `Illustration for ${platformLabel} post about ${subject.toLowerCase()}.`;
}

function clonePackage<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pushApplied(result: RepairResult, fix: RepairAutopilotFix) {
  if (!result.appliedFixes.includes(fix)) {
    result.appliedFixes.push(fix);
  }
  result.skippedFixes = result.skippedFixes.filter((entry) => entry !== fix);
}

function pushSkipped(result: RepairResult, fix: RepairAutopilotFix) {
  if (
    !result.appliedFixes.includes(fix) &&
    !result.skippedFixes.includes(fix)
  ) {
    result.skippedFixes.push(fix);
  }
}

function syncPrimaryCta(nextPackage: PublishPrepPackage, text: string) {
  nextPackage.primaryCta = text;
  const selectedVariant =
    nextPackage.ctaVariants.find((variant) => variant.id === nextPackage.selectedCtaId) ??
    nextPackage.ctaVariants[0] ??
    null;

  if (selectedVariant) {
    selectedVariant.text = text;
    nextPackage.selectedCtaId = selectedVariant.id;
    return;
  }

  const variantId = `${nextPackage.id}-cta-autopilot`;
  nextPackage.ctaVariants = [
    {
      id: variantId,
      text,
      goalLabel: "campaign default",
    },
  ];
  nextPackage.selectedCtaId = variantId;
}

export function runRepairAutopilot(input: RepairAutopilotInput): RepairResult {
  const result: RepairResult = {
    appliedFixes: [],
    skippedFixes: [],
  };

  if (
    !input.autonomyPolicy.allowAutoProceed ||
    input.autonomyPolicy.riskLevel !== "low"
  ) {
    for (const fix of REPAIR_AUTOPILOT_FIXES) {
      pushSkipped(result, fix);
    }
    return result;
  }

  if (input.strategy) {
    const contextBefore = {
      campaignId: input.signal.campaignId,
      pillarId: input.signal.pillarId,
      audienceSegmentId: input.signal.audienceSegmentId,
      funnelStage: input.signal.funnelStage,
      ctaGoal: input.signal.ctaGoal,
    };
    const assignment = assignSignalContentContext(
      input.signal,
      input.strategy,
      contextBefore,
    );

    if (assignment.autoAssignedKeys.length > 0) {
      input.signal.campaignId = assignment.context.campaignId;
      input.signal.pillarId = assignment.context.pillarId;
      input.signal.audienceSegmentId = assignment.context.audienceSegmentId;
      input.signal.funnelStage = assignment.context.funnelStage;
      input.signal.ctaGoal = assignment.context.ctaGoal;
      pushApplied(result, "fill_campaign_metadata_defaults");
    } else {
      pushSkipped(result, "fill_campaign_metadata_defaults");
    }
  } else {
    pushSkipped(result, "fill_campaign_metadata_defaults");
  }

  const platform = getPrimaryPlatform(input.signal);
  const defaultBundle = buildSignalPublishPrepBundle(input.signal);
  if (!defaultBundle) {
    for (const fix of REPAIR_AUTOPILOT_FIXES.filter(
      (entry) => entry !== "fill_campaign_metadata_defaults",
    )) {
      pushSkipped(result, fix);
    }
    return result;
  }

  const parsedCurrentBundle = parsePublishPrepBundle(
    input.signal.publishPrepBundleJson,
  );
  const currentPackage = parsedCurrentBundle
    ? getPublishPrepPackageForPlatform(parsedCurrentBundle, platform)
    : null;
  const defaultPackage = getPublishPrepPackageForPlatform(defaultBundle, platform);

  if (!defaultPackage) {
    for (const fix of REPAIR_AUTOPILOT_FIXES.filter(
      (entry) => entry !== "fill_campaign_metadata_defaults",
    )) {
      pushSkipped(result, fix);
    }
    return result;
  }

  const nextBundle = clonePackage(parsedCurrentBundle ?? defaultBundle);
  let nextPackage = getPublishPrepPackageForPlatform(nextBundle, platform);
  if (!nextPackage) {
    nextBundle.packages = [...nextBundle.packages, clonePackage(defaultPackage)];
    nextPackage =
      getPublishPrepPackageForPlatform(nextBundle, platform) ??
      nextBundle.packages.at(-1)!;
  }
  const currentPrimaryLink = currentPackage
    ? getPrimaryLinkVariant(currentPackage)
    : null;
  const defaultPrimaryLink = getPrimaryLinkVariant(defaultPackage);
  const currentCta = currentPackage ? getSelectedCtaText(currentPackage) : null;
  const defaultCta = getSelectedCtaText(defaultPackage);
  const currentAltText = currentPackage?.altText?.text ?? null;
  const currentKeywords = currentPackage?.hashtagsOrKeywords.items ?? [];
  const defaultKeywords = defaultPackage.hashtagsOrKeywords.items;
  const learningAdjustment = getRepairAutopilotLearningAdjustmentSync({
    platform,
  });

  if (!trimOrNull(currentPrimaryLink?.url) && defaultPrimaryLink) {
    nextPackage.siteLinkId = defaultPackage.siteLinkId;
    nextPackage.siteLinkLabel = defaultPackage.siteLinkLabel;
    nextPackage.siteLinkReason = defaultPackage.siteLinkReason;
    nextPackage.siteLinkUsedFallback = defaultPackage.siteLinkUsedFallback;
    nextPackage.linkVariants = clonePackage(defaultPackage.linkVariants);
    pushApplied(result, "choose_default_destination");
  } else {
    pushSkipped(result, "choose_default_destination");
  }

  const nextPrimaryLink = getPrimaryLinkVariant(nextPackage);
  if (
    nextPrimaryLink?.url &&
    !hasUtmParams(nextPrimaryLink.url) &&
    defaultPrimaryLink?.utmParameters
  ) {
    nextPrimaryLink.url = withUtmParameters(
      nextPrimaryLink.url,
      defaultPrimaryLink.utmParameters,
    );
    nextPrimaryLink.utmParameters = clonePackage(defaultPrimaryLink.utmParameters);
    pushApplied(result, "add_default_utm");
  } else {
    pushSkipped(result, "add_default_utm");
  }

  if (
    !learningAdjustment.useConservativeTextDefaults &&
    isWeakCta(currentCta) &&
    trimOrNull(defaultCta)
  ) {
    syncPrimaryCta(nextPackage, trimOrNull(defaultCta)!);
    if (isWeakCta(input.signal.ctaOrClosingLine)) {
      input.signal.ctaOrClosingLine = trimOrNull(defaultCta);
    }
    pushApplied(result, "apply_fallback_cta");
  } else {
    pushSkipped(result, "apply_fallback_cta");
  }

  if (!trimOrNull(currentAltText)) {
    nextPackage.altText = trimOrNull(defaultPackage.altText?.text)
      ? clonePackage(defaultPackage.altText)
      : { text: buildPlaceholderAltText(input.signal, platform) };
    pushApplied(result, "generate_placeholder_alt_text");
  } else {
    pushSkipped(result, "generate_placeholder_alt_text");
  }

  const toneTargetBefore =
    trimOrNull(getSelectedCtaText(nextPackage)) ??
    trimOrNull(input.signal.ctaOrClosingLine);
  const normalizedTone = normalizeMinorTone(toneTargetBefore);
  if (
    !learningAdjustment.useConservativeTextDefaults &&
    normalizedTone &&
    toneTargetBefore &&
    isToneNormalizationNeeded(toneTargetBefore) &&
    normalizedTone !== toneTargetBefore
  ) {
    syncPrimaryCta(nextPackage, normalizedTone);
    if (trimOrNull(input.signal.ctaOrClosingLine)) {
      input.signal.ctaOrClosingLine = normalizedTone;
    }
    pushApplied(result, "normalize_minor_tone");
  } else {
    pushSkipped(result, "normalize_minor_tone");
  }

  let metadataUpdated = false;
  if (currentKeywords.length === 0 && defaultKeywords.length > 0) {
    nextPackage.hashtagsOrKeywords = clonePackage(defaultPackage.hashtagsOrKeywords);
    metadataUpdated = true;
  }

  if (!trimOrNull(input.signal.hashtagsOrKeywords) && defaultKeywords.length > 0) {
    input.signal.hashtagsOrKeywords = defaultKeywords.join(", ");
    metadataUpdated = true;
  }

  if (metadataUpdated) {
    pushApplied(result, "fill_campaign_metadata_defaults");
  } else if (!result.appliedFixes.includes("fill_campaign_metadata_defaults")) {
    pushSkipped(result, "fill_campaign_metadata_defaults");
  }

  input.signal.publishPrepBundleJson = stringifyPublishPrepBundle(nextBundle);

  return result;
}
