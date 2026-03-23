import { z } from "zod";

import type { NarrationSpec } from "@/lib/narration-specs";
import {
  elevenLabsBaseUrl,
  elevenLabsModelId,
  fetchWithProviderTimeout,
  providerConfigError,
  providerHttpError,
  providerRequestTimeoutMs,
  shouldUseRealProvider,
  toBase64,
} from "./provider-runtime";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const generatedNarrationSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.literal("elevenlabs"),
  audioUrl: z.string().trim().min(1),
  providerJobId: z.string().trim().nullable().optional().default(null),
  audioMimeType: z.string().trim().nullable().optional().default(null),
  audioBase64: z.string().trim().nullable().optional().default(null),
  durationSec: z.number().int().positive().optional(),
  createdAt: z.string().trim().min(1),
});

export type GeneratedNarration = z.infer<typeof generatedNarrationSchema>;

export interface NarrationProviderAdapter {
  readonly provider: "elevenlabs";
  generateNarration(input: {
    narrationSpec: NarrationSpec;
    voiceId?: string | null;
    voiceSettings?: {
      stability?: number;
      similarityBoost?: number;
      style?: number;
      speakerBoost?: boolean;
    } | null;
    modelId?: string | null;
    createdAt?: string;
  }): Promise<GeneratedNarration>;
}

function generatedNarrationId(narrationSpecId: string): string {
  return `${narrationSpecId}:generated-narration:elevenlabs`;
}

async function generateMockNarration(input: {
  narrationSpec: NarrationSpec;
  createdAt?: string;
}): Promise<GeneratedNarration> {
  const resultId = generatedNarrationId(input.narrationSpec.id);

  return generatedNarrationSchema.parse({
    id: resultId,
    provider: "elevenlabs",
    audioUrl: `mock://elevenlabs/narration/${resultId}.mp3`,
    providerJobId: null,
    audioMimeType: "audio/mpeg",
    audioBase64: null,
    durationSec: input.narrationSpec.targetDurationSec,
    createdAt: input.createdAt ?? MOCK_CREATED_AT,
  });
}

export const elevenLabsNarrationProvider: NarrationProviderAdapter = {
  provider: "elevenlabs",
  async generateNarration(input) {
    if (
      !shouldUseRealProvider({
        provider: "ElevenLabs",
        stage: "narration",
        requiredEnvNames: ["ELEVENLABS_API_KEY"],
      })
    ) {
      return generateMockNarration(input);
    }

    const resultId = generatedNarrationId(input.narrationSpec.id);
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const voiceId = input.voiceId?.trim() || process.env.ELEVENLABS_VOICE_ID?.trim();
    if (!apiKey) {
      throw providerConfigError("ElevenLabs", "ELEVENLABS_API_KEY is missing.");
    }

    if (!voiceId) {
      throw providerConfigError(
        "ElevenLabs",
        "No voice ID was provided. Pass defaultsSnapshot.voiceId or set ELEVENLABS_VOICE_ID.",
        "narration",
      );
    }

    const response = await fetchWithProviderTimeout({
      provider: "ElevenLabs",
      stage: "narration",
      url: `${elevenLabsBaseUrl()}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      timeoutMs: providerRequestTimeoutMs("ELEVENLABS"),
      init: {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: input.narrationSpec.script,
          model_id: input.modelId?.trim() || elevenLabsModelId(),
          output_format: "mp3_44100_128",
          voice_settings: input.voiceSettings
            ? {
                stability: input.voiceSettings.stability,
                similarity_boost: input.voiceSettings.similarityBoost,
                style: input.voiceSettings.style,
                use_speaker_boost: input.voiceSettings.speakerBoost,
              }
            : undefined,
        }),
      },
    });

    if (!response.ok) {
      throw providerHttpError({
        provider: "ElevenLabs",
        stage: "narration",
        status: response.status,
        message: await response.text(),
      });
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    return generatedNarrationSchema.parse({
      id: resultId,
      provider: "elevenlabs",
      audioUrl: `elevenlabs://narration/${resultId}.mp3`,
      providerJobId: null,
      audioMimeType: response.headers.get("content-type") ?? "audio/mpeg",
      audioBase64: toBase64(bytes),
      durationSec: input.narrationSpec.targetDurationSec,
      createdAt: input.createdAt ?? new Date().toISOString(),
    });
  },
};
