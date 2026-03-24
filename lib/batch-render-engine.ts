import { z } from "zod";

import {
  autoApproveContentOpportunity,
  buildAutoApprovedOpportunity,
  generateContentOpportunityVideo,
  listContentOpportunityState,
  type ContentOpportunity,
  type ContentOpportunityState,
} from "@/lib/content-opportunities";
import {
  CONTENT_MIX_DIMENSIONS,
  assessAutoApproveOpportunity,
  buildObservedContentMixSummary,
  buildBatchAutoApproveConfigSnapshot,
  buildBatchRenderJob,
  buildBatchRenderResultsSummary,
  getActiveAutoApproveConfig,
  getAutoApproveConfig,
  getBatchRenderJob,
  getContentMixTarget,
  getContentMixValuesForDimension,
  upsertBatchRenderJob,
  type AutoApproveConfig,
  type BatchExecutionPolicy,
  type ContentMixTarget,
  type BatchPriorityStrategy,
  type BatchRenderJob,
  type BatchRenderResultsSummary,
} from "@/lib/factory-batch-control";
import {
  getBatchSelectionLearningBiasSync,
  type BatchSelectionLearningBias,
} from "@/lib/learning-loop";
import type { RenderProvider } from "@/lib/render-jobs";
import type { StrategicOpportunity } from "@/lib/strategic-intelligence-types";
import { scheduleVideoFactoryRun } from "@/lib/video-factory-runner";

const BATCH_RENDER_PRIORITY_WEIGHTS = {
  priority: {
    high: 14,
    medium: 8,
    low: 3,
  },
  commercialPotential: {
    high: 12,
    medium: 7,
    low: 2,
  },
  trustRisk: {
    low: 10,
    medium: 4,
    high: -8,
  },
} as const;

const ACTIVE_RENDER_JOB_STATUSES = new Set(["queued", "submitted", "rendering"]);
const ACTIVE_FACTORY_LIFECYCLE_STATUSES = new Set([
  "queued",
  "retry_queued",
  "preparing",
  "generating_narration",
  "generating_visuals",
  "generating_captions",
  "composing",
  "generated",
]);

const batchRenderSelectionConfigSchema = z.object({
  batchId: z.string().trim().min(1).optional(),
  targetCount: z.number().int().positive().max(25),
  selectedOpportunityIds: z.array(z.string().trim().min(1)).default([]),
  priorityStrategy: z
    .enum(["high_score", "mixed", "exploration"])
    .default("high_score"),
  maxCost: z.number().min(0).nullable().default(null),
  autoApproveConfigId: z.string().trim().nullable().default(null),
  executionPolicy: z
    .object({
      priority: z.enum(["score-desc", "fifo"]).optional(),
      throttle: z.number().int().positive().max(3).optional(),
      requireFounderApproval: z.boolean().optional(),
      maxBatchSize: z.number().int().positive().max(10).optional(),
      contentMixTargetId: z.string().trim().nullable().optional(),
      executionPath: z
        .enum(["video_factory", "campaigns", "connect", "hold", "review"])
        .nullable()
        .optional(),
      notes: z.string().trim().nullable().optional(),
    })
    .optional(),
});

export type BatchRenderSelectionConfig = z.input<
  typeof batchRenderSelectionConfigSchema
>;

export interface BatchSelectionCandidate {
  opportunity: ContentOpportunity;
  estimatedCostUsd: number;
  baseScore: number;
  blendedScore: number;
  includedAsExploration: boolean;
  autoApprovable: boolean;
}

export interface BatchSelectionSkippedRecord {
  opportunityId: string;
  reason: string;
}

export interface BatchSelectionResult {
  batchId: string;
  selected: BatchSelectionCandidate[];
  skipped: BatchSelectionSkippedRecord[];
  estimatedTotalCostUsd: number;
  autoApproveConfig: AutoApproveConfig | null;
  contentMixTarget: ContentMixTarget | null;
}

export interface BatchExecutionResult {
  batch: BatchRenderJob;
  state: ContentOpportunityState;
  selection: BatchSelectionResult;
}

