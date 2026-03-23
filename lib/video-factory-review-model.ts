import type { ContentOpportunity } from "@/lib/content-opportunities";
import type { QualityCheckResult } from "@/lib/video-factory-quality-checks";

export type GenerationMode = "fast" | "quality";

export type PreTriageConcern =
  | "voice_concern"
  | "visual_mood_concern"
  | "scene_setting_concern"
  | "pacing_concern"
  | "trust_concern"
  | "no_concern";

export type RegenerationReason =
  | "wrong_visual_setting"
  | "wrong_mood"
  | "wrong_subject"
  | "poor_narration_quality"
  | "trust_concern"
  | "off_brand"
  | "other";

export type RenderJobStatus =
  | "queued"
  | "narration_generating"
  | "narration_done"
  | "transcription_generating"
  | "transcription_done"
  | "visuals_generating"
  | "visuals_done"
  | "quality_checking"
  | "compositing"
  | "uploading"
  | "completed"
  | "failed"
  | "failed_permanent";

export interface VideoBriefSummary {
  briefId: string;
  primaryHook: string;
  scriptBeat1: string;
  scriptBeat2: string;
  scriptBeat3: string;
  softClose: string;
  trustGuardrails: string[];
  audience: string;
}

export interface CostEstimate {
  estimatedTotalUsd: number;
  narrationCostUsd: number;
  visualsCostUsd: number;
  transcriptionCostUsd: number;
  mode: GenerationMode;
}

export interface RenderJobProgress {
  jobId: string;
  viewState: "pre-generation" | "generating" | "review";
  status: RenderJobStatus;
  regenerationCount: number;
  regenerationBudgetMax: number;
  budgetExhausted: boolean;
  currentAttempt: number;
  priorAttemptsCount: number;
  lifecycleLabel: string;
  terminalOutcome: string | null;
  lastUpdatedAt: string | null;
  providerLabel: string;
  qualitySummary: string | null;
  costEstimate: CostEstimate;
  actualCostUsd: number | null;
  finalVideoUrl: string | null;
  thumbnailUrl: string | null;
  narrationAudioUrl: string | null;
  captionTrackUrl: string | null;
  sceneAssetCount: number;
  lastError: string | null;
  steps: {
    narration: "pending" | "running" | "done" | "failed";
    transcription: "pending" | "running" | "done" | "failed";
    visuals: "pending" | "running" | "done" | "failed";
    qualityCheck: "pending" | "running" | "done" | "failed";
    composition: "pending" | "running" | "done" | "failed";
    upload: "pending" | "running" | "done" | "failed";
  };
}

type SelectedReviewAttempt = {
  selectedAttempt: NonNullable<ContentOpportunity["generationState"]>["attemptLineage"][number] | null;
  selectedRunEntry: NonNullable<ContentOpportunity["generationState"]>["runLedger"][number] | null;
};

const DEFAULT_REGENERATION_BUDGET_MAX = 3;

function buildDefaultCostEstimate(): CostEstimate {
  return {
    estimatedTotalUsd: 0.75,
    narrationCostUsd: 0.18,
    visualsCostUsd: 0.45,
    transcriptionCostUsd: 0.03,
    mode: "quality",
  };
}

function buildQualitySummary(qualityCheck: QualityCheckResult | null | undefined): string | null {
  if (!qualityCheck) {
    return null;
  }

  if (qualityCheck.passed) {
    return "Passed";
  }

  const firstFailure = qualityCheck.failures[0];
  if (firstFailure?.message) {
    return firstFailure.message;
  }

  return `Failed with ${qualityCheck.failures.length} issue${qualityCheck.failures.length === 1 ? "" : "s"}`;
}

function findMatchingAttempt(
  opportunity: ContentOpportunity,
): SelectedReviewAttempt {
  const generationState = opportunity.generationState;
  if (!generationState) {
    return {
      selectedAttempt: null,
      selectedRunEntry: null,
    };
  }

  const currentRenderJobId = generationState.renderJob?.id ?? null;
  const currentRenderedAssetId = generationState.renderedAsset?.id ?? null;

  for (let index = generationState.attemptLineage.length - 1; index >= 0; index -= 1) {
    const attempt = generationState.attemptLineage[index] ?? null;
    if (!attempt) {
      continue;
    }

    const renderJobMatches =
      currentRenderJobId && attempt.renderJobId === currentRenderJobId;
    const renderedAssetMatches =
      currentRenderedAssetId && attempt.renderedAssetId === currentRenderedAssetId;

    if (renderJobMatches || renderedAssetMatches) {
      const selectedRunEntry =
        generationState.runLedger.find((entry) => {
          const sameRenderJob =
            currentRenderJobId && entry.renderJobId === currentRenderJobId;
          const sameRenderedAsset =
            currentRenderedAssetId && entry.renderedAssetId === currentRenderedAssetId;
          return sameRenderJob || sameRenderedAsset;
        }) ?? null;

      return {
        selectedAttempt: attempt,
        selectedRunEntry,
      };
    }
  }

  return {
    selectedAttempt: generationState.attemptLineage.at(-1) ?? null,
    selectedRunEntry: generationState.runLedger.at(-1) ?? null,
  };
}

