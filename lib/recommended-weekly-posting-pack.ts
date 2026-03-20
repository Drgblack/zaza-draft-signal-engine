import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { EvergreenCandidate } from "@/lib/evergreen";
import { buildSignalAssetBundle, getAssetPrimaryImage, getAssetPrimaryVideo } from "@/lib/assets";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getSelectedCtaText,
  type PublishPrepPackage,
} from "@/lib/publish-prep";
import { getPostingPlatformLabel, type PostingPlatform } from "@/lib/posting-memory";
import {
  WEEKLY_PLAN_CONTENT_SOURCE_LABELS,
  classifySignalWeeklySource,
  getWeeklyPlanAlignment,
  type WeeklyPlan,
  type WeeklyPlanContentSourceKey,
  type WeeklyPlanState,
} from "@/lib/weekly-plan";
import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { CampaignStrategy } from "@/lib/campaigns";

export interface RecommendedWeeklyPostingPackItem {
  id: string;
  signalId: string;
  sourceTitle: string;
  recommendedPlatform: PostingPlatform;
  recommendedPlatformLabel: string;
  contentSource: WeeklyPlanContentSourceKey;
  contentSourceLabel: string;
  finalDraft: string;
  assetSummary: string;
  cta: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  timingSuggestion: string | null;
  rationale: string[];
  reviewHref: string;
}

export interface RecommendedWeeklyPostingPack {
  summary: string;
  items: RecommendedWeeklyPostingPackItem[];
}

type PrimaryDraftPackage = PublishPrepPackage & {
  outputKind: "primary_draft";
  platform: PostingPlatform;
};

