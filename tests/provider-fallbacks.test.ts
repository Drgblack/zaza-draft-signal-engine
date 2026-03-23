import assert from "node:assert/strict";
import test from "node:test";

import { assemblyAiCaptionProvider } from "../lib/providers/caption-provider";
import { elevenLabsNarrationProvider } from "../lib/providers/narration-provider";
import { getVisualProvider } from "../lib/providers/visual-provider";

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
}

test.afterEach(() => {
  restoreEnv();
});

test("narration provider falls back to mock output when ElevenLabs credentials are absent", async () => {
  delete process.env.VIDEO_FACTORY_PROVIDER_MODE;
  delete process.env.ELEVENLABS_API_KEY;

  const narration = await elevenLabsNarrationProvider.generateNarration({
    narrationSpec: {
      id: "narration-spec-1",
      opportunityId: "opportunity-1",
      videoBriefId: "brief-1",
      script: "A calm teacher-real narration.",
      tone: "teacher-real",
      pace: "steady",
      targetDurationSec: 30,
    },
    createdAt: "2026-03-23T10:00:00.000Z",
  });

  assert.match(narration.audioUrl, /^mock:\/\//);
  assert.equal(narration.audioBase64, null);
});

test("assemblyai provider falls back to mock caption generation when credentials are absent", async () => {
  delete process.env.VIDEO_FACTORY_PROVIDER_MODE;
  delete process.env.ASSEMBLYAI_API_KEY;

  const captionTrack = await assemblyAiCaptionProvider.generateCaptionTrack({
    captionSpec: {
      id: "caption-spec-1",
      videoBriefId: "brief-1",
      sourceText: "Caption source text.",
      stylePreset: "teacher-real-clean",
      placement: "lower-third",
      casing: "sentence",
    },
    narration: {
      id: "generated-narration-1",
      provider: "elevenlabs",
      audioUrl: "mock://elevenlabs/narration/generated-narration-1.mp3",
      providerJobId: null,
      audioMimeType: "audio/mpeg",
      audioBase64: null,
      durationSec: 30,
      createdAt: "2026-03-23T10:00:00.000Z",
    },
    createdAt: "2026-03-23T10:00:00.000Z",
  });

  assert.match(captionTrack.captionUrl ?? "", /^mock:\/\//);
  assert.equal(captionTrack.providerJobId, null);
});

test("visual provider honors forced mock mode", async () => {
  process.env.VIDEO_FACTORY_PROVIDER_MODE = "mock";
  process.env.RUNWAYML_API_SECRET = "fake-key";

  const sceneAsset = await getVisualProvider("runway-gen4").generateScene({
    scenePrompt: {
      id: "scene-prompt-1",
      videoBriefId: "brief-1",
      order: 1,
      purpose: "hook",
      visualPrompt: "A grounded classroom scene.",
      overlayText: "Scene one",
      durationSec: 5,
      negativePrompt: "No hype",
    },
    aspectRatio: "9:16",
    createdAt: "2026-03-23T10:00:00.000Z",
  });

  assert.match(sceneAsset.assetUrl, /^mock:\/\//);
  assert.equal(sceneAsset.providerJobId, null);
});
