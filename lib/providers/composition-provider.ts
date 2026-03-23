import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import type { CompositionSpec } from "@/lib/composition-specs";
import type { GeneratedCaptionTrack } from "@/lib/providers/caption-provider";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";
import type { GeneratedSceneAsset } from "@/lib/providers/visual-provider";
import {
  ffmpegBinaryPath,
  ffmpegThumbnailTimestampSec,
  getVideoFactoryProviderMode,
  providerConfigError,
  providerHttpError,
} from "./provider-runtime";
import { VideoFactoryRetryableError } from "../video-factory-retry";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";
const execFileAsync = promisify(execFile);

export const composedVideoResultSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.literal("ffmpeg"),
  videoUrl: z.string().trim().min(1),
  thumbnailUrl: z.string().trim().nullable().optional(),
  durationSec: z.number().int().positive().nullable().optional(),
  videoFilePath: z.string().trim().nullable().optional(),
  thumbnailFilePath: z.string().trim().nullable().optional(),
  videoMimeType: z.string().trim().nullable().optional(),
  thumbnailMimeType: z.string().trim().nullable().optional(),
  createdAt: z.string().trim().min(1),
});

export type ComposedVideoResult = z.infer<typeof composedVideoResultSchema>;

export interface CompositionProviderAdapter {
  readonly provider: "ffmpeg";
  composeVideo(input: {
    compositionSpec: CompositionSpec;
    narration: GeneratedNarration;
    sceneAssets: GeneratedSceneAsset[];
    captionTrack: GeneratedCaptionTrack;
    createdAt?: string;
  }): Promise<ComposedVideoResult>;
}

function composedVideoResultId(compositionSpecId: string): string {
  return `${compositionSpecId}:composed-video:ffmpeg`;
}

function outputResolution(spec: CompositionSpec) {
  switch (spec.resolution) {
    case "720p":
      switch (spec.aspectRatio) {
        case "1:1":
          return { width: 720, height: 720 };
        case "16:9":
          return { width: 1280, height: 720 };
        case "9:16":
        default:
          return { width: 720, height: 1280 };
      }
    case "1080p":
    default:
      switch (spec.aspectRatio) {
        case "1:1":
          return { width: 1080, height: 1080 };
        case "16:9":
          return { width: 1920, height: 1080 };
        case "9:16":
        default:
          return { width: 1080, height: 1920 };
      }
  }
}

function isRemoteUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function buildWebVtt(input: { transcriptText: string; durationSec?: number | null }) {
  const endSeconds = Math.max(input.durationSec ?? 1, 1);
  const hours = Math.floor(endSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((endSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(endSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `WEBVTT

00:00:00.000 --> ${hours}:${minutes}:${seconds}.000
${input.transcriptText}
`;
}

function escapeFilterPath(filePath: string) {
  return path
    .resolve(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

async function ensureFileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw providerHttpError({
      provider: "ffmpeg-input",
      status: response.status,
      message: await response.text(),
    });
  }

  return Buffer.from(await response.arrayBuffer());
}

async function materializeNarration(
  narration: GeneratedNarration,
  tempDir: string,
): Promise<string | null> {
  const outputPath = path.join(tempDir, "narration.mp3");
  if (narration.audioBase64) {
    await writeFile(outputPath, Buffer.from(narration.audioBase64, "base64"));
    return outputPath;
  }

  if (isRemoteUrl(narration.audioUrl)) {
    await writeFile(outputPath, await fetchBuffer(narration.audioUrl));
    return outputPath;
  }

  return null;
}

async function materializeSceneAssets(
  sceneAssets: GeneratedSceneAsset[],
  compositionSpec: CompositionSpec,
  tempDir: string,
): Promise<string[] | null> {
  const orderedAssets = compositionSpec.sceneOrder
    .map((sceneId) => sceneAssets.find((asset) => asset.scenePromptId === sceneId) ?? null)
    .filter((asset): asset is GeneratedSceneAsset => Boolean(asset));

  if (orderedAssets.length !== compositionSpec.sceneOrder.length) {
    throw new VideoFactoryRetryableError(
      "ffmpeg composition could not resolve every scene asset in composition order.",
      { retryable: false },
    );
  }

  const outputPaths: string[] = [];
  for (const [index, asset] of orderedAssets.entries()) {
    if (!isRemoteUrl(asset.assetUrl)) {
      return null;
    }

    const outputPath = path.join(tempDir, `scene-${index + 1}.mp4`);
    await writeFile(outputPath, await fetchBuffer(asset.assetUrl));
    outputPaths.push(outputPath);
  }

  return outputPaths;
}

async function materializeCaptionTrack(
  captionTrack: GeneratedCaptionTrack,
  durationSec: number | null | undefined,
  tempDir: string,
): Promise<string | null> {
  const outputPath = path.join(tempDir, "captions.vtt");
  if (captionTrack.captionVtt) {
    await writeFile(outputPath, captionTrack.captionVtt, "utf8");
    return outputPath;
  }

  const captionUrl = captionTrack.captionUrl;
  if (captionUrl && isRemoteUrl(captionUrl)) {
    await writeFile(outputPath, await fetchBuffer(captionUrl));
    return outputPath;
  }

  if (captionTrack.transcriptText.trim().length > 0) {
    await writeFile(
      outputPath,
      buildWebVtt({
        transcriptText: captionTrack.transcriptText,
        durationSec,
      }),
      "utf8",
    );
    return outputPath;
  }

  return null;
}

export function buildSceneConcatArgs(input: {
  scenePaths: string[];
  compositionSpec: CompositionSpec;
  outputPath: string;
}) {
  const { width, height } = outputResolution(input.compositionSpec);
  const filterParts = input.scenePaths.map(
    (_, index) =>
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[v${index}]`,
  );
  const concatInputs = input.scenePaths.map((_, index) => `[v${index}]`).join("");
  const filterComplex = `${filterParts.join(";")};${concatInputs}concat=n=${input.scenePaths.length}:v=1:a=0[vout]`;

  return [
    "-y",
    ...input.scenePaths.flatMap((scenePath) => ["-i", scenePath]),
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-an",
    input.outputPath,
  ];
}

export function buildFinalComposeArgs(input: {
  visualPath: string;
  narrationPath: string;
  captionPath?: string | null;
  outputPath: string;
}) {
  const args = [
    "-y",
    "-i",
    input.visualPath,
    "-i",
    input.narrationPath,
  ];

  if (input.captionPath) {
    args.push(
      "-vf",
      `subtitles='${escapeFilterPath(input.captionPath)}'`,
    );
  }

  args.push(
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    input.outputPath,
  );

  return args;
}

export function buildThumbnailArgs(input: {
  videoPath: string;
  outputPath: string;
}) {
  return [
    "-y",
    "-ss",
    `${ffmpegThumbnailTimestampSec()}`,
    "-i",
    input.videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    input.outputPath,
  ];
}

async function runFfmpeg(args: string[]) {
  try {
    await execFileAsync(ffmpegBinaryPath(), args);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      throw providerConfigError(
        "ffmpeg",
        `ffmpeg binary was not found. Install ffmpeg or set FFMPEG_PATH.`,
      );
    }

    throw new VideoFactoryRetryableError(
      error instanceof Error ? error.message : "ffmpeg composition failed.",
      { retryable: false, cause: error },
    );
  }
}

function shouldUseMockComposition(input: {
  narration: GeneratedNarration;
  sceneAssets: GeneratedSceneAsset[];
}) {
  return (
    (!input.narration.audioBase64 &&
      !isRemoteUrl(input.narration.audioUrl)) ||
    input.sceneAssets.some((asset) => !isRemoteUrl(asset.assetUrl))
  );
}

async function generateRealComposition(input: {
  compositionSpec: CompositionSpec;
  narration: GeneratedNarration;
  sceneAssets: GeneratedSceneAsset[];
  captionTrack: GeneratedCaptionTrack;
  createdAt?: string;
}): Promise<ComposedVideoResult> {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "zaza-video-factory-composition-"),
  );
  try {
    const narrationPath = await materializeNarration(input.narration, tempDir);
    const scenePaths = await materializeSceneAssets(
      input.sceneAssets,
      input.compositionSpec,
      tempDir,
    );

    if (!narrationPath || !scenePaths || scenePaths.length === 0) {
      throw providerConfigError(
        "ffmpeg",
        "Composition inputs were not materialized from the current provider artifacts.",
      );
    }

    const captionPath = await materializeCaptionTrack(
      input.captionTrack,
      input.narration.durationSec ?? null,
      tempDir,
    );
    const visualPath = path.join(tempDir, "visual-track.mp4");
    const outputPath = path.join(tempDir, "final-draft.mp4");
    const thumbnailPath = path.join(tempDir, "thumbnail.jpg");

    await runFfmpeg(
      buildSceneConcatArgs({
        scenePaths,
        compositionSpec: input.compositionSpec,
        outputPath: visualPath,
      }),
    );
    await runFfmpeg(
      buildFinalComposeArgs({
        visualPath,
        narrationPath,
        captionPath,
        outputPath,
      }),
    );
    await runFfmpeg(
      buildThumbnailArgs({
        videoPath: outputPath,
        outputPath: thumbnailPath,
      }),
    );

    const resultId = composedVideoResultId(input.compositionSpec.id);
    const thumbnailExists = await ensureFileExists(thumbnailPath);

    return composedVideoResultSchema.parse({
      id: resultId,
      provider: "ffmpeg",
      videoUrl: outputPath,
      thumbnailUrl: thumbnailExists ? thumbnailPath : null,
      durationSec: input.narration.durationSec ?? null,
      videoFilePath: outputPath,
      thumbnailFilePath: thumbnailExists ? thumbnailPath : null,
      videoMimeType: "video/mp4",
      thumbnailMimeType: thumbnailExists ? "image/jpeg" : null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export const ffmpegCompositionProvider: CompositionProviderAdapter = {
  provider: "ffmpeg",
  async composeVideo(input) {
    const resultId = composedVideoResultId(input.compositionSpec.id);
    const durationFromScenes = input.sceneAssets.length > 0
      ? null
      : input.narration.durationSec ?? null;

    const providerMode = getVideoFactoryProviderMode();
    if (providerMode === "mock" || shouldUseMockComposition(input)) {
      if (providerMode === "real" && shouldUseMockComposition(input)) {
        throw providerConfigError(
          "ffmpeg",
          "Provider mode is set to real, but composition inputs are still mock-only.",
        );
      }

      return composedVideoResultSchema.parse({
        id: resultId,
        provider: "ffmpeg",
        videoUrl: `mock://ffmpeg/composed-videos/${resultId}.mp4`,
        thumbnailUrl: `mock://ffmpeg/composed-videos/${resultId}.jpg`,
        durationSec: input.narration.durationSec ?? durationFromScenes,
        createdAt: input.createdAt ?? MOCK_CREATED_AT,
      });
    }

    return generateRealComposition(input);
  },
};
