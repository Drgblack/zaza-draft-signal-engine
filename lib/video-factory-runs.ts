import {
  listContentOpportunityState,
  type ContentOpportunity,
  type ContentOpportunityGenerationState,
} from "@/lib/content-opportunities";
import { isVideoFactoryLifecycleActive } from "@/lib/video-factory-idempotency";
import type { FactoryRunLedgerEntry } from "@/lib/video-factory-run-ledger";
import type { VideoFactoryAttemptLineage } from "@/lib/video-factory-lineage";
import type { VideoFactoryLifecycle } from "@/lib/video-factory-state";

export interface FactoryRunObservabilityItem {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  briefTitle: string | null;
  videoBriefId: string | null;
  attemptNumber: number;
  format: string | null;
  factoryJobId: string;
  renderJobId: string | null;
  renderVersion: string | null;
  lifecycleStatus: string;
  terminalOutcome: string | null;
  isActive: boolean;
  providerSet: {
    renderProvider: string | null;
    narrationProvider: string | null;
    visualProviders: string[];
    captionProvider: string | null;
    compositionProvider: string | null;
  };
  defaultsProfileId: string | null;
  defaultsVersion: number | null;
  trustStatus: string | null;
  trustAdjusted: boolean | null;
  retryCount: number;
  retryExhausted: boolean;
  qcSummary: {
    passed: boolean | null;
    sceneCount: number | null;
    captionsPresent: boolean | null;
  };
  createdAt: string | null;
  updatedAt: string;
  timeline: Array<{
    status: string;
    at: string;
  }>;
  failureStage: string | null;
  failureMessage: string | null;
  artifactSummary: {
    artifactCount: number;
    hasRenderedAsset: boolean;
    hasNarration: boolean;
    visualAssetCount: number;
    hasCaptions: boolean;
    hasComposedVideo: boolean;
    hasThumbnail: boolean;
  };
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  reviewOutcome: {
    status: string | null;
    reviewedAt: string | null;
    reasonCodes: string[];
    notes: string | null;
  };
}

export interface FactoryRunsObservabilityState {
  generatedAt: string;
  lookbackDays: number;
  runCount: number;
  activeCount: number;
  failedCount: number;
  pendingReviewCount: number;
  items: FactoryRunObservabilityItem[];
}

function buildLifecycleTimeline(lifecycle: VideoFactoryLifecycle) {
  return [
    { status: "draft", at: lifecycle.draftAt },
    { status: "queued", at: lifecycle.queuedAt },
    { status: "retry_queued", at: lifecycle.retryQueuedAt },
    { status: "preparing", at: lifecycle.preparingAt },
    { status: "generating_narration", at: lifecycle.generatingNarrationAt },
    { status: "generating_visuals", at: lifecycle.generatingVisualsAt },
    { status: "generating_captions", at: lifecycle.generatingCaptionsAt },
    { status: "composing", at: lifecycle.composingAt },
    { status: "generated", at: lifecycle.generatedAt },
    { status: "review_pending", at: lifecycle.reviewPendingAt },
    { status: "accepted", at: lifecycle.acceptedAt },
    { status: "rejected", at: lifecycle.rejectedAt },
    { status: "discarded", at: lifecycle.discardedAt },
    { status: "failed", at: lifecycle.failedAt },
    { status: "failed_permanent", at: lifecycle.failedPermanentAt },
  ]
    .filter(
      (transition): transition is { status: string; at: string } =>
        typeof transition.at === "string" && transition.at.trim().length > 0,
    )
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
}

function findMatchingLineage(
  generationState: ContentOpportunityGenerationState,
  input: {
    factoryJobId: string;
    renderJobId?: string | null;
  },
): VideoFactoryAttemptLineage | null {
  return (
    generationState.attemptLineage.find((attempt) => {
      if (input.renderJobId && attempt.renderJobId === input.renderJobId) {
        return true;
      }

      return attempt.factoryJobId === input.factoryJobId;
    }) ?? null
  );
}

