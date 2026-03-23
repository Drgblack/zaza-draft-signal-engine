import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoFactoryIdempotencyKey,
  isVideoFactoryLifecycleActive,
  resolveVideoFactoryDuplicateRunDecision,
} from "../lib/video-factory-idempotency";

test("video factory idempotency key is deterministic per request shape", () => {
  const firstKey = buildVideoFactoryIdempotencyKey({
    action: "generate",
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    renderVersion: "phase-c-render-v1",
    provider: "mock",
    preTriageConcern: "trust_concern",
  });
  const secondKey = buildVideoFactoryIdempotencyKey({
    action: "generate",
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    renderVersion: "phase-c-render-v1",
    provider: "mock",
    preTriageConcern: "trust_concern",
  });
  const differentKey = buildVideoFactoryIdempotencyKey({
    action: "generate",
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    renderVersion: "phase-c-render-v1",
    provider: "mock",
    preTriageConcern: "voice_concern",
  });

  assert.equal(firstKey, secondKey);
  assert.notEqual(firstKey, differentKey);
});

test("video factory lifecycle active helper only marks in-flight statuses active", () => {
  assert.equal(isVideoFactoryLifecycleActive({ status: "queued" }), true);
  assert.equal(isVideoFactoryLifecycleActive({ status: "composing" }), true);
  assert.equal(isVideoFactoryLifecycleActive({ status: "review_pending" }), false);
  assert.equal(isVideoFactoryLifecycleActive({ status: "failed" }), false);
});

test("duplicate run decision replays exact duplicate active requests and blocks mismatches", () => {
  const requestedIdempotencyKey = buildVideoFactoryIdempotencyKey({
    action: "regenerate",
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    renderVersion: "phase-c-render-v1:attempt-2",
    provider: "mock",
    regenerationReason: "wrong_mood",
  });

  const replayDecision = resolveVideoFactoryDuplicateRunDecision({
    requestedAction: "regenerate",
    requestedIdempotencyKey,
    lifecycle: {
      status: "generating_visuals",
      renderVersion: "phase-c-render-v1:attempt-2",
    },
    renderJob: {
      idempotencyKey: requestedIdempotencyKey,
      renderVersion: "phase-c-render-v1:attempt-2",
    },
    generationRequest: {
      idempotencyKey: requestedIdempotencyKey,
    },
  });
  const conflictDecision = resolveVideoFactoryDuplicateRunDecision({
    requestedAction: "regenerate",
    requestedIdempotencyKey,
    lifecycle: {
      status: "generating_visuals",
      renderVersion: "phase-c-render-v1:attempt-2",
    },
    renderJob: {
      idempotencyKey: `${requestedIdempotencyKey}:other`,
      renderVersion: "phase-c-render-v1:attempt-2",
    },
    generationRequest: {
      idempotencyKey: `${requestedIdempotencyKey}:other`,
    },
  });

  assert.deepEqual(replayDecision, {
    type: "replay",
    renderVersion: "phase-c-render-v1:attempt-2",
  });
  assert.equal(conflictDecision.type, "conflict");
});
