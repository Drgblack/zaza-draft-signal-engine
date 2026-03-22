import { z } from "zod";

import type { ComposedVideoResult } from "@/lib/providers/composition-provider";
import type { GeneratedCaptionTrack } from "@/lib/providers/caption-provider";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";
import type { GeneratedSceneAsset } from "@/lib/providers/visual-provider";
import {
  costEstimateSchema,
  type CostEstimate,
} from "./video-factory-cost";

export const VIDEO_FACTORY_EXECUTION_STAGES = [
  "narration",
  "visuals",
  "captions",
  "composition",
] as const;

export const VIDEO_FACTORY_EXECUTION_STATUSES = [
  "completed",
  "failed",
] as const;

export const providerExecutionRecordSchema = z.object({
  executionId: z.string().trim().min(1),
  stage: z.enum(VIDEO_FACTORY_EXECUTION_STAGES),
  providerId: z.string().trim().min(1),
  status: z.enum(VIDEO_FACTORY_EXECUTION_STATUSES),
  providerJobId: z.string().trim().nullable().default(null),
  inputIds: z.array(z.string().trim().min(1)).default([]),
  outputArtifactIds: z.array(z.string().trim().min(1)).default([]),
  startedAt: z.string().trim().min(1),
  completedAt: z.string().trim().nullable().default(null),
  errorMessage: z.string().trim().nullable().default(null),
});

export const generatedNarrationArtifactSchema = z.object({
  artifactId: z.string().trim().min(1),
  artifactType: z.literal("narration_audio"),
  executionId: z.string().trim().min(1),
  renderJobId: z.string().trim().min(1),
  renderVersion: z.string().trim().nullable().default(null),
  narrationSpecId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  audioUrl: z.string().trim().min(1),
  durationSec: z.number().int().positive().nullable().default(null),
  createdAt: z.string().trim().min(1),
});

export const generatedSceneAssetArtifactSchema = z.object({
  artifactId: z.string().trim().min(1),
  artifactType: z.literal("scene_video"),
  executionId: z.string().trim().min(1),
  renderJobId: z.string().trim().min(1),
  renderVersion: z.string().trim().nullable().default(null),
  scenePromptId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  assetUrl: z.string().trim().min(1),
  order: z.number().int().positive(),
  createdAt: z.string().trim().min(1),
});

export const generatedCaptionTrackArtifactSchema = z.object({
  artifactId: z.string().trim().min(1),
  artifactType: z.literal("caption_track"),
  executionId: z.string().trim().min(1),
  renderJobId: z.string().trim().min(1),
  renderVersion: z.string().trim().nullable().default(null),
  captionSpecId: z.string().trim().min(1),
  sourceNarrationId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  transcriptText: z.string().trim().min(1),
  captionUrl: z.string().trim().nullable().default(null),
  createdAt: z.string().trim().min(1),
});

export const composedVideoArtifactSchema = z.object({
  artifactId: z.string().trim().min(1),
  artifactType: z.literal("composed_video"),
  executionId: z.string().trim().min(1),
  renderJobId: z.string().trim().min(1),
  renderVersion: z.string().trim().nullable().default(null),
  compositionSpecId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  videoUrl: z.string().trim().min(1),
  thumbnailUrl: z.string().trim().nullable().default(null),
  durationSec: z.number().int().positive().nullable().default(null),
  createdAt: z.string().trim().min(1),
});

export const videoFactoryAttemptLineageSchema = z.object({
  attemptId: z.string().trim().min(1),
  factoryJobId: z.string().trim().nullable().default(null),
  renderVersion: z.string().trim().nullable().default(null),
  generationRequestId: z.string().trim().nullable().default(null),
  renderJobId: z.string().trim().nullable().default(null),
  renderedAssetId: z.string().trim().nullable().default(null),
  costEstimate: costEstimateSchema,
  providerExecutions: z.array(providerExecutionRecordSchema).default([]),
  narrationArtifact: generatedNarrationArtifactSchema.nullable().default(null),
  sceneArtifacts: z.array(generatedSceneAssetArtifactSchema).default([]),
  captionArtifact: generatedCaptionTrackArtifactSchema.nullable().default(null),
  composedVideoArtifact: composedVideoArtifactSchema.nullable().default(null),
  createdAt: z.string().trim().min(1),
});

export type ProviderExecutionRecord = z.infer<typeof providerExecutionRecordSchema>;
export type GeneratedNarrationArtifact = z.infer<typeof generatedNarrationArtifactSchema>;
export type GeneratedSceneAssetArtifact = z.infer<typeof generatedSceneAssetArtifactSchema>;
export type GeneratedCaptionTrackArtifact = z.infer<typeof generatedCaptionTrackArtifactSchema>;
export type ComposedVideoArtifact = z.infer<typeof composedVideoArtifactSchema>;
export type VideoFactoryAttemptLineage = z.infer<typeof videoFactoryAttemptLineageSchema>;