function findDefaultsSnapshot(
  generationState: ContentOpportunityGenerationState,
  input: {
    factoryJobId: string;
    renderJobId?: string | null;
  },
) {
  const renderJob = generationState.renderJob;

  if (!renderJob) {
    return null;
  }

  if (input.renderJobId && renderJob.id !== input.renderJobId) {
    return null;
  }

  if (!input.renderJobId && generationState.factoryLifecycle?.factoryJobId !== input.factoryJobId) {
    return null;
  }

  return renderJob.productionDefaultsSnapshot ?? renderJob.compiledProductionPlan?.defaultsSnapshot ?? null;
}

function findReviewOutcome(
  generationState: ContentOpportunityGenerationState,
  entry: {
    renderedAssetId?: string | null;
    renderJobId?: string | null;
    terminalOutcome: string | null;
  },
) {
  const review = generationState.assetReview;
  const renderedAsset = generationState.renderedAsset;

  if (
    review &&
    ((entry.renderedAssetId && review.renderedAssetId === entry.renderedAssetId) ||
      (renderedAsset?.id && entry.renderedAssetId === renderedAsset.id))
  ) {
    return {
      status: review.status,
      reviewedAt: review.reviewedAt ?? null,
      reasonCodes: review.structuredReasons ?? [],
      notes: review.reviewNotes ?? review.rejectionReason ?? null,
    };
  }

  return {
    status: entry.terminalOutcome,
    reviewedAt: null,
    reasonCodes: [],
    notes: null,
  };
}

function buildArtifactSummary(input: {
  lineage: VideoFactoryAttemptLineage | null;
  artifactIds: string[];
  renderedAssetId?: string | null;
}) {
  return {
    artifactCount:
      input.lineage
        ? [
            input.lineage.narrationArtifact,
            ...input.lineage.sceneArtifacts,
            input.lineage.captionArtifact,
            input.lineage.composedVideoArtifact,
            input.lineage.thumbnailArtifact,
          ].filter(Boolean).length
        : input.artifactIds.length,
    hasRenderedAsset: Boolean(input.renderedAssetId),
    hasNarration: Boolean(input.lineage?.narrationArtifact),
    visualAssetCount: input.lineage?.sceneArtifacts.length ?? 0,
    hasCaptions: Boolean(input.lineage?.captionArtifact),
    hasComposedVideo: Boolean(input.lineage?.composedVideoArtifact),
    hasThumbnail: Boolean(input.lineage?.thumbnailArtifact),
  };
}

