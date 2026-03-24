import assert from "node:assert/strict";
import test from "node:test";

import {
  buildABLearningInsightsFromRecords,
  buildAutonomyLearningAdjustmentFromRecords,
  buildBatchSelectionLearningBiasFromRecords,
  buildContentLearningAdjustmentFromRecords,
  buildGrowthLearningAdjustmentFromRecords,
  buildLearningAggregates,
  buildLearningInputSignature,
  buildLearningSnapshotFromRecords,
  buildRepairAutopilotAdjustmentFromRecords,
  inferCtaType,
  inferHookType,
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
        format: "short_video",
        hookType: "risk_warning",
        path: "video_factory",
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
    format: overrides.format ?? "short_video",
    hookType: overrides.hookType ?? "risk_warning",
    ctaType: overrides.ctaType ?? "product",
    provider: overrides.provider ?? "runway",
    executionPath: overrides.executionPath ?? "video_factory",
    impressions: overrides.impressions ?? null,
    clicks: overrides.clicks ?? null,
    signups: overrides.signups ?? null,
    engagementScore: overrides.engagementScore ?? null,
    engagementProxy: overrides.engagementProxy ?? null,
    ctr: overrides.ctr ?? null,
    completionRate: overrides.completionRate ?? null,
    approvalRate: overrides.approvalRate ?? null,
    costEfficiency: overrides.costEfficiency ?? null,
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
  assert.equal(aggregates.successRateByInputType[0]?.key, "video_factory");
  assert.equal(aggregates.successRateByInputType[0]?.successRate, 0.5);
  assert.equal(aggregates.successRateByFormat[0]?.key, "short_video");
  assert.equal(aggregates.successRateByHookType[0]?.key, "risk_warning");
  assert.equal(aggregates.successRateByExecutionPath[0]?.key, "video_factory");
  assert.equal(aggregates.patternEffectiveness.format[0]?.key, "short_video");
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

test("buildGrowthLearningAdjustmentFromRecords boosts strong formats and penalises retry-heavy patterns", () => {
  const records = [
    buildLearningRecordFixture({
      learningRecordId: "growth-1",
      outcome: "success",
      retries: 0,
      cost: 2,
      stage: "operator_review",
    }),
    buildLearningRecordFixture({
      learningRecordId: "growth-2",
      outcome: "success",
      retries: 1,
      cost: 2,
      stage: "operator_review",
      sourceId: "source-2",
    }),
    buildLearningRecordFixture({
      learningRecordId: "growth-3",
      outcome: "success",
      retries: 2,
      cost: 3,
      stage: "operator_review",
      sourceId: "source-3",
    }),
    buildLearningRecordFixture({
      learningRecordId: "growth-4",
      outcome: "failed",
      retries: 2,
      cost: 1,
      stage: "operator_review",
      sourceId: "source-4",
    }),
  ];

  const adjustment = buildGrowthLearningAdjustmentFromRecords(records, {
    format: "short_video",
    hookType: "risk_warning",
    ctaType: "product",
    executionPath: "video_factory",
  });

  assert.equal(adjustment.formatSuccessRate, 0.75);
  assert.equal(adjustment.ctaTypeSuccessRate, 0.75);
  assert.equal(adjustment.priorityDelta > 0, true);
  assert.equal(adjustment.averageRetries !== null && adjustment.averageRetries >= 1, true);
});

test("inferHookType classifies common hook shapes", () => {
  assert.equal(inferHookType("Before you send this..."), "pause_before_send");
  assert.equal(inferHookType("This could escalate quickly."), "risk_warning");
});

test("inferCtaType classifies common CTA families", () => {
  assert.equal(inferCtaType("Try Zaza Draft"), "product");
  assert.equal(inferCtaType("Share this with a colleague"), "engagement");
  assert.equal(inferCtaType("Learn more"), "visit");
});

test("buildLearningSnapshotFromRecords summarizes winners, losers, and trends", () => {
  const records = [
    buildLearningRecordFixture({
      learningRecordId: "snap-1",
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
      provider: "runway",
      outcome: "success",
      approvalRate: 1,
      completionRate: 1,
      costEfficiency: 2.4,
    }),
    buildLearningRecordFixture({
      learningRecordId: "snap-2",
      sourceId: "snap-2",
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
      provider: "runway",
      outcome: "success",
      approvalRate: 1,
      completionRate: 1,
      costEfficiency: 2.1,
    }),
    buildLearningRecordFixture({
      learningRecordId: "snap-3",
      sourceId: "snap-3",
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
      provider: "runway",
      outcome: "success",
      approvalRate: 1,
      completionRate: 1,
      costEfficiency: 2,
    }),
    buildLearningRecordFixture({
      learningRecordId: "snap-4",
      sourceId: "snap-4",
      format: "carousel",
      hookType: "relief_reassurance",
      ctaType: "engagement",
      provider: "kling",
      outcome: "rejected",
      approvalRate: 0,
      completionRate: 0,
      costEfficiency: 0.1,
    }),
    buildLearningRecordFixture({
      learningRecordId: "snap-5",
      sourceId: "snap-5",
      format: "carousel",
      hookType: "relief_reassurance",
      ctaType: "engagement",
      provider: "kling",
      outcome: "rejected",
      approvalRate: 0,
      completionRate: 0,
      costEfficiency: 0.1,
    }),
    buildLearningRecordFixture({
      learningRecordId: "snap-6",
      sourceId: "snap-6",
      format: "carousel",
      hookType: "relief_reassurance",
      ctaType: "engagement",
      provider: "kling",
      outcome: "rejected",
      approvalRate: 0,
      completionRate: 0,
      costEfficiency: 0.1,
    }),
  ];

  const previousSnapshot = buildLearningSnapshotFromRecords(records.slice(0, 4), {
    generatedAt: "2026-03-22T09:00:00.000Z",
  });
  const snapshot = buildLearningSnapshotFromRecords(records, {
    generatedAt: "2026-03-23T09:00:00.000Z",
    previousSnapshot,
  });

  assert.equal(snapshot.patternEffectiveness.format[0]?.key, "short_video");
  assert.equal(snapshot.underperformingPatterns[0]?.key, "carousel");
  assert.equal(snapshot.patternEffectiveness.format[0]?.trendDelta !== null, true);
});

test("learning pattern adjustments promote winners and demote weak patterns", () => {
  const winnerRecords = [
    buildLearningRecordFixture({
      learningRecordId: "adj-1",
      sourceId: "adj-1",
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
      outcome: "success",
      approvalRate: 1,
      completionRate: 1,
      costEfficiency: 2,
    }),
    buildLearningRecordFixture({
      learningRecordId: "adj-2",
      sourceId: "adj-2",
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
      outcome: "success",
      approvalRate: 1,
      completionRate: 1,
      costEfficiency: 2.2,
    }),
    buildLearningRecordFixture({
      learningRecordId: "adj-3",
      sourceId: "adj-3",
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
      outcome: "success",
      approvalRate: 1,
      completionRate: 1,
      costEfficiency: 2.1,
    }),
    buildLearningRecordFixture({
      learningRecordId: "adj-4",
      sourceId: "adj-4",
      format: "carousel",
      hookType: "relief_reassurance",
      ctaType: "engagement",
      outcome: "rejected",
      approvalRate: 0,
      completionRate: 0,
      costEfficiency: 0.1,
    }),
    buildLearningRecordFixture({
      learningRecordId: "adj-5",
      sourceId: "adj-5",
      format: "carousel",
      hookType: "relief_reassurance",
      ctaType: "engagement",
      outcome: "rejected",
      approvalRate: 0,
      completionRate: 0,
      costEfficiency: 0.1,
    }),
    buildLearningRecordFixture({
      learningRecordId: "adj-6",
      sourceId: "adj-6",
      format: "carousel",
      hookType: "relief_reassurance",
      ctaType: "engagement",
      outcome: "rejected",
      approvalRate: 0,
      completionRate: 0,
      costEfficiency: 0.1,
    }),
  ];

  const contentAdjustment = buildContentLearningAdjustmentFromRecords(
    winnerRecords,
    {
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
    },
  );
  const batchBias = buildBatchSelectionLearningBiasFromRecords(winnerRecords, {
    format: "carousel",
    hookType: "relief_reassurance",
    ctaType: "engagement",
  });

  assert.equal(contentAdjustment.scoreDelta > 0, true);
  assert.equal(batchBias.scoreDelta < 0, true);
});

test("buildABLearningInsightsFromRecords promotes decisive winners", () => {
  const records = [
    buildLearningRecordFixture({
      learningRecordId: "ab-a1",
      sourceId: "ab-a1",
      abTestConfigId: "ab-provider-1",
      abTestDimension: "provider_choice",
      abTestVariant: "A",
      provider: "runway",
      outcome: "success",
      approvalRate: 1,
      completionRate: 1,
      costEfficiency: 1.8,
    }),
    buildLearningRecordFixture({
      learningRecordId: "ab-a2",
      sourceId: "ab-a2",
      abTestConfigId: "ab-provider-1",
      abTestDimension: "provider_choice",
      abTestVariant: "A",
      provider: "runway",
      outcome: "success",
      approvalRate: 1,
      completionRate: 1,
      costEfficiency: 1.6,
    }),
    buildLearningRecordFixture({
      learningRecordId: "ab-b1",
      sourceId: "ab-b1",
      abTestConfigId: "ab-provider-1",
      abTestDimension: "provider_choice",
      abTestVariant: "B",
      provider: "kling",
      outcome: "rejected",
      approvalRate: 0,
      completionRate: 0,
      costEfficiency: 0.2,
    }),
    buildLearningRecordFixture({
      learningRecordId: "ab-b2",
      sourceId: "ab-b2",
      abTestConfigId: "ab-provider-1",
      abTestDimension: "provider_choice",
      abTestVariant: "B",
      provider: "kling",
      outcome: "rejected",
      approvalRate: 0,
      completionRate: 0,
      costEfficiency: 0.2,
    }),
  ];

  const insights = buildABLearningInsightsFromRecords(records);

  assert.equal(insights[0]?.configId, "ab-provider-1");
  assert.equal(insights[0]?.winnerVariant, "A");
  assert.equal(insights[0]?.recommendation, "promote_winner");
});
