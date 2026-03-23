import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFactoryComparisonRecord,
  maybeBuildFactoryComparisonRecord,
  updateFactoryComparisonDecision,
  updateFactoryComparisonRecordForRenderJob,
} from "../lib/video-factory-comparisons";

const baselineRenderJob = {
  id: "render-job-1",
  provider: "runway" as const,
  renderVersion: "phase-c-render-v1",
  productionDefaultsSnapshot: {
    id: "prod-default:teacher-real-core",
    profileId: "prod-default:teacher-real-core",
    version: 1,
    changedAt: "2026-03-22T00:00:00.000Z",
    changedSource: "system-bootstrap",
    changeNote: null,
    name: "Teacher-Real Core",
    isActive: true,
    voiceProvider: "elevenlabs" as const,
    voiceId: "teacher-real-core-v1",
    voiceSettings: {
      stability: 0.48,
      similarityBoost: 0.72,
      style: 0.14,
      speakerBoost: true,
    },
    styleAnchorPrompt: "Teacher-real anchor prompt.",
    motionStyle: "Quiet cuts.",
    negativeConstraints: ["No hype"],
    aspectRatio: "9:16" as const,
    resolution: "1080p" as const,
    captionStyle: {
      preset: "teacher-real-clean",
      placement: "lower-third" as const,
      casing: "sentence" as const,
    },
    compositionDefaults: {
      transitionStyle: "gentle-cut",
      musicMode: "none" as const,
    },
    reviewDefaults: {
      requireCaptionCheck: true,
    },
    providerFallbacks: {
      narration: ["elevenlabs"],
      visuals: ["runway-gen4", "kling-2"],
      captions: ["local-default"],
      composition: ["local-default"],
    },
    updatedAt: "2026-03-22T00:00:00.000Z",
  },
  compiledProductionPlan: null,
};

test("buildFactoryComparisonRecord captures provider/defaults/voice differences", () => {
  const record = buildFactoryComparisonRecord({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    baselineAttemptNumber: 1,
    baselineRenderJob,
    baselineFactoryJobId: "factory-job-1",
    baselineOutcome: "accepted",
    comparisonAttemptNumber: 2,
    comparisonRenderJob: {
      ...baselineRenderJob,
      id: "render-job-2",
      provider: "mock" as const,
      renderVersion: "phase-c-render-v1:attempt-2",
      productionDefaultsSnapshot: {
        ...baselineRenderJob.productionDefaultsSnapshot,
        id: "prod-default:teacher-real-alt",
        profileId: "prod-default:teacher-real-alt",
        version: 2,
        changedAt: "2026-03-23T00:00:00.000Z",
        changedSource: "operator:test",
        changeNote: "Alternative defaults profile for comparison.",
        voiceId: "teacher-real-core-v2",
        updatedAt: "2026-03-23T00:00:00.000Z",
      },
    },
    comparisonFactoryJobId: "factory-job-2",
    includeRegenerate: true,
    createdAt: "2026-03-23T10:00:00.000Z",
  });

  assert.deepEqual(record.whatChanged, [
    "regenerate",
    "provider_change",
    "defaults_change",
    "voice_change",
  ]);
  assert.equal(record.providerDifference?.baseline, "runway");
  assert.equal(record.providerDifference?.comparison, "mock");
  assert.equal(record.defaultsDifference?.baselineProfileId, "prod-default:teacher-real-core");
  assert.equal(record.defaultsDifference?.comparisonProfileId, "prod-default:teacher-real-alt");
  assert.equal(record.voiceDifference?.baselineVoiceId, "teacher-real-core-v1");
  assert.equal(record.voiceDifference?.comparisonVoiceId, "teacher-real-core-v2");
});

test("updateFactoryComparisonRecordForRenderJob hydrates defaults and voice data after compile", () => {
  const initial = maybeBuildFactoryComparisonRecord({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    includeRegenerate: true,
    baselineAttemptNumber: 1,
    baselineRenderJob,
    baselineFactoryJobId: "factory-job-1",
    baselineOutcome: "accepted",
    comparisonAttemptNumber: 2,
    comparisonRenderJob: {
      id: "render-job-2",
      provider: "runway" as const,
      renderVersion: "phase-c-render-v1:attempt-2",
      productionDefaultsSnapshot: null,
      compiledProductionPlan: null,
    },
    comparisonFactoryJobId: "factory-job-2",
    createdAt: "2026-03-23T10:00:00.000Z",
  });

  assert.ok(initial);
  assert.deepEqual(initial?.whatChanged, ["regenerate"]);

  const updated = updateFactoryComparisonRecordForRenderJob([initial!], {
    comparisonRenderJob: {
      id: "render-job-2",
      provider: "runway",
      renderVersion: "phase-c-render-v1:attempt-2",
      productionDefaultsSnapshot: {
        ...baselineRenderJob.productionDefaultsSnapshot,
        voiceId: "teacher-real-core-v2",
      },
      compiledProductionPlan: null,
    },
    comparisonFactoryJobId: "factory-job-2",
    comparisonOutcome: "review_pending",
    updatedAt: "2026-03-23T10:01:00.000Z",
  });

  assert.deepEqual(updated[0]?.whatChanged, ["regenerate", "voice_change"]);
  assert.equal(updated[0]?.comparisonAttempt.voiceId, "teacher-real-core-v2");
  assert.equal(updated[0]?.comparisonAttempt.terminalOutcome, "review_pending");
});

test("updateFactoryComparisonDecision records the winner and decision basis", () => {
  const record = buildFactoryComparisonRecord({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    baselineAttemptNumber: 1,
    baselineRenderJob,
    baselineFactoryJobId: "factory-job-1",
    baselineOutcome: "accepted",
    comparisonAttemptNumber: 2,
    comparisonRenderJob: {
      ...baselineRenderJob,
      id: "render-job-2",
      provider: "runway" as const,
      renderVersion: "phase-c-render-v1:attempt-2",
    },
    comparisonFactoryJobId: "factory-job-2",
    includeRegenerate: true,
    createdAt: "2026-03-23T10:00:00.000Z",
  });

  const updated = updateFactoryComparisonDecision([record], {
    comparisonRenderJobId: "render-job-2",
    outcome: "rejected",
    structuredReasons: ["weak_hook", "not_publish_ready"],
    notes: "Baseline remains stronger.",
    updatedAt: "2026-03-23T10:05:00.000Z",
  });

  assert.equal(updated[0]?.winner, "baseline");
  assert.equal(updated[0]?.decisionBasis?.outcome, "rejected");
  assert.deepEqual(updated[0]?.decisionBasis?.structuredReasons, [
    "weak_hook",
    "not_publish_ready",
  ]);
  assert.equal(updated[0]?.decisionBasis?.notes, "Baseline remains stronger.");
});
