import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import { evaluateAutonomyPolicy } from "@/lib/autonomy-policy";
import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import type { CampaignLifecycleRecommendation } from "@/lib/campaign-lifecycle";
import {
  buildDistributionBundles,
  buildDistributionSummary,
  type DistributionBundle,
  type DistributionSummary,
} from "@/lib/distribution";
import { executePromotionExecutionChain } from "@/lib/execution-chains";
import type { ManualExperiment } from "@/lib/experiments";
import type { FunnelEngineState } from "@/lib/funnel-engine";
import type { PostingAssistantPackage } from "@/lib/posting-assistant";
import { stagePostingAssistantPackage } from "@/lib/posting-assistant";
import type { PostingPlatform } from "@/lib/posting-memory";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";
import type { WeeklyPostingPack, WeeklyPostingPackItem } from "@/lib/weekly-posting-pack";

const WEEKLY_EXECUTION_STORE_PATH = path.join(process.cwd(), "data", "weekly-execution.json");

export const WEEKLY_EXECUTION_ITEM_STATUSES = [
  "ready_to_review",
  "ready_to_stage",
  "staged_for_posting",
  "blocked",
] as const;

export type WeeklyExecutionItemStatus = (typeof WEEKLY_EXECUTION_ITEM_STATUSES)[number];

export interface WeeklyExecutionItem {
  candidateId: string;
  signalId: string;
  sourceTitle: string;
  href: string;
  status: WeeklyExecutionItemStatus;
  executionOrder: number;
  platform: PostingPlatform;
  weeklyPackMembership: boolean;
  distributionBundleReady: boolean;
  distributionBundleId: string | null;
  sequenceLabel: string | null;
  sequenceStepLabel: string | null;
  distributionStrategy: "single" | "multi" | "experimental" | null;
  secondaryPlatforms: PostingPlatform[];
  distributionReason: string | null;
  executionReason: string;
  executionChainSummary: string | null;
  riskSeverity: "low" | "medium" | "high" | null;
  riskSummary: string | null;
  riskSuggestedFix: string | null;
  blockReasons: string[];
}

export interface WeeklyExecutionFlow {
  weekStartDate: string;
  generatedAt: string;
  executionItems: WeeklyExecutionItem[];
  stagedCount: number;
  blockedCount: number;
  reviewCount: number;
  readyToStageCount: number;
  sequenceNotes: string[];
  executionReasons: string[];
}

export interface WeeklyExecutionRunResult {
  flow: WeeklyExecutionFlow;
  stagedPackages: PostingAssistantPackage[];
  distributionBundles: DistributionBundle[];
  distributionSummary: DistributionSummary;
}

export interface WeeklyExecutionInsights {
  runCount: number;
  stagedCount: number;
  blockedCount: number;
  readyToReviewCount: number;
  readyToStageCount: number;
  executionReadyRate: number;
  stagedToBlockedRatio: string;
  commonBlockReasons: Array<{ label: string; count: number }>;
}

const weeklyExecutionItemSchema = z.object({
  candidateId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  href: z.string().trim().min(1),
  status: z.enum(WEEKLY_EXECUTION_ITEM_STATUSES),
  executionOrder: z.number().int().min(1),
  platform: z.enum(["x", "linkedin", "reddit"]),
  weeklyPackMembership: z.boolean(),
  distributionBundleReady: z.boolean(),
  distributionBundleId: z.string().trim().nullable().default(null),
  sequenceLabel: z.string().trim().nullable().default(null),
  sequenceStepLabel: z.string().trim().nullable().default(null),
  distributionStrategy: z.enum(["single", "multi", "experimental"]).nullable().default(null),
  secondaryPlatforms: z.array(z.enum(["x", "linkedin", "reddit"])).max(3).default([]),
  distributionReason: z.string().trim().nullable().default(null),
  executionReason: z.string().trim().min(1),
  executionChainSummary: z.string().trim().nullable().default(null),
  riskSeverity: z.enum(["low", "medium", "high"]).nullable().default(null),
  riskSummary: z.string().trim().nullable().default(null),
  riskSuggestedFix: z.string().trim().nullable().default(null),
  blockReasons: z.array(z.string().trim().min(1)).max(8).default([]),
});

