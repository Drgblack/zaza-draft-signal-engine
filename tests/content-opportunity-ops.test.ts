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
import { buildVideoFactoryReviewBrief } from "../lib/video-factory-review-model";

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
    messageAngles: [],
    hookSets: [],
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
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(tempDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "EBUSY" || attempt === 4) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
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

test("buildAutoApprovedOpportunity selects the first stable angle, hook, and brief", async () => {
  const contentOpportunities = await import("../lib/content-opportunities");
  const openOpportunity = contentOpportunitySchema.parse({
    ...buildOpportunityFixture(),
    status: "open",
    approvedAt: null,
    founderSelectionStatus: "pending",
    selectedAngleId: null,
    selectedHookId: null,
    selectedVideoBrief: null,
    generationState: null,
  });

  const approved = contentOpportunities.buildAutoApprovedOpportunity(
    openOpportunity,
    "2026-03-24T10:00:00.000Z",
  );

  assert.ok(approved);
  assert.equal(approved?.status, "approved_for_production");
  assert.equal(approved?.founderSelectionStatus, "approved");
  assert.ok(approved?.selectedAngleId);
  assert.ok(approved?.selectedHookId);
  assert.ok(approved?.selectedVideoBrief);
});

test("generateContentOpportunityMessageAngles persists bounded angles for an approved opportunity", { concurrency: false }, async () => {
  await withTempContentOpportunityModule(async ({ dataDir, loadModule }) => {
    const persisted = contentOpportunitySchema.parse({
      ...buildOpportunityFixture(),
      messageAngles: [],
      hookSets: [],
    });

    await writeFile(
      path.join(dataDir, "content-opportunities.json"),
      `${JSON.stringify(
        {
          updatedAt: "2026-03-24T09:05:00.000Z",
          opportunities: [persisted],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const contentOpportunities = await loadModule();
    const state = await contentOpportunities.generateContentOpportunityMessageAngles({
      opportunityId: "opportunity-1",
      regenerate: true,
    });
    const updated = state.opportunities.find(
      (item) => item.opportunityId === "opportunity-1",
    );

    assert.ok(updated);
    assert.ok(updated?.messageAngles);
    assert.ok(
      (updated?.messageAngles?.length ?? 0) >= 2 &&
        (updated?.messageAngles?.length ?? 0) <= 3,
    );
    assert.equal(updated?.messageAngles?.[0]?.rank, 1);
    assert.equal(updated?.messageAngles?.[0]?.isRecommended, true);

    const rawStore = JSON.parse(
      await readFile(path.join(dataDir, "content-opportunities.json"), "utf8"),
    ) as {
      opportunities: Array<{
        messageAngles?: Array<{ id: string; rank: number }> | null;
      }>;
    };

    assert.ok((rawStore.opportunities[0]?.messageAngles?.length ?? 0) >= 2);
    assert.equal(rawStore.opportunities[0]?.messageAngles?.[0]?.rank, 1);
  });
});

test("generateContentOpportunityHookSets persists one bounded set per angle", { concurrency: false }, async () => {
  await withTempContentOpportunityModule(async ({ dataDir, loadModule }) => {
    const persisted = contentOpportunitySchema.parse({
      ...buildOpportunityFixture(),
      hookSets: [],
    });

    await writeFile(
      path.join(dataDir, "content-opportunities.json"),
      `${JSON.stringify(
        {
          updatedAt: "2026-03-24T09:05:00.000Z",
          opportunities: [persisted],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const contentOpportunities = await loadModule();
    const state = await contentOpportunities.generateContentOpportunityHookSets({
      opportunityId: "opportunity-1",
      regenerate: true,
    });
    const updated = state.opportunities.find(
      (item) => item.opportunityId === "opportunity-1",
    );

    assert.ok(updated?.hookSets);
    assert.equal(updated?.hookSets.length, updated?.messageAngles.length);
    assert.ok(
      updated?.hookSets.every(
        (hookSet) => hookSet.variants.length >= 3 && hookSet.variants.length <= 5,
      ),
    );
    assert.equal(updated?.hookSets[0]?.primaryHook.isRecommended, true);

    const rawStore = JSON.parse(
      await readFile(path.join(dataDir, "content-opportunities.json"), "utf8"),
    ) as {
      opportunities: Array<{
        hookSets?: Array<{ angleId: string; variants: Array<{ rank: number }> }> | null;
      }>;
    };

    assert.ok((rawStore.opportunities[0]?.hookSets?.length ?? 0) >= 1);
    assert.equal(rawStore.opportunities[0]?.hookSets?.[0]?.variants[0]?.rank, 1);
  });
});

test("approveContentOpportunity prepares a pending founder brief flow instead of auto-approving the brief", { concurrency: false }, async () => {
  await withTempContentOpportunityModule(async ({ dataDir, loadModule }) => {
    const openOpportunity = contentOpportunitySchema.parse({
      ...buildOpportunityFixture(),
      status: "open",
      approvedAt: null,
      messageAngles: [],
      hookSets: [],
      founderSelectionStatus: "pending",
      selectedAngleId: null,
      selectedHookId: null,
      selectedVideoBrief: null,
      generationState: null,
    });

    await writeFile(
      path.join(dataDir, "content-opportunities.json"),
      `${JSON.stringify(
        {
          updatedAt: "2026-03-24T09:05:00.000Z",
          opportunities: [openOpportunity],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const contentOpportunities = await loadModule();
    const state = await contentOpportunities.approveContentOpportunity("opportunity-1");
    const updated = state.opportunities.find((item) => item.opportunityId === "opportunity-1");

    assert.equal(updated?.status, "approved_for_production");
    assert.equal(updated?.founderSelectionStatus, "pending");
    assert.equal(updated?.selectedAngleId, null);
    assert.equal(updated?.selectedHookId, null);
    assert.equal(updated?.selectedVideoBrief, null);
    assert.equal(updated?.generationState, null);
    assert.ok((updated?.messageAngles.length ?? 0) >= 2);
    assert.ok((updated?.hookSets.length ?? 0) >= 1);
  });
});

test("founder brief selections, draft edits, and approval persist into the downstream review brief", { concurrency: false }, async () => {
  await withTempContentOpportunityModule(async ({ dataDir, loadModule }) => {
    const baseOpportunity = buildOpportunityFixture();
    const pendingAngles = buildMessageAngles(baseOpportunity);
    const pendingHookSets = pendingAngles.map((angle) => buildHookSet(baseOpportunity, angle));
    const pendingOpportunity = contentOpportunitySchema.parse({
      ...baseOpportunity,
      messageAngles: pendingAngles,
      hookSets: pendingHookSets,
      founderSelectionStatus: "pending",
      selectedAngleId: null,
      selectedHookId: null,
      selectedVideoBrief: null,
      generationState: null,
    });
    const targetAngle = pendingOpportunity.messageAngles[1] ?? pendingOpportunity.messageAngles[0];
    const targetHookSet = pendingOpportunity.hookSets.find(
      (hookSet) => hookSet.angleId === targetAngle?.id,
    );
    const targetHook = targetHookSet?.variants[0];

    assert.ok(targetAngle);
    assert.ok(targetHookSet);
    assert.ok(targetHook);

    await writeFile(
      path.join(dataDir, "content-opportunities.json"),
      `${JSON.stringify(
        {
          updatedAt: "2026-03-24T09:05:00.000Z",
          opportunities: [pendingOpportunity],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const contentOpportunities = await loadModule();

    let state = await contentOpportunities.selectContentOpportunityMessageAngle({
      opportunityId: "opportunity-1",
      angleId: targetAngle!.id,
    });
    let updated = state.opportunities.find((item) => item.opportunityId === "opportunity-1");

    assert.equal(updated?.selectedAngleId, targetAngle!.id);
    assert.equal(updated?.selectedHookId, null);
    assert.equal(updated?.founderSelectionStatus, "angle-selected");
    assert.equal(updated?.selectedVideoBrief, null);

    state = await contentOpportunities.selectContentOpportunityHook({
      opportunityId: "opportunity-1",
      angleId: targetAngle!.id,
      hookId: targetHook!.id,
    });
    updated = state.opportunities.find((item) => item.opportunityId === "opportunity-1");

    assert.equal(updated?.selectedAngleId, targetAngle!.id);
    assert.equal(updated?.selectedHookId, targetHook!.id);
    assert.equal(updated?.founderSelectionStatus, "hook-selected");
    assert.equal(updated?.selectedVideoBrief?.hook, targetHook!.text);

    const currentBrief = updated?.selectedVideoBrief;
    assert.ok(currentBrief);

    state = await contentOpportunities.saveContentOpportunityVideoBriefDraft({
      opportunityId: "opportunity-1",
      briefDraft: {
        title: "Founder tuned reassurance brief",
        hook: "Before you send that reply, pause on this one line.",
        goal: "Help a teacher lower the temperature before a parent email escalates.",
        structure:
          currentBrief?.structure.map((beat, index) => ({
            order: beat.order,
            purpose:
              index === 0 ? "Pause the reaction" : beat.purpose,
            guidance:
              index === 1
                ? "Name the tension plainly, then slow the viewer down before offering the next move."
                : beat.guidance,
            suggestedOverlay: beat.suggestedOverlay ?? null,
          })) ?? [],
        overlayLines: [
          "Pause before you send",
          "Tone lands before intent",
          "Keep the reply steadier",
        ],
        cta: "If this feels familiar, you are not the only one.",
        contentType: "validation",
      },
    });
    updated = state.opportunities.find((item) => item.opportunityId === "opportunity-1");

    assert.equal(updated?.founderSelectionStatus, "hook-selected");
    assert.equal(updated?.selectedVideoBrief?.title, "Founder tuned reassurance brief");
    assert.equal(
      updated?.selectedVideoBrief?.goal,
      "Help a teacher lower the temperature before a parent email escalates.",
    );
    assert.equal(
      updated?.selectedVideoBrief?.structure[0]?.purpose,
      "Pause the reaction",
    );

    const reparsedState = await contentOpportunities.listContentOpportunityState();
    const reparsedOpportunity = reparsedState.opportunities.find(
      (item) => item.opportunityId === "opportunity-1",
    );

    assert.equal(
      reparsedOpportunity?.selectedVideoBrief?.title,
      "Founder tuned reassurance brief",
    );
    assert.equal(
      reparsedOpportunity?.selectedVideoBrief?.structure[0]?.purpose,
      "Pause the reaction",
    );

    state = await contentOpportunities.approveContentOpportunityVideoBrief("opportunity-1");
    updated = state.opportunities.find((item) => item.opportunityId === "opportunity-1");

    assert.equal(updated?.founderSelectionStatus, "approved");
    assert.equal(updated?.generationState, null);
    assert.equal(
      updated?.selectedVideoBrief?.title,
      "Founder tuned reassurance brief",
    );

    const reviewBrief = updated ? buildVideoFactoryReviewBrief(updated) : null;
    assert.ok(reviewBrief);
    assert.equal(
      reviewBrief?.primaryHook,
      "Before you send that reply, pause on this one line.",
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

    const thumbnailSpecStore = JSON.parse(
      await readFile(
        path.join(dataDir, "video-factory-thumbnail-specs.json"),
        "utf8",
      ),
    ) as {
      specs: Array<{
        providerId?: string;
        imageUrl?: string;
      }>;
    };

    assert.equal(thumbnailSpecStore.specs[0]?.providerId, "ffmpeg");
    assert.equal(
      thumbnailSpecStore.specs[0]?.imageUrl,
      "https://blob.example/generated-thumb.jpg",
    );
  });
});
