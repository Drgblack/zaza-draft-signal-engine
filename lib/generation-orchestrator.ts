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
    narration: ReturnType<typeof elevenLabsNarrationProvider.generateNarration>;
    sceneAssets: GeneratedSceneAsset[];
    captionTrack: ReturnType<typeof assemblyAiCaptionProvider.generateCaptionTrack>;
    composedVideo: ReturnType<typeof ffmpegCompositionProvider.composeVideo>;
  };
}

export function orchestrateCompiledVideoGeneration(input: {
  opportunity: ContentOpportunity;
  brief: VideoBrief;
  provider: RenderProvider;
  renderVersion: string;
  createdAt: string;
  onStageChange?: (status: Extract<
    VideoFactoryStatus,
    | "preparing"
    | "generating_narration"
    | "generating_visuals"
    | "generating_captions"
    | "composing"
    | "generated"
  >) => void;
}): CompiledGenerationOrchestration {
  if (input.provider !== "mock") {
    throw new Error(`Render provider "${input.provider}" is not available yet.`);
  }

  input.onStageChange?.("preparing");
  const compiledProductionPlan = compileVideoBriefForProduction({
    opportunity: input.opportunity,
    brief: input.brief,
  });
  const visualProvider = getVisualProvider(
    compiledProductionPlan.defaultsSnapshot.providerFallbacks.visuals[0] ?? null,
  );
  input.onStageChange?.("generating_narration");
  const narration = elevenLabsNarrationProvider.generateNarration({
    narrationSpec: compiledProductionPlan.narrationSpec,
    createdAt: input.createdAt,
  });
  input.onStageChange?.("generating_visuals");
  const sceneAssets = compiledProductionPlan.scenePrompts.map((scenePrompt) =>
    visualProvider.generateScene({
      scenePrompt,
      createdAt: input.createdAt,
    }),
  );
  input.onStageChange?.("generating_captions");
  const captionTrack = assemblyAiCaptionProvider.generateCaptionTrack({
    captionSpec: compiledProductionPlan.captionSpec,
    narration,
    createdAt: input.createdAt,
  });
  input.onStageChange?.("composing");
  const composedVideo = ffmpegCompositionProvider.composeVideo({
    compositionSpec: compiledProductionPlan.compositionSpec,
    narration,
    sceneAssets,
    captionTrack,
    createdAt: input.createdAt,
  });
  input.onStageChange?.("generated");

  return {
    compiledProductionPlan,
    narrationSpec: compiledProductionPlan.narrationSpec,
    renderJobInput: {
      provider: input.provider,
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
  };
}
