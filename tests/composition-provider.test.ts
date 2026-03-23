import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinalComposeArgs,
  buildSceneConcatArgs,
  ffmpegCompositionProvider,
} from "../lib/providers/composition-provider";

const compositionSpec = {
  id: "brief-1:composition-spec",
  videoBriefId: "brief-1",
  aspectRatio: "9:16" as const,
  resolution: "1080p" as const,
  sceneOrder: ["scene-prompt-1", "scene-prompt-2"],
  narrationSpecId: "narration-spec-1",
  captionSpecId: "caption-spec-1",
  transitionStyle: "gentle-cut",
  musicMode: "none" as const,
};

test("buildSceneConcatArgs normalizes scenes to the composition resolution", () => {
  const args = buildSceneConcatArgs({
    scenePaths: ["C:/tmp/scene-1.mp4", "C:/tmp/scene-2.mp4"],
    compositionSpec,
    outputPath: "C:/tmp/visual-track.mp4",
  });

  assert.equal(args[0], "-y");
  assert.match(args.join(" "), /scale=1080:1920/);
  assert.match(args.join(" "), /concat=n=2:v=1:a=0/);
});

test("buildFinalComposeArgs burns subtitles when a caption file is present", () => {
  const args = buildFinalComposeArgs({
    visualPath: "C:/tmp/visual-track.mp4",
    narrationPath: "C:/tmp/narration.mp3",
    captionPath: "C:/tmp/captions.vtt",
    outputPath: "C:/tmp/final-draft.mp4",
  });

  assert.match(args.join(" "), /subtitles=/);
  assert.equal(args.at(-1), "C:/tmp/final-draft.mp4");
});

test("ffmpeg composition provider preserves mock fallback mode", async () => {
  const previousMode = process.env.VIDEO_FACTORY_PROVIDER_MODE;
  process.env.VIDEO_FACTORY_PROVIDER_MODE = "mock";

  try {
    const result = await ffmpegCompositionProvider.composeVideo({
      compositionSpec,
      narration: {
        id: "generated-narration-1",
        provider: "elevenlabs",
        audioUrl: "mock://elevenlabs/narration/generated-narration-1.mp3",
        providerJobId: null,
        audioMimeType: null,
        audioBase64: null,
        durationSec: 45,
        createdAt: "2026-03-23T09:00:00.000Z",
      },
      sceneAssets: [
        {
          id: "scene-asset-1",
          provider: "runway-gen4",
          scenePromptId: "scene-prompt-1",
          assetUrl: "mock://runway-gen4/scene-assets/scene-asset-1.mp4",
          providerJobId: null,
          createdAt: "2026-03-23T09:00:00.000Z",
        },
        {
          id: "scene-asset-2",
          provider: "runway-gen4",
          scenePromptId: "scene-prompt-2",
          assetUrl: "mock://runway-gen4/scene-assets/scene-asset-2.mp4",
          providerJobId: null,
          createdAt: "2026-03-23T09:00:00.000Z",
        },
      ],
      captionTrack: {
        id: "caption-track-1",
        provider: "assemblyai",
        sourceNarrationId: "generated-narration-1",
        transcriptText: "Mock transcript",
        captionUrl: "mock://assemblyai/captions/caption-track-1.vtt",
        providerJobId: null,
        captionVtt: null,
        createdAt: "2026-03-23T09:00:00.000Z",
      },
      createdAt: "2026-03-23T09:00:00.000Z",
    });

    assert.match(result.videoUrl, /^mock:\/\/ffmpeg\//);
    assert.match(result.thumbnailUrl ?? "", /^mock:\/\/ffmpeg\//);
  } finally {
    if (previousMode === undefined) {
      delete process.env.VIDEO_FACTORY_PROVIDER_MODE;
    } else {
      process.env.VIDEO_FACTORY_PROVIDER_MODE = previousMode;
    }
  }
});