interface PostingPackCandidate {
  id: string;
  signalId: string;
  sourceTitle: string;
  contentSource: WeeklyPlanContentSourceKey;
  baseScore: number;
  rationale: string[];
  packages: PrimaryDraftPackage[];
  reviewHref: string;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function getAssetSummary(signal: ApprovalQueueCandidate["signal"]): string {
  const assetBundle = buildSignalAssetBundle(signal);
  const preferredAssetType = signal.preferredAssetType ?? assetBundle?.suggestedPrimaryAssetType ?? "text_first";
  if (preferredAssetType === "image") {
    const image = getAssetPrimaryImage(assetBundle, signal.selectedImageAssetId);
    return image ? `Image · ${image.conceptTitle}` : "Image";
  }

  if (preferredAssetType === "video") {
    const video = getAssetPrimaryVideo(assetBundle, signal.selectedVideoConceptId);
    return video ? `Video · ${video.conceptTitle}` : "Video";
  }

  return "Text-first";
}

function getPlatformDraft(signal: ApprovalQueueCandidate["signal"], platform: PostingPlatform): string {
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

function toPrimaryDraftPackages(signal: ApprovalQueueCandidate["signal"]): PrimaryDraftPackage[] {
  const bundle = buildSignalPublishPrepBundle(signal);
  return (bundle?.packages ?? []).filter(
    (pkg): pkg is PrimaryDraftPackage =>
      pkg.outputKind === "primary_draft" &&
      (pkg.platform === "x" || pkg.platform === "linkedin" || pkg.platform === "reddit"),
  );
}

function pickBestPackage(
  candidate: PostingPackCandidate,
  plan: WeeklyPlan,
  state: WeeklyPlanState,
  selectedPlatformCounts: Map<PostingPlatform, number>,
): PrimaryDraftPackage | null {
  const ranked = [...candidate.packages].sort((left, right) => {
    const leftGap = state.platformRows.find((row) => row.key === left.platform)?.actualCount ?? 0;
    const rightGap = state.platformRows.find((row) => row.key === right.platform)?.actualCount ?? 0;
    const leftScore =
      (plan.targetPlatforms.includes(left.platform) ? 3 : 0) +
      (leftGap === 0 ? 2 : 0) -
      (selectedPlatformCounts.get(left.platform) ?? 0);
    const rightScore =
      (plan.targetPlatforms.includes(right.platform) ? 3 : 0) +
      (rightGap === 0 ? 2 : 0) -
      (selectedPlatformCounts.get(right.platform) ?? 0);

    return rightScore - leftScore || left.platform.localeCompare(right.platform);
  });

  return ranked[0] ?? null;
}

function toPackCandidateFromApproval(
  candidate: ApprovalQueueCandidate,
  plan: WeeklyPlan,
  strategy: CampaignStrategy,
  state: WeeklyPlanState,
): PostingPackCandidate | null {
  const packages = toPrimaryDraftPackages(candidate.signal);
  if (packages.length === 0) {
    return null;
  }

  const contentSource = classifySignalWeeklySource(candidate.signal);
  const alignment = getWeeklyPlanAlignment(candidate.signal, plan, strategy, state);
  const rationale = [...candidate.rankReasons];
  for (const reason of alignment.boosts) {
    uniquePush(rationale, reason);
  }
  if (candidate.signal.editorialMode) {
    uniquePush(rationale, `${getEditorialModeDefinition(candidate.signal.editorialMode).label} mode is ready for posting.`);
  }

  return {
    id: `approval:${candidate.signal.recordId}`,
    signalId: candidate.signal.recordId,
    sourceTitle: candidate.signal.sourceTitle,
    contentSource,
    baseScore: candidate.rankScore + alignment.scoreDelta,
    rationale: rationale.slice(0, 4),
    packages,
    reviewHref: `/signals/${candidate.signal.recordId}/review`,
  };
}

function toPackCandidateFromEvergreen(
  candidate: EvergreenCandidate,
  plan: WeeklyPlan,
  strategy: CampaignStrategy,
  state: WeeklyPlanState,
): PostingPackCandidate | null {
  const packages = toPrimaryDraftPackages(candidate.signal).filter((pkg) => pkg.platform === candidate.surfacedPlatform);
  if (packages.length === 0) {
    return null;
  }

  const contentSource = candidate.reuseMode === "reuse_directly" ? "reusedHighPerformers" : "evergreen";
  const alignment = getWeeklyPlanAlignment(candidate.signal, plan, strategy, state);
  const rationale = [...candidate.reasons, ...candidate.weeklyGapReasons];

  return {
    id: candidate.id,
    signalId: candidate.signal.recordId,
    sourceTitle: candidate.signal.sourceTitle,
    contentSource,
    baseScore: candidate.rankScore + alignment.scoreDelta,
    rationale: rationale.slice(0, 4),
    packages,
    reviewHref: `/signals/${candidate.signal.recordId}/review?evergreenCandidateId=${encodeURIComponent(candidate.id)}`,
  };
}

export function buildRecommendedWeeklyPostingPack(input: {
  weeklyPlan: WeeklyPlan;
  weeklyPlanState: WeeklyPlanState;
  strategy: CampaignStrategy;
  approvalReadyCandidates: ApprovalQueueCandidate[];
  evergreenCandidates: EvergreenCandidate[];
}): RecommendedWeeklyPostingPack {
  const approvalCandidates = input.approvalReadyCandidates
    .map((candidate) => toPackCandidateFromApproval(candidate, input.weeklyPlan, input.strategy, input.weeklyPlanState))
    .filter((candidate): candidate is PostingPackCandidate => Boolean(candidate));
  const evergreenCandidates = input.evergreenCandidates
    .map((candidate) => toPackCandidateFromEvergreen(candidate, input.weeklyPlan, input.strategy, input.weeklyPlanState))
    .filter((candidate): candidate is PostingPackCandidate => Boolean(candidate));
  const allCandidates = [...approvalCandidates, ...evergreenCandidates].sort(
    (left, right) => right.baseScore - left.baseScore || left.sourceTitle.localeCompare(right.sourceTitle),
  );

  const targetCount = Math.min(5, Math.max(3, Math.min(allCandidates.length, 5)));
  const selected: PostingPackCandidate[] = [];
  const selectedSignalIds = new Set<string>();
  const selectedPlatformCounts = new Map<PostingPlatform, number>();
  const selectedContentSourceCounts = new Map<WeeklyPlanContentSourceKey, number>();

  const prioritizedContentSources = (Object.entries(input.weeklyPlan.targetContentSources) as Array<
    [WeeklyPlanContentSourceKey, number]
  >)
    .filter(([, priority]) => priority >= 2)
    .sort((left, right) => right[1] - left[1]);

  for (const [contentSource] of prioritizedContentSources) {
    const match = allCandidates.find(
      (candidate) =>
        candidate.contentSource === contentSource && !selectedSignalIds.has(candidate.signalId),
    );
    if (!match) {
      continue;
    }
    selected.push(match);
    selectedSignalIds.add(match.signalId);
    selectedContentSourceCounts.set(contentSource, (selectedContentSourceCounts.get(contentSource) ?? 0) + 1);
  }

  for (const platform of input.weeklyPlan.targetPlatforms) {
    if (selected.length >= targetCount) {
      break;
    }

    const match = allCandidates.find((candidate) => {
      if (selectedSignalIds.has(candidate.signalId)) {
        return false;
      }

      return candidate.packages.some((pkg) => pkg.platform === platform);
    });
    if (!match) {
      continue;
    }

    selected.push(match);
    selectedSignalIds.add(match.signalId);
    selectedContentSourceCounts.set(match.contentSource, (selectedContentSourceCounts.get(match.contentSource) ?? 0) + 1);
  }

  for (const candidate of allCandidates) {
    if (selected.length >= targetCount || selectedSignalIds.has(candidate.signalId)) {
      continue;
    }

    selected.push(candidate);
    selectedSignalIds.add(candidate.signalId);
    selectedContentSourceCounts.set(candidate.contentSource, (selectedContentSourceCounts.get(candidate.contentSource) ?? 0) + 1);
  }

  const items = selected
    .slice(0, targetCount)
    .map((candidate) => {
      const packageForWeek = pickBestPackage(
        candidate,
        input.weeklyPlan,
        input.weeklyPlanState,
        selectedPlatformCounts,
      );
      if (!packageForWeek) {
        return null;
      }

      selectedPlatformCounts.set(packageForWeek.platform, (selectedPlatformCounts.get(packageForWeek.platform) ?? 0) + 1);
      const approvalSignal =
        input.approvalReadyCandidates.find((item) => item.signal.recordId === candidate.signalId)?.signal ??
        input.evergreenCandidates.find((item) => item.signal.recordId === candidate.signalId)?.signal;
      if (!approvalSignal) {
        return null;
      }

      const primaryLink = getPrimaryLinkVariant(packageForWeek);

      return {
        id: `${candidate.id}:${packageForWeek.platform}`,
        signalId: candidate.signalId,
        sourceTitle: candidate.sourceTitle,
        recommendedPlatform: packageForWeek.platform,
        recommendedPlatformLabel: getPostingPlatformLabel(packageForWeek.platform),
        contentSource: candidate.contentSource,
        contentSourceLabel: WEEKLY_PLAN_CONTENT_SOURCE_LABELS[candidate.contentSource],
        finalDraft: getPlatformDraft(approvalSignal, packageForWeek.platform),
        assetSummary: getAssetSummary(approvalSignal),
        cta: getSelectedCtaText(packageForWeek),
        linkLabel: primaryLink?.label ?? null,
        linkUrl: primaryLink?.url ?? null,
        timingSuggestion: packageForWeek.suggestedPostingTime,
        rationale: candidate.rationale,
        reviewHref: candidate.reviewHref,
      } satisfies RecommendedWeeklyPostingPackItem;
    })
    .filter((item): item is RecommendedWeeklyPostingPackItem => Boolean(item));

  const summary =
    items.length === 0
      ? "No weekly posting pack is ready yet."
      : `Prepared ${items.length} recommended post${items.length === 1 ? "" : "s"} across ${new Set(items.map((item) => item.recommendedPlatform)).size} platform${new Set(items.map((item) => item.recommendedPlatform)).size === 1 ? "" : "s"}.`;

  return {
    summary,
    items,
  };
}
