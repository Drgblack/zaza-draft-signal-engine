import assert from "node:assert/strict";
import test from "node:test";

import type { ContentOpportunity } from "../lib/content-opportunities";
import {
  buildProductionPackage,
  listCleanupEligibleProductionPackages,
} from "../lib/production-packages";

function buildOpportunityFixture(
  reviewStatus: "accepted" | "rejected" | "discarded" | "pending_review" = "accepted",
): ContentOpportunity {
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
    painPointCategory: null,
    teacherLanguage: ["I always second-guess the send button."],
    recommendedAngle: "Calm reassurance",
    recommendedHookDirection: "empathetic",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "Parent comms are peaking.",
    commercialPotential: "high",
    trustRisk: "low",
    riskSummary: null,
    confidence: null,
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
      contentType: null,
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
        status: reviewStatus === "accepted" ? "accepted" : "review_pending",
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
        acceptedAt: reviewStatus === "accepted" ? "2026-03-23T10:04:20.000Z" : null,
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
      latestBudgetGuard: {
        status: "warning",
        estimatedTotalUsd: 1.24,
        warningThresholdUsd: 1,
        hardStopThresholdUsd: 2,
        warningMessage: "Estimated run cost $1.24 exceeds the warning threshold of $1.00.",
        hardStopMessage: null,
        evaluatedAt: "2026-03-23T10:03:00.000Z",
      },
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
      latestRetryState: {
        retryCount: 0,
        maxRetries: 2,
        backoffDelayMs: null,
        nextRetryAt: null,
        lastFailureAt: null,
        retryStage: null,
        failureMode: "none",
        exhausted: false,
      },
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
          budgetGuard: {
            status: "warning",
            estimatedTotalUsd: 1.24,
            warningThresholdUsd: 1,
            hardStopThresholdUsd: 2,
            warningMessage: "Estimated run cost $1.24 exceeds the warning threshold of $1.00.",
            hardStopMessage: null,
            evaluatedAt: "2026-03-23T10:03:00.000Z",
          },
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
            artifactId: "narration-1",
            artifactType: "narration_audio",
            executionId: "exec-narration-1",
            renderJobId: "render-2",
            renderVersion: "v2",
            narrationSpecId: "narration-spec-1",
            providerId: "elevenlabs",
            audioUrl: "https://blob.example/narration.mp3",
            storage: {
              backend: "blob",
              pathname: "video-factory/narration.mp3",
              url: "https://blob.example/narration.mp3",
              sourceUrl: "https://source.example/narration.mp3",
              contentType: "audio/mpeg",
              persistedAt: "2026-03-23T10:03:21.000Z",
            },
            durationSec: 30,
            createdAt: "2026-03-23T10:03:20.000Z",
          },
          sceneArtifacts: [
            {
              artifactId: "scene-1",
              artifactType: "scene_video",
              executionId: "exec-scene-1",
              renderJobId: "render-2",
              renderVersion: "v2",
              scenePromptId: "scene-prompt-1",
              providerId: "runway-gen4",
              assetUrl: "https://blob.example/scene-1.mp4",
              order: 1,
              storage: null,
              createdAt: "2026-03-23T10:03:31.000Z",
            },
          ],
          captionArtifact: {
            artifactId: "caption-1",
            artifactType: "caption_track",
            executionId: "exec-caption-1",
            renderJobId: "render-2",
            renderVersion: "v2",
            captionSpecId: "caption-spec-1",
            sourceNarrationId: "narration-1",
            providerId: "assemblyai",
            transcriptText: "Transcript",
            captionUrl: "https://blob.example/caption.vtt",
            storage: {
              backend: "blob",
              pathname: "video-factory/caption.vtt",
              url: "https://blob.example/caption.vtt",
              sourceUrl: "https://source.example/caption.vtt",
              contentType: "text/vtt",
              persistedAt: "2026-03-23T10:03:41.000Z",
            },
            createdAt: "2026-03-23T10:03:40.000Z",
          },
          composedVideoArtifact: {
            artifactId: "video-1",
            artifactType: "composed_video",
            executionId: "exec-video-1",
            renderJobId: "render-2",
            renderVersion: "v2",
            compositionSpecId: "composition-spec-1",
            providerId: "ffmpeg",
            videoUrl: "https://blob.example/video.mp4",
            thumbnailUrl: "https://blob.example/thumb.jpg",
            durationSec: 30,
            storage: {
              backend: "blob",
              pathname: "video-factory/video.mp4",
              url: "https://blob.example/video.mp4",
              sourceUrl: "https://source.example/video.mp4",
              contentType: "video/mp4",
              persistedAt: "2026-03-23T10:04:01.000Z",
            },
            createdAt: "2026-03-23T10:04:00.000Z",
          },
          thumbnailArtifact: {
            artifactId: "thumb-1",
            artifactType: "thumbnail_image",
            renderJobId: "render-2",
            renderVersion: "v2",
            providerId: "ffmpeg",
            imageUrl: "https://blob.example/thumb.jpg",
            storage: {
              backend: "blob",
              pathname: "video-factory/thumb.jpg",
              url: "https://blob.example/thumb.jpg",
              sourceUrl: "https://source.example/thumb.jpg",
              contentType: "image/jpeg",
              persistedAt: "2026-03-23T10:04:01.000Z",
            },
            createdAt: "2026-03-23T10:04:00.000Z",
          },
          createdAt: "2026-03-23T10:04:10.000Z",
        },
      ],
      narrationSpec: {
        id: "narration-spec-1",
        opportunityId: "opportunity-1",
        videoBriefId: "brief-1",
        targetDurationSec: 30,
        script: "Narration text for testing.",
        tone: "teacher-real",
        pace: "steady",
      },
      videoPrompt: {
        id: "video-prompt-1",
        opportunityId: "opportunity-1",
        videoBriefId: "brief-1",
        format: "talking-head",
        scenePrompts: [
          "Single person speaking directly to camera.",
          "Hold on the speaker while the recognition line lands.",
          "Close with the speaker still on camera.",
        ],
        overlayPlan: ["Tone check", "Send with confidence"],
        styleGuardrails: [
          "Keep the visual tone calm, readable, and teacher-real.",
          "Avoid polished ad styling, flashy motion, or heavy transitions.",
          "Do not make the product the hero before the final beat.",
        ],
        negativePrompt: "No hype",
      },
      generationRequest: {
        id: "generation-2",
        opportunityId: "opportunity-1",
        videoBriefId: "brief-1",
        renderVersion: "v2",
        idempotencyKey: "idempotency-1",
        narrationSpecId: "narration-spec-1",
        videoPromptId: "video-prompt-1",
        approvedAt: "2026-03-23T10:02:00.000Z",
        approvedBy: "founder",
        status: "completed",
      },
      renderJob: {
        id: "render-2",
        batchId: "batch-export-1",
        generationRequestId: "generation-2",
        idempotencyKey: "idempotency-1",
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
              visuals: ["runway-gen4", "kling-2"],
              captions: ["local-default"],
              composition: ["local-default"],
            },
            updatedAt: "2026-03-22T00:00:00.000Z",
          },
          narrationSpec: {
            id: "narration-spec-1",
            opportunityId: "opportunity-1",
            videoBriefId: "brief-1",
            targetDurationSec: 30,
            script: "Narration text for testing.",
            tone: "teacher-real",
            pace: "steady",
          },
          scenePrompts: [
            {
              id: "scene-prompt-1",
              videoBriefId: "brief-1",
              visualPrompt: "Scene one visual prompt.",
              overlayText: "Scene one",
              order: 1,
              purpose: "hook",
              durationSec: 30,
            },
          ],
          captionSpec: {
            id: "caption-spec-1",
            videoBriefId: "brief-1",
            sourceText: "Caption source text.",
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
            transitionStyle: "gentle-cut",
            musicMode: "none",
          },
          trustAssessment: {
            score: 91,
            status: "safe",
            adjusted: false,
            reasons: [],
          },
          finalScriptTrustAssessment: {
            score: 88,
            status: "safe",
            adjusted: false,
            reasons: [],
          },
        },
        productionDefaultsSnapshot: null,
        providerJobId: "provider-job-2",
        preTriageConcern: null,
        regenerationReason: null,
        regenerationReasonCodes: [],
        regenerationNotes: null,
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
        budgetGuard: {
          status: "warning",
          estimatedTotalUsd: 1.24,
          warningThresholdUsd: 1,
          hardStopThresholdUsd: 2,
          warningMessage: "Estimated run cost $1.24 exceeds the warning threshold of $1.00.",
          hardStopMessage: null,
          evaluatedAt: "2026-03-23T10:03:00.000Z",
        },
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
        status: reviewStatus,
        reviewedAt: reviewStatus === "accepted" ? "2026-03-23T10:04:20.000Z" : null,
        structuredReasons:
          reviewStatus === "accepted"
            ? []
            : reviewStatus === "pending_review"
              ? []
              : ["not_publish_ready"],
        reviewNotes: null,
        rejectionReason: null,
      },
      performanceSignals: [],
    },
    operatorNotes: null,
  };
}

