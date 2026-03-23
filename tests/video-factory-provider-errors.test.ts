import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeVideoFactoryProviderFailure,
  VideoFactoryProviderError,
} from "../lib/video-factory-provider-errors";
import {
  providerHttpError,
  providerInvalidResponseError,
  providerTimeoutError,
} from "../lib/providers/provider-runtime";

test("providerHttpError classifies retryable upstream failures for operators", () => {
  const error = providerHttpError({
    provider: "Runway",
    stage: "visuals",
    status: 429,
    message: "Too many requests",
  });

  assert.equal(error instanceof VideoFactoryProviderError, true);

  const summary = summarizeVideoFactoryProviderFailure(error);
  assert.equal(summary.provider, "Runway");
  assert.equal(summary.stage, "visuals");
  assert.equal(summary.category, "quota/rate_limit");
  assert.equal(summary.retryable, true);
  assert.match(summary.operatorSummary, /rate limit/i);
});

test("providerTimeoutError produces a timeout-specific operator summary", () => {
  const error = providerTimeoutError({
    provider: "AssemblyAI",
    stage: "captions",
    timeoutMs: 45000,
  });

  const summary = summarizeVideoFactoryProviderFailure(error);
  assert.equal(summary.provider, "AssemblyAI");
  assert.equal(summary.stage, "captions");
  assert.equal(summary.category, "timeout");
  assert.equal(summary.retryable, true);
  assert.match(summary.operatorSummary, /timed out/i);
});

test("providerInvalidResponseError marks malformed provider responses clearly", () => {
  const error = providerInvalidResponseError({
    provider: "AssemblyAI",
    stage: "captions",
    message: "AssemblyAI returned malformed JSON.",
  });

  const summary = summarizeVideoFactoryProviderFailure(error);
  assert.equal(summary.category, "invalid_response");
  assert.equal(summary.retryable, false);
  assert.match(summary.operatorSummary, /invalid or incomplete response/i);
});