const weeklyExecutionFlowSchema = z.object({
  weekStartDate: z.string().trim().min(1),
  generatedAt: z.string().trim().min(1),
  executionItems: z.array(weeklyExecutionItemSchema).max(12),
  stagedCount: z.number().int().min(0),
  blockedCount: z.number().int().min(0),
  reviewCount: z.number().int().min(0),
  readyToStageCount: z.number().int().min(0),
  sequenceNotes: z.array(z.string().trim().min(1)).max(8).default([]),
  executionReasons: z.array(z.string().trim().min(1)).max(8).default([]),
});

const weeklyExecutionStoreSchema = z.object({
  flowsByWeekStartDate: z.record(z.string(), weeklyExecutionFlowSchema).default({}),
  updatedAt: z.string().trim().nullable().default(null),
});

let inMemoryWeeklyExecutionStore: z.infer<typeof weeklyExecutionStoreSchema> =
  weeklyExecutionStoreSchema.parse({
    flowsByWeekStartDate: {},
    updatedAt: null,
  });

function normalizeReason(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalizeReason(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function sortPackages(packages: PostingAssistantPackage[]) {
  return [...packages].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
      left.sourceTitle.localeCompare(right.sourceTitle),
  );
}

async function readPersistedStore() {
  try {
    const raw = await readFile(WEEKLY_EXECUTION_STORE_PATH, "utf8");
    const parsed = sanitizeWeeklyExecutionStore(JSON.parse(raw));
    inMemoryWeeklyExecutionStore = parsed;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryWeeklyExecutionStore;
    }

    console.warn(
      "weekly-execution: persisted store could not be parsed, falling back to in-memory state.",
      error,
    );
    return inMemoryWeeklyExecutionStore;
  }
}

async function writePersistedStore(store: z.infer<typeof weeklyExecutionStoreSchema>) {
  const parsed = sanitizeWeeklyExecutionStore(store);
  inMemoryWeeklyExecutionStore = parsed;

  try {
    await mkdir(path.dirname(WEEKLY_EXECUTION_STORE_PATH), { recursive: true });
    await writeFile(WEEKLY_EXECUTION_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("weekly-execution", error);
      return;
    }

    throw error;
  }
}

function sanitizeWeeklyExecutionStore(
  input: unknown,
): z.infer<typeof weeklyExecutionStoreSchema> {
  const parsed = weeklyExecutionStoreSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const fallbackInput =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const flowsByWeekStartDate =
    (fallbackInput as { flowsByWeekStartDate?: unknown }).flowsByWeekStartDate;
  const updatedAt =
    typeof (fallbackInput as { updatedAt?: unknown }).updatedAt === "string"
      ? ((fallbackInput as { updatedAt?: string }).updatedAt ?? null)
      : null;
  const sanitizedFlows: Record<string, WeeklyExecutionFlow> = {};

  if (flowsByWeekStartDate && typeof flowsByWeekStartDate === "object" && !Array.isArray(flowsByWeekStartDate)) {
    for (const [weekStartDate, flow] of Object.entries(flowsByWeekStartDate)) {
      const parsedFlow = weeklyExecutionFlowSchema.safeParse(flow);
      if (!parsedFlow.success) {
        console.warn(
          `weekly-execution: dropping invalid persisted flow for ${weekStartDate}.`,
          parsedFlow.error,
        );
        continue;
      }

      sanitizedFlows[weekStartDate] = parsedFlow.data;
    }
  }

  return weeklyExecutionStoreSchema.parse({
    flowsByWeekStartDate: sanitizedFlows,
    updatedAt,
  });
}

function getActivePackage(
  packages: PostingAssistantPackage[],
  signalId: string,
  platform: PostingPlatform,
) {
  return (
    packages.find(
      (pkg) =>
        pkg.signalId === signalId &&
        pkg.platform === platform &&
        pkg.status === "staged_for_posting",
    ) ?? null
  );
}

function extractChainSummary(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  const marker = "Auto-executed chain:";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  return normalized.slice(markerIndex).trim();
}