test("buildProductionPackage exports accepted real artifacts and lineage", () => {
  const productionPackage = buildProductionPackage({
    opportunity: buildOpportunityFixture("accepted"),
  });

  assert.equal(productionPackage.exportSource, "accepted_render");
  assert.equal(productionPackage.renderJob?.id, "render-2");
  assert.equal(productionPackage.artifacts.narration?.storage?.url, "https://blob.example/narration.mp3");
  assert.equal(productionPackage.artifacts.captions?.storage?.url, "https://blob.example/caption.vtt");
  assert.equal(productionPackage.artifacts.composedVideo?.storage?.url, "https://blob.example/video.mp4");
  assert.equal(productionPackage.artifacts.thumbnail?.storage?.url, "https://blob.example/thumb.jpg");
  assert.equal(productionPackage.qualityCheck?.passed, true);
  assert.equal(productionPackage.assetReview?.status, "accepted");
  assert.equal(productionPackage.lineage?.attemptId, "attempt-2");
  assert.equal(productionPackage.narrationSpec?.id, "narration-spec-1");
  assert.equal(productionPackage.publishOutcome?.published, false);
  assert.equal(productionPackage.publishOutcome?.renderedAssetId, "asset-2");
  assert.equal(
    productionPackage.retention.retentionClass,
    "exported_production_package",
  );
  assert.equal(productionPackage.publishReadyPackage.isPublishReady, true);
  assert.equal(productionPackage.brief.finalScriptTrustScore, 88);
  assert.equal(productionPackage.compiledProductionPlan?.finalScriptTrustAssessment?.score, 88);
  assert.equal(
    productionPackage.publishReadyPackage.approvedOutputRetention?.retentionClass,
    "final_approved_output",
  );
  assert.equal(
    productionPackage.publishReadyPackage.acceptedRenderedAsset?.url,
    "https://blob.example/video.mp4",
  );
  assert.equal(
    productionPackage.publishReadyPackage.narrationArtifact?.storage?.url,
    "https://blob.example/narration.mp3",
  );
  assert.equal(
    productionPackage.publishReadyPackage.captionArtifact?.storage?.url,
    "https://blob.example/caption.vtt",
  );
  assert.equal(
    productionPackage.publishReadyPackage.compositionArtifact?.storage?.url,
    "https://blob.example/video.mp4",
  );
  assert.equal(
    productionPackage.publishReadyPackage.compositionArtifact?.storage?.retentionClass,
    "final_approved_output",
  );
  assert.equal(
    productionPackage.publishReadyPackage.lifecycleSummary?.status,
    "accepted",
  );
  assert.deepEqual(
    productionPackage.publishReadyPackage.reviewReasonCodes,
    [],
  );
  assert.equal(productionPackage.connectSummary.isPublishReady, true);
  assert.equal(productionPackage.connectSummary.finalVideoUrl, "https://blob.example/video.mp4");
  assert.equal(productionPackage.connectSummary.thumbnailUrl, "https://blob.example/thumb.jpg");
  assert.equal(productionPackage.connectSummary.narrationAudioUrl, "https://blob.example/narration.mp3");
  assert.equal(productionPackage.connectSummary.captionTrackUrl, "https://blob.example/caption.vtt");
  assert.deepEqual(productionPackage.connectSummary.sceneAssetUrls, [
    "https://blob.example/scene-1.mp4",
  ]);
  assert.equal(productionPackage.connectSummary.providerStack?.narrationProvider, "elevenlabs");
  assert.equal(productionPackage.connectSummary.providerStack?.captionProvider, "assemblyai");
  assert.equal(productionPackage.connectSummary.batchId, "batch-export-1");
  assert.deepEqual(productionPackage.connectSummary.providerStack?.visualProviders, [
    "runway-gen4",
  ]);
  assert.equal(productionPackage.connectSummary.reviewStatus, "accepted");
});

