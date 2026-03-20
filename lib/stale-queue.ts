import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { getSignalContentContextSummary, type CampaignStrategy } from "@/lib/campaigns";
import type { FatigueAssessment } from "@/lib/fatigue";
import type { ExpectedOutcomeAssessment } from "@/lib/expected-outcome-ranking";
import type { SignalRecord } from "@/types/signal";

const STALE_QUEUE_STORE_PATH = path.join(process.cwd(), "data", "stale-queue-state.json");
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const STALE_QUEUE_STATES = [
  "fresh",
  "aging",
  "stale",
  "stale_but_reusable",
  "stale_needs_refresh",
] as const;

export const STALE_QUEUE_SUGGESTED_ACTIONS = [
  "downgrade_priority",
  "hold_for_refresh",
  "move_to_evergreen_later",
  "suppress_from_top_queue",
] as const;

export const STALE_QUEUE_REASON_CODES = [
  "aged_generation",
  "aged_review_start",
  "campaign_drift",
  "fatigue_increase",
  "destination_overuse",
  "cta_staleness",
  "weekly_plan_mismatch",
  "expected_value_decay",
  "repeated_deprioritization",
] as const;

export const STALE_QUEUE_OPERATOR_ACTIONS = [
  "keep_anyway",
  "refresh_requested",
  "move_to_evergreen_later",
  "suppress",
] as const;

export type StaleQueueState = (typeof STALE_QUEUE_STATES)[number];
export type StaleQueueSuggestedAction = (typeof STALE_QUEUE_SUGGESTED_ACTIONS)[number];
export type StaleQueueReasonCode = (typeof STALE_QUEUE_REASON_CODES)[number];
export type StaleQueueOperatorAction = (typeof STALE_QUEUE_OPERATOR_ACTIONS)[number];

export const staleQueueReasonSchema = z.object({
  code: z.enum(STALE_QUEUE_REASON_CODES),
  label: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  major: z.boolean(),
});

export const staleQueueOperatorStateSchema = z.object({
  signalId: z.string().trim().min(1),
  operatorAction: z.enum(STALE_QUEUE_OPERATOR_ACTIONS),
  actedAt: z.string().trim().min(1),
  expiresAt: z.string().trim().min(1).nullable().optional(),
  note: z.string().trim().min(1).nullable().optional(),
});

export const staleQueueActionRequestSchema = z.object({
  signalId: z.string().trim().min(1),
  action: z.enum(STALE_QUEUE_OPERATOR_ACTIONS),
  note: z.string().trim().optional().nullable(),
});

const staleQueueStoreSchema = z.array(staleQueueOperatorStateSchema);

export type StaleQueueReason = z.infer<typeof staleQueueReasonSchema>;
export type StaleQueueOperatorState = z.infer<typeof staleQueueOperatorStateSchema>;
export type StaleQueueActionRequest = z.infer<typeof staleQueueActionRequestSchema>;

export interface StaleQueueAssessment {
  signalId: string;
  state: StaleQueueState;
  suggestedAction: StaleQueueSuggestedAction;
  reasons: StaleQueueReason[];
  summary: string;
  actionSummary: string;
  ageDays: number;
  anchorDate: string | null;
  rankPenalty: number;
  operatorAction: StaleQueueOperatorAction | null;
  operatorActionNote: string | null;
  isSuppressedFromTopQueue: boolean;
  suggestedRefreshNote: string | null;
}

export interface StaleQueueOverview {
  staleCount: number;
  agingCount: number;
  staleButReusableCount: number;
  staleNeedsRefreshCount: number;
  topReasons: Array<{ code: StaleQueueReasonCode; label: string; count: number }>;
  suppressCount: number;
  refreshRequestedCount: number;
  evergreenLaterCount: number;
  keepAnywayCount: number;
}

