import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { put } from "@vercel/blob";
import { z } from "zod";

import type { ComposedVideoResult } from "@/lib/providers/composition-provider";
import type { GeneratedCaptionTrack } from "@/lib/providers/caption-provider";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";
import type { GeneratedSceneAsset } from "@/lib/providers/visual-provider";

export const videoFactoryPersistedArtifactRefSchema = z.object({
  backend: z.enum(["blob", "source"]),
  pathname: z.string().trim().nullable().default(null),
  url: z.string().trim().nullable().default(null),
  sourceUrl: z.string().trim().nullable().default(null),
  contentType: z.string().trim().nullable().default(null),
  persistedAt: z.string().trim().nullable().default(null),
});

export type VideoFactoryPersistedArtifactRef = z.infer<
  typeof videoFactoryPersistedArtifactRefSchema
>;

type BlobAccess = "public" | "private";

interface PutLikeResult {
  url: string;
  pathname: string;
}

type PersistBlobFn = (
  pathname: string,
  body: string | Buffer,
  options: {
    access: BlobAccess;
    addRandomSuffix: false;
    allowOverwrite: true;
    contentType: string;
  },
) => Promise<PutLikeResult>;

function asSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isRemoteUrl(value: string | null | undefined) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function attemptSegment(input: {
  attemptNumber: number;
  renderVersion?: string | null;
}) {
  const renderVersionSlug = asSlug(input.renderVersion ?? "draft");
  return `attempt-${input.attemptNumber}-${renderVersionSlug}`;
}

