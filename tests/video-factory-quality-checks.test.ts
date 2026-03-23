import assert from "node:assert/strict";
import test from "node:test";

import type { CompiledProductionPlan } from "../lib/prompt-compiler";
import type { ComposedVideoResult } from "../lib/providers/composition-provider";
import type { GeneratedCaptionTrack } from "../lib/providers/caption-provider";
import type { GeneratedNarration } from "../lib/providers/narration-provider";
import type { GeneratedSceneAsset } from "../lib/providers/visual-provider";
import { runVideoFactoryQualityChecks } from "../lib/video-factory-quality-checks";

const baseCompiledPlan: CompiledProductionPlan = {
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
};

const baseProviderResults: {
  narration: GeneratedNarration;
  sceneAssets: GeneratedSceneAsset[];
  captionTrack: GeneratedCaptionTrack;
  composedVideo: ComposedVideoResult;
} = {
  narration: {
    id: "generated-narration-1",
    provider: "elevenlabs" as const,
    audioUrl: "mock://elevenlabs/narration/generated-narration-1.mp3",
    providerJobId: null,
    audioMimeType: null,
    audioBase64: null,
    durationSec: 45,
    createdAt: "2026-03-22T10:00:00.000Z",
  },
  sceneAssets: [
    {
      id: "scene-asset-1",
      provider: "runway-gen4" as const,
      scenePromptId: "scene-prompt-1",
      assetUrl: "mock://runway-gen4/scene-assets/scene-asset-1.mp4",
      providerJobId: null,
      createdAt: "2026-03-22T10:00:00.000Z",
    },
    {
      id: "scene-asset-2",
      provider: "kling-2" as const,
      scenePromptId: "scene-prompt-2",
      assetUrl: "mock://kling-2/scene-assets/scene-asset-2.mp4",
      providerJobId: null,
      createdAt: "2026-03-22T10:00:00.000Z",
    },
  ],
  captionTrack: {
    id: "caption-track-1",
    provider: "assemblyai" as const,
    sourceNarrationId: "generated-narration-1",
    transcriptText: "A transcript for the mock caption track.",
    captionUrl: "mock://assemblyai/captions/caption-track-1.vtt",
    providerJobId: null,
    captionVtt: null,
    createdAt: "2026-03-22T10:00:00.000Z",
  },
  composedVideo: {
    id: "composed-video-1",
    provider: "ffmpeg" as const,
    videoUrl: "mock://ffmpeg/composed-videos/composed-video-1.mp4",
    thumbnailUrl: "mock://ffmpeg/composed-videos/composed-video-1.jpg",
    durationSec: 45,
    createdAt: "2026-03-22T10:00:00.000Z",
  },
};

test("runVideoFactoryQualityChecks passes for complete mock artifacts", () => {
  const result = runVideoFactoryQualityChecks({
    compiledProductionPlan: baseCompiledPlan,
    providerResults: baseProviderResults,
    checkedAt: "2026-03-22T10:00:00.000Z",
  });

  assert.equal(result.passed, true);
  assert.equal(result.hasAudio, true);
  assert.equal(result.durationInRange, true);
  assert.equal(result.captionsPresent, true);
  assert.equal(result.sceneCount, 2);
  assert.deepEqual(result.failures, []);
});

test("runVideoFactoryQualityChecks fails with deterministic stage classifications", () => {
  const result = runVideoFactoryQualityChecks({
    compiledProductionPlan: {
      ...baseCompiledPlan,
      captionSpec: {
        ...baseCompiledPlan.captionSpec,
        sourceText: "",
      },
    },
    providerResults: {
      ...baseProviderResults,
      narration: {
        ...baseProviderResults.narration,
        durationSec: 80,
      },
      sceneAssets: [baseProviderResults.sceneAssets[0]],
      captionTrack: {
        ...baseProviderResults.captionTrack,
        sourceNarrationId: "other-narration",
        transcriptText: "",
        captionUrl: null,
      },
      composedVideo: {
        ...baseProviderResults.composedVideo,
        durationSec: null,
      },
    },
    checkedAt: "2026-03-22T10:05:00.000Z",
  });

  assert.equal(result.passed, false);
  assert.equal(result.durationInRange, false);
  assert.equal(result.failures.some((failure) => failure.stage === "compiled_plan"), true);
  assert.equal(result.failures.some((failure) => failure.stage === "narration"), true);
  assert.equal(result.failures.some((failure) => failure.stage === "visuals"), true);
  assert.equal(result.failures.some((failure) => failure.stage === "captions"), true);
  assert.equal(result.failures.some((failure) => failure.stage === "composition"), true);
});