interface BatchRenderEngineDependencies {
  listContentOpportunityState: typeof listContentOpportunityState;
  autoApproveContentOpportunity: typeof autoApproveContentOpportunity;
  generateContentOpportunityVideo: typeof generateContentOpportunityVideo;
  scheduleVideoFactoryRun: typeof scheduleVideoFactoryRun;
  getAutoApproveConfig: typeof getAutoApproveConfig;
  getActiveAutoApproveConfig: typeof getActiveAutoApproveConfig;
  getBatchRenderJob: typeof getBatchRenderJob;
  getContentMixTarget: typeof getContentMixTarget;
  upsertBatchRenderJob: typeof upsertBatchRenderJob;
}

const defaultDependencies: BatchRenderEngineDependencies = {
  listContentOpportunityState,
  autoApproveContentOpportunity,
  generateContentOpportunityVideo,
  scheduleVideoFactoryRun,
  getAutoApproveConfig,
  getActiveAutoApproveConfig,
  getBatchRenderJob,
  getContentMixTarget,
  upsertBatchRenderJob,
};

function buildBatchId() {
  return `batch-${Date.now().toString(36)}`;
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function unwrapContentOpportunity(
  item: ContentOpportunity | StrategicOpportunity,
): ContentOpportunity | null {
  if (
    item &&
    typeof item === "object" &&
    "opportunityId" in item &&
    typeof item.opportunityId === "string"
  ) {
    return item as ContentOpportunity;
  }

  if (
    item &&
    typeof item === "object" &&
    "base" in item &&
    item.base &&
    typeof item.base === "object" &&
    "opportunityId" in item.base &&
    typeof (item.base as { opportunityId?: unknown }).opportunityId === "string"
  ) {
    return item.base as ContentOpportunity;
  }

  return null;
}

function hasActiveRenderExecution(opportunity: ContentOpportunity) {
  const renderStatus = opportunity.generationState?.renderJob?.status ?? null;
  const lifecycleStatus = opportunity.generationState?.factoryLifecycle?.status ?? null;

  return (
    (renderStatus !== null && ACTIVE_RENDER_JOB_STATUSES.has(renderStatus)) ||
    (lifecycleStatus !== null &&
      ACTIVE_FACTORY_LIFECYCLE_STATUSES.has(lifecycleStatus))
  );
}

function isApprovedForRender(opportunity: ContentOpportunity) {
  return (
    opportunity.status === "approved_for_production" &&
    opportunity.founderSelectionStatus === "approved" &&
    Boolean(opportunity.selectedVideoBrief)
  );
}

function estimateOpportunityCost(opportunity: ContentOpportunity) {
  const estimated =
    opportunity.generationState?.latestCostEstimate?.estimatedTotalUsd ??
    opportunity.generationState?.renderJob?.costEstimate?.estimatedTotalUsd ??
    opportunity.historicalCostAvg ??
    1.25;
  return Math.max(0.25, Math.round(estimated * 100) / 100);
}

function confidenceScore(opportunity: ContentOpportunity) {
  return typeof opportunity.confidence === "number"
    ? opportunity.confidence * 100
    : 0;
}

function learningSelectionAdjustment(
  opportunity: ContentOpportunity,
  resolver: (input: {
    format?: string | null;
    hookType?: string | null;
    ctaType?: string | null;
  }) => BatchSelectionLearningBias,
) {
  const bias = resolver({
    format: opportunity.recommendedFormat,
    hookType: getContentMixValuesForDimension(opportunity, "hookType")[0] ?? null,
    ctaType: getContentMixValuesForDimension(opportunity, "cta")[0] ?? null,
  });

  return bias.scoreDelta;
}

function priorityScore(
  opportunity: ContentOpportunity,
  resolver: (input: {
    format?: string | null;
    hookType?: string | null;
    ctaType?: string | null;
  }) => BatchSelectionLearningBias = getBatchSelectionLearningBiasSync,
) {
  const growthPriority = opportunity.growthIntelligence?.executionPriority ?? 0;
  const strategicValue = opportunity.growthIntelligence?.strategicValue ?? 0;
  const learningValue = opportunity.growthIntelligence?.learningValue ?? 0;
  const confidence = confidenceScore(opportunity);
  const priorityWeight =
    BATCH_RENDER_PRIORITY_WEIGHTS.priority[opportunity.priority];
  const commercialWeight =
    BATCH_RENDER_PRIORITY_WEIGHTS.commercialPotential[
      opportunity.commercialPotential
    ];
  const trustWeight =
    BATCH_RENDER_PRIORITY_WEIGHTS.trustRisk[opportunity.trustRisk];

  let score =
    growthPriority * 0.42 +
    confidence * 0.24 +
    strategicValue * 0.18 +
    learningValue * 0.08 +
    priorityWeight +
    commercialWeight +
    trustWeight;

  if (isApprovedForRender(opportunity)) {
    score += 12;
  }

  if (opportunity.growthIntelligence?.executionPath === "video_factory") {
    score += 6;
  }

  score += learningSelectionAdjustment(opportunity, resolver);

  if (hasActiveRenderExecution(opportunity)) {
    score -= 100;
  }

  return Math.round(score * 100) / 100;
}

function diversityAdjustment(
  opportunity: ContentOpportunity,
  selected: BatchSelectionCandidate[],
) {
  const format = opportunity.recommendedFormat;
  const type = opportunity.opportunityType;
  const contentType =
    normalizeText(opportunity.selectedVideoBrief?.contentType) ?? "unknown";
  const selectedFormats = new Map<string, number>();
  const selectedTypes = new Map<string, number>();
  const selectedContentTypes = new Map<string, number>();
  const selectedPlatforms = new Set<string>();

  for (const item of selected) {
    selectedFormats.set(
      item.opportunity.recommendedFormat,
      (selectedFormats.get(item.opportunity.recommendedFormat) ?? 0) + 1,
    );
    selectedTypes.set(
      item.opportunity.opportunityType,
      (selectedTypes.get(item.opportunity.opportunityType) ?? 0) + 1,
    );
    const nextContentType =
      normalizeText(item.opportunity.selectedVideoBrief?.contentType) ?? "unknown";
    selectedContentTypes.set(
      nextContentType,
      (selectedContentTypes.get(nextContentType) ?? 0) + 1,
    );
    for (const platform of item.opportunity.recommendedPlatforms) {
      selectedPlatforms.add(platform);
    }
  }

  let adjustment = 0;

  adjustment += selectedFormats.has(format)
    ? -(selectedFormats.get(format) ?? 0) * 4
    : 7;
  adjustment += selectedTypes.has(type)
    ? -(selectedTypes.get(type) ?? 0) * 3
    : 5;
  adjustment += selectedContentTypes.has(contentType)
    ? -(selectedContentTypes.get(contentType) ?? 0) * 2
    : 4;

  const overlappingPlatforms = opportunity.recommendedPlatforms.filter((platform) =>
    selectedPlatforms.has(platform),
  ).length;
  adjustment -= overlappingPlatforms;

  return adjustment;
}

function mixTargetForDimension(
  target: ContentMixTarget,
  dimension: (typeof CONTENT_MIX_DIMENSIONS)[number],
) {
  return target.targets[dimension];
}

function mixAlignmentAdjustment(input: {
  opportunity: ContentOpportunity;
  selected: BatchSelectionCandidate[];
  contentMixTarget: ContentMixTarget | null;
}) {
  if (!input.contentMixTarget) {
    return 0;
  }

  const currentOpportunities = input.selected.map((item) => item.opportunity);
  const currentObserved = buildObservedContentMixSummary({
    opportunities: currentOpportunities,
  });
  const projectedObserved = buildObservedContentMixSummary({
    opportunities: [...currentOpportunities, input.opportunity],
  });
  let adjustment = 0;

  for (const dimension of CONTENT_MIX_DIMENSIONS) {
    const targets = mixTargetForDimension(input.contentMixTarget, dimension);
    const candidateValues = getContentMixValuesForDimension(
      input.opportunity,
      dimension,
    );

    for (const value of candidateValues) {
      const targetShare = targets[value];
      if (typeof targetShare !== "number") {
        continue;
      }

      const currentShare =
        currentObserved[`${dimension}Shares` as keyof typeof currentObserved];
      const projectedShare =
        projectedObserved[`${dimension}Shares` as keyof typeof projectedObserved];
      const currentValueShare =
        typeof currentShare === "object" && currentShare && value in currentShare
          ? Number(currentShare[value as keyof typeof currentShare] ?? 0)
          : 0;
      const projectedValueShare =
        typeof projectedShare === "object" && projectedShare && value in projectedShare
          ? Number(projectedShare[value as keyof typeof projectedShare] ?? 0)
          : 0;
      const currentGap = Math.abs(currentValueShare - targetShare);
      const projectedGap = Math.abs(projectedValueShare - targetShare);

      if (projectedGap < currentGap) {
        adjustment += 8;
      } else if (projectedGap > currentGap + 0.05) {
        adjustment -= 6;
      }

      if (projectedValueShare > targetShare + 0.2) {
        adjustment -= 4;
      }
    }
  }

  return adjustment;
}

function explorationAdjustment(
  opportunity: ContentOpportunity,
  selected: BatchSelectionCandidate[],
) {
  const selectedFormats = new Set(
    selected.map((item) => item.opportunity.recommendedFormat),
  );
  const selectedHookTypes = new Set(
    selected.flatMap((item) =>
      getContentMixValuesForDimension(item.opportunity, "hookType"),
    ),
  );
  const selectedPainPoints = new Set(
    selected.flatMap((item) =>
      getContentMixValuesForDimension(item.opportunity, "painPoint"),
    ),
  );
  let score = (1 - confidenceScore(opportunity) / 100) * 12;

  if (!selectedFormats.has(opportunity.recommendedFormat)) {
    score += 8;
  }

  for (const hookType of getContentMixValuesForDimension(opportunity, "hookType")) {
    if (!selectedHookTypes.has(hookType)) {
      score += 7;
    }
  }

  for (const painPoint of getContentMixValuesForDimension(opportunity, "painPoint")) {
    if (!selectedPainPoints.has(painPoint)) {
      score += 5;
    }
  }

  return Math.round(score * 100) / 100;
}

function explorationShareForStrategy(strategy: BatchPriorityStrategy) {
  switch (strategy) {
    case "exploration":
      return 0.2;
    case "mixed":
      return 0.15;
    case "high_score":
    default:
      return 0.1;
  }
}

function resolveAutoApproveEligibility(
  opportunity: ContentOpportunity,
  autoApproveConfig: AutoApproveConfig | null,
) {
  if (!autoApproveConfig || opportunity.status !== "open") {
    return false;
  }

  const assessment = assessAutoApproveOpportunity({
    opportunity,
    config: autoApproveConfig,
    autoApprovedTodayCount: 0,
    totalAutoApprovedCount: 0,
  });

  return (
    assessment.eligible &&
    !assessment.heldForMandatoryReview &&
    buildAutoApprovedOpportunity(opportunity, new Date().toISOString()) !== null
  );
}

function fillSelectionFromPool(input: {
  pool: Array<{
    opportunity: ContentOpportunity;
    estimatedCostUsd: number;
    baseScore: number;
    autoApprovable: boolean;
  }>;
  selected: BatchSelectionCandidate[];
  targetCount: number;
  maxCost: number | null;
  selectedIds: Set<string>;
  contentMixTarget: ContentMixTarget | null;
  explorationMode?: boolean;
}): BatchSelectionCandidate[] {
  const nextSelected = [...input.selected];
  let runningCost = nextSelected.reduce(
    (sum, item) => sum + item.estimatedCostUsd,
    0,
  );
  const available = input.pool.filter(
    (candidate) => !input.selectedIds.has(candidate.opportunity.opportunityId),
  );

  while (
    nextSelected.length < input.targetCount &&
    available.length > 0
  ) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < available.length; index += 1) {
      const candidate = available[index];
      const projectedCost = runningCost + candidate.estimatedCostUsd;
      if (input.maxCost !== null && projectedCost > input.maxCost) {
        continue;
      }

      const blendedScore =
        candidate.baseScore +
        diversityAdjustment(candidate.opportunity, nextSelected) +
        mixAlignmentAdjustment({
          opportunity: candidate.opportunity,
          selected: nextSelected,
          contentMixTarget: input.contentMixTarget,
        }) +
        (input.explorationMode
          ? explorationAdjustment(candidate.opportunity, nextSelected)
          : 0);
      if (blendedScore > bestScore) {
        bestScore = blendedScore;
        bestIndex = index;
      }
    }

    if (bestIndex === -1) {
      break;
    }

    const [chosen] = available.splice(bestIndex, 1);
    nextSelected.push({
      opportunity: chosen.opportunity,
      estimatedCostUsd: chosen.estimatedCostUsd,
      baseScore: chosen.baseScore,
      blendedScore: Math.round(bestScore * 100) / 100,
      includedAsExploration: input.explorationMode ?? false,
      autoApprovable: chosen.autoApprovable,
    });
    input.selectedIds.add(chosen.opportunity.opportunityId);
    runningCost += chosen.estimatedCostUsd;
  }

  return nextSelected;
}

