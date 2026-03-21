import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import { appendAuditEventsSafe } from "@/lib/audit";
import type { CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { DistributionPriorityAssessment } from "@/lib/distribution-priority";
import type { EvergreenCandidate, EvergreenSummary } from "@/lib/evergreen";
import {
  buildSignalNarrativeSequence,
  findNarrativeSequenceStep,
  getNarrativeSequenceRoleLabel,
  type NarrativeSequence,
  type NarrativeSequenceStepMatch,
} from "@/lib/narrative-sequences";
import type { PostingLogEntry, PostingPlatform } from "@/lib/posting-memory";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
} from "@/lib/publish-prep";
import type { WeeklyPlan, WeeklyPlanState } from "@/lib/weekly-plan";
import { WEEKLY_PLAN_FUNNEL_LABELS } from "@/lib/weekly-plan";
import type { EditorialMode, FounderVoiceMode, FunnelStage, SignalRecord } from "@/types/signal";

const WEEKLY_POSTING_PACK_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "weekly-posting-pack-state.json",
);
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const WEEKLY_POSTING_PACK_ITEM_SOURCES = ["fresh", "evergreen"] as const;
export const WEEKLY_POSTING_PACK_ITEM_STATUSES = ["open", "approved", "removed", "posted"] as const;
export const WEEKLY_POSTING_PACK_ACTIONS = ["approve", "remove"] as const;

export type WeeklyPostingPackItemSource = (typeof WEEKLY_POSTING_PACK_ITEM_SOURCES)[number];
export type WeeklyPostingPackItemStatus = (typeof WEEKLY_POSTING_PACK_ITEM_STATUSES)[number];
export type WeeklyPostingPackAction = (typeof WEEKLY_POSTING_PACK_ACTIONS)[number];

const weeklyPostingPackActionEntrySchema = z.object({
  weekStartDate: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  action: z.enum(WEEKLY_POSTING_PACK_ACTIONS),
  actedAt: z.string().trim().min(1),
});