function buildProviderLabel(
  opportunity: ContentOpportunity,
  selectedRunEntry: SelectedReviewAttempt["selectedRunEntry"],
): string {
  const providerSet = selectedRunEntry?.providerSet;
  if (!providerSet) {
    return opportunity.generationState?.renderJob?.provider ?? "Factory providers";
  }

  const parts = [
    providerSet.narrationProvider
      ? `Narration ${providerSet.narrationProvider}`
      : null,
    providerSet.visualProviders.length
      ? `Visuals ${providerSet.visualProviders.join(", ")}`
      : null,
    providerSet.captionProvider ? `Captions ${providerSet.captionProvider}` : null,
    providerSet.compositionProvider
      ? `Composition ${providerSet.compositionProvider}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0
    ? parts.join(" | ")
    : opportunity.generationState?.renderJob?.provider ?? "Factory providers";
}

function isFailurePermanent(opportunity: ContentOpportunity): boolean {
  const retryState = opportunity.generationState?.latestRetryState;
  if (!retryState) {
    return true;
  }

  return retryState.failureMode === "non_retryable" || retryState.exhausted;
}

function inferViewState(opportunity: ContentOpportunity): RenderJobProgress["viewState"] {
  const generationState = opportunity.generationState;
  if (!generationState) {
    return "pre-generation";
  }

  const assetReviewStatus = generationState.assetReview?.status ?? null;
  if (assetReviewStatus === "pending_review" || assetReviewStatus === "accepted") {
    return "review";
  }

  const lifecycleStatus = generationState.factoryLifecycle?.status ?? null;
  if (
    lifecycleStatus === "queued" ||
    lifecycleStatus === "preparing" ||
    lifecycleStatus === "generating_narration" ||
    lifecycleStatus === "generating_visuals" ||
    lifecycleStatus === "generating_captions" ||
    lifecycleStatus === "composing" ||
    lifecycleStatus === "failed"
  ) {
    return "generating";
  }

  return "pre-generation";
}

function inferStatus(opportunity: ContentOpportunity): RenderJobStatus {
  const generationState = opportunity.generationState;
  if (!generationState) {
    return "queued";
  }

  const assetReviewStatus = generationState.assetReview?.status ?? null;
  if (assetReviewStatus === "pending_review" || assetReviewStatus === "accepted") {
    return "completed";
  }

  const lifecycleStatus = generationState.factoryLifecycle?.status ?? null;
  if (lifecycleStatus === "failed" || generationState.renderJob?.status === "failed") {
    return isFailurePermanent(opportunity) ? "failed_permanent" : "failed";
  }

  switch (lifecycleStatus) {
    case "generating_narration":
      return "narration_generating";
    case "generating_visuals":
      return "visuals_generating";
    case "generating_captions":
      return "transcription_generating";
    case "composing":
      return "compositing";
    case "generated":
      return "uploading";
    case "review_pending":
    case "accepted":
      return "completed";
    case "queued":
    case "preparing":
    case "rejected":
    case "discarded":
    case "draft":
    default:
      return "queued";
  }
}

function failedStageMatches(
  opportunity: ContentOpportunity,
  expectedStage: string,
): boolean {
  return opportunity.generationState?.factoryLifecycle?.failureStage === expectedStage;
}

function inferStepStatus(
  opportunity: ContentOpportunity,
  selectedAttempt: SelectedReviewAttempt["selectedAttempt"],
): RenderJobProgress["steps"] {
  const generationState = opportunity.generationState;
  const lifecycleStatus = generationState?.factoryLifecycle?.status ?? null;
  const qualityCheck = generationState?.latestQualityCheck ?? null;
  const renderedAsset = generationState?.renderedAsset ?? null;

  return {
    narration: failedStageMatches(opportunity, "generating_narration")
      ? "failed"
      : selectedAttempt?.narrationArtifact
        ? "done"
        : lifecycleStatus === "generating_narration"
          ? "running"
          : "pending",
    transcription: failedStageMatches(opportunity, "generating_captions")
      ? "failed"
      : selectedAttempt?.captionArtifact
        ? "done"
        : lifecycleStatus === "generating_captions"
          ? "running"
          : "pending",
    visuals: failedStageMatches(opportunity, "generating_visuals")
      ? "failed"
      : selectedAttempt && selectedAttempt.sceneArtifacts.length > 0
        ? "done"
        : lifecycleStatus === "generating_visuals"
          ? "running"
          : "pending",
    qualityCheck: generationState?.factoryLifecycle?.failureStage === "preparing" && qualityCheck
      ? "failed"
      : qualityCheck
        ? qualityCheck.passed
          ? "done"
          : "failed"
        : selectedAttempt?.sceneArtifacts.length
          ? "running"
          : "pending",
    composition: failedStageMatches(opportunity, "composing")
      ? "failed"
      : selectedAttempt?.composedVideoArtifact
        ? "done"
        : lifecycleStatus === "composing"
          ? "running"
          : "pending",
    upload: generationState?.factoryLifecycle?.status === "generated" && !renderedAsset
      ? "running"
      : renderedAsset
        ? "done"
        : "pending",
  };
}

export function buildVideoFactoryReviewBrief(
  opportunity: ContentOpportunity,
): VideoBriefSummary | null {
  const brief = opportunity.selectedVideoBrief;
  if (!brief) {
    return null;
  }

  const beats = brief.structure;

  return {
    briefId: brief.id,
    primaryHook: brief.hook,
    scriptBeat1: beats[0]?.guidance ?? "",
    scriptBeat2: beats[1]?.guidance ?? "",
    scriptBeat3: beats[2]?.guidance ?? "",
    softClose: brief.cta,
    trustGuardrails: brief.productionNotes ?? [],
    audience: opportunity.memoryContext.audienceCue ?? opportunity.primaryPainPoint,
  };
}

export function buildVideoFactoryReviewJob(
  opportunity: ContentOpportunity,
): RenderJobProgress | null {
  const generationState = opportunity.generationState;
  if (!generationState) {
    return null;
  }

  const { selectedAttempt, selectedRunEntry } = findMatchingAttempt(opportunity);
  const currentAttempt =
    selectedRunEntry?.attemptNumber ??
    generationState.runLedger.at(-1)?.attemptNumber ??
    generationState.attemptLineage.length;
  const priorAttemptsCount = Math.max(currentAttempt - 1, 0);
  const regenerationBudgetMax = DEFAULT_REGENERATION_BUDGET_MAX;
  const qualitySummary = buildQualitySummary(
    generationState.renderJob?.qualityCheck ??
      selectedRunEntry?.qualityCheck ??
      selectedAttempt?.qualityCheck ??
      generationState.latestQualityCheck,
  );
  const costEstimate = generationState.latestCostEstimate
    ? {
        estimatedTotalUsd: generationState.latestCostEstimate.estimatedTotalUsd,
        narrationCostUsd: generationState.latestCostEstimate.narrationCostUsd,
        visualsCostUsd: generationState.latestCostEstimate.visualsCostUsd,
        transcriptionCostUsd: generationState.latestCostEstimate.transcriptionCostUsd,
        mode: generationState.latestCostEstimate.mode,
      }
    : buildDefaultCostEstimate();
  const actualCostUsd =
    generationState.latestActualCost?.actualCostUsd ??
    selectedRunEntry?.actualCost?.actualCostUsd ??
    selectedAttempt?.actualCost?.actualCostUsd ??
    null;
  const finalVideoUrl =
    generationState.renderedAsset?.url ??
    selectedAttempt?.composedVideoArtifact?.storage?.url ??
    selectedAttempt?.composedVideoArtifact?.videoUrl ??
    null;
  const thumbnailUrl =
    generationState.renderedAsset?.thumbnailUrl ??
    selectedAttempt?.thumbnailArtifact?.storage?.url ??
    selectedAttempt?.thumbnailArtifact?.imageUrl ??
    selectedAttempt?.composedVideoArtifact?.thumbnailUrl ??
    null;

  return {
    jobId:
      generationState.renderJob?.id ??
      generationState.factoryLifecycle?.factoryJobId ??
      opportunity.opportunityId,
    viewState: inferViewState(opportunity),
    status: inferStatus(opportunity),
    regenerationCount: priorAttemptsCount,
    regenerationBudgetMax,
    budgetExhausted: priorAttemptsCount >= regenerationBudgetMax,
    currentAttempt,
    priorAttemptsCount,
    lifecycleLabel: generationState.factoryLifecycle?.status ?? "draft",
    terminalOutcome:
      selectedRunEntry?.terminalOutcome ??
      generationState.assetReview?.status ??
      generationState.factoryLifecycle?.status ??
      null,
    lastUpdatedAt:
      selectedRunEntry?.lastUpdatedAt ??
      generationState.factoryLifecycle?.lastUpdatedAt ??
      generationState.renderJob?.completedAt ??
      generationState.renderJob?.submittedAt ??
      null,
    providerLabel: buildProviderLabel(opportunity, selectedRunEntry),
    qualitySummary,
    costEstimate,
    actualCostUsd,
    finalVideoUrl,
    thumbnailUrl,
    narrationAudioUrl:
      selectedAttempt?.narrationArtifact?.storage?.url ??
      selectedAttempt?.narrationArtifact?.audioUrl ??
      null,
    captionTrackUrl:
      selectedAttempt?.captionArtifact?.storage?.url ??
      selectedAttempt?.captionArtifact?.captionUrl ??
      null,
    sceneAssetCount: selectedAttempt?.sceneArtifacts.length ?? 0,
    lastError:
      generationState.renderJob?.errorMessage ??
      generationState.factoryLifecycle?.failureMessage ??
      null,
    steps: inferStepStatus(opportunity, selectedAttempt),
  };
}
