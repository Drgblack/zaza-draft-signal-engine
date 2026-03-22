import assert from "node:assert/strict";
import test from "node:test";

import {
  appendFactoryRunLedgerEntry,
  buildFactoryRunLedgerEntry,
  updateFactoryRunLedgerOutcome,
} from "../lib/video-factory-run-ledger";

const baseCostEstimate = {
  estimatedTotalUsd: 0.9234,
  narrationCostUsd: 0.018,
  visualsCostUsd: 0.9,
  transcriptionCostUsd: 0.0054,
  compositionCostUsd: 0,
  providerId: "runway-gen4",
  mode: "quality" as const,
  estimatedAt: "2026-03-22T10:00:00.000Z",
};

const baseQualityCheck = {
  passed: true,
  hasAudio: true,
  durationSeconds: 45,
  expectedDuration: 45,
  durationInRange: true,
  captionsPresent: true,
  sceneCount: 1,
  failures: [],
  checkedAt: "2026-03-22T10:00:00.000Z",
};

const baseLifecycle = {
  factoryJobId: "brief-1:factory-job:phase-c-render-v1",
  videoBriefId: "brief-1",
  provider: "mock" as const,
  renderVersion: "phase-c-render-v1",
  status: "review_pending" as const,
  draftAt: "2026-03-22T09:59:58.000Z",
  queuedAt: "2026-03-22T09:59:59.000Z",
  preparingAt: "2026-03-22T10:00:00.000Z",
  generatingNarrationAt: "2026-03-22T10:00:01.000Z",
  generatingVisualsAt: "2026-03-22T10:00:02.000Z",
  generatingCaptionsAt: "2026-03-22T10:00:03.000Z",
  composingAt: "2026-03-22T10:00:04.000Z",
  generatedAt: "2026-03-22T10:00:05.000Z",
  reviewPendingAt: "2026-03-22T10:00:06.000Z",
  acceptedAt: null,
  rejectedAt: null,
  discardedAt: null,
  failedAt: null,
  lastUpdatedAt: "2026-03-22T10:00:06.000Z",
  failureStage: null,
  failureMessage: null,
};

test("buildFactoryRunLedgerEntry records providers, transitions, cost, and artifacts", () => {
  const entry = buildFactoryRunLedgerEntry({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    attemptNumber: 1,
    lifecycle: baseLifecycle,
    renderProvider: "mock",
    generationRequestId: "generation-request-1",
    renderJobId: "render-job-1",
    renderedAssetId: "rendered-asset-1",
    estimatedCost: baseCostEstimate,
    qualityCheck: baseQualityCheck,
    attemptLineage: {
      attemptId: "render-job-1:attempt-lineage",
      factoryJobId: baseLifecycle.factoryJobId,
      renderVersion: "phase-c-render-v1",
      generationRequestId: "generation-request-1",
      renderJobId: "render-job-1",
      renderedAssetId: "rendered-asset-1",
      costEstimate: baseCostEstimate,
      qualityCheck: baseQualityCheck,
      providerExecutions: [],
      narrationArtifact: {
        artifactId: "narration-1",
        artifactType: "narration_audio",
        executionId: "execution-1",
        renderJobId: "render-job-1",
        renderVersion: "phase-c-render-v1",
        narrationSpecId: "narration-spec-1",
        providerId: "elevenlabs",
        audioUrl: "mock://elevenlabs/audio.mp3",
        durationSec: 45,
        createdAt: "2026-03-22T10:00:01.000Z",
      },
      sceneArtifacts: [
        {
          artifactId: "scene-1",
          artifactType: "scene_video",
          executionId: "execution-2",
          renderJobId: "render-job-1",
          renderVersion: "phase-c-render-v1",
          scenePromptId: "scene-prompt-1",
          providerId: "runway-gen4",
          assetUrl: "mock://runway/scene-1.mp4",
          order: 1,
          createdAt: "2026-03-22T10:00:02.000Z",
        },
      ],
      captionArtifact: {
        artifactId: "caption-1",
        artifactType: "caption_track",
        executionId: "execution-3",
        renderJobId: "render-job-1",
        renderVersion: "phase-c-render-v1",
        captionSpecId: "caption-spec-1",
        sourceNarrationId: "narration-1",
        providerId: "assemblyai",
        transcriptText: "Transcript",
        captionUrl: "mock://assemblyai/caption.vtt",
        createdAt: "2026-03-22T10:00:03.000Z",
      },
      composedVideoArtifact: {
        artifactId: "video-1",
        artifactType: "composed_video",
        executionId: "execution-4",
        renderJobId: "render-job-1",
        renderVersion: "phase-c-render-v1",
        compositionSpecId: "composition-spec-1",
        providerId: "ffmpeg",
        videoUrl: "mock://ffmpeg/video.mp4",
        thumbnailUrl: "mock://ffmpeg/video.jpg",
        durationSec: 45,
        createdAt: "2026-03-22T10:00:04.000Z",
      },
      createdAt: "2026-03-22T10:00:06.000Z",
    },
  });

  assert.equal(entry.attemptNumber, 1);
  assert.equal(entry.providerSet.renderProvider, "mock");
  assert.equal(entry.providerSet.narrationProvider, "elevenlabs");
  assert.deepEqual(entry.providerSet.visualProviders, ["runway-gen4"]);
  assert.equal(entry.providerSet.captionProvider, "assemblyai");
  assert.equal(entry.providerSet.compositionProvider, "ffmpeg");
  assert.equal(entry.terminalOutcome, "review_pending");
  assert.equal(entry.estimatedCost?.estimatedTotalUsd, 0.9234);
  assert.equal(entry.qualityCheck?.passed, true);
  assert.deepEqual(entry.artifactIds, ["narration-1", "scene-1", "caption-1", "video-1"]);
  assert.equal(entry.lifecycleTransitions.length, 9);
});

