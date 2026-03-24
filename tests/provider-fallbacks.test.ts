import assert from "node:assert/strict";
import test from "node:test";

import {
  assemblyAiCaptionProvider,
  getCaptionProvider,
  listCaptionProviders,
  resolveCaptionProviderId,
  whisperCaptionProvider,
} from "../lib/providers/caption-provider";
import {
  elevenLabsNarrationProvider,
  getNarrationProvider,
  listNarrationProviders,
  openAiTtsNarrationProvider,
  resolveNarrationProviderId,
} from "../lib/providers/narration-provider";
import { getVisualProvider } from "../lib/providers/visual-provider";

const originalEnv = { ...process.env };
const testEnv = process.env as Record<string, string | undefined>;

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

test("narration provider requires credentials in default auto mode", async () => {
  delete process.env.VIDEO_FACTORY_PROVIDER_MODE;
  delete process.env.ELEVENLABS_API_KEY;

  await assert.rejects(
    () =>
      elevenLabsNarrationProvider.generateNarration({
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
      }),
    /Real provider execution requires configured credentials/i,
  );
});

test("narration provider still allows explicit mock mode outside production", async () => {
  testEnv.NODE_ENV = "test";
  process.env.VIDEO_FACTORY_PROVIDER_MODE = "mock";
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

test("narration provider registry resolves defaults and explicit OpenAI TTS", () => {
  assert.deepEqual(
    listNarrationProviders().map((provider) => provider.provider),
    ["elevenlabs", "openai-tts"],
  );
  assert.equal(resolveNarrationProviderId(null), "elevenlabs");
  assert.equal(resolveNarrationProviderId("local-default"), "elevenlabs");
  assert.equal(getNarrationProvider("openai-tts").provider, "openai-tts");
  assert.throws(
    () => resolveNarrationProviderId("unknown-tts"),
    /Unknown narration provider/i,
  );
});

test("openai tts provider requires credentials in default auto mode", async () => {
  delete process.env.VIDEO_FACTORY_PROVIDER_MODE;
  delete process.env.OPENAI_API_KEY;

  await assert.rejects(
    () =>
      openAiTtsNarrationProvider.generateNarration({
        narrationSpec: {
          id: "narration-spec-openai-1",
          opportunityId: "opportunity-1",
          videoBriefId: "brief-1",
          script: "A calm teacher-real narration.",
          tone: "teacher-real",
          pace: "steady",
          targetDurationSec: 30,
        },
        createdAt: "2026-03-23T10:00:00.000Z",
      }),
    /Real provider execution requires configured credentials/i,
  );
});

test("openai tts provider still allows explicit mock mode outside production", async () => {
  testEnv.NODE_ENV = "test";
  process.env.VIDEO_FACTORY_PROVIDER_MODE = "mock";
  delete process.env.OPENAI_API_KEY;

  const narration = await openAiTtsNarrationProvider.generateNarration({
    narrationSpec: {
      id: "narration-spec-openai-1",
      opportunityId: "opportunity-1",
      videoBriefId: "brief-1",
      script: "A calm teacher-real narration.",
      tone: "teacher-real",
      pace: "steady",
      targetDurationSec: 30,
    },
    createdAt: "2026-03-23T10:00:00.000Z",
  });

  assert.equal(narration.provider, "openai-tts");
  assert.match(narration.audioUrl, /^mock:\/\//);
  assert.equal(narration.audioBase64, null);
});

test("assemblyai provider requires credentials in default auto mode", async () => {
  delete process.env.VIDEO_FACTORY_PROVIDER_MODE;
  delete process.env.ASSEMBLYAI_API_KEY;

  await assert.rejects(
    () =>
      assemblyAiCaptionProvider.generateCaptionTrack({
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
      }),
    /Real provider execution requires configured credentials/i,
  );
});

test("caption provider registry resolves defaults and explicit Whisper", () => {
  assert.deepEqual(
    listCaptionProviders().map((provider) => provider.provider),
    ["assemblyai", "whisper"],
  );
  assert.equal(resolveCaptionProviderId(null), "assemblyai");
  assert.equal(resolveCaptionProviderId("local-default"), "assemblyai");
  assert.equal(getCaptionProvider("whisper").provider, "whisper");
  assert.throws(
    () => resolveCaptionProviderId("unknown-caption"),
    /Unknown caption provider/i,
  );
});

test("whisper provider requires credentials in default auto mode", async () => {
  delete process.env.VIDEO_FACTORY_PROVIDER_MODE;
  delete process.env.OPENAI_API_KEY;

  await assert.rejects(
    () =>
      whisperCaptionProvider.generateCaptionTrack({
        captionSpec: {
          id: "caption-spec-whisper-1",
          videoBriefId: "brief-1",
          sourceText: "Caption source text.",
          stylePreset: "teacher-real-clean",
          placement: "lower-third",
          casing: "sentence",
        },
        narration: {
          id: "generated-narration-1",
          provider: "openai-tts",
          audioUrl: "https://example.com/audio.mp3",
          providerJobId: null,
          audioMimeType: "audio/mpeg",
          audioBase64: null,
          durationSec: 30,
          createdAt: "2026-03-23T10:00:00.000Z",
        },
        createdAt: "2026-03-23T10:00:00.000Z",
      }),
    /Real provider execution requires configured credentials/i,
  );
});

test("whisper provider still allows explicit mock mode outside production", async () => {
  testEnv.NODE_ENV = "test";
  process.env.VIDEO_FACTORY_PROVIDER_MODE = "mock";
  delete process.env.OPENAI_API_KEY;

  const captionTrack = await whisperCaptionProvider.generateCaptionTrack({
    captionSpec: {
      id: "caption-spec-whisper-1",
      videoBriefId: "brief-1",
      sourceText: "Caption source text.",
      stylePreset: "teacher-real-clean",
      placement: "lower-third",
      casing: "sentence",
    },
    narration: {
      id: "generated-narration-1",
      provider: "openai-tts",
      audioUrl: "mock://openai-tts/narration/generated-narration-1.mp3",
      providerJobId: null,
      audioMimeType: "audio/mpeg",
      audioBase64: null,
      durationSec: 30,
      createdAt: "2026-03-23T10:00:00.000Z",
    },
    createdAt: "2026-03-23T10:00:00.000Z",
  });

  assert.equal(captionTrack.provider, "whisper");
  assert.match(captionTrack.captionUrl ?? "", /^mock:\/\//);
});

test("visual provider honors forced mock mode outside production", async () => {
  testEnv.NODE_ENV = "test";
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

test("visual provider rejects mock mode in production", async () => {
  testEnv.NODE_ENV = "production";
  process.env.VIDEO_FACTORY_PROVIDER_MODE = "mock";
  process.env.RUNWAYML_API_SECRET = "fake-key";

  await assert.rejects(
    () =>
      getVisualProvider("runway-gen4").generateScene({
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
      }),
    /not allowed in production/i,
  );
});
