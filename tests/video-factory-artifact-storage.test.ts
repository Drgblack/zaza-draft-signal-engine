import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { persistVideoFactoryArtifacts } from "../lib/video-factory-artifact-storage";

test("persistVideoFactoryArtifacts writes deterministic blob pathnames for each artifact", async () => {
  const writes: Array<{
    pathname: string;
    body: string | Buffer;
    options: {
      access: "public" | "private";
      addRandomSuffix: false;
      allowOverwrite: true;
      contentType: string;
    };
  }> = [];

  const persisted = await persistVideoFactoryArtifacts(
    {
      opportunityId: "opportunity-1",
      videoBriefId: "brief-1",
      factoryJobId: "brief-1:factory-job:phase-c-render-v1",
      attemptNumber: 2,
      renderVersion: "phase-c-render-v1",
      persistedAt: "2026-03-22T10:00:00.000Z",
      providerResults: {
        narration: {
          id: "generated-narration-1",
          provider: "elevenlabs",
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
            provider: "runway-gen4",
            scenePromptId: "scene-prompt-1",
            assetUrl: "mock://runway-gen4/scene-assets/scene-asset-1.mp4",
            providerJobId: null,
            createdAt: "2026-03-22T10:00:00.000Z",
          },
        ],
        captionTrack: {
          id: "caption-track-1",
          provider: "assemblyai",
          sourceNarrationId: "generated-narration-1",
          transcriptText: "A transcript for the mock caption track.",
          captionUrl: "mock://assemblyai/captions/caption-track-1.vtt",
          providerJobId: null,
          captionVtt: null,
          createdAt: "2026-03-22T10:00:00.000Z",
        },
        composedVideo: {
          id: "composed-video-1",
          provider: "ffmpeg",
          videoUrl: "mock://ffmpeg/composed-videos/composed-video-1.mp4",
          thumbnailUrl: "mock://ffmpeg/composed-videos/composed-video-1.jpg",
          durationSec: 45,
          createdAt: "2026-03-22T10:00:00.000Z",
        },
      },
    },
    {
      blobEnabled: true,
      access: "public",
      persistBlob: async (pathname, body, options) => {
        writes.push({ pathname, body, options });
        return {
          pathname,
          url: `https://blob.example/${pathname}`,
        };
      },
    },
  );

  assert.equal(writes.length, 5);
  assert.equal(
    writes[0]?.pathname,
    "video-factory/opportunity-1/brief-1/brief-1-factory-job-phase-c-render-v1/attempt-2-phase-c-render-v1/narration-audio/generated-narration-1.json",
  );
  assert.equal(
    writes[2]?.pathname,
    "video-factory/opportunity-1/brief-1/brief-1-factory-job-phase-c-render-v1/attempt-2-phase-c-render-v1/caption-track/caption-track-1.vtt",
  );
  assert.equal(
    writes[4]?.pathname,
    "video-factory/opportunity-1/brief-1/brief-1-factory-job-phase-c-render-v1/attempt-2-phase-c-render-v1/thumbnail-image/composed-video-1-thumbnail.json",
  );
  const captionBody = writes[2]?.body;
  assert.match(
    Buffer.isBuffer(captionBody) ? captionBody.toString("utf8") : captionBody ?? "",
    /WEBVTT/,
  );
  assert.equal(persisted.narration.backend, "blob");
  assert.equal(persisted.narration.createdAt, "2026-03-22T10:00:00.000Z");
  assert.equal(persisted.narration.retentionClass, "intermediate_artifact");
  assert.equal(persisted.narration.retentionDays, 14);
  assert.equal(persisted.narration.expiresAt, "2026-04-05T10:00:00.000Z");
  assert.equal(persisted.narration.deletionEligible, false);
  assert.equal(persisted.caption.contentType, "text/vtt; charset=utf-8");
  assert.equal(
    persisted.composedVideo.url,
    "https://blob.example/video-factory/opportunity-1/brief-1/brief-1-factory-job-phase-c-render-v1/attempt-2-phase-c-render-v1/composed-video/composed-video-1.json",
  );
  assert.equal(persisted.composedVideo.retentionClass, "intermediate_artifact");
  assert.equal(persisted.thumbnail?.backend, "blob");
});

test("persistVideoFactoryArtifacts uploads composed media binaries when local ffmpeg outputs exist", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "video-factory-artifacts-"));
  const videoPath = path.join(tempDir, "final.mp4");
  const thumbnailPath = path.join(tempDir, "thumbnail.jpg");
  await writeFile(videoPath, Buffer.from("video-bytes"));
  await writeFile(thumbnailPath, Buffer.from("image-bytes"));

  const writes: Array<{ pathname: string; contentType: string; byteLength: number }> = [];
  const persisted = await persistVideoFactoryArtifacts(
    {
      opportunityId: "opportunity-2",
      videoBriefId: "brief-2",
      factoryJobId: "brief-2:factory-job:phase-c-render-v2",
      attemptNumber: 1,
      renderVersion: "phase-c-render-v2",
      persistedAt: "2026-03-23T09:00:00.000Z",
      providerResults: {
        narration: {
          id: "generated-narration-2",
          provider: "elevenlabs",
          audioUrl: "mock://elevenlabs/narration/generated-narration-2.mp3",
          providerJobId: null,
          audioMimeType: null,
          audioBase64: null,
          durationSec: 30,
          createdAt: "2026-03-23T09:00:00.000Z",
        },
        sceneAssets: [],
        captionTrack: {
          id: "caption-track-2",
          provider: "assemblyai",
          sourceNarrationId: "generated-narration-2",
          transcriptText: "Caption text",
          captionUrl: null,
          providerJobId: null,
          captionVtt: "WEBVTT\n",
          createdAt: "2026-03-23T09:00:00.000Z",
        },
        composedVideo: {
          id: "composed-video-2",
          provider: "ffmpeg",
          videoUrl: videoPath,
          thumbnailUrl: thumbnailPath,
          durationSec: 30,
          videoFilePath: videoPath,
          thumbnailFilePath: thumbnailPath,
          videoMimeType: "video/mp4",
          thumbnailMimeType: "image/jpeg",
          createdAt: "2026-03-23T09:00:00.000Z",
        },
      },
    },
    {
      blobEnabled: true,
      access: "public",
      persistBlob: async (pathname, body, options) => {
        writes.push({
          pathname,
          contentType: options.contentType,
          byteLength: Buffer.isBuffer(body) ? body.byteLength : body.length,
        });
        return {
          pathname,
          url: `https://blob.example/${pathname}`,
        };
      },
    },
  );

  assert.equal(
    writes.some((write) => write.pathname.endsWith("/composed-video/composed-video-2.mp4")),
    true,
  );
  assert.equal(
    writes.some((write) => write.pathname.endsWith("/thumbnail-image/composed-video-2-thumbnail.jpg")),
    true,
  );
  assert.equal(
    writes.some((write) => write.contentType === "video/mp4" && write.byteLength > 0),
    true,
  );
  assert.equal(
    persisted.composedVideo.url?.endsWith("/composed-video/composed-video-2.mp4"),
    true,
  );
  assert.equal(
    persisted.thumbnail?.url?.endsWith("/thumbnail-image/composed-video-2-thumbnail.jpg"),
    true,
  );
  assert.equal(persisted.composedVideo.createdAt, "2026-03-23T09:00:00.000Z");
  assert.equal(persisted.composedVideo.retentionDays, 14);
  assert.equal(persisted.thumbnail?.retentionClass, "intermediate_artifact");
});
