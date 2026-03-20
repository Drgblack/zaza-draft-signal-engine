import { z } from "zod";

import type { NarrativeSequenceStepMatch } from "@/lib/narrative-sequences";
import type { PostingAssistantPackage } from "@/lib/posting-assistant";
import { getPostingPlatformLabel, type PostingPlatform } from "@/lib/posting-log";

export const DISTRIBUTION_ACTION_TYPES = [
  "prepare_post_package",
  "prepare_multi_platform_set",
  "prepare_reddit_version",
  "prepare_linkedin_version",
  "prepare_x_version",
  "prepare_comment_reply",
  "prepare_follow_up_message",
] as const;

export type DistributionActionType = (typeof DISTRIBUTION_ACTION_TYPES)[number];

export interface DistributionAction {
  actionId: string;
  actionType: DistributionActionType;
  targetPlatform: PostingPlatform | null;
  preparedContent: string;
  requiredOperatorStep: string;
  notes: string | null;
}

export interface DistributionBundle {
  bundleId: string;
  signalId: string;
  sourceTitle: string;
  reviewHref: string;
  packageIds: string[];
  platforms: PostingPlatform[];
  sequenceLabel: string | null;
  sequenceReason: string | null;
  suggestedCadenceNotes: string | null;
  checklist: string[];
  actions: DistributionAction[];
}

export interface DistributionSummary {
  readyCount: number;
  bundleCount: number;
  multiPlatformBundleCount: number;
  sequencedBundleCount: number;
  platformRows: Array<{
    platform: PostingPlatform;
    label: string;
    count: number;
  }>;
}

export const distributionPrepareRequestSchema = z.object({
  bundleId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  packageIds: z.array(z.string().trim().min(1)).min(1).max(8),
});

function platformOrder(platform: PostingPlatform) {
  switch (platform) {
    case "x":
      return 1;
    case "linkedin":
      return 2;
    case "reddit":
    default:
      return 3;
  }
}

function buildActionTypeForPlatform(platform: PostingPlatform): DistributionActionType {
  switch (platform) {
    case "linkedin":
      return "prepare_linkedin_version";
    case "reddit":
      return "prepare_reddit_version";
    case "x":
    default:
      return "prepare_x_version";
  }
}

