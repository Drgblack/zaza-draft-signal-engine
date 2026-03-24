import { z } from "zod";

import type { CaptionSpec } from "@/lib/caption-specs";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";
import {
  assemblyAiBaseUrl,
  assemblyAiMaxPolls,
  assemblyAiPollIntervalMs,
  fetchWithProviderTimeout,
  openAiBaseUrl,
  openAiWhisperModelId,
  parseProviderJsonResponse,
  providerConfigError,
  providerHttpError,
  providerInvalidResponseError,
  providerRequestTimeoutMs,
  providerRuntimeError,
  shouldUseRealProvider,
  sleep,
} from "./provider-runtime";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const CAPTION_PROVIDER_IDS = ["assemblyai", "whisper"] as const;
export type CaptionProviderId = (typeof CAPTION_PROVIDER_IDS)[number];

export const generatedCaptionTrackSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.enum(CAPTION_PROVIDER_IDS),
  sourceNarrationId: z.string().trim().min(1),
  transcriptText: z.string().trim().min(1),
  captionUrl: z.string().trim().nullable().optional(),
  providerJobId: z.string().trim().nullable().optional().default(null),
  captionVtt: z.string().trim().nullable().optional().default(null),
  createdAt: z.string().trim().min(1),
});

export type GeneratedCaptionTrack = z.infer<typeof generatedCaptionTrackSchema>;

export interface CaptionProviderAdapter {
  readonly provider: CaptionProviderId;
  generateCaptionTrack(input: {
    captionSpec: CaptionSpec;
    narration: GeneratedNarration;
    createdAt?: string;
  }): Promise<GeneratedCaptionTrack>;
}

function generatedCaptionTrackId(
  sourceNarrationId: string,
  providerId: CaptionProviderId,
): string {
  return `${sourceNarrationId}:generated-caption-track:${providerId}`;
}

async function generateMockCaptionTrack(input: {
  provider: CaptionProviderId;
  captionSpec: CaptionSpec;
  narration: GeneratedNarration;
  createdAt?: string;
}): Promise<GeneratedCaptionTrack> {
  const resultId = generatedCaptionTrackId(input.narration.id, input.provider);

  return generatedCaptionTrackSchema.parse({
    id: resultId,
    provider: input.provider,
    sourceNarrationId: input.narration.id,
    transcriptText: input.captionSpec.sourceText,
    captionUrl: `mock://${input.provider}/captions/${resultId}.vtt`,
    providerJobId: null,
    captionVtt: null,
    createdAt: input.createdAt ?? MOCK_CREATED_AT,
  });
}

