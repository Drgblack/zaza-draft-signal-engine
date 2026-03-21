import type { AttributionInsights } from "@/lib/attribution";
import type { AudienceMemoryState } from "@/lib/audience-memory";
import type { CampaignAllocationState } from "@/lib/campaign-allocation";
import type { InfluencerGraphState } from "@/lib/influencer-graph";
import type { RevenueSignalInsights } from "@/lib/revenue-signals";
import {
  buildReuseMemoryInsights,
  type ReuseMemoryCase,
  type ReuseMemoryInsightsSummary,
} from "@/lib/reuse-memory";
import type { WeeklyRecap } from "@/lib/weekly-recap";

export interface GrowthMemoryBlock {
  headline: string;
  summary: string;
  supportingSignals: string[];
}

export interface GrowthMemoryCombo {
  id: string;
  label: string;
  reason: string;
  href: string;
}

export interface GrowthMemoryState {
  generatedAt: string;
  commercialMemory: GrowthMemoryBlock & { currentPosture: string };
  audienceMemorySummary: GrowthMemoryBlock;
  reuseMemorySummary: GrowthMemoryBlock;
  relationshipMemorySummary: GrowthMemoryBlock;
  campaignMemorySummary: GrowthMemoryBlock;
  cautionMemorySummary: GrowthMemoryBlock;
  currentBestCombos: GrowthMemoryCombo[];
  currentWeakCombos: GrowthMemoryCombo[];
  topNotes: string[];
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function createBlock(input: GrowthMemoryBlock): GrowthMemoryBlock {
  return {
    ...input,
    supportingSignals: input.supportingSignals.filter(Boolean).slice(0, 4),
  };
}

function createCombo(input: GrowthMemoryCombo): GrowthMemoryCombo {
  return input;
}

function buildCommercialPosture(input: {
  revenueInsights: RevenueSignalInsights;
  attributionInsights: AttributionInsights;
  weeklyRecap: WeeklyRecap;
}) {
  if (input.revenueInsights.highStrengthCount >= 2 && input.revenueInsights.topPlatformDestinationRows[0]) {
    return "Commercial posture is strongest around proven trust-to-conversion combinations and should stay focused.";
  }

  if (input.revenueInsights.recordedCount > 0 || input.attributionInsights.strongCount > 0) {
    return "Commercial posture is moving from trust into soft conversion, with a few combinations now worth leaning into more deliberately.";
  }

  return (
    input.weeklyRecap.commercialHighlights[0] ??
    "Commercial posture is still learning-heavy and should stay evidence-led rather than aggressive."
  );
}

function buildReuseSummary(cases: ReuseMemoryCase[]): ReuseMemoryInsightsSummary {
  return buildReuseMemoryInsights(cases);
}

export function buildGrowthMemory(input: {
  attributionInsights: AttributionInsights;
  revenueInsights: RevenueSignalInsights;
  audienceMemory: AudienceMemoryState;
  reuseCases: ReuseMemoryCase[];
  influencerGraph?: InfluencerGraphState | null;
  campaignAllocation: CampaignAllocationState;
  weeklyRecap: WeeklyRecap;
  now?: Date;
}): GrowthMemoryState {
  const now = input.now ?? new Date();
  const reuseInsights = buildReuseSummary(input.reuseCases);
  const topAudienceSegment = input.audienceMemory.segments[0] ?? null;
  const topRevenueCombo = input.revenueInsights.topPlatformDestinationRows[0] ?? null;
  const topDestination = input.attributionInsights.topDestinationRows[0] ?? null;
  const topReusableLabel = reuseInsights.topReusableCombinationLabel;
  const topWeakReuseLabel = reuseInsights.topDoNotRepeatCombinationLabel;
  const topRelationshipRow = input.influencerGraph?.rows[0] ?? null;
  const increaseCampaign = input.campaignAllocation.recommendations.find((item) => item.supportLevel === "increase") ?? null;
  const reduceCampaign = input.campaignAllocation.recommendations.find((item) => item.supportLevel === "reduce" || item.supportLevel === "pause_temporarily") ?? null;

  const commercialMemory = {
    ...createBlock({
      headline:
        topRevenueCombo?.label ??
        topDestination?.label ??
        input.weeklyRecap.commercialHighlights[0] ??
        "No dominant commercial combo yet",
      summary:
        input.revenueInsights.summaries[0] ??
        input.attributionInsights.summaries[0] ??
        input.weeklyRecap.commercialHighlights[0] ??
        "No stable commercial pattern is strong enough to summarize yet.",
      supportingSignals: [
        input.revenueInsights.summaries[1] ?? "",
        input.attributionInsights.summaries[1] ?? "",
      ],
    }),
    currentPosture: buildCommercialPosture(input),
  };

  const audienceMemorySummary = createBlock({
    headline:
      topAudienceSegment?.summary[0] ??
      topAudienceSegment?.segmentName ??
      "Audience learning is still thin",
    summary:
      topAudienceSegment?.supportingOutcomeSignals[0] ??
      topAudienceSegment?.summary[0] ??
      "No audience segment has a strong enough response pattern to guide planning yet.",
    supportingSignals: [
      topAudienceSegment?.strongestModes[0]
        ? `${topAudienceSegment.strongestModes[0].label} is the strongest current mode fit.`
        : "",
      topAudienceSegment?.strongestDestinations[0]
        ? `${topAudienceSegment.strongestDestinations[0].label} is the strongest destination fit.`
        : "",
    ],
  });

  const reuseMemorySummary = createBlock({
    headline: topReusableLabel ?? "No reusable family has separated clearly yet",
    summary:
      topReusableLabel
        ? `${topReusableLabel} is the strongest reusable family in current memory.`
        : "Reuse memory is still too thin to confidently elevate one family.",
    supportingSignals: [
      reuseInsights.strongestPlatformLabel
        ? `${reuseInsights.strongestPlatformLabel} is the strongest reuse platform.`
        : "",
      reuseInsights.reusableCount > 0
        ? `${reuseInsights.reusableCount} reusable case${reuseInsights.reusableCount === 1 ? "" : "s"} are currently stored.`
        : "",
    ],
  });

  const relationshipMemorySummary = createBlock({
    headline:
      topRelationshipRow?.newReplyPending
        ? `${topRelationshipRow.influencer.name} has a warm reply waiting`
        : topRelationshipRow?.followUpNeeded
          ? `${topRelationshipRow.influencer.name} is due for follow-up`
          : "Relationship memory is stable",
    summary:
      input.influencerGraph
        ? `${input.influencerGraph.summary.followUpNeededCount} follow-up${input.influencerGraph.summary.followUpNeededCount === 1 ? "" : "s"} and ${input.influencerGraph.summary.newRepliesPendingCount} pending repl${input.influencerGraph.summary.newRepliesPendingCount === 1 ? "y" : "ies"} are currently in memory.`
        : "Relationship memory is not loaded in this view.",
    supportingSignals: [
      topRelationshipRow?.influencer.tags[0] ? `${topRelationshipRow.influencer.tags[0]} relationship context` : "",
      topRelationshipRow?.latestInteraction?.context ?? "",
    ],
  });

  const campaignMemorySummary = createBlock({
    headline:
      increaseCampaign?.campaignName
        ? `${increaseCampaign.campaignName} is the clearest under-supported campaign`
        : input.campaignAllocation.topSummary,
    summary:
      increaseCampaign?.reason ??
      input.campaignAllocation.topSummary,
    supportingSignals: [
      increaseCampaign?.suggestedWeeklyShare ?? "",
      reduceCampaign?.reason ?? "",
    ],
  });

  const cautionSignals: string[] = [];
  uniquePush(cautionSignals, topAudienceSegment?.toneCautions[0]);
  uniquePush(cautionSignals, topAudienceSegment?.weakCombinations[0]);
  uniquePush(cautionSignals, topWeakReuseLabel ? `${topWeakReuseLabel} is a current do-not-repeat family.` : null);
  uniquePush(cautionSignals, reduceCampaign?.reason);
  uniquePush(cautionSignals, input.weeklyRecap.pauseCandidates[0]?.reason);

  const cautionMemorySummary = createBlock({
    headline: cautionSignals[0] ?? "No major caution is dominating memory right now",
    summary:
      cautionSignals[1] ??
      cautionSignals[0] ??
      "Weak combinations exist, but no single caution is strong enough to dominate the current system posture.",
    supportingSignals: cautionSignals,
  });

  const currentBestCombos: GrowthMemoryCombo[] = [];
  const currentWeakCombos: GrowthMemoryCombo[] = [];

  if (topRevenueCombo) {
    currentBestCombos.push(
      createCombo({
        id: "best-commercial-combo",
        label: topRevenueCombo.label,
        reason: `${topRevenueCombo.count} revenue-linked signal${topRevenueCombo.count === 1 ? "" : "s"} and ${topRevenueCombo.highStrengthCount} high-strength result${topRevenueCombo.highStrengthCount === 1 ? "" : "s"} support it.`,
        href: "/insights",
      }),
    );
  }

  if (topAudienceSegment?.strongestModes[0] && topAudienceSegment.strongestPlatforms[0]) {
    currentBestCombos.push(
      createCombo({
        id: `best-audience-${topAudienceSegment.segmentId}`,
        label: `${topAudienceSegment.segmentName}: ${topAudienceSegment.strongestModes[0].label} on ${topAudienceSegment.strongestPlatforms[0].label}`,
        reason:
          topAudienceSegment.summary[0] ??
          `${topAudienceSegment.segmentName} is showing a clearer response pattern than most segments.`,
        href: "/plan",
      }),
    );
  }

  if (topReusableLabel) {
    currentBestCombos.push(
      createCombo({
        id: "best-reuse-family",
        label: topReusableLabel,
        reason: `${reuseInsights.reusableCount} reusable case${reuseInsights.reusableCount === 1 ? "" : "s"} currently support this family.`,
        href: "/recap",
      }),
    );
  }

  if (topWeakReuseLabel) {
    currentWeakCombos.push(
      createCombo({
        id: "weak-reuse-family",
        label: topWeakReuseLabel,
        reason: `${reuseInsights.cautionCount} caution or do-not-repeat case${reuseInsights.cautionCount === 1 ? "" : "s"} are attached to this family.`,
        href: "/insights",
      }),
    );
  }

  if (topAudienceSegment?.weakCombinations[0]) {
    currentWeakCombos.push(
      createCombo({
        id: `weak-audience-${topAudienceSegment.segmentId}`,
        label: topAudienceSegment.weakCombinations[0],
        reason:
          topAudienceSegment.toneCautions[0] ??
          `${topAudienceSegment.segmentName} has a weaker current fit here.`,
        href: "/plan",
      }),
    );
  }

  if (reduceCampaign) {
    currentWeakCombos.push(
      createCombo({
        id: `weak-campaign-${reduceCampaign.campaignId}`,
        label: `${reduceCampaign.campaignName} should be reduced for now`,
        reason: reduceCampaign.reason,
        href: reduceCampaign.linkedWorkflow,
      }),
    );
  }

  const topNotes: string[] = [];
  uniquePush(topNotes, commercialMemory.summary);
  uniquePush(topNotes, audienceMemorySummary.summary);
  uniquePush(topNotes, reuseMemorySummary.summary);
  uniquePush(topNotes, relationshipMemorySummary.summary);
  uniquePush(topNotes, campaignMemorySummary.summary);
  uniquePush(topNotes, cautionMemorySummary.headline);

  return {
    generatedAt: now.toISOString(),
    commercialMemory,
    audienceMemorySummary,
    reuseMemorySummary,
    relationshipMemorySummary,
    campaignMemorySummary,
    cautionMemorySummary,
    currentBestCombos: currentBestCombos.slice(0, 4),
    currentWeakCombos: currentWeakCombos.slice(0, 4),
    topNotes: topNotes.slice(0, 6),
  };
}
