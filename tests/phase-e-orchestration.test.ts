import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import type { ContentOpportunity } from "../lib/content-opportunities";
import { buildPerformanceSignal } from "../lib/performance-signals";
import { buildProductionPackage } from "../lib/production-packages";
import { buildVideoBrief } from "../lib/video-briefs";

const REPO_ROOT = process.cwd();

function buildOpportunityFixture(): ContentOpportunity {
  return {
    opportunityId: "opportunity-1",
    signalId: "signal-1",
    title: "Teacher email anxiety",
    opportunityType: "pain_point_opportunity",
    status: "approved_for_production",
    priority: "high",
    source: {
      signalId: "signal-1",
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "Teachers worry about tone in parent emails.",
    painPointCategory: "parent-communication",
    teacherLanguage: ["I always second-guess the send button."],
    recommendedAngle: "Calm reassurance",
    recommendedHookDirection: "empathetic",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "Parent comms are peaking.",
    commercialPotential: "high",
    trustRisk: "low",
    riskSummary: null,
    confidence: 0.87,
    historicalCostAvg: 1.14,
    historicalApprovalRate: 0.66,
    suggestedNextStep: "Generate a video.",
    skipReason: null,
    hookOptions: ["Before you send this...", "That message needs one calmer read."],
    hookRanking: [{ hook: "Before you send this...", score: 18 }],
    performanceDrivers: {
      hookStrength: 4,
      viewerConnection: 4,
      conversionPotential: 4,
    },
    intendedViewerEffect: "relief",
    suggestedCTA: "Try Zaza Draft free.",
    productionComplexity: "low",
    growthIntelligence: {
      executionPath: "connect",
      executionPriority: 82,
      riskLevel: "low",
      expectedOutcome: "Strong connect handoff candidate.",
    },
    supportingSignals: [],
    memoryContext: {
      bestCombo: null,
      weakCombo: null,
      revenuePattern: null,
      audienceCue: "Primary and secondary teachers",
      caution: null,
    },
    sourceSignalIds: ["signal-1"],
    createdAt: "2026-03-23T10:00:00.000Z",
    updatedAt: "2026-03-23T10:05:00.000Z",
    approvedAt: "2026-03-23T10:01:00.000Z",
    dismissedAt: null,
    founderSelectionStatus: "approved",
    selectedAngleId: "angle-1",
    selectedHookId: "hook-1",
    selectedVideoBrief: {
      id: "brief-1",
      opportunityId: "opportunity-1",
      angleId: "angle-1",
      hookSetId: "hook-set-1",
      title: "Teachers second-guess every email",
      hook: "Every teacher knows the feeling of rereading the email five times.",
      format: "talking-head",
      durationSec: 30,
      goal: "Drive trials",
      tone: "teacher-real",
      structure: [
        { order: 1, purpose: "problem", guidance: "Email tone is easy to misread." },
        { order: 2, purpose: "solution", guidance: "Zaza Draft flags risky wording." },
        { order: 3, purpose: "reassurance", guidance: "Teachers feel calmer before sending." },
      ],
      visualDirection: "Simple portrait setup.",
      overlayLines: ["Tone check", "Send with confidence"],
      cta: "Try Zaza Draft free.",
      contentType: "solution",
      finalScriptTrustScore: 88,
      productionNotes: ["No exaggerated claims", "No urgency language"],
    },
    generationState: {
      videoBriefApprovedAt: "2026-03-23T10:02:00.000Z",
      videoBriefApprovedBy: "founder",
      factoryLifecycle: {
        factoryJobId: "factory-job-2",
        videoBriefId: "brief-1",
        provider: "runway",
        renderVersion: "v2",
        status: "accepted",
        draftAt: "2026-03-23T10:02:00.000Z",
        queuedAt: "2026-03-23T10:03:00.000Z",
        retryQueuedAt: null,
        preparingAt: "2026-03-23T10:03:10.000Z",
        generatingNarrationAt: "2026-03-23T10:03:20.000Z",
        generatingVisualsAt: "2026-03-23T10:03:30.000Z",
        generatingCaptionsAt: "2026-03-23T10:03:40.000Z",
        composingAt: "2026-03-23T10:03:50.000Z",
        generatedAt: "2026-03-23T10:04:00.000Z",
        reviewPendingAt: "2026-03-23T10:04:10.000Z",
        acceptedAt: "2026-03-23T10:04:20.000Z",
        rejectedAt: null,
        discardedAt: null,
        failedAt: null,
        failedPermanentAt: null,
        lastUpdatedAt: "2026-03-23T10:04:20.000Z",
        failureStage: null,
        failureMessage: null,
        retryState: null,
      },
      latestCostEstimate: {
        estimatedTotalUsd: 1.24,
        narrationCostUsd: 0.22,
        visualsCostUsd: 0.9,
        transcriptionCostUsd: 0.12,
        compositionCostUsd: 0,
        providerId: "runway-gen4",
        mode: "quality",
        estimatedAt: "2026-03-23T10:03:00.000Z",
      },
      latestActualCost: {
        jobId: "render-2",
        estimatedCostUsd: 1.24,
        actualCostUsd: 1.18,
        narrationActualUsd: 0.18,
        visualsActualUsd: 0.88,
        transcriptActualUsd: 0.12,
        compositionActualUsd: 0,
        providerId: "runway-gen4",
        completedAt: "2026-03-23T10:04:10.000Z",
      },
      latestBudgetGuard: null,
      latestQualityCheck: {
        passed: true,
        hasAudio: true,
        durationSeconds: 30,
        expectedDuration: 30,
        durationInRange: true,
        captionsPresent: true,
        sceneCount: 1,
        failures: [],
        checkedAt: "2026-03-23T10:04:00.000Z",
      },
      latestRetryState: null,
      runLedger: [],
      comparisonRecords: [],
      attemptLineage: [
        {
          attemptId: "attempt-2",
          factoryJobId: "factory-job-2",
          renderVersion: "v2",
          generationRequestId: "generation-2",
          renderJobId: "render-2",
          renderedAssetId: "asset-2",
          costEstimate: {
            estimatedTotalUsd: 1.24,
            narrationCostUsd: 0.22,
            visualsCostUsd: 0.9,
            transcriptionCostUsd: 0.12,
            compositionCostUsd: 0,
            providerId: "runway-gen4",
            mode: "quality",
            estimatedAt: "2026-03-23T10:03:00.000Z",
          },
          actualCost: {
            jobId: "render-2",
            estimatedCostUsd: 1.24,
            actualCostUsd: 1.18,
            narrationActualUsd: 0.18,
            visualsActualUsd: 0.88,
            transcriptActualUsd: 0.12,
            compositionActualUsd: 0,
            providerId: "runway-gen4",
            completedAt: "2026-03-23T10:04:10.000Z",
          },
          budgetGuard: null,
          qualityCheck: {
            passed: true,
            hasAudio: true,
            durationSeconds: 30,
            expectedDuration: 30,
            durationInRange: true,
            captionsPresent: true,
            sceneCount: 1,
            failures: [],
            checkedAt: "2026-03-23T10:04:00.000Z",
          },
          retryState: null,
          providerExecutions: [],
          narrationArtifact: {
            artifactId: "narration-artifact-1",
            artifactType: "narration_audio",
            executionId: "execution:narration",
            renderJobId: "render-2",
            renderVersion: "v2",
            narrationSpecId: "narration-spec-1",
            providerId: "elevenlabs",
            audioUrl: "https://blob.example/narration.mp3",
            storage: {
              backend: "blob",
              pathname: "factory/narration.mp3",
              url: "https://blob.example/narration.mp3",
              sourceUrl: null,
              contentType: "audio/mpeg",
              persistedAt: "2026-03-23T10:03:30.000Z",
              createdAt: "2026-03-23T10:03:30.000Z",
              retentionClass: "intermediate_artifact",
              retentionDays: 14,
              expiresAt: "2026-04-06T10:03:30.000Z",
              deletionEligible: false,
            },
            durationSec: 30,
            createdAt: "2026-03-23T10:03:30.000Z",
          },
          sceneArtifacts: [
            {
              artifactId: "scene-artifact-1",
              artifactType: "scene_video",
              executionId: "execution:visuals",
              renderJobId: "render-2",
              renderVersion: "v2",
              scenePromptId: "scene-prompt-1",
              providerId: "runway-gen4",
              assetUrl: "https://blob.example/scene-1.mp4",
              storage: {
                backend: "blob",
                pathname: "factory/scene-1.mp4",
                url: "https://blob.example/scene-1.mp4",
                sourceUrl: null,
                contentType: "video/mp4",
                persistedAt: "2026-03-23T10:03:40.000Z",
                createdAt: "2026-03-23T10:03:40.000Z",
                retentionClass: "intermediate_artifact",
                retentionDays: 14,
                expiresAt: "2026-04-06T10:03:40.000Z",
                deletionEligible: false,
              },
              order: 1,
              createdAt: "2026-03-23T10:03:40.000Z",
            },
          ],
          captionArtifact: {
            artifactId: "caption-artifact-1",
            artifactType: "caption_track",
            executionId: "execution:captions",
            renderJobId: "render-2",
            renderVersion: "v2",
            captionSpecId: "caption-spec-1",
            sourceNarrationId: "narration-1",
            providerId: "assemblyai",
            transcriptText: "Teachers reread the email five times before sending it.",
            captionUrl: "https://blob.example/caption.vtt",
            storage: {
              backend: "blob",
              pathname: "factory/caption.vtt",
              url: "https://blob.example/caption.vtt",
              sourceUrl: null,
              contentType: "text/vtt",
              persistedAt: "2026-03-23T10:03:45.000Z",
              createdAt: "2026-03-23T10:03:45.000Z",
              retentionClass: "intermediate_artifact",
              retentionDays: 14,
              expiresAt: "2026-04-06T10:03:45.000Z",
              deletionEligible: false,
            },
            createdAt: "2026-03-23T10:03:45.000Z",
          },
          composedVideoArtifact: {
            artifactId: "composed-artifact-1",
            artifactType: "composed_video",
            executionId: "execution:composition",
            renderJobId: "render-2",
            renderVersion: "v2",
            compositionSpecId: "composition-spec-1",
            providerId: "ffmpeg",
            videoUrl: "https://blob.example/video.mp4",
            thumbnailUrl: "https://blob.example/thumb.jpg",
            storage: {
              backend: "blob",
              pathname: "factory/video.mp4",
              url: "https://blob.example/video.mp4",
              sourceUrl: null,
              contentType: "video/mp4",
              persistedAt: "2026-03-23T10:04:00.000Z",
              createdAt: "2026-03-23T10:04:00.000Z",
              retentionClass: "intermediate_artifact",
              retentionDays: 14,
              expiresAt: "2026-04-06T10:04:00.000Z",
              deletionEligible: false,
            },
            durationSec: 30,
            createdAt: "2026-03-23T10:04:00.000Z",
          },
          thumbnailArtifact: {
            artifactId: "thumbnail-artifact-1",
            artifactType: "thumbnail_image",
            renderJobId: "render-2",
            renderVersion: "v2",
            providerId: "ffmpeg",
            imageUrl: "https://blob.example/thumb.jpg",
            storage: {
              backend: "blob",
              pathname: "factory/thumb.jpg",
              url: "https://blob.example/thumb.jpg",
              sourceUrl: null,
              contentType: "image/jpeg",
              persistedAt: "2026-03-23T10:04:00.000Z",
              createdAt: "2026-03-23T10:04:00.000Z",
              retentionClass: "intermediate_artifact",
              retentionDays: 14,
              expiresAt: "2026-04-06T10:04:00.000Z",
              deletionEligible: false,
            },
            createdAt: "2026-03-23T10:04:00.000Z",
          },
          createdAt: "2026-03-23T10:04:00.000Z",
        },
      ],
      narrationSpec: {
        id: "narration-spec-1",
        opportunityId: "opportunity-1",
        videoBriefId: "brief-1",
        script: "Every teacher knows the feeling of rereading the email five times before sending it.",
        tone: "teacher-real",
        pace: "steady",
        targetDurationSec: 30,
      },
      videoPrompt: {
        id: "video-prompt-1",
        opportunityId: "opportunity-1",
        videoBriefId: "brief-1",
        format: "talking-head",
        scenePrompts: [
          "A calm teacher at a desk",
          "A closer shot of the teacher revising the email",
          "A final calmer pause before sending",
        ],
        overlayPlan: ["Tone check", "Send with confidence"],
        styleGuardrails: ["No hype", "Natural light", "Readable pace"],
      },
      generationRequest: {
        id: "generation-2",
        opportunityId: "opportunity-1",
        videoBriefId: "brief-1",
        renderVersion: "v2",
        idempotencyKey: "idempotency-2",
        narrationSpecId: "narration-spec-1",
        videoPromptId: "video-prompt-1",
        approvedAt: "2026-03-23T10:03:00.000Z",
        approvedBy: "founder",
        status: "completed",
      },
      renderJob: {
        id: "render-2",
        batchId: null,
        generationRequestId: "generation-2",
        idempotencyKey: "idempotency-2",
        provider: "runway",
        renderVersion: "v2",
        compiledProductionPlan: {
          id: "compiled-plan-1",
          opportunityId: "opportunity-1",
          videoBriefId: "brief-1",
          defaultsSnapshot: {
            id: "prod-default:teacher-real-core",
            profileId: "prod-default:teacher-real-core",
            version: 1,
            changedAt: "2026-03-22T00:00:00.000Z",
            changedSource: "system-bootstrap",
            changeNote: null,
            name: "Teacher-Real Core",
            isActive: true,
            voiceProvider: "elevenlabs",
            voiceId: "teacher-real-core-v1",
            voiceSettings: {
              stability: 0.48,
              similarityBoost: 0.72,
              style: 0.14,
              speakerBoost: true,
            },
            styleAnchorPrompt: "Teacher-real anchor prompt.",
            referenceImageUrl: null,
            modelFamily: null,
            motionStyle: "Quiet cuts.",
            negativeConstraints: ["No hype"],
            aspectRatio: "9:16",
            resolution: "1080p",
            captionStyle: {
              preset: "teacher-real-clean",
              placement: "lower-third",
              casing: "sentence",
            },
            compositionDefaults: {
              transitionStyle: "gentle-cut",
              musicMode: "none",
            },
            reviewDefaults: {
              requireCaptionCheck: true,
            },
            providerFallbacks: {
              narration: ["elevenlabs"],
              visuals: ["runway-gen4"],
              captions: ["assemblyai"],
              composition: ["ffmpeg"],
            },
            updatedAt: "2026-03-22T00:00:00.000Z",
          },
          narrationSpec: {
            id: "narration-spec-1",
            opportunityId: "opportunity-1",
            videoBriefId: "brief-1",
            script: "Every teacher knows the feeling of rereading the email five times before sending it.",
            tone: "teacher-real",
            pace: "steady",
            targetDurationSec: 30,
          },
          scenePrompts: [
            {
              id: "scene-prompt-1",
              videoBriefId: "brief-1",
              visualPrompt: "A calm teacher at a desk.",
              overlayText: "Tone check",
              order: 1,
              purpose: "recognition",
              durationSec: 30,
            },
          ],
          captionSpec: {
            id: "caption-spec-1",
            videoBriefId: "brief-1",
            sourceText: "Every teacher knows the feeling of rereading the email five times before sending it.",
            stylePreset: "teacher-real-clean",
            placement: "lower-third",
            casing: "sentence",
          },
          compositionSpec: {
            id: "composition-spec-1",
            videoBriefId: "brief-1",
            aspectRatio: "9:16",
            resolution: "1080p",
            sceneOrder: ["scene-prompt-1"],
            narrationSpecId: "narration-spec-1",
            captionSpecId: "caption-spec-1",
          },
          finalScriptTrustAssessment: {
            score: 88,
            status: "safe",
            adjusted: false,
            reasons: [],
          },
          trustAssessment: {
            score: 86,
            status: "safe",
            adjusted: false,
            reasons: [],
          },
        },
        productionDefaultsSnapshot: {
          id: "prod-default:teacher-real-core",
          profileId: "prod-default:teacher-real-core",
          version: 1,
          changedAt: "2026-03-22T00:00:00.000Z",
          changedSource: "system-bootstrap",
          changeNote: null,
          name: "Teacher-Real Core",
          isActive: true,
          voiceProvider: "elevenlabs",
          voiceId: "teacher-real-core-v1",
          voiceSettings: {
            stability: 0.48,
            similarityBoost: 0.72,
            style: 0.14,
            speakerBoost: true,
          },
          styleAnchorPrompt: "Teacher-real anchor prompt.",
          referenceImageUrl: null,
          modelFamily: null,
          motionStyle: "Quiet cuts.",
          negativeConstraints: ["No hype"],
          aspectRatio: "9:16",
          resolution: "1080p",
          captionStyle: {
            preset: "teacher-real-clean",
            placement: "lower-third",
            casing: "sentence",
          },
          compositionDefaults: {
            transitionStyle: "gentle-cut",
            musicMode: "none",
          },
          reviewDefaults: {
            requireCaptionCheck: true,
          },
          providerFallbacks: {
            narration: ["elevenlabs"],
            visuals: ["runway-gen4"],
            captions: ["assemblyai"],
            composition: ["ffmpeg"],
          },
          updatedAt: "2026-03-22T00:00:00.000Z",
        },
        providerJobId: "provider-job-2",
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
        submittedAt: "2026-03-23T10:03:00.000Z",
        completedAt: "2026-03-23T10:04:10.000Z",
        errorMessage: null,
      },
      renderedAsset: {
        id: "asset-2",
        renderJobId: "render-2",
        assetType: "video",
        url: "https://blob.example/video.mp4",
        thumbnailUrl: "https://blob.example/thumb.jpg",
        durationSec: 30,
        createdAt: "2026-03-23T10:04:10.000Z",
      },
      assetReview: {
        id: "review-2",
        renderedAssetId: "asset-2",
        status: "accepted",
        reviewedAt: "2026-03-23T10:05:00.000Z",
        structuredReasons: [],
        reviewNotes: "Approved.",
        rejectionReason: null,
      },
      performanceSignals: [],
    },
    operatorNotes: null,
  };
}

async function withTempPhaseEModule(
  run: (context: {
    dataDir: string;
    loadModule: () => Promise<typeof import("../lib/phase-e-orchestration")>;
  }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "phase-e-orchestration-"));
  const dataDir = path.join(tempDir, "data");
  await mkdir(dataDir, { recursive: true });
  process.chdir(tempDir);

  try {
    await run({
      dataDir,
      loadModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "phase-e-orchestration.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
    });
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("buildConnectHandoffPackage and buildCreatorBrief derive stable Phase E export contracts", async () => {
  const opportunity = buildOpportunityFixture();
  const productionPackage = buildProductionPackage({
    opportunity,
  });
  const phaseEModule = await import("../lib/phase-e-orchestration");
  const handoffPackage = phaseEModule.buildConnectHandoffPackage({
    opportunity,
    productionPackage,
  });
  const creatorBrief = phaseEModule.buildCreatorBrief({
    opportunity,
    productionPackage,
  });

  assert.equal(handoffPackage.contentType, "solution");
  assert.equal(handoffPackage.suggestedCampaignType, "influencer");
  assert.equal(handoffPackage.videoUrl, "https://blob.example/video.mp4");
  assert.equal(handoffPackage.publishPackages.length, 3);
  assert.equal(handoffPackage.publishPackages[0]?.deliveryAsset?.deliveryClass, "cdn_ready");
  assert.equal(typeof handoffPackage.publishPackages[0]?.captionDraft, "string");
  assert.equal(
    handoffPackage.publishPackages[0]?.finalVideoConfig.captionFormat,
    "burned_in_dynamic",
  );
  assert.equal(
    handoffPackage.publishPackages[1]?.finalVideoConfig.aspectRatio,
    "4:5",
  );
  assert.equal(
    handoffPackage.publishPackages[2]?.metadataBundle.channelLabel,
    "Instagram Reels",
  );
  assert.equal(typeof handoffPackage.publishPackages[0]?.requiresCoverFrame, "boolean");
  assert.equal(creatorBrief.referenceVideoUrl, "https://blob.example/video.mp4");
  assert.equal(creatorBrief.callToAction, "Try Zaza Draft free.");
});

test("syncPhaseEArtifactsForProductionPackage persists creator briefs, connect handoff packages, and content series", { concurrency: false }, async () => {
  await withTempPhaseEModule(async ({ dataDir, loadModule }) => {
    const phaseEModule = await loadModule();
    const opportunity = buildOpportunityFixture();
    const productionPackage = buildProductionPackage({
      opportunity,
    });

    const synced = await phaseEModule.syncPhaseEArtifactsForProductionPackage({
      opportunity,
      productionPackage,
    });

    assert.ok(synced.connectHandoffPackage);
    assert.ok(synced.creatorBrief);
    assert.ok(synced.contentSeries);

    const rawStore = JSON.parse(
      await readFile(path.join(dataDir, "phase-e-orchestration.json"), "utf8"),
    ) as {
      connectHandoffPackages: Array<{ packageId: string }>;
      creatorBriefs: Array<{ briefId: string }>;
      contentSeries: Array<{ seriesId: string }>;
    };

    assert.equal(rawStore.connectHandoffPackages.length, 1);
    assert.equal(rawStore.creatorBriefs.length, 1);
    assert.equal(rawStore.contentSeries.length, 1);
  });
});

test("buildConnectPerformanceSignal extends the base performance signal without changing its identity fields", async () => {
  const phaseEModule = await import("../lib/phase-e-orchestration");
  const baseSignal = buildPerformanceSignal({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    renderedAssetId: "asset-2",
    eventType: "asset_accepted",
    createdAt: "2026-03-24T10:00:00.000Z",
    metadata: {
      provider: "runway",
    },
  });

  const connectSignal = phaseEModule.buildConnectPerformanceSignal({
    baseSignal,
    campaignType: "organic",
    connectOutcome: "campaign_launched",
    connectNotes: "LinkedIn pilot launched from the approved asset.",
  });

  assert.equal(connectSignal.id, baseSignal.id);
  assert.equal(connectSignal.source, "connect");
  assert.equal(connectSignal.campaignType, "organic");
  assert.equal(connectSignal.connectOutcome, "campaign_launched");
});

test("upsertConnectPerformanceSignal persists and lists Connect feedback signals", { concurrency: false }, async () => {
  await withTempPhaseEModule(async ({ dataDir, loadModule }) => {
    const phaseEModule = await loadModule();
    const baseSignal = buildPerformanceSignal({
      opportunityId: "opportunity-1",
      videoBriefId: "brief-1",
      renderedAssetId: "asset-2",
      eventType: "asset_generated",
      createdAt: "2026-03-24T11:00:00.000Z",
      metadata: {
        provider: "runway",
      },
    });

    const persisted = await phaseEModule.upsertConnectPerformanceSignal(
      phaseEModule.buildConnectPerformanceSignal({
        baseSignal,
        campaignType: "paid",
        connectOutcome: "underperformed",
        connectNotes: "Low click-through from the first campaign handoff.",
      }),
    );

    const listed = phaseEModule.listConnectPerformanceSignals();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, persisted.id);
    assert.equal(listed[0]?.campaignType, "paid");
    assert.equal(listed[0]?.connectOutcome, "underperformed");

    const rawStore = JSON.parse(
      await readFile(path.join(dataDir, "phase-e-orchestration.json"), "utf8"),
    ) as {
      connectPerformanceSignals: Array<{
        id: string;
        campaignType: string;
        connectOutcome: string;
      }>;
    };

    assert.equal(rawStore.connectPerformanceSignals.length, 1);
    assert.equal(rawStore.connectPerformanceSignals[0]?.id, persisted.id);
    assert.equal(rawStore.connectPerformanceSignals[0]?.campaignType, "paid");
    assert.equal(
      rawStore.connectPerformanceSignals[0]?.connectOutcome,
      "underperformed",
    );
  });
});

test("buildVideoBrief assigns contentType at brief creation time", () => {
  const opportunity = buildOpportunityFixture();
  opportunity.selectedVideoBrief = null;
  const brief = buildVideoBrief(
    opportunity,
    {
      id: "angle-1",
      title: "One calmer response",
      summary: "Give teachers one practical next move.",
      style: "practical-help",
      coreMessage: "A calmer draft protects the relationship.",
      teacherVoiceLine: "You do not need a perfect message. You need a safer one.",
    } as never,
    {
      id: "hook-set-1",
      primaryHook: {
        id: "hook-1",
        text: "Before you send this message, read it once like a parent would.",
      },
    } as never,
  );

  assert.equal(brief.contentType, "solution");
});
