import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoFactoryEvalSnapshot,
  evaluateVideoFactoryEvalCase,
  VIDEO_FACTORY_GOLDEN_SET,
} from "../lib/video-factory-evals";

test("golden set stays lightweight and representative", () => {
  assert.equal(VIDEO_FACTORY_GOLDEN_SET.length >= 3, true);
  assert.equal(VIDEO_FACTORY_GOLDEN_SET.length <= 5, true);
  assert.equal(
    VIDEO_FACTORY_GOLDEN_SET.every(
      (item) => item.brief && item.compiledPlan && item.renderOutcomeSummary,
    ),
    true,
  );
});

test("evaluateVideoFactoryEvalCase passes the seeded accepted baseline", () => {
  const evalCase = VIDEO_FACTORY_GOLDEN_SET.find(
    (item) => item.id === "accepted-render-baseline",
  );
  assert.ok(evalCase);

  const result = evaluateVideoFactoryEvalCase({
    evalCase,
    currentOutput: evalCase.renderOutcomeSummary,
  });

  assert.equal(result.passed, true);
  assert.equal(result.failedChecks, 0);
});

test("evaluateVideoFactoryEvalCase fails when review state becomes incoherent", () => {
  const evalCase = VIDEO_FACTORY_GOLDEN_SET.find(
    (item) => item.id === "accepted-render-baseline",
  );
  assert.ok(evalCase);

  const result = evaluateVideoFactoryEvalCase({
    evalCase,
    currentOutput: {
      ...evalCase.renderOutcomeSummary,
      reviewStatus: "pending_review",
    },
  });

  assert.equal(result.passed, false);
  assert.equal(
    result.checks.some(
      (check) => check.key === "review_state" && check.passed === false,
    ),
    true,
  );
});

test("buildVideoFactoryEvalSnapshot extracts structural metadata from runtime-shaped objects", () => {
  const evalCase = VIDEO_FACTORY_GOLDEN_SET.find(
    (item) => item.id === "review-pending-structural-baseline",
  );
  assert.ok(evalCase);

  const snapshot = buildVideoFactoryEvalSnapshot({
    lifecycle: {
      factoryJobId: "factory-job-1",
      videoBriefId: evalCase.brief.id,
      provider: "runway",
      renderVersion: "phase-c-render-v1",
      status: "review_pending",
      draftAt: "2026-03-23T10:00:00.000Z",
      queuedAt: "2026-03-23T10:00:05.000Z",
      retryQueuedAt: null,
      preparingAt: "2026-03-23T10:00:10.000Z",
      generatingNarrationAt: "2026-03-23T10:00:15.000Z",
      generatingVisualsAt: "2026-03-23T10:00:20.000Z",
      generatingCaptionsAt: "2026-03-23T10:00:25.000Z",
      composingAt: "2026-03-23T10:00:30.000Z",
      generatedAt: "2026-03-23T10:00:35.000Z",
      reviewPendingAt: "2026-03-23T10:00:40.000Z",
      acceptedAt: null,
      rejectedAt: null,
      discardedAt: null,
      failedAt: null,
      failedPermanentAt: null,
      lastUpdatedAt: "2026-03-23T10:00:40.000Z",
      failureStage: null,
      failureMessage: null,
      retryState: null,
    },
    renderJob: {
      id: "render-job-1",
      generationRequestId: "generation-request-1",
      idempotencyKey: "video-factory:opportunity-1",
      provider: "runway",
      renderVersion: "phase-c-render-v1",
      compiledProductionPlan: evalCase.compiledPlan,
      productionDefaultsSnapshot: evalCase.compiledPlan.defaultsSnapshot,
      providerJobId: "provider-job-1",
      preTriageConcern: null,
      regenerationReason: null,
      regenerationReasonCodes: [],
      regenerationNotes: null,
      costEstimate: null,
      actualCost: null,
      budgetGuard: null,
      qualityCheck: {
        passed: true,
        hasAudio: true,
        durationSeconds: 30,
        expectedDuration: 30,
        durationInRange: true,
        captionsPresent: true,
        sceneCount: 4,
        failures: [],
        checkedAt: "2026-03-23T10:00:39.000Z",
      },
      retryState: null,
      status: "completed",
      submittedAt: "2026-03-23T10:00:05.000Z",
      completedAt: "2026-03-23T10:00:39.000Z",
      errorMessage: null,
    },
    renderedAsset: {
      id: "rendered-asset-1",
      renderJobId: "render-job-1",
      assetType: "video",
      url: "https://example.com/video.mp4",
      thumbnailUrl: "https://example.com/video.jpg",
      durationSec: 30,
      createdAt: "2026-03-23T10:00:40.000Z",
    },
    assetReview: {
      id: "review-1",
      renderedAssetId: "rendered-asset-1",
      status: "pending_review",
      reviewedAt: null,
      structuredReasons: [],
      reviewNotes: null,
      rejectionReason: null,
    },
    runLedgerEntry: {
      ledgerEntryId: "ledger-1",
      factoryJobId: "factory-job-1",
      opportunityId: evalCase.brief.opportunityId,
      videoBriefId: evalCase.brief.id,
      attemptNumber: 1,
      generationRequestId: "generation-request-1",
      renderJobId: "render-job-1",
      renderedAssetId: "rendered-asset-1",
      providerSet: {
        renderProvider: "runway",
        narrationProvider: "elevenlabs",
        visualProviders: ["runway-gen4"],
        captionProvider: "assemblyai",
        compositionProvider: "ffmpeg",
      },
      lifecycleTransitions: [
        { status: "queued", at: "2026-03-23T10:00:05.000Z" },
        { status: "review_pending", at: "2026-03-23T10:00:40.000Z" },
      ],
      artifactIds: [
        "narration-1",
        "scene-1",
        "caption-1",
        "rendered-asset-1",
      ],
      estimatedCost: null,
      actualCost: null,
      budgetGuard: null,
      qualityCheck: null,
      retryState: null,
      regenerationReasonCodes: [],
      regenerationNotes: null,
      decisionStructuredReasons: [],
      decisionNotes: null,
      autonomyPolicyReason: null,
      autonomyPolicyRiskLevel: null,
      growthExecutionPath: "video_factory",
      growthExecutionPriority: 82,
      growthRiskLevel: "low",
      growthReasoning: "High priority with content-ready input.",
      terminalOutcome: "review_pending",
      finalScriptTrustScore: null,
      finalScriptTrustStatus: null,
      lastUpdatedAt: "2026-03-23T10:00:40.000Z",
      failureStage: null,
      failureMessage: null,
    },
  });

  assert.equal(snapshot.lifecycleStatus, "review_pending");
  assert.equal(snapshot.terminalOutcome, "review_pending");
  assert.equal(snapshot.hasCompiledPlan, true);
  assert.equal(snapshot.hasRenderedAsset, true);
  assert.equal(snapshot.reviewStatus, "pending_review");
  assert.equal(snapshot.voiceProvider, "elevenlabs");
  assert.deepEqual(snapshot.visualProviderIds, ["runway-gen4"]);
});
