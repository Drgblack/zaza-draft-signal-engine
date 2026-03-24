import type { ContentOpportunity } from "@/lib/content-opportunities";
import {
  createMockRenderedAsset,
} from "@/lib/rendered-assets";
import type { RenderProvider } from "@/lib/render-jobs";
import { compileVideoBriefForProduction } from "@/lib/prompt-compiler";
import {
  getCaptionProvider,
  resolveCaptionProviderId,
  type GeneratedCaptionTrack,
} from "@/lib/providers/caption-provider";
import { ffmpegCompositionProvider } from "@/lib/providers/composition-provider";
import {
  getNarrationProvider,
  resolveNarrationProviderId,
  type GeneratedNarration,
} from "@/lib/providers/narration-provider";
import {
  getVisualProvider,
  type GeneratedSceneAsset,
} from "@/lib/providers/visual-provider";
import type { VideoBrief } from "@/lib/video-briefs";
import {
  executeWithRetry,
  type VideoFactoryRetryState,
} from "@/lib/video-factory-retry";
import type { VideoFactoryStatus } from "@/lib/video-factory-state";
import {
  applyVideoFactorySelectionDecision,
  buildVideoFactorySelectionDecision,
  retryPolicyForStage,
  type VideoFactorySelectionDecision,
} from "@/lib/video-factory-selection";

export interface CompiledGenerationOrchestration {
  compiledProductionPlan: ReturnType<typeof compileVideoBriefForProduction>;
  narrationSpec: ReturnType<typeof compileVideoBriefForProduction>["narrationSpec"];
  renderJobInput: {
    provider: RenderProvider;
    renderVersion: string;
    compiledProductionPlan: ReturnType<typeof compileVideoBriefForProduction>;
    productionDefaultsSnapshot: ReturnType<typeof compileVideoBriefForProduction>["defaultsSnapshot"];
    providerJobId: string;
    submittedAt: string;
    completedAt: string;
  };
  renderedAssetInput: Omit<Parameters<typeof createMockRenderedAsset>[0], "renderJobId">;
  providerResults: {
    narration: GeneratedNarration;
    sceneAssets: GeneratedSceneAsset[];
    captionTrack: GeneratedCaptionTrack;
    composedVideo: Awaited<ReturnType<typeof ffmpegCompositionProvider.composeVideo>>;
  };
  stageRetryStates: {
    preparing: VideoFactoryRetryState;
    generating_narration: VideoFactoryRetryState;
    generating_visuals: VideoFactoryRetryState;
    generating_captions: VideoFactoryRetryState;
    composing: VideoFactoryRetryState;
  };
  stageExecutionMetrics: {
    preparing: { provider: string; durationMs: number; retryCount: number } | null;
    generating_narration: { provider: string; durationMs: number; retryCount: number } | null;
    generating_visuals: { provider: string; durationMs: number; retryCount: number } | null;
    generating_captions: { provider: string; durationMs: number; retryCount: number } | null;
    composing: { provider: string; durationMs: number; retryCount: number } | null;
  };
  selectionDecision: VideoFactorySelectionDecision;
}

