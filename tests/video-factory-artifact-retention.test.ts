import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoFactoryRetentionPolicy,
  listCleanupEligibleArtifactRefs,
  videoFactoryPersistedArtifactRefSchema,
} from "../lib/video-factory-artifact-storage";
import {
  listCleanupEligibleLineageArtifacts,
  videoFactoryAttemptLineageSchema,
} from "../lib/video-factory-lineage";

test("listCleanupEligibleArtifactRefs returns only expired retained artifact refs", () => {
  const expiredIntermediate = videoFactoryPersistedArtifactRefSchema.parse({
    backend: "blob",
    pathname: "video-factory/intermediate.mp4",
    url: "https://blob.example/intermediate.mp4",
    sourceUrl: null,
    contentType: "video/mp4",
    persistedAt: "2026-03-01T10:00:00.000Z",
    ...buildVideoFactoryRetentionPolicy({
      createdAt: "2026-03-01T10:00:00.000Z",
      retentionClass: "intermediate_artifact",
      asOf: "2026-03-20T10:00:00.000Z",
    }),
  });
  const stillRetained = videoFactoryPersistedArtifactRefSchema.parse({
    backend: "blob",
    pathname: "video-factory/final.mp4",
    url: "https://blob.example/final.mp4",
    sourceUrl: null,
    contentType: "video/mp4",
    persistedAt: "2026-03-15T10:00:00.000Z",
    ...buildVideoFactoryRetentionPolicy({
      createdAt: "2026-03-15T10:00:00.000Z",
      retentionClass: "final_approved_output",
      asOf: "2026-03-20T10:00:00.000Z",
    }),
  });

  const eligible = listCleanupEligibleArtifactRefs(
    [expiredIntermediate, stillRetained],
    { asOf: "2026-03-20T10:00:00.000Z" },
  );

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0]?.pathname, "video-factory/intermediate.mp4");
});

test("listCleanupEligibleLineageArtifacts surfaces expired lineage-backed persisted artifacts", () => {
  const attempt = videoFactoryAttemptLineageSchema.parse({
    attemptId: "attempt-1",
    factoryJobId: "factory-job-1",
    renderVersion: "phase-d-render-v1",
    generationRequestId: "generation-1",
    renderJobId: "render-1",
    renderedAssetId: null,
    costEstimate: {
      estimatedTotalUsd: 1.2,
      narrationCostUsd: 0.2,
      visualsCostUsd: 0.8,
      transcriptionCostUsd: 0.2,
      compositionCostUsd: 0,
      providerId: "runway-gen4",
      mode: "quality",
      estimatedAt: "2026-03-01T10:00:00.000Z",
    },
    actualCost: null,
    budgetGuard: null,
    qualityCheck: null,
    retryState: null,
    providerExecutions: [],
    narrationArtifact: {
      artifactId: "narration-1",
      artifactType: "narration_audio",
      executionId: "exec-1",
      renderJobId: "render-1",
      renderVersion: "phase-d-render-v1",
      narrationSpecId: "narration-spec-1",
      providerId: "elevenlabs",
      audioUrl: "https://blob.example/narration.mp3",
      storage: {
        backend: "blob",
        pathname: "video-factory/narration.mp3",
        url: "https://blob.example/narration.mp3",
        sourceUrl: null,
        contentType: "audio/mpeg",
        persistedAt: "2026-03-01T10:00:00.000Z",
        ...buildVideoFactoryRetentionPolicy({
          createdAt: "2026-03-01T10:00:00.000Z",
          retentionClass: "intermediate_artifact",
          asOf: "2026-03-20T10:00:00.000Z",
        }),
      },
      durationSec: 30,
      createdAt: "2026-03-01T10:00:00.000Z",
    },
    sceneArtifacts: [],
    captionArtifact: null,
    composedVideoArtifact: null,
    thumbnailArtifact: null,
    createdAt: "2026-03-01T10:00:00.000Z",
  });

  const eligible = listCleanupEligibleLineageArtifacts([attempt], {
    asOf: "2026-03-20T10:00:00.000Z",
  });

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0]?.artifactId, "narration-1");
  assert.equal(eligible[0]?.storage.retentionClass, "intermediate_artifact");
});
