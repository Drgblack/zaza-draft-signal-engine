import { z } from "zod";

import {
  buildVideoFactoryDeliveryAsset,
  videoFactoryDeliveryAssetSchema,
} from "./video-factory-delivery";

export const PLATFORM_READY_OUTPUT_PLATFORMS = [
  "tiktok",
  "linkedin",
  "instagram_reels",
] as const;

export const platformCaptionFormatSchema = z.enum([
  "burned_in_dynamic",
  "burned_in_minimal",
  "native_friendly",
]);

export const platformHookPlacementSchema = z.object({
  windowStartSec: z.number().min(0),
  windowEndSec: z.number().positive(),
  placement: z.enum(["immediate", "front_loaded", "professional_open"]),
});

export const platformVideoConfigSchema = z.object({
  aspectRatio: z.enum(["9:16", "4:5"]),
  minDurationSec: z.number().int().positive().nullable().default(null),
  maxDurationSec: z.number().int().positive(),
  captionFormat: platformCaptionFormatSchema,
  hookPlacement: platformHookPlacementSchema,
  ctaFormat: z.enum([
    "short_imperative",
    "soft_professional",
    "proof_then_cta",
  ]),
});

export const platformMetadataBundleSchema = z.object({
  platform: z.enum(PLATFORM_READY_OUTPUT_PLATFORMS),
  channelLabel: z.string().trim().min(1),
  title: z.string().trim().min(1),
  captionText: z.string().trim().min(1),
  hashtags: z.array(z.string().trim().min(1)).default([]),
  hookText: z.string().trim().min(1),
  ctaText: z.string().trim().min(1),
  thumbnailUrl: z.string().trim().nullable().default(null),
  packagingNotes: z.array(z.string().trim().min(1)).min(1),
});

export const platformReadyOutputSchema = z.object({
  platform: z.enum(PLATFORM_READY_OUTPUT_PLATFORMS),
  finalVideoConfig: platformVideoConfigSchema,
  captionText: z.string().trim().min(1),
  metadataBundle: platformMetadataBundleSchema,
  deliveryAsset: videoFactoryDeliveryAssetSchema.nullable().default(null),
});

export type PlatformReadyOutput = z.infer<typeof platformReadyOutputSchema>;