export async function orchestrateCompiledVideoGeneration(input: {
  opportunity: ContentOpportunity;
  brief: VideoBrief;
  provider: RenderProvider;
  renderVersion: string;
  createdAt: string;
  historicalOpportunities?: ContentOpportunity[];
  persistedCompiledProductionPlan?: ReturnType<typeof compileVideoBriefForProduction> | null;
  resumeLifecycleStatus?: VideoFactoryStatus | null;
  onCompiledPlan?: (
    compiledProductionPlan: ReturnType<typeof compileVideoBriefForProduction>,
    selectionDecision: VideoFactorySelectionDecision,
  ) => Promise<void> | void;
  onExecutionStageChange?: (status: Extract<
    VideoFactoryStatus,
    | "preparing"
    | "generating_narration"
    | "generating_visuals"
    | "generating_captions"
    | "composing"
    | "generated"
  >) => Promise<void> | void;
  onStageFailure?: (input: {
    stage: Extract<
      VideoFactoryStatus,
      | "preparing"
      | "generating_narration"
      | "generating_visuals"
      | "generating_captions"
      | "composing"
    >;
    provider: string;
    durationMs: number;
    error: unknown;
  }) => Promise<void> | void;
  onRetryScheduled?: (input: {
    stage: Extract<
      VideoFactoryStatus,
      | "preparing"
      | "generating_narration"
      | "generating_visuals"
      | "generating_captions"
      | "composing"
    >;
    provider: string;
    retryState: VideoFactoryRetryState;
    error: unknown;
  }) => Promise<void> | void;
  onStageChange?: (status: Extract<
    VideoFactoryStatus,
    | "preparing"
    | "generating_narration"
    | "generating_visuals"
    | "generating_captions"
    | "composing"
    | "generated"
  >) => Promise<void> | void;
}): Promise<CompiledGenerationOrchestration> {
  const lifecycleOrder: VideoFactoryStatus[] = [
    "draft",
    "queued",
    "retry_queued",
    "preparing",
    "generating_narration",
    "generating_visuals",
    "generating_captions",
    "composing",
    "generated",
    "review_pending",
    "accepted",
    "rejected",
    "discarded",
    "failed",
    "failed_permanent",
  ];
  const lifecycleIndex = (status: VideoFactoryStatus | null | undefined) =>
    status ? lifecycleOrder.indexOf(status) : -1;
  const shouldPersistStage = (
    status: Extract<
      VideoFactoryStatus,
      | "preparing"
      | "generating_narration"
      | "generating_visuals"
      | "generating_captions"
      | "composing"
      | "generated"
    >,
  ) => lifecycleIndex(status) > lifecycleIndex(input.resumeLifecycleStatus ?? null);
  const updateStage = async (
    status: Extract<
      VideoFactoryStatus,
      | "preparing"
      | "generating_narration"
      | "generating_visuals"
      | "generating_captions"
      | "composing"
      | "generated"
    >,
  ) => {
    await input.onExecutionStageChange?.(status);
    if (shouldPersistStage(status)) {
      await input.onStageChange?.(status);
    }
  };

  const persistedCompiledPlan = input.persistedCompiledProductionPlan ?? null;
  let compiledProductionPlan: ReturnType<typeof compileVideoBriefForProduction>;
  let preparingRetryState: VideoFactoryRetryState;
  const stageExecutionMetrics: CompiledGenerationOrchestration["stageExecutionMetrics"] = {
    preparing: null,
    generating_narration: null,
    generating_visuals: null,
    generating_captions: null,
    composing: null,
  };
  const runStage = async <T>(inputStage: {
    stage: Extract<
      VideoFactoryStatus,
      | "preparing"
      | "generating_narration"
      | "generating_visuals"
      | "generating_captions"
      | "composing"
    >;
    provider: string;
    maxRetries?: number;
    baseDelayMs?: number;
    isRetryableFailure?: (error: unknown) => boolean;
    step: () => Promise<T> | T;
  }) => {
    await updateStage(inputStage.stage);
    const startedAt = Date.now();
    try {
      const result = await executeWithRetry({
        stage: inputStage.stage,
        maxRetries: inputStage.maxRetries,
        baseDelayMs: inputStage.baseDelayMs,
        isRetryableFailure: inputStage.isRetryableFailure,
        onRetryScheduled: async (retryInput) => {
          await input.onRetryScheduled?.({
            stage: inputStage.stage,
            provider: inputStage.provider,
            retryState: retryInput.retryState,
            error: retryInput.error,
          });
        },
        step: inputStage.step,
      });
      stageExecutionMetrics[inputStage.stage] = {
        provider: inputStage.provider,
        durationMs: Date.now() - startedAt,
        retryCount: result.retryState.retryCount,
      };
      return result;
    } catch (error) {
      await input.onStageFailure?.({
        stage: inputStage.stage,
        provider: inputStage.provider,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  };

  if (persistedCompiledPlan) {
    compiledProductionPlan = persistedCompiledPlan;
    preparingRetryState = {
      retryCount: 0,
      maxRetries: 0,
      backoffDelayMs: null,
      nextRetryAt: null,
      lastFailureAt: null,
      retryStage: "preparing",
      failureMode: "none",
      exhausted: false,
    };
  } else {
    const preparation = await runStage({
      stage: "preparing",
      provider: "prompt-compiler",
      isRetryableFailure: () => false,
      step: async () =>
        compileVideoBriefForProduction({
          opportunity: input.opportunity,
          brief: input.brief,
        }),
    });
    compiledProductionPlan = preparation.value;
    preparingRetryState = preparation.retryState;
  }

  const selectionDecision = buildVideoFactorySelectionDecision({
    compiledProductionPlan,
    briefFormat: input.brief.format,
    briefDurationSec: input.brief.durationSec,
    historicalOpportunities: persistedCompiledPlan
      ? []
      : input.historicalOpportunities ?? [],
    appliedAt: input.createdAt,
    growthIntelligence: input.opportunity.growthIntelligence ?? null,
  });
  const selectedCompiledProductionPlan = applyVideoFactorySelectionDecision({
    compiledProductionPlan,
    decision: selectionDecision,
  });
  const narrationRetryPolicy = retryPolicyForStage(selectionDecision, "narration");
  const visualsRetryPolicy = retryPolicyForStage(selectionDecision, "visuals");
  const captionsRetryPolicy = retryPolicyForStage(selectionDecision, "captions");
  const compositionRetryPolicy = retryPolicyForStage(selectionDecision, "composition");
  await input.onCompiledPlan?.(selectedCompiledProductionPlan, selectionDecision);
  const narrationProviderId = resolveNarrationProviderId(
    selectedCompiledProductionPlan.defaultsSnapshot.providerFallbacks.narration[0] ??
      null,
  );
  const narrationProvider = getNarrationProvider(narrationProviderId);
  const visualProvider = getVisualProvider(
    selectedCompiledProductionPlan.defaultsSnapshot.providerFallbacks.visuals[0] ?? null,
  );
  const captionProviderId = resolveCaptionProviderId(
    selectedCompiledProductionPlan.defaultsSnapshot.providerFallbacks.captions[0] ??
      null,
  );
  const captionProvider = getCaptionProvider(captionProviderId);
  const { value: narration, retryState: narrationRetryState } = await runStage({
    stage: "generating_narration",
    provider: narrationProviderId,
    maxRetries: narrationRetryPolicy?.maxRetries,
    baseDelayMs: narrationRetryPolicy?.baseDelayMs,
    step: async () =>
      narrationProvider.generateNarration({
        narrationSpec: selectedCompiledProductionPlan.narrationSpec,
        voiceId: selectedCompiledProductionPlan.defaultsSnapshot.voiceId,
        voiceSettings: selectedCompiledProductionPlan.defaultsSnapshot.voiceSettings,
        modelId: selectedCompiledProductionPlan.defaultsSnapshot.modelFamily ?? undefined,
        createdAt: input.createdAt,
      }),
  });
  const { value: sceneAssets, retryState: visualsRetryState } = await runStage({
    stage: "generating_visuals",
    provider: visualProvider.id,
    maxRetries: visualsRetryPolicy?.maxRetries,
    baseDelayMs: visualsRetryPolicy?.baseDelayMs,
    step: async () =>
      Promise.all(
        selectedCompiledProductionPlan.scenePrompts.map((scenePrompt) =>
          visualProvider.generateScene({
            scenePrompt,
            aspectRatio: selectedCompiledProductionPlan.defaultsSnapshot.aspectRatio,
            referenceImageUrl:
              selectedCompiledProductionPlan.defaultsSnapshot.referenceImageUrl ?? null,
            createdAt: input.createdAt,
          }),
        ),
      ),
  });
  const { value: captionTrack, retryState: captionsRetryState } = await runStage({
    stage: "generating_captions",
    provider: captionProviderId,
    maxRetries: captionsRetryPolicy?.maxRetries,
    baseDelayMs: captionsRetryPolicy?.baseDelayMs,
    step: async () =>
      captionProvider.generateCaptionTrack({
        captionSpec: selectedCompiledProductionPlan.captionSpec,
        narration,
        createdAt: input.createdAt,
      }),
  });
  const { value: composedVideo, retryState: composingRetryState } = await runStage({
    stage: "composing",
    provider: ffmpegCompositionProvider.provider,
    maxRetries: compositionRetryPolicy?.maxRetries,
    baseDelayMs: compositionRetryPolicy?.baseDelayMs,
    step: async () =>
      ffmpegCompositionProvider.composeVideo({
        compositionSpec: selectedCompiledProductionPlan.compositionSpec,
        narration,
        sceneAssets,
        captionTrack,
        createdAt: input.createdAt,
      }),
  });
  await updateStage("generated");

  const resolvedRenderProvider: RenderProvider = sceneAssets.every((asset) =>
    asset.assetUrl.startsWith("mock://"),
  )
    ? "mock"
    : sceneAssets.some((asset) => asset.provider === "runway-gen4")
      ? "runway"
      : "custom";

  return {
    compiledProductionPlan: selectedCompiledProductionPlan,
    narrationSpec: selectedCompiledProductionPlan.narrationSpec,
    renderJobInput: {
      provider: resolvedRenderProvider,
      renderVersion: input.renderVersion,
      compiledProductionPlan: selectedCompiledProductionPlan,
      productionDefaultsSnapshot: selectedCompiledProductionPlan.defaultsSnapshot,
      providerJobId: composedVideo.id,
      submittedAt: input.createdAt,
      completedAt: input.createdAt,
    },
    renderedAssetInput: {
      url: composedVideo.videoUrl,
      thumbnailUrl: composedVideo.thumbnailUrl ?? null,
      durationSec: composedVideo.durationSec ?? input.brief.durationSec,
      createdAt: composedVideo.createdAt,
    },
    providerResults: {
      narration,
      sceneAssets,
      captionTrack,
      composedVideo,
    },
    stageRetryStates: {
      preparing: preparingRetryState,
      generating_narration: narrationRetryState,
      generating_visuals: visualsRetryState,
      generating_captions: captionsRetryState,
      composing: composingRetryState,
    },
    stageExecutionMetrics,
    selectionDecision,
  };
}