function buildStagePolicy(candidate: ApprovalQueueCandidate) {
  const completenessState =
    candidate.completeness.completenessState === "complete"
      ? "complete"
      : candidate.completeness.completenessState === "mostly_complete"
        ? "mostly_complete"
        : "incomplete";

  return evaluateAutonomyPolicy({
    actionType: "auto_stage_for_posting",
    confidenceLevel: candidate.automationConfidence.level,
    completenessState,
    hasUnresolvedConflicts: candidate.conflicts.conflicts.length > 0,
    experimentLinked: false,
    approvalReady:
      candidate.triage.triageState === "approve_ready" ||
      candidate.triage.triageState === "repairable",
    workflowState: candidate.signal.status,
  });
}

function getStatusPriority(status: WeeklyExecutionItemStatus) {
  switch (status) {
    case "staged_for_posting":
      return 0;
    case "ready_to_stage":
      return 1;
    case "ready_to_review":
      return 2;
    case "blocked":
    default:
      return 3;
  }
}

function getFunnelPriority(
  state: FunnelEngineState | null | undefined,
  stage: WeeklyPostingPackItem["funnelStage"],
) {
  if (!state || !stage) {
    return 2;
  }

  const row = state.recommendedNextMix.find((entry) => entry.stage === stage);
  if (!row) {
    return 2;
  }

  if (row.recommendedAdjustment === "increase") {
    return 0;
  }
  if (row.recommendedAdjustment === "maintain") {
    return 1;
  }
  return 2;
}