function compactText(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function buildPostingPackageCopy(pkg: PostingAssistantPackage) {
  return [
    `Platform: ${getPostingPlatformLabel(pkg.platform)}`,
    `Hook: ${compactText(pkg.selectedHook, "No hook locked")}`,
    `CTA: ${compactText(pkg.selectedCta, "No CTA locked")}`,
    `Destination: ${compactText(pkg.selectedDestination?.label, "No destination locked")}`,
    `URL: ${compactText(pkg.finalUtmUrl ?? pkg.selectedDestination?.url, "No URL locked")}`,
    `Asset: ${compactText(pkg.selectedAssetLabel, "Text-first, no visual asset")}`,
    `Timing: ${compactText(pkg.timingSuggestion, "No timing suggestion")}`,
    "",
    pkg.finalCaption,
  ].join("\n");
}

function buildPlatformVariantCopy(pkg: PostingAssistantPackage) {
  return [
    pkg.finalCaption,
    "",
    `URL: ${compactText(pkg.finalUtmUrl ?? pkg.selectedDestination?.url, "No URL locked")}`,
    `CTA: ${compactText(pkg.selectedCta, "No CTA locked")}`,
  ].join("\n");
}

function buildCommentReply(pkg: PostingAssistantPackage) {
  return compactText(
    pkg.commentPrompt,
    "Reply to early comments with one grounded clarification and no extra pitch.",
  );
}

function buildFollowUpMessage(
  pkg: PostingAssistantPackage,
  sequence: NarrativeSequenceStepMatch | null | undefined,
) {
  if (sequence) {
    return [
      `Sequence: ${sequence.narrativeLabel}`,
      `Current step: ${sequence.stepNumber} of ${sequence.totalSteps} on ${getPostingPlatformLabel(pkg.platform)}`,
      `Next move: ${sequence.suggestedCadenceNotes}`,
    ].join("\n");
  }

  return [
    `Platform: ${getPostingPlatformLabel(pkg.platform)}`,
    `Timing note: ${compactText(pkg.timingSuggestion, "Publish when the audience is most responsive.")}`,
    `Follow-up note: ${buildCommentReply(pkg)}`,
  ].join("\n");
}

function buildChecklist(pkg: PostingAssistantPackage) {
  const checklist = [
    `Copy the ${getPostingPlatformLabel(pkg.platform)} caption and final URL.`,
    pkg.selectedAssetLabel
      ? `Attach ${pkg.selectedAssetLabel.toLowerCase()} before posting.`
      : "Confirm this is a text-first post before publishing.",
    pkg.altText ? "Paste the prepared alt text if the platform supports it." : null,
    pkg.commentPrompt ? "Keep the prepared comment prompt ready for the first follow-up reply." : null,
    pkg.timingSuggestion ? `Use the timing suggestion: ${pkg.timingSuggestion}` : null,
  ].filter((item): item is string => Boolean(item));

  return checklist;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sortPackages(packages: PostingAssistantPackage[]) {
  return [...packages].sort(
    (left, right) => platformOrder(left.platform) - platformOrder(right.platform),
  );
}

export function buildDistributionBundles(input: {
  packages: PostingAssistantPackage[];
  sequenceByPackageId?: Record<string, NarrativeSequenceStepMatch | null>;
}) {
  const stagedPackages = input.packages.filter((pkg) => pkg.status === "staged_for_posting");
  const groupedPackages = new Map<string, PostingAssistantPackage[]>();

  for (const pkg of stagedPackages) {
    groupedPackages.set(pkg.signalId, [...(groupedPackages.get(pkg.signalId) ?? []), pkg]);
  }

  return [...groupedPackages.entries()]
    .map(([signalId, packages]) => {
      const orderedPackages = sortPackages(packages);
      const sequence =
        orderedPackages
          .map((pkg) => input.sequenceByPackageId?.[pkg.packageId] ?? null)
          .find((candidate) => Boolean(candidate)) ?? null;
      const actions: DistributionAction[] = [];

      if (orderedPackages.length > 1) {
        actions.push({
          actionId: `${signalId}:multi-platform`,
          actionType: "prepare_multi_platform_set",
          targetPlatform: null,
          preparedContent: orderedPackages
            .map(
              (pkg) =>
                `${getPostingPlatformLabel(pkg.platform)}: ${compactText(
                  pkg.finalUtmUrl ?? pkg.selectedDestination?.url,
                  "No URL locked",
                )}`,
            )
            .join("\n"),
          requiredOperatorStep: "Move through the prepared platforms in order and post each manual-ready variant yourself.",
          notes: sequence ? sequence.suggestedCadenceNotes : "Keep the bundle manual and platform-specific. No scheduler is applied automatically.",
        });
      }

      for (const pkg of orderedPackages) {
        actions.push({
          actionId: `${pkg.packageId}:post-package`,
          actionType: "prepare_post_package",
          targetPlatform: pkg.platform,
          preparedContent: buildPostingPackageCopy(pkg),
          requiredOperatorStep: `Copy the full ${getPostingPlatformLabel(pkg.platform)} package into the posting flow manually.`,
          notes: pkg.readinessReason,
        });
        actions.push({
          actionId: `${pkg.packageId}:platform-variant`,
          actionType: buildActionTypeForPlatform(pkg.platform),
          targetPlatform: pkg.platform,
          preparedContent: buildPlatformVariantCopy(pkg),
          requiredOperatorStep: `Use this ${getPostingPlatformLabel(pkg.platform)}-ready variant when posting on platform.`,
          notes: pkg.selectedDestination?.label
            ? `Destination locked to ${pkg.selectedDestination.label}.`
            : "No destination is locked yet.",
        });
        actions.push({
          actionId: `${pkg.packageId}:comment-reply`,
          actionType: "prepare_comment_reply",
          targetPlatform: pkg.platform,
          preparedContent: buildCommentReply(pkg),
          requiredOperatorStep: "Keep this ready as the first comment or reply after the post goes live.",
          notes: pkg.commentPrompt ? "Derived from the publish-prep comment prompt." : "Fallback follow-up note because no comment prompt was locked.",
        });
        actions.push({
          actionId: `${pkg.packageId}:follow-up`,
          actionType: "prepare_follow_up_message",
          targetPlatform: pkg.platform,
          preparedContent: buildFollowUpMessage(pkg, input.sequenceByPackageId?.[pkg.packageId]),
          requiredOperatorStep: "Use this as the manual follow-up note for the next distribution step or reply pass.",
          notes: sequence ? sequence.sequenceReason : "No narrative sequence is attached, so the follow-up stays lightweight.",
        });
      }

      return {
        bundleId: `distribution-bundle:${signalId}`,
        signalId,
        sourceTitle: orderedPackages[0]?.sourceTitle ?? signalId,
        reviewHref: orderedPackages[0]?.reviewHref ?? `/signals/${signalId}/review`,
        packageIds: orderedPackages.map((pkg) => pkg.packageId),
        platforms: orderedPackages.map((pkg) => pkg.platform),
        sequenceLabel: sequence?.narrativeLabel ?? null,
        sequenceReason: sequence?.sequenceReason ?? null,
        suggestedCadenceNotes: sequence?.suggestedCadenceNotes ?? null,
        checklist: dedupeStrings(orderedPackages.flatMap((pkg) => buildChecklist(pkg))),
        actions,
      } satisfies DistributionBundle;
    })
    .sort(
      (left, right) =>
        right.platforms.length - left.platforms.length ||
        left.sourceTitle.localeCompare(right.sourceTitle),
    );
}

export function buildDistributionSummary(bundles: DistributionBundle[]): DistributionSummary {
  const platformCounts = new Map<PostingPlatform, number>();
  for (const bundle of bundles) {
    for (const platform of bundle.platforms) {
      platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
    }
  }

  const platformRows = [...platformCounts.entries()]
    .map(([platform, count]) => ({
      platform,
      count,
      label: getPostingPlatformLabel(platform),
    }))
    .sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label),
    );

  return {
    readyCount: bundles.reduce((total, bundle) => total + bundle.packageIds.length, 0),
    bundleCount: bundles.length,
    multiPlatformBundleCount: bundles.filter((bundle) => bundle.platforms.length > 1).length,
    sequencedBundleCount: bundles.filter((bundle) => Boolean(bundle.sequenceLabel)).length,
    platformRows,
  };
}
