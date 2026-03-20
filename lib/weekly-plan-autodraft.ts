import type { CampaignStrategy } from "@/lib/campaigns";
import { EDITORIAL_MODE_DEFINITIONS } from "@/lib/editorial-modes";
import { buildEvergreenSummary } from "@/lib/evergreen";
import type { PostingOutcome } from "@/lib/outcome-memory";
import type { PostingLogEntry, PostingPlatform } from "@/lib/posting-memory";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import {
  WEEKLY_PLAN_FUNNEL_LABELS,
  type WeeklyPlan,
  type WeeklyPlanContentSourceKey,
  type WeeklyPlanPlanningConfidence,
  type WeeklyPlanPriority,
  type WeeklyPlanTemplateId,
} from "@/lib/weekly-plan";
import { EDITORIAL_MODES, FUNNEL_STAGES, type EditorialMode, type FunnelStage, type SignalRecord } from "@/types/signal";

export interface WeeklyPlanAutoDraft {
  id: string;
  weekStartDate: string;
  proposedTheme: string | null;
  proposedGoals: string[];
  proposedActiveCampaignIds: string[];
  proposedTargetPlatforms: PostingPlatform[];
  proposedTargetFunnelMix: Record<FunnelStage, WeeklyPlanPriority>;
  proposedTargetModeMix: Record<EditorialMode, WeeklyPlanPriority>;
  proposedTargetContentSources: Record<WeeklyPlanContentSourceKey, WeeklyPlanPriority>;
  proposalReasons: string[];
  identifiedGaps: string[];
  planningConfidence: WeeklyPlanPlanningConfidence;
  generatedAt: string;
  suggestedTemplateId: WeeklyPlanTemplateId;
  queueSummary: {
    approvalReadyCount: number;
    freshCandidateCount: number;
    evergreenCandidateCount: number;
    reusedCandidateCount: number;
    topReadyPlatformLabel: string | null;
  };
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function formatWeekStart(date: Date): string {
  return startOfWeek(date).toISOString().slice(0, 10);
}

function getNextWeekStartDate(now = new Date()): string {
  const next = startOfWeek(now);
  next.setDate(next.getDate() + 7);
  return formatWeekStart(next);
}

function isWithinDays(value: string | null | undefined, days: number, now: Date): boolean {
  if (!value) {
    return false;
  }

  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    return false;
  }

  return parsed >= now.getTime() - days * 24 * 60 * 60 * 1000;
}

function increment<K extends string>(map: Map<K, number>, key: K | null | undefined) {
  if (!key) {
    return;
  }

  map.set(key, (map.get(key) ?? 0) + 1);
}

function topKey<K extends string>(map: Map<K, number>): K | null {
  return [...map.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))[0]?.[0] ?? null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function clampPriority(value: number): WeeklyPlanPriority {
  return Math.max(0, Math.min(3, Math.round(value))) as WeeklyPlanPriority;
}

function normalizePlatforms(platforms: PostingPlatform[]): PostingPlatform[] {
  return Array.from(new Set(platforms)).slice(0, 3) as PostingPlatform[];
}

function buildDefaultFunnelMix(): Record<FunnelStage, WeeklyPlanPriority> {
  return {
    Awareness: 2,
    Trust: 2,
    Consideration: 1,
    Conversion: 1,
    Retention: 0,
  };
}

function buildDefaultModeMix(): Record<EditorialMode, WeeklyPlanPriority> {
  return Object.fromEntries(
    EDITORIAL_MODES.map((mode) => [
      mode,
      mode === "helpful_tip" ? 2 : mode === "professional_guidance" || mode === "calm_insight" ? 1 : 0,
    ]),
  ) as Record<EditorialMode, WeeklyPlanPriority>;
}

function buildDefaultContentSources(): Record<WeeklyPlanContentSourceKey, WeeklyPlanPriority> {
  return {
    freshSignals: 2,
    evergreen: 1,
    reusedHighPerformers: 1,
  };
}