function buildBaseExecutionItem(input: {
  item: WeeklyPostingPackItem;
  candidate: ApprovalQueueCandidate | null;
  stagedPackage: PostingAssistantPackage | null;
  lifecycle: CampaignLifecycleRecommendation | null;
}): WeeklyExecutionItem {
  const sequenceStepLabel = input.item.sequenceContext
    ? `Step ${input.item.sequenceContext.stepNumber} of ${input.item.sequenceContext.totalSteps}`
    : null;

  if (input.stagedPackage) {
    return {
      candidateId: input.item.itemId,
      signalId: input.item.signalId,
      sourceTitle: input.item.sourceTitle,
      href: input.item.href,
      status: "staged_for_posting",
      executionOrder: 0,
      platform: input.item.platform,
      weeklyPackMembership: true,
      distributionBundleReady: false,
      distributionBundleId: null,
      sequenceLabel: input.item.sequenceContext?.narrativeLabel ?? null,
      sequenceStepLabel,
      distributionStrategy: input.item.distributionPriority?.distributionStrategy ?? null,
      secondaryPlatforms: input.item.distributionPriority?.secondaryPlatforms ?? [],
      distributionReason: input.item.distributionPriority?.reason ?? null,
      executionReason:
        input.lifecycle?.lifecycleStage === "peak"
          ? `${input.stagedPackage.readinessReason} ${input.lifecycle.campaignName} is in peak stage, so it stays near the front of this week's execution flow.`
          : input.lifecycle?.lifecycleStage === "tapering"
            ? `${input.stagedPackage.readinessReason} ${input.lifecycle.campaignName} is tapering, so it stays visible without taking over the flow.`
            : input.stagedPackage.readinessReason,
      executionChainSummary: extractChainSummary(input.stagedPackage.readinessReason),
      riskSeverity: input.candidate?.commercialRisk.highestSeverity ?? null,
      riskSummary: input.candidate?.commercialRisk.summary ?? null,
      riskSuggestedFix: input.candidate?.commercialRisk.topRisk?.suggestedFix ?? null,
      blockReasons: [],
    };
  }

  if (!input.candidate || input.item.source === "evergreen") {
    return {
      candidateId: input.item.itemId,
      signalId: input.item.signalId,
      sourceTitle: input.item.sourceTitle,
      href: input.item.href,
      status: "ready_to_review",
      executionOrder: 0,
      platform: input.item.platform,
      weeklyPackMembership: true,
      distributionBundleReady: false,
      distributionBundleId: null,
      sequenceLabel: input.item.sequenceContext?.narrativeLabel ?? null,
      sequenceStepLabel,
      distributionStrategy: input.item.distributionPriority?.distributionStrategy ?? null,
      secondaryPlatforms: input.item.distributionPriority?.secondaryPlatforms ?? [],
      distributionReason: input.item.distributionPriority?.reason ?? null,
      executionReason:
        input.item.source === "evergreen"
          ? "Evergreen reuse is in the weekly flow, but it still needs explicit operator review before staging."
          : input.lifecycle?.lifecycleStage === "peak"
            ? `${input.item.whySelected} ${input.lifecycle.campaignName} is in peak stage, so this stays commercially prominent.`
            : input.item.whySelected,
      executionChainSummary: input.candidate?.executionChain.summary ?? null,
      riskSeverity: input.candidate?.commercialRisk.highestSeverity ?? null,
      riskSummary: input.candidate?.commercialRisk.summary ?? null,
      riskSuggestedFix: input.candidate?.commercialRisk.topRisk?.suggestedFix ?? null,
      blockReasons: [],
    };
  }

  const policy = buildStagePolicy(input.candidate);
  const isStageSafe =
    policy.decision === "allow" &&
    input.candidate.completeness.completenessState === "complete" &&
    input.candidate.triage.triageState !== "needs_judgement" &&
    input.candidate.triage.triageState !== "suppress" &&
    input.candidate.conflicts.conflicts.length === 0 &&
    input.candidate.commercialRisk.decision === "allow";

  if (isStageSafe) {
    return {
      candidateId: input.item.itemId,
      signalId: input.item.signalId,
      sourceTitle: input.item.sourceTitle,
      href: input.item.href,
      status: "ready_to_stage",
      executionOrder: 0,
      platform: input.item.platform,
      weeklyPackMembership: true,
      distributionBundleReady: false,
      distributionBundleId: null,
      sequenceLabel: input.item.sequenceContext?.narrativeLabel ?? null,
      sequenceStepLabel,
      distributionStrategy: input.item.distributionPriority?.distributionStrategy ?? null,
      secondaryPlatforms: input.item.distributionPriority?.secondaryPlatforms ?? [],
      distributionReason: input.item.distributionPriority?.reason ?? null,
      executionReason:
        policy.summary ||
        (input.lifecycle?.lifecycleStage === "peak"
          ? `High-confidence complete package is safe to stage, and ${input.lifecycle.campaignName} is currently in peak stage.`
          : "High-confidence complete package is safe to stage for this week's execution flow."),
      executionChainSummary: input.candidate.executionChain.summary,
      riskSeverity: input.candidate.commercialRisk.highestSeverity,
      riskSummary: input.candidate.commercialRisk.summary,
      riskSuggestedFix: input.candidate.commercialRisk.topRisk?.suggestedFix ?? null,
      blockReasons: [],
    };
  }

  const blockReasons =
    input.candidate.commercialRisk.decision === "block"
      ? [
          input.candidate.commercialRisk.topRisk?.reason ??
            input.candidate.commercialRisk.summary,
        ]
      : policy.reasons.length > 0
        ? policy.reasons
        : [policy.summary];
  const reviewRequired =
    policy.decision === "suggest_only" ||
    input.candidate.completeness.completenessState === "mostly_complete" ||
    input.candidate.triage.triageState === "repairable" ||
    input.candidate.commercialRisk.decision === "suggest_fix";

  return {
    candidateId: input.item.itemId,
    signalId: input.item.signalId,
    sourceTitle: input.item.sourceTitle,
    href: input.item.href,
    status: reviewRequired ? "ready_to_review" : "blocked",
    executionOrder: 0,
    platform: input.item.platform,
    weeklyPackMembership: true,
    distributionBundleReady: false,
    distributionBundleId: null,
    sequenceLabel: input.item.sequenceContext?.narrativeLabel ?? null,
    sequenceStepLabel,
    distributionStrategy: input.item.distributionPriority?.distributionStrategy ?? null,
    secondaryPlatforms: input.item.distributionPriority?.secondaryPlatforms ?? [],
    distributionReason: input.item.distributionPriority?.reason ?? null,
    executionReason:
      reviewRequired
        ? blockReasons[0] ??
          (input.lifecycle?.lifecycleStage === "tapering"
            ? `${input.lifecycle.campaignName} is tapering, so this item still needs explicit review before staging.`
            : "This item still needs explicit review before staging.")
        : blockReasons[0] ?? "This item is blocked from weekly execution autopilot staging.",
    executionChainSummary: input.candidate.executionChain.summary,
    riskSeverity: input.candidate.commercialRisk.highestSeverity,
    riskSummary: input.candidate.commercialRisk.summary,
    riskSuggestedFix: input.candidate.commercialRisk.topRisk?.suggestedFix ?? null,
    blockReasons: reviewRequired ? [] : blockReasons,
  };
}

