import assert from "node:assert/strict";
import test from "node:test";

import { getMockSignalById } from "../lib/mock-data";
import {
  canTransitionWorkflowState,
  resolveWorkflowState,
  validateWorkflowTransition,
} from "../lib/workflow-state-machine";

test("resolveWorkflowState derives explicit pipeline states from legacy records", () => {
  const interpreted = getMockSignalById("mock_sig_001");
  const generated = getMockSignalById("mock_sig_002");

  assert.ok(interpreted, "expected interpreted signal fixture");
  assert.ok(generated, "expected generated signal fixture");
  const rejected = {
    ...interpreted,
    status: "New" as const,
    keepRejectRecommendation: "Reject" as const,
    qualityGateResult: "Fail" as const,
  };

  assert.equal(resolveWorkflowState(interpreted), "INTERPRETED");
  assert.equal(resolveWorkflowState(generated), "GENERATED");
  assert.equal(resolveWorkflowState(rejected), "REJECTED");
});

test("validateWorkflowTransition allows forward workflow transitions", () => {
  const generated = getMockSignalById("mock_sig_002");

  assert.ok(generated, "expected generated signal fixture");
  assert.equal(validateWorkflowTransition(generated, "REVIEW_READY").valid, true);
  assert.equal(validateWorkflowTransition(generated, "APPROVED").valid, true);
  assert.equal(canTransitionWorkflowState("APPROVED", "SCHEDULED"), true);
});

test("validateWorkflowTransition rejects invalid workflow transitions", () => {
  const interpreted = getMockSignalById("mock_sig_001");

  assert.ok(interpreted, "expected interpreted signal fixture");

  const validation = validateWorkflowTransition(interpreted, "SCHEDULED");
  assert.equal(validation.valid, false);
  assert.equal(validation.from, "INTERPRETED");
  assert.equal(validation.to, "SCHEDULED");
});
