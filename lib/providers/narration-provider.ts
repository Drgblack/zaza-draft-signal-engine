import { z } from "zod";

import type { NarrationSpec } from "@/lib/narration-specs";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const generatedNarrationSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.literal("elevenlabs"),
  audioUrl: z.string().trim().min(1),
  durationSec: z.number().int().positive().optional(),
  createdAt: z.string().trim().min(1),
});

export type GeneratedNarration = z.infer<typeof generatedNarrationSchema>;

export interface NarrationProviderAdapter {
  readonly provider: "elevenlabs";
  generateNarration(input: {
    narrationSpec: NarrationSpec;
    createdAt?: string;
  }): GeneratedNarration;
}

function generatedNarrationId(narrationSpecId: string): string {
  return `${narrationSpecId}:generated-narration:elevenlabs`;
}

export const elevenLabsNarrationProvider: NarrationProviderAdapter = {
  provider: "elevenlabs",
  generateNarration(input) {
    const resultId = generatedNarrationId(input.narrationSpec.id);

    return generatedNarrationSchema.parse({
      id: resultId,
      provider: "elevenlabs",
      audioUrl: `mock://elevenlabs/narration/${resultId}.mp3`,
      durationSec: input.narrationSpec.targetDurationSec,
      createdAt: input.createdAt ?? MOCK_CREATED_AT,
    });
  },
};
