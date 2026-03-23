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

const baseRetryState = {
  retryCount: 1,
  maxRetries: 2,
  backoffDelayMs: 3000,
  nextRetryAt: "2026-03-22T10:00:03.000Z",
  lastFailureAt: "2026-03-22T10:00:00.000Z",
  retryStage: "generating_visuals",
  failureMode: "retryable" as const,
  exhausted: false,
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
    retryState: baseRetryState,
    stageRetryStates: {
      narration: {
        ...baseRetryState,
        retryCount: 0,
        backoffDelayMs: null,
        nextRetryAt: null,
        lastFailureAt: null,
        retryStage: "generating_narration",
        failureMode: "none",
      },
      visuals: baseRetryState,
      captions: {
        ...baseRetryState,
        retryCount: 0,
        backoffDelayMs: null,
        nextRetryAt: null,
        lastFailureAt: null,
        retryStage: "generating_captions",
        failureMode: "none",
      },
      composition: {
        ...baseRetryState,
        retryCount: 0,
        backoffDelayMs: null,
        nextRetryAt: null,
        lastFailureAt: null,
        retryStage: "composing",
        failureMode: "none",
      },
    },
    persistedArtifacts: {
      narration: {
        backend: "blob",
        pathname: "video-factory/opportunity-1/brief-1/factory-job-1/attempt-1-phase-c-render-v1/narration-audio/generated-narration-1.json",
        url: "https://blob.example/narration-1.json",
        sourceUrl: "mock://elevenlabs/narration/generated-narration-1.mp3",
        contentType: "application/json; charset=utf-8",
        persistedAt: "2026-03-22T10:00:00.000Z",
      },
      sceneAssets: [
        {
          backend: "blob",
          pathname: "video-factory/opportunity-1/brief-1/factory-job-1/attempt-1-phase-c-render-v1/scene-video/scene-asset-1.json",
          url: "https://blob.example/scene-asset-1.json",
          sourceUrl: "mock://runway-gen4/scene-assets/scene-asset-1.mp4",
          contentType: "application/json; charset=utf-8",
          persistedAt: "2026-03-22T10:00:00.000Z",
        },
        {
          backend: "blob",
          pathname: "video-factory/opportunity-1/brief-1/factory-job-1/attempt-1-phase-c-render-v1/scene-video/scene-asset-2.json",
          url: "https://blob.example/scene-asset-2.json",
          sourceUrl: "mock://kling-2/scene-assets/scene-asset-2.mp4",
          contentType: "application/json; charset=utf-8",
          persistedAt: "2026-03-22T10:00:00.000Z",
        },
      ],
      caption: {
        backend: "blob",
        pathname: "video-factory/opportunity-1/brief-1/factory-job-1/attempt-1-phase-c-render-v1/caption-track/caption-track-1.vtt",
        url: "https://blob.example/caption-track-1.vtt",
        sourceUrl: "mock://assemblyai/captions/caption-track-1.vtt",
        contentType: "text/vtt; charset=utf-8",
        persistedAt: "2026-03-22T10:00:00.000Z",
      },
      composedVideo: {
        backend: "blob",
        pathname: "video-factory/opportunity-1/brief-1/factory-job-1/attempt-1-phase-c-render-v1/composed-video/composed-video-1.json",
        url: "https://blob.example/composed-video-1.json",
        sourceUrl: "mock://ffmpeg/composed-videos/composed-video-1.mp4",
        contentType: "application/json; charset=utf-8",
        persistedAt: "2026-03-22T10:00:00.000Z",
      },
      thumbnail: {
        backend: "blob",
        pathname: "video-factory/opportunity-1/brief-1/factory-job-1/attempt-1-phase-c-render-v1/thumbnail-image/composed-video-1-thumbnail.json",
        url: "https://blob.example/composed-video-1-thumbnail.json",
        sourceUrl: "mock://ffmpeg/composed-videos/composed-video-1.jpg",
        contentType: "application/json; charset=utf-8",
        persistedAt: "2026-03-22T10:00:00.000Z",
      },
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
        providerJobId: null,
        audioMimeType: null,
        audioBase64: null,
        durationSec: 45,
        createdAt: "2026-03-22T10:00:00.000Z",
      },
      sceneAssets: [
        {
          id: "scene-asset-1",
          provider: "runway-gen4",
          scenePromptId: "scene-prompt-1",
          assetUrl: "mock://runway-gen4/scene-assets/scene-asset-1.mp4",
          providerJobId: null,
          createdAt: "2026-03-22T10:00:00.000Z",
        },
        {
          id: "scene-asset-2",
          provider: "kling-2",
          scenePromptId: "scene-prompt-2",
          assetUrl: "mock://kling-2/scene-assets/scene-asset-2.mp4",
          providerJobId: null,
          createdAt: "2026-03-22T10:00:00.000Z",
        },
      ],
      captionTrack: {
        id: "caption-track-1",
        provider: "assemblyai",
        sourceNarrationId: "generated-narration-1",
        transcriptText: "A transcript for the mock caption track.",
        captionUrl: "mock://assemblyai/captions/caption-track-1.vtt",
        providerJobId: null,
        captionVtt: null,
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
  assert.equal(attempt.retryState?.retryCount, 1);
  assert.equal(attempt.providerExecutions.length, 5);
  assert.equal(attempt.providerExecutions[1]?.retryState?.retryStage, "generating_visuals");
  assert.equal(attempt.narrationArtifact?.artifactType, "narration_audio");
  assert.equal(attempt.sceneArtifacts.length, 2);
  assert.equal(attempt.sceneArtifacts[0]?.artifactType, "scene_video");
  assert.equal(attempt.sceneArtifacts[0]?.storage?.backend, "blob");
  assert.equal(attempt.captionArtifact?.artifactType, "caption_track");
  assert.equal(attempt.composedVideoArtifact?.artifactType, "composed_video");
  assert.equal(attempt.thumbnailArtifact?.artifactType, "thumbnail_image");
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
    persistedArtifacts: {
      narration: null,
      sceneAssets: [null],
      caption: null,
      composedVideo: null,
      thumbnail: null,
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
        providerJobId: null,
        audioMimeType: null,
        audioBase64: null,
        durationSec: 45,
        createdAt: "2026-03-22T10:00:00.000Z",
      },
      sceneAssets: [
        {
          id: "scene-asset-1",
          provider: "runway-gen4",
          scenePromptId: "scene-prompt-1",
          assetUrl: "mock://runway-gen4/scene-assets/scene-asset-1.mp4",
          providerJobId: null,
          createdAt: "2026-03-22T10:00:00.000Z",
        },
      ],
      captionTrack: {
        id: "caption-track-1",
        provider: "assemblyai",
        sourceNarrationId: "generated-narration-1",
        transcriptText: "A transcript for the first mock caption track.",
        captionUrl: "mock://assemblyai/captions/caption-track-1.vtt",
        providerJobId: null,
        captionVtt: null,
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
    persistedArtifacts: {
      narration: null,
      sceneAssets: [null],
      caption: null,
      composedVideo: null,
      thumbnail: null,
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
        providerJobId: null,
        audioMimeType: null,
        audioBase64: null,
        durationSec: 47,
        createdAt: "2026-03-22T10:10:00.000Z",
      },
      sceneAssets: [
        {
          id: "scene-asset-2",
          provider: "kling-2",
          scenePromptId: "scene-prompt-2",
          assetUrl: "mock://kling-2/scene-assets/scene-asset-2.mp4",
          providerJobId: null,
          createdAt: "2026-03-22T10:10:00.000Z",
        },
      ],
      captionTrack: {
        id: "caption-track-2",
        provider: "assemblyai",
        sourceNarrationId: "generated-narration-2",
        transcriptText: "A transcript for the regenerated mock caption track.",
        captionUrl: "mock://assemblyai/captions/caption-track-2.vtt",
        providerJobId: null,
        captionVtt: null,
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