async function narrationAudioBytes(
  narration: GeneratedNarration,
  stage: string,
): Promise<Uint8Array> {
  if (narration.audioBase64) {
    return new Uint8Array(Buffer.from(narration.audioBase64, "base64"));
  }

  if (/^https?:\/\//i.test(narration.audioUrl)) {
    const response = await fetchWithProviderTimeout({
      provider: "Caption input",
      stage,
      url: narration.audioUrl,
      timeoutMs: providerRequestTimeoutMs("OPENAI"),
    });

    if (!response.ok) {
      throw providerHttpError({
        provider: "Caption input",
        stage,
        status: response.status,
        message: await response.text(),
      });
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  throw providerConfigError(
    "Caption input",
    "Narration audio must be available as audioBase64 or a reachable HTTP URL.",
    stage,
  );
}

type AssemblyAiUploadResponse = {
  upload_url: string;
};

type AssemblyAiTranscriptResponse = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string | null;
  error?: string | null;
};

type OpenAiWhisperTranscriptResponse = {
  text?: string | null;
};

export const assemblyAiCaptionProvider: CaptionProviderAdapter = {
  provider: "assemblyai",
  async generateCaptionTrack(input) {
    if (
      !shouldUseRealProvider({
        provider: "AssemblyAI",
        stage: "captions",
        requiredEnvNames: ["ASSEMBLYAI_API_KEY"],
      })
    ) {
      return generateMockCaptionTrack({
        provider: "assemblyai",
        ...input,
      });
    }

    const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
    if (!apiKey) {
      throw providerConfigError("AssemblyAI", "ASSEMBLYAI_API_KEY is missing.", "captions");
    }

    let audioUrl = input.narration.audioUrl;
    if (input.narration.audioBase64) {
      const uploadResponse = await fetchWithProviderTimeout({
        provider: "AssemblyAI",
        stage: "captions",
        url: `${assemblyAiBaseUrl()}/v2/upload`,
        timeoutMs: providerRequestTimeoutMs("ASSEMBLYAI"),
        init: {
          method: "POST",
          headers: {
            Authorization: apiKey,
            "Content-Type": input.narration.audioMimeType ?? "audio/mpeg",
          },
          body: Buffer.from(input.narration.audioBase64, "base64"),
        },
      });

      if (!uploadResponse.ok) {
        throw providerHttpError({
          provider: "AssemblyAI",
          stage: "captions",
          status: uploadResponse.status,
          message: await uploadResponse.text(),
        });
      }

      const uploaded = await parseProviderJsonResponse<AssemblyAiUploadResponse>({
        provider: "AssemblyAI",
        stage: "captions",
        response: uploadResponse,
      });
      audioUrl = uploaded?.upload_url ?? "";
    }

    if (!audioUrl || audioUrl.startsWith("mock://")) {
      throw providerConfigError(
        "AssemblyAI",
        "Narration audio is not publicly accessible and no audio bytes were available for upload.",
        "captions",
      );
    }

    const createTranscriptResponse = await fetchWithProviderTimeout({
      provider: "AssemblyAI",
      stage: "captions",
      url: `${assemblyAiBaseUrl()}/v2/transcript`,
      timeoutMs: providerRequestTimeoutMs("ASSEMBLYAI"),
      init: {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          speech_model: "universal",
          language_code: "en",
          punctuate: true,
          format_text: true,
        }),
      },
    });

    if (!createTranscriptResponse.ok) {
      throw providerHttpError({
        provider: "AssemblyAI",
        stage: "captions",
        status: createTranscriptResponse.status,
        message: await createTranscriptResponse.text(),
      });
    }

    const createdTranscript =
      await parseProviderJsonResponse<AssemblyAiTranscriptResponse>({
        provider: "AssemblyAI",
        stage: "captions",
        response: createTranscriptResponse,
      });
    const transcriptId = createdTranscript?.id;
    if (!transcriptId) {
      throw providerInvalidResponseError({
        provider: "AssemblyAI",
        stage: "captions",
        message: "AssemblyAI did not return a transcript ID.",
        retryable: true,
      });
    }

    let transcript: AssemblyAiTranscriptResponse | null = null;
    for (let poll = 0; poll < assemblyAiMaxPolls(); poll += 1) {
      const transcriptResponse = await fetchWithProviderTimeout({
        provider: "AssemblyAI",
        stage: "captions",
        url: `${assemblyAiBaseUrl()}/v2/transcript/${encodeURIComponent(transcriptId)}`,
        timeoutMs: providerRequestTimeoutMs("ASSEMBLYAI"),
        init: {
          headers: {
            Authorization: apiKey,
          },
        },
      });

      if (!transcriptResponse.ok) {
        throw providerHttpError({
          provider: "AssemblyAI",
          stage: "captions",
          status: transcriptResponse.status,
          message: await transcriptResponse.text(),
        });
      }

      transcript = await parseProviderJsonResponse<AssemblyAiTranscriptResponse>({
        provider: "AssemblyAI",
        stage: "captions",
        response: transcriptResponse,
      });
      if (transcript?.status === "completed") {
        break;
      }

      if (transcript?.status === "error") {
        throw providerRuntimeError({
          provider: "AssemblyAI",
          stage: "captions",
          message:
            transcript.error?.trim() || "AssemblyAI transcript generation failed.",
          retryable: false,
        });
      }

      await sleep(assemblyAiPollIntervalMs());
    }

    if (!transcript || transcript.status !== "completed") {
      throw providerRuntimeError({
        provider: "AssemblyAI",
        stage: "captions",
        message: "AssemblyAI transcript generation timed out before completion.",
        retryable: true,
      });
    }

    const vttResponse = await fetchWithProviderTimeout({
      provider: "AssemblyAI",
      stage: "captions",
      url: `${assemblyAiBaseUrl()}/v2/transcript/${encodeURIComponent(transcriptId)}/vtt`,
      timeoutMs: providerRequestTimeoutMs("ASSEMBLYAI"),
      init: {
        headers: {
          Authorization: apiKey,
        },
      },
    });

    if (!vttResponse.ok) {
      throw providerHttpError({
        provider: "AssemblyAI",
        stage: "captions",
        status: vttResponse.status,
        message: await vttResponse.text(),
      });
    }

    const resultId = generatedCaptionTrackId(input.narration.id, "assemblyai");
    const captionVtt = await vttResponse.text();

    return generatedCaptionTrackSchema.parse({
      id: resultId,
      provider: "assemblyai",
      sourceNarrationId: input.narration.id,
      transcriptText: transcript.text?.trim() || input.captionSpec.sourceText,
      captionUrl: null,
      providerJobId: transcriptId,
      captionVtt,
      createdAt: input.createdAt ?? new Date().toISOString(),
    });
  },
};

