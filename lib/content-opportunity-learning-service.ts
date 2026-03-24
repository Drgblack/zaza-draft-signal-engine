import type { ContentOpportunity } from "@/lib/content-opportunities";
import {
  buildLearningInputSignature,
  inferCtaType,
  inferHookType,
} from "@/lib/learning-loop";

function contentOpportunityAutonomyType(input: {
  opportunity: ContentOpportunity;
  isRegenerate: boolean;
}) {
  if (input.isRegenerate) {
    return "experimental" as const;
  }

  return input.opportunity.opportunityType === "campaign_support_opportunity"
    ? ("campaign" as const)
    : ("reactive" as const);
}

export function buildContentOpportunityLearningMetadata(input: {
  opportunity: ContentOpportunity;
  hook?: string | null;
}) {
  return {
    format: input.opportunity.recommendedFormat,
    hookType: inferHookType(
      input.hook ??
        input.opportunity.selectedVideoBrief?.hook ??
        input.opportunity.hookRanking?.[0]?.hook ??
        input.opportunity.hookOptions?.[0] ??
        null,
    ),
    ctaType: inferCtaType(
      input.opportunity.selectedVideoBrief?.cta ??
        input.opportunity.suggestedCTA ??
        null,
    ),
    executionPath: input.opportunity.growthIntelligence?.executionPath ?? null,
  };
}

export function buildContentOpportunityLearningSignature(input: {
  opportunity: ContentOpportunity;
  actionType: "auto_run_video_factory" | "auto_regenerate_video_factory";
  provider: string | null;
  format: string | null;
}) {
  const metadata = buildContentOpportunityLearningMetadata({
    opportunity: input.opportunity,
  });
  return buildLearningInputSignature("video_factory", {
    action: input.actionType,
    content: contentOpportunityAutonomyType({
      opportunity: input.opportunity,
      isRegenerate: input.actionType === "auto_regenerate_video_factory",
    }),
    ctaType: metadata.ctaType ?? "unknown",
    format: input.format ?? "unknown",
    hookType: metadata.hookType ?? "unknown",
    path: metadata.executionPath ?? "unknown",
    platform: input.opportunity.recommendedPlatforms[0] ?? "unknown",
    provider: input.provider ?? "unknown",
  });
}