const weeklyPostingPackStoreSchema = z.object({
  actions: z.array(weeklyPostingPackActionEntrySchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export const weeklyPostingPackActionRequestSchema = z.object({
  weekStartDate: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  action: z.enum(WEEKLY_POSTING_PACK_ACTIONS),
});

export type WeeklyPostingPackActionEntry = z.infer<typeof weeklyPostingPackActionEntrySchema>;

export interface WeeklyPostingPackMixRow {
  key: string;
  label: string;
  count: number;
}

export interface WeeklyPostingPackCoverageSummary {
  summary: string;
  notes: string[];
  underrepresented: string[];
}

export interface WeeklyPostingPackItemSequenceContext {
  sequenceId: string;
  narrativeLabel: string;
  role: NarrativeSequenceStepMatch["contentRole"];
  roleLabel: string;
  stepNumber: number;
  totalSteps: number;
  rationale: string;
  sequenceGoal: string;
  sequenceReason: string;
  suggestedCadenceNotes: string;
}

export interface WeeklyPostingPackItem {
  itemId: string;
  signalId: string;
  sourceTitle: string;
  href: string;
  source: WeeklyPostingPackItemSource;
  status: WeeklyPostingPackItemStatus;
  statusLabel: string;
  platform: PostingPlatform;
  platformLabel: string;
  editorialMode: EditorialMode | null;
  editorialModeLabel: string | null;
  founderVoiceMode: FounderVoiceMode | null;
  campaignContext: string | null;
  funnelStage: FunnelStage | null;
  funnelStageLabel: string | null;
  destinationLabel: string | null;
  publishPrepReadiness: string;
  confidenceLevel: "high" | "moderate" | "low";
  expectedOutcomeTier: "high" | "medium" | "low";
  whySelected: string;
  strongestValueSignal: string;
  keyCaution: string | null;
  includedBecause: string[];
  strongestReasons: string[];
  isCampaignCritical: boolean;
  sequenceContext: WeeklyPostingPackItemSequenceContext | null;
  distributionPriority: DistributionPriorityAssessment | null;
}

export interface WeeklyPostingPack {
  packId: string;
  weekStartDate: string;
  generatedAt: string;
  selectedCandidateIds: string[];
  packRationale: string[];
  coverageSummary: WeeklyPostingPackCoverageSummary;
  includedFreshCount: number;
  includedEvergreenCount: number;
  platformMix: WeeklyPostingPackMixRow[];
  funnelMix: WeeklyPostingPackMixRow[];
  modeMix: WeeklyPostingPackMixRow[];
  sequences: NarrativeSequence[];
  items: WeeklyPostingPackItem[];
  alternates: WeeklyPostingPackItem[];
}

export interface WeeklyPostingPackInsights {
  itemCount: number;
  approvedCount: number;
  removedCount: number;
  postedCount: number;
  completionRate: number;
  coverageQuality: string;
  highValueCount: number;
  campaignCriticalCount: number;
}

interface PackChoice {
  signal: SignalRecord;
  itemId: string;
  signalId: string;
  sourceTitle: string;
  href: string;
  source: WeeklyPostingPackItemSource;
  platform: PostingPlatform;
  platformLabel: string;
  editorialMode: EditorialMode | null;
  editorialModeLabel: string | null;
  founderVoiceMode: FounderVoiceMode | null;
  campaignContext: string | null;
  funnelStage: FunnelStage | null;
  funnelStageLabel: string | null;
  destinationLabel: string | null;
  publishPrepReadiness: string;
  confidenceLevel: "high" | "moderate" | "low";
  expectedOutcomeTier: "high" | "medium" | "low";
  strongestValueSignal: string;
  keyCaution: string | null;
  strongestReasons: string[];
  baseScore: number;
  isCampaignCritical: boolean;
  planBoosts: string[];
  distributionPriority: DistributionPriorityAssessment | null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function normalizeStore(store: z.infer<typeof weeklyPostingPackStoreSchema>) {
  return weeklyPostingPackStoreSchema.parse(store);
}

async function readPersistedStore() {
  try {
    const raw = await readFile(WEEKLY_POSTING_PACK_STORE_PATH, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return normalizeStore({ actions: [], updatedAt: null });
    }

    throw error;
  }
}

async function writeStore(store: z.infer<typeof weeklyPostingPackStoreSchema>) {
  await mkdir(path.dirname(WEEKLY_POSTING_PACK_STORE_PATH), { recursive: true });
  await writeFile(WEEKLY_POSTING_PACK_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function getCompletenessReadinessLabel(
  completenessState: ApprovalQueueCandidate["completeness"]["completenessState"],
) {
  if (completenessState === "complete") {
    return "Ready to post";
  }

  if (completenessState === "mostly_complete") {
    return "One final pass";
  }

  return "Needs package work";
}

function getEvergreenConfidence(candidate: EvergreenCandidate): "high" | "moderate" | "low" {
  if (
    candidate.strategicValue === "high" ||
    (candidate.priorOutcomeQuality === "strong" && candidate.reuseMode === "reuse_directly")
  ) {
    return "high";
  }

  if (candidate.priorOutcomeQuality === "acceptable" || candidate.reuseMode === "adapt_before_reuse") {
    return "moderate";
  }

  return "low";
}

function getEvergreenExpectedOutcomeTier(candidate: EvergreenCandidate): "high" | "medium" | "low" {
  if (candidate.strategicValue === "high" || candidate.priorOutcomeQuality === "strong") {
    return "high";
  }

  if (candidate.strategicValue === "medium" || candidate.priorOutcomeQuality === "acceptable") {
    return "medium";
  }

  return "low";
}

function getStatusLabel(status: WeeklyPostingPackItemStatus) {
  switch (status) {
    case "approved":
      return "Approved";
    case "posted":
      return "Posted";
    case "removed":
      return "Removed";
    case "open":
    default:
      return "Recommended";
  }
}

function buildChoiceFromApprovalCandidate(
  candidate: ApprovalQueueCandidate,
  strategy: CampaignStrategy,
): PackChoice {
  const platform = candidate.distributionPriority.primaryPlatform;
  const packageBundle = buildSignalPublishPrepBundle(candidate.signal);
  const primaryPackage =
    packageBundle?.packages.find(
      (pkg) => pkg.outputKind === "primary_draft" && pkg.platform === platform,
    ) ?? packageBundle?.packages[0] ?? null;
  const primaryLink = primaryPackage ? getPrimaryLinkVariant(primaryPackage) : null;
  const context = getSignalContentContextSummary(candidate.signal, strategy);

  return {
    signal: candidate.signal,
    itemId: `fresh:${candidate.signal.recordId}`,
    signalId: candidate.signal.recordId,
    sourceTitle: candidate.signal.sourceTitle,
    href: `/signals/${candidate.signal.recordId}/review`,
    source: "fresh",
    platform: candidate.distributionPriority.primaryPlatform,
    platformLabel: candidate.distributionPriority.primaryPlatformLabel,
    editorialMode: candidate.signal.editorialMode,
    editorialModeLabel: candidate.signal.editorialMode
      ? getEditorialModeDefinition(candidate.signal.editorialMode).label
      : null,
    founderVoiceMode: candidate.signal.founderVoiceMode,
    campaignContext: context.campaignName,
    funnelStage: context.funnelStage,
    funnelStageLabel: context.funnelStage ? WEEKLY_PLAN_FUNNEL_LABELS[context.funnelStage] : null,
    destinationLabel:
      primaryLink?.label ??
      primaryPackage?.siteLinkLabel ??
      null,
    publishPrepReadiness: getCompletenessReadinessLabel(candidate.completeness.completenessState),
    confidenceLevel: candidate.guidance.confidence.confidenceLevel,
    expectedOutcomeTier: candidate.expectedOutcome.expectedOutcomeTier,
    strongestValueSignal:
      candidate.rankReasons[0] ??
      candidate.expectedOutcome.expectedOutcomeReasons[0] ??
      "Strong operator support surfaced.",
    keyCaution:
      candidate.assessment.strongestCaution ??
      candidate.expectedOutcome.riskSignals[0] ??
      candidate.conflicts.summary[0] ??
      candidate.stale.reasons[0]?.summary ??
      candidate.fatigue.warnings[0]?.summary ??
      null,
    strongestReasons: [
      ...candidate.rankReasons,
      ...candidate.expectedOutcome.expectedOutcomeReasons,
    ].slice(0, 4),
    baseScore: candidate.rankScore,
    isCampaignCritical:
      Boolean(context.campaignId) ||
      candidate.rankReasons.some((reason) => reason.toLowerCase().includes("campaign")),
    planBoosts: candidate.rankReasons.filter(
      (reason) =>
        reason.toLowerCase().includes("rebalance") ||
        reason.toLowerCase().includes("gap") ||
        reason.toLowerCase().includes("weekly"),
    ),
    distributionPriority: candidate.distributionPriority,
  };
}

function buildChoiceFromEvergreenCandidate(candidate: EvergreenCandidate): PackChoice {
  return {
    signal: candidate.signal,
    itemId: candidate.id,
    signalId: candidate.signalId,
    sourceTitle: candidate.signal.sourceTitle,
    href: `/signals/${candidate.signalId}/review?evergreenCandidateId=${encodeURIComponent(candidate.id)}`,
    source: "evergreen",
    platform: candidate.surfacedPlatform,
    platformLabel: getPostingPlatformLabel(candidate.surfacedPlatform),
    editorialMode: candidate.editorialMode,
    editorialModeLabel: candidate.editorialModeLabel,
    founderVoiceMode: candidate.signal.founderVoiceMode,
    campaignContext: candidate.campaignLabel,
    funnelStage: candidate.funnelStage,
    funnelStageLabel: candidate.funnelStage ? WEEKLY_PLAN_FUNNEL_LABELS[candidate.funnelStage] : null,
    destinationLabel: candidate.destinationLabel,
    publishPrepReadiness:
      candidate.reuseMode === "reuse_directly" ? "Evergreen reuse ready" : "Needs light refresh",
    confidenceLevel: getEvergreenConfidence(candidate),
    expectedOutcomeTier: getEvergreenExpectedOutcomeTier(candidate),
    strongestValueSignal:
      candidate.reasons[0] ??
      candidate.weeklyGapReasons[0] ??
      "Strong reuse signal surfaced.",
    keyCaution:
      candidate.reuseMode === "adapt_before_reuse"
        ? "Requires a light adaptation pass before posting."
        : null,
    strongestReasons: [...candidate.reasons, ...candidate.weeklyGapReasons].slice(0, 4),
    baseScore: candidate.rankScore - 1,
    isCampaignCritical: Boolean(candidate.campaignLabel),
    planBoosts: candidate.weeklyGapReasons,
    distributionPriority: null,
  };
}

function buildActionMap(
  actions: WeeklyPostingPackActionEntry[],
  weekStartDate: string,
) {
  const map = new Map<string, WeeklyPostingPackActionEntry>();

  for (const action of actions) {
    if (action.weekStartDate !== weekStartDate) {
      continue;
    }

    const existing = map.get(action.itemId);
    if (!existing || new Date(existing.actedAt).getTime() < new Date(action.actedAt).getTime()) {
      map.set(action.itemId, action);
    }
  }

  return map;
}

function getCurrentWeekPostedSignalIds(
  postingEntries: PostingLogEntry[],
  weekStartDate: string,
) {
  const start = new Date(`${weekStartDate}T00:00:00.000Z`).getTime();
  const end = start + 7 * DAY_IN_MS;
  const ids = new Set<string>();

  for (const entry of postingEntries) {
    const postedAt = new Date(entry.postedAt).getTime();
    if (!Number.isFinite(postedAt) || postedAt < start || postedAt >= end) {
      continue;
    }

    ids.add(entry.signalId);
  }

  return ids;
}

function countMap(values: Array<string | null | undefined>) {
  const map = new Map<string, number>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    map.set(value, (map.get(value) ?? 0) + 1);
  }

  return map;
}

function toMixRows(map: Map<string, number>) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function getUnderrepresentedCoverage(weeklyPlanState: WeeklyPlanState | null | undefined) {
  const underrepresented: string[] = [];

  for (const row of weeklyPlanState?.platformRows ?? []) {
    if (row.status === "gap") {
      uniquePush(underrepresented, `${row.label} is still missing from the weekly mix.`);
    }
  }
  for (const row of weeklyPlanState?.funnelRows ?? []) {
    if (row.status === "gap") {
      uniquePush(underrepresented, `${row.label} is still under-covered this week.`);
    }
  }
  for (const row of weeklyPlanState?.modeRows ?? []) {
    if (row.status === "gap" && row.target > 1) {
      uniquePush(underrepresented, `${row.label} is a planned mode that still needs coverage.`);
    }
  }

  return underrepresented.slice(0, 4);
}

function adjustedSelectionScore(
  choice: PackChoice,
  selected: PackChoice[],
  weeklyPlan: WeeklyPlan | null,
) {
  let score = choice.baseScore;
  const platformCount = selected.filter((item) => item.platform === choice.platform).length;
  const modeCount = selected.filter((item) => item.editorialMode && item.editorialMode === choice.editorialMode).length;
  const funnelCount = selected.filter((item) => item.funnelStage && item.funnelStage === choice.funnelStage).length;
  const destinationCount = selected.filter(
    (item) => item.destinationLabel && item.destinationLabel === choice.destinationLabel,
  ).length;
  const evergreenCount = selected.filter((item) => item.source === "evergreen").length;

  if (platformCount > 0) {
    score -= platformCount >= 2 ? 2 : 1;
  } else {
    score += selected.length < 3 ? 1 : 0.25;
  }

  if (choice.editorialMode) {
    if (modeCount > 0) {
      score -= modeCount >= 2 ? 1.5 : 0.75;
    } else if (selected.length < 3) {
      score += 0.5;
    }
  }

  if (choice.funnelStage) {
    if (funnelCount > 0) {
      score -= funnelCount >= 2 ? 1.25 : 0.5;
    } else if (selected.length < 3) {
      score += 0.75;
    }
  }

  if (destinationCount > 0) {
    score -= destinationCount >= 2 ? 1.5 : 0.75;
  }

  if (choice.source === "evergreen") {
    score -= evergreenCount === 0 ? 0.5 : 2.5;
    if ((weeklyPlan?.targetContentSources.evergreen ?? 0) >= 2 && evergreenCount === 0) {
      score += 1;
    }
  }

  if (choice.isCampaignCritical) {
    score += 1.25;
  }

  if (choice.distributionPriority?.distributionStrategy === "multi" && choice.expectedOutcomeTier === "high") {
    score += 0.75;
  } else if (choice.distributionPriority?.distributionStrategy === "experimental") {
    score -= 0.25;
  }

  if (choice.planBoosts.length > 0) {
    score += Math.min(1.5, choice.planBoosts.length * 0.5);
  }

  if (choice.expectedOutcomeTier === "high") {
    score += 1;
  } else if (choice.expectedOutcomeTier === "low") {
    score -= 1;
  }

  if (choice.keyCaution && choice.keyCaution.toLowerCase().includes("fatigue")) {
    score -= 0.75;
  }

  return score;
}

function shouldAllowChoice(
  choice: PackChoice,
  selected: PackChoice[],
  remainingFreshChoices: number,
  weeklyPlan: WeeklyPlan | null,
) {
  const evergreenCount = selected.filter((item) => item.source === "evergreen").length;
  const maxEvergreenCount = (weeklyPlan?.targetContentSources.evergreen ?? 0) >= 3 ? 2 : 1;

  if (choice.source === "evergreen" && evergreenCount >= maxEvergreenCount && remainingFreshChoices > 0) {
    return false;
  }

  return true;
}

function buildWhySelected(choice: PackChoice, selected: PackChoice[]) {
  const reasons: string[] = [];

  if (!selected.some((item) => item.platform === choice.platform)) {
    uniquePush(reasons, `${choice.platformLabel} coverage is part of this week's mix.`);
  }

  if (choice.funnelStageLabel && !selected.some((item) => item.funnelStage === choice.funnelStage)) {
    uniquePush(reasons, `${choice.funnelStageLabel} coverage is still useful this week.`);
  }

  if (choice.editorialModeLabel && !selected.some((item) => item.editorialMode === choice.editorialMode)) {
    uniquePush(reasons, `${choice.editorialModeLabel} keeps the mode mix from getting flat.`);
  }

  if (choice.source === "evergreen") {
    uniquePush(reasons, "Evergreen reuse fills a weekly gap without forcing more queue volume.");
  }

  if (choice.isCampaignCritical && choice.campaignContext) {
    uniquePush(reasons, `Supports ${choice.campaignContext} while it is still relevant.`);
  }
  if (choice.distributionPriority?.distributionStrategy === "multi") {
    uniquePush(
      reasons,
      `${choice.distributionPriority.primaryPlatformLabel} leads, with ${choice.distributionPriority.secondaryPlatformLabels.join(" and ")} available as bounded follow-on distribution.`,
    );
  } else if (choice.distributionPriority?.distributionStrategy === "experimental") {
    uniquePush(
      reasons,
      `${choice.distributionPriority.primaryPlatformLabel} should lead while distribution stays experimentally bounded.`,
    );
  } else if (choice.distributionPriority) {
    uniquePush(reasons, `${choice.distributionPriority.primaryPlatformLabel} is the clearest first distribution route.`);
  }

  uniquePush(reasons, choice.planBoosts[0]);
  uniquePush(reasons, choice.strongestValueSignal);

  return reasons.slice(0, 3);
}

function buildCoverageSummary(
  items: WeeklyPostingPackItem[],
  weeklyPlanState: WeeklyPlanState | null,
) {
  const platformMix = toMixRows(countMap(items.map((item) => item.platformLabel)));
  const funnelMix = toMixRows(countMap(items.map((item) => item.funnelStageLabel)));
  const modeMix = toMixRows(countMap(items.map((item) => item.editorialModeLabel)));
  const notes: string[] = [];

  if (platformMix[0]) {
    uniquePush(notes, `${platformMix.map((row) => `${row.count} ${row.label}`).join(" · ")} in the current pack.`);
  }
  if (items.some((item) => item.source === "evergreen")) {
    uniquePush(notes, "Evergreen only appears where it closes a real weekly gap.");
  } else {
    uniquePush(notes, "Current pack is leaning on fresh approval-ready work, not resurfacing.");
  }
  if (items.some((item) => item.isCampaignCritical)) {
    uniquePush(notes, "Campaign-critical items are protected without letting one campaign dominate the whole set.");
  }

  const underrepresented = getUnderrepresentedCoverage(weeklyPlanState);
  const summary =
    items.length === 0
      ? "No balanced weekly posting pack is stable enough to recommend yet."
      : `${items.length} recommended posts covering ${platformMix.length} platform${platformMix.length === 1 ? "" : "s"}, ${Math.max(
          1,
          funnelMix.length,
        )} funnel lane${funnelMix.length === 1 ? "" : "s"}, and ${Math.max(1, modeMix.length)} editorial mode${modeMix.length === 1 ? "" : "s"}.`;

  return {
    platformMix,
    funnelMix,
    modeMix,
    coverageSummary: {
      summary,
      notes: notes.slice(0, 4),
      underrepresented,
    },
  };
}

function toPackItem(
  choice: PackChoice,
  status: WeeklyPostingPackItemStatus,
  whySelected: string[],
  sequenceContext: WeeklyPostingPackItemSequenceContext | null,
) {
  return {
    itemId: choice.itemId,
    signalId: choice.signalId,
    sourceTitle: choice.sourceTitle,
    href: choice.href,
    source: choice.source,
    status,
    statusLabel: getStatusLabel(status),
    platform: choice.platform,
    platformLabel: choice.platformLabel,
    editorialMode: choice.editorialMode,
    editorialModeLabel: choice.editorialModeLabel,
    founderVoiceMode: choice.founderVoiceMode,
    campaignContext: choice.campaignContext,
    funnelStage: choice.funnelStage,
    funnelStageLabel: choice.funnelStageLabel,
    destinationLabel: choice.destinationLabel,
    publishPrepReadiness: choice.publishPrepReadiness,
    confidenceLevel: choice.confidenceLevel,
    expectedOutcomeTier: choice.expectedOutcomeTier,
    whySelected: whySelected[0] ?? choice.strongestValueSignal,
    strongestValueSignal: choice.strongestValueSignal,
    keyCaution: choice.keyCaution,
    includedBecause: whySelected,
    strongestReasons: choice.strongestReasons,
    isCampaignCritical: choice.isCampaignCritical,
    sequenceContext,
    distributionPriority: choice.distributionPriority,
  } satisfies WeeklyPostingPackItem;
}

export async function buildWeeklyPostingPack(input: {
  approvalCandidates: ApprovalQueueCandidate[];
  evergreenSummary: EvergreenSummary;
  strategy: CampaignStrategy;
  weeklyPlan: WeeklyPlan | null;
  weeklyPlanState?: WeeklyPlanState | null;
  postingEntries?: PostingLogEntry[];
  minItems?: number;
  maxItems?: number;
  now?: Date;
}): Promise<WeeklyPostingPack> {
  const now = input.now ?? new Date();
  const minItems = Math.min(5, Math.max(1, input.minItems ?? 3));
  const maxItems = Math.min(5, Math.max(minItems, input.maxItems ?? 5));
  const targetCount = Math.max(minItems, Math.min(maxItems, 4));
  const store = await readPersistedStore();
  const actionMap = buildActionMap(store.actions, input.weeklyPlan?.weekStartDate ?? now.toISOString().slice(0, 10));
  const currentWeekPostedSignalIds = getCurrentWeekPostedSignalIds(
    input.postingEntries ?? [],
    input.weeklyPlan?.weekStartDate ?? now.toISOString().slice(0, 10),
  );

  const seenSignals = new Set<string>();
  const pool: PackChoice[] = [];

  for (const candidate of input.approvalCandidates) {
    if (seenSignals.has(candidate.signal.recordId)) {
      continue;
    }
    if (candidate.triage.triageState === "suppress" || candidate.triage.triageState === "needs_judgement") {
      continue;
    }

    seenSignals.add(candidate.signal.recordId);
    pool.push(buildChoiceFromApprovalCandidate(candidate, input.strategy));
  }

  for (const candidate of input.evergreenSummary.candidates) {
    if (seenSignals.has(candidate.signalId)) {
      continue;
    }

    seenSignals.add(candidate.signalId);
    pool.push(buildChoiceFromEvergreenCandidate(candidate));
  }

  const eligiblePool = pool.filter((choice) => actionMap.get(choice.itemId)?.action !== "remove");
  const selectedChoices: PackChoice[] = [];
  const remaining = [...eligiblePool];

  while (selectedChoices.length < targetCount && remaining.length > 0) {
    const remainingFreshChoices = remaining.filter((choice) => choice.source === "fresh").length;
    const next = [...remaining]
      .filter((choice) =>
        shouldAllowChoice(choice, selectedChoices, remainingFreshChoices, input.weeklyPlan),
      )
      .sort(
        (left, right) =>
          adjustedSelectionScore(right, selectedChoices, input.weeklyPlan) -
            adjustedSelectionScore(left, selectedChoices, input.weeklyPlan) ||
          right.baseScore - left.baseScore ||
          left.sourceTitle.localeCompare(right.sourceTitle),
      )[0];

    if (!next) {
      break;
    }

    selectedChoices.push(next);
    const index = remaining.findIndex((choice) => choice.itemId === next.itemId);
    if (index >= 0) {
      remaining.splice(index, 1);
    }
  }

  const items = selectedChoices.map((choice) => {
    const action = actionMap.get(choice.itemId);
    const status: WeeklyPostingPackItemStatus = currentWeekPostedSignalIds.has(choice.signalId)
      ? "posted"
      : action?.action === "approve"
        ? "approved"
        : "open";
    const sequence = buildSignalNarrativeSequence({
      signal: choice.signal,
      strategy: input.strategy,
    });
    const step = findNarrativeSequenceStep(sequence, choice.platform);
    return toPackItem(
      choice,
      status,
      buildWhySelected(choice, selectedChoices),
      step
        ? {
            sequenceId: step.sequenceId,
            narrativeLabel: step.narrativeLabel,
            role: step.contentRole,
            roleLabel: getNarrativeSequenceRoleLabel(step.contentRole),
            stepNumber: step.stepNumber,
            totalSteps: step.totalSteps,
            rationale: step.rationale,
            sequenceGoal: step.sequenceGoal,
            sequenceReason: step.sequenceReason,
            suggestedCadenceNotes: step.suggestedCadenceNotes,
          }
        : null,
    );
  });
  const alternates = remaining
    .sort(
      (left, right) =>
        adjustedSelectionScore(right, selectedChoices, input.weeklyPlan) -
          adjustedSelectionScore(left, selectedChoices, input.weeklyPlan) ||
        right.baseScore - left.baseScore ||
        left.sourceTitle.localeCompare(right.sourceTitle),
    )
    .slice(0, 5)
    .map((choice) =>
      toPackItem(
        choice,
        "open",
        buildWhySelected(choice, selectedChoices),
        null,
      ),
    )
    .filter((item) => item.status !== "removed");

  const includedFreshCount = items.filter((item) => item.source === "fresh").length;
  const includedEvergreenCount = items.filter((item) => item.source === "evergreen").length;
  const { platformMix, funnelMix, modeMix, coverageSummary } = buildCoverageSummary(
    items,
    input.weeklyPlanState ?? null,
  );
  const packRationale: string[] = [];

  uniquePush(
    packRationale,
    items[0]?.strongestValueSignal ?? "Balanced approval-ready support drove the current weekly pack.",
  );
  if (includedEvergreenCount > 0) {
    uniquePush(packRationale, `${includedEvergreenCount} evergreen slot${includedEvergreenCount === 1 ? "" : "s"} filled genuine weekly gaps.`);
  }
  if (items.some((item) => item.isCampaignCritical)) {
    uniquePush(packRationale, "Campaign-critical work stayed in the pack without flattening the rest of the mix.");
  }
  if (items.some((item) => item.distributionPriority?.distributionStrategy === "multi")) {
    uniquePush(packRationale, "High-value items with cross-platform upside stayed visible in the weekly pack.");
  }
  uniquePush(packRationale, coverageSummary.notes[0]);
  const sequences = selectedChoices
    .map((choice) =>
      buildSignalNarrativeSequence({
        signal: choice.signal,
        strategy: input.strategy,
      }),
    )
    .filter((sequence): sequence is NarrativeSequence => Boolean(sequence));

  const weekStartDate = input.weeklyPlan?.weekStartDate ?? now.toISOString().slice(0, 10);

  return {
    packId: `weekly-pack:${weekStartDate}`,
    weekStartDate,
    generatedAt: now.toISOString(),
    selectedCandidateIds: items.map((item) => item.signalId),
    packRationale: packRationale.slice(0, 4),
    coverageSummary,
    includedFreshCount,
    includedEvergreenCount,
    platformMix,
    funnelMix,
    modeMix,
    sequences,
    items,
    alternates,
  };
}

export async function updateWeeklyPostingPackItemAction(input: {
  weekStartDate: string;
  itemId: string;
  signalId: string;
  action: WeeklyPostingPackAction;
}) {
  const store = await readPersistedStore();
  const nextAction = weeklyPostingPackActionEntrySchema.parse({
    weekStartDate: input.weekStartDate,
    itemId: input.itemId,
    signalId: input.signalId,
    action: input.action,
    actedAt: new Date().toISOString(),
  });
  const nextActions = [
    ...store.actions.filter(
      (entry) =>
        !(entry.weekStartDate === nextAction.weekStartDate && entry.itemId === nextAction.itemId),
    ),
    nextAction,
  ];

  await writeStore({
    actions: nextActions,
    updatedAt: nextAction.actedAt,
  });

  await appendAuditEventsSafe([
    {
      signalId: input.signalId,
      eventType:
        input.action === "approve"
          ? "WEEKLY_POSTING_PACK_ITEM_APPROVED"
          : "WEEKLY_POSTING_PACK_ITEM_REMOVED",
      actor: "operator",
      summary:
        input.action === "approve"
          ? "Approved a recommended weekly pack item."
          : "Removed a recommended weekly pack item.",
      metadata: {
        weekStartDate: input.weekStartDate,
        itemId: input.itemId,
        source: "weekly_posting_pack",
      },
    },
  ]);

  return nextAction;
}

export function buildWeeklyPostingPackInsights(pack: WeeklyPostingPack): WeeklyPostingPackInsights {
  const approvedCount = pack.items.filter((item) => item.status === "approved").length;
  const removedCount = pack.items.filter((item) => item.status === "removed").length;
  const postedCount = pack.items.filter((item) => item.status === "posted").length;
  const completionRate =
    pack.items.length === 0 ? 0 : (approvedCount + postedCount) / pack.items.length;
  const campaignCriticalCount = pack.items.filter((item) => item.isCampaignCritical).length;
  const highValueCount = pack.items.filter((item) => item.expectedOutcomeTier === "high").length;

  let coverageQuality = "No pack is stable enough to score yet.";
  if (pack.items.length > 0) {
    const platformCount = pack.platformMix.length;
    const funnelCount = pack.funnelMix.length;
    const modeCount = pack.modeMix.length;
    coverageQuality = `${platformCount} platform${platformCount === 1 ? "" : "s"}, ${Math.max(1, funnelCount)} funnel lane${funnelCount === 1 ? "" : "s"}, and ${Math.max(1, modeCount)} mode${modeCount === 1 ? "" : "s"} are represented.`;
  }

  return {
    itemCount: pack.items.length,
    approvedCount,
    removedCount,
    postedCount,
    completionRate,
    coverageQuality,
    highValueCount,
    campaignCriticalCount,
  };
}
