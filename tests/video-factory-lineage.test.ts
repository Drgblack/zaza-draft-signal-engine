import assert from "node:assert/strict";
import test from "node:test";

import {
  appendVideoFactoryAttemptLineage,
  buildVideoFactoryAttemptLineage,
} from "../lib/video-factory-lineage";

const baseQualityCheck = {
  passed: true,
  hasAudio: true,
  durationSeconds: 45,
  expectedDuration: 45,
  durationInRange: true,
  captionsPresent: true,
  sceneCount: 2,
  failures: [],
  checkedAt: "2026-03-22T10:00:00.000Z",
};

test("video factory attempt lineage records provider executions and artifacts", () => {
  const attempt = buildVideoFactoryAttemptLineage({
    factoryJobId: "factory-job-1",
    renderVersion: "phase-c-render-v1",
    generationRequestId: "generation-request-1",
    renderJobId: "render-job-1",
    renderedAssetId: "rendered-asset-1",
    costEstimate: {
      estimatedTotalUsd: 0.912,
      narrationCostUsd: 0.018,
      visualsCostUsd: 0.864,
      transcriptionCostUsd: 0.03,
      compositionCostUsd: 0,
      providerId: "runway-gen4",
      mode: "quality",
      estimatedAt: "2026-03-22T10:00:00.000Z",
    },
    qualityCheck: baseQualityCheck,
    createdAt: "2026-03-22T10:00:00.000Z",
    narrationSpecId: "narration-spec-1",
    captionSpecId: "caption-spec-1",
    compositionSpecId: "composition-spec-1",
    providerResults: {
      narration: {
        id: "generated-narration-1",
        provider: "elevenlabs",
        audioUrl: "mock://elevenlabs/narration/generated-narration-1.mp3",
        durationSec: 45,
        createdAt: "2026-03-22T10:00:00.000Z",
      },
      sceneAssets: [
        {
          id: "scene-asset-1",
          provider: "runway-gen4",
          scenePromptId: "scene-prompt-1",
          assetUrl: "mock://runway-gen4/scene-assets/scene-asset-1.mp4",
          createdAt: "2026-03-22T10:00:00.000Z",
        },
        {
          id: "scene-asset-2",
          provider: "kling-2",
          scenePromptId: "scene-prompt-2",
          assetUrl: "mock://kling-2/scene-assets/scene-asset-2.mp4",
          createdAt: "2026-03-22T10:00:00.000Z",
        },
      ],
      captionTrack: {
        id: "caption-track-1",
        provider: "assemblyai",
        sourceNarrationId: "generated-narration-1",
        transcriptText: "A transcript for the mock caption track.",
        captionUrl: "mock://assemblyai/captions/caption-track-1.vtt",
        createdAt: "2026-03-22T10:00:00.000Z",
      },
      composedVideo: {
        id: "composed-video-1",
        provider: "ffmpeg",
        videoUrl: "mock://ffmpeg/composed-videos/composed-video-1.mp4",
        thumbnailUrl: "mock://ffmpeg/composed-videos/composed-video-1.jpg",
        durationSec: 45,
        createdAt: "2026-03-22T10:00:00.000Z",
      },
    },
  });

  assert.equal(attempt.factoryJobId, "factory-job-1");
  assert.equal(attempt.renderJobId, "render-job-1");
  assert.equal(attempt.costEstimate.providerId, "runway-gen4");
  assert.equal(attempt.qualityCheck?.passed, true);
  assert.equal(attempt.providerExecutions.length, 5);
  assert.equal(attempt.narrationArtifact?.artifactType, "narration_audio");
  assert.equal(attempt.sceneArtifacts.length, 2);
  assert.equal(attempt.sceneArtifacts[0]?.artifactType, "scene_video");
  assert.equal(attempt.captionArtifact?.artifactType, "caption_track");
  assert.equal(attempt.composedVideoArtifact?.artifactType, "composed_video");
});

