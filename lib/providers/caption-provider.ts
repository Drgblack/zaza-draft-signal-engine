import { z } from "zod";

import type { CaptionSpec } from "@/lib/caption-specs";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const generatedCaptionTrackSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.literal("assemblyai"),
  sourceNarrationId: z.string().trim().min(1),
  transcriptText: z.string().trim().min(1),
  captionUrl: z.string().trim().nullable().optional(),
  createdAt: z.string().trim().min(1),
});

export type GeneratedCaptionTrack = z.infer<typeof generatedCaptionTrackSchema>;

export interface CaptionProviderAdapter {
  readonly provider: "assemblyai";
  generateCaptionTrack(input: {
    captionSpec: CaptionSpec;
    narration: GeneratedNarration;
    createdAt?: string;
  }): GeneratedCaptionTrack;
}

function generatedCaptionTrackId(sourceNarrationId: string): string {
  return `${sourceNarrationId}:generated-caption-track:assemblyai`;
}

export const assemblyAiCaptionProvider: CaptionProviderAdapter = {
  provider: "assemblyai",
  generateCaptionTrack(input) {
    const resultId = generatedCaptionTrackId(input.narration.id);

    return generatedCaptionTrackSchema.parse({
      id: resultId,
      provider: "assemblyai",
      sourceNarrationId: input.narration.id,
      transcriptText: input.captionSpec.sourceText,
      captionUrl: `mock://assemblyai/captions/${resultId}.vtt`,
      createdAt: input.createdAt ?? MOCK_CREATED_AT,
    });
  },
};
