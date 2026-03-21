import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { AttributionInsights } from "@/lib/attribution";
import type { AudienceMemoryState } from "@/lib/audience-memory";
import type { CampaignAllocationState } from "@/lib/campaign-allocation";
import type { EvergreenSummary } from "@/lib/evergreen";
import type { GrowthScorecardSummary } from "@/lib/growth-scorecard";
import type { GrowthMemoryState } from "@/lib/growth-memory";
import type { buildInfluencerGraphState } from "@/lib/influencer-graph";
import type { RevenueSignalInsights } from "@/lib/revenue-signals";
import type { SourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import type { WeeklyPostingPack } from "@/lib/weekly-posting-pack";
import type { WeeklyRecap } from "@/lib/weekly-recap";

export const COMMERCIAL_OPPORTUNITY_CATEGORIES = [
  "platform_destination_opportunity",
  "audience_segment_opportunity",
  "campaign_gap_opportunity",
  "topic_cluster_opportunity",
  "outreach_opportunity",
  "influencer_opportunity",
  "evergreen_opportunity",
  "conversion_support_opportunity",
] as const;

export const COMMERCIAL_OPPORTUNITY_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export const COMMERCIAL_OPPORTUNITY_URGENCY_LEVELS = ["high", "medium", "low"] as const;

export type CommercialOpportunityCategory = (typeof COMMERCIAL_OPPORTUNITY_CATEGORIES)[number];
export type CommercialOpportunityConfidence = (typeof COMMERCIAL_OPPORTUNITY_CONFIDENCE_LEVELS)[number];
export type CommercialOpportunityUrgency = (typeof COMMERCIAL_OPPORTUNITY_URGENCY_LEVELS)[number];

export interface CommercialOpportunity {
  opportunityId: string;
  category: CommercialOpportunityCategory;
  title: string;
  opportunity: string;
  reason: string;
  supportingSignals: string[];
  linkedWorkflow: string;
  confidence: CommercialOpportunityConfidence;
  urgency: CommercialOpportunityUrgency;
}

export interface CommercialOpportunityRadarState {
  generatedAt: string;
  topSummary: string;
  opportunities: CommercialOpportunity[];
}

function urgencyWeight(level: CommercialOpportunityUrgency) {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function confidenceWeight(level: CommercialOpportunityConfidence) {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function sortOpportunities(items: CommercialOpportunity[]) {
  return [...items].sort(
    (left, right) =>
      urgencyWeight(right.urgency) - urgencyWeight(left.urgency) ||
      confidenceWeight(right.confidence) - confidenceWeight(left.confidence) ||
      left.title.localeCompare(right.title),
  );
}

function buildOpportunity(input: CommercialOpportunity): CommercialOpportunity {
  return {
    ...input,
    supportingSignals: input.supportingSignals.filter(Boolean).slice(0, 4),
  };
}

export function buildCommercialOpportunityRadar(input: {
  approvalCandidates: ApprovalQueueCandidate[];
  weeklyPostingPack: WeeklyPostingPack;
  weeklyRecap: WeeklyRecap;
  growthScorecard: GrowthScorecardSummary;
  attributionInsights: AttributionInsights;
  revenueInsights: RevenueSignalInsights;
  audienceMemory: AudienceMemoryState;
  sourceAutopilotState: SourceAutopilotV2State;
  influencerGraph: Awaited<ReturnType<typeof buildInfluencerGraphState>>;
  campaignAllocation: CampaignAllocationState;
  evergreenSummary: EvergreenSummary;
  growthMemory?: GrowthMemoryState | null;
  now?: Date;
}): CommercialOpportunityRadarState {
  const now = input.now ?? new Date();
  const opportunities: CommercialOpportunity[] = [];
  const candidateBySignalId = new Map(input.approvalCandidates.map((candidate) => [candidate.signal.recordId, candidate]));
  const packPlatformDestinationCounts = new Map<string, number>();
  const packAudienceCounts = new Map<string, number>();
  const packModeCounts = new Map<string, number>();

  for (const item of input.weeklyPostingPack.items) {
    const destinationLabel = normalizeText(item.destinationLabel);
    if (destinationLabel) {
      const key = `${item.platform}:${destinationLabel.toLowerCase()}`;
      packPlatformDestinationCounts.set(key, (packPlatformDestinationCounts.get(key) ?? 0) + 1);
    }

    if (item.editorialMode) {
      packModeCounts.set(item.editorialMode, (packModeCounts.get(item.editorialMode) ?? 0) + 1);
    }

    const candidate = candidateBySignalId.get(item.signalId);
    const segmentId = candidate?.signal.audienceSegmentId;
    if (segmentId) {
      packAudienceCounts.set(segmentId, (packAudienceCounts.get(segmentId) ?? 0) + 1);
    }
  }

  const topPlatformDestination = input.revenueInsights.topPlatformDestinationRows[0];
  if (
    topPlatformDestination &&
    (topPlatformDestination.highStrengthCount > 0 || topPlatformDestination.count >= 2)
  ) {
    const packRepresentation = packPlatformDestinationCounts.get(topPlatformDestination.key) ?? 0;
    if (packRepresentation < Math.min(2, topPlatformDestination.count)) {
      opportunities.push(
        buildOpportunity({
          opportunityId: "opportunity-platform-destination",
          category: "platform_destination_opportunity",
          title: `${topPlatformDestination.label} is commercially strong but still underused`,
          opportunity: `Give this platform and destination pairing more weekly support before searching for weaker new combinations.`,
          reason: `${topPlatformDestination.count} revenue-linked signal${topPlatformDestination.count === 1 ? "" : "s"} support this pairing, but only ${packRepresentation} current weekly pack item${packRepresentation === 1 ? "" : "s"} use it.`,
          supportingSignals: [
            input.revenueInsights.summaries[0] ?? "",
            input.attributionInsights.summaries[0] ?? "",
            input.growthScorecard.topPositives[0]?.reason ?? "",
          ],
          linkedWorkflow: "/weekly-pack",
          confidence:
            topPlatformDestination.highStrengthCount >= 2 || topPlatformDestination.count >= 3
              ? "high"
              : "medium",
          urgency: packRepresentation === 0 ? "high" : "medium",
        }),
      );
    }
  }

  const topSegment = input.audienceMemory.segments.find((segment) => {
    const queueCount = input.approvalCandidates.filter(
      (candidate) => candidate.signal.audienceSegmentId === segment.segmentId,
    ).length;
    const packCount = packAudienceCounts.get(segment.segmentId) ?? 0;
    return Boolean(segment.strongestModes[0] && segment.strongestPlatforms[0] && queueCount > packCount);
  });

  if (topSegment) {
    const queueCount = input.approvalCandidates.filter(
      (candidate) => candidate.signal.audienceSegmentId === topSegment.segmentId,
    ).length;
    const packCount = packAudienceCounts.get(topSegment.segmentId) ?? 0;
    opportunities.push(
      buildOpportunity({
        opportunityId: `opportunity-audience-${topSegment.segmentId}`,
        category: "audience_segment_opportunity",
        title: `${topSegment.segmentName} is showing a stronger response pattern than this week's mix reflects`,
        opportunity: `Increase ${topSegment.strongestModes[0]?.label ?? "high-fit"} content for ${topSegment.segmentName}, especially on ${topSegment.strongestPlatforms[0]?.label ?? "the best-fit platform"}.`,
        reason: `${queueCount} candidate${queueCount === 1 ? "" : "s"} support this segment, but only ${packCount} weekly pack slot${packCount === 1 ? "" : "s"} currently do.`,
        supportingSignals: [
          topSegment.summary[0] ?? "",
          topSegment.supportingOutcomeSignals[0] ?? "",
        ],
        linkedWorkflow: "/plan",
        confidence: (topSegment.strongestModes[0]?.count ?? 0) >= 3 ? "high" : "medium",
        urgency: packCount === 0 && queueCount >= 2 ? "high" : "medium",
      }),
    );
  }

  const increaseCampaign = input.campaignAllocation.recommendations.find(
    (recommendation) => recommendation.supportLevel === "increase",
  );
  if (increaseCampaign) {
    opportunities.push(
      buildOpportunity({
        opportunityId: `opportunity-campaign-${increaseCampaign.campaignId}`,
        category: "campaign_gap_opportunity",
        title: `${increaseCampaign.campaignName} is under-supported relative to its current upside`,
        opportunity: `Allocate ${increaseCampaign.suggestedWeeklyShare} to this campaign instead of spreading weekly effort thinner.`,
        reason: increaseCampaign.reason,
        supportingSignals: increaseCampaign.supportingSignals,
        linkedWorkflow: increaseCampaign.linkedWorkflow,
        confidence: increaseCampaign.urgency === "high" ? "high" : "medium",
        urgency: increaseCampaign.urgency,
      }),
    );
  }

  const topPatternOrMode = input.revenueInsights.topPatternRows[0];
  if (
    topPatternOrMode &&
    topPatternOrMode.key.startsWith("mode:") &&
    (topPatternOrMode.highStrengthCount > 0 || topPatternOrMode.count >= 2)
  ) {
    const editorialMode = topPatternOrMode.key.replace(/^mode:/, "");
    const packRepresentation = packModeCounts.get(editorialMode) ?? 0;
    if (packRepresentation === 0) {
      opportunities.push(
        buildOpportunity({
          opportunityId: `opportunity-mode-${editorialMode}`,
          category: "conversion_support_opportunity",
          title: `${topPatternOrMode.label} is creating commercial signal but is missing from the current pack`,
          opportunity: `Give this content family one weekly slot so a working commercial pattern does not go idle.`,
          reason: `${topPatternOrMode.count} revenue-linked signal${topPatternOrMode.count === 1 ? "" : "s"} are tied to this mode, but the current weekly pack has no matching item.`,
          supportingSignals: [
            input.revenueInsights.summaries[1] ?? "",
            input.weeklyRecap.commercialHighlights[0] ?? "",
          ],
          linkedWorkflow: "/review",
          confidence:
            topPatternOrMode.highStrengthCount >= 2 || topPatternOrMode.count >= 3
              ? "high"
              : "medium",
          urgency: "medium",
        }),
      );
    }
  }

  const pendingReply = input.influencerGraph.rows.find((row) => row.newReplyPending);
  if (pendingReply) {
    opportunities.push(
      buildOpportunity({
        opportunityId: `opportunity-outreach-${pendingReply.influencer.influencerId}`,
        category: "outreach_opportunity",
        title: `${pendingReply.influencer.name} has an open warm reply opportunity`,
        opportunity: `Prioritize a short founder-voice follow-up before opening new cold outreach this week.`,
        reason: `A recent reply is still waiting, and warm relationship momentum is usually higher leverage than fresh outbound outreach.`,
        supportingSignals: [
          pendingReply.latestInteraction?.message ?? "",
          pendingReply.influencer.tags[0] ? `${pendingReply.influencer.tags[0]} relationship context` : "",
        ],
        linkedWorkflow: "/replies",
        confidence: "high",
        urgency: "high",
      }),
    );
  } else {
    const followUpRow = input.influencerGraph.rows.find(
      (row) =>
        row.followUpNeeded &&
        ["replied", "engaged", "collaborator"].includes(row.influencer.relationshipStage),
    );
    if (followUpRow) {
      opportunities.push(
        buildOpportunity({
          opportunityId: `opportunity-influencer-${followUpRow.influencer.influencerId}`,
          category: "influencer_opportunity",
          title: `${followUpRow.influencer.name} is a live collaboration or relationship opportunity`,
          opportunity: `Use existing content and outreach support to move this relationship forward while it is warm.`,
          reason: `${followUpRow.influencer.name} already has a ${followUpRow.influencer.relationshipStage.replaceAll("_", " ")} relationship stage and is due for follow-up.`,
          supportingSignals: [
            followUpRow.influencer.tags[0] ? `${followUpRow.influencer.tags[0]} alignment` : "",
            followUpRow.latestInteraction?.context ?? "",
          ],
          linkedWorkflow: "/influencers",
          confidence: "medium",
          urgency: "medium",
        }),
      );
    }
  }

  if (
    input.evergreenSummary.candidates.length > input.weeklyPostingPack.includedEvergreenCount &&
    input.weeklyRecap.reuseCandidates[0]
  ) {
    opportunities.push(
      buildOpportunity({
        opportunityId: "opportunity-evergreen",
        category: "evergreen_opportunity",
        title: "Evergreen winners are underused relative to recent proven performance",
        opportunity: "Pull one more evergreen reuse candidate into the near-term plan instead of relying only on fresh queue quality.",
        reason: `${input.evergreenSummary.candidates.length} evergreen candidate${input.evergreenSummary.candidates.length === 1 ? "" : "s"} are available, but only ${input.weeklyPostingPack.includedEvergreenCount} current weekly pack item${input.weeklyPostingPack.includedEvergreenCount === 1 ? "" : "s"} use evergreen support.`,
        supportingSignals: [
          input.weeklyRecap.reuseCandidates[0]?.reason ?? "",
          input.growthScorecard.topPositives.find((note) => note.id === "pack-completion")?.reason ?? "",
        ],
        linkedWorkflow: "/weekly-pack",
        confidence: input.evergreenSummary.candidates.length >= 3 ? "high" : "medium",
        urgency: input.weeklyPostingPack.includedEvergreenCount === 0 ? "medium" : "low",
      }),
    );
  }

  if (opportunities.length === 0 && input.growthMemory?.currentBestCombos[0]) {
    opportunities.push(
      buildOpportunity({
        opportunityId: `opportunity-memory-${input.growthMemory.currentBestCombos[0].id}`,
        category: "topic_cluster_opportunity",
        title: `${input.growthMemory.currentBestCombos[0].label} is reinforced across consolidated memory`,
        opportunity: "Use the strongest consolidated memory cue as a short-term commercial opportunity before creating new speculative themes.",
        reason: input.growthMemory.currentBestCombos[0].reason,
        supportingSignals: [
          input.growthMemory.commercialMemory.currentPosture,
          input.growthMemory.topNotes[0] ?? "",
        ],
        linkedWorkflow: input.growthMemory.currentBestCombos[0].href,
        confidence: "medium",
        urgency: "low",
      }),
    );
  }

  if (opportunities.length === 0 && input.weeklyRecap.winners[0]) {
    opportunities.push(
      buildOpportunity({
        opportunityId: `opportunity-winner-${input.weeklyRecap.winners[0].id}`,
        category: "topic_cluster_opportunity",
        title: `${input.weeklyRecap.winners[0].label} still looks commercially promising`,
        opportunity: "Carry one recent winner forward instead of forcing a fresh speculative angle.",
        reason: input.weeklyRecap.winners[0].reason,
        supportingSignals: [
          input.weeklyRecap.summary[0] ?? "",
          input.weeklyRecap.commercialHighlights[0] ?? "",
        ],
        linkedWorkflow: input.weeklyRecap.winners[0].href ?? "/recap",
        confidence: input.weeklyRecap.winners[0].postCount >= 2 ? "medium" : "low",
        urgency: "low",
      }),
    );
  }

  const sourcePressure = input.sourceAutopilotState.proposalSummary.openPauseCount;
  const sorted = sortOpportunities(opportunities).slice(0, 5);
  const topSummary = sorted[0]
    ? `Commercial opportunity: ${sorted[0].title}.`
    : input.growthMemory?.topNotes[0]
      ? `Commercial memory signal: ${input.growthMemory.topNotes[0]}`
    : sourcePressure > 0
      ? "No commercial opportunity is strong enough to elevate while source quality pressure remains high."
      : "No commercial opportunity is strong enough to elevate yet.";

  return {
    generatedAt: now.toISOString(),
    topSummary,
    opportunities: sorted,
  };
}
