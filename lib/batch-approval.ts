import { z } from "zod";

import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import { buildAssetBundleSummary, buildSignalAssetBundle } from "@/lib/assets";
import type { ExperimentType } from "@/lib/experiments";
import {
  buildPublishPrepBundleSummary,
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getSelectedCtaText,
  getSelectedHookText,
  type PublishPrepPackage,
} from "@/lib/publish-prep";
import { buildRepurposingBundleSummary, buildSignalRepurposingBundle } from "@/lib/repurposing";
import { reviewMacroIdSchema } from "@/lib/review-macros";
import { getPostingPlatformLabel, type PostingPlatform } from "@/lib/posting-memory";

export const batchApprovalActionRequestSchema = z.object({
  signalId: z.string().trim().min(1),
  action: z.enum(["approve", "hold", "skip", "convert_to_experiment"]),
  platform: z.enum(["x", "linkedin", "reddit"]),
  finalDraft: z.string().trim().nullable().optional(),
  publishPrepBundleJson: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  macroId: reviewMacroIdSchema.optional(),
  experimentType: z
    .enum([
      "hook_variant_test",
      "cta_variant_test",
      "destination_test",
      "editorial_mode_test",
      "platform_expression_test",
      "pattern_vs_no_pattern_test",
    ])
    .optional(),
});

type PrimaryPublishPrepPackage = PublishPrepPackage & {
  outputKind: "primary_draft";
  platform: PostingPlatform;
};

export interface BatchApprovalItem {
  signalId: string;
  sourceTitle: string;
  reviewHref: string;
  platform: PostingPlatform;
  platformLabel: string;
  editorialMode: string | null;
  automationConfidenceLevel: ApprovalQueueCandidate["automationConfidence"]["level"];
  automationConfidenceSummary: ApprovalQueueCandidate["automationConfidence"]["summary"];
  expectedOutcomeTier: ApprovalQueueCandidate["expectedOutcome"]["expectedOutcomeTier"];
  completenessState: ApprovalQueueCandidate["completeness"]["completenessState"];
  completenessScore: number;
  strongestRationale: string;
  caution: string | null;
  draftPreview: string;
  ctaSummary: string | null;
  destinationLabel: string | null;
  destinationUrl: string | null;
  timingSuggestion: string | null;
  hookSummary: string | null;
  assetSummary: string;
  repurposingSummary: string | null;
  publishPrepSummary: string | null;
  packageAutofillNotes: string[];
  rationale: string[];
  primaryPackageId: string;
  selectedHookId: string | null;
  selectedCtaId: string | null;
  selectedLinkValue: string | null;
  hookOptions: Array<{ id: string; text: string }>;
  ctaOptions: Array<{ id: string; text: string }>;
  linkOptions: Array<{ value: string; label: string; url: string }>;
  timingOptions: string[];
  publishPrepBundleJson: string | null;
  suggestedExperimentType: ExperimentType;
}

