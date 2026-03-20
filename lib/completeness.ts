import { buildSignalAssetBundle } from "@/lib/assets";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getPublishPrepPackageForPlatform,
  getSelectedCtaText,
} from "@/lib/publish-prep";
import type { SignalRecord } from "@/types/signal";

export type ApprovalPackageCompletenessState = "complete" | "mostly_complete" | "incomplete";

export interface ApprovalPackageChecklistItem {
  key: "draft" | "asset" | "cta" | "link" | "timing" | "review_status";
  label: string;
  ready: boolean;
}

export interface ApprovalPackageCompleteness {
  completenessScore: number;
  completenessState: ApprovalPackageCompletenessState;
  missingElements: string[];
  checklist: ApprovalPackageChecklistItem[];
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function getPrimaryPlatform(signal: SignalRecord): "x" | "linkedin" | "reddit" {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }

  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "x";
}

function getPlatformDraft(signal: SignalRecord, platform: "x" | "linkedin" | "reddit"): string | null {
  switch (platform) {
    case "x":
      return signal.finalXDraft ?? signal.xDraft;
    case "linkedin":
      return signal.finalLinkedInDraft ?? signal.linkedInDraft;
    case "reddit":
    default:
      return signal.finalRedditDraft ?? signal.redditDraft;
  }
}

function getPlatformReviewStatus(signal: SignalRecord, platform: "x" | "linkedin" | "reddit"): SignalRecord["xReviewStatus"] {
  switch (platform) {
    case "x":
      return signal.xReviewStatus;
    case "linkedin":
      return signal.linkedInReviewStatus;
    case "reddit":
    default:
      return signal.redditReviewStatus;
  }
}

function isLinkRelevant(signal: SignalRecord): boolean {
  return (
    signal.ctaGoal === "Visit site" ||
    signal.ctaGoal === "Sign up" ||
    signal.ctaGoal === "Try product" ||
    signal.funnelStage === "Consideration" ||
    signal.funnelStage === "Conversion"
  );
}

export function evaluateApprovalPackageCompleteness(input: {
  signal: SignalRecord;
  guidanceConfidenceLevel?: "high" | "moderate" | "low" | null;
}): ApprovalPackageCompleteness {
  const platform = getPrimaryPlatform(input.signal);
  const publishPrepBundle = buildSignalPublishPrepBundle(input.signal);
  const publishPrepPackage = getPublishPrepPackageForPlatform(publishPrepBundle, platform);
  const assetBundle = buildSignalAssetBundle(input.signal);
  const draftReady = Boolean(getPlatformDraft(input.signal, platform)?.trim());
  const assetReady = Boolean(
    input.signal.preferredAssetType ||
      input.signal.selectedImageAssetId ||
      input.signal.selectedVideoConceptId ||
      input.signal.imagePrompt ||
      input.signal.videoScript ||
      assetBundle?.imageAssets.length ||
      assetBundle?.videoConcepts.length,
  );
  const ctaReady = Boolean((publishPrepPackage ? getSelectedCtaText(publishPrepPackage) : null) || input.signal.ctaOrClosingLine);
  const linkReady = !isLinkRelevant(input.signal) || Boolean(publishPrepPackage && getPrimaryLinkVariant(publishPrepPackage)?.url);
  const timingReady = Boolean(publishPrepPackage?.suggestedPostingTime?.trim());
  const reviewStatusReady = Boolean(getPlatformReviewStatus(input.signal, platform));
  const publishPrepReady = Boolean(publishPrepPackage);
  const platformFitReady = Boolean(input.signal.platformPriority && publishPrepPackage);
  const confidenceReady = input.guidanceConfidenceLevel !== "low";

  const missingElements: string[] = [];
  if (!draftReady) {
    uniquePush(missingElements, "Final draft");
  }
  if (!publishPrepReady) {
    uniquePush(missingElements, "Publish prep");
  }
  if (!ctaReady) {
    uniquePush(missingElements, "CTA");
  }
  if (!linkReady) {
    uniquePush(missingElements, "Destination link");
  }
  if (!assetReady) {
    uniquePush(missingElements, "Asset recommendation");
  }
  if (!reviewStatusReady) {
    uniquePush(missingElements, "Final review status");
  }
  if (!platformFitReady) {
    uniquePush(missingElements, "Platform fit");
  }
  if (!confidenceReady) {
    uniquePush(missingElements, "Confidence unresolved");
  }

  const weightedChecks = [
    draftReady ? 2 : 0,
    publishPrepReady ? 2 : 0,
    ctaReady ? 1 : 0,
    linkReady ? 1 : 0,
    assetReady ? 1 : 0,
    timingReady ? 1 : 0,
    reviewStatusReady ? 1 : 0,
    platformFitReady ? 1 : 0,
    confidenceReady ? 1 : 0,
  ];
  const completenessScore = weightedChecks.reduce((total, value) => total + value, 0);
  const completenessState: ApprovalPackageCompletenessState =
    completenessScore >= 9
      ? "complete"
      : completenessScore >= 6
        ? "mostly_complete"
        : "incomplete";

  return {
    completenessScore,
    completenessState,
    missingElements,
    checklist: [
      { key: "draft", label: "Draft", ready: draftReady },
      { key: "asset", label: "Asset", ready: assetReady },
      { key: "cta", label: "CTA", ready: ctaReady },
      { key: "link", label: "Link", ready: linkReady },
      { key: "timing", label: "Timing", ready: timingReady },
      { key: "review_status", label: "Review status", ready: reviewStatusReady },
    ],
  };
}