function executionId(
  renderJobId: string,
  stage: z.infer<typeof providerExecutionRecordSchema>["stage"],
  providerId: string,
  suffix?: string,
) {
  return [renderJobId, "provider-execution", stage, providerId, suffix]
    .filter((part): part is string => Boolean(part))
    .join(":");
}

function artifactId(
  renderJobId: string,
  artifactType: string,
  suffix?: string,
) {
  return [renderJobId, "artifact", artifactType, suffix]
    .filter((part): part is string => Boolean(part))
    .join(":");
}

function buildNarrationArtifacts(input: {
  renderJobId: string;
  renderVersion?: string | null;
  narrationSpecId: string;
  narration: GeneratedNarration;
}) {
  const providerExecutionId = executionId(
    input.renderJobId,
    "narration",
    input.narration.provider,
  );
  const narrationArtifactId = artifactId(input.renderJobId, "narration-audio");

  const providerExecution = providerExecutionRecordSchema.parse({
    executionId: providerExecutionId,
    stage: "narration",
    providerId: input.narration.provider,
    status: "completed",
    providerJobId: input.narration.id,
    inputIds: [input.narrationSpecId],
    outputArtifactIds: [narrationArtifactId],
    startedAt: input.narration.createdAt,
    completedAt: input.narration.createdAt,
    errorMessage: null,
  });

  const artifact = generatedNarrationArtifactSchema.parse({
    artifactId: narrationArtifactId,
    artifactType: "narration_audio",
    executionId: providerExecution.executionId,
    renderJobId: input.renderJobId,
    renderVersion: input.renderVersion ?? null,
    narrationSpecId: input.narrationSpecId,
    providerId: input.narration.provider,
    audioUrl: input.narration.audioUrl,
    durationSec: input.narration.durationSec ?? null,
    createdAt: input.narration.createdAt,
  });

  return { providerExecution, artifact };
}

function buildSceneArtifacts(input: {
  renderJobId: string;
  renderVersion?: string | null;
  sceneAssets: GeneratedSceneAsset[];
}) {
  return input.sceneAssets.map((sceneAsset, index) => {
    const providerExecutionId = executionId(
      input.renderJobId,
      "visuals",
      sceneAsset.provider,
      sceneAsset.scenePromptId,
    );
    const sceneArtifactId = artifactId(
      input.renderJobId,
      "scene-video",
      sceneAsset.scenePromptId,
    );

    return {
      providerExecution: providerExecutionRecordSchema.parse({
        executionId: providerExecutionId,
        stage: "visuals",
        providerId: sceneAsset.provider,
        status: "completed",
        providerJobId: sceneAsset.id,
        inputIds: [sceneAsset.scenePromptId],
        outputArtifactIds: [sceneArtifactId],
        startedAt: sceneAsset.createdAt,
        completedAt: sceneAsset.createdAt,
        errorMessage: null,
      }),
      artifact: generatedSceneAssetArtifactSchema.parse({
        artifactId: sceneArtifactId,
        artifactType: "scene_video",
        executionId: providerExecutionId,
        renderJobId: input.renderJobId,
        renderVersion: input.renderVersion ?? null,
        scenePromptId: sceneAsset.scenePromptId,
        providerId: sceneAsset.provider,
        assetUrl: sceneAsset.assetUrl,
        order: index + 1,
        createdAt: sceneAsset.createdAt,
      }),
    };
  });
}

function buildCaptionArtifacts(input: {
  renderJobId: string;
  renderVersion?: string | null;
  captionSpecId: string;
  captionTrack: GeneratedCaptionTrack;
}) {
  const providerExecutionId = executionId(
    input.renderJobId,
    "captions",
    input.captionTrack.provider,
  );
  const captionArtifactId = artifactId(input.renderJobId, "caption-track");

  const providerExecution = providerExecutionRecordSchema.parse({
    executionId: providerExecutionId,
    stage: "captions",
    providerId: input.captionTrack.provider,
    status: "completed",
    providerJobId: input.captionTrack.id,
    inputIds: [input.captionTrack.sourceNarrationId, input.captionSpecId],
    outputArtifactIds: [captionArtifactId],
    startedAt: input.captionTrack.createdAt,
    completedAt: input.captionTrack.createdAt,
    errorMessage: null,
  });

  const artifact = generatedCaptionTrackArtifactSchema.parse({
    artifactId: captionArtifactId,
    artifactType: "caption_track",
    executionId: providerExecution.executionId,
    renderJobId: input.renderJobId,
    renderVersion: input.renderVersion ?? null,
    captionSpecId: input.captionSpecId,
    sourceNarrationId: input.captionTrack.sourceNarrationId,
    providerId: input.captionTrack.provider,
    transcriptText: input.captionTrack.transcriptText,
    captionUrl: input.captionTrack.captionUrl ?? null,
    createdAt: input.captionTrack.createdAt,
  });

  return { providerExecution, artifact };
}

