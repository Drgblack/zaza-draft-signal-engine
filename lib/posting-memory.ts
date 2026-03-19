import { z } from "zod";

import { EDITORIAL_MODES, FINAL_DRAFT_REVIEW_STATUSES, type FinalDraftReviewStatus, type SignalRecord } from "@/types/signal";

export const POSTING_PLATFORMS = ["x", "linkedin", "reddit"] as const;

export type PostingPlatform = (typeof POSTING_PLATFORMS)[number];

export const postingLogEntrySchema = z.object({
  id: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  platform: z.enum(POSTING_PLATFORMS),
  postedAt: z.string().trim().min(1),
  finalPostedText: z.string().trim().min(1),
  postUrl: z.union([z.string().trim().min(1), z.null()]),
  note: z.union([z.string().trim().min(1), z.null()]),
  createdBy: z.string().trim().min(1).max(80),
  editorialMode: z.enum(EDITORIAL_MODES).nullable().optional(),
  patternId: z.union([z.string().trim().min(1), z.null()]).optional(),
  patternName: z.union([z.string().trim().min(1), z.null()]).optional(),
  scenarioAngle: z.union([z.string().trim().min(1), z.null()]).optional(),
  sourceDraftStatus: z.enum(FINAL_DRAFT_REVIEW_STATUSES).nullable().optional(),
  publishPrepPackageId: z.union([z.string().trim().min(1), z.null()]).optional(),
  selectedHookText: z.union([z.string().trim().min(1), z.null()]).optional(),
  selectedCtaText: z.union([z.string().trim().min(1), z.null()]).optional(),
  suggestedPostingTime: z.union([z.string().trim().min(1), z.null()]).optional(),
  selectedSiteLinkId: z.union([z.string().trim().min(1), z.null()]).optional(),
  destinationUrl: z.union([z.string().trim().min(1), z.null()]).optional(),
  destinationLabel: z.union([z.string().trim().min(1), z.null()]).optional(),
  utmSource: z.union([z.string().trim().min(1), z.null()]).optional(),
  utmMedium: z.union([z.string().trim().min(1), z.null()]).optional(),
  utmCampaign: z.union([z.string().trim().min(1), z.null()]).optional(),
  utmContent: z.union([z.string().trim().min(1), z.null()]).optional(),
});

export type PostingLogEntry = z.infer<typeof postingLogEntrySchema>;

export interface CreatePostingLogInput {
  signalId: string;
  platform: PostingPlatform;
  postedAt: string;
  finalPostedText: string;
  postUrl?: string | null;
  note?: string | null;
  createdBy?: string | null;
  editorialMode?: SignalRecord["editorialMode"];
  patternId?: string | null;
  patternName?: string | null;
  scenarioAngle?: string | null;
  sourceDraftStatus?: FinalDraftReviewStatus | null;
  publishPrepPackageId?: string | null;
  selectedHookText?: string | null;
  selectedCtaText?: string | null;
  suggestedPostingTime?: string | null;
  selectedSiteLinkId?: string | null;
  destinationUrl?: string | null;
  destinationLabel?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
}

export interface SignalPostingSummaryRow {
  platform: PostingPlatform;
  label: string;
  reviewStatus: FinalDraftReviewStatus | null;
  latestEntry: PostingLogEntry | null;
  totalEntries: number;
  state: "posted" | "ready_not_posted" | "needs_edit" | "skip" | "not_reviewed";
}

export interface SignalPostingSummary {
  hasPosting: boolean;
  totalPosts: number;
  postedPlatformsCount: number;
  readyPlatformsCount: number;
  pendingReadyPlatforms: string[];
  postedPlatforms: string[];
  latestPostedAt: string | null;
  allReadyDraftsPosted: boolean;
  summary: string;
  platformRows: SignalPostingSummaryRow[];
}

export const createPostingLogRequestSchema = z.object({
  platform: z.enum(POSTING_PLATFORMS),
  postedAt: z.string().trim().min(1, "Posted date is required."),
  finalPostedText: z.string().trim().min(1, "Final posted text is required."),
  postUrl: z.union([z.string(), z.null()]).optional(),
  note: z.union([z.string(), z.null()]).optional(),
  createdBy: z.string().trim().min(1).max(80).optional(),
});

export function sortPostingEntries(entries: PostingLogEntry[]): PostingLogEntry[] {
  return [...entries].sort(
    (left, right) =>
      new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime() ||
      right.id.localeCompare(left.id),
  );
}

export function normalizeOptionalPostingText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePostingIsoDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Posted date must be a valid date.");
  }

  return parsed.toISOString();
}

export function getPostingPlatformLabel(platform: PostingPlatform): string {
  switch (platform) {
    case "x":
      return "X";
    case "linkedin":
      return "LinkedIn";
    case "reddit":
    default:
      return "Reddit";
  }
}

function formatLabelList(labels: string[]): string {
  if (labels.length === 0) {
    return "";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function buildSignalPostingSummary(
  signal: SignalRecord,
  entries: PostingLogEntry[],
): SignalPostingSummary {
  const platformRows: SignalPostingSummaryRow[] = POSTING_PLATFORMS.map((platform) => {
    const platformEntries = entries.filter((entry) => entry.platform === platform);
    const latestEntry = platformEntries[0] ?? null;
    const reviewStatus =
      platform === "x"
        ? signal.xReviewStatus
        : platform === "linkedin"
          ? signal.linkedInReviewStatus
          : signal.redditReviewStatus;

    let state: SignalPostingSummaryRow["state"] = "not_reviewed";
    if (latestEntry) {
      state = "posted";
    } else if (reviewStatus === "ready") {
      state = "ready_not_posted";
    } else if (reviewStatus === "needs_edit") {
      state = "needs_edit";
    } else if (reviewStatus === "skip") {
      state = "skip";
    }

    return {
      platform,
      label: getPostingPlatformLabel(platform),
      reviewStatus,
      latestEntry,
      totalEntries: platformEntries.length,
      state,
    };
  });

  const postedRows = platformRows.filter((row) => row.state === "posted");
  const pendingReadyRows = platformRows.filter((row) => row.state === "ready_not_posted");
  const latestPostedAt = sortPostingEntries(entries)[0]?.postedAt ?? null;
  const readyPlatformsCount = platformRows.filter((row) => row.reviewStatus === "ready").length;
  const allReadyDraftsPosted = readyPlatformsCount > 0 && pendingReadyRows.length === 0;

  let summary = "No published posts logged yet.";
  if (postedRows.length > 0 && pendingReadyRows.length === 0) {
    summary = allReadyDraftsPosted
      ? `${formatLabelList(postedRows.map((row) => row.label))} posted. All ready drafts have been logged.`
      : `${formatLabelList(postedRows.map((row) => row.label))} posted.`;
  } else if (postedRows.length > 0 && pendingReadyRows.length > 0) {
    summary = `${formatLabelList(postedRows.map((row) => row.label))} posted. ${formatLabelList(pendingReadyRows.map((row) => row.label))} still ready but not posted.`;
  } else if (postedRows.length === 0 && pendingReadyRows.length > 0) {
    summary = `No posts logged yet. ${formatLabelList(pendingReadyRows.map((row) => row.label))} ready but not posted.`;
  }

  return {
    hasPosting: entries.length > 0,
    totalPosts: entries.length,
    postedPlatformsCount: postedRows.length,
    readyPlatformsCount,
    pendingReadyPlatforms: pendingReadyRows.map((row) => row.label),
    postedPlatforms: postedRows.map((row) => row.label),
    latestPostedAt,
    allReadyDraftsPosted,
    summary,
    platformRows,
  };
}