test("video factory attempt lineage appends regenerate attempts instead of overwriting", () => {
  const firstAttempt = buildVideoFactoryAttemptLineage({
    factoryJobId: "factory-job-1",
    renderVersion: "phase-c-render-v1",
    generationRequestId: "generation-request-1",
    renderJobId: "render-job-1",
    renderedAssetId: "rendered-asset-1",
    costEstimate: {
      estimatedTotalUsd: 0.468,
      narrationCostUsd: 0.018,
      visualsCostUsd: 0.45,
      transcriptionCostUsd: 0,
      compositionCostUsd: 0,
      providerId: "runway-gen4",
      mode: "quality",
      estimatedAt: "2026-03-22T10:00:00.000Z",
    },
    qualityCheck: {
      ...baseQualityCheck,
      sceneCount: 1,
    },
    createdAt: "2026-03-22T10:00:00.000Z",
    narrationSpecId: "narration-spec-1",
    captionSpecId: "caption-spec-1",
    compositionSpecId: "composition-spec-1",
    providerResults: {
      narration: {
        id: "generated-narration-1",
        provider: "elevenlabs",
        audioUrl: "mock://elevenlabs/narration/generated-narration-1.mp3",
        durationSec: 45,
        createdAt: "2026-03-22T10:00:00.000Z",
      },
      sceneAssets: [
        {
          id: "scene-asset-1",
          provider: "runway-gen4",
          scenePromptId: "scene-prompt-1",
          assetUrl: "mock://runway-gen4/scene-assets/scene-asset-1.mp4",
          createdAt: "2026-03-22T10:00:00.000Z",
        },
      ],
      captionTrack: {
        id: "caption-track-1",
        provider: "assemblyai",
        sourceNarrationId: "generated-narration-1",
        transcriptText: "A transcript for the first mock caption track.",
        captionUrl: "mock://assemblyai/captions/caption-track-1.vtt",
        createdAt: "2026-03-22T10:00:00.000Z",
      },
      composedVideo: {
        id: "composed-video-1",
        provider: "ffmpeg",
        videoUrl: "mock://ffmpeg/composed-videos/composed-video-1.mp4",
        thumbnailUrl: "mock://ffmpeg/composed-videos/composed-video-1.jpg",
        durationSec: 45,
        createdAt: "2026-03-22T10:00:00.000Z",
      },
    },
  });
  const secondAttempt = buildVideoFactoryAttemptLineage({
    factoryJobId: "factory-job-1",
    renderVersion: "phase-c-render-v2",
    generationRequestId: "generation-request-2",
    renderJobId: "render-job-2",
    renderedAssetId: "rendered-asset-2",
    costEstimate: {
      estimatedTotalUsd: 0.4236,
      narrationCostUsd: 0.0188,
      visualsCostUsd: 0.376,
      transcriptionCostUsd: 0.0288,
      compositionCostUsd: 0,
      providerId: "kling-2",
      mode: "fast",
      estimatedAt: "2026-03-22T10:10:00.000Z",
    },
    qualityCheck: {
      ...baseQualityCheck,
      durationSeconds: 47,
      expectedDuration: 47,
      sceneCount: 1,
      checkedAt: "2026-03-22T10:10:00.000Z",
    },
    createdAt: "2026-03-22T10:10:00.000Z",
    narrationSpecId: "narration-spec-2",
    captionSpecId: "caption-spec-2",
    compositionSpecId: "composition-spec-2",
    providerResults: {
      narration: {
        id: "generated-narration-2",
        provider: "elevenlabs",
        audioUrl: "mock://elevenlabs/narration/generated-narration-2.mp3",
        durationSec: 47,
        createdAt: "2026-03-22T10:10:00.000Z",
      },
      sceneAssets: [
        {
          id: "scene-asset-2",
          provider: "kling-2",
          scenePromptId: "scene-prompt-2",
          assetUrl: "mock://kling-2/scene-assets/scene-asset-2.mp4",
          createdAt: "2026-03-22T10:10:00.000Z",
        },
      ],
      captionTrack: {
        id: "caption-track-2",
        provider: "assemblyai",
        sourceNarrationId: "generated-narration-2",
        transcriptText: "A transcript for the regenerated mock caption track.",
        captionUrl: "mock://assemblyai/captions/caption-track-2.vtt",
        createdAt: "2026-03-22T10:10:00.000Z",
      },
      composedVideo: {
        id: "composed-video-2",
        provider: "ffmpeg",
        videoUrl: "mock://ffmpeg/composed-videos/composed-video-2.mp4",
        thumbnailUrl: "mock://ffmpeg/composed-videos/composed-video-2.jpg",
        durationSec: 47,
        createdAt: "2026-03-22T10:10:00.000Z",
      },
    },
  });

  const lineage = appendVideoFactoryAttemptLineage([firstAttempt], secondAttempt);

  assert.equal(lineage.length, 2);
  assert.equal(lineage[0]?.attemptId, "render-job-1:attempt-lineage");
  assert.equal(lineage[1]?.attemptId, "render-job-2:attempt-lineage");
  assert.equal(lineage[1]?.renderVersion, "phase-c-render-v2");
  assert.equal(lineage[1]?.costEstimate.providerId, "kling-2");
  assert.equal(lineage[1]?.qualityCheck?.durationSeconds, 47);
});