test("updateFactoryRunLedgerOutcome updates the matching attempt to terminal state", () => {
  const entry = buildFactoryRunLedgerEntry({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    attemptNumber: 1,
    lifecycle: baseLifecycle,
    renderProvider: "mock",
    generationRequestId: "generation-request-1",
    renderJobId: "render-job-1",
    renderedAssetId: "rendered-asset-1",
    estimatedCost: baseCostEstimate,
    qualityCheck: baseQualityCheck,
  });
  const updated = updateFactoryRunLedgerOutcome([entry], {
    renderJobId: "render-job-1",
    renderedAssetId: "rendered-asset-1",
    lifecycle: {
      ...baseLifecycle,
      status: "accepted",
      acceptedAt: "2026-03-22T10:05:00.000Z",
      lastUpdatedAt: "2026-03-22T10:05:00.000Z",
    },
  });

  assert.equal(updated[0]?.terminalOutcome, "accepted");
  assert.equal(updated[0]?.lastUpdatedAt, "2026-03-22T10:05:00.000Z");
  assert.equal(updated[0]?.lifecycleTransitions.at(-1)?.status, "accepted");
});

test("appendFactoryRunLedgerEntry preserves distinct regenerate attempts", () => {
  const first = buildFactoryRunLedgerEntry({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    attemptNumber: 1,
    lifecycle: baseLifecycle,
    renderProvider: "mock",
    renderJobId: "render-job-1",
    estimatedCost: baseCostEstimate,
    qualityCheck: baseQualityCheck,
  });
  const second = buildFactoryRunLedgerEntry({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    attemptNumber: 2,
    lifecycle: {
      ...baseLifecycle,
      factoryJobId: "brief-1:factory-job:phase-c-render-v2",
      renderVersion: "phase-c-render-v2",
      lastUpdatedAt: "2026-03-22T10:10:00.000Z",
    },
    renderProvider: "mock",
    renderJobId: "render-job-2",
    estimatedCost: {
      ...baseCostEstimate,
      providerId: "kling-2",
      mode: "fast",
      estimatedAt: "2026-03-22T10:10:00.000Z",
    },
    qualityCheck: {
      ...baseQualityCheck,
      durationSeconds: 47,
      expectedDuration: 47,
      checkedAt: "2026-03-22T10:10:00.000Z",
    },
  });

  const ledger = appendFactoryRunLedgerEntry([first], second);

  assert.equal(ledger.length, 2);
  assert.equal(ledger[0]?.attemptNumber, 1);
  assert.equal(ledger[1]?.attemptNumber, 2);
  assert.equal(ledger[1]?.estimatedCost?.providerId, "kling-2");
  assert.equal(ledger[1]?.qualityCheck?.durationSeconds, 47);
});
