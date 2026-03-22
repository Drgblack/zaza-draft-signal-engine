import { z } from "zod";

import type { CompositionSpec } from "@/lib/composition-specs";
import type { GeneratedCaptionTrack } from "@/lib/providers/caption-provider";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";
import type { GeneratedSceneAsset } from "@/lib/providers/visual-provider";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const composedVideoResultSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.literal("ffmpeg"),
  videoUrl: z.string().trim().min(1),
  thumbnailUrl: z.string().trim().nullable().optional(),
  durationSec: z.number().int().positive().nullable().optional(),
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
  }): ComposedVideoResult;
}

function composedVideoResultId(compositionSpecId: string): string {
  return `${compositionSpecId}:composed-video:ffmpeg`;
}

export const ffmpegCompositionProvider: CompositionProviderAdapter = {
  provider: "ffmpeg",
  composeVideo(input) {
    const resultId = composedVideoResultId(input.compositionSpec.id);
    const durationFromScenes = input.sceneAssets.length > 0
      ? null
      : input.narration.durationSec ?? null;

    return composedVideoResultSchema.parse({
      id: resultId,
      provider: "ffmpeg",
      videoUrl: `mock://ffmpeg/composed-videos/${resultId}.mp4`,
      thumbnailUrl: `mock://ffmpeg/composed-videos/${resultId}.jpg`,
      durationSec: input.narration.durationSec ?? durationFromScenes,
      createdAt: input.createdAt ?? MOCK_CREATED_AT,
    });
  },
};