export interface BatchApprovalPrep {
  batchId: string;
  candidateIds: string[];
  generatedAt: string;
  rationale: string[];
  completenessSummary: string;
  ordering: string[];
  items: BatchApprovalItem[];
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function getPrimaryPlatform(signal: ApprovalQueueCandidate["signal"]): PostingPlatform {
  if (signal.platformPriority === "X First") {
    return "x";
  }

  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "linkedin";
}

function getPrimaryDraft(signal: ApprovalQueueCandidate["signal"], platform: PostingPlatform): string {
  switch (platform) {
    case "x":
      return signal.finalXDraft ?? signal.xDraft ?? "";
    case "linkedin":
      return signal.finalLinkedInDraft ?? signal.linkedInDraft ?? "";
    case "reddit":
    default:
      return signal.finalRedditDraft ?? signal.redditDraft ?? "";
  }
}

function getPrimaryPackage(signal: ApprovalQueueCandidate["signal"], platform: PostingPlatform): PrimaryPublishPrepPackage | null {
  const bundle = buildSignalPublishPrepBundle(signal);
  return bundle?.packages.find(
    (pkg): pkg is PrimaryPublishPrepPackage =>
      pkg.outputKind === "primary_draft" && pkg.platform === platform,
  ) ?? null;
}

function getSuggestedExperimentType(pkg: PrimaryPublishPrepPackage | null): ExperimentType {
  if ((pkg?.ctaVariants.length ?? 0) > 1) {
    return "cta_variant_test";
  }
  if ((pkg?.linkVariants.length ?? 0) > 1) {
    return "destination_test";
  }
  if ((pkg?.hookVariants.length ?? 0) > 1) {
    return "hook_variant_test";
  }

  return "platform_expression_test";
}

function buildTimingOptions(pkg: PrimaryPublishPrepPackage | null): string[] {
  const options = [
    pkg?.suggestedPostingTime ?? null,
    "Today, mid-morning",
    "Tomorrow morning",
    "This afternoon",
    "Early next week",
  ];

  return Array.from(new Set(options.filter((value): value is string => Boolean(value && value.trim().length > 0))));
}

function toBatchItem(candidate: ApprovalQueueCandidate, strategy: CampaignStrategy): BatchApprovalItem | null {
  const signal = candidate.signal;
  const platform = getPrimaryPlatform(signal);
  const pkg = getPrimaryPackage(signal, platform);
  if (!pkg) {
    return null;
  }

  const context = getSignalContentContextSummary(signal, strategy);
  const primaryLink = getPrimaryLinkVariant(pkg);
  const assetSummary =
    buildAssetBundleSummary(buildSignalAssetBundle(signal))?.summary ??
    (signal.preferredAssetType === "image"
      ? "Image-first"
      : signal.preferredAssetType === "video"
        ? "Video-first"
        : "Text-first");
  const repurposingSummary = buildRepurposingBundleSummary(buildSignalRepurposingBundle(signal));
  const publishPrepSummary = buildPublishPrepBundleSummary(buildSignalPublishPrepBundle(signal));

  return {
    signalId: signal.recordId,
    sourceTitle: signal.sourceTitle,
    reviewHref: `/signals/${signal.recordId}/review`,
    platform,
    platformLabel: getPostingPlatformLabel(platform),
    editorialMode: signal.editorialMode,
    automationConfidenceLevel: candidate.automationConfidence.level,
    automationConfidenceSummary: candidate.automationConfidence.summary,
    expectedOutcomeTier: candidate.expectedOutcome.expectedOutcomeTier,
    completenessState: candidate.completeness.completenessState,
    completenessScore: candidate.completeness.completenessScore,
    strongestRationale: candidate.rankReasons[0] ?? candidate.expectedOutcome.expectedOutcomeReasons[0] ?? "Strong candidate support surfaced.",
    caution:
      candidate.assessment.strongestCaution ??
      candidate.expectedOutcome.riskSignals[0] ??
      candidate.guidance.cautionNotes[0] ??
      candidate.fatigue.warnings[0]?.summary ??
      null,
    draftPreview: getPrimaryDraft(signal, platform),
    ctaSummary: getSelectedCtaText(pkg),
    destinationLabel: primaryLink?.label ?? null,
    destinationUrl: primaryLink?.url ?? null,
    timingSuggestion: pkg.suggestedPostingTime,
    hookSummary: getSelectedHookText(pkg),
    assetSummary,
    repurposingSummary: repurposingSummary ? `${repurposingSummary.count} variants · ${repurposingSummary.primaryPlatformLabel ?? "mixed"}` : null,
    publishPrepSummary: publishPrepSummary ? `${publishPrepSummary.packageCount} packages ready` : null,
    packageAutofillNotes: candidate.packageAutofill.notes.map((note) => `${note.label}: ${note.value}`),
    rationale: [
      ...candidate.rankReasons,
      ...(context.campaignName ? [`Campaign: ${context.campaignName}`] : []),
      ...(context.pillarName ? [`Pillar: ${context.pillarName}`] : []),
    ].slice(0, 4),
    primaryPackageId: pkg.id,
    selectedHookId: pkg.selectedHookId,
    selectedCtaId: pkg.selectedCtaId,
    selectedLinkValue: primaryLink ? `${primaryLink.url}|||${primaryLink.label}` : null,
    hookOptions: pkg.hookVariants.map((variant) => ({ id: variant.id, text: variant.text })),
    ctaOptions: pkg.ctaVariants.map((variant) => ({ id: variant.id, text: variant.text })),
    linkOptions: pkg.linkVariants.map((variant) => ({
      value: `${variant.url}|||${variant.label}`,
      label: variant.label,
      url: variant.url,
    })),
    timingOptions: buildTimingOptions(pkg),
    publishPrepBundleJson: signal.publishPrepBundleJson,
    suggestedExperimentType: getSuggestedExperimentType(pkg),
  };
}

function adjustedSelectionScore(
  candidate: ApprovalQueueCandidate,
  strategy: CampaignStrategy,
  selected: BatchApprovalItem[],
): number {
  const context = getSignalContentContextSummary(candidate.signal, strategy);
  const platform = getPrimaryPlatform(candidate.signal);
  let score = candidate.rankScore;

  if (selected.some((item) => item.platform === platform)) {
    score -= 1;
  }

  if (context.pillarName && selected.some((item) => item.rationale.some((reason) => reason === `Pillar: ${context.pillarName}`))) {
    score -= 2;
  }

  if (context.campaignName && selected.some((item) => item.rationale.some((reason) => reason === `Campaign: ${context.campaignName}`))) {
    score -= 1;
  }

  if (
    candidate.signal.editorialMode &&
    selected.some(
      (item) =>
        item.signalId !== candidate.signal.recordId &&
        item.editorialMode &&
        item.editorialMode === candidate.signal.editorialMode,
    )
  ) {
    score -= 1;
  }

  if (candidate.fatigue.warnings[0]) {
    score -= candidate.fatigue.warnings[0].severity === "moderate" ? 1 : 0.5;
  }

  return score;
}

export function buildBatchApprovalPrep(input: {
  candidates: ApprovalQueueCandidate[];
  strategy: CampaignStrategy;
  minItems?: number;
  maxItems?: number;
}): BatchApprovalPrep {
  const maxItems = Math.min(5, Math.max(3, input.maxItems ?? 5));
  const ranked = [...input.candidates].sort(
    (left, right) => right.rankScore - left.rankScore || left.signal.sourceTitle.localeCompare(right.signal.sourceTitle),
  );
  const eligibleCandidates = ranked.filter((candidate) => candidate.automationConfidence.allowBatchInclusion);
  const selected: ApprovalQueueCandidate[] = [];
  const selectedItems: BatchApprovalItem[] = [];

  while (selected.length < Math.min(maxItems, eligibleCandidates.length)) {
    const remaining = eligibleCandidates.filter(
      (candidate) => !selected.some((item) => item.signal.recordId === candidate.signal.recordId),
    );
    if (remaining.length === 0) {
      break;
    }

    const next = [...remaining].sort(
      (left, right) =>
        adjustedSelectionScore(right, input.strategy, selectedItems) - adjustedSelectionScore(left, input.strategy, selectedItems) ||
        right.rankScore - left.rankScore,
    )[0];
    selected.push(next);
    const item = toBatchItem(next, input.strategy);
    if (item) {
      selectedItems.push(item);
    }
  }

  const generatedAt = new Date().toISOString();
  const rationale: string[] = [];
  for (const item of selectedItems) {
    uniquePush(rationale, item.strongestRationale);
  }

  const completeCount = selectedItems.filter((item) => item.completenessState === "complete").length;
  const mostlyCompleteCount = selectedItems.filter((item) => item.completenessState === "mostly_complete").length;

  return {
    batchId: `batch-approval-${generatedAt}`,
    candidateIds: selectedItems.map((item) => item.signalId),
    generatedAt,
    rationale: rationale.slice(0, 4),
    completenessSummary: `${completeCount} complete · ${mostlyCompleteCount} mostly complete`,
    ordering: ["expected value", "completeness", "automation confidence", "batch balance"],
    items: selectedItems,
  };
}
