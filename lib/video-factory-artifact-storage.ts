import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { put } from "@vercel/blob";
import { z } from "zod";

import type { ComposedVideoResult } from "@/lib/providers/composition-provider";
import type { GeneratedCaptionTrack } from "@/lib/providers/caption-provider";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";
import type { GeneratedSceneAsset } from "@/lib/providers/visual-provider";

export const VIDEO_FACTORY_RETENTION_CLASSES = [
  "intermediate_artifact",
  "final_approved_output",
  "exported_production_package",
  "diagnostics_log",
] as const;

const VIDEO_FACTORY_RETENTION_DAYS: Record<
  (typeof VIDEO_FACTORY_RETENTION_CLASSES)[number],
  number
> = {
  intermediate_artifact: 14,
  final_approved_output: 180,
  exported_production_package: 365,
  diagnostics_log: 30,
};

export const videoFactoryRetentionClassSchema = z.enum(
  VIDEO_FACTORY_RETENTION_CLASSES,
);

export const videoFactoryRetentionPolicySchema = z.object({
  createdAt: z.string().trim().nullable().default(null),
  retentionClass: videoFactoryRetentionClassSchema,
  retentionDays: z.number().int().positive().nullable().default(null),
  expiresAt: z.string().trim().nullable().default(null),
  deletionEligible: z.boolean().default(false),
});

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoAfterDays(createdAt: string, retentionDays: number) {
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    throw new Error(`Invalid retention createdAt timestamp: ${createdAt}`);
  }

  return new Date(createdAtMs + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function asOfTimestamp(asOf?: string | Date) {
  if (!asOf) {
    return Date.now();
  }

  const timestamp =
    asOf instanceof Date ? asOf.getTime() : new Date(asOf).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid retention asOf timestamp: ${String(asOf)}`);
  }

  return timestamp;
}

export function getVideoFactoryRetentionDays(
  retentionClass: z.infer<typeof videoFactoryRetentionClassSchema>,
) {
  return VIDEO_FACTORY_RETENTION_DAYS[retentionClass];
}

export function buildVideoFactoryRetentionPolicy(input: {
  createdAt: string | null | undefined;
  retentionClass: z.infer<typeof videoFactoryRetentionClassSchema>;
  retentionDays?: number | null;
  asOf?: string | Date;
}) {
  const createdAt = normalizeText(input.createdAt);
  const retentionDays =
    input.retentionDays ?? getVideoFactoryRetentionDays(input.retentionClass);
  const expiresAt =
    createdAt && retentionDays > 0
      ? toIsoAfterDays(createdAt, retentionDays)
      : null;
  const deletionEligible = expiresAt
    ? asOfTimestamp(input.asOf) >= new Date(expiresAt).getTime()
    : false;

  return videoFactoryRetentionPolicySchema.parse({
    createdAt,
    retentionClass: input.retentionClass,
    retentionDays,
    expiresAt,
    deletionEligible,
  });
}

export function isVideoFactoryRetentionDeletionEligible(
  policy:
    | Partial<z.infer<typeof videoFactoryRetentionPolicySchema>>
    | null
    | undefined,
  asOf?: string | Date,
) {
  if (!policy) {
    return false;
  }

  if (!policy.expiresAt) {
    return false;
  }

  return asOfTimestamp(asOf) >= new Date(policy.expiresAt).getTime();
}

export function listCleanupEligibleRetentionPolicies<
  T extends z.infer<typeof videoFactoryRetentionPolicySchema>,
>(policies: T[], options?: { asOf?: string | Date }) {
  return policies.filter((policy) =>
    isVideoFactoryRetentionDeletionEligible(policy, options?.asOf),
  );
}

const videoFactoryPersistedArtifactRefCoreSchema = z.object({
  backend: z.enum(["blob", "source"]),
  pathname: z.string().trim().nullable().default(null),
  url: z.string().trim().nullable().default(null),
  sourceUrl: z.string().trim().nullable().default(null),
  contentType: z.string().trim().nullable().default(null),
  persistedAt: z.string().trim().nullable().default(null),
});

export const videoFactoryPersistedArtifactRefSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    const artifactRef = value as Record<string, unknown>;
    const retentionClass = videoFactoryRetentionClassSchema.safeParse(
      artifactRef.retentionClass,
    ).success
      ? (artifactRef.retentionClass as z.infer<
          typeof videoFactoryRetentionClassSchema
        >)
      : "intermediate_artifact";
    const createdAt =
      normalizeText(
        typeof artifactRef.createdAt === "string" ? artifactRef.createdAt : null,
      ) ??
      normalizeText(
        typeof artifactRef.persistedAt === "string" ? artifactRef.persistedAt : null,
      );
    const retentionDays =
      typeof artifactRef.retentionDays === "number" &&
      Number.isInteger(artifactRef.retentionDays) &&
      artifactRef.retentionDays > 0
        ? artifactRef.retentionDays
        : getVideoFactoryRetentionDays(retentionClass);
    const expiresAt =
      normalizeText(
        typeof artifactRef.expiresAt === "string" ? artifactRef.expiresAt : null,
      ) ??
      (createdAt ? toIsoAfterDays(createdAt, retentionDays) : null);

    return {
      ...artifactRef,
      createdAt,
      retentionClass,
      retentionDays,
      expiresAt,
      deletionEligible:
        typeof artifactRef.deletionEligible === "boolean"
          ? artifactRef.deletionEligible
          : false,
    };
  },
  videoFactoryPersistedArtifactRefCoreSchema.extend({
    createdAt: z.string().trim().nullable().optional(),
    retentionClass: videoFactoryRetentionClassSchema.optional(),
    retentionDays: z.number().int().positive().nullable().optional(),
    expiresAt: z.string().trim().nullable().optional(),
    deletionEligible: z.boolean().optional(),
  }),
);

export type VideoFactoryPersistedArtifactRef = z.input<
  typeof videoFactoryPersistedArtifactRefSchema
>;
export type ResolvedVideoFactoryPersistedArtifactRef = z.output<
  typeof videoFactoryPersistedArtifactRefSchema
>;
export type VideoFactoryRetentionPolicy = z.infer<
  typeof videoFactoryRetentionPolicySchema
>;
export type PersistedVideoFactoryArtifacts = {
  narration: ResolvedVideoFactoryPersistedArtifactRef;
  sceneAssets: ResolvedVideoFactoryPersistedArtifactRef[];
  caption: ResolvedVideoFactoryPersistedArtifactRef;
  composedVideo: ResolvedVideoFactoryPersistedArtifactRef;
  thumbnail: ResolvedVideoFactoryPersistedArtifactRef | null;
};

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
  createdAt?: string | null;
  retentionClass: z.infer<typeof videoFactoryRetentionClassSchema>;
  sourceUrl?: string | null;
  persistedAt: string;
  persistBlob: PersistBlobFn;
  blobEnabled: boolean;
  access: BlobAccess;
}): Promise<ResolvedVideoFactoryPersistedArtifactRef> {
  const retention = buildVideoFactoryRetentionPolicy({
    createdAt: input.createdAt ?? input.persistedAt,
    retentionClass: input.retentionClass,
    asOf: input.persistedAt,
  });

  if (!input.blobEnabled) {
    return videoFactoryPersistedArtifactRefSchema.parse({
      backend: "source",
      pathname: null,
      url: null,
      sourceUrl: normalizeText(input.sourceUrl),
      contentType: input.contentType,
      persistedAt: null,
      ...retention,
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
    ...retention,
  });
}

async function persistJsonArtifact(input: {
  pathname: string;
  payload: unknown;
  createdAt?: string | null;
  retentionClass: z.infer<typeof videoFactoryRetentionClassSchema>;
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
    createdAt: input.createdAt,
    retentionClass: input.retentionClass,
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
  createdAt?: string | null;
  retentionClass: z.infer<typeof videoFactoryRetentionClassSchema>;
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
    createdAt: input.createdAt,
    retentionClass: input.retentionClass,
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
): Promise<PersistedVideoFactoryArtifacts> {
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
        createdAt: input.providerResults.narration.createdAt,
        retentionClass: "intermediate_artifact",
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
          createdAt: input.providerResults.narration.createdAt,
          retentionClass: "intermediate_artifact",
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
          createdAt: input.providerResults.narration.createdAt,
          retentionClass: "intermediate_artifact",
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
            createdAt: sceneAsset.createdAt,
            retentionClass: "intermediate_artifact",
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
            createdAt: sceneAsset.createdAt,
            retentionClass: "intermediate_artifact",
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
    createdAt: input.providerResults.captionTrack.createdAt,
    retentionClass: "intermediate_artifact",
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
        createdAt: input.providerResults.composedVideo.createdAt,
        retentionClass: "intermediate_artifact",
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
          createdAt: input.providerResults.composedVideo.createdAt,
          retentionClass: "intermediate_artifact",
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
          createdAt: input.providerResults.composedVideo.createdAt,
          retentionClass: "intermediate_artifact",
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
        createdAt: input.providerResults.composedVideo.createdAt,
        retentionClass: "intermediate_artifact",
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
          createdAt: input.providerResults.composedVideo.createdAt,
          retentionClass: "intermediate_artifact",
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
            createdAt: input.providerResults.composedVideo.createdAt,
            retentionClass: "intermediate_artifact",
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

export function listCleanupEligibleArtifactRefs(
  refs: Array<VideoFactoryPersistedArtifactRef | null | undefined>,
  options?: { asOf?: string | Date },
): ResolvedVideoFactoryPersistedArtifactRef[] {
  return refs
    .filter((ref): ref is VideoFactoryPersistedArtifactRef => Boolean(ref))
    .map((ref) => videoFactoryPersistedArtifactRefSchema.parse(ref))
    .filter((ref) =>
      isVideoFactoryRetentionDeletionEligible(ref, options?.asOf),
    );
}

export function applyVideoFactoryRetentionPolicyToArtifactRef(
  ref: VideoFactoryPersistedArtifactRef,
  input: {
    createdAt?: string | null;
    retentionClass: z.infer<typeof videoFactoryRetentionClassSchema>;
    retentionDays?: number | null;
    asOf?: string | Date;
  },
): ResolvedVideoFactoryPersistedArtifactRef {
  const normalizedRef = videoFactoryPersistedArtifactRefSchema.parse(ref);

  return videoFactoryPersistedArtifactRefSchema.parse({
    ...normalizedRef,
    ...buildVideoFactoryRetentionPolicy({
      createdAt:
        input.createdAt ?? normalizedRef.createdAt ?? normalizedRef.persistedAt,
      retentionClass: input.retentionClass,
      retentionDays: input.retentionDays,
      asOf: input.asOf,
    }),
  });
}
