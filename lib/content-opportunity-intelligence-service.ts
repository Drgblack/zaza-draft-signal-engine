import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type {
  ContentOpportunity,
  ContentOpportunityPriority,
} from "@/lib/content-opportunities";
import { recommendFormat } from "@/lib/format-recommender";
import { buildGrowthIntelligence } from "@/lib/growth-intelligence";
import { generateHooks, rankHooks } from "@/lib/hook-generator";
import {
  getContentLearningAdjustmentSync,
  inferCtaType,
  inferHookType,
} from "@/lib/learning-loop";
import { scoreOpportunity } from "@/lib/performance-scorer";
import {
  buildContentIntelligenceFromSignal,
  type GrowthIntelligence,
} from "@/lib/strategic-intelligence-types";
import { determineViewerEffect, suggestCTA } from "@/lib/viewer-effect";
import type { PostingPlatform } from "@/lib/posting-memory";

function contentOpportunitySeverityScore(priority: ContentOpportunityPriority) {
  if (priority === "high") {
    return 3;
  }

  if (priority === "medium") {
    return 2;
  }

  return 1;
}

function toGrowthPlatformPriority(
  platforms: PostingPlatform[],
): "X First" | "LinkedIn First" | "Reddit First" | "Multi-platform" | undefined {
  const normalized = Array.from(new Set(platforms));

  if (normalized.length > 1) {
    return "Multi-platform";
  }

  switch (normalized[0]) {
    case "x":
      return "X First";
    case "linkedin":
      return "LinkedIn First";
    case "reddit":
      return "Reddit First";
    default:
      return undefined;
  }
}

function clampDriverScore(value: number) {
  return Math.max(1, Math.min(5, Math.round(value * 100) / 100));
}

export function buildOpportunityGrowthIntelligence(
  opportunity: ContentOpportunity,
  options?: {
    signal?: ApprovalQueueCandidate["signal"];
    preserveExisting?: boolean;
    activeCampaignIds?: string[] | null;
    campaignsExist?: boolean;
  },
): GrowthIntelligence {
  if (options?.preserveExisting && opportunity.growthIntelligence) {
    return opportunity.growthIntelligence;
  }

  const contentIntelligence = buildContentIntelligenceFromSignal(opportunity);
  const signal = options?.signal;

  return buildGrowthIntelligence({
    signal: {
      sourceTitle: signal?.sourceTitle ?? opportunity.source.sourceTitle,
      rawExcerpt: signal?.rawExcerpt,
      manualSummary: signal?.manualSummary,
      scenarioAngle: signal?.scenarioAngle,
      signalSubtype: signal?.signalSubtype ?? opportunity.opportunityType,
      emotionalPattern: signal?.emotionalPattern,
      teacherPainPoint: signal?.teacherPainPoint ?? opportunity.primaryPainPoint,
      riskToTeacher: signal?.riskToTeacher ?? opportunity.riskSummary,
      interpretationNotes: signal?.interpretationNotes,
      contentAngle: signal?.contentAngle ?? opportunity.recommendedAngle,
      whySelected: signal?.whySelected ?? opportunity.whyNow,
      signalCategory: signal?.signalCategory,
      severityScore:
        signal?.severityScore ??
        contentOpportunitySeverityScore(opportunity.priority),
      platformPriority:
        signal?.platformPriority ??
        toGrowthPlatformPriority(opportunity.recommendedPlatforms),
      campaignId: signal?.campaignId,
      signalNoveltyScore: signal?.signalNoveltyScore,
      similarityToExistingContent: signal?.similarityToExistingContent,
    },
    contentIntelligence,
    activeCampaignIds: options?.activeCampaignIds,
    campaignsExist: options?.campaignsExist,
  });
}

export function applyPhaseEIntelligence(
  opportunity: ContentOpportunity,
  options?: {
    enabled?: boolean;
    preserveExisting?: boolean;
  },
): ContentOpportunity {
  if (options?.enabled === false) {
    return opportunity;
  }

  const preserveExisting = options?.preserveExisting ?? false;
  const recommendedFormat = recommendFormat(opportunity);
  const opportunityWithFormat = {
    ...opportunity,
    recommendedFormat,
  };

  const generatedHookOptions =
    preserveExisting && opportunity.hookOptions && opportunity.hookOptions.length > 0
      ? opportunity.hookOptions
      : generateHooks(opportunityWithFormat);
  const generatedHookRanking =
    preserveExisting && opportunity.hookRanking && opportunity.hookRanking.length > 0
      ? opportunity.hookRanking
      : rankHooks(generatedHookOptions, {
          ...opportunityWithFormat,
          hookOptions: generatedHookOptions,
        });
  const scoredPerformanceDrivers = scoreOpportunity({
    ...opportunityWithFormat,
    hookOptions: generatedHookOptions,
    hookRanking: generatedHookRanking,
  });
  const performanceDrivers = preserveExisting
    ? {
        ...scoredPerformanceDrivers,
        ...(opportunity.performanceDrivers ?? {}),
      }
    : scoredPerformanceDrivers;
  const opportunityWithDrivers = {
    ...opportunityWithFormat,
    hookOptions: generatedHookOptions,
    hookRanking: generatedHookRanking,
    performanceDrivers,
  };

  const learningAdjustedOpportunity = {
    ...opportunityWithDrivers,
    intendedViewerEffect:
      preserveExisting && opportunity.intendedViewerEffect
        ? opportunity.intendedViewerEffect
        : determineViewerEffect(opportunityWithDrivers),
    suggestedCTA:
      preserveExisting && opportunity.suggestedCTA
        ? opportunity.suggestedCTA
        : suggestCTA(opportunityWithDrivers),
  };
  const contentLearningAdjustment = getContentLearningAdjustmentSync({
    format: learningAdjustedOpportunity.recommendedFormat,
    hookType: inferHookType(
      learningAdjustedOpportunity.hookRanking?.[0]?.hook ??
        learningAdjustedOpportunity.hookOptions?.[0] ??
        null,
    ),
    ctaType: inferCtaType(learningAdjustedOpportunity.suggestedCTA),
  });
  const learningBoost = contentLearningAdjustment.scoreDelta;

  if (!learningBoost) {
    return learningAdjustedOpportunity;
  }

  const existingDrivers = learningAdjustedOpportunity.performanceDrivers ?? {};

  return {
    ...learningAdjustedOpportunity,
    performanceDrivers: {
      ...existingDrivers,
      hookStrength: clampDriverScore(
        (existingDrivers.hookStrength ?? 3) + learningBoost,
      ),
      viewerConnection: clampDriverScore(
        (existingDrivers.viewerConnection ?? 3) + learningBoost * 0.7,
      ),
      conversionPotential: clampDriverScore(
        (existingDrivers.conversionPotential ?? 3) + learningBoost,
      ),
    },
  };
}