function artifactPathname(input: {
  opportunityId: string;
  videoBriefId: string;
  factoryJobId: string;
  attemptNumber: number;
  renderVersion?: string | null;
  artifactType: string;
  artifactId: string;
  extension: string;
}) {
  return [
    "video-factory",
    asSlug(input.opportunityId),
    asSlug(input.videoBriefId),
    asSlug(input.factoryJobId),
    attemptSegment({
      attemptNumber: input.attemptNumber,
      renderVersion: input.renderVersion,
    }),
    asSlug(input.artifactType),
    `${asSlug(input.artifactId)}.${input.extension}`,
  ].join("/");
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

function blobAccess(): BlobAccess {
  return process.env.VIDEO_FACTORY_ARTIFACT_BLOB_ACCESS?.trim().toLowerCase() ===
    "private"
    ? "private"
    : "public";
}

export function isVideoFactoryArtifactBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function getVideoFactoryArtifactBlobAccess() {
  return blobAccess();
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Artifact fetch failed (${response.status}) for ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function persistArtifact(input: {
  pathname: string;
  body: string | Buffer;
  contentType: string;
  sourceUrl?: string | null;
  persistedAt: string;
  persistBlob: PersistBlobFn;
  blobEnabled: boolean;
  access: BlobAccess;
}): Promise<VideoFactoryPersistedArtifactRef> {
  if (!input.blobEnabled) {
    return videoFactoryPersistedArtifactRefSchema.parse({
      backend: "source",
      pathname: null,
      url: null,
      sourceUrl: normalizeText(input.sourceUrl),
      contentType: input.contentType,
      persistedAt: null,
    });
  }

  const uploaded = await input.persistBlob(input.pathname, input.body, {
    access: input.access,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: input.contentType,
  });

  return videoFactoryPersistedArtifactRefSchema.parse({
    backend: "blob",
    pathname: uploaded.pathname,
    url: uploaded.url,
    sourceUrl: normalizeText(input.sourceUrl),
    contentType: input.contentType,
    persistedAt: input.persistedAt,
  });
}

async function persistJsonArtifact(input: {
  pathname: string;
  payload: unknown;
  sourceUrl?: string | null;
  persistedAt: string;
  persistBlob: PersistBlobFn;
  blobEnabled: boolean;
  access: BlobAccess;
}) {
  return persistArtifact({
    pathname: input.pathname,
    body: `${JSON.stringify(input.payload, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
    sourceUrl: input.sourceUrl,
    persistedAt: input.persistedAt,
    persistBlob: input.persistBlob,
    blobEnabled: input.blobEnabled,
    access: input.access,
  });
}

async function persistBinaryArtifact(input: {
  pathname: string;
  bytes: Buffer;
  contentType: string;
  sourceUrl?: string | null;
  persistedAt: string;
  persistBlob: PersistBlobFn;
  blobEnabled: boolean;
  access: BlobAccess;
}) {
  return persistArtifact({
    pathname: input.pathname,
    body: input.bytes,
    contentType: input.contentType,
    sourceUrl: input.sourceUrl,
    persistedAt: input.persistedAt,
    persistBlob: input.persistBlob,
    blobEnabled: input.blobEnabled,
    access: input.access,
  });
}

export async function persistVideoFactoryArtifacts(
  input: {
    opportunityId: string;
    videoBriefId: string;
    factoryJobId: string;
    attemptNumber: number;
    renderVersion?: string | null;
    persistedAt: string;
    providerResults: {
      narration: GeneratedNarration;
      sceneAssets: GeneratedSceneAsset[];
      captionTrack: GeneratedCaptionTrack;
      composedVideo: ComposedVideoResult;
    };
  },
  overrides?: {
    blobEnabled?: boolean;
    access?: BlobAccess;
    persistBlob?: PersistBlobFn;
  },
) {
  const persistBlob: PersistBlobFn =
    overrides?.persistBlob ??
    (async (pathname, body, options) => {
      const uploaded = await put(pathname, body, options);
      return {
        url: uploaded.url,
        pathname: uploaded.pathname,
      };
    });
  const enabled = overrides?.blobEnabled ?? isVideoFactoryArtifactBlobEnabled();
  const access = overrides?.access ?? getVideoFactoryArtifactBlobAccess();
  const common = {
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId,
    factoryJobId: input.factoryJobId,
    attemptNumber: input.attemptNumber,
    renderVersion: input.renderVersion,
    persistedAt: input.persistedAt,
    persistBlob,
    blobEnabled: enabled,
    access,
  } as const;

  const narration = input.providerResults.narration.audioBase64
    ? await persistBinaryArtifact({
        ...common,
        pathname: artifactPathname({
          ...common,
          artifactType: "narration-audio",
          artifactId: input.providerResults.narration.id,
          extension: "mp3",
        }),
        bytes: Buffer.from(input.providerResults.narration.audioBase64, "base64"),
        contentType:
          input.providerResults.narration.audioMimeType ?? "audio/mpeg",
        sourceUrl: input.providerResults.narration.audioUrl,
      })
    : isRemoteUrl(input.providerResults.narration.audioUrl)
      ? await persistBinaryArtifact({
          ...common,
          pathname: artifactPathname({
            ...common,
            artifactType: "narration-audio",
            artifactId: input.providerResults.narration.id,
            extension: "mp3",
          }),
          bytes: await fetchBuffer(input.providerResults.narration.audioUrl),
          contentType:
            input.providerResults.narration.audioMimeType ?? "audio/mpeg",
          sourceUrl: input.providerResults.narration.audioUrl,
        })
      : await persistJsonArtifact({
          ...common,
          pathname: artifactPathname({
            ...common,
            artifactType: "narration-audio",
            artifactId: input.providerResults.narration.id,
            extension: "json",
          }),
          payload: {
            artifactType: "narration_audio",
            providerId: input.providerResults.narration.provider,
            artifactId: input.providerResults.narration.id,
            sourceUrl: input.providerResults.narration.audioUrl,
            durationSec: input.providerResults.narration.durationSec ?? null,
            createdAt: input.providerResults.narration.createdAt,
          },
          sourceUrl: input.providerResults.narration.audioUrl,
        });

  const sceneAssets = await Promise.all(
    input.providerResults.sceneAssets.map(async (sceneAsset) =>
      isRemoteUrl(sceneAsset.assetUrl)
        ? persistBinaryArtifact({
            ...common,
            pathname: artifactPathname({
              ...common,
              artifactType: "scene-video",
              artifactId: sceneAsset.id,
              extension: "mp4",
            }),
            bytes: await fetchBuffer(sceneAsset.assetUrl),
            contentType: "video/mp4",
            sourceUrl: sceneAsset.assetUrl,
          })
        : persistJsonArtifact({
            ...common,
            pathname: artifactPathname({
              ...common,
              artifactType: "scene-video",
              artifactId: sceneAsset.id,
              extension: "json",
            }),
            payload: {
              artifactType: "scene_video",
              providerId: sceneAsset.provider,
              artifactId: sceneAsset.id,
              scenePromptId: sceneAsset.scenePromptId,
              sourceUrl: sceneAsset.assetUrl,
              createdAt: sceneAsset.createdAt,
            },
            sourceUrl: sceneAsset.assetUrl,
          }),
    ),
  );

  const caption = await persistArtifact({
    ...common,
    pathname: artifactPathname({
      ...common,
      artifactType: "caption-track",
      artifactId: input.providerResults.captionTrack.id,
      extension: "vtt",
    }),
    body:
      input.providerResults.captionTrack.captionVtt ??
      buildWebVtt({
        transcriptText: input.providerResults.captionTrack.transcriptText,
        durationSec: input.providerResults.composedVideo.durationSec,
      }),
    contentType: "text/vtt; charset=utf-8",
    sourceUrl: input.providerResults.captionTrack.captionUrl,
  });

  const composedVideo = input.providerResults.composedVideo.videoFilePath
    ? await persistBinaryArtifact({
        ...common,
        pathname: artifactPathname({
          ...common,
          artifactType: "composed-video",
          artifactId: input.providerResults.composedVideo.id,
          extension: "mp4",
        }),
        bytes: await readFile(input.providerResults.composedVideo.videoFilePath),
        contentType:
          input.providerResults.composedVideo.videoMimeType ?? "video/mp4",
        sourceUrl: input.providerResults.composedVideo.videoUrl,
      })
    : isRemoteUrl(input.providerResults.composedVideo.videoUrl)
      ? await persistBinaryArtifact({
          ...common,
          pathname: artifactPathname({
            ...common,
            artifactType: "composed-video",
            artifactId: input.providerResults.composedVideo.id,
            extension: "mp4",
          }),
          bytes: await fetchBuffer(input.providerResults.composedVideo.videoUrl),
          contentType:
            input.providerResults.composedVideo.videoMimeType ?? "video/mp4",
          sourceUrl: input.providerResults.composedVideo.videoUrl,
        })
      : await persistJsonArtifact({
          ...common,
          pathname: artifactPathname({
            ...common,
            artifactType: "composed-video",
            artifactId: input.providerResults.composedVideo.id,
            extension: "json",
          }),
          payload: {
            artifactType: "composed_video",
            providerId: input.providerResults.composedVideo.provider,
            artifactId: input.providerResults.composedVideo.id,
            sourceUrl: input.providerResults.composedVideo.videoUrl,
            thumbnailSourceUrl: input.providerResults.composedVideo.thumbnailUrl ?? null,
            durationSec: input.providerResults.composedVideo.durationSec ?? null,
            createdAt: input.providerResults.composedVideo.createdAt,
          },
          sourceUrl: input.providerResults.composedVideo.videoUrl,
        });

  const thumbnail = input.providerResults.composedVideo.thumbnailFilePath
    ? await persistBinaryArtifact({
        ...common,
        pathname: artifactPathname({
          ...common,
          artifactType: "thumbnail-image",
          artifactId: `${input.providerResults.composedVideo.id}-thumbnail`,
          extension: "jpg",
        }),
        bytes: await readFile(input.providerResults.composedVideo.thumbnailFilePath),
        contentType:
          input.providerResults.composedVideo.thumbnailMimeType ?? "image/jpeg",
        sourceUrl: input.providerResults.composedVideo.thumbnailUrl,
      })
    : input.providerResults.composedVideo.thumbnailUrl &&
        isRemoteUrl(input.providerResults.composedVideo.thumbnailUrl)
      ? await persistBinaryArtifact({
          ...common,
          pathname: artifactPathname({
            ...common,
            artifactType: "thumbnail-image",
            artifactId: `${input.providerResults.composedVideo.id}-thumbnail`,
            extension: "jpg",
          }),
          bytes: await fetchBuffer(input.providerResults.composedVideo.thumbnailUrl),
          contentType:
            input.providerResults.composedVideo.thumbnailMimeType ?? "image/jpeg",
          sourceUrl: input.providerResults.composedVideo.thumbnailUrl,
        })
      : input.providerResults.composedVideo.thumbnailUrl
        ? await persistJsonArtifact({
            ...common,
            pathname: artifactPathname({
              ...common,
              artifactType: "thumbnail-image",
              artifactId: `${input.providerResults.composedVideo.id}-thumbnail`,
              extension: "json",
            }),
            payload: {
              artifactType: "thumbnail_image",
              providerId: input.providerResults.composedVideo.provider,
              sourceUrl: input.providerResults.composedVideo.thumbnailUrl,
              createdAt: input.providerResults.composedVideo.createdAt,
            },
            sourceUrl: input.providerResults.composedVideo.thumbnailUrl,
          })
        : null;

  if (input.providerResults.composedVideo.videoFilePath) {
    await rm(path.dirname(input.providerResults.composedVideo.videoFilePath), {
      recursive: true,
      force: true,
    }).catch(() => {});
  }

  return {
    narration,
    sceneAssets,
    caption,
    composedVideo,
    thumbnail,
  };
}