function buildComposedVideoArtifacts(input: {
  renderJobId: string;
  renderVersion?: string | null;
  compositionSpecId: string;
  composedVideo: ComposedVideoResult;
}) {
  const providerExecutionId = executionId(
    input.renderJobId,
    "composition",
    input.composedVideo.provider,
  );
  const composedVideoArtifactId = artifactId(input.renderJobId, "composed-video");

  const providerExecution = providerExecutionRecordSchema.parse({
    executionId: providerExecutionId,
    stage: "composition",
    providerId: input.composedVideo.provider,
    status: "completed",
    providerJobId: input.composedVideo.id,
    inputIds: [input.compositionSpecId],
    outputArtifactIds: [composedVideoArtifactId],
    startedAt: input.composedVideo.createdAt,
    completedAt: input.composedVideo.createdAt,
    errorMessage: null,
  });

  const artifact = composedVideoArtifactSchema.parse({
    artifactId: composedVideoArtifactId,
    artifactType: "composed_video",
    executionId: providerExecution.executionId,
    renderJobId: input.renderJobId,
    renderVersion: input.renderVersion ?? null,
    compositionSpecId: input.compositionSpecId,
    providerId: input.composedVideo.provider,
    videoUrl: input.composedVideo.videoUrl,
    thumbnailUrl: input.composedVideo.thumbnailUrl ?? null,
    durationSec: input.composedVideo.durationSec ?? null,
    createdAt: input.composedVideo.createdAt,
  });

  return { providerExecution, artifact };
}

export function buildVideoFactoryAttemptLineage(input: {
  factoryJobId?: string | null;
  renderVersion?: string | null;
  generationRequestId: string;
  renderJobId: string;
  renderedAssetId: string;
  costEstimate: CostEstimate;
  createdAt: string;
  narrationSpecId: string;
  captionSpecId: string;
  compositionSpecId: string;
  providerResults: {
    narration: GeneratedNarration;
    sceneAssets: GeneratedSceneAsset[];
    captionTrack: GeneratedCaptionTrack;
    composedVideo: ComposedVideoResult;
  };
}): VideoFactoryAttemptLineage {
  const narration = buildNarrationArtifacts({
    renderJobId: input.renderJobId,
    renderVersion: input.renderVersion,
    narrationSpecId: input.narrationSpecId,
    narration: input.providerResults.narration,
  });
  const scenes = buildSceneArtifacts({
    renderJobId: input.renderJobId,
    renderVersion: input.renderVersion,
    sceneAssets: input.providerResults.sceneAssets,
  });
  const captions = buildCaptionArtifacts({
    renderJobId: input.renderJobId,
    renderVersion: input.renderVersion,
    captionSpecId: input.captionSpecId,
    captionTrack: input.providerResults.captionTrack,
  });
  const composition = buildComposedVideoArtifacts({
    renderJobId: input.renderJobId,
    renderVersion: input.renderVersion,
    compositionSpecId: input.compositionSpecId,
    composedVideo: input.providerResults.composedVideo,
  });

  return videoFactoryAttemptLineageSchema.parse({
    attemptId: `${input.renderJobId}:attempt-lineage`,
    factoryJobId: input.factoryJobId ?? null,
    renderVersion: input.renderVersion ?? null,
    generationRequestId: input.generationRequestId,
    renderJobId: input.renderJobId,
    renderedAssetId: input.renderedAssetId,
    costEstimate: input.costEstimate,
    providerExecutions: [
      narration.providerExecution,
      ...scenes.map((scene) => scene.providerExecution),
      captions.providerExecution,
      composition.providerExecution,
    ],
    narrationArtifact: narration.artifact,
    sceneArtifacts: scenes.map((scene) => scene.artifact),
    captionArtifact: captions.artifact,
    composedVideoArtifact: composition.artifact,
    createdAt: input.createdAt,
  });
}

export function appendVideoFactoryAttemptLineage(
  existing: VideoFactoryAttemptLineage[],
  next: VideoFactoryAttemptLineage,
): VideoFactoryAttemptLineage[] {
  const deduped = new Map<string, VideoFactoryAttemptLineage>();

  for (const attempt of [...existing, next]) {
    deduped.set(
      attempt.attemptId,
      videoFactoryAttemptLineageSchema.parse(attempt),
    );
  }

  return Array.from(deduped.values()).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}
