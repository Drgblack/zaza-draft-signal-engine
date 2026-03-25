import assert from "node:assert/strict";
import test from "node:test";

import type {
  ContentOpportunity,
  ContentOpportunityState,
} from "../lib/content-opportunities";
import type { BatchRenderJob } from "../lib/factory-batch-control";
import { executeBatchRenderJob } from "../lib/batch-render-engine";
import { buildLearningSnapshotFromRecords } from "../lib/learning-loop";
import { buildPhaseEOperationsSnapshot } from "../lib/phase-e-operations";

function buildOpportunityFixture(input: {
  id: string;
  status?: ContentOpportunity["status"];
  founderSelectionStatus?: ContentOpportunity["founderSelectionStatus"];
  selectedVideoBrief?: ContentOpportunity["selectedVideoBrief"];
}): ContentOpportunity {
  return {
    opportunityId: input.id,
    signalId: `${input.id}:signal`,
    title: `Opportunity ${input.id}`,
    opportunityType: "pain_point_opportunity",
    status: input.status ?? "approved_for_production",
    priority: "high",
    source: {
      signalId: `${input.id}:signal`,
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "Teachers second-guess parent messaging.",
    painPointCategory: "parent-communication",
    teacherLanguage: ["I keep rewriting the message before sending it."],
    recommendedAngle: "Calm, teacher-real guidance",
    recommendedHookDirection: "empathetic",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "The pattern is surfacing this week.",
    commercialPotential: "high",
    trustRisk: "low",
    riskSummary: null,
    confidence: 0.82,
    historicalCostAvg: 1.15,
    historicalApprovalRate: 0.72,
    suggestedNextStep: "Generate a video.",
    skipReason: null,
    hookOptions: ["Before you send that reply..."],
    hookRanking: [{ hook: "Before you send that reply...", score: 19 }],
    performanceDrivers: {
      hookStrength: 4,
      stakes: 4,
      authenticityFit: 4,
    },
    intendedViewerEffect: "Reduce hesitation before parent replies.",
    suggestedCTA: "Try Zaza Draft",
    productionComplexity: "low",
    growthIntelligence: {
      executionPath: "video_factory",
      executionPriority: 78,
      strategicValue: 74,
      learningValue: 61,
      riskLevel: "low",
      expectedOutcome: "Teacher trials",
    },
    supportingSignals: [],
    memoryContext: {
      bestCombo: null,
      weakCombo: null,
      revenuePattern: null,
      audienceCue: "Teachers managing parent replies",
      caution: null,
    },
    sourceSignalIds: [`${input.id}:signal`],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:05:00.000Z",
    approvedAt:
      (input.status ?? "approved_for_production") === "approved_for_production"
        ? "2026-03-24T09:04:00.000Z"
        : null,
    dismissedAt: null,
    messageAngles: [],
    hookSets: [],
    founderSelectionStatus: input.founderSelectionStatus ?? "approved",
    selectedAngleId: "angle-1",
    selectedHookId: "hook-1",
    selectedVideoBrief:
      input.selectedVideoBrief ?? {
        id: `${input.id}:brief`,
        opportunityId: input.id,
        angleId: "angle-1",
        hookSetId: "hook-set-1",
        title: `Brief ${input.id}`,
        hook: "Before you send that reply...",
        format: "talking-head",
        durationSec: 30,
        goal: "Drive trials",
        tone: "teacher-real",
        structure: [],
        visualDirection: "Direct-to-camera portrait.",
        overlayLines: [],
        cta: "Try Zaza Draft",
        contentType: "validation",
        finalScriptTrustScore: 91,
        productionNotes: ["No hype"],
      },
    generationState: null,
    operatorNotes: null,
  };
}

test("Phase E operations snapshot reflects batch execution and learning loop state", async () => {
  let currentState: ContentOpportunityState = {
    generatedAt: "2026-03-24T09:00:00.000Z",
    openCount: 1,
    approvedCount: 0,
    dismissedCount: 0,
    topSummary: [],
    opportunities: [
      buildOpportunityFixture({
        id: "opp-open",
        status: "open",
        founderSelectionStatus: "pending",
        selectedVideoBrief: null,
      }),
    ],
  };
  const persistedBatches = new Map<string, BatchRenderJob>();

  const batchResult = await executeBatchRenderJob(
    {
      batchId: "batch-ops-1",
      targetCount: 1,
      priorityStrategy: "mixed",
      maxCost: 10,
      autoApproveConfigId: "cfg-1",
    },
    {
      listContentOpportunityState: async () => currentState,
      autoApproveContentOpportunity: async ({ opportunityId }) => {
        currentState = {
          ...currentState,
          openCount: 0,
          approvedCount: 1,
          opportunities: [buildOpportunityFixture({ id: opportunityId })],
        };
        return currentState;
      },
      generateContentOpportunityVideo: async ({ opportunityId }) => ({
        state: currentState,
        jobId: `${opportunityId}:render-job`,
        estimatedCostUsd: 1.2,
        regenerationCount: 0,
        budgetRemaining: 2,
        budgetExhausted: false,
      }),
      scheduleVideoFactoryRun: async () => true,
      getAutoApproveConfig: () => ({
        configId: "cfg-1",
        name: "Batch Auto Approve",
        status: "active",
        enabled: true,
        confidenceThreshold: 70,
        requiresTrustPass: false,
        maxPerDay: 10,
        mandatoryReviewEveryN: 99,
        changedAt: "2026-03-24T09:00:00.000Z",
        changedSource: "test",
        changeNote: null,
      }),
      getActiveAutoApproveConfig: () => null,
      getBatchRenderJob: (batchId) => persistedBatches.get(batchId) ?? null,
      upsertBatchRenderJob: async (batch) => {
        persistedBatches.set(batch.batchId, batch);
        return batch;
      },
    },
  );

  const learningSnapshot = buildLearningSnapshotFromRecords([
    {
      learningRecordId: "ops-1",
      inputSignature: "video_factory|provider:runway|format:short_video",
      outcome: "success",
      retries: 0,
      cost: 1.1,
      timestamp: "2026-03-24T10:00:00.000Z",
      inputType: "video_factory",
      stage: "generation",
      actionType: "auto_run_video_factory",
      sourceId: "ops-1",
      platform: "linkedin",
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
      provider: "runway",
      executionPath: "video_factory",
      completionRate: 1,
      costEfficiency: 1.8,
    },
    {
      learningRecordId: "ops-2",
      inputSignature: "video_factory|provider:runway|format:short_video",
      outcome: "success",
      retries: 0,
      cost: 1.1,
      timestamp: "2026-03-24T10:05:00.000Z",
      inputType: "video_factory",
      stage: "operator_review",
      actionType: "auto_run_video_factory",
      sourceId: "ops-2",
      platform: "linkedin",
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
      provider: "runway",
      executionPath: "video_factory",
      approvalRate: 1,
      costEfficiency: 1.8,
    },
    {
      learningRecordId: "ops-3",
      inputSignature: "video_factory|provider:runway|format:short_video",
      outcome: "success",
      retries: 0,
      cost: 0,
      timestamp: "2026-03-24T10:10:00.000Z",
      inputType: "video_factory",
      stage: "engagement",
      actionType: "publish_outcome",
      sourceId: "ops-3",
      platform: "linkedin",
      format: "short_video",
      hookType: "risk_warning",
      ctaType: "product",
      provider: "runway",
      executionPath: "video_factory",
      impressions: 1200,
      clicks: 72,
      signups: 9,
      ctr: 0.06,
      engagementProxy: 57,
      completionRate: 1,
      costEfficiency: 57,
    },
  ]);

  const snapshot = await buildPhaseEOperationsSnapshot({
    contentOpportunityRepository: {
      getState: async () => currentState,
      listOpportunities: async () => currentState.opportunities,
      getOpportunity: async (opportunityId) =>
        currentState.opportunities.find((item) => item.opportunityId === opportunityId) ?? null,
      saveState: async () => currentState,
    },
    learningRepository: {
      listRecords: async () => [],
      getLatestSnapshot: async () => learningSnapshot,
      listSnapshots: async () => [learningSnapshot],
    },
    batchRepository: {
      listBatches: async () => [batchResult.batch],
      getBatch: async () => batchResult.batch,
      saveBatch: async (batch) => batch,
      listMixTargets: async () => [],
      listAutoApproveConfigs: async () => [],
    },
    publishOutcomeRepository: {
      getByRenderedAssetId: async () => null,
      listByOpportunity: async () => [
        {
          publishOutcomeId: "publish-1",
          opportunityId: "opp-open",
          videoBriefId: "opp-open:brief",
          factoryJobId: "opp-open:factory-job",
          renderJobId: "opp-open:render-job",
          renderedAssetId: "opp-open:asset",
          assetReviewId: "opp-open:review",
          published: true,
          platform: "linkedin",
          publishDate: "2026-03-24",
          publishedUrl: null,
          impressions: 1200,
          clicks: 72,
          signups: 9,
          notes: null,
          attributionSource: "manual_operator",
          createdAt: "2026-03-24T10:10:00.000Z",
          lastUpdatedAt: "2026-03-24T10:10:00.000Z",
        },
      ],
      save: async (input) => ({
        publishOutcomeId: "publish-1",
        opportunityId: input.opportunityId,
        videoBriefId: input.videoBriefId,
        factoryJobId: input.factoryJobId ?? null,
        renderJobId: input.renderJobId,
        renderedAssetId: input.renderedAssetId,
        assetReviewId: input.assetReviewId ?? null,
        published: input.published,
        platform: input.platform ?? null,
        publishDate: input.publishDate ?? null,
        publishedUrl: input.publishedUrl ?? null,
        impressions: input.impressions ?? null,
        clicks: input.clicks ?? null,
        signups: input.signups ?? null,
        notes: input.notes ?? null,
        attributionSource: input.attributionSource ?? null,
        createdAt: "2026-03-24T10:10:00.000Z",
        lastUpdatedAt: "2026-03-24T10:10:00.000Z",
      }),
    },
    getQueueStateSummary: async () => ({
      updatedAt: "2026-03-24T10:00:00.000Z",
      queuedCount: 1,
      runningCount: 0,
      completedCount: 0,
      failedCount: 0,
      activeCount: 1,
      maxConcurrentRuns: 2,
    }),
    listFactoryRunsObservability: async () => ({
      generatedAt: "2026-03-24T10:00:00.000Z",
      lookbackDays: 30,
      runCount: 1,
      activeCount: 0,
      failedCount: 0,
      pendingReviewCount: 1,
      items: [
        {
          id: "run-1",
          opportunityId: "opp-open",
          opportunityTitle: "Opportunity opp-open",
          briefTitle: "Brief opp-open",
          videoBriefId: "opp-open:brief",
          attemptNumber: 1,
          format: "talking-head",
          factoryJobId: "opp-open:factory-job",
          renderJobId: "opp-open:render-job",
          batchId: "batch-ops-1",
          renderVersion: "phase-c-render-v1",
          lifecycleStatus: "review_pending",
          terminalOutcome: "review_pending",
          isActive: false,
          providerSet: {
            renderProvider: "runway",
            narrationProvider: "elevenlabs",
            visualProviders: ["runway-gen4"],
            captionProvider: "local-default",
            compositionProvider: "ffmpeg",
          },
          defaultsProfileId: "prod-default:teacher-real-core",
          defaultsVersion: 1,
          abTestConfigId: null,
          abTestDimension: null,
          abTestVariant: null,
          trustStatus: "safe",
          trustAdjusted: false,
          finalScriptTrustScore: 91,
          retryCount: 0,
          retryExhausted: false,
          qcSummary: {
            passed: true,
            sceneCount: 3,
            captionsPresent: true,
          },
          createdAt: "2026-03-24T09:10:00.000Z",
          updatedAt: "2026-03-24T09:11:00.000Z",
          timeline: [
            { status: "queued", at: "2026-03-24T09:10:00.000Z" },
            { status: "review_pending", at: "2026-03-24T09:11:00.000Z" },
          ],
          failureStage: null,
          failureMessage: null,
          artifactSummary: {
            artifactCount: 3,
            hasRenderedAsset: true,
            hasNarration: true,
            visualAssetCount: 1,
            hasCaptions: true,
            hasComposedVideo: true,
            hasThumbnail: false,
          },
          estimatedCostUsd: 1.2,
          actualCostUsd: 1.1,
          reviewOutcome: {
            status: "pending_review",
            reviewedAt: null,
            reasonCodes: [],
            notes: null,
          },
        },
      ],
    }),
  });

  assert.equal(snapshot.opportunities.approvedCount, 1);
  assert.equal(snapshot.batches.total, 1);
  assert.equal(snapshot.queue.queuedCount, 1);
  assert.equal(snapshot.learning.latestSnapshot?.recordCount, 3);
  assert.equal(snapshot.publishOutcomes.recordedCount, 1);
});