function finalizeExecutionFlow(input: {
  weekStartDate: string;
  items: WeeklyExecutionItem[];
  distributionBundles: DistributionBundle[];
  pack: WeeklyPostingPack;
  funnelEngine?: FunnelEngineState | null;
}) {
  const bundleBySignalId = new Map(
    input.distributionBundles.map((bundle) => [bundle.signalId, bundle]),
  );

  const orderedItems = [...input.items]
    .map((item) => {
      const packItem =
        input.pack.items.find((entry) => entry.signalId === item.signalId && entry.platform === item.platform) ??
        null;
      const bundle = bundleBySignalId.get(item.signalId) ?? null;
      return {
        ...item,
        distributionBundleReady: Boolean(bundle),
        distributionBundleId: bundle?.bundleId ?? null,
        _sortPriority: getStatusPriority(item.status),
        _funnelPriority: getFunnelPriority(input.funnelEngine, packItem?.funnelStage ?? null),
        _sequenceStep: packItem?.sequenceContext?.stepNumber ?? 99,
        _campaignBoost: packItem?.isCampaignCritical ? 0 : 1,
        _distributionBoost:
          item.distributionStrategy === "multi"
            ? 0
            : item.distributionStrategy === "single"
              ? 1
              : 2,
        _outcomeBoost:
          packItem?.expectedOutcomeTier === "high"
            ? 0
            : packItem?.expectedOutcomeTier === "medium"
              ? 1
              : 2,
      };
    })
    .sort((left, right) =>
      left._sortPriority - right._sortPriority ||
      left._funnelPriority - right._funnelPriority ||
      left._distributionBoost - right._distributionBoost ||
      left._sequenceStep - right._sequenceStep ||
      left._campaignBoost - right._campaignBoost ||
      left._outcomeBoost - right._outcomeBoost ||
      left.sourceTitle.localeCompare(right.sourceTitle),
    )
    .map((item, index) => ({
      ...item,
      executionOrder: index + 1,
    }));
  const persistedItems = orderedItems.map((item) =>
    weeklyExecutionItemSchema.parse({
      candidateId: item.candidateId,
      signalId: item.signalId,
      sourceTitle: item.sourceTitle,
      href: item.href,
      status: item.status,
      executionOrder: item.executionOrder,
      platform: item.platform,
      weeklyPackMembership: item.weeklyPackMembership,
      distributionBundleReady: item.distributionBundleReady,
      distributionBundleId: item.distributionBundleId,
      sequenceLabel: item.sequenceLabel,
      sequenceStepLabel: item.sequenceStepLabel,
      distributionStrategy: item.distributionStrategy,
      secondaryPlatforms: item.secondaryPlatforms,
      distributionReason: item.distributionReason,
      executionReason: item.executionReason,
      executionChainSummary: item.executionChainSummary,
      riskSeverity: item.riskSeverity,
      riskSummary: item.riskSummary,
      riskSuggestedFix: item.riskSuggestedFix,
      blockReasons: item.blockReasons,
    }),
  );

  const sequenceNotes = input.pack.sequences
    .slice(0, 4)
    .map(
      (sequence) =>
        `${sequence.narrativeLabel}: ${sequence.orderedSteps
          .map((step) => `${step.order}. ${step.platform === "linkedin" ? "LinkedIn" : step.platform === "reddit" ? "Reddit" : "X"}`)
          .join(" · ")}`,
    );

  const executionReasons: string[] = [];
  const stagedCount = orderedItems.filter((item) => item.status === "staged_for_posting").length;
  const blockedCount = orderedItems.filter((item) => item.status === "blocked").length;
  const readyToStageCount = orderedItems.filter((item) => item.status === "ready_to_stage").length;
  const reviewCount = orderedItems.filter((item) => item.status === "ready_to_review").length;

  uniquePush(
    executionReasons,
    stagedCount > 0
      ? `${stagedCount} weekly item${stagedCount === 1 ? "" : "s"} are already staged and ready for manual posting.`
      : "No weekly item is staged yet.",
  );
  uniquePush(
    executionReasons,
    readyToStageCount > 0
      ? `${readyToStageCount} more item${readyToStageCount === 1 ? "" : "s"} can be staged next with minimal operator effort.`
      : "No additional weekly item is immediately stage-safe.",
  );
  uniquePush(
    executionReasons,
    blockedCount > 0
      ? `${blockedCount} item${blockedCount === 1 ? "" : "s"} stay blocked by policy or package risk and remain visible.`
      : "No weekly-pack item is currently blocked by execution policy.",
  );
  uniquePush(
    executionReasons,
    reviewCount > 0
      ? `${reviewCount} item${reviewCount === 1 ? "" : "s"} still need explicit review before staging.`
      : "No weekly-pack item is waiting on deeper review right now.",
  );
  if ((input.funnelEngine?.boostedStages.length ?? 0) > 0) {
    uniquePush(
      executionReasons,
      `Execution ordering is lightly favoring ${input.funnelEngine?.boostedStages
        .map((stage) => stage.toLowerCase())
        .join(" and ")} content to rebalance the funnel mix.`,
    );
  }

  return weeklyExecutionFlowSchema.parse({
    weekStartDate: input.weekStartDate,
    generatedAt: new Date().toISOString(),
    executionItems: persistedItems,
    stagedCount,
    blockedCount,
    reviewCount,
    readyToStageCount,
    sequenceNotes,
    executionReasons: executionReasons.slice(0, 4),
  });
}

