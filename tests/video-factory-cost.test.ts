import assert from "node:assert/strict";
import test from "node:test";

import { buildCostEstimate } from "../lib/video-factory-cost";

test("buildCostEstimate derives deterministic per-stage cost from compiled plan", () => {
  const costEstimate = buildCostEstimate({
    compiledProductionPlan: {
      id: "compiled-plan-1",
      opportunityId: "opportunity-1",
      videoBriefId: "brief-1",
      defaultsSnapshot: {
        id: "prod-default:teacher-real-core",
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