export function selectBatchOpportunities(input: {
  opportunities: Array<ContentOpportunity | StrategicOpportunity>;
  config: BatchRenderSelectionConfig;
  autoApproveConfig?: AutoApproveConfig | null;
  contentMixTarget?: ContentMixTarget | null;
  learningBiasResolver?: (input: {
    format?: string | null;
    hookType?: string | null;
    ctaType?: string | null;
  }) => BatchSelectionLearningBias;
}): BatchSelectionResult {
  const config = batchRenderSelectionConfigSchema.parse(input.config);
  const batchId = config.batchId ?? buildBatchId();
  const autoApproveConfig = input.autoApproveConfig ?? null;
  const contentMixTarget = input.contentMixTarget ?? null;
  const learningBiasResolver =
    input.learningBiasResolver ?? getBatchSelectionLearningBiasSync;
  const skipped: BatchSelectionSkippedRecord[] = [];
  const requestedIdSet = new Set(config.selectedOpportunityIds);
  const normalized = input.opportunities
    .map(unwrapContentOpportunity)
    .filter((opportunity): opportunity is ContentOpportunity => Boolean(opportunity));

  const filtered = normalized.filter((opportunity) => {
    if (
      requestedIdSet.size > 0 &&
      !requestedIdSet.has(opportunity.opportunityId)
    ) {
      return false;
    }

    if (hasActiveRenderExecution(opportunity)) {
      skipped.push({
        opportunityId: opportunity.opportunityId,
        reason: "Active render execution already exists.",
      });
      return false;
    }

    if (
      !isApprovedForRender(opportunity) &&
      !resolveAutoApproveEligibility(opportunity, autoApproveConfig)
    ) {
      skipped.push({
        opportunityId: opportunity.opportunityId,
        reason: "Opportunity is not render-ready under current approval rails.",
      });
      return false;
    }

    return true;
  });

  const ranked = filtered
    .map((opportunity) => ({
      opportunity,
      estimatedCostUsd: estimateOpportunityCost(opportunity),
      baseScore: priorityScore(opportunity, learningBiasResolver),
      autoApprovable: resolveAutoApproveEligibility(opportunity, autoApproveConfig),
    }))
    .sort(
      (left, right) =>
        right.baseScore - left.baseScore ||
        right.estimatedCostUsd - left.estimatedCostUsd ||
        left.opportunity.title.localeCompare(right.opportunity.title),
    );

  const explorationQuota =
    ranked.length <= 1
      ? 0
      : Math.min(
          config.targetCount,
          Math.max(1, Math.round(config.targetCount * explorationShareForStrategy(config.priorityStrategy))),
        );
  const lowConfidencePool = [...ranked]
    .sort(
      (left, right) =>
        explorationAdjustment(right.opportunity, []) -
          explorationAdjustment(left.opportunity, []) ||
        confidenceScore(left.opportunity) - confidenceScore(right.opportunity) ||
        left.baseScore - right.baseScore,
    )
    .slice(0, explorationQuota);
  const selectedIds = new Set<string>();
  let selected = fillSelectionFromPool({
    pool:
      config.priorityStrategy === "high_score" ? [] : lowConfidencePool,
    selected: [],
    targetCount: config.priorityStrategy === "high_score" ? 0 : explorationQuota,
    maxCost: config.maxCost,
    selectedIds,
    contentMixTarget,
    explorationMode: true,
  });

  selected = fillSelectionFromPool({
    pool: ranked,
    selected,
    targetCount: config.targetCount,
    maxCost: config.maxCost,
    selectedIds,
    contentMixTarget,
  });

  const selectedOpportunityIds = new Set(
    selected.map((item) => item.opportunity.opportunityId),
  );
  for (const candidate of ranked) {
    if (!selectedOpportunityIds.has(candidate.opportunity.opportunityId)) {
      if (
        config.maxCost !== null &&
        selected.reduce((sum, item) => sum + item.estimatedCostUsd, 0) +
          candidate.estimatedCostUsd >
          config.maxCost
      ) {
        skipped.push({
          opportunityId: candidate.opportunity.opportunityId,
          reason: "Skipped because including it would exceed the batch max cost.",
        });
      } else {
        skipped.push({
          opportunityId: candidate.opportunity.opportunityId,
          reason: "Skipped by priority and diversity selection.",
        });
      }
    }
  }

  return {
    batchId,
    selected,
    skipped,
    estimatedTotalCostUsd: Math.round(
      selected.reduce((sum, item) => sum + item.estimatedCostUsd, 0) * 100,
    ) / 100,
    autoApproveConfig,
    contentMixTarget,
  };
}