export function prepareWeeklyExecutionFlow(input: {
  weekStartDate: string;
  pack: WeeklyPostingPack;
  approvalCandidates: ApprovalQueueCandidate[];
  stagedPackages: PostingAssistantPackage[];
  lifecycleByCampaignId?: Record<string, CampaignLifecycleRecommendation>;
  funnelEngine?: FunnelEngineState | null;
}): WeeklyExecutionRunResult {
  const candidateBySignalId = new Map(
    input.approvalCandidates.map((candidate) => [candidate.signal.recordId, candidate]),
  );

  const baseItems = input.pack.items.map((item) => {
    const candidate = candidateBySignalId.get(item.signalId) ?? null;

    return buildBaseExecutionItem({
      item,
      candidate,
      stagedPackage: getActivePackage(input.stagedPackages, item.signalId, item.platform),
      lifecycle:
        candidate?.signal.campaignId ? input.lifecycleByCampaignId?.[candidate.signal.campaignId] ?? null : null,
    });
  });
  const distributionBundles = buildDistributionBundles({
    packages: input.stagedPackages.filter((pkg) =>
      input.pack.items.some(
        (item) => item.signalId === pkg.signalId && item.platform === pkg.platform,
      ),
    ),
    sequenceByPackageId: Object.fromEntries(
      input.stagedPackages.map((pkg) => {
        const packItem =
          input.pack.items.find((item) => item.signalId === pkg.signalId && item.platform === pkg.platform) ??
          null;
        return [
          pkg.packageId,
          packItem?.sequenceContext
            ? {
                sequenceId: packItem.sequenceContext.sequenceId,
                signalId: pkg.signalId,
                platform: pkg.platform,
                contentRole: packItem.sequenceContext.role,
                roleLabel: packItem.sequenceContext.roleLabel,
                stepId: `${pkg.signalId}:${pkg.platform}`,
                order: packItem.sequenceContext.stepNumber,
                stepNumber: packItem.sequenceContext.stepNumber,
                totalSteps: packItem.sequenceContext.totalSteps,
                rationale: packItem.sequenceContext.rationale,
                sequenceGoal: packItem.sequenceContext.sequenceGoal,
                sequenceReason: packItem.sequenceContext.sequenceReason,
                narrativeLabel: packItem.sequenceContext.narrativeLabel,
                suggestedCadenceNotes: packItem.sequenceContext.suggestedCadenceNotes,
              }
            : null,
        ];
      }),
    ),
  });

  return {
    flow: finalizeExecutionFlow({
      weekStartDate: input.weekStartDate,
      items: baseItems,
      distributionBundles,
      pack: input.pack,
      funnelEngine: input.funnelEngine,
    }),
    stagedPackages: sortPackages(input.stagedPackages),
    distributionBundles,
    distributionSummary: buildDistributionSummary(distributionBundles),
  };
}

