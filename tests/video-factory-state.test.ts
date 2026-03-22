import assert from "node:assert/strict";
import test from "node:test";

import {
  createDraftVideoFactoryLifecycle,
  transitionVideoFactoryLifecycle,
} from "../lib/video-factory-state";

test("video factory lifecycle records staged mock generation flow", () => {
  let lifecycle = createDraftVideoFactoryLifecycle({
    videoBriefId: "brief-1",
    createdAt: "2026-03-22T10:00:00.000Z",
  });

  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "queued", {
    timestamp: "2026-03-22T10:00:01.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });
  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "preparing", {
    timestamp: "2026-03-22T10:00:02.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });
  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "generating_narration", {
    timestamp: "2026-03-22T10:00:03.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });
  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "generating_visuals", {
    timestamp: "2026-03-22T10:00:04.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });
  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "generating_captions", {
    timestamp: "2026-03-22T10:00:05.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });
  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "composing", {
    timestamp: "2026-03-22T10:00:06.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });
  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "generated", {
    timestamp: "2026-03-22T10:00:07.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });
  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "review_pending", {
    timestamp: "2026-03-22T10:00:08.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });

  assert.equal(lifecycle.status, "review_pending");
  assert.equal(lifecycle.provider, "mock");
  assert.equal(lifecycle.renderVersion, "phase-c-render-v1");
  assert.equal(lifecycle.draftAt, "2026-03-22T10:00:00.000Z");
  assert.equal(lifecycle.queuedAt, "2026-03-22T10:00:01.000Z");
  assert.equal(lifecycle.preparingAt, "2026-03-22T10:00:02.000Z");
  assert.equal(lifecycle.generatingNarrationAt, "2026-03-22T10:00:03.000Z");
  assert.equal(lifecycle.generatingVisualsAt, "2026-03-22T10:00:04.000Z");
  assert.equal(lifecycle.generatingCaptionsAt, "2026-03-22T10:00:05.000Z");
  assert.equal(lifecycle.composingAt, "2026-03-22T10:00:06.000Z");
  assert.equal(lifecycle.generatedAt, "2026-03-22T10:00:07.000Z");
  assert.equal(lifecycle.reviewPendingAt, "2026-03-22T10:00:08.000Z");
});

test("video factory lifecycle captures failure stage and message", () => {
  let lifecycle = createDraftVideoFactoryLifecycle({
    videoBriefId: "brief-2",
    createdAt: "2026-03-22T12:00:00.000Z",
  });

  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "queued", {
    timestamp: "2026-03-22T12:00:01.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });
  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "preparing", {
    timestamp: "2026-03-22T12:00:02.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
  });
  lifecycle = transitionVideoFactoryLifecycle(lifecycle, "failed", {
    timestamp: "2026-03-22T12:00:03.000Z",
    provider: "mock",
    renderVersion: "phase-c-render-v1",
    failureStage: "preparing",
    failureMessage: "Compilation failed.",
  });

  assert.equal(lifecycle.status, "failed");
  assert.equal(lifecycle.failureStage, "preparing");
  assert.equal(lifecycle.failureMessage, "Compilation failed.");
  assert.equal(lifecycle.failedAt, "2026-03-22T12:00:03.000Z");
});

test("video factory lifecycle rejects invalid jumps", () => {
  const lifecycle = createDraftVideoFactoryLifecycle({
    videoBriefId: "brief-3",
    createdAt: "2026-03-22T13:00:00.000Z",
  });

  assert.throws(
    () =>
      transitionVideoFactoryLifecycle(lifecycle, "accepted", {
        timestamp: "2026-03-22T13:00:01.000Z",
      }),
    /Cannot transition video factory lifecycle/,
  );
});
