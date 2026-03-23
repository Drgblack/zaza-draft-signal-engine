import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAutonomyLearningAdjustmentFromRecords,
  buildLearningAggregates,
  buildLearningInputSignature,
  buildRepairAutopilotAdjustmentFromRecords,
  type LearningRecord,
} from "../lib/learning-loop";

function buildLearningRecordFixture(
  overrides: Partial<LearningRecord> = {},
): LearningRecord {
  return {
    learningRecordId: overrides.learningRecordId ?? crypto.randomUUID(),
    inputSignature:
      overrides.inputSignature ??
      buildLearningInputSignature("video_factory", {
        action: "auto_run_video_factory",
        content: "campaign",
        platform: "linkedin",
        provider: "runway",
      }),
    outcome: overrides.outcome ?? "success",
    retries: overrides.retries ?? 0,
    cost: overrides.cost ?? 1.2,
    timestamp: overrides.timestamp ?? "2026-03-23T10:00:00.000Z",
    inputType: overrides.inputType ?? "video_factory",
    stage: overrides.stage ?? "generation",
    actionType: overrides.actionType ?? "auto_run_video_factory",
    sourceId: overrides.sourceId ?? "source-1",
    platform: overrides.platform ?? "linkedin",
    impressions: overrides.impressions ?? null,
    clicks: overrides.clicks ?? null,
    signups: overrides.signups ?? null,
    engagementScore: overrides.engagementScore ?? null,
  };
}

test("buildLearningAggregates summarizes success rate, retries, and cost per success", () => {
  const records = [
    buildLearningRecordFixture({
      learningRecordId: "one",
      inputType: "video_factory",
      outcome: "success",
      retries: 1,
      cost: 2,
    }),
    buildLearningRecordFixture({
      learningRecordId: "two",
      inputType: "video_factory",
      outcome: "failed",
      retries: 2,
      cost: 1,
    }),
    buildLearningRecordFixture({
      learningRecordId: "three",
      inputType: "signal",
      inputSignature: buildLearningInputSignature("signal", {
        platform: "x",
      }),
      stage: "signal_outcome",
      actionType: "posting_outcome",
      platform: "x",
      outcome: "success",
      retries: 0,
      cost: 0,
    }),
  ];

  const aggregates = buildLearningAggregates(records);

  assert.equal(aggregates.averageRetries, 1);
  assert.equal(aggregates.costPerSuccess, 1);
  assert.equal(aggregates.successRateByInputType[0]?.inputType, "video_factory");
  assert.equal(aggregates.successRateByInputType[0]?.successRate, 0.5);
});

test("buildAutonomyLearningAdjustmentFromRecords increases risk when similar runs underperform", () => {
  const signature = buildLearningInputSignature("video_factory", {
    action: "auto_run_video_factory",
    content: "campaign",
    platform: "linkedin",
    provider: "runway",
  });
  const records = [
    buildLearningRecordFixture({
      learningRecordId: "run-1",
      inputSignature: signature,
      outcome: "failed",
      retries: 2,
      cost: 9,
    }),
    buildLearningRecordFixture({
      learningRecordId: "run-2",
      inputSignature: signature,
      outcome: "rejected",
      retries: 2,
      cost: 8,
      stage: "operator_review",
      sourceId: "review-2",
    }),
    buildLearningRecordFixture({
      learningRecordId: "run-3",
      inputSignature: signature,
      outcome: "success",
      retries: 2,
      cost: 8,
      sourceId: "source-3",
    }),
  ];

  const adjustment = buildAutonomyLearningAdjustmentFromRecords(records, {
    actionType: "auto_run_video_factory",
    contentType: "campaign",
    platformTarget: "linkedin",
    inputType: "video_factory",
  });

  assert.equal(adjustment.increaseRisk, true);
  assert.equal(Boolean(adjustment.reason), true);
  assert.equal(adjustment.sampleSize, 3);
});

test("buildRepairAutopilotAdjustmentFromRecords becomes conservative for weak signal outcomes", () => {
  const signature = buildLearningInputSignature("signal", {
    platform: "x",
  });
  const records = [
    buildLearningRecordFixture({
      learningRecordId: "signal-1",
      inputType: "signal",
      inputSignature: signature,
      stage: "signal_outcome",
      actionType: "posting_outcome",
      platform: "x",
      outcome: "rejected",
      sourceId: "posting-1",
      cost: 0,
    }),
    buildLearningRecordFixture({
      learningRecordId: "signal-2",
      inputType: "signal",
      inputSignature: signature,
      stage: "signal_outcome",
      actionType: "posting_outcome",
      platform: "x",
      outcome: "rejected",
      sourceId: "posting-2",
      cost: 0,
    }),
    buildLearningRecordFixture({
      learningRecordId: "signal-3",
      inputType: "signal",
      inputSignature: signature,
      stage: "signal_outcome",
      actionType: "posting_outcome",
      platform: "x",
      outcome: "success",
      sourceId: "posting-3",
      cost: 0,
    }),
  ];

  const adjustment = buildRepairAutopilotAdjustmentFromRecords(records, {
    platform: "x",
  });

  assert.equal(adjustment.useConservativeTextDefaults, true);
  assert.equal(Boolean(adjustment.reason), true);
  assert.equal(adjustment.sampleSize, 3);
});
