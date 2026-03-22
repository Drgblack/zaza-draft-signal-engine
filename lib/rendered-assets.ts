import { z } from "zod";

export const RENDERED_ASSET_TYPES = ["video"] as const;
export const ASSET_REVIEW_STATUSES = [
  "pending_review",
  "accepted",
  "rejected",
] as const;

export const renderedAssetSchema = z.object({
  id: z.string().trim().min(1),
  renderJobId: z.string().trim().min(1),
  assetType: z.enum(RENDERED_ASSET_TYPES),
  url: z.string().trim().min(1),
  thumbnailUrl: z.string().trim().nullable().default(null),
  durationSec: z.number().int().positive().nullable().default(null),
  createdAt: z.string().trim().min(1),
});

export const assetReviewStateSchema = z.object({
  id: z.string().trim().min(1),
  renderedAssetId: z.string().trim().min(1),
  status: z.enum(ASSET_REVIEW_STATUSES),
  reviewedAt: z.string().trim().nullable().default(null),
  reviewNotes: z.string().trim().nullable().default(null),
  rejectionReason: z.string().trim().nullable().default(null),
});

export type RenderedAsset = z.infer<typeof renderedAssetSchema>;
export type AssetReviewState = z.infer<typeof assetReviewStateSchema>;

function renderedAssetId(renderJobId: string): string {
  return `${renderJobId}:rendered-asset`;
}

function assetReviewStateId(renderedAssetIdValue: string): string {
  return `${renderedAssetIdValue}:asset-review`;
}

export function createMockRenderedAsset(input: {
  renderJobId: string;
  url?: string;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
  createdAt?: string;
}): RenderedAsset {
  const assetId = renderedAssetId(input.renderJobId);

  return renderedAssetSchema.parse({
    id: assetId,
    renderJobId: input.renderJobId,
    assetType: "video",
    url: input.url ?? `mock://rendered-assets/${assetId}.mp4`,
    thumbnailUrl:
      input.thumbnailUrl === undefined
        ? `mock://rendered-assets/${assetId}.jpg`
        : input.thumbnailUrl,
    durationSec: input.durationSec ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function createPendingAssetReview(input: {
  renderedAssetId: string;
}): AssetReviewState {
  return assetReviewStateSchema.parse({
    id: assetReviewStateId(input.renderedAssetId),
    renderedAssetId: input.renderedAssetId,
    status: "pending_review",
    reviewedAt: null,
    reviewNotes: null,
    rejectionReason: null,
  });
}