function toObservabilityItemFromLedger(
  opportunity: ContentOpportunity,
  generationState: ContentOpportunityGenerationState,
  entry: FactoryRunLedgerEntry,
): FactoryRunObservabilityItem {
  const lineage = findMatchingLineage(generationState, {
    factoryJobId: entry.factoryJobId,
    renderJobId: entry.renderJobId,
  });
  const defaultsSnapshot = findDefaultsSnapshot(generationState, {
    factoryJobId: entry.factoryJobId,
    renderJobId: entry.renderJobId,
  });

  return {
    id: entry.ledgerEntryId,
    opportunityId: opportunity.opportunityId,
    opportunityTitle: opportunity.title,
    briefTitle: opportunity.selectedVideoBrief?.title ?? null,
    videoBriefId: entry.videoBriefId,
    attemptNumber: entry.attemptNumber,
    format: opportunity.selectedVideoBrief?.format ?? null,
    factoryJobId: entry.factoryJobId,
    renderJobId: entry.renderJobId ?? null,
    renderVersion: lineage?.renderVersion ?? generationState.renderJob?.renderVersion ?? null,
    lifecycleStatus: entry.lifecycleTransitions.at(-1)?.status ?? entry.terminalOutcome,
    terminalOutcome: entry.terminalOutcome,
    isActive: false,
    providerSet: {
      renderProvider: entry.providerSet.renderProvider,
      narrationProvider: entry.providerSet.narrationProvider ?? null,
      visualProviders: entry.providerSet.visualProviders,
      captionProvider: entry.providerSet.captionProvider ?? null,
      compositionProvider: entry.providerSet.compositionProvider ?? null,
    },
    defaultsProfileId: defaultsSnapshot?.profileId ?? defaultsSnapshot?.id ?? null,
    defaultsVersion: defaultsSnapshot?.version ?? null,
    trustStatus:
      generationState.renderJob?.compiledProductionPlan?.trustAssessment.status ??
      null,
    trustAdjusted:
      generationState.renderJob?.compiledProductionPlan?.trustAssessment.adjusted ??
      null,
    retryCount: entry.retryState?.retryCount ?? 0,
    retryExhausted: entry.retryState?.exhausted ?? false,
    qcSummary: {
      passed: entry.qualityCheck?.passed ?? null,
      sceneCount: entry.qualityCheck?.sceneCount ?? null,
      captionsPresent: entry.qualityCheck?.captionsPresent ?? null,
    },
    createdAt: lineage?.createdAt ?? entry.lifecycleTransitions[0]?.at ?? null,
    updatedAt: entry.lastUpdatedAt,
    timeline: entry.lifecycleTransitions.map((transition) => ({
      status: transition.status,
      at: transition.at,
    })),
    failureStage: entry.failureStage ?? null,
    failureMessage: entry.failureMessage ?? null,
    artifactSummary: buildArtifactSummary({
      lineage,
      artifactIds: entry.artifactIds,
      renderedAssetId: entry.renderedAssetId ?? null,
    }),
    estimatedCostUsd: entry.estimatedCost?.estimatedTotalUsd ?? lineage?.costEstimate.estimatedTotalUsd ?? null,
    actualCostUsd: entry.actualCost?.actualCostUsd ?? lineage?.actualCost?.actualCostUsd ?? null,
    reviewOutcome: findReviewOutcome(generationState, {
      renderedAssetId: entry.renderedAssetId ?? null,
      renderJobId: entry.renderJobId ?? null,
      terminalOutcome: entry.terminalOutcome,
    }),
  };
}

function toObservabilityItemFromActiveLifecycle(
  opportunity: ContentOpportunity,
  generationState: ContentOpportunityGenerationState,
  lifecycle: VideoFactoryLifecycle,
): FactoryRunObservabilityItem {
  const lineage = findMatchingLineage(generationState, {
    factoryJobId: lifecycle.factoryJobId,
    renderJobId: generationState.renderJob?.id ?? null,
  });
  const defaultsSnapshot = findDefaultsSnapshot(generationState, {
    factoryJobId: lifecycle.factoryJobId,
    renderJobId: generationState.renderJob?.id ?? null,
  });
  const timeline = buildLifecycleTimeline(lifecycle);

  return {
    id: `${lifecycle.factoryJobId}:active`,
    opportunityId: opportunity.opportunityId,
    opportunityTitle: opportunity.title,
    briefTitle: opportunity.selectedVideoBrief?.title ?? null,
    videoBriefId: lifecycle.videoBriefId,
    attemptNumber: generationState.runLedger.length + 1,
    format: opportunity.selectedVideoBrief?.format ?? null,
    factoryJobId: lifecycle.factoryJobId,
    renderJobId: generationState.renderJob?.id ?? null,
    renderVersion: lifecycle.renderVersion ?? generationState.renderJob?.renderVersion ?? null,
    lifecycleStatus: lifecycle.status,
    terminalOutcome: null,
    isActive: true,
    providerSet: {
      renderProvider: lifecycle.provider ?? generationState.renderJob?.provider ?? null,
      narrationProvider: lineage?.narrationArtifact?.providerId ?? null,
      visualProviders: Array.from(
        new Set(lineage?.sceneArtifacts.map((artifact) => artifact.providerId) ?? []),
      ),
      captionProvider: lineage?.captionArtifact?.providerId ?? null,
      compositionProvider: lineage?.composedVideoArtifact?.providerId ?? null,
    },
    defaultsProfileId: defaultsSnapshot?.profileId ?? defaultsSnapshot?.id ?? null,
    defaultsVersion: defaultsSnapshot?.version ?? null,
    trustStatus:
      generationState.renderJob?.compiledProductionPlan?.trustAssessment.status ??
      null,
    trustAdjusted:
      generationState.renderJob?.compiledProductionPlan?.trustAssessment.adjusted ??
      null,
    retryCount:
      generationState.latestRetryState?.retryCount ??
      lifecycle.retryState?.retryCount ??
      0,
    retryExhausted:
      generationState.latestRetryState?.exhausted ??
      lifecycle.retryState?.exhausted ??
      false,
    qcSummary: {
      passed: generationState.latestQualityCheck?.passed ?? null,
      sceneCount: generationState.latestQualityCheck?.sceneCount ?? null,
      captionsPresent: generationState.latestQualityCheck?.captionsPresent ?? null,
    },
    createdAt: timeline[0]?.at ?? null,
    updatedAt: lifecycle.lastUpdatedAt,
    timeline,
    failureStage: lifecycle.failureStage ?? null,
    failureMessage: lifecycle.failureMessage ?? null,
    artifactSummary: buildArtifactSummary({
      lineage,
      artifactIds: [],
      renderedAssetId: generationState.renderedAsset?.id ?? null,
    }),
    estimatedCostUsd:
      generationState.latestCostEstimate?.estimatedTotalUsd ??
      lineage?.costEstimate.estimatedTotalUsd ??
      null,
    actualCostUsd:
      generationState.latestActualCost?.actualCostUsd ??
      lineage?.actualCost?.actualCostUsd ??
      null,
    reviewOutcome: findReviewOutcome(generationState, {
      renderedAssetId: generationState.renderedAsset?.id ?? null,
      renderJobId: generationState.renderJob?.id ?? null,
      terminalOutcome: null,
    }),
  };
}