export type PlatformPackagingInput = {
  title: string;
  hook: string;
  cta: string;
  overlayLines: string[];
  finalVideoUrl?: string | null;
  thumbnailUrl?: string | null;
  durationSec: number;
  contentType?: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function nonEmpty(value: string | null | undefined, fallback: string) {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : fallback;
}

function buildHashtags(input: {
  platform: PlatformReadyOutput["platform"];
  contentType?: string | null;
}) {
  switch (input.platform) {
    case "tiktok":
      return [
        "#TeacherTok",
        "#TeacherTips",
        input.contentType ? `#${input.contentType}` : null,
      ].filter((tag): tag is string => Boolean(tag));
    case "instagram_reels":
      return [
        "#TeacherReels",
        "#ClassroomCommunication",
        input.contentType ? `#${input.contentType}` : null,
      ].filter((tag): tag is string => Boolean(tag));
    case "linkedin":
    default:
      return ["#TeacherCommunication", "#EdTech"].filter(Boolean);
  }
}

function buildTikTokCaption(input: PlatformPackagingInput) {
  return [
    nonEmpty(input.hook, input.title),
    nonEmpty(input.overlayLines[0], "Keep the first seconds unmistakably useful."),
    nonEmpty(input.cta, "Try Zaza Draft."),
  ].join(" ");
}

function buildLinkedInCaption(input: PlatformPackagingInput) {
  return [
    nonEmpty(input.hook, input.title),
    "Built for calm, teacher-real communication moments.",
    nonEmpty(input.cta, "Try Zaza Draft."),
  ].join(" ");
}

function buildReelsCaption(input: PlatformPackagingInput) {
  return [
    nonEmpty(input.hook, input.title),
    nonEmpty(input.overlayLines[1] ?? input.overlayLines[0], "Keep the message clear and grounded."),
    nonEmpty(input.cta, "Try Zaza Draft."),
  ].join(" ");
}

export function transformToTikTok(
  input: PlatformPackagingInput,
): PlatformReadyOutput {
  const captionText = buildTikTokCaption(input);
  return platformReadyOutputSchema.parse({
    platform: "tiktok",
    finalVideoConfig: {
      aspectRatio: "9:16",
      minDurationSec: 15,
      maxDurationSec: 60,
      captionFormat: "burned_in_dynamic",
      hookPlacement: {
        windowStartSec: 0,
        windowEndSec: 2,
        placement: "immediate",
      },
      ctaFormat: "short_imperative",
    },
    captionText,
    metadataBundle: {
      platform: "tiktok",
      channelLabel: "TikTok",
      title: nonEmpty(input.title, "Teacher-real tip"),
      captionText,
      hashtags: buildHashtags({
        platform: "tiktok",
        contentType: input.contentType,
      }),
      hookText: nonEmpty(input.hook, input.title),
      ctaText: nonEmpty(input.cta, "Try Zaza Draft."),
      thumbnailUrl: normalizeText(input.thumbnailUrl) || null,
      packagingNotes: [
        "Keep the hook visible inside the first 2 seconds.",
        "Use bold burned-in captions sized for full-screen mobile playback.",
        "End on a short directive CTA rather than a long explanation.",
      ],
    },
    deliveryAsset: buildVideoFactoryDeliveryAsset({
      assetType: "video",
      sourceUrl: input.finalVideoUrl,
    }),
  });
}

export function transformToLinkedIn(
  input: PlatformPackagingInput,
): PlatformReadyOutput {
  const captionText = buildLinkedInCaption(input);
  return platformReadyOutputSchema.parse({
    platform: "linkedin",
    finalVideoConfig: {
      aspectRatio: "4:5",
      minDurationSec: null,
      maxDurationSec: 90,
      captionFormat: "native_friendly",
      hookPlacement: {
        windowStartSec: 0,
        windowEndSec: 3,
        placement: "professional_open",
      },
      ctaFormat: "soft_professional",
    },
    captionText,
    metadataBundle: {
      platform: "linkedin",
      channelLabel: "LinkedIn",
      title: nonEmpty(input.title, "Teacher-real communication tip"),
      captionText,
      hashtags: buildHashtags({
        platform: "linkedin",
        contentType: input.contentType,
      }),
      hookText: nonEmpty(input.hook, input.title),
      ctaText: nonEmpty(input.cta, "Try Zaza Draft."),
      thumbnailUrl: normalizeText(input.thumbnailUrl) || null,
      packagingNotes: [
        "Use a calmer, more professional opening line than the short-form social variants.",
        "Keep on-video caption density lower so native copy can carry context.",
        "Prefer a softer CTA that sounds like a recommendation rather than a command.",
      ],
    },
    deliveryAsset: buildVideoFactoryDeliveryAsset({
      assetType: "video",
      sourceUrl: input.finalVideoUrl,
    }),
  });
}

export function transformToReels(
  input: PlatformPackagingInput,
): PlatformReadyOutput {
  const captionText = buildReelsCaption(input);
  return platformReadyOutputSchema.parse({
    platform: "instagram_reels",
    finalVideoConfig: {
      aspectRatio: "9:16",
      minDurationSec: 15,
      maxDurationSec: 90,
      captionFormat: "burned_in_minimal",
      hookPlacement: {
        windowStartSec: 0,
        windowEndSec: 2,
        placement: "front_loaded",
      },
      ctaFormat: "proof_then_cta",
    },
    captionText,
    metadataBundle: {
      platform: "instagram_reels",
      channelLabel: "Instagram Reels",
      title: nonEmpty(input.title, "Teacher-real reels cut"),
      captionText,
      hashtags: buildHashtags({
        platform: "instagram_reels",
        contentType: input.contentType,
      }),
      hookText: nonEmpty(input.hook, input.title),
      ctaText: nonEmpty(input.cta, "Try Zaza Draft."),
      thumbnailUrl: normalizeText(input.thumbnailUrl) || null,
      packagingNotes: [
        "Keep the hook front-loaded but visually cleaner than TikTok.",
        "Use minimal burned-in captions and rely on the cover frame to carry context.",
        "Land the CTA after the proof moment rather than opening with it.",
      ],
    },
    deliveryAsset: buildVideoFactoryDeliveryAsset({
      assetType: "video",
      sourceUrl: input.finalVideoUrl,
    }),
  });
}

export function buildPlatformReadyOutputs(
  input: PlatformPackagingInput,
): PlatformReadyOutput[] {
  return [
    transformToTikTok(input),
    transformToLinkedIn(input),
    transformToReels(input),
  ];
}
