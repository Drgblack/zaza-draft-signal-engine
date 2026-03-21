import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { AudienceMemoryState } from "@/lib/audience-memory";
import type { GrowthDirectorSummary } from "@/lib/growth-director";
import type { GrowthMemoryState } from "@/lib/growth-memory";
import type { InfluencerGraphSummary } from "@/lib/influencer-graph";
import type { FunnelEngineState } from "@/lib/funnel-engine";
import type { RevenueAmplifierState } from "@/lib/revenue-amplifier";
import {
  getRecommendationFamilyForStrategicCategory,
  getRecommendationWeight,
  type RecommendationTuningState,
} from "@/lib/recommendation-tuning";
import type { FlywheelOptimisationState } from "@/lib/flywheel-optimisation";
import type { FounderOverrideState } from "@/lib/founder-overrides";
import type { RevenueSignalInsights } from "@/lib/revenue-signals";
import type { SourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import type { WeeklyRecap } from "@/lib/weekly-recap";
import type { WeeklyPostingPack } from "@/lib/weekly-posting-pack";

export const STRATEGIC_DECISION_CATEGORIES = [
  "campaign_focus",
  "platform_mix",
  "funnel_mix",
  "evergreen_balance",
  "experiment_pacing",
  "source_quality",
  "outreach_focus",
  "conversion_pressure",
] as const;

export type StrategicDecisionCategory = (typeof STRATEGIC_DECISION_CATEGORIES)[number];

export interface StrategicDecisionProposal {
  proposalId: string;
  category: StrategicDecisionCategory;
  title: string;
  recommendation: string;
  reason: string;
  expectedBenefit: string;
  supportingSignals: string[];
  linkedWorkflow: string;
  priority: "high" | "medium" | "low";
}

export interface StrategicDecisionState {
  generatedAt: string;
  proposals: StrategicDecisionProposal[];
  topSummary: string[];
}

function founderOverrideCategory(
  state: FounderOverrideState | null | undefined,
): StrategicDecisionCategory {
  const override = state?.activeOverrides[0];
  switch (override?.targetArea) {
    case "platform_priority":
      return "platform_mix";
    case "experiment_pacing":
      return "experiment_pacing";
    case "conversion_pressure":
      return "conversion_pressure";
    case "campaign_focus":
      return "campaign_focus";
    case "messaging_focus":
    case "planning_focus":
    default:
      return "funnel_mix";
  }
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function createProposal(input: StrategicDecisionProposal): StrategicDecisionProposal {
  return {
    ...input,
    supportingSignals: input.supportingSignals.filter(Boolean).slice(0, 4),
  };
}

function priorityWeight(priority: StrategicDecisionProposal["priority"]) {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function sortProposals(
  items: StrategicDecisionProposal[],
  tuning?: RecommendationTuningState | null,
) {
  return [...items].sort(
    (left, right) =>
      priorityWeight(right.priority) +
        (getRecommendationWeight(tuning, getRecommendationFamilyForStrategicCategory(right.category)) - 1) -
        (priorityWeight(left.priority) +
          (getRecommendationWeight(tuning, getRecommendationFamilyForStrategicCategory(left.category)) - 1)) ||
      left.title.localeCompare(right.title),
  );
}

function topSummaryLines(proposals: StrategicDecisionProposal[]) {
  const lines: string[] = [];
  if (proposals[0]) {
    uniquePush(lines, `${proposals[0].title}: ${proposals[0].recommendation}`);
  }
  if (proposals[1]) {
    uniquePush(lines, `${proposals[1].title}: ${proposals[1].expectedBenefit}`);
  }
  if (proposals[2]) {
    uniquePush(lines, `${proposals[2].title}: ${proposals[2].reason}`);
  }
  return lines.slice(0, 3);
}

export function buildStrategicDecisionState(input: {
  growthDirector: GrowthDirectorSummary;
  weeklyRecap: WeeklyRecap;
  optimisation: FlywheelOptimisationState;
  weeklyPostingPack: WeeklyPostingPack;
  approvalCandidates: ApprovalQueueCandidate[];
  sourceAutopilotState: SourceAutopilotV2State;
  revenueInsights: RevenueSignalInsights;
  audienceMemory: AudienceMemoryState;
  influencerGraphSummary: InfluencerGraphSummary;
  funnelEngine?: FunnelEngineState | null;
  growthMemory?: GrowthMemoryState | null;
  revenueAmplifier?: RevenueAmplifierState | null;
  activeExperimentCount?: number;
  recommendationTuning?: RecommendationTuningState | null;
  founderOverrides?: FounderOverrideState | null;
  now?: Date;
}): StrategicDecisionState {
  const now = input.now ?? new Date();
  const proposals: StrategicDecisionProposal[] = [];
  const staleReusableCount = input.approvalCandidates.filter(
    (candidate) => candidate.triage.triageState === "stale_but_reusable",
  ).length;
  const campaignCriticalCount = input.weeklyPostingPack.items.filter(
    (item) => item.isCampaignCritical,
  ).length;
  const evergreenCount = input.weeklyPostingPack.items.filter(
    (item) => item.source === "evergreen",
  ).length;
  const trustFirstCount = input.approvalCandidates.filter(
    (candidate) => candidate.conversionIntent.posture === "trust_first",
  ).length;
  const conversionCount = input.approvalCandidates.filter(
    (candidate) =>
      candidate.conversionIntent.posture === "soft_conversion" ||
      candidate.conversionIntent.posture === "direct_conversion",
  ).length;
  const topPlatform = input.weeklyPostingPack.platformMix[0] ?? null;
  const activeExperimentCount = input.activeExperimentCount ?? input.weeklyRecap.supportingMetrics.experimentCount;
  const bestMemoryCombo = input.growthMemory?.currentBestCombos[0] ?? null;
  const weakMemoryCombo = input.growthMemory?.currentWeakCombos[0] ?? null;
  const topRevenueAmplifier = input.revenueAmplifier?.amplifiedPatterns[0] ?? null;
  const topRevenueCaution = input.revenueAmplifier?.cautionPatterns[0] ?? null;
  const topFunnelIncrease = input.funnelEngine?.recommendedNextMix.find(
    (row) => row.recommendedAdjustment === "increase",
  ) ?? null;
  const topFunnelReduce = input.funnelEngine?.recommendedNextMix.find(
    (row) => row.recommendedAdjustment === "reduce",
  ) ?? null;
  const topFounderOverride = input.founderOverrides?.activeOverrides[0] ?? null;

  if (topFounderOverride) {
    proposals.push(
      createProposal({
        proposalId: `founder-override:${topFounderOverride.overrideId}`,
        category: founderOverrideCategory(input.founderOverrides),
        title: "Follow the current founder override",
        recommendation: topFounderOverride.instruction,
        reason: `A ${topFounderOverride.priority}-priority founder override is active until ${new Date(topFounderOverride.expiresAt).toLocaleDateString("en-GB")}.`,
        expectedBenefit: "This keeps strategic recommendations aligned with current founder direction without changing safety boundaries.",
        supportingSignals: input.founderOverrides?.topNotes.slice(0, 2) ?? [],
        linkedWorkflow: "/overrides",
        priority: topFounderOverride.priority,
      }),
    );
  }

  if (
    input.sourceAutopilotState.proposalSummary.openPauseCount > 0 ||
    input.sourceAutopilotState.proposalSummary.openQueryRewriteCount > 0
  ) {
    proposals.push(
      createProposal({
        proposalId: "source-quality-tighten",
        category: "source_quality",
        title: "Tighten weak source families",
        recommendation: "Pause or rewrite the noisiest sources before adding more queue volume this week.",
        reason: `${input.sourceAutopilotState.proposalSummary.openPauseCount} pause proposal${input.sourceAutopilotState.proposalSummary.openPauseCount === 1 ? "" : "s"} and ${input.sourceAutopilotState.proposalSummary.openQueryRewriteCount} query rewrite${input.sourceAutopilotState.proposalSummary.openQueryRewriteCount === 1 ? "" : "s"} indicate upstream quality drift.`,
        expectedBenefit: "Cleaner source inputs should reduce low-value queue noise and operator judgement load.",
        supportingSignals: [
          input.growthDirector.topBottlenecks[0]?.reason ?? "",
          `${input.sourceAutopilotState.proposalSummary.openCount} open source proposal${input.sourceAutopilotState.proposalSummary.openCount === 1 ? "" : "s"}`,
        ],
        linkedWorkflow: "/ingestion",
        priority: input.sourceAutopilotState.proposalSummary.openPauseCount > 0 ? "high" : "medium",
      }),
    );
  }

  if (
    staleReusableCount >= 2 ||
    (input.weeklyRecap.reuseCandidates.length > 0 && evergreenCount === 0)
  ) {
    proposals.push(
      createProposal({
        proposalId: "evergreen-balance-increase",
        category: "evergreen_balance",
        title: "Increase evergreen share slightly",
        recommendation: "Shift some weekly effort toward evergreen reuse instead of relying only on fresh queue supply.",
        reason: `${staleReusableCount} reusable stale candidate${staleReusableCount === 1 ? "" : "s"} and ${input.weeklyRecap.reuseCandidates.length} recap reuse cue${input.weeklyRecap.reuseCandidates.length === 1 ? "" : "s"} suggest existing winners can carry more of the week.`,
        expectedBenefit: "More evergreen support should reduce sourcing pressure while keeping output quality steadier.",
        supportingSignals: [
          input.weeklyRecap.reuseCandidates[0]?.reason ?? "",
          input.weeklyPostingPack.coverageSummary.summary,
        ],
        linkedWorkflow: "/weekly-pack",
        priority: "medium",
      }),
    );
  }

  if (activeExperimentCount >= 3) {
    proposals.push(
      createProposal({
        proposalId: "experiment-pacing-reduce",
        category: "experiment_pacing",
        title: "Reduce experiment load temporarily",
        recommendation: "Hold new experiment volume until more of the active tests are resolved.",
        reason: `${activeExperimentCount} experiment${activeExperimentCount === 1 ? "" : "s"} are still open or newly active, which can dilute learning quality and operator follow-up.`,
        expectedBenefit: "Lower experiment concurrency should make outcomes easier to interpret and act on.",
        supportingSignals: [
          input.growthDirector.topBottlenecks.find((item) => item.href === "/follow-up")?.reason ?? "",
          input.optimisation.highestPriorityProposal?.reason ?? "",
        ],
        linkedWorkflow: "/experiments",
        priority: activeExperimentCount >= 5 ? "high" : "medium",
      }),
    );
  }

  if (campaignCriticalCount >= 2) {
    proposals.push(
      createProposal({
        proposalId: "campaign-focus-push",
        category: "campaign_focus",
        title: "Push the current campaign harder",
        recommendation: "Protect and prioritize campaign-critical items in this week's execution flow.",
        reason: `${campaignCriticalCount} weekly-pack item${campaignCriticalCount === 1 ? "" : "s"} are already campaign-critical, which means the queue is aligned enough to lean in rather than dilute focus.`,
        expectedBenefit: "A tighter campaign push should improve strategic coherence and reduce scattered execution.",
        supportingSignals: [
          input.weeklyPostingPack.coverageSummary.notes[0] ?? "",
          input.growthDirector.currentFocus.reason,
        ],
        linkedWorkflow: "/plan",
        priority: "medium",
      }),
    );
  }

  if (topPlatform && input.weeklyPostingPack.items.length >= 4 && topPlatform.count >= Math.ceil(input.weeklyPostingPack.items.length * 0.6)) {
    proposals.push(
      createProposal({
        proposalId: "platform-mix-rebalance",
        category: "platform_mix",
        title: `Reduce ${topPlatform.label} concentration this week`,
        recommendation: `Rebalance the weekly mix so ${topPlatform.label} does not dominate the pack quite as heavily.`,
        reason: `${topPlatform.count} of ${input.weeklyPostingPack.items.length} pack items currently lean on ${topPlatform.label}.`,
        expectedBenefit: "A slightly broader platform mix should improve learning coverage and reduce channel fatigue risk.",
        supportingSignals: [
          input.weeklyPostingPack.platformMix.map((row) => `${row.count} ${row.label}`).join(" · "),
          input.growthDirector.contentSummary,
        ],
        linkedWorkflow: "/weekly-pack",
        priority: "medium",
      }),
    );
  }

  if (
    trustFirstCount >= Math.max(2, conversionCount * 2) &&
    input.revenueInsights.highStrengthCount < Math.max(2, trustFirstCount)
  ) {
    proposals.push(
      createProposal({
        proposalId: "conversion-pressure-soften-upgrade",
        category: "conversion_pressure",
        title: "Increase soft-conversion pressure on selected trust items",
        recommendation: "Keep trust-first tone, but move a few proven items toward soft-conversion CTA and destination pairings.",
        reason: `${trustFirstCount} trust-first candidate${trustFirstCount === 1 ? "" : "s"} are available while strong revenue-linked signals are still comparatively thin.`,
        expectedBenefit: "This should improve commercial follow-through without forcing direct-conversion pressure too early.",
        supportingSignals: [
          input.revenueInsights.summaries[0] ?? "",
          input.audienceMemory.topNotes[0] ?? "",
        ],
        linkedWorkflow: "/review",
        priority: "high",
      }),
    );
  }

  if (input.influencerGraphSummary.relationshipOpportunityCount > 0 || input.influencerGraphSummary.followUpNeededCount > 0) {
    proposals.push(
      createProposal({
        proposalId: "outreach-focus-priority",
        category: "outreach_focus",
        title: "Prioritize influencer-relevant content and follow-ups",
        recommendation: "Use this week's stronger trust or collaboration-friendly signals to support outreach and relationship momentum.",
        reason:
          input.influencerGraphSummary.newRepliesPendingCount > 0
            ? `${input.influencerGraphSummary.newRepliesPendingCount} reply${input.influencerGraphSummary.newRepliesPendingCount === 1 ? "" : "ies"} and ${input.influencerGraphSummary.relationshipOpportunityCount} relationship opportunit${input.influencerGraphSummary.relationshipOpportunityCount === 1 ? "y" : "ies"} are currently open.`
            : `${input.influencerGraphSummary.followUpNeededCount} relationship follow-up${input.influencerGraphSummary.followUpNeededCount === 1 ? "" : "s"} are open and can be supported by fresh content context.`,
        expectedBenefit: "This should turn strong trust content into more relationship leverage instead of leaving outreach context idle.",
        supportingSignals: [
          input.growthDirector.strongestOpportunities.find((item) => item.href === "/influencers")?.reason ?? "",
          input.audienceMemory.topNotes[0] ?? "",
        ],
        linkedWorkflow: "/signals",
        priority: "medium",
      }),
    );
  }

  if (topFunnelIncrease || topFunnelReduce || (input.audienceMemory.topNotes[0] && conversionCount === 0 && trustFirstCount > 0)) {
    proposals.push(
      createProposal({
        proposalId: "funnel-mix-trust-emphasis",
        category: "funnel_mix",
        title:
          topFunnelIncrease?.stage === "Conversion"
            ? "Increase conversion-stage support selectively"
            : topFunnelIncrease?.stage === "Consideration"
              ? "Increase consideration-stage support next"
              : topFunnelIncrease?.stage === "Awareness"
                ? "Rebuild top-of-funnel coverage"
                : "Emphasize trust-stage content before harder conversion",
        recommendation:
          input.funnelEngine?.recommendedShift ??
          "Keep the weekly mix weighted toward trust-stage framing until audience evidence justifies more direct asks.",
        reason:
          topFunnelIncrease?.reason ??
          topFunnelReduce?.reason ??
          input.audienceMemory.topNotes[0] ??
          input.funnelEngine?.currentFunnelBalance ??
          "The current funnel mix needs a small adjustment.",
        expectedBenefit:
          topFunnelIncrease?.stage === "Conversion"
            ? "This should convert stronger trust momentum into more commercial follow-through."
            : "A cleaner funnel balance should improve response quality without forcing rigid ratios.",
        supportingSignals: [
          input.funnelEngine?.supportingSignals[0] ?? "",
          input.weeklyPostingPack.coverageSummary.summary,
        ],
        linkedWorkflow: "/plan",
        priority: "medium",
      }),
    );
  }

  if (bestMemoryCombo && !proposals.some((proposal) => proposal.category === "campaign_focus")) {
    proposals.push(
      createProposal({
        proposalId: "growth-memory-focus",
        category: "campaign_focus",
        title: "Concentrate this week around the strongest remembered commercial family",
        recommendation: `Use ${bestMemoryCombo.label} as a stronger planning anchor instead of spreading effort across weaker themes.`,
        reason: bestMemoryCombo.reason,
        expectedBenefit: "Planning around a currently reinforced memory signal should reduce drift and improve reuse of proven combinations.",
        supportingSignals: [
          input.growthMemory?.commercialMemory.currentPosture ?? "",
          input.growthMemory?.topNotes[0] ?? "",
        ],
        linkedWorkflow: bestMemoryCombo.href,
        priority: "medium",
      }),
    );
  }

  if (topRevenueAmplifier && !proposals.some((proposal) => proposal.category === "conversion_pressure")) {
    proposals.push(
      createProposal({
        proposalId: "revenue-amplifier-push",
        category:
          topRevenueAmplifier.platform === "linkedin" ? "platform_mix" : "conversion_pressure",
        title: "Amplify the strongest revenue-backed content family",
        recommendation: topRevenueAmplifier.recommendation,
        reason: topRevenueAmplifier.reason,
        expectedBenefit: "This should reuse proven commercial patterns more deliberately without turning the whole mix into a single repetitive play.",
        supportingSignals: topRevenueAmplifier.supportingSignals,
        linkedWorkflow: "/plan",
        priority: topRevenueAmplifier.revenueStrength === "high" ? "high" : "medium",
      }),
    );
  }

  if (weakMemoryCombo && !proposals.some((proposal) => proposal.category === "platform_mix")) {
    proposals.push(
      createProposal({
        proposalId: "growth-memory-caution",
        category: "platform_mix",
        title: "Avoid repeating a memory-backed weak combination",
        recommendation: `Reduce emphasis on ${weakMemoryCombo.label.toLowerCase()} until a cleaner context justifies retesting it.`,
        reason: weakMemoryCombo.reason,
        expectedBenefit: "This should reduce avoidable noise from combinations that current memory already treats cautiously.",
        supportingSignals: [
          input.growthMemory?.cautionMemorySummary.headline ?? "",
        ],
        linkedWorkflow: weakMemoryCombo.href,
        priority: "low",
      }),
    );
  }

  if (topRevenueCaution && !proposals.some((proposal) => proposal.proposalId === "revenue-amplifier-caution")) {
    proposals.push(
      createProposal({
        proposalId: "revenue-amplifier-caution",
        category: "platform_mix",
        title: "Reduce emphasis on a weak revenue-backed route",
        recommendation: topRevenueCaution.recommendation,
        reason: topRevenueCaution.reason,
        expectedBenefit: "This should stop weaker commercial pairings from taking slots away from stronger combinations.",
        supportingSignals: topRevenueCaution.supportingSignals,
        linkedWorkflow: "/plan",
        priority: "low",
      }),
    );
  }

  const sorted = sortProposals(proposals, input.recommendationTuning).slice(0, 5);

  return {
    generatedAt: now.toISOString(),
    proposals: sorted,
    topSummary: topSummaryLines(sorted),
  };
}