export const whisperCaptionProvider: CaptionProviderAdapter = {
  provider: "whisper",
  async generateCaptionTrack(input) {
    if (
      !shouldUseRealProvider({
        provider: "OpenAI Whisper",
        stage: "captions",
        requiredEnvNames: ["OPENAI_API_KEY"],
      })
    ) {
      return generateMockCaptionTrack({
        provider: "whisper",
        ...input,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw providerConfigError("OpenAI Whisper", "OPENAI_API_KEY is missing.", "captions");
    }

    const audioBytes = await narrationAudioBytes(input.narration, "captions");
    const formData = new FormData();
    const audioMimeType = input.narration.audioMimeType?.trim() || "audio/mpeg";
    const fileExtension =
      audioMimeType === "audio/wav"
        ? "wav"
        : audioMimeType === "audio/ogg"
          ? "ogg"
          : "mp3";
    formData.append(
      "file",
      new Blob([Buffer.from(audioBytes)], { type: audioMimeType }),
      `narration.${fileExtension}`,
    );
    formData.append("model", openAiWhisperModelId());
    formData.append("response_format", "json");
    formData.append("language", "en");

    const response = await fetchWithProviderTimeout({
      provider: "OpenAI Whisper",
      stage: "captions",
      url: `${openAiBaseUrl()}/v1/audio/transcriptions`,
      timeoutMs: providerRequestTimeoutMs("OPENAI"),
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      },
    });

    if (!response.ok) {
      throw providerHttpError({
        provider: "OpenAI Whisper",
        stage: "captions",
        status: response.status,
        message: await response.text(),
      });
    }

    const transcript = await parseProviderJsonResponse<OpenAiWhisperTranscriptResponse>({
      provider: "OpenAI Whisper",
      stage: "captions",
      response,
    });
    const resultId = generatedCaptionTrackId(input.narration.id, "whisper");

    return generatedCaptionTrackSchema.parse({
      id: resultId,
      provider: "whisper",
      sourceNarrationId: input.narration.id,
      transcriptText: transcript?.text?.trim() || input.captionSpec.sourceText,
      captionUrl: null,
      providerJobId: null,
      captionVtt: null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    });
  },
};

export const captionProviderRegistry: Record<CaptionProviderId, CaptionProviderAdapter> = {
  assemblyai: assemblyAiCaptionProvider,
  whisper: whisperCaptionProvider,
};

export function listCaptionProviders(): CaptionProviderAdapter[] {
  return CAPTION_PROVIDER_IDS.map((providerId) => captionProviderRegistry[providerId]);
}

export function resolveCaptionProviderId(
  providerId?: string | null,
): CaptionProviderId {
  if (!providerId || providerId === "local-default") {
    return "assemblyai";
  }

  if (providerId in captionProviderRegistry) {
    return providerId as CaptionProviderId;
  }

  throw providerConfigError(
    "Caption provider",
    `Unknown caption provider "${providerId}".`,
    "captions",
  );
}

export function getCaptionProvider(
  providerId?: string | null,
): CaptionProviderAdapter {
  return captionProviderRegistry[resolveCaptionProviderId(providerId)];
}
