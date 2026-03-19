import type { SignalRecord } from "@/types/signal";

export const FINAL_REVIEW_PLATFORMS = ["x", "linkedin", "reddit"] as const;

export type FinalReviewPlatform = (typeof FINAL_REVIEW_PLATFORMS)[number];

export interface FinalReviewDecision {
  platform: FinalReviewPlatform;
  label: string;
  generatedDraft: string | null;
  finalDraft: string | null;
  reviewStatus: SignalRecord["xReviewStatus"];
}

export interface FinalReviewSummary {
  decisions: FinalReviewDecision[];
  readyCount: number;
  needsEditCount: number;
  skipCount: number;
  started: boolean;
  completed: boolean;
  strongestPlatformLabel: string | null;
  summary: string;
}

function platformLabel(platform: FinalReviewPlatform): string {
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

function toDecision(signal: SignalRecord, platform: FinalReviewPlatform): FinalReviewDecision {
  switch (platform) {
    case "x":
      return {
        platform,
        label: platformLabel(platform),
        generatedDraft: signal.xDraft,
        finalDraft: signal.finalXDraft,
        reviewStatus: signal.xReviewStatus,
      };
    case "linkedin":
      return {
        platform,
        label: platformLabel(platform),
        generatedDraft: signal.linkedInDraft,
        finalDraft: signal.finalLinkedInDraft,
        reviewStatus: signal.linkedInReviewStatus,
      };
    case "reddit":
    default:
      return {
        platform,
        label: platformLabel(platform),
        generatedDraft: signal.redditDraft,
        finalDraft: signal.finalRedditDraft,
        reviewStatus: signal.redditReviewStatus,
      };
  }
}

function joinLabels(labels: string[]): string {
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

function buildSummaryText(input: {
  readyLabels: string[];
  skipLabels: string[];
  started: boolean;
  strongestPlatformLabel: string | null;
}): string {
  if (!input.started) {
    return "All drafts need review.";
  }

  if (input.readyLabels.length === 0 && input.skipLabels.length === 0) {
    return input.strongestPlatformLabel
      ? `${input.strongestPlatformLabel} draft looks strongest, but no platform is marked ready yet.`
      : "No platform marked ready yet.";
  }

  if (input.readyLabels.length > 0 && input.skipLabels.length === 0) {
    return `${joinLabels(input.readyLabels)} ready.`;
  }

  if (input.readyLabels.length === 0 && input.skipLabels.length > 0) {
    return `${joinLabels(input.skipLabels)} skipped. No platform marked ready yet.`;
  }

  return `${joinLabels(input.readyLabels)} ready; ${joinLabels(input.skipLabels)} skipped.`;
}

export function buildFinalReviewSummary(signal: SignalRecord): FinalReviewSummary {
  const decisions = FINAL_REVIEW_PLATFORMS.map((platform) => toDecision(signal, platform));
  const readyLabels = decisions.filter((decision) => decision.reviewStatus === "ready").map((decision) => decision.label);
  const needsEditLabels = decisions.filter((decision) => decision.reviewStatus === "needs_edit").map((decision) => decision.label);
  const skipLabels = decisions.filter((decision) => decision.reviewStatus === "skip").map((decision) => decision.label);
  const started =
    Boolean(signal.finalReviewStartedAt) ||
    decisions.some((decision) => decision.reviewStatus !== null || decision.finalDraft !== null);
  const completed = decisions.every(
    (decision) =>
      !decision.generatedDraft || decision.reviewStatus === "ready" || decision.reviewStatus === "skip",
  );
  const strongestPlatformLabel =
    readyLabels[0] ??
    (signal.platformPriority?.includes("LinkedIn")
      ? "LinkedIn"
      : signal.platformPriority?.includes("Reddit")
        ? "Reddit"
        : signal.platformPriority?.includes("X")
          ? "X"
          : decisions.find((decision) => decision.generatedDraft)?.label ?? null);

  return {
    decisions,
    readyCount: readyLabels.length,
    needsEditCount: needsEditLabels.length,
    skipCount: skipLabels.length,
    started,
    completed,
    strongestPlatformLabel,
    summary: buildSummaryText({
      readyLabels,
      skipLabels,
      started,
      strongestPlatformLabel,
    }),
  };
}
