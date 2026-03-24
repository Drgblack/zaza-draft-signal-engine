import { z } from "zod";

import type { NarrationSpec } from "@/lib/narration-specs";
import {
  elevenLabsBaseUrl,
  elevenLabsModelId,
  fetchWithProviderTimeout,
  openAiBaseUrl,
  openAiTtsModelId,
  openAiTtsVoice,
  providerConfigError,
  providerHttpError,
  providerRequestTimeoutMs,
  shouldUseRealProvider,
  toBase64,
} from "./provider-runtime";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const NARRATION_PROVIDER_IDS = ["elevenlabs", "openai-tts"] as const;
export type NarrationProviderId = (typeof NARRATION_PROVIDER_IDS)[number];

export const generatedNarrationSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.enum(NARRATION_PROVIDER_IDS),
  audioUrl: z.string().trim().min(1),
  providerJobId: z.string().trim().nullable().optional().default(null),
  audioMimeType: z.string().trim().nullable().optional().default(null),
  audioBase64: z.string().trim().nullable().optional().default(null),
  durationSec: z.number().int().positive().optional(),
  createdAt: z.string().trim().min(1),
});

export type GeneratedNarration = z.infer<typeof generatedNarrationSchema>;

export interface NarrationProviderAdapter {
  readonly provider: NarrationProviderId;
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

function generatedNarrationId(
  narrationSpecId: string,
  providerId: NarrationProviderId,
): string {
  return `${narrationSpecId}:generated-narration:${providerId}`;
}

async function generateMockNarration(input: {
  provider: NarrationProviderId;
  narrationSpec: NarrationSpec;
  createdAt?: string;
}): Promise<GeneratedNarration> {
  const resultId = generatedNarrationId(input.narrationSpec.id, input.provider);

  return generatedNarrationSchema.parse({
    id: resultId,
    provider: input.provider,
    audioUrl: `mock://${input.provider}/narration/${resultId}.mp3`,
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
      return generateMockNarration({
        provider: "elevenlabs",
        narrationSpec: input.narrationSpec,
        createdAt: input.createdAt,
      });
    }

    const resultId = generatedNarrationId(input.narrationSpec.id, "elevenlabs");
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

export const openAiTtsNarrationProvider: NarrationProviderAdapter = {
  provider: "openai-tts",
  async generateNarration(input) {
    if (
      !shouldUseRealProvider({
        provider: "OpenAI TTS",
        stage: "narration",
        requiredEnvNames: ["OPENAI_API_KEY"],
      })
    ) {
      return generateMockNarration({
        provider: "openai-tts",
        narrationSpec: input.narrationSpec,
        createdAt: input.createdAt,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw providerConfigError("OpenAI TTS", "OPENAI_API_KEY is missing.", "narration");
    }

    const resultId = generatedNarrationId(input.narrationSpec.id, "openai-tts");
    const response = await fetchWithProviderTimeout({
      provider: "OpenAI TTS",
      stage: "narration",
      url: `${openAiBaseUrl()}/v1/audio/speech`,
      timeoutMs: providerRequestTimeoutMs("OPENAI"),
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.modelId?.trim() || openAiTtsModelId(),
          voice: process.env.OPENAI_TTS_VOICE?.trim() || openAiTtsVoice(),
          input: input.narrationSpec.script,
          response_format: "mp3",
        }),
      },
    });

    if (!response.ok) {
      throw providerHttpError({
        provider: "OpenAI TTS",
        stage: "narration",
        status: response.status,
        message: await response.text(),
      });
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    return generatedNarrationSchema.parse({
      id: resultId,
      provider: "openai-tts",
      audioUrl: `openai-tts://narration/${resultId}.mp3`,
      providerJobId: null,
      audioMimeType: response.headers.get("content-type") ?? "audio/mpeg",
      audioBase64: toBase64(bytes),
      durationSec: input.narrationSpec.targetDurationSec,
      createdAt: input.createdAt ?? new Date().toISOString(),
    });
  },
};

export const narrationProviderRegistry: Record<
  NarrationProviderId,
  NarrationProviderAdapter
> = {
  elevenlabs: elevenLabsNarrationProvider,
  "openai-tts": openAiTtsNarrationProvider,
};

export function listNarrationProviders(): NarrationProviderAdapter[] {
  return NARRATION_PROVIDER_IDS.map(
    (providerId) => narrationProviderRegistry[providerId],
  );
}

export function resolveNarrationProviderId(
  providerId?: string | null,
): NarrationProviderId {
  if (!providerId || providerId === "local-default") {
    return "elevenlabs";
  }

  if (providerId in narrationProviderRegistry) {
    return providerId as NarrationProviderId;
  }

  throw providerConfigError(
    "Narration provider",
    `Unknown narration provider "${providerId}".`,
    "narration",
  );
}

export function getNarrationProvider(
  providerId?: string | null,
): NarrationProviderAdapter {
  return narrationProviderRegistry[resolveNarrationProviderId(providerId)];
}
