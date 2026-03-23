import type { ContentOpportunity } from "@/lib/content-opportunities";
import {
  createMockRenderedAsset,
} from "@/lib/rendered-assets";
import type { RenderProvider } from "@/lib/render-jobs";
import { compileVideoBriefForProduction } from "@/lib/prompt-compiler";
import { assemblyAiCaptionProvider } from "@/lib/providers/caption-provider";
import { ffmpegCompositionProvider } from "@/lib/providers/composition-provider";
import { elevenLabsNarrationProvider } from "@/lib/providers/narration-provider";
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
    narration: Awaited<ReturnType<typeof elevenLabsNarrationProvider.generateNarration>>;
    sceneAssets: GeneratedSceneAsset[];
    captionTrack: Awaited<ReturnType<typeof assemblyAiCaptionProvider.generateCaptionTrack>>;
    composedVideo: Awaited<ReturnType<typeof ffmpegCompositionProvider.composeVideo>>;
  };
  stageRetryStates: {
    preparing: VideoFactoryRetryState;
    generating_narration: VideoFactoryRetryState;
    generating_visuals: VideoFactoryRetryState;
    generating_captions: VideoFactoryRetryState;
    composing: VideoFactoryRetryState;
  };
}

export async function orchestrateCompiledVideoGeneration(input: {
  opportunity: ContentOpportunity;
  brief: VideoBrief;
  provider: RenderProvider;
  renderVersion: string;
  createdAt: string;
  onCompiledPlan?: (
    compiledProductionPlan: ReturnType<typeof compileVideoBriefForProduction>,
  ) => Promise<void> | void;
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
  await input.onStageChange?.("preparing");
  const { value: compiledProductionPlan, retryState: preparingRetryState } =
    await executeWithRetry({
      stage: "preparing",
      step: async () =>
        compileVideoBriefForProduction({
          opportunity: input.opportunity,
          brief: input.brief,
        }),
      isRetryableFailure: () => false,
    });
  await input.onCompiledPlan?.(compiledProductionPlan);
  const visualProvider = getVisualProvider(
    compiledProductionPlan.defaultsSnapshot.providerFallbacks.visuals[0] ?? null,
  );
  await input.onStageChange?.("generating_narration");
  const { value: narration, retryState: narrationRetryState } = await executeWithRetry({
    stage: "generating_narration",
    step: async () =>
      elevenLabsNarrationProvider.generateNarration({
        narrationSpec: compiledProductionPlan.narrationSpec,
        voiceId: compiledProductionPlan.defaultsSnapshot.voiceId,
        voiceSettings: compiledProductionPlan.defaultsSnapshot.voiceSettings,
        createdAt: input.createdAt,
      }),
  });
  await input.onStageChange?.("generating_visuals");
  const { value: sceneAssets, retryState: visualsRetryState } = await executeWithRetry({
    stage: "generating_visuals",
    step: async () =>
      Promise.all(
        compiledProductionPlan.scenePrompts.map((scenePrompt) =>
          visualProvider.generateScene({
            scenePrompt,
            aspectRatio: compiledProductionPlan.defaultsSnapshot.aspectRatio,
            createdAt: input.createdAt,
          }),
        ),
      ),
  });
  await input.onStageChange?.("generating_captions");
  const { value: captionTrack, retryState: captionsRetryState } = await executeWithRetry({
    stage: "generating_captions",
    step: async () =>
      assemblyAiCaptionProvider.generateCaptionTrack({
        captionSpec: compiledProductionPlan.captionSpec,
        narration,
        createdAt: input.createdAt,
      }),
  });
  await input.onStageChange?.("composing");
  const { value: composedVideo, retryState: composingRetryState } = await executeWithRetry({
    stage: "composing",
    step: async () =>
      ffmpegCompositionProvider.composeVideo({
        compositionSpec: compiledProductionPlan.compositionSpec,
        narration,
        sceneAssets,
        captionTrack,
        createdAt: input.createdAt,
      }),
  });
  await input.onStageChange?.("generated");

  const resolvedRenderProvider: RenderProvider = sceneAssets.some(
    (asset) => asset.provider === "runway-gen4" && !asset.assetUrl.startsWith("mock://"),
  )
    ? "runway"
    : "mock";

  return {
    compiledProductionPlan,
    narrationSpec: compiledProductionPlan.narrationSpec,
    renderJobInput: {
      provider: resolvedRenderProvider,
      renderVersion: input.renderVersion,
      compiledProductionPlan,
      productionDefaultsSnapshot: compiledProductionPlan.defaultsSnapshot,
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
  };
}