function mergeResultsSummary(input: {
  existing?: Partial<BatchRenderResultsSummary> | null;
  attempted?: number;
  queued?: number;
  autoApproved?: number;
  skipped?: number;
  failed?: number;
  selected?: number;
  completed?: number;
  completedWithFailures?: number;
  lastRunAt?: string | null;
  notes?: string[];
}) {
  return buildBatchRenderResultsSummary({
    ...(input.existing ?? {}),
    attempted: input.attempted ?? input.existing?.attempted ?? 0,
    queued: input.queued ?? input.existing?.queued ?? 0,
    autoApproved: input.autoApproved ?? input.existing?.autoApproved ?? 0,
    skipped: input.skipped ?? input.existing?.skipped ?? 0,
    failed: input.failed ?? input.existing?.failed ?? 0,
    selected: input.selected ?? input.existing?.selected ?? 0,
    completed: input.completed ?? input.existing?.completed ?? 0,
    completedWithFailures:
      input.completedWithFailures ??
      input.existing?.completedWithFailures ??
      0,
    lastRunAt: input.lastRunAt ?? input.existing?.lastRunAt ?? null,
    notes: input.notes ?? input.existing?.notes ?? [],
  });
}

export async function refreshBatchRenderJobTracking(
  batchId: string,
  deps: Partial<BatchRenderEngineDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...deps };
  const existing = dependencies.getBatchRenderJob(batchId);
  if (!existing) {
    throw new Error("Batch render job not found.");
  }

  const state = await dependencies.listContentOpportunityState();
  const selectedIds =
    existing.selectedOpportunityIds.length > 0
      ? existing.selectedOpportunityIds
      : existing.opportunityIds;
  const selectedSet = new Set(selectedIds);
  const opportunities = state.opportunities.filter((opportunity) =>
    selectedSet.has(opportunity.opportunityId),
  );
  const summary = buildBatchRenderJob({
    batchId: existing.batchId,
    opportunities,
    status: existing.status,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    completedAt: existing.completedAt,
    targetCount: existing.targetCount,
    selectedOpportunityIds: selectedIds,
    priorityStrategy: existing.priorityStrategy,
    maxCost: existing.maxCost,
    autoApproveConfig: existing.autoApproveConfig,
    resultsSummary: mergeResultsSummary({
      existing: existing.resultsSummary,
      selected: selectedIds.length,
      completed: opportunities.filter((opportunity) => {
        const lifecycleStatus =
          opportunity.generationState?.factoryLifecycle?.status ?? null;
        return (
          lifecycleStatus === "review_pending" ||
          lifecycleStatus === "accepted" ||
          lifecycleStatus === "rejected" ||
          lifecycleStatus === "discarded"
        );
      }).length,
      completedWithFailures:
        opportunities.some(
          (opportunity) =>
            opportunity.generationState?.factoryLifecycle?.status === "failed" ||
            opportunity.generationState?.factoryLifecycle?.status ===
              "failed_permanent",
        )
          ? 1
          : 0,
    }),
    executionPolicy: existing.executionPolicy,
  });

  return dependencies.upsertBatchRenderJob(summary);
}

