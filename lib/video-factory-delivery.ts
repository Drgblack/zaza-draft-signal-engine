import { z } from "zod";

export const VIDEO_FACTORY_DELIVERY_ASSET_TYPES = [
  "video",
  "thumbnail",
  "audio",
  "caption",
  "scene_video",
] as const;

export const VIDEO_FACTORY_DELIVERY_PROVIDERS = [
  "vercel-blob",
  "external-http",
  "mock",
  "internal",
] as const;

export const VIDEO_FACTORY_DELIVERY_CLASSES = [
  "internal_only",
  "cdn_ready",
] as const;

export const videoFactoryDeliveryAssetSchema = z.object({
  assetType: z.enum(VIDEO_FACTORY_DELIVERY_ASSET_TYPES),
  provider: z.enum(VIDEO_FACTORY_DELIVERY_PROVIDERS),
  sourceUrl: z.string().trim().nullable().default(null),
  publicUrl: z.string().trim().nullable().default(null),
  cdnUrl: z.string().trim().nullable().default(null),
  cacheControl: z.string().trim().min(1),
  deliveryClass: z.enum(VIDEO_FACTORY_DELIVERY_CLASSES),
  readyForDistribution: z.boolean(),
});

export type VideoFactoryDeliveryAsset = z.infer<
  typeof videoFactoryDeliveryAssetSchema
>;

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function inferProvider(
  sourceUrl: string | null,
): VideoFactoryDeliveryAsset["provider"] {
  if (!sourceUrl) {
    return "internal";
  }

  if (sourceUrl.startsWith("mock://")) {
    return "mock";
  }

  if (/^https?:\/\//i.test(sourceUrl)) {
    return sourceUrl.includes(".blob.vercel-storage.com") ||
      sourceUrl.includes("blob.")
      ? "vercel-blob"
      : "external-http";
  }

  return "internal";
}

export function buildVideoFactoryDeliveryAsset(input: {
  assetType: VideoFactoryDeliveryAsset["assetType"];
  sourceUrl?: string | null;
}): VideoFactoryDeliveryAsset | null {
  const sourceUrl = normalizeText(input.sourceUrl);
  if (!sourceUrl) {
    return null;
  }

  const provider = inferProvider(sourceUrl);
  const isExternallyReachable =
    provider === "vercel-blob" || provider === "external-http";

  return videoFactoryDeliveryAssetSchema.parse({
    assetType: input.assetType,
    provider,
    sourceUrl,
    publicUrl: isExternallyReachable ? sourceUrl : null,
    cdnUrl: isExternallyReachable ? sourceUrl : null,
    cacheControl: isExternallyReachable
      ? "public, max-age=31536000, immutable"
      : "private, no-store",
    deliveryClass: isExternallyReachable ? "cdn_ready" : "internal_only",
    readyForDistribution: isExternallyReachable,
  });
}
