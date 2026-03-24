import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCostEstimate,
  buildJobCostRecord,
  evaluateVideoFactoryBudgetGuard,
  evaluateVideoFactoryDailySpendGuard,
  getVideoFactoryDailySpendCapUsd,
  getVideoFactoryMaxRegenerationsPerBrief,
} from "../lib/video-factory-cost";

test("buildCostEstimate derives deterministic per-stage cost from compiled plan", () => {
  const costEstimate = buildCostEstimate({
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
        targetDurationSec: 45,
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
          durationSec: 23,
        },
        {
          id: "scene-prompt-2",
          videoBriefId: "brief-1",
          visualPrompt: "Scene two visual prompt.",
          overlayText: "Scene two",
          order: 2,
          purpose: "cta",
          durationSec: 22,
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
    estimatedAt: "2026-03-22T10:00:00.000Z",
  });

  assert.equal(costEstimate.providerId, "runway-gen4");
  assert.equal(costEstimate.mode, "quality");
  assert.equal(costEstimate.narrationCostUsd, 0.018);
  assert.equal(costEstimate.visualsCostUsd, 0.9);
  assert.equal(costEstimate.transcriptionCostUsd, 0.0054);
  assert.equal(costEstimate.compositionCostUsd, 0);
  assert.equal(costEstimate.estimatedTotalUsd, 0.9234);
});

test("buildJobCostRecord derives provider-aware actual costs from the completed artifacts", () => {
  const actualCost = buildJobCostRecord({
    jobId: "render-job-1",
    estimatedCost: {
      estimatedTotalUsd: 0.9234,
      narrationCostUsd: 0.018,
      visualsCostUsd: 0.9,
      transcriptionCostUsd: 0.0054,
      compositionCostUsd: 0,
      providerId: "runway-gen4",
      mode: "quality",
      estimatedAt: "2026-03-22T10:00:00.000Z",
    },
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
        targetDurationSec: 45,
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
          durationSec: 23,
        },
        {
          id: "scene-prompt-2",
          videoBriefId: "brief-1",
          visualPrompt: "Scene two visual prompt.",
          overlayText: "Scene two",
          order: 2,
          purpose: "cta",
          durationSec: 22,
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
    providerResults: {
      narration: {
        id: "generated-narration-1",
        provider: "elevenlabs",
        providerJobId: "el-job-1",
        audioUrl: "https://example.com/narration.mp3",
        audioMimeType: "audio/mpeg",
        audioBase64: null,
        durationSec: 46,
        createdAt: "2026-03-22T10:00:00.000Z",
      },
      sceneAssets: [
        {
          id: "scene-asset-1",
          provider: "runway-gen4",
          providerJobId: "runway-job-1",
          scenePromptId: "scene-prompt-1",
          assetUrl: "https://example.com/scene-1.mp4",
          createdAt: "2026-03-22T10:00:00.000Z",
        },
        {
          id: "scene-asset-2",
          provider: "kling-2",
          providerJobId: "kling-job-2",
          scenePromptId: "scene-prompt-2",
          assetUrl: "https://example.com/scene-2.mp4",
          createdAt: "2026-03-22T10:00:00.000Z",
        },
      ],
        captionTrack: {
          id: "caption-track-1",
          provider: "assemblyai",
          providerJobId: "aai-job-1",
          sourceNarrationId: "generated-narration-1",
          transcriptText: "A transcript for the mock caption track.",
          captionUrl: "https://example.com/caption.vtt",
          captionVtt: "WEBVTT\n\n00:00.000 --> 00:01.000\nHello",
          createdAt: "2026-03-22T10:00:00.000Z",
        },
      composedVideo: {
        id: "composed-video-1",
        provider: "ffmpeg",
        videoUrl: "https://example.com/composed.mp4",
        thumbnailUrl: "https://example.com/thumb.jpg",
        durationSec: 46,
        createdAt: "2026-03-22T10:00:00.000Z",
      },
    },
    completedAt: "2026-03-22T10:05:00.000Z",
  });

  assert.equal(actualCost.narrationActualUsd, 0.0184);
  assert.equal(actualCost.visualsActualUsd, 0.406);
  assert.equal(actualCost.transcriptActualUsd, 0.0055);
  assert.equal(actualCost.compositionActualUsd, 0);
  assert.equal(actualCost.actualCostUsd, 0.4299);
});

test("evaluateVideoFactoryBudgetGuard marks warnings and hard stops deterministically", () => {
  const warningGuard = evaluateVideoFactoryBudgetGuard({
    estimatedCost: {
      estimatedTotalUsd: 1.2,
      narrationCostUsd: 0.2,
      visualsCostUsd: 0.9,
      transcriptionCostUsd: 0.1,
      compositionCostUsd: 0,
      providerId: "runway-gen4",
      mode: "quality",
      estimatedAt: "2026-03-22T10:00:00.000Z",
    },
    evaluatedAt: "2026-03-22T10:00:00.000Z",
    warningThresholdUsd: 1,
    hardStopThresholdUsd: 2,
  });
  const blockedGuard = evaluateVideoFactoryBudgetGuard({
    estimatedCost: {
      estimatedTotalUsd: 2.4,
      narrationCostUsd: 0.3,
      visualsCostUsd: 2,
      transcriptionCostUsd: 0.1,
      compositionCostUsd: 0,
      providerId: "runway-gen4",
      mode: "quality",
      estimatedAt: "2026-03-22T10:00:00.000Z",
    },
    evaluatedAt: "2026-03-22T10:00:00.000Z",
    warningThresholdUsd: 1,
    hardStopThresholdUsd: 2,
  });

  assert.equal(warningGuard.status, "warning");
  assert.match(warningGuard.warningMessage ?? "", /warning threshold/i);
  assert.equal(blockedGuard.status, "blocked");
  assert.match(blockedGuard.hardStopMessage ?? "", /hard-stop threshold/i);
});

test("evaluateVideoFactoryDailySpendGuard blocks projected overages deterministically", () => {
  const withinBudget = evaluateVideoFactoryDailySpendGuard({
    estimatedCostUsd: 0.8,
    dailySpendUsedUsd: 18.5,
    dailySpendCapUsd: 20,
  });
  const blocked = evaluateVideoFactoryDailySpendGuard({
    estimatedCostUsd: 1.8,
    dailySpendUsedUsd: 18.5,
    dailySpendCapUsd: 20,
  });

  assert.equal(withinBudget.status, "within_budget");
  assert.equal(withinBudget.projectedDailySpendUsd, 19.3);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.projectedDailySpendUsd, 20.3);
  assert.match(blocked.message ?? "", /daily cap/i);
});

test("video factory guardrail defaults stay phase-c compatible", () => {
  assert.equal(getVideoFactoryDailySpendCapUsd(), 20);
  assert.equal(getVideoFactoryMaxRegenerationsPerBrief(), 3);
});
