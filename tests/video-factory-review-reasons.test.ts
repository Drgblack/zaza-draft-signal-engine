import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveStructuredReasonsFromLegacyRegenerationReason,
  normalizeFactoryReviewReasonCodes,
} from "../lib/video-factory-review-reasons";

test("normalizeFactoryReviewReasonCodes deduplicates and filters invalid values", () => {
  const reasons = normalizeFactoryReviewReasonCodes([
    "tone_mismatch",
    "poor_visuals",
    "tone_mismatch",
    "invalid-value",
    null,
  ]);

  assert.deepEqual(reasons, ["tone_mismatch", "poor_visuals"]);
});

test("deriveStructuredReasonsFromLegacyRegenerationReason maps legacy reasons into taxonomy", () => {
  assert.deepEqual(
    deriveStructuredReasonsFromLegacyRegenerationReason("wrong_mood"),
    ["tone_mismatch"],
  );
  assert.deepEqual(
    deriveStructuredReasonsFromLegacyRegenerationReason("wrong_visual_setting"),
    ["poor_visuals"],
  );
  assert.deepEqual(
    deriveStructuredReasonsFromLegacyRegenerationReason(null),
    [],
  );
});