function buildFlowSignature(flow: WeeklyExecutionFlow) {
  return JSON.stringify(
    flow.executionItems.map((item) => ({
      signalId: item.signalId,
      platform: item.platform,
      status: item.status,
      executionOrder: item.executionOrder,
      blockReasons: item.blockReasons,
      distributionBundleReady: item.distributionBundleReady,
      distributionStrategy: item.distributionStrategy,
      secondaryPlatforms: item.secondaryPlatforms,
      riskSeverity: item.riskSeverity,
      riskSummary: item.riskSummary,
    })),
  );
}

function countRows(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = normalizeReason(value);
    if (!normalized) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export async function getStoredWeeklyExecutionFlow(weekStartDate: string) {
  const store = await readPersistedStore();
  return store.flowsByWeekStartDate[weekStartDate] ?? null;
}

export async function listStoredWeeklyExecutionFlows() {
  const store = await readPersistedStore();
  return Object.values(store.flowsByWeekStartDate).sort(
    (left, right) =>
      new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime() ||
      right.weekStartDate.localeCompare(left.weekStartDate),
  );
}

export function buildWeeklyExecutionInsights(flows: WeeklyExecutionFlow[]): WeeklyExecutionInsights {
  const stagedCount = flows.reduce((sum, flow) => sum + flow.stagedCount, 0);
  const blockedCount = flows.reduce((sum, flow) => sum + flow.blockedCount, 0);
  const readyToReviewCount = flows.reduce((sum, flow) => sum + flow.reviewCount, 0);
  const readyToStageCount = flows.reduce((sum, flow) => sum + flow.readyToStageCount, 0);
  const actionableCount = stagedCount + readyToStageCount;
  const totalVisibleCount = actionableCount + readyToReviewCount + blockedCount;

  return {
    runCount: flows.length,
    stagedCount,
    blockedCount,
    readyToReviewCount,
    readyToStageCount,
    executionReadyRate: totalVisibleCount === 0 ? 0 : actionableCount / totalVisibleCount,
    stagedToBlockedRatio:
      blockedCount === 0 ? `${stagedCount}:0` : `${stagedCount}:${blockedCount}`,
    commonBlockReasons: countRows(
      flows.flatMap((flow) => flow.executionItems.flatMap((item) => item.blockReasons)),
    ).slice(0, 5),
  };
}

export async function runWeeklyExecutionAutopilot(input: {
  weekStartDate: string;
  pack: WeeklyPostingPack;
  approvalCandidates: ApprovalQueueCandidate[];
  stagedPackages: PostingAssistantPackage[];
  experiments?: ManualExperiment[];
  lifecycleByCampaignId?: Record<string, CampaignLifecycleRecommendation>;
  funnelEngine?: FunnelEngineState | null;
}): Promise<WeeklyExecutionRunResult> {
  const candidateBySignalId = new Map(
    input.approvalCandidates.map((candidate) => [candidate.signal.recordId, candidate]),
  );

  let workingPackages = sortPackages(input.stagedPackages);
  const stagedEvents: AuditEventInput[] = [];

  for (const item of input.pack.items) {
    if (getActivePackage(workingPackages, item.signalId, item.platform)) {
      continue;
    }

    const candidate = candidateBySignalId.get(item.signalId);
    if (!candidate || item.source === "evergreen") {
      continue;
    }
    const experimentLinked = (input.experiments ?? []).some(
      (experiment) =>
        experiment.status !== "completed" &&
        experiment.variants.some((variant) => variant.linkedSignalIds.includes(candidate.signal.recordId)),
    );

    const policy = buildStagePolicy(candidate);
    const isStageSafe =
      policy.decision === "allow" &&
      candidate.completeness.completenessState === "complete" &&
      candidate.conflicts.conflicts.length === 0 &&
      candidate.triage.triageState !== "needs_judgement" &&
      candidate.triage.triageState !== "suppress" &&
      candidate.commercialRisk.decision === "allow";
    if (!isStageSafe) {
      continue;
    }

    const chainResult = await executePromotionExecutionChain({
      candidate,
      weekStartDate: input.weekStartDate,
      platform: item.platform,
      platformLabel: item.platformLabel,
      sourceTitle: item.sourceTitle,
      experimentLinked,
      stagePolicy: policy,
      stage: async () => {
        const stageResult = await stagePostingAssistantPackage({
          signal: candidate.signal,
          platform: item.platform,
          overrides: {
            readinessReason: `Weekly execution autopilot staged ${item.platformLabel} because the package is complete, high-confidence, and aligned with this week's execution path.`,
          },
        });

        return {
          packageId: stageResult.pkg.packageId,
          packageData: stageResult.pkg,
        };
      },
    });
    if (!chainResult.executed || !chainResult.packageId || !chainResult.packageData) {
      continue;
    }
    const stagedPackage = chainResult.packageData as PostingAssistantPackage;
    workingPackages = sortPackages([
      {
        ...stagedPackage,
        readinessReason: `${stagedPackage.readinessReason} ${chainResult.assessment.summary}`.trim(),
      },
      ...workingPackages.filter((pkg) => pkg.packageId !== chainResult.packageId),
    ]);
    stagedEvents.push({
      signalId: item.signalId,
      eventType: "WEEKLY_EXECUTION_ITEM_STAGED",
      actor: "system",
      summary: `Weekly execution autopilot staged ${item.platformLabel} for ${item.sourceTitle}.`,
      metadata: {
        weekStartDate: input.weekStartDate,
        packageId: chainResult.packageId,
        platform: item.platform,
        executionChain: chainResult.assessment.chainType,
      },
    });
  }

  const prepared = prepareWeeklyExecutionFlow({
    weekStartDate: input.weekStartDate,
    pack: input.pack,
    approvalCandidates: input.approvalCandidates,
    stagedPackages: workingPackages,
    lifecycleByCampaignId: input.lifecycleByCampaignId,
    funnelEngine: input.funnelEngine,
  });
  const store = await readPersistedStore();
  const previous = store.flowsByWeekStartDate[input.weekStartDate] ?? null;
  const previousSignature = previous ? buildFlowSignature(previous) : null;
  const nextSignature = buildFlowSignature(prepared.flow);
  const itemEvents: AuditEventInput[] = [];

  for (const item of prepared.flow.executionItems) {
    const previousItem =
      previous?.executionItems.find(
        (entry) => entry.signalId === item.signalId && entry.platform === item.platform,
      ) ?? null;
    if (item.status === "blocked" && previousItem?.status !== "blocked") {
      itemEvents.push({
        signalId: item.signalId,
        eventType: "WEEKLY_EXECUTION_ITEM_BLOCKED",
        actor: "system",
        summary: item.blockReasons[0] ?? `Weekly execution autopilot blocked ${item.sourceTitle}.`,
        metadata: {
          weekStartDate: input.weekStartDate,
          platform: item.platform,
        },
      });
    }
    if (!previousItem || previousItem.executionOrder !== item.executionOrder) {
      itemEvents.push({
        signalId: item.signalId,
        eventType: "WEEKLY_EXECUTION_ORDER_ASSIGNED",
        actor: "system",
        summary: `Assigned weekly execution order ${item.executionOrder} to ${item.sourceTitle}.`,
        metadata: {
          weekStartDate: input.weekStartDate,
          platform: item.platform,
          status: item.status,
        },
      });
    }
  }

  if (previousSignature !== nextSignature) {
    await writePersistedStore(
      weeklyExecutionStoreSchema.parse({
        flowsByWeekStartDate: {
          ...store.flowsByWeekStartDate,
          [input.weekStartDate]: prepared.flow,
        },
        updatedAt: prepared.flow.generatedAt,
      }),
    );
  }

  await appendAuditEventsSafe([
    {
      signalId: `weekly-execution:${input.weekStartDate}`,
      eventType: "WEEKLY_EXECUTION_AUTOPILOT_RUN",
      actor: "system",
      summary: `Weekly execution autopilot prepared ${prepared.flow.executionItems.length} execution item${prepared.flow.executionItems.length === 1 ? "" : "s"}.`,
      metadata: {
        weekStartDate: input.weekStartDate,
        stagedCount: prepared.flow.stagedCount,
        blockedCount: prepared.flow.blockedCount,
        reviewCount: prepared.flow.reviewCount,
      },
    },
    ...stagedEvents,
    ...(previousSignature !== nextSignature ? itemEvents : []),
  ]);

  return prepared;
}