export async function executeBatchRenderJob(
  input: BatchRenderSelectionConfig & {
    opportunities?: Array<ContentOpportunity | StrategicOpportunity>;
    provider?: RenderProvider;
    allowDailyCapOverride?: boolean;
  },
  deps: Partial<BatchRenderEngineDependencies> = {},
): Promise<BatchExecutionResult> {
  const dependencies = { ...defaultDependencies, ...deps };
  const config = batchRenderSelectionConfigSchema.parse(input);
  const initialState = input.opportunities
    ? ({
        generatedAt: new Date().toISOString(),
        openCount: 0,
        approvedCount: 0,
        dismissedCount: 0,
        topSummary: [],
        opportunities: input.opportunities
          .map(unwrapContentOpportunity)
          .filter((opportunity): opportunity is ContentOpportunity => Boolean(opportunity)),
      } satisfies ContentOpportunityState)
    : await dependencies.listContentOpportunityState();
  const autoApproveConfig =
    (config.autoApproveConfigId
      ? dependencies.getAutoApproveConfig(config.autoApproveConfigId)
      : dependencies.getActiveAutoApproveConfig()) ?? null;
  const contentMixTargetId =
    config.executionPolicy?.contentMixTargetId ?? null;
  const contentMixTarget = contentMixTargetId
    ? dependencies.getContentMixTarget(contentMixTargetId)
    : null;
  const selection = selectBatchOpportunities({
    opportunities: initialState.opportunities,
    config,
    autoApproveConfig,
    contentMixTarget,
  });

  if (selection.selected.length === 0) {
    throw new Error("No eligible content opportunities were available for batch rendering.");
  }

  const notes = [...selection.skipped.map((item) => `${item.opportunityId}: ${item.reason}`)];
  let attempted = 0;
  let queued = 0;
  let failed = 0;
  let autoApproved = 0;

  for (const candidate of selection.selected) {
    try {
      if (!isApprovedForRender(candidate.opportunity) && candidate.autoApprovable) {
        await dependencies.autoApproveContentOpportunity({
          opportunityId: candidate.opportunity.opportunityId,
          approvedBy: autoApproveConfig?.name ?? "batch-render-engine",
        });
        autoApproved += 1;
      }

      attempted += 1;
      await dependencies.generateContentOpportunityVideo({
        opportunityId: candidate.opportunity.opportunityId,
        provider: input.provider,
        allowDailyCapOverride: input.allowDailyCapOverride ?? false,
      });
      await dependencies.scheduleVideoFactoryRun({
        opportunityId: candidate.opportunity.opportunityId,
      });
      queued += 1;
    } catch (error) {
      failed += 1;
      notes.push(
        `${candidate.opportunity.opportunityId}: ${error instanceof Error ? error.message : "Batch queue dispatch failed."}`,
      );
    }
  }

  const updatedState = await dependencies.listContentOpportunityState();
  const selectedIds = selection.selected.map(
    (candidate) => candidate.opportunity.opportunityId,
  );
  const selectedSet = new Set(selectedIds);
  const selectedOpportunities = updatedState.opportunities.filter((opportunity) =>
    selectedSet.has(opportunity.opportunityId),
  );

  const batch = buildBatchRenderJob({
    batchId: selection.batchId,
    opportunities: selectedOpportunities,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetCount: config.targetCount,
    selectedOpportunityIds: selectedIds,
    priorityStrategy: config.priorityStrategy,
    maxCost: config.maxCost,
    autoApproveConfig: buildBatchAutoApproveConfigSnapshot(autoApproveConfig),
    resultsSummary: mergeResultsSummary({
      selected: selectedIds.length,
      attempted,
      queued,
      autoApproved,
      skipped: selection.skipped.length,
      failed,
      completed: selectedOpportunities.filter((opportunity) => {
        const lifecycleStatus =
          opportunity.generationState?.factoryLifecycle?.status ?? null;
        return (
          lifecycleStatus === "review_pending" ||
          lifecycleStatus === "accepted" ||
          lifecycleStatus === "rejected" ||
          lifecycleStatus === "discarded"
        );
      }).length,
      completedWithFailures: failed > 0 ? 1 : 0,
      lastRunAt: new Date().toISOString(),
      notes,
    }),
    executionPolicy: {
      ...(input.executionPolicy ?? {}),
      maxBatchSize:
        input.executionPolicy?.maxBatchSize ?? Math.min(config.targetCount, 10),
      contentMixTargetId,
      executionPath: "video_factory",
    } satisfies Partial<BatchExecutionPolicy>,
  });

  const persistedBatch = await dependencies.upsertBatchRenderJob(batch);

  return {
    batch: persistedBatch,
    state: updatedState,
    selection,
  };
}