test("buildProductionPackage falls back to latest attempt when the current render is not accepted", () => {
  const productionPackage = buildProductionPackage({
    opportunity: buildOpportunityFixture("rejected"),
  });

  assert.equal(productionPackage.exportSource, "latest_attempt");
  assert.equal(productionPackage.artifacts.sceneAssets.length, 1);
  assert.equal(productionPackage.artifacts.composedVideo?.providerId, "ffmpeg");
  assert.equal(productionPackage.publishReadyPackage.isPublishReady, false);
  assert.equal(productionPackage.publishReadyPackage.approvedOutputRetention, null);
  assert.equal(
    productionPackage.publishReadyPackage.reviewOutcome?.status,
    "rejected",
  );
  assert.equal(productionPackage.connectSummary.handoffStatus, "latest_attempt");
  assert.equal(productionPackage.connectSummary.isPublishReady, false);
  assert.equal(productionPackage.connectSummary.reviewStatus, "rejected");
  assert.deepEqual(productionPackage.connectSummary.reviewReasonCodes, [
    "not_publish_ready",
  ]);
});

test("buildProductionPackage stays deterministic without legacy videoPrompt state", () => {
  const opportunity = buildOpportunityFixture("accepted");
  if (!opportunity.generationState) {
    throw new Error("Expected generation state fixture.");
  }

  opportunity.generationState.videoPrompt = null;

  const productionPackage = buildProductionPackage({
    opportunity,
  });

  assert.equal(productionPackage.videoPrompt, null);
  assert.equal(productionPackage.narrationSpec?.id, "narration-spec-1");
  assert.equal(productionPackage.publishReadyPackage.compiledProductionPlanId, "compiled-plan-1");
  assert.equal(productionPackage.publishReadyPackage.isPublishReady, true);
});

test("listCleanupEligibleProductionPackages returns expired exported packages only", () => {
  const productionPackage = buildProductionPackage({
    opportunity: buildOpportunityFixture("accepted"),
  });

  const eligible = listCleanupEligibleProductionPackages(
    [
      {
        ...productionPackage,
        retention: {
          ...productionPackage.retention,
          createdAt: "2025-01-01T00:00:00.000Z",
          retentionDays: 30,
          expiresAt: "2025-01-31T00:00:00.000Z",
          deletionEligible: false,
        },
      },
      productionPackage,
    ],
    { asOf: "2026-03-23T10:00:00.000Z" },
  );

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0]?.id, productionPackage.id);
});
