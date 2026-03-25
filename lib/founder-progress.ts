import type { ContentOpportunity } from "@/lib/content-opportunities";
import type { SignalRecord } from "@/types/signal";

export type FounderProgressState =
  | "no-approved-opportunity"
  | "interpretation-needs-saving"
  | "ready-for-approval"
  | "ready-to-build-brief"
  | "ready-to-generate"
  | "ready-to-review-render";

export function getFounderProgressForSignal(signal: SignalRecord): FounderProgressState {
  return signal.status === "Interpreted" ||
    signal.status === "Draft Generated" ||
    signal.status === "Reviewed" ||
    signal.status === "Approved" ||
    signal.status === "Scheduled" ||
    signal.status === "Posted"
    ? "ready-for-approval"
    : "interpretation-needs-saving";
}

export function getFounderProgressForOpportunity(
  opportunity: ContentOpportunity | null,
): FounderProgressState {
  if (!opportunity) {
    return "no-approved-opportunity";
  }

  if (
    opportunity.founderSelectionStatus !== "approved" ||
    !opportunity.selectedVideoBrief
  ) {
    return "ready-to-build-brief";
  }

  const reviewStatus = opportunity.generationState?.assetReview?.status ?? null;
  const hasRenderedAsset = Boolean(opportunity.generationState?.renderedAsset);

  if (
    hasRenderedAsset ||
    reviewStatus === "pending_review" ||
    reviewStatus === "accepted" ||
    reviewStatus === "rejected"
  ) {
    return "ready-to-review-render";
  }

  return "ready-to-generate";
}