function cloneFromPlan<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function scorePlatformOutcomes(
  postingEntries: PostingLogEntry[],
  strategicOutcomes: StrategicOutcome[],
  postingOutcomes: PostingOutcome[],
  now: Date,
): Map<PostingPlatform, number> {
  const entryById = new Map(postingEntries.map((entry) => [entry.id, entry]));
  const scores = new Map<PostingPlatform, number>();

  for (const outcome of strategicOutcomes.filter((item) => isWithinDays(item.recordedAt, 45, now))) {
    const score =
      outcome.strategicValue === "high"
        ? 3
        : outcome.strategicValue === "medium"
          ? 2
          : outcome.strategicValue === "low"
            ? -1
            : 0;
    scores.set(outcome.platform, (scores.get(outcome.platform) ?? 0) + score + ((outcome.leadsOrSignups ?? 0) > 0 ? 1 : 0));
  }

  for (const outcome of postingOutcomes.filter((item) => isWithinDays(item.timestamp, 45, now))) {
    const entry = entryById.get(outcome.postingLogId);
    if (!entry) {
      continue;
    }

    const delta =
      outcome.outcomeQuality === "strong"
        ? 2
        : outcome.outcomeQuality === "acceptable"
          ? 1
          : -1;
    scores.set(entry.platform, (scores.get(entry.platform) ?? 0) + delta);
  }

  return scores;
}

