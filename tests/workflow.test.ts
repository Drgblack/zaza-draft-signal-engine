import assert from "node:assert/strict";
import test from "node:test";

import { getMockSignalById, mockSignalRecords } from "../lib/mock-data";
import { getWorkflowBuckets, hasReviewableDraftPackage } from "../lib/workflow";

test("hasReviewableDraftPackage recognizes legacy draft-generated records that are ready for review", () => {
  const legacyReviewable = getMockSignalById("mock_sig_002");
  const incompleteDraft = getMockSignalById("mock_sig_010");

  assert.ok(legacyReviewable, "expected legacy reviewable signal fixture");
  assert.ok(incompleteDraft, "expected incomplete draft signal fixture");

  assert.equal(hasReviewableDraftPackage(legacyReviewable), true);
  assert.equal(hasReviewableDraftPackage(incompleteDraft), false);
});

test("getWorkflowBuckets surfaces legacy reviewable draft packages in the ready-for-review bucket", () => {
  const buckets = getWorkflowBuckets(mockSignalRecords);
  const readyForReviewIds = new Set(buckets.readyForReview.map((signal) => signal.recordId));

  assert.equal(readyForReviewIds.has("mock_sig_002"), true);
  assert.equal(readyForReviewIds.has("mock_sig_003"), true);
  assert.equal(readyForReviewIds.has("mock_sig_010"), false);
});
