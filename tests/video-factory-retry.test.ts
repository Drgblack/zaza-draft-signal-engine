import assert from "node:assert/strict";
import test from "node:test";

import {
  VideoFactoryRetryExecutionError,
  VideoFactoryRetryableError,
  calculateRetryBackoffDelay,
  executeWithRetry,
  summarizeVideoFactoryRetryStates,
} from "../lib/video-factory-retry";

test("calculateRetryBackoffDelay uses exponential backoff", () => {
  assert.equal(calculateRetryBackoffDelay(1), 3000);
  assert.equal(calculateRetryBackoffDelay(2), 6000);
  assert.equal(calculateRetryBackoffDelay(3), 12000);
});

test("executeWithRetry retries retryable failures and returns retry metadata on success", async () => {
  let attempts = 0;
  const delays: number[] = [];

  const result = await executeWithRetry({
    stage: "generating_narration",
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
    step: async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("temporary");
      }

      return "ok";
    },
  });

  assert.equal(result.value, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [3000, 6000]);
  assert.equal(result.retryState.retryCount, 2);
  assert.equal(result.retryState.failureMode, "retryable");
  assert.equal(result.retryState.exhausted, false);
  assert.equal(result.retryState.retryStage, "generating_narration");
});

test("executeWithRetry stops immediately for non-retryable failures", async () => {
  let attempts = 0;

  await assert.rejects(
    async () =>
      executeWithRetry({
        stage: "preparing",
        step: async () => {
          attempts += 1;
          throw new VideoFactoryRetryableError("bad input", {
            retryable: false,
          });
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof VideoFactoryRetryExecutionError);
      assert.equal(error.retryState.retryCount, 0);
      assert.equal(error.retryState.failureMode, "non_retryable");
      assert.equal(error.retryState.exhausted, false);
      return true;
    },
  );

  assert.equal(attempts, 1);
});

test("summarizeVideoFactoryRetryStates aggregates retry usage across stages", () => {
  const summary = summarizeVideoFactoryRetryStates([
    {
      retryCount: 1,
      maxRetries: 2,
      backoffDelayMs: 3000,
      nextRetryAt: "2026-03-23T10:00:03.000Z",
      lastFailureAt: "2026-03-23T10:00:00.000Z",
      retryStage: "generating_visuals",
      failureMode: "retryable",
      exhausted: false,
    },
    {
      retryCount: 0,
      maxRetries: 2,
      backoffDelayMs: null,
      nextRetryAt: null,
      lastFailureAt: null,
      retryStage: "quality_check",
      failureMode: "none",
      exhausted: false,
    },
  ]);

  assert.equal(summary.retryCount, 1);
  assert.equal(summary.failureMode, "retryable");
  assert.equal(summary.retryStage, "generating_visuals");
});