export function buildWeeklyPlanAutoDraft(input: {
  strategy: CampaignStrategy;
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  plans: WeeklyPlan[];
  now?: Date;
}): WeeklyPlanAutoDraft {
  const now = input.now ?? new Date();
  const nextWeekStartDate = getNextWeekStartDate(now);
  const currentPlan = input.plans.find((plan) => plan.weekStartDate === formatWeekStart(now)) ?? null;
  const recentSignals = input.signals.filter((signal) => isWithinDays(signal.createdDate, 14, now) || isWithinDays(signal.postedDate, 14, now));
  const recentPostingEntries = input.postingEntries.filter((entry) => isWithinDays(entry.postedAt, 14, now));
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));

  const activeCampaigns = input.strategy.campaigns.filter((campaign) => campaign.status === "active");
  const evergreenSummary = buildEvergreenSummary({
    signals: input.signals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    strategicOutcomes: input.strategicOutcomes,
    strategy: input.strategy,
    weeklyPlan: currentPlan,
    maxCandidates: 5,
    now,
  });
  const campaignCounts = new Map<string, number>();
  const funnelCounts = new Map<FunnelStage, number>();
  const modeCounts = new Map<EditorialMode, number>();
  const platformCounts = new Map<PostingPlatform, number>();
  const destinationCounts = new Map<string, number>();
  const reusableWinnerCounts = new Map<EditorialMode, number>();
  const queuePlatformCounts = new Map<PostingPlatform, number>();

  for (const signal of recentSignals) {
    increment(campaignCounts, signal.campaignId);
    increment(funnelCounts, signal.funnelStage);
    increment(modeCounts, signal.editorialMode);
  }

  for (const entry of recentPostingEntries) {
    increment(platformCounts, entry.platform);
    increment(destinationCounts, entry.selectedSiteLinkId ?? entry.destinationLabel ?? null);
  }

  for (const outcome of input.postingOutcomes.filter((item) => isWithinDays(item.timestamp, 45, now))) {
    if (outcome.outcomeQuality !== "strong" && outcome.reuseRecommendation !== "reuse_this_approach") {
      continue;
    }
    const signal = signalById.get(outcome.signalId);
    if (signal?.editorialMode) {
      increment(reusableWinnerCounts, signal.editorialMode);
    }
  }

  const approvalReadySignals = input.signals.filter((signal) => {
    if (signal.status === "Posted" || signal.status === "Archived" || signal.status === "Rejected") {
      return false;
    }
    if (!signal.xDraft && !signal.linkedInDraft && !signal.redditDraft) {
      return false;
    }
    return signal.status === "Draft Generated" || signal.status === "Reviewed" || signal.status === "Approved";
  });

  let freshCandidateCount = 0;
  const evergreenCandidateCount = evergreenSummary.surfacedCount;
  const reusedCandidateCount = evergreenSummary.directReuseCount;
  for (const signal of approvalReadySignals) {
    freshCandidateCount += 1;

    const suggestedPlatform =
      signal.platformPriority === "LinkedIn First"
        ? "linkedin"
        : signal.platformPriority === "Reddit First"
          ? "reddit"
          : "x";
    increment(queuePlatformCounts, suggestedPlatform);
  }

  const platformOutcomeScores = scorePlatformOutcomes(
    input.postingEntries,
    input.strategicOutcomes,
    input.postingOutcomes,
    now,
  );
  const strongestPlatform = topKey(platformOutcomeScores);
  const overusedPlatform = [...platformCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const overusedMode = [...modeCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const strongestReusableMode = topKey(reusableWinnerCounts);

  const proposedTargetFunnelMix = currentPlan ? cloneFromPlan(currentPlan.targetFunnelMix) : buildDefaultFunnelMix();
  const proposedTargetModeMix = currentPlan ? cloneFromPlan(currentPlan.targetModeMix) : buildDefaultModeMix();
  const proposedTargetContentSources = currentPlan
    ? cloneFromPlan(currentPlan.targetContentSources)
    : buildDefaultContentSources();
  let proposedTargetPlatforms = currentPlan ? [...currentPlan.targetPlatforms] : (["linkedin", "x"] as PostingPlatform[]);

  const proposalReasons: string[] = [];
  const identifiedGaps: string[] = [];
  const proposedGoals: string[] = [];

  for (const stage of FUNNEL_STAGES) {
    if ((funnelCounts.get(stage) ?? 0) === 0 && (stage === "Trust" || stage === "Conversion")) {
      proposedTargetFunnelMix[stage] = clampPriority(Math.max(proposedTargetFunnelMix[stage], 2));
      uniquePush(identifiedGaps, `No ${WEEKLY_PLAN_FUNNEL_LABELS[stage].toLowerCase()} content landed in the recent mix.`);
    }
  }

  const awarenessCount = funnelCounts.get("Awareness") ?? 0;
  const trustCount = funnelCounts.get("Trust") ?? 0;
  const conversionCount = funnelCounts.get("Conversion") ?? 0;
  if (awarenessCount >= Math.max(3, trustCount + 2)) {
    proposedTargetFunnelMix.Trust = 3;
    proposedTargetFunnelMix.Awareness = clampPriority(Math.min(proposedTargetFunnelMix.Awareness, 2));
    uniquePush(proposalReasons, "Awareness content dominated recently, so the draft increases Trust coverage next week.");
  }
  if (conversionCount === 0) {
    proposedTargetFunnelMix.Conversion = clampPriority(
      Math.max(proposedTargetFunnelMix.Conversion, activeCampaigns.length > 0 ? 2 : 1),
    );
    uniquePush(proposalReasons, "Recent output had no conversion-oriented content, so the draft restores some conversion support.");
  }

  const underSupportedCampaigns = activeCampaigns
    .map((campaign) => ({ campaign, recentCount: campaignCounts.get(campaign.id) ?? 0 }))
    .sort((left, right) => left.recentCount - right.recentCount || left.campaign.name.localeCompare(right.campaign.name));
  const proposedActiveCampaignIds = underSupportedCampaigns.slice(0, 3).map((entry) => entry.campaign.id);
  const leadCampaign = underSupportedCampaigns[0];
  if (leadCampaign && leadCampaign.recentCount === 0) {
    uniquePush(proposalReasons, `Campaign "${leadCampaign.campaign.name}" is active but under-supported, so it is prioritized next week.`);
    uniquePush(identifiedGaps, `${leadCampaign.campaign.name} has no recent supporting posts.`);
  }
  if (
    leadCampaign &&
    evergreenSummary.candidates.some((candidate) => candidate.signal.campaignId === leadCampaign.campaign.id)
  ) {
    uniquePush(
      proposalReasons,
      `Active campaign support is available from evergreen winners, so the draft keeps campaign-linked reuse in the mix.`,
    );
  }

  if (strongestPlatform && (platformOutcomeScores.get(strongestPlatform) ?? 0) > 0) {
    if (!proposedTargetPlatforms.includes(strongestPlatform)) {
      proposedTargetPlatforms = normalizePlatforms([strongestPlatform, ...proposedTargetPlatforms]);
    }
    uniquePush(proposalReasons, `${getPostingPlatformLabel(strongestPlatform)} generated the strongest recent outcomes, so the draft leans slightly more toward it.`);
  }

  if (overusedPlatform && platformCounts.get(overusedPlatform)! >= 4) {
    uniquePush(identifiedGaps, `${getPostingPlatformLabel(overusedPlatform)} dominated the recent posting mix.`);
    proposedTargetPlatforms = normalizePlatforms(proposedTargetPlatforms);
    if (proposedTargetPlatforms.length === 3 && strongestPlatform && strongestPlatform !== overusedPlatform) {
      proposedTargetPlatforms = proposedTargetPlatforms.filter((platform) => platform !== overusedPlatform) as PostingPlatform[];
      if (!proposedTargetPlatforms.includes(overusedPlatform === "linkedin" ? "reddit" : "linkedin")) {
        proposedTargetPlatforms = normalizePlatforms([
          ...proposedTargetPlatforms,
          overusedPlatform === "linkedin" ? "reddit" : "linkedin",
        ]);
      }
    }
  }

  if (recentPostingEntries.every((entry) => entry.platform !== "reddit")) {
    if (!proposedTargetPlatforms.includes("reddit")) {
      proposedTargetPlatforms = normalizePlatforms([...proposedTargetPlatforms, "reddit"]);
    }
    uniquePush(identifiedGaps, "No Reddit content was posted recently.");
    if (evergreenSummary.candidates.some((candidate) => candidate.surfacedPlatform === "reddit")) {
      uniquePush(proposalReasons, "Evergreen candidates can restore Reddit coverage without depending only on fresh signals.");
    }
  }

  if (overusedMode && (modeCounts.get(overusedMode) ?? 0) >= 3) {
    proposedTargetModeMix[overusedMode] = clampPriority(Math.min(proposedTargetModeMix[overusedMode], 1));
    uniquePush(identifiedGaps, `${EDITORIAL_MODE_DEFINITIONS[overusedMode].label} has been overused recently.`);
  }

  if (strongestReusableMode) {
    proposedTargetModeMix[strongestReusableMode] = clampPriority(
      Math.max(proposedTargetModeMix[strongestReusableMode], 2),
    );
    uniquePush(proposalReasons, `${EDITORIAL_MODE_DEFINITIONS[strongestReusableMode].label} has reusable winners behind it, so the draft keeps it visible.`);
  }

  if (freshCandidateCount <= 2) {
    proposedTargetContentSources.freshSignals = 1;
    proposedTargetContentSources.evergreen = clampPriority(Math.max(proposedTargetContentSources.evergreen, 2));
    proposedTargetContentSources.reusedHighPerformers = clampPriority(
      Math.max(proposedTargetContentSources.reusedHighPerformers, 2),
    );
    uniquePush(proposalReasons, "Fresh signal supply is thinner in the current queue, so the draft increases evergreen and reused winners.");
  } else {
    proposedTargetContentSources.freshSignals = clampPriority(Math.max(proposedTargetContentSources.freshSignals, 2));
  }

  if (evergreenSummary.surfacedCount > 0) {
    proposedTargetContentSources.evergreen = clampPriority(
      Math.max(proposedTargetContentSources.evergreen, evergreenSummary.directReuseCount > 0 ? 2 : 1),
    );
    if (evergreenSummary.adaptBeforeReuseCount > 0) {
      proposedTargetContentSources.reusedHighPerformers = clampPriority(
        Math.max(proposedTargetContentSources.reusedHighPerformers, 2),
      );
    }
  }

  if (reusedCandidateCount > freshCandidateCount && reusedCandidateCount >= 2) {
    proposedTargetContentSources.reusedHighPerformers = 3;
    uniquePush(proposedGoals, "Resurface at least one reusable winner without over-relying on only fresh signals.");
  }

  if (evergreenSummary.candidates.some((candidate) => candidate.funnelStage === "Trust")) {
    if ((funnelCounts.get("Trust") ?? 0) === 0) {
      uniquePush(proposalReasons, "Evergreen trust-stage winners are available to fill the current trust gap.");
    }
  }

  if (evergreenSummary.candidates.some((candidate) => candidate.funnelStage === "Conversion")) {
    if ((funnelCounts.get("Conversion") ?? 0) === 0) {
      uniquePush(proposalReasons, "Evergreen conversion-supporting winners can backfill the current conversion gap.");
    }
  }

  if (destinationCounts.size <= 1 && recentPostingEntries.length >= 3) {
    uniquePush(identifiedGaps, "Destination-link variety has been thin, so the draft should diversify CTA destinations.");
  }

  if (proposedGoals.length === 0) {
    uniquePush(proposedGoals, "Rebalance the weekly mix across funnel stages and platforms.");
  }
  if (proposedActiveCampaignIds.length > 0) {
    const campaignName = input.strategy.campaigns.find((campaign) => campaign.id === proposedActiveCampaignIds[0])?.name;
    uniquePush(proposedGoals, campaignName ? `Support ${campaignName} with at least one strong post.` : "Support the active campaign mix.");
  }
  if (proposedTargetFunnelMix.Conversion >= 2) {
    uniquePush(proposedGoals, "Add at least one clearer consideration or conversion-oriented post.");
  }
  if (proposedTargetPlatforms.includes("reddit") && recentPostingEntries.every((entry) => entry.platform !== "reddit")) {
    uniquePush(proposedGoals, "Restore some Reddit coverage with a discussion-safe post.");
  }

  const proposedTheme =
    leadCampaign?.campaign.name ??
    (proposedTargetFunnelMix.Conversion >= 2 ? "Trust to conversion balance" : "Balanced weekly mix");

  const planningConfidence: WeeklyPlanPlanningConfidence =
    activeCampaigns.length > 0 && input.strategicOutcomes.length >= 3 && approvalReadySignals.length >= 3
      ? "high"
      : input.strategicOutcomes.length >= 1 || approvalReadySignals.length >= 2
        ? "moderate"
        : "low";

  const suggestedTemplateId: WeeklyPlanTemplateId =
    leadCampaign?.recentCount === 0
      ? "campaign_heavy"
      : proposedTargetFunnelMix.Conversion >= 2
        ? "lead_generation"
        : awarenessCount >= 3 && conversionCount === 0
          ? "balanced_mix"
          : "balanced_mix";

  const queueTopPlatform = topKey(queuePlatformCounts);

  return {
    id: `weekly-plan-autodraft-${nextWeekStartDate}`,
    weekStartDate: nextWeekStartDate,
    proposedTheme,
    proposedGoals: proposedGoals.slice(0, 5),
    proposedActiveCampaignIds,
    proposedTargetPlatforms: proposedTargetPlatforms.slice(0, 3),
    proposedTargetFunnelMix,
    proposedTargetModeMix,
    proposedTargetContentSources,
    proposalReasons: proposalReasons.slice(0, 5),
    identifiedGaps: identifiedGaps.slice(0, 5),
    planningConfidence,
    generatedAt: now.toISOString(),
    suggestedTemplateId,
    queueSummary: {
      approvalReadyCount: approvalReadySignals.length,
      freshCandidateCount,
      evergreenCandidateCount,
      reusedCandidateCount,
      topReadyPlatformLabel: queueTopPlatform ? getPostingPlatformLabel(queueTopPlatform) : null,
    },
  };
}

export function toWeeklyPlanInputFromAutoDraft(
  draft: WeeklyPlanAutoDraft,
  options?: {
    acceptWithEdits?: boolean;
  },
): WeeklyPlan {
  const timestamp = new Date().toISOString();

  return {
    id: `weekly-plan-${draft.weekStartDate}`,
    weekStartDate: draft.weekStartDate,
    theme: draft.proposedTheme,
    goals: draft.proposedGoals,
    activeCampaignIds: draft.proposedActiveCampaignIds,
    targetPlatforms: draft.proposedTargetPlatforms,
    targetFunnelMix: draft.proposedTargetFunnelMix,
    targetModeMix: draft.proposedTargetModeMix,
    targetContentSources: draft.proposedTargetContentSources,
    notes: null,
    planSource: "auto_draft",
    proposalReasons: draft.proposalReasons,
    identifiedGaps: draft.identifiedGaps,
    planningConfidence: draft.planningConfidence,
    autoDraftGeneratedAt: draft.generatedAt,
    autoDraftAcceptedAt: timestamp,
    autoDraftAcceptedWithEdits: options?.acceptWithEdits ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
