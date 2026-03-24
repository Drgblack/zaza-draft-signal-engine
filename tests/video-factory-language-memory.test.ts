import assert from "node:assert/strict";
import test from "node:test";

import type { ContentOpportunity } from "../lib/content-opportunities";
import { extractVideoFactoryLanguageMemoryRecords } from "../lib/video-factory-language-memory";

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
    painPointCategory: null,
    teacherLanguage: [
      "I always second-guess the send button.",
      "One email can ruin your whole afternoon.",
    ],
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
      finalScriptTrustScore: null,
      productionNotes: ["No exaggerated claims"],
    },
    generationState: {
      videoBriefApprovedAt: "2026-03-23T10:02:00.000Z",
      videoBriefApprovedBy: "founder",
      factoryLifecycle: {
        factoryJobId: "factory-job-1",
        videoBriefId: "brief-1",
        provider: "runway",
        renderVersion: "v1",
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
          renderVersion: "v1",
          generationRequestId: "generation-1",
          renderJobId: "render-1",
          renderedAssetId: "asset-1",
          costEstimate: {
            estimatedTotalUsd: 1.2,
            narrationCostUsd: 0.2,
            visualsCostUsd: 0.85,
            transcriptionCostUsd: 0.1,
            compositionCostUsd: 0.05,
            providerId: "runway-gen4",
            mode: "quality",
            estimatedAt: "2026-03-23T10:03:00.000Z",
          },
          actualCost: null,
          budgetGuard: null,
          qualityCheck: null,
          retryState: null,
          providerExecutions: [],
          narrationArtifact: null,
          sceneArtifacts: [],
          captionArtifact: null,
          composedVideoArtifact: null,
          thumbnailArtifact: null,
          createdAt: "2026-03-23T10:04:10.000Z",
        },
      ],
      narrationSpec: {
        id: "narration-spec-1",
        opportunityId: "opportunity-1",
        videoBriefId: "brief-1",
        targetDurationSec: 30,
        script:
          "Every teacher knows the feeling of rereading the email five times. Tone check helps you send with confidence.",
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
          "Hold on the recognition line.",
          "Close on the calm CTA.",
        ],
        overlayPlan: ["Tone check", "Send with confidence"],
        styleGuardrails: [
          "Keep the visual tone calm.",
          "Avoid polished ad styling.",
          "Do not make the product the hero.",
        ],
        negativePrompt: "No hype",
      },
      generationRequest: null,
      renderJob: {
        id: "render-1",
        generationRequestId: "generation-1",
        idempotencyKey: "idempotency-1",
        provider: "runway",
        renderVersion: "v1",
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
            script:
              "Every teacher knows the feeling of rereading the email five times. Tone check helps you send with confidence.",
            tone: "teacher-real",
            pace: "steady",
          },
          scenePrompts: [
            {
              id: "scene-prompt-1",
              videoBriefId: "brief-1",
              visualPrompt: "Scene one visual prompt.",
              overlayText: "Tone check",
              order: 1,
              purpose: "hook",
              durationSec: 15,
            },
            {
              id: "scene-prompt-2",
              videoBriefId: "brief-1",
              visualPrompt: "Scene two visual prompt.",
              overlayText: "Send with confidence",
              order: 2,
              purpose: "cta",
              durationSec: 15,
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
            sceneOrder: ["scene-prompt-1", "scene-prompt-2"],
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
          finalScriptTrustAssessment: null,
        },
        productionDefaultsSnapshot: null,
        providerJobId: "provider-job-1",
        preTriageConcern: null,
        regenerationReason: null,
        regenerationReasonCodes: [],
        regenerationNotes: null,
        costEstimate: null,
        actualCost: null,
        budgetGuard: null,
        qualityCheck: null,
        retryState: null,
        status: "completed",
        submittedAt: "2026-03-23T10:03:00.000Z",
        completedAt: "2026-03-23T10:04:10.000Z",
        errorMessage: null,
      },
      renderedAsset: {
        id: "asset-1",
        renderJobId: "render-1",
        assetType: "video",
        url: "https://blob.example/video.mp4",
        thumbnailUrl: "https://blob.example/thumb.jpg",
        durationSec: 30,
        createdAt: "2026-03-23T10:04:10.000Z",
      },
      assetReview: {
        id: "review-1",
        renderedAssetId: "asset-1",
        status: "accepted",
        reviewedAt: "2026-03-23T10:04:20.000Z",
        structuredReasons: [],
        reviewNotes: null,
        rejectionReason: null,
      },
      performanceSignals: [],
    },
    operatorNotes: null,
  };
}

test("extractVideoFactoryLanguageMemoryRecords captures grounded accepted language only from persisted fields", () => {
  const records = extractVideoFactoryLanguageMemoryRecords({
    opportunity: buildOpportunityFixture(),
    reviewOutcome: "accepted",
    reviewedAt: "2026-03-23T10:04:20.000Z",
  });

  assert.equal(
    records.some(
      (record) =>
        record.phraseType === "original_teacher_language" &&
        record.phrase === "I always second-guess the send button.",
    ),
    true,
  );
  assert.equal(
    records.some(
      (record) =>
        record.phraseType === "approved_brief_anchor" &&
        record.phrase === "Teachers second-guess every email",
    ),
    true,
  );
  assert.equal(
    records.some(
      (record) =>
        record.phraseType === "accepted_narration_phrase" &&
        record.phrase ===
          "Tone check helps you send with confidence.",
    ),
    true,
  );
  assert.equal(
    records.some(
      (record) =>
        record.phraseType === "accepted_overlay_phrase" &&
        record.phrase === "Tone check",
    ),
    true,
  );
});

test("extractVideoFactoryLanguageMemoryRecords captures grounded rejected phrases without inventing new text", () => {
  const opportunity = buildOpportunityFixture();
  opportunity.generationState!.assetReview!.status = "rejected";

  const records = extractVideoFactoryLanguageMemoryRecords({
    opportunity,
    reviewOutcome: "rejected",
    reviewedAt: "2026-03-23T10:04:20.000Z",
  });

  assert.equal(records.every((record) => record.phraseType === "rejected_phrase"), true);
  assert.equal(
    records.some(
      (record) =>
        record.sourceKind === "brief_hook" &&
        record.phrase ===
          "Every teacher knows the feeling of rereading the email five times.",
    ),
    true,
  );
  assert.equal(
    records.some(
      (record) =>
        record.sourceKind === "narration_script" &&
        record.phrase === "Tone check helps you send with confidence.",
    ),
    true,
  );
});
