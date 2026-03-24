import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  buildVideoFactoryDeliveryAsset,
  videoFactoryDeliveryAssetSchema,
} from "@/lib/video-factory-delivery";

function thumbnailSpecsStorePath() {
  return path.join(
    process.cwd(),
    "data",
    "video-factory-thumbnail-specs.json",
  );
}

export const videoFactoryThumbnailSourceSchema = z.enum([
  "generated",
  "manual_override",
]);

export const videoFactoryThumbnailSpecSchema = z.object({
  thumbnailSpecId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  renderJobId: z.string().trim().nullable().default(null),
  renderedAssetId: z.string().trim().nullable().default(null),
  source: videoFactoryThumbnailSourceSchema,
  imageUrl: z.string().trim().min(1),
  generatedImageUrl: z.string().trim().nullable().default(null),
  providerId: z.string().trim().min(1),
  overlayText: z.string().trim().nullable().default(null),
  delivery: videoFactoryDeliveryAssetSchema.nullable().default(null),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const videoFactoryThumbnailSpecStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  specs: z.array(videoFactoryThumbnailSpecSchema).default([]),
});

export type VideoFactoryThumbnailSpec = z.infer<
  typeof videoFactoryThumbnailSpecSchema
>;

type VideoFactoryThumbnailSpecStore = z.infer<
  typeof videoFactoryThumbnailSpecStoreSchema
>;

function normalizeStore(
  store: VideoFactoryThumbnailSpecStore,
): VideoFactoryThumbnailSpecStore {
  return videoFactoryThumbnailSpecStoreSchema.parse({
    updatedAt: store.updatedAt,
    specs: [...store.specs].sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.createdAt.localeCompare(left.createdAt),
    ),
  });
}

function buildDefaultStore(): VideoFactoryThumbnailSpecStore {
  return videoFactoryThumbnailSpecStoreSchema.parse({
    updatedAt: null,
    specs: [],
  });
}

function readPersistedStoreSync(): VideoFactoryThumbnailSpecStore {
  try {
    const raw = readFileSync(thumbnailSpecsStorePath(), "utf8");
    return normalizeStore(
      videoFactoryThumbnailSpecStoreSchema.parse(JSON.parse(raw)),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return buildDefaultStore();
    }

    throw error;
  }
}

async function writePersistedStore(
  store: VideoFactoryThumbnailSpecStore,
): Promise<void> {
  const storePath = thumbnailSpecsStorePath();
  await mkdir(path.dirname(storePath), {
    recursive: true,
  });
  await writeFile(
    storePath,
    `${JSON.stringify(normalizeStore(store), null, 2)}\n`,
    "utf8",
  );
}

export function buildVideoFactoryThumbnailSpec(input: {
  opportunityId: string;
  renderJobId?: string | null;
  renderedAssetId?: string | null;
  source: "generated" | "manual_override";
  imageUrl: string;
  generatedImageUrl?: string | null;
  providerId: string;
  overlayText?: string | null;
  createdAt: string;
  updatedAt?: string;
}): VideoFactoryThumbnailSpec {
  return videoFactoryThumbnailSpecSchema.parse({
    thumbnailSpecId: [
      input.opportunityId,
      input.renderJobId ?? input.renderedAssetId ?? "thumbnail",
      "thumbnail-spec",
    ].join(":"),
    opportunityId: input.opportunityId,
    renderJobId: input.renderJobId ?? null,
    renderedAssetId: input.renderedAssetId ?? null,
    source: input.source,
    imageUrl: input.imageUrl,
    generatedImageUrl: input.generatedImageUrl ?? null,
    providerId: input.providerId,
    overlayText: input.overlayText ?? null,
    delivery: buildVideoFactoryDeliveryAsset({
      assetType: "thumbnail",
      sourceUrl: input.imageUrl,
    }),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  });
}

export function listVideoFactoryThumbnailSpecs(): VideoFactoryThumbnailSpec[] {
  return readPersistedStoreSync().specs;
}

export function getVideoFactoryThumbnailSpec(
  opportunityId: string,
): VideoFactoryThumbnailSpec | null {
  return (
    listVideoFactoryThumbnailSpecs().find(
      (spec) => spec.opportunityId === opportunityId,
    ) ?? null
  );
}

export async function upsertVideoFactoryThumbnailSpec(
  spec: VideoFactoryThumbnailSpec,
): Promise<VideoFactoryThumbnailSpec> {
  const store = readPersistedStoreSync();
  const nextSpec = videoFactoryThumbnailSpecSchema.parse(spec);

  await writePersistedStore({
    updatedAt: nextSpec.updatedAt,
    specs: [
      nextSpec,
      ...store.specs.filter(
        (item) => item.thumbnailSpecId !== nextSpec.thumbnailSpecId,
      ),
    ],
  });

  return nextSpec;
}
