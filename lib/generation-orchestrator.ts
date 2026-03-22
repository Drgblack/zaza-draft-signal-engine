import type { ContentOpportunity } from "@/lib/content-opportunities";
import {
  createMockRenderedAsset,
} from "@/lib/rendered-assets";
import type { RenderProvider } from "@/lib/render-jobs";
import { compileVideoBriefForProduction } from "@/lib/prompt-compiler";
import { assemblyAiCaptionProvider } from "@/lib/providers/caption-provider";
import { ffmpegCompositionProvider } from "@/lib/providers/composition-provider";
import { elevenLabsNarrationProvider } from "@/lib/providers/narration-provider";
import { runwayVisualProvider } from "@/lib/providers/visual-provider";
import type { VideoBrief } from "@/lib/video-briefs";

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
    sceneAssets: Array<ReturnType<typeof runwayVisualProvider.generateSceneAsset>>;
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
}): CompiledGenerationOrchestration {
  if (input.provider !== "mock") {
    throw new Error(`Render provider "${input.provider}" is not available yet.`);
  }

  const compiledProductionPlan = compileVideoBriefForProduction({
    opportunity: input.opportunity,
    brief: input.brief,
  });
  const narration = elevenLabsNarrationProvider.generateNarration({
    narrationSpec: compiledProductionPlan.narrationSpec,
    createdAt: input.createdAt,
  });
  const sceneAssets = compiledProductionPlan.scenePrompts.map((scenePrompt) =>
    runwayVisualProvider.generateSceneAsset({
      scenePrompt,
      createdAt: input.createdAt,
    }),
  );
  const captionTrack = assemblyAiCaptionProvider.generateCaptionTrack({
    captionSpec: compiledProductionPlan.captionSpec,
    narration,
    createdAt: input.createdAt,
  });
  const composedVideo = ffmpegCompositionProvider.composeVideo({
    compositionSpec: compiledProductionPlan.compositionSpec,
    narration,
    sceneAssets,
    captionTrack,
    createdAt: input.createdAt,
  });

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
