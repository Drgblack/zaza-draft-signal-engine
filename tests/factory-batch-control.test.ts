import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import type { ContentOpportunity } from "../lib/content-opportunities";
import {
  buildBatchRenderJob,
  buildContentMixTarget,
} from "../lib/factory-batch-control";

const REPO_ROOT = process.cwd();

function buildOpportunityFixture(input: {
  id: string;
  recommendedFormat: "text" | "carousel" | "short_video" | "multi_asset";
  platforms: Array<"x" | "linkedin" | "reddit">;
  contentType: string | null;
  effect: string | null;
  cta: string | null;
  lifecycleStatus:
    | "review_pending"
    | "accepted"
    | "rejected"
    | "discarded"
    | "failed"
    | "failed_permanent";
  reviewStatus?: "pending_review" | "accepted" | "rejected" | "discarded" | null;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
}): ContentOpportunity {
  return {
    opportunityId: input.id,
    signalId: `${input.id}:signal`,
    title: `Opportunity ${input.id}`,
    opportunityType: "pain_point_opportunity",
    status: "approved_for_production",
    priority: "high",
    source: {
      signalId: `${input.id}:signal`,
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "Teachers worry that a quick message could escalate.",
    painPointCategory: "teacher-communication",
    teacherLanguage: ["I keep rereading it before I send it."],
    recommendedAngle: "Calm reassurance",
    recommendedHookDirection: "empathetic",
    recommendedFormat: input.recommendedFormat,
    recommendedPlatforms: input.platforms,
    whyNow: "This pattern is active right now.",
    commercialPotential: "high",
    trustRisk: "low",
    riskSummary: null,
    confidence: 0.82,
    historicalCostAvg: null,
    historicalApprovalRate: null,
    suggestedNextStep: "Generate a video.",
    skipReason: null,
    hookOptions: ["Before you send this..."],
    hookRanking: [{ hook: "Before you send this...", score: 18 }],
    performanceDrivers: {
      hookStrength: 4,
      stakes: 4,
    },
    intendedViewerEffect: input.effect,
    suggestedCTA: input.cta,
    productionComplexity: "low",
    growthIntelligence: {
      executionPath: "video_factory",
      executionPriority: 78,
      riskLevel: "low",
    },
    supportingSignals: [],
    memoryContext: {
      bestCombo: null,
      weakCombo: null,
      revenuePattern: null,
      audienceCue: "Teachers handling parent replies",
      caution: null,
    },
    sourceSignalIds: [`${input.id}:signal`],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T10:00:00.000Z",
    approvedAt: "2026-03-24T09:05:00.000Z",
    dismissedAt: null,
    founderSelectionStatus: "approved",
    selectedAngleId: "angle-1",
    selectedHookId: "hook-1",
    selectedVideoBrief: {
      id: `${input.id}:brief`,
      opportunityId: input.id,
      angleId: "angle-1",
      hookSetId: "hook-set-1",
      title: `Brief ${input.id}`,
      hook: "Before you send this...",
      format: "talking-head",
      durationSec: 30,
      goal: "Drive trials",
      tone: "teacher-real",
      structure: [
        { order: 1, purpose: "hook", guidance: "Open with risk." },
        { order: 2, purpose: "recognition", guidance: "Name the pressure." },
        { order: 3, purpose: "cta", guidance: "Offer a safer path." },
      ],
      visualDirection: "Simple portrait shot.",
      overlayLines: ["Pause before sending", "Catch risky tone early"],
      cta: input.cta ?? "Try Zaza Draft",
      contentType: input.contentType,
      finalScriptTrustScore: 88,
      productionNotes: ["No hype"],
    },
    generationState: {
      videoBriefApprovedAt: "2026-03-24T09:05:00.000Z",
      videoBriefApprovedBy: "founder",
      factoryLifecycle: {
        factoryJobId: `${input.id}:factory-job`,
        videoBriefId: `${input.id}:brief`,
        provider: "runway",
        renderVersion: "phase-c-render-v1",
        status: input.lifecycleStatus,
        draftAt: "2026-03-24T09:05:00.000Z",
        queuedAt: "2026-03-24T09:06:00.000Z",
        retryQueuedAt: null,
        preparingAt: "2026-03-24T09:06:10.000Z",
        generatingNarrationAt: "2026-03-24T09:06:20.000Z",
        generatingVisualsAt: "2026-03-24T09:06:30.000Z",
        generatingCaptionsAt:
          input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
            ? null
            : "2026-03-24T09:06:40.000Z",
        composingAt:
          input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
            ? null
            : "2026-03-24T09:06:50.000Z",
        generatedAt:
          input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
            ? null
            : "2026-03-24T09:07:00.000Z",
        reviewPendingAt:
          input.lifecycleStatus === "review_pending"
            ? "2026-03-24T09:07:10.000Z"
            : null,
        acceptedAt:
          input.lifecycleStatus === "accepted" ? "2026-03-24T09:07:20.000Z" : null,
        rejectedAt:
          input.lifecycleStatus === "rejected" ? "2026-03-24T09:07:20.000Z" : null,
        discardedAt:
          input.lifecycleStatus === "discarded" ? "2026-03-24T09:07:20.000Z" : null,
        failedAt:
          input.lifecycleStatus === "failed" ? "2026-03-24T09:06:45.000Z" : null,
        failedPermanentAt:
          input.lifecycleStatus === "failed_permanent"
            ? "2026-03-24T09:06:45.000Z"
            : null,
        lastUpdatedAt: "2026-03-24T10:00:00.000Z",
        failureStage:
          input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
            ? "generating_visuals"
            : null,
        failureMessage:
          input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
            ? "Visual provider timed out."
            : null,
        retryState: null,
      },
      latestCostEstimate: {
        estimatedTotalUsd: input.estimatedCostUsd ?? 1.25,
        narrationCostUsd: 0.2,
        visualsCostUsd: 0.93,
        transcriptionCostUsd: 0.12,
        compositionCostUsd: 0,
        providerId: "runway-gen4",
        mode: "quality",
        estimatedAt: "2026-03-24T09:06:00.000Z",
      },
      latestActualCost:
        input.actualCostUsd !== undefined
          ? {
              jobId: `${input.id}:render-job`,
              estimatedCostUsd: input.estimatedCostUsd ?? 1.25,
              actualCostUsd: input.actualCostUsd,
              narrationActualUsd: 0.18,
              visualsActualUsd: Math.max(input.actualCostUsd - 0.3, 0),
              transcriptActualUsd: 0.12,
              compositionActualUsd: 0,
              providerId: "runway-gen4",
              completedAt: "2026-03-24T09:07:20.000Z",
            }
          : null,
      latestBudgetGuard: null,
      latestQualityCheck: null,
      latestRetryState: null,
      runLedger: [
        {
          ledgerEntryId: `${input.id}:ledger`,
          factoryJobId: `${input.id}:factory-job`,
          opportunityId: input.id,
          videoBriefId: `${input.id}:brief`,
          attemptNumber: 1,
          generationRequestId: `${input.id}:request`,
          renderJobId: `${input.id}:render-job`,
          renderedAssetId:
            input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
              ? null
              : `${input.id}:asset`,
          providerSet: {
            renderProvider: "runway",
            narrationProvider: "elevenlabs",
            visualProviders: ["runway-gen4"],
            captionProvider: "assemblyai",
            compositionProvider: "ffmpeg",
          },
          lifecycleTransitions: [
            { status: "queued", at: "2026-03-24T09:06:00.000Z" },
            { status: input.lifecycleStatus, at: "2026-03-24T09:07:20.000Z" },
          ],
          artifactIds: [],
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
          growthExecutionPriority: 78,
          growthRiskLevel: "low",
          growthReasoning: null,
          finalScriptTrustScore: 88,
          finalScriptTrustStatus: "safe",
          abTest: null,
          terminalOutcome:
            input.lifecycleStatus === "review_pending"
              ? "review_pending"
              : input.lifecycleStatus === "accepted"
                ? "accepted"
                : input.lifecycleStatus === "rejected"
                  ? "rejected"
                  : input.lifecycleStatus === "discarded"
                    ? "discarded"
                    : "failed",
          lastUpdatedAt: "2026-03-24T10:00:00.000Z",
          failureStage:
            input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
              ? "generating_visuals"
              : null,
          failureMessage:
            input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
              ? "Visual provider timed out."
              : null,
        },
      ],
      comparisonRecords: [],
      attemptLineage: [],
      narrationSpec: null,
      videoPrompt: null,
      generationRequest: {
        id: `${input.id}:request`,
        opportunityId: input.id,
        videoBriefId: `${input.id}:brief`,
        renderVersion: "phase-c-render-v1",
        idempotencyKey: `${input.id}:idempotency`,
        narrationSpecId: `${input.id}:narration`,
        videoPromptId: `${input.id}:prompt`,
        approvedAt: "2026-03-24T09:05:00.000Z",
        approvedBy: "founder",
        status: "submitted",
        submittedAt: "2026-03-24T09:06:00.000Z",
      },
      renderJob: {
        id: `${input.id}:render-job`,
        batchId: null,
        generationRequestId: `${input.id}:request`,
        idempotencyKey: `${input.id}:idempotency`,
        provider: "runway",
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
        status:
          input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
            ? "failed"
            : "completed",
        submittedAt: "2026-03-24T09:06:00.000Z",
        completedAt:
          input.lifecycleStatus === "review_pending"
            ? null
            : "2026-03-24T09:07:20.000Z",
        errorMessage:
          input.lifecycleStatus === "failed" || input.lifecycleStatus === "failed_permanent"
            ? "Visual provider timed out."
            : null,
      },
      renderedAsset: null,
      assetReview:
        input.reviewStatus === null || input.reviewStatus === undefined
          ? null
          : {
              id: `${input.id}:review`,
              renderedAssetId: `${input.id}:asset`,
              status: input.reviewStatus,
              reviewNotes: null,
              rejectionReason: null,
              structuredReasons: [],
              reviewedAt: "2026-03-24T09:07:30.000Z",
            },
      performanceSignals: [],
    },
    operatorNotes: null,
  } as unknown as ContentOpportunity;
}

async function withTempBatchControlModule(
  run: (context: {
    dataDir: string;
    loadModule: () => Promise<typeof import("../lib/factory-batch-control")>;
  }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "factory-batch-control-"));
  const dataDir = path.join(tempDir, "data");
  await mkdir(dataDir, { recursive: true });
  process.chdir(tempDir);

  try {
    await run({
      dataDir,
      loadModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "factory-batch-control.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
    });
  } finally {
    process.chdir(previousCwd);
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "EBUSY") {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

test("buildBatchRenderJob summarizes linked opportunities and current factory state", () => {
  const batch = buildBatchRenderJob({
    batchId: "batch-1",
    opportunities: [
      buildOpportunityFixture({
        id: "opp-1",
        recommendedFormat: "short_video",
        platforms: ["linkedin"],
        contentType: "pain",
        effect: "caution",
        cta: "Pause before sending",
        lifecycleStatus: "accepted",
        reviewStatus: "accepted",
        estimatedCostUsd: 1.2,
        actualCostUsd: 1.15,
      }),
      buildOpportunityFixture({
        id: "opp-2",
        recommendedFormat: "carousel",
        platforms: ["x"],
        contentType: "validation",
        effect: "relief",
        cta: "Try Zaza Draft",
        lifecycleStatus: "review_pending",
        reviewStatus: "pending_review",
        estimatedCostUsd: 0.9,
      }),
      buildOpportunityFixture({
        id: "opp-3",
        recommendedFormat: "text",
        platforms: ["reddit"],
        contentType: "solution",
        effect: "confidence",
        cta: "Download template",
        lifecycleStatus: "failed",
        reviewStatus: null,
        estimatedCostUsd: 0.8,
      }),
    ],
    status: "pending_approval",
  });

  assert.equal(batch.batchId, "batch-1");
  assert.deepEqual(batch.opportunityIds, ["opp-1", "opp-2", "opp-3"]);
  assert.deepEqual(batch.briefIds, ["opp-1:brief", "opp-2:brief", "opp-3:brief"]);
  assert.deepEqual(batch.jobIds, ["opp-1:render-job", "opp-2:render-job", "opp-3:render-job"]);
  assert.equal(batch.summary.total, 3);
  assert.equal(batch.summary.withApprovedBrief, 3);
  assert.equal(batch.summary.withRenderJob, 3);
  assert.equal(batch.summary.completed, 2);
  assert.equal(batch.summary.failed, 1);
  assert.equal(batch.summary.approved, 1);
  assert.equal(batch.summary.pendingReview, 1);
  assert.equal(batch.totalEstimatedCostUsd, 2.9);
  assert.equal(batch.summary.totalActualCostUsd, 1.15);
  assert.equal(batch.executionPolicy.throttle, 3);
  assert.equal(batch.executionPolicy.requireFounderApproval, true);
});

test("buildContentMixTarget computes observed mix and soft-block gaps from current intelligence", () => {
  const target = buildContentMixTarget({
    targetId: "mix-1",
    name: "Balanced weekly mix",
    status: "active",
    targets: {
      contentType: {
        pain: 0.4,
        validation: 0.3,
        solution: 0.2,
        story: 0.1,
      },
      format: {
        short_video: 0.5,
        carousel: 0.3,
        text: 0.2,
      },
    },
    opportunities: [
      buildOpportunityFixture({
        id: "opp-1",
        recommendedFormat: "short_video",
        platforms: ["linkedin"],
        contentType: "pain",
        effect: "caution",
        cta: "Pause before sending",
        lifecycleStatus: "accepted",
        reviewStatus: "accepted",
      }),
      buildOpportunityFixture({
        id: "opp-2",
        recommendedFormat: "short_video",
        platforms: ["linkedin"],
        contentType: "pain",
        effect: "caution",
        cta: "Pause before sending",
        lifecycleStatus: "review_pending",
        reviewStatus: "pending_review",
      }),
      buildOpportunityFixture({
        id: "opp-3",
        recommendedFormat: "short_video",
        platforms: ["x"],
        contentType: "pain",
        effect: "recognition",
        cta: "Try Zaza Draft",
        lifecycleStatus: "review_pending",
        reviewStatus: "pending_review",
      }),
    ],
  });

  assert.equal(target.observedMix.totalOpportunities, 3);
  assert.equal(target.observedMix.contentTypeCounts.pain, 3);
  assert.equal(target.observedMix.formatCounts.short_video, 3);
  assert.equal(target.observedMix.painPointCounts["teacher-communication"], 3);
  assert.equal(target.observedMix.hookTypeCounts.risk, 3);
  const storyGap = target.gaps.find(
    (gap) => gap.dimension === "contentType" && gap.key === "story",
  );
  const carouselGap = target.gaps.find(
    (gap) => gap.dimension === "format" && gap.key === "carousel",
  );
  assert.ok(storyGap);
  assert.equal(storyGap?.direction, "underrepresented");
  assert.equal(storyGap?.severity, "aligned");
  assert.ok(carouselGap);
  assert.equal(carouselGap?.direction, "underrepresented");
  assert.equal(carouselGap?.severity, "warning");
  const painGap = target.gaps.find(
    (gap) => gap.dimension === "contentType" && gap.key === "pain",
  );
  assert.equal(painGap?.severity, "soft_block");
});

test("batch jobs and mix targets persist to the repo-native JSON store", { concurrency: false }, async () => {
  await withTempBatchControlModule(async ({ dataDir, loadModule }) => {
    const batchControlModule = await loadModule();
    const opportunities = [
      buildOpportunityFixture({
        id: "opp-1",
        recommendedFormat: "short_video",
        platforms: ["linkedin"],
        contentType: "pain",
        effect: "caution",
        cta: "Pause before sending",
        lifecycleStatus: "accepted",
        reviewStatus: "accepted",
      }),
      buildOpportunityFixture({
        id: "opp-2",
        recommendedFormat: "carousel",
        platforms: ["x"],
        contentType: "validation",
        effect: "relief",
        cta: "Try Zaza Draft",
        lifecycleStatus: "review_pending",
        reviewStatus: "pending_review",
      }),
    ];

    const batch = batchControlModule.buildBatchRenderJob({
      batchId: "batch-store-1",
      opportunities,
      status: "draft",
      createdAt: "2026-03-24T10:00:00.000Z",
      updatedAt: "2026-03-24T10:00:00.000Z",
    });
    const mixTarget = batchControlModule.buildContentMixTarget({
      targetId: "mix-store-1",
      name: "Store target",
      targets: {
        format: {
          short_video: 0.5,
          carousel: 0.5,
        },
      },
      opportunities,
      createdAt: "2026-03-24T10:00:00.000Z",
      updatedAt: "2026-03-24T10:00:00.000Z",
    });

    await batchControlModule.upsertBatchRenderJob(batch);
    await batchControlModule.upsertContentMixTarget(mixTarget);

    const rawStore = JSON.parse(
      await readFile(path.join(dataDir, "factory-batch-control.json"), "utf8"),
    ) as {
      batches: Array<{ batchId: string }>;
      mixTargets: Array<{ targetId: string }>;
    };

    assert.deepEqual(rawStore.batches.map((item) => item.batchId), ["batch-store-1"]);
    assert.deepEqual(rawStore.mixTargets.map((item) => item.targetId), ["mix-store-1"]);
    assert.equal(batchControlModule.getBatchRenderJob("batch-store-1")?.summary.total, 2);
    assert.equal(
      batchControlModule.getContentMixTarget("mix-store-1")?.observedMix.totalOpportunities,
      2,
    );
  });
});

test("findLinkedBatchRenderJobForOpportunity returns the current approved batch for a queued opportunity", { concurrency: false }, async () => {
  await withTempBatchControlModule(async ({ loadModule }) => {
    const batchControlModule = await loadModule();
    const opportunities = [
      buildOpportunityFixture({
        id: "opp-linked-1",
        recommendedFormat: "short_video",
        platforms: ["linkedin"],
        contentType: "validation",
        effect: "relief",
        cta: "Try Zaza Draft",
        lifecycleStatus: "accepted",
        reviewStatus: "accepted",
      }),
    ];

    await batchControlModule.upsertBatchRenderJob(
      batchControlModule.buildBatchRenderJob({
        batchId: "batch-old",
        opportunities,
        status: "completed",
        createdAt: "2026-03-24T09:00:00.000Z",
        updatedAt: "2026-03-24T09:10:00.000Z",
      }),
    );
    await batchControlModule.upsertBatchRenderJob(
      batchControlModule.buildBatchRenderJob({
        batchId: "batch-current",
        opportunities,
        status: "approved",
        createdAt: "2026-03-24T10:00:00.000Z",
        updatedAt: "2026-03-24T10:30:00.000Z",
      }),
    );

    const linked = batchControlModule.findLinkedBatchRenderJobForOpportunity({
      opportunityId: "opp-linked-1",
    });

    assert.equal(linked?.batchId, "batch-current");
    assert.equal(linked?.status, "approved");
  });
});

test("batch approval requires explicit override when the linked content mix target has soft-block gaps", { concurrency: false }, async () => {
  await withTempBatchControlModule(async ({ loadModule }) => {
    const batchControlModule = await loadModule();
    const opportunities = [
      buildOpportunityFixture({
        id: "opp-1",
        recommendedFormat: "short_video",
        platforms: ["linkedin"],
        contentType: "pain",
        effect: "caution",
        cta: "Pause before sending",
        lifecycleStatus: "accepted",
        reviewStatus: "accepted",
      }),
      buildOpportunityFixture({
        id: "opp-2",
        recommendedFormat: "short_video",
        platforms: ["linkedin"],
        contentType: "pain",
        effect: "caution",
        cta: "Pause before sending",
        lifecycleStatus: "accepted",
        reviewStatus: "accepted",
      }),
    ];
    const mixTarget = batchControlModule.buildContentMixTarget({
      targetId: "mix-approval-1",
      name: "Balanced mix",
      targets: {
        contentType: {
          pain: 0.2,
          validation: 0.4,
          solution: 0.3,
          story: 0.1,
        },
      },
      opportunities,
      status: "active",
      createdAt: "2026-03-24T10:00:00.000Z",
      updatedAt: "2026-03-24T10:00:00.000Z",
    });
    const batch = batchControlModule.buildBatchRenderJob({
      batchId: "batch-approval-1",
      opportunities,
      status: "pending_approval",
      createdAt: "2026-03-24T10:00:00.000Z",
      updatedAt: "2026-03-24T10:00:00.000Z",
      executionPolicy: {
        contentMixTargetId: "mix-approval-1",
      },
    });

    await batchControlModule.upsertContentMixTarget(mixTarget);
    await batchControlModule.upsertBatchRenderJob(batch);

    const assessment = batchControlModule.buildBatchApprovalAssessment({
      batch,
      contentMixTarget: mixTarget,
    });

    assert.equal(assessment.requiresOverride, true);
    await assert.rejects(
      () =>
        batchControlModule.approveBatchRenderJob({
          batchId: "batch-approval-1",
        }),
      /requires an explicit content-mix override/i,
    );

    const approvedBatch = await batchControlModule.approveBatchRenderJob({
      batchId: "batch-approval-1",
      overrideMixGaps: true,
    });

    assert.equal(approvedBatch.status, "approved");
  });
});

test("auto-approve config keeps the safety rail explicit and holds every nth candidate for review", { concurrency: false }, async () => {
  await withTempBatchControlModule(async ({ loadModule }) => {
    const batchControlModule = await loadModule();
    const config = await batchControlModule.upsertAutoApproveConfig({
      configId: "auto-approve-1",
      name: "Phase E trial",
      status: "active",
      enabled: true,
      confidenceThreshold: 80,
      requiresTrustPass: true,
      maxPerDay: 5,
      mandatoryReviewEveryN: 3,
      changedAt: "2026-03-24T10:00:00.000Z",
      changedSource: "operator:test",
      changeNote: "Turn on guarded auto-approve.",
    });

    const assessment = batchControlModule.assessAutoApproveOpportunity({
      config,
      opportunity: buildOpportunityFixture({
        id: "opp-auto-1",
        recommendedFormat: "short_video",
        platforms: ["linkedin"],
        contentType: "validation",
        effect: "relief",
        cta: "Try Zaza Draft",
        lifecycleStatus: "accepted",
        reviewStatus: "accepted",
      }),
      autoApprovedTodayCount: 1,
      totalAutoApprovedCount: 2,
    });

    assert.equal(assessment.eligible, true);
    assert.equal(assessment.heldForMandatoryReview, true);
    assert.ok(
      assessment.reasons.some((reason) =>
        reason.includes("Mandatory review rail triggered"),
      ),
    );
  });
});

test("growth intelligence can tighten the auto-approve confidence threshold for higher-risk execution", { concurrency: false }, async () => {
  await withTempBatchControlModule(async ({ loadModule }) => {
    const batchControlModule = await loadModule();
    const config = await batchControlModule.upsertAutoApproveConfig({
      configId: "auto-approve-2",
      name: "Risk-aware trial",
      status: "active",
      enabled: true,
      confidenceThreshold: 80,
      requiresTrustPass: true,
      maxPerDay: 5,
      mandatoryReviewEveryN: 10,
      changedAt: "2026-03-24T10:00:00.000Z",
      changedSource: "operator:test",
      changeNote: "Risk-aware threshold test.",
    });

    const opportunity = buildOpportunityFixture({
      id: "opp-auto-risk-1",
      recommendedFormat: "short_video",
      platforms: ["linkedin"],
      contentType: "validation",
      effect: "relief",
      cta: "Try Zaza Draft",
      lifecycleStatus: "accepted",
      reviewStatus: "accepted",
    });
    opportunity.confidence = 0.85;
    opportunity.growthIntelligence = {
      executionPriority: 40,
      strategicValue: 42,
      riskLevel: "high",
      learningValue: 35,
      executionPath: "review",
    };

    const assessment = batchControlModule.assessAutoApproveOpportunity({
      config,
      opportunity,
      autoApprovedTodayCount: 0,
      totalAutoApprovedCount: 0,
    });

    assert.equal(assessment.eligible, false);
    assert.ok(
      assessment.reasons.some((reason) =>
        reason.includes("below the 90 threshold"),
      ),
    );
  });
});
