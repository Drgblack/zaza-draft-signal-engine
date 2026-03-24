import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  contentOpportunitySchema,
  type ContentOpportunity,
} from "../lib/content-opportunities";
import { applySelectedHookSelection, buildHookSet } from "../lib/hook-engine";
import { buildMessageAngles } from "../lib/message-angles";
import { buildVideoBrief } from "../lib/video-briefs";

const REPO_ROOT = process.cwd();

function buildOpportunityFixture(): ContentOpportunity {
  const baseOpportunity = contentOpportunitySchema.parse({
    opportunityId: "opportunity-1",
    signalId: "signal-1",
    title: "Teacher email tone check",
    opportunityType: "pain_point_opportunity",
    status: "approved_for_production",
    priority: "high",
    source: {
      signalId: "signal-1",
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "A parent reply can escalate if the tone lands badly.",
    painPointCategory: "parent-communication",
    teacherLanguage: ["I keep rereading the draft before I send it."],
    recommendedAngle: "Calm reassurance before the reply goes out.",
    recommendedHookDirection: "empathetic",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "Parent communication pressure is high this week.",
    commercialPotential: "high",
    trustRisk: "low",
    riskSummary: null,
    confidence: 0.83,
    historicalCostAvg: null,
    historicalApprovalRate: null,
    suggestedNextStep: "Generate a video.",
    skipReason: null,
    hookOptions: null,
    hookRanking: null,
    performanceDrivers: null,
    intendedViewerEffect: null,
    suggestedCTA: null,
    productionComplexity: null,
    growthIntelligence: null,
    supportingSignals: [],
    memoryContext: {
      bestCombo: null,
      weakCombo: null,
      revenuePattern: null,
      audienceCue: "Teachers handling hard parent replies",
      caution: null,
    },
    sourceSignalIds: ["signal-1"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:05:00.000Z",
    approvedAt: "2026-03-24T09:01:00.000Z",
    dismissedAt: null,
    founderSelectionStatus: "pending",
    selectedAngleId: null,
    selectedHookId: null,
    selectedVideoBrief: null,
    generationState: null,
    operatorNotes: null,
  });
  const angle = buildMessageAngles(baseOpportunity)[0];
  const hookSet = angle ? buildHookSet(baseOpportunity, angle) : null;
  const selectedHook = hookSet?.variants[0] ?? null;

  if (!angle || !hookSet || !selectedHook) {
    throw new Error("Unable to build a valid content opportunity fixture.");
  }

  const selectedVideoBrief = buildVideoBrief(
    baseOpportunity,
    angle,
    applySelectedHookSelection(hookSet, selectedHook.id),
  );

  return contentOpportunitySchema.parse({
    ...baseOpportunity,
    founderSelectionStatus: "approved",
    selectedAngleId: angle.id,
    selectedHookId: selectedHook.id,
    selectedVideoBrief: {
      ...selectedVideoBrief,
      finalScriptTrustScore: 88,
    },
    generationState: {
      videoBriefApprovedAt: "2026-03-24T09:02:00.000Z",
      videoBriefApprovedBy: "founder",
      factoryLifecycle: {
        factoryJobId: "factory-job-1",
        videoBriefId: selectedVideoBrief.id,
        provider: "runway",
        renderVersion: "phase-c-render-v1",
        status: "review_pending",
        draftAt: "2026-03-24T09:02:00.000Z",
        queuedAt: "2026-03-24T09:02:05.000Z",
        retryQueuedAt: null,
        preparingAt: "2026-03-24T09:02:10.000Z",
        generatingNarrationAt: "2026-03-24T09:02:15.000Z",
        generatingVisualsAt: "2026-03-24T09:02:20.000Z",
        generatingCaptionsAt: "2026-03-24T09:02:25.000Z",
        composingAt: "2026-03-24T09:02:30.000Z",
        generatedAt: "2026-03-24T09:02:35.000Z",
        reviewPendingAt: "2026-03-24T09:02:40.000Z",
        acceptedAt: null,
        rejectedAt: null,
        discardedAt: null,
        failedAt: null,
        failedPermanentAt: null,
        lastUpdatedAt: "2026-03-24T09:02:40.000Z",
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
      attemptLineage: [
        {
          attemptId: "attempt-1",
          factoryJobId: "factory-job-1",
          renderVersion: "phase-c-render-v1",
          generationRequestId: "generation-request-1",
          renderJobId: "render-job-1",
          renderedAssetId: "asset-1",
          costEstimate: {
            estimatedTotalUsd: 1.02,
            narrationCostUsd: 0.18,
            visualsCostUsd: 0.72,
            transcriptionCostUsd: 0.12,
            compositionCostUsd: 0,
            providerId: "runway-gen4",
            mode: "quality",
            estimatedAt: "2026-03-24T09:02:05.000Z",
          },
          actualCost: null,
          budgetGuard: null,
          qualityCheck: null,
          retryState: null,
          providerExecutions: [],
          narrationArtifact: null,
          sceneArtifacts: [],
          captionArtifact: null,
          composedVideoArtifact: {
            artifactId: "video-1",
            artifactType: "composed_video",
            executionId: "composition-1",
            renderJobId: "render-job-1",
            renderVersion: "phase-c-render-v1",
            compositionSpecId: "composition-spec-1",
            providerId: "ffmpeg",
            videoUrl: "https://blob.example/video.mp4",
            thumbnailUrl: "https://blob.example/generated-thumb.jpg",
            storage: null,
            durationSec: 30,
            createdAt: "2026-03-24T09:02:35.000Z",
          },
          thumbnailArtifact: {
            artifactId: "thumbnail-1",
            artifactType: "thumbnail_image",
            renderJobId: "render-job-1",
            renderVersion: "phase-c-render-v1",
            providerId: "ffmpeg",
            imageUrl: "https://blob.example/generated-thumb.jpg",
            storage: {
              backend: "blob",
              pathname: "video-factory/generated-thumb.jpg",
              url: "https://blob.example/generated-thumb.jpg",
              sourceUrl: null,
              contentType: "image/jpeg",
              persistedAt: "2026-03-24T09:02:35.000Z",
              createdAt: "2026-03-24T09:02:35.000Z",
              retentionClass: "intermediate_artifact",
              retentionDays: 14,
              expiresAt: "2026-04-07T09:02:35.000Z",
              deletionEligible: false,
            },
            createdAt: "2026-03-24T09:02:35.000Z",
          },
          createdAt: "2026-03-24T09:02:35.000Z",
        },
      ],
      narrationSpec: null,
      videoPrompt: null,
      generationRequest: {
        id: "generation-request-1",
        opportunityId: "opportunity-1",
        videoBriefId: selectedVideoBrief.id,
        renderVersion: "phase-c-render-v1",
        idempotencyKey: "video-factory:opportunity-1",
        narrationSpecId: "narration-spec-1",
        videoPromptId: "video-prompt-1",
        approvedAt: "2026-03-24T09:02:00.000Z",
        approvedBy: "founder",
        status: "completed",
      },
      renderJob: {
        id: "render-job-1",
        batchId: "batch-approved-1",
        generationRequestId: "generation-request-1",
        idempotencyKey: "video-factory:opportunity-1",
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
        status: "completed",
        submittedAt: "2026-03-24T09:02:05.000Z",
        completedAt: "2026-03-24T09:02:40.000Z",
        errorMessage: null,
      },
      renderedAsset: {
        id: "asset-1",
        renderJobId: "render-job-1",
        assetType: "video",
        url: "https://blob.example/video.mp4",
        thumbnailUrl: "https://blob.example/generated-thumb.jpg",
        durationSec: 30,
        createdAt: "2026-03-24T09:02:40.000Z",
      },
      assetReview: {
        id: "review-1",
        renderedAssetId: "asset-1",
        status: "pending_review",
        reviewedAt: null,
        structuredReasons: [],
        reviewNotes: null,
        rejectionReason: null,
      },
      performanceSignals: [],
    },
  });
}

async function withTempContentOpportunityModule(
  run: (context: {
    dataDir: string;
    loadModule: () => Promise<typeof import("../lib/content-opportunities")>;
  }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "content-opportunity-ops-"));
  const dataDir = path.join(tempDir, "data");
  await mkdir(dataDir, { recursive: true });
  process.chdir(tempDir);

  try {
    await run({
      dataDir,
      loadModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "content-opportunities.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
    });
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("dismissContentOpportunity requires a skip reason", { concurrency: false }, async () => {
  await withTempContentOpportunityModule(async ({ dataDir, loadModule }) => {
    await writeFile(
      path.join(dataDir, "content-opportunities.json"),
      `${JSON.stringify(
        {
          updatedAt: "2026-03-24T09:05:00.000Z",
          opportunities: [buildOpportunityFixture()],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const contentOpportunities = await loadModule();

    await assert.rejects(
      () => contentOpportunities.dismissContentOpportunity("opportunity-1", null),
      /Dismiss requires a skip reason\./,
    );
  });
});

test("updateContentOpportunityThumbnail overrides and resets the persisted review thumbnail", { concurrency: false }, async () => {
  await withTempContentOpportunityModule(async ({ dataDir, loadModule }) => {
    await writeFile(
      path.join(dataDir, "content-opportunities.json"),
      `${JSON.stringify(
        {
          updatedAt: "2026-03-24T09:05:00.000Z",
          opportunities: [buildOpportunityFixture()],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const contentOpportunities = await loadModule();

    await contentOpportunities.updateContentOpportunityThumbnail({
      opportunityId: "opportunity-1",
      action: "override",
      thumbnailUrl: "https://cdn.example/manual-thumb.jpg",
    });

    let state = await contentOpportunities.listContentOpportunityState();
    let updated = state.opportunities.find(
      (item) => item.opportunityId === "opportunity-1",
    );

    assert.equal(
      updated?.generationState?.renderedAsset?.thumbnailUrl,
      "https://cdn.example/manual-thumb.jpg",
    );
    assert.equal(
      updated?.generationState?.attemptLineage[0]?.thumbnailArtifact?.imageUrl,
      "https://cdn.example/manual-thumb.jpg",
    );
    assert.equal(
      updated?.generationState?.attemptLineage[0]?.thumbnailArtifact?.providerId,
      "manual-override",
    );

    await contentOpportunities.updateContentOpportunityThumbnail({
      opportunityId: "opportunity-1",
      action: "reset_generated",
    });

    state = await contentOpportunities.listContentOpportunityState();
    updated = state.opportunities.find((item) => item.opportunityId === "opportunity-1");

    assert.equal(
      updated?.generationState?.renderedAsset?.thumbnailUrl,
      "https://blob.example/generated-thumb.jpg",
    );
    assert.equal(
      updated?.generationState?.attemptLineage[0]?.thumbnailArtifact?.imageUrl,
      "https://blob.example/generated-thumb.jpg",
    );
    assert.equal(
      updated?.generationState?.attemptLineage[0]?.thumbnailArtifact?.providerId,
      "ffmpeg",
    );

    const rawStore = JSON.parse(
      await readFile(path.join(dataDir, "content-opportunities.json"), "utf8"),
    ) as {
      opportunities: Array<{
        generationState?: {
          renderedAsset?: { thumbnailUrl?: string | null } | null;
        } | null;
      }>;
    };

    assert.equal(
      rawStore.opportunities[0]?.generationState?.renderedAsset?.thumbnailUrl,
      "https://blob.example/generated-thumb.jpg",
    );
  });
});