interface StaleQueueAssessmentInput {
  signal: SignalRecord;
  fatigue: Pick<FatigueAssessment, "warnings">;
  expectedOutcome: Pick<ExpectedOutcomeAssessment, "expectedOutcomeTier" | "positiveSignals" | "riskSignals">;
  rankReasons?: string[];
  planAlignment?: {
    boosts: string[];
    cautions: string[];
  } | null;
  strategy?: CampaignStrategy | null;
  operatorState?: StaleQueueOperatorState | null;
  now?: Date;
}

function tryReadStore(): StaleQueueOperatorState[] {
  try {
    const raw = readFileSync(STALE_QUEUE_STORE_PATH, "utf8");
    return staleQueueStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function writeStore(entries: StaleQueueOperatorState[]) {
  mkdirSync(path.dirname(STALE_QUEUE_STORE_PATH), { recursive: true });
  writeFileSync(STALE_QUEUE_STORE_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function normalizeOperatorState(entry: StaleQueueOperatorState | null | undefined, now: Date): StaleQueueOperatorState | null {
  if (!entry) {
    return null;
  }

  if (
    entry.operatorAction === "keep_anyway" &&
    entry.expiresAt &&
    Number.isFinite(new Date(entry.expiresAt).getTime()) &&
    new Date(entry.expiresAt).getTime() < now.getTime()
  ) {
    return null;
  }

  return entry;
}

function daysSince(value: string | null | undefined, now: Date): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - parsed) / DAY_IN_MS));
}

function uniqueReasonPush(target: StaleQueueReason[], next: StaleQueueReason | null) {
  if (!next || target.some((item) => item.code === next.code)) {
    return;
  }

  target.push(next);
}

function buildReason(
  code: StaleQueueReasonCode,
  label: string,
  summary: string,
  major: boolean,
): StaleQueueReason {
  return staleQueueReasonSchema.parse({
    code,
    label,
    summary,
    major,
  });
}

function getStatePenalty(state: StaleQueueState): number {
  switch (state) {
    case "aging":
      return 1;
    case "stale_but_reusable":
      return 3;
    case "stale_needs_refresh":
      return 4;
    case "stale":
      return 5;
    case "fresh":
    default:
      return 0;
  }
}

export function getStaleQueueStateLabel(state: StaleQueueState): string {
  switch (state) {
    case "fresh":
      return "Fresh";
    case "aging":
      return "Aging";
    case "stale_but_reusable":
      return "Stale but reusable";
    case "stale_needs_refresh":
      return "Needs refresh";
    case "stale":
    default:
      return "Stale";
  }
}

export function getStaleQueueSuggestedActionLabel(action: StaleQueueSuggestedAction): string {
  switch (action) {
    case "hold_for_refresh":
      return "Refresh";
    case "move_to_evergreen_later":
      return "Evergreen later";
    case "suppress_from_top_queue":
      return "Suppress";
    case "downgrade_priority":
    default:
      return "Downgrade";
  }
}

export function getStaleQueueOperatorActionLabel(action: StaleQueueOperatorAction): string {
  switch (action) {
    case "keep_anyway":
      return "Keep anyway";
    case "refresh_requested":
      return "Refresh requested";
    case "move_to_evergreen_later":
      return "Evergreen later";
    case "suppress":
    default:
      return "Suppressed";
  }
}

export function readStaleQueueOperatorStatesSync(now = new Date()): StaleQueueOperatorState[] {
  return tryReadStore()
    .map((entry) => normalizeOperatorState(entry, now))
    .filter((entry): entry is StaleQueueOperatorState => Boolean(entry));
}

export function readStaleQueueOperatorStateMapSync(now = new Date()): Record<string, StaleQueueOperatorState> {
  return Object.fromEntries(readStaleQueueOperatorStatesSync(now).map((entry) => [entry.signalId, entry]));
}

export function getStaleQueueOperatorStateSync(signalId: string, now = new Date()): StaleQueueOperatorState | null {
  return readStaleQueueOperatorStateMapSync(now)[signalId] ?? null;
}