export function buildFactoryRunsObservability(input: {
  opportunities: ContentOpportunity[];
  generatedAt?: string;
  now?: Date;
  lookbackDays?: number;
}): FactoryRunsObservabilityState {
  const lookbackDays = input.lookbackDays ?? 30;
  const now = input.now ?? new Date();
  const cutoff = now.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
  const items: FactoryRunObservabilityItem[] = [];

  for (const opportunity of input.opportunities) {
    const generationState = opportunity.generationState;

    if (!generationState) {
      continue;
    }

    for (const entry of generationState.runLedger) {
      const item = toObservabilityItemFromLedger(opportunity, generationState, entry);
      const updatedAtMs = new Date(item.updatedAt).getTime();

      if (!Number.isNaN(updatedAtMs) && updatedAtMs >= cutoff) {
        items.push(item);
      }
    }

    if (
      generationState.factoryLifecycle &&
      isVideoFactoryLifecycleActive(generationState.factoryLifecycle) &&
      !generationState.runLedger.some(
        (entry) => entry.factoryJobId === generationState.factoryLifecycle?.factoryJobId,
      )
    ) {
      const item = toObservabilityItemFromActiveLifecycle(
        opportunity,
        generationState,
        generationState.factoryLifecycle,
      );
      const updatedAtMs = new Date(item.updatedAt).getTime();

      if (!Number.isNaN(updatedAtMs) && updatedAtMs >= cutoff) {
        items.push(item);
      }
    }
  }

  const sortedItems = items.sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  return {
    generatedAt: input.generatedAt ?? now.toISOString(),
    lookbackDays,
    runCount: sortedItems.length,
    activeCount: sortedItems.filter((item) => item.isActive).length,
    failedCount: sortedItems.filter(
      (item) =>
        item.lifecycleStatus === "failed" || item.lifecycleStatus === "failed_permanent",
    ).length,
    pendingReviewCount: sortedItems.filter(
      (item) =>
        item.lifecycleStatus === "review_pending" ||
        item.reviewOutcome.status === "pending_review",
    ).length,
    items: sortedItems,
  };
}

export async function listFactoryRunsObservability(input?: {
  now?: Date;
  lookbackDays?: number;
}): Promise<FactoryRunsObservabilityState> {
  const state = await listContentOpportunityState();

  return buildFactoryRunsObservability({
    opportunities: state.opportunities,
    generatedAt: state.generatedAt,
    now: input?.now,
    lookbackDays: input?.lookbackDays,
  });
}
