import assert from "node:assert/strict";
import test from "node:test";

import type { ContentOpportunity, ContentOpportunityState } from "../lib/content-opportunities";
import {
  buildContentMixTarget,
  type AutoApproveConfig,
  type BatchRenderJob,
} from "../lib/factory-batch-control";
import {
  executeBatchRenderJob,
  refreshBatchRenderJobTracking,
  selectBatchOpportunities,
} from "../lib/batch-render-engine";

function buildOpportunityFixture(input: {
  id: string;
  status?: ContentOpportunity["status"];
  founderSelectionStatus?: ContentOpportunity["founderSelectionStatus"];
  confidence?: number;
  recommendedFormat?: ContentOpportunity["recommendedFormat"];
  opportunityType?: ContentOpportunity["opportunityType"];
  platforms?: ContentOpportunity["recommendedPlatforms"];
  painPointCategory?: string;
  suggestedCTA?: string;
  contentType?: NonNullable<ContentOpportunity["selectedVideoBrief"]>["contentType"];
  hook?: string;
  selectedVideoBrief?: ContentOpportunity["selectedVideoBrief"];
  generationState?: ContentOpportunity["generationState"];
}) : ContentOpportunity {
  return {
    opportunityId: input.id,
    signalId: `${input.id}:signal`,
    title: `Opportunity ${input.id}`,
    opportunityType: input.opportunityType ?? "pain_point_opportunity",
    status: input.status ?? "approved_for_production",
    priority: "high",
    source: {
      signalId: `${input.id}:signal`,
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "Teachers second-guess parent messaging.",
    painPointCategory: input.painPointCategory ?? "parent-communication",
    teacherLanguage: ["I keep rewriting the message before sending it."],
    recommendedAngle: "Calm, teacher-real guidance",
    recommendedHookDirection: "empathetic",
    recommendedFormat: input.recommendedFormat ?? "short_video",
    recommendedPlatforms: input.platforms ?? ["linkedin"],
    whyNow: "The pattern is surfacing this week.",
    commercialPotential: "high",
    trustRisk: "low",
    riskSummary: null,
    confidence: input.confidence ?? 0.82,
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
    suggestedCTA: input.suggestedCTA ?? "Try Zaza Draft",
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
    selectedAngleId:
      (input.status ?? "approved_for_production") === "approved_for_production"
        ? "angle-1"
        : null,
    selectedHookId:
      (input.status ?? "approved_for_production") === "approved_for_production"
        ? "hook-1"
        : null,
    selectedVideoBrief:
      input.selectedVideoBrief ??
      ((input.status ?? "approved_for_production") === "approved_for_production"
        ? {
            id: `${input.id}:brief`,
            opportunityId: input.id,
            angleId: "angle-1",
            hookSetId: "hook-set-1",
            title: `Brief ${input.id}`,
            hook: input.hook ?? "Before you send that reply...",
            format: "talking-head",
            durationSec: 30,
            goal: "Drive trials",
            tone: "teacher-real",
            structure: [
              { order: 1, purpose: "hook", guidance: "Name the risk." },
              { order: 2, purpose: "recognition", guidance: "Reflect the pressure." },
              { order: 3, purpose: "cta", guidance: "Offer a safer next step." },
            ],
            visualDirection: "Direct-to-camera portrait.",
            overlayLines: ["Pause before sending", "Protect tone"],
            cta: input.suggestedCTA ?? "Try Zaza Draft",
            contentType: input.contentType ?? "validation",
            finalScriptTrustScore: 91,
            productionNotes: ["No hype"],
          }
        : null),
    generationState: input.generationState ?? null,
    operatorNotes: null,
  };
}

function buildOpenOpportunityFixture(id: string) {
  return buildOpportunityFixture({
    id,
    status: "open",
    founderSelectionStatus: "pending",
    selectedVideoBrief: null,
  });
}

function buildAutoApproveConfig(id: string): AutoApproveConfig {
  return {
    configId: id,
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
  };
}

test("selectBatchOpportunities balances score, diversity, and exploration", () => {
  const opportunities = [
    buildOpportunityFixture({
      id: "opp-1",
      confidence: 0.95,
      recommendedFormat: "short_video",
      opportunityType: "pain_point_opportunity",
      platforms: ["linkedin"],
    }),
    buildOpportunityFixture({
      id: "opp-2",
      confidence: 0.9,
      recommendedFormat: "short_video",
      opportunityType: "pain_point_opportunity",
      platforms: ["linkedin"],
    }),
    buildOpportunityFixture({
      id: "opp-3",
      confidence: 0.58,
      recommendedFormat: "carousel",
      opportunityType: "audience_opportunity",
      platforms: ["x", "reddit"],
    }),
    buildOpportunityFixture({
      id: "opp-4",
      confidence: 0.76,
      recommendedFormat: "multi_asset",
      opportunityType: "commercial_opportunity",
      platforms: ["linkedin", "x"],
    }),
  ];

  const selection = selectBatchOpportunities({
    opportunities,
    config: {
      batchId: "batch-select-1",
      targetCount: 3,
      priorityStrategy: "exploration",
      maxCost: 10,
    },
  });

  assert.equal(selection.selected.length, 3);
  assert.equal(
    selection.selected.some((item) => item.opportunity.opportunityId === "opp-3"),
    true,
  );
  assert.equal(
    new Set(selection.selected.map((item) => item.opportunity.recommendedFormat)).size >= 2,
    true,
  );
});

test("selectBatchOpportunities respects linked content mix targets while preserving strong candidates", () => {
  const opportunities = [
    buildOpportunityFixture({
      id: "opp-risk-1",
      recommendedFormat: "short_video",
      painPointCategory: "behavior-management",
      suggestedCTA: "Try Zaza Draft",
      contentType: "pain",
      hook: "Before you send that escalation...",
    }),
    buildOpportunityFixture({
      id: "opp-risk-2",
      recommendedFormat: "short_video",
      painPointCategory: "behavior-management",
      suggestedCTA: "Try Zaza Draft",
      contentType: "pain",
      hook: "This could go wrong fast",
    }),
    buildOpportunityFixture({
      id: "opp-relief",
      recommendedFormat: "carousel",
      painPointCategory: "teacher-workload",
      suggestedCTA: "Share this with a colleague",
      contentType: "validation",
      hook: "A calmer way to handle this",
      confidence: 0.72,
    }),
    buildOpportunityFixture({
      id: "opp-insight",
      recommendedFormat: "multi_asset",
      painPointCategory: "assessment-feedback",
      suggestedCTA: "Learn more",
      contentType: "solution",
      hook: "What this really shows",
      confidence: 0.7,
    }),
  ];
  const contentMixTarget = buildContentMixTarget({
    targetId: "mix-batch-1",
    name: "Risk relief insight balance",
    targets: {
      hookType: {
        risk: 0.4,
        relief: 0.3,
        insight: 0.3,
      },
      painPoint: {
        "behavior-management": 0.34,
        "teacher-workload": 0.33,
        "assessment-feedback": 0.33,
      },
      cta: {
        product: 0.34,
        engagement: 0.33,
        visit: 0.33,
      },
    },
    opportunities: [],
  });

  const selection = selectBatchOpportunities({
    opportunities,
    config: {
      batchId: "batch-mix-1",
      targetCount: 3,
      priorityStrategy: "mixed",
      maxCost: 10,
      executionPolicy: {
        contentMixTargetId: contentMixTarget.targetId,
      },
    },
    contentMixTarget,
  });

  const selectedIds = new Set(
    selection.selected.map((item) => item.opportunity.opportunityId),
  );
  assert.equal(selectedIds.has("opp-risk-1") || selectedIds.has("opp-risk-2"), true);
  assert.equal(selectedIds.has("opp-relief"), true);
  assert.equal(selectedIds.has("opp-insight"), true);
});

test("selectBatchOpportunities applies learning bias toward proven patterns", () => {
  const opportunities = [
    buildOpportunityFixture({
      id: "opp-proven",
      recommendedFormat: "short_video",
      suggestedCTA: "Try Zaza Draft",
      hook: "Before you send that escalation...",
      confidence: 0.7,
    }),
    buildOpportunityFixture({
      id: "opp-weak",
      recommendedFormat: "carousel",
      suggestedCTA: "Share this with a colleague",
      hook: "A calmer way to handle this",
      confidence: 0.92,
    }),
  ];

  const selection = selectBatchOpportunities({
    opportunities,
    config: {
      batchId: "batch-learning-1",
      targetCount: 1,
      priorityStrategy: "high_score",
      maxCost: 10,
    },
    learningBiasResolver: ({ format, hookType, ctaType }) => {
      if (
        format === "short_video" &&
        hookType === "risk" &&
        ctaType === "product"
      ) {
        return {
          sampleSize: 8,
          scoreDelta: 15,
          reason: "Proven recent winner.",
        };
      }

      return {
        sampleSize: 8,
        scoreDelta: -12,
        reason: "Recent underperformer.",
      };
    },
  });

  assert.equal(selection.selected[0]?.opportunity.opportunityId, "opp-proven");
});

test("executeBatchRenderJob auto-approves eligible opportunities and persists queued batch tracking", async () => {
  let currentState: ContentOpportunityState = {
    generatedAt: "2026-03-24T09:00:00.000Z",
    openCount: 1,
    approvedCount: 1,
    dismissedCount: 0,
    topSummary: [],
    opportunities: [
      buildOpenOpportunityFixture("opp-open"),
      buildOpportunityFixture({ id: "opp-approved" }),
    ],
  };
  const persistedBatches = new Map<string, BatchRenderJob>();
  const autoApproveConfig = buildAutoApproveConfig("cfg-batch");

  const result = await executeBatchRenderJob(
    {
      batchId: "batch-exec-1",
      targetCount: 2,
      priorityStrategy: "mixed",
      maxCost: 10,
      autoApproveConfigId: autoApproveConfig.configId,
    },
    {
      listContentOpportunityState: async () => currentState,
      autoApproveContentOpportunity: async ({ opportunityId }) => {
        currentState = {
          ...currentState,
          openCount: 0,
          approvedCount: 2,
          opportunities: currentState.opportunities.map((opportunity) =>
            opportunity.opportunityId === opportunityId
              ? buildOpportunityFixture({ id: opportunityId })
              : opportunity,
          ),
        };
        return currentState;
      },
      generateContentOpportunityVideo: async ({ opportunityId }) => {
        currentState = {
          ...currentState,
          opportunities: currentState.opportunities.map((opportunity) =>
            opportunity.opportunityId === opportunityId
              ? {
                  ...opportunity,
                  generationState: {
                    videoBriefApprovedAt: "2026-03-24T09:10:00.000Z",
                    videoBriefApprovedBy: "batch-engine",
                    factoryLifecycle: {
                      factoryJobId: `${opportunityId}:factory-job`,
                      videoBriefId: `${opportunityId}:brief`,
                      provider: "mock",
                      renderVersion: "phase-c-render-v1",
                      status: "queued",
                      draftAt: "2026-03-24T09:10:00.000Z",
                      queuedAt: "2026-03-24T09:10:00.000Z",
                      retryQueuedAt: null,
                      preparingAt: null,
                      generatingNarrationAt: null,
                      generatingVisualsAt: null,
                      generatingCaptionsAt: null,
                      composingAt: null,
                      generatedAt: null,
                      reviewPendingAt: null,
                      acceptedAt: null,
                      rejectedAt: null,
                      discardedAt: null,
                      failedAt: null,
                      failedPermanentAt: null,
                      lastUpdatedAt: "2026-03-24T09:10:00.000Z",
                      failureStage: null,
                      failureMessage: null,
                      retryState: null,
                    },
                    latestCostEstimate: {
                      estimatedTotalUsd: 1.2,
                      narrationCostUsd: 0.2,
                      visualsCostUsd: 0.8,
                      transcriptionCostUsd: 0.2,
                      compositionCostUsd: 0,
                      providerId: "mock",
                      mode: "quality",
                      estimatedAt: "2026-03-24T09:10:00.000Z",
                    },
                    latestActualCost: null,
                    latestBudgetGuard: null,
                    latestQualityCheck: null,
                    latestRetryState: null,
                    runLedger: [],
                    comparisonRecords: [],
                    attemptLineage: [],
                    narrationSpec: null,
                    videoPrompt: null,
                    generationRequest: {
                      id: `${opportunityId}:request`,
                      opportunityId,
                      videoBriefId: `${opportunityId}:brief`,
                      renderVersion: "phase-c-render-v1",
                      idempotencyKey: `${opportunityId}:idempotency`,
                      narrationSpecId: `${opportunityId}:narration`,
                      videoPromptId: `${opportunityId}:prompt`,
                      approvedAt: "2026-03-24T09:10:00.000Z",
                      approvedBy: "batch-engine",
                      status: "submitted",
                    },
                    renderJob: {
                      id: `${opportunityId}:render-job`,
                      batchId: "batch-exec-1",
                      generationRequestId: `${opportunityId}:request`,
                      idempotencyKey: `${opportunityId}:idempotency`,
                      provider: "mock",
                      renderVersion: "phase-c-render-v1",
                      compiledProductionPlan: null,
                      productionDefaultsSnapshot: null,
                      providerJobId: null,
                      preTriageConcern: null,
                      regenerationReason: null,
                      regenerationReasonCodes: [],
                      regenerationNotes: null,
                      costEstimate: null,
                      actualCost: null,
                      budgetGuard: null,
                      qualityCheck: null,
                      retryState: null,
                      abTest: null,
                      status: "queued",
                      submittedAt: "2026-03-24T09:10:00.000Z",
                      completedAt: null,
                      errorMessage: null,
                    },
                    renderedAsset: null,
                    assetReview: null,
                    performanceSignals: [],
                  } as unknown as ContentOpportunity["generationState"],
                  updatedAt: "2026-03-24T09:10:00.000Z",
                }
              : opportunity,
          ),
        };

        return {
          state: currentState,
          jobId: `${opportunityId}:render-job`,
          estimatedCostUsd: 1.2,
          regenerationCount: 0,
          budgetRemaining: 2,
          budgetExhausted: false,
        };
      },
      scheduleVideoFactoryRun: async () => true,
      getAutoApproveConfig: () => autoApproveConfig,
      getActiveAutoApproveConfig: () => null,
      getBatchRenderJob: (batchId) => persistedBatches.get(batchId) ?? null,
      upsertBatchRenderJob: async (batch) => {
        persistedBatches.set(batch.batchId, batch);
        return batch;
      },
    },
  );

  assert.equal(result.batch.batchId, "batch-exec-1");
  assert.equal(result.batch.resultsSummary.autoApproved, 1);
  assert.equal(result.batch.resultsSummary.queued, 2);
  assert.equal(result.batch.status, "queued");
  assert.equal(persistedBatches.has("batch-exec-1"), true);
});

test("refreshBatchRenderJobTracking rolls a queued batch forward once selected opportunities reach terminal states", async () => {
  const persistedBatch = new Map<string, BatchRenderJob>();
  const batch = {
    ...(
      await executeBatchRenderJob(
        {
          batchId: "batch-refresh-1",
          targetCount: 1,
          priorityStrategy: "high_score",
          maxCost: 5,
          opportunities: [buildOpportunityFixture({ id: "opp-refresh" })],
        },
        {
          listContentOpportunityState: async () => ({
            generatedAt: "2026-03-24T09:00:00.000Z",
            openCount: 0,
            approvedCount: 1,
            dismissedCount: 0,
            topSummary: [],
            opportunities: [buildOpportunityFixture({ id: "opp-refresh" })],
          }),
          autoApproveContentOpportunity: async () => {
            throw new Error("should not auto-approve");
          },
          generateContentOpportunityVideo: async () => ({
            state: {
              generatedAt: "2026-03-24T09:00:00.000Z",
              openCount: 0,
              approvedCount: 1,
              dismissedCount: 0,
              topSummary: [],
              opportunities: [
                buildOpportunityFixture({
                  id: "opp-refresh",
                  generationState: {
                    videoBriefApprovedAt: "2026-03-24T09:10:00.000Z",
                    videoBriefApprovedBy: "batch-engine",
                    factoryLifecycle: {
                      factoryJobId: "opp-refresh:factory-job",
                      videoBriefId: "opp-refresh:brief",
                      provider: "mock",
                      renderVersion: "phase-c-render-v1",
                      status: "queued",
                      draftAt: "2026-03-24T09:10:00.000Z",
                      queuedAt: "2026-03-24T09:10:00.000Z",
                      retryQueuedAt: null,
                      preparingAt: null,
                      generatingNarrationAt: null,
                      generatingVisualsAt: null,
                      generatingCaptionsAt: null,
                      composingAt: null,
                      generatedAt: null,
                      reviewPendingAt: null,
                      acceptedAt: null,
                      rejectedAt: null,
                      discardedAt: null,
                      failedAt: null,
                      failedPermanentAt: null,
                      lastUpdatedAt: "2026-03-24T09:10:00.000Z",
                      failureStage: null,
                      failureMessage: null,
                      retryState: null,
                    },
                    latestCostEstimate: null,
                    latestActualCost: null,
                    latestBudgetGuard: null,
                    latestQualityCheck: null,
                    latestRetryState: null,
                    runLedger: [],
                    comparisonRecords: [],
                    attemptLineage: [],
                    narrationSpec: null,
                    videoPrompt: null,
                    generationRequest: null,
                    renderJob: {
                      id: "opp-refresh:render-job",
                      batchId: "batch-refresh-1",
                      generationRequestId: "opp-refresh:request",
                      idempotencyKey: "opp-refresh:key",
                      provider: "mock",
                      renderVersion: "phase-c-render-v1",
                      compiledProductionPlan: null,
                      productionDefaultsSnapshot: null,
                      providerJobId: null,
                      preTriageConcern: null,
                      regenerationReason: null,
                      regenerationReasonCodes: [],
                      regenerationNotes: null,
                      costEstimate: null,
                      actualCost: null,
                      budgetGuard: null,
                      qualityCheck: null,
                      retryState: null,
                      abTest: null,
                      status: "queued",
                      submittedAt: null,
                      completedAt: null,
                      errorMessage: null,
                    },
                    renderedAsset: null,
                    assetReview: null,
                    performanceSignals: [],
                  } as unknown as ContentOpportunity["generationState"],
                }),
              ],
            },
            jobId: "opp-refresh:render-job",
            estimatedCostUsd: 1.2,
            regenerationCount: 0,
            budgetRemaining: 2,
            budgetExhausted: false,
          }),
          scheduleVideoFactoryRun: async () => true,
          getAutoApproveConfig: () => null,
          getActiveAutoApproveConfig: () => null,
          getBatchRenderJob: (batchId) => persistedBatch.get(batchId) ?? null,
          upsertBatchRenderJob: async (nextBatch) => {
            persistedBatch.set(nextBatch.batchId, nextBatch);
            return nextBatch;
          },
        },
      )
    ).batch,
  };
  persistedBatch.set(batch.batchId, batch);

  const refreshed = await refreshBatchRenderJobTracking("batch-refresh-1", {
    listContentOpportunityState: async () => ({
      generatedAt: "2026-03-24T10:00:00.000Z",
      openCount: 0,
      approvedCount: 1,
      dismissedCount: 0,
      topSummary: [],
      opportunities: [
        buildOpportunityFixture({
          id: "opp-refresh",
          generationState: {
            videoBriefApprovedAt: "2026-03-24T09:10:00.000Z",
            videoBriefApprovedBy: "batch-engine",
            factoryLifecycle: {
              factoryJobId: "opp-refresh:factory-job",
              videoBriefId: "opp-refresh:brief",
              provider: "mock",
              renderVersion: "phase-c-render-v1",
              status: "review_pending",
              draftAt: "2026-03-24T09:10:00.000Z",
              queuedAt: "2026-03-24T09:10:00.000Z",
              retryQueuedAt: null,
              preparingAt: "2026-03-24T09:10:10.000Z",
              generatingNarrationAt: "2026-03-24T09:10:20.000Z",
              generatingVisualsAt: "2026-03-24T09:10:30.000Z",
              generatingCaptionsAt: "2026-03-24T09:10:40.000Z",
              composingAt: "2026-03-24T09:10:50.000Z",
              generatedAt: "2026-03-24T09:11:00.000Z",
              reviewPendingAt: "2026-03-24T09:11:10.000Z",
              acceptedAt: null,
              rejectedAt: null,
              discardedAt: null,
              failedAt: null,
              failedPermanentAt: null,
              lastUpdatedAt: "2026-03-24T09:11:10.000Z",
              failureStage: null,
              failureMessage: null,
              retryState: null,
            },
            latestCostEstimate: null,
            latestActualCost: null,
            latestBudgetGuard: null,
            latestQualityCheck: null,
            latestRetryState: null,
            runLedger: [],
            comparisonRecords: [],
            attemptLineage: [],
            narrationSpec: null,
            videoPrompt: null,
            generationRequest: null,
            renderJob: {
              id: "opp-refresh:render-job",
              batchId: "batch-refresh-1",
              generationRequestId: "opp-refresh:request",
              idempotencyKey: "opp-refresh:key",
              provider: "mock",
              renderVersion: "phase-c-render-v1",
              compiledProductionPlan: null,
              productionDefaultsSnapshot: null,
              providerJobId: null,
              preTriageConcern: null,
              regenerationReason: null,
              regenerationReasonCodes: [],
              regenerationNotes: null,
              costEstimate: null,
              actualCost: null,
              budgetGuard: null,
              qualityCheck: null,
              retryState: null,
              abTest: null,
              status: "completed",
              submittedAt: null,
              completedAt: "2026-03-24T09:11:10.000Z",
              errorMessage: null,
            },
            renderedAsset: null,
            assetReview: {
              renderedAssetId: "opp-refresh:asset",
              status: "pending_review",
              reviewedAt: null,
              reviewNotes: null,
              rejectionReason: null,
              structuredReasons: [],
            },
            performanceSignals: [],
          } as unknown as ContentOpportunity["generationState"],
        }),
      ],
    }),
    getBatchRenderJob: (batchId) => persistedBatch.get(batchId) ?? null,
    upsertBatchRenderJob: async (nextBatch) => {
      persistedBatch.set(nextBatch.batchId, nextBatch);
      return nextBatch;
    },
  });

  assert.equal(refreshed.status, "completed");
  assert.equal(refreshed.resultsSummary.completed, 1);
});