export function persistStaleQueueOperatorAction(input: StaleQueueActionRequest, now = new Date()): StaleQueueOperatorState {
  const parsed = staleQueueActionRequestSchema.parse(input);
  const currentStore = tryReadStore().filter((entry) => entry.signalId !== parsed.signalId);
  const next = staleQueueOperatorStateSchema.parse({
    signalId: parsed.signalId,
    operatorAction: parsed.action,
    actedAt: now.toISOString(),
    expiresAt: parsed.action === "keep_anyway" ? new Date(now.getTime() + 7 * DAY_IN_MS).toISOString() : null,
    note: parsed.note?.trim() ? parsed.note.trim() : null,
  });

  currentStore.push(next);
  writeStore(currentStore);
  return next;
}

function hasReusableSignals(input: StaleQueueAssessmentInput): boolean {
  const reusableHint = [
    input.signal.evergreenPotential,
    input.signal.repurposeIdeas,
    input.signal.sourceTitle,
    ...input.expectedOutcome.positiveSignals,
    ...(input.rankReasons ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return Boolean(
    input.signal.repeatablePattern ||
      input.signal.repurposeLater ||
      /evergreen|reusable|reuse|repeat|pillar|adapt|resurface/.test(reusableHint) ||
      input.expectedOutcome.expectedOutcomeTier === "high",
  );
}

function hasLowValueCaution(input: StaleQueueAssessmentInput): boolean {
  const combined = [
    ...input.expectedOutcome.riskSignals,
    input.signal.finalReviewNotes ?? "",
    input.signal.reviewNotes ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return (
    input.expectedOutcome.expectedOutcomeTier === "low" ||
    combined.includes("do not repeat") ||
    combined.includes("weak") ||
    combined.includes("low strategic value")
  );
}

function buildPrimaryAnchorDate(signal: SignalRecord): string | null {
  return signal.finalReviewStartedAt ?? signal.createdDate ?? null;
}

export function assessStaleQueueCandidate(input: StaleQueueAssessmentInput): StaleQueueAssessment {
  const now = input.now ?? new Date();
  const operatorState = normalizeOperatorState(input.operatorState, now);
  const anchorDate = buildPrimaryAnchorDate(input.signal);
  const ageDays = daysSince(anchorDate, now) ?? 0;
  const reviewAgeDays =
    input.signal.finalReviewStartedAt && !input.signal.finalReviewedAt
      ? daysSince(input.signal.finalReviewStartedAt, now)
      : null;
  const reasons: StaleQueueReason[] = [];
  const context = input.strategy ? getSignalContentContextSummary(input.signal, input.strategy) : null;
  const campaign =
    context?.campaignId && input.strategy
      ? input.strategy.campaigns.find((item) => item.id === context.campaignId) ?? null
      : null;
  const campaignEndDays =
    campaign?.endDate && Number.isFinite(new Date(campaign.endDate).getTime())
      ? Math.floor((now.getTime() - new Date(campaign.endDate).getTime()) / DAY_IN_MS)
      : null;
  const activeCampaignUrgency =
    Boolean(campaign?.status === "active") &&
    (!campaignEndDays || campaignEndDays <= 7);
  const fatigueWarnings = input.fatigue.warnings ?? [];
  const destinationWarning = fatigueWarnings.find((warning) => warning.dimension === "destination_page") ?? null;
  const ctaWarning = fatigueWarnings.find((warning) => warning.dimension === "cta_style") ?? null;
  const moderateFatigueWarning = fatigueWarnings.find((warning) => warning.severity === "moderate") ?? null;
  const hasWeeklyPlanMismatch =
    (input.planAlignment?.cautions.length ?? 0) > 0 &&
    (input.planAlignment?.boosts.length ?? 0) === 0;
  const hasHeldHistory =
    input.signal.status === "Reviewed" ||
    Boolean(input.signal.finalReviewStartedAt) ||
    Boolean(input.signal.reviewNotes?.trim()) ||
    input.signal.xReviewStatus === "needs_edit" ||
    input.signal.linkedInReviewStatus === "needs_edit" ||
    input.signal.redditReviewStatus === "needs_edit";

  if (ageDays >= 4) {
    uniqueReasonPush(
      reasons,
      buildReason(
        "aged_generation",
        `Generated ${ageDays} days ago`,
        `Generated ${ageDays} days ago and still sitting in the queue.`,
        ageDays >= 9,
      ),
    );
  }

  if (reviewAgeDays !== null && reviewAgeDays >= 7) {
    uniqueReasonPush(
      reasons,
      buildReason(
        "aged_review_start",
        `Review opened ${reviewAgeDays} days ago`,
        `Final review started ${reviewAgeDays} days ago without completion.`,
        true,
      ),
    );
  }

  if (campaign && (campaign.status === "inactive" || (campaignEndDays !== null && campaignEndDays > 7))) {
    uniqueReasonPush(
      reasons,
      buildReason(
        "campaign_drift",
        "Campaign drift",
        campaign.status === "inactive"
          ? `Campaign "${campaign.name}" is inactive.`
          : `Campaign "${campaign.name}" ended ${campaignEndDays} days ago.`,
        true,
      ),
    );
  }

  if (moderateFatigueWarning) {
    uniqueReasonPush(
      reasons,
      buildReason(
        "fatigue_increase",
        moderateFatigueWarning.label,
        moderateFatigueWarning.summary,
        true,
      ),
    );
  }

  if (destinationWarning) {
    uniqueReasonPush(
      reasons,
      buildReason(
        "destination_overuse",
        `${destinationWarning.label} fatigue`,
        destinationWarning.summary,
        destinationWarning.severity === "moderate",
      ),
    );
  }

  if (ctaWarning) {
    uniqueReasonPush(
      reasons,
      buildReason(
        "cta_staleness",
        `${ctaWarning.label} fatigue`,
        ctaWarning.summary,
        ctaWarning.severity === "moderate",
      ),
    );
  }

  if (hasWeeklyPlanMismatch) {
    uniqueReasonPush(
      reasons,
      buildReason(
        "weekly_plan_mismatch",
        "Weekly plan mismatch",
        input.planAlignment?.cautions[0] ?? "Current weekly plan no longer supports this candidate cleanly.",
        true,
      ),
    );
  }

  if (input.expectedOutcome.expectedOutcomeTier === "low") {
    uniqueReasonPush(
      reasons,
      buildReason(
        "expected_value_decay",
        "Expected value decayed",
        input.expectedOutcome.riskSignals[0] ?? "Expected value for this queue item is now low.",
        true,
      ),
    );
  }

  if (hasHeldHistory) {
    uniqueReasonPush(
      reasons,
      buildReason(
        "repeated_deprioritization",
        "Previously held",
        "This item has already been deprioritized or partially reviewed before.",
        true,
      ),
    );
  }

  const majorReasons = reasons.filter((reason) => reason.major);
  const reusableCue = hasReusableSignals(input);
  const lowValueCaution = hasLowValueCaution(input);
  const refreshableDrift =
    Boolean(destinationWarning) ||
    Boolean(ctaWarning) ||
    hasWeeklyPlanMismatch ||
    Boolean(reviewAgeDays !== null && reviewAgeDays >= 7) ||
    Boolean(campaign && campaign.status === "inactive" && !lowValueCaution);

  let state: StaleQueueState = "fresh";
  if (ageDays <= 4 && majorReasons.length === 0) {
    state = "fresh";
  } else if ((ageDays >= 12 || (ageDays >= 9 && majorReasons.length > 0))) {
    if (reusableCue && !activeCampaignUrgency && !lowValueCaution) {
      state = "stale_but_reusable";
    } else if (input.expectedOutcome.expectedOutcomeTier !== "low" && refreshableDrift) {
      state = "stale_needs_refresh";
    } else {
      state = "stale";
    }
  } else if ((ageDays >= 5 && ageDays <= 8) || (ageDays >= 4 && reasons.length > 0)) {
    state = "aging";
  }

  let suggestedAction: StaleQueueSuggestedAction =
    state === "stale_but_reusable"
      ? "move_to_evergreen_later"
      : state === "stale_needs_refresh"
        ? "hold_for_refresh"
        : state === "stale"
          ? "suppress_from_top_queue"
          : "downgrade_priority";

  if (operatorState?.operatorAction === "move_to_evergreen_later") {
    suggestedAction = "move_to_evergreen_later";
  } else if (operatorState?.operatorAction === "refresh_requested") {
    suggestedAction = "hold_for_refresh";
  } else if (operatorState?.operatorAction === "suppress") {
    suggestedAction = "suppress_from_top_queue";
  }

  let rankPenalty = getStatePenalty(state);
  if (operatorState?.operatorAction === "move_to_evergreen_later") {
    rankPenalty = Math.max(rankPenalty, 4);
  }
  if (operatorState?.operatorAction === "suppress") {
    rankPenalty += 4;
  }
  if (operatorState?.operatorAction === "keep_anyway") {
    rankPenalty = 0;
  }

  const primaryReason = reasons[0];
  const stateLabel = getStaleQueueStateLabel(state);
  const summary =
    state === "fresh"
      ? "Fresh"
      : primaryReason
        ? `${stateLabel} - ${primaryReason.label}`
        : stateLabel;
  const suggestedRefreshNote =
    state === "stale_needs_refresh" || operatorState?.operatorAction === "refresh_requested"
      ? [
          primaryReason?.summary ?? "This draft needs a quick relevance pass before approval.",
          destinationWarning ? "Check whether the destination still makes sense." : null,
          ctaWarning ? "Refresh the CTA so it is not repeating the same ask." : null,
          hasWeeklyPlanMismatch ? "Realign it with the current weekly plan before approving." : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ")
      : null;

  return {
    signalId: input.signal.recordId,
    state,
    suggestedAction,
    reasons,
    summary,
    actionSummary: getStaleQueueSuggestedActionLabel(suggestedAction),
    ageDays,
    anchorDate,
    rankPenalty,
    operatorAction: operatorState?.operatorAction ?? null,
    operatorActionNote: operatorState?.note ?? null,
    isSuppressedFromTopQueue:
      operatorState?.operatorAction === "suppress" || operatorState?.operatorAction === "move_to_evergreen_later",
    suggestedRefreshNote,
  };
}

export function buildStaleQueueOverview(
  items: Array<Pick<StaleQueueAssessment, "state" | "reasons" | "operatorAction">>,
): StaleQueueOverview {
  const reasonCounts = new Map<StaleQueueReasonCode, { label: string; count: number }>();

  for (const item of items) {
    for (const reason of item.reasons) {
      reasonCounts.set(reason.code, {
        label: reason.label,
        count: (reasonCounts.get(reason.code)?.count ?? 0) + 1,
      });
    }
  }

  return {
    staleCount: items.filter((item) =>
      item.state === "stale" || item.state === "stale_but_reusable" || item.state === "stale_needs_refresh"
    ).length,
    agingCount: items.filter((item) => item.state === "aging").length,
    staleButReusableCount: items.filter((item) => item.state === "stale_but_reusable").length,
    staleNeedsRefreshCount: items.filter((item) => item.state === "stale_needs_refresh").length,
    topReasons: [...reasonCounts.entries()]
      .map(([code, entry]) => ({ code, label: entry.label, count: entry.count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5),
    suppressCount: items.filter((item) => item.operatorAction === "suppress").length,
    refreshRequestedCount: items.filter((item) => item.operatorAction === "refresh_requested").length,
    evergreenLaterCount: items.filter((item) => item.operatorAction === "move_to_evergreen_later").length,
    keepAnywayCount: items.filter((item) => item.operatorAction === "keep_anyway").length,
  };
}
