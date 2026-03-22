import { z } from "zod";

import type { CompiledProductionPlan } from "@/lib/prompt-compiler";
import type { ComposedVideoResult } from "@/lib/providers/composition-provider";
import type { GeneratedCaptionTrack } from "@/lib/providers/caption-provider";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";
import type { GeneratedSceneAsset } from "@/lib/providers/visual-provider";
import type { VideoFactoryStatus } from "@/lib/video-factory-state";

export const VIDEO_FACTORY_QUALITY_CHECK_STAGES = [
  "compiled_plan",
  "narration",
  "visuals",
  "captions",
  "composition",
] as const;

export type VideoFactoryQualityCheckStage =
  (typeof VIDEO_FACTORY_QUALITY_CHECK_STAGES)[number];

export const qualityCheckFailureSchema = z.object({
  stage: z.enum(VIDEO_FACTORY_QUALITY_CHECK_STAGES),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
});

export const qualityCheckResultSchema = z.object({
  passed: z.boolean(),
  hasAudio: z.boolean(),
  durationSeconds: z.number().min(0),
  expectedDuration: z.number().min(0),
  durationInRange: z.boolean(),
  captionsPresent: z.boolean(),
  sceneCount: z.number().int().min(0),
  failures: z.array(qualityCheckFailureSchema).default([]),
  checkedAt: z.string().trim().min(1),
});

export type QualityCheckFailure = z.infer<typeof qualityCheckFailureSchema>;
export type QualityCheckResult = z.infer<typeof qualityCheckResultSchema>;

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function addFailure(
  failures: QualityCheckFailure[],
  stage: VideoFactoryQualityCheckStage,
  code: string,
  message: string,
) {
  failures.push(
    qualityCheckFailureSchema.parse({
      stage,
      code,
      message,
    }),
  );
}

export function lifecycleStatusForQualityFailure(
  stage: VideoFactoryQualityCheckStage,
): VideoFactoryStatus {
  switch (stage) {
    case "compiled_plan":
      return "preparing";
    case "narration":
      return "generating_narration";
    case "visuals":
      return "generating_visuals";
    case "captions":
      return "generating_captions";
    case "composition":
      return "composing";
  }
}

export function summarizeQualityCheckFailures(result: QualityCheckResult): string {
  if (result.failures.length === 0) {
    return "Quality check passed.";
  }

  return result.failures.map((failure) => failure.message).join(" ");
}

export function runVideoFactoryQualityChecks(input: {
  compiledProductionPlan: CompiledProductionPlan;
  providerResults: {
    narration: GeneratedNarration;
    sceneAssets: GeneratedSceneAsset[];
    captionTrack: GeneratedCaptionTrack;
    composedVideo: ComposedVideoResult;
  };
  checkedAt: string;
}): QualityCheckResult {
  const failures: QualityCheckFailure[] = [];
  const { compiledProductionPlan, providerResults } = input;
  const expectedDuration = compiledProductionPlan.narrationSpec.targetDurationSec;
  const durationSeconds =
    providerResults.composedVideo.durationSec ??
    providerResults.narration.durationSec ??
    0;
  const hasAudio =
    hasText(providerResults.narration.audioUrl) &&
    (providerResults.narration.durationSec ?? 0) > 0;
  const captionsPresent =
    hasText(providerResults.captionTrack.transcriptText) ||
    hasText(providerResults.captionTrack.captionUrl);
  const sceneCount = providerResults.sceneAssets.length;
  const durationInRange =
    expectedDuration <= 0
      ? false
      : durationSeconds >= expectedDuration * 0.8 &&
        durationSeconds <= expectedDuration * 1.2;

  if (!hasText(compiledProductionPlan.narrationSpec.script)) {
    addFailure(
      failures,
      "compiled_plan",
      "compiled_plan_missing_script",
      "Compiled plan is missing narration script.",
    );
  }

  if (compiledProductionPlan.scenePrompts.length === 0) {
    addFailure(
      failures,
      "compiled_plan",
      "compiled_plan_missing_scenes",
      "Compiled plan is missing scene prompts.",
    );
  }

  if (!hasText(compiledProductionPlan.captionSpec.sourceText)) {
    addFailure(
      failures,
      "compiled_plan",
      "compiled_plan_missing_caption_source",
      "Compiled plan is missing caption source text.",
    );
  }

  const expectedSceneIds = compiledProductionPlan.scenePrompts.map((scene) => scene.id);
  const orderedSceneIds = compiledProductionPlan.compositionSpec.sceneOrder;
  if (
    orderedSceneIds.length !== expectedSceneIds.length ||
    orderedSceneIds.some((sceneId) => !expectedSceneIds.includes(sceneId))
  ) {
    addFailure(
      failures,
      "compiled_plan",
      "compiled_plan_scene_order_mismatch",
      "Composition scene order does not match the compiled scene prompts.",
    );
  }

  if (!hasText(providerResults.narration.audioUrl)) {
    addFailure(
      failures,
      "narration",
      "narration_missing_audio",
      "Narration output is missing an audio reference.",
    );
  }

  if ((providerResults.narration.durationSec ?? 0) <= 0) {
    addFailure(
      failures,
      "narration",
      "narration_missing_duration",
      "Narration output is missing a duration.",
    );
  }

  if (!durationInRange) {
    addFailure(
      failures,
      "narration",
      "narration_duration_out_of_range",
      `Rendered duration ${durationSeconds}s is outside the expected range for ${expectedDuration}s.`,
    );
  }

  if (providerResults.sceneAssets.length !== compiledProductionPlan.scenePrompts.length) {
    addFailure(
      failures,
      "visuals",
      "scene_asset_count_mismatch",
      "Scene asset count does not match the compiled plan.",
    );
  }

  for (const scenePrompt of compiledProductionPlan.scenePrompts) {
    const matchingAsset = providerResults.sceneAssets.find(
      (asset) => asset.scenePromptId === scenePrompt.id,
    );

    if (!matchingAsset) {
      addFailure(
        failures,
        "visuals",
        "scene_asset_missing",
        `Scene asset is missing for prompt ${scenePrompt.id}.`,
      );
      continue;
    }

    if (!hasText(matchingAsset.assetUrl)) {
      addFailure(
        failures,
        "visuals",
        "scene_asset_missing_url",
        `Scene asset ${matchingAsset.id} is missing an asset URL.`,
      );
    }
  }

  if (!captionsPresent) {
    addFailure(
      failures,
      "captions",
      "captions_missing_transcript",
      "Caption output is missing transcript content.",
    );
  }

  if (providerResults.captionTrack.sourceNarrationId !== providerResults.narration.id) {
    addFailure(
      failures,
      "captions",
      "captions_source_mismatch",
      "Caption output does not point to the generated narration.",
    );
  }

  if (!hasText(providerResults.composedVideo.videoUrl)) {
    addFailure(
      failures,
      "composition",
      "composition_missing_video",
      "Composition output is missing a video reference.",
    );
  }

  if ((providerResults.composedVideo.durationSec ?? 0) <= 0) {
    addFailure(
      failures,
      "composition",
      "composition_missing_duration",
      "Composition output is missing a duration.",
    );
  }

  return qualityCheckResultSchema.parse({
    passed: failures.length === 0,
    hasAudio,
    durationSeconds,
    expectedDuration,
    durationInRange,
    captionsPresent,
    sceneCount,
    failures,
    checkedAt: input.checkedAt,
  });
}
