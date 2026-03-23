import { z } from "zod";

import type { CaptionSpec } from "@/lib/caption-specs";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";
import {
  assemblyAiBaseUrl,
  assemblyAiMaxPolls,
  assemblyAiPollIntervalMs,
  parseJsonResponse,
  providerConfigError,
  providerHttpError,
  shouldUseRealProvider,
  sleep,
} from "./provider-runtime";
import { VideoFactoryRetryableError } from "../video-factory-retry";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const generatedCaptionTrackSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.literal("assemblyai"),
  sourceNarrationId: z.string().trim().min(1),
  transcriptText: z.string().trim().min(1),
  captionUrl: z.string().trim().nullable().optional(),
  providerJobId: z.string().trim().nullable().optional().default(null),
  captionVtt: z.string().trim().nullable().optional().default(null),
  createdAt: z.string().trim().min(1),
});

export type GeneratedCaptionTrack = z.infer<typeof generatedCaptionTrackSchema>;

export interface CaptionProviderAdapter {
  readonly provider: "assemblyai";
  generateCaptionTrack(input: {
    captionSpec: CaptionSpec;
    narration: GeneratedNarration;
    createdAt?: string;
  }): Promise<GeneratedCaptionTrack>;
}

function generatedCaptionTrackId(sourceNarrationId: string): string {
  return `${sourceNarrationId}:generated-caption-track:assemblyai`;
}

async function generateMockCaptionTrack(input: {
  captionSpec: CaptionSpec;
  narration: GeneratedNarration;
  createdAt?: string;
}): Promise<GeneratedCaptionTrack> {
  const resultId = generatedCaptionTrackId(input.narration.id);

  return generatedCaptionTrackSchema.parse({
    id: resultId,
    provider: "assemblyai",
    sourceNarrationId: input.narration.id,
    transcriptText: input.captionSpec.sourceText,
    captionUrl: `mock://assemblyai/captions/${resultId}.vtt`,
    providerJobId: null,
    captionVtt: null,
    createdAt: input.createdAt ?? MOCK_CREATED_AT,
  });
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

export const assemblyAiCaptionProvider: CaptionProviderAdapter = {
  provider: "assemblyai",
  async generateCaptionTrack(input) {
    if (!shouldUseRealProvider(["ASSEMBLYAI_API_KEY"])) {
      return generateMockCaptionTrack(input);
    }

    const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
    if (!apiKey) {
      throw providerConfigError("AssemblyAI", "ASSEMBLYAI_API_KEY is missing.");
    }

    let audioUrl = input.narration.audioUrl;
    if (input.narration.audioBase64) {
      const uploadResponse = await fetch(`${assemblyAiBaseUrl()}/v2/upload`, {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": input.narration.audioMimeType ?? "audio/mpeg",
        },
        body: Buffer.from(input.narration.audioBase64, "base64"),
      });

      if (!uploadResponse.ok) {
        throw providerHttpError({
          provider: "AssemblyAI",
          status: uploadResponse.status,
          message: await uploadResponse.text(),
        });
      }

      const uploaded = await parseJsonResponse<AssemblyAiUploadResponse>(uploadResponse);
      audioUrl = uploaded?.upload_url ?? "";
    }

    if (!audioUrl || audioUrl.startsWith("mock://")) {
      throw providerConfigError(
        "AssemblyAI",
        "Narration audio is not publicly accessible and no audio bytes were available for upload.",
      );
    }

    const createTranscriptResponse = await fetch(`${assemblyAiBaseUrl()}/v2/transcript`, {
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
    });

    if (!createTranscriptResponse.ok) {
      throw providerHttpError({
        provider: "AssemblyAI",
        status: createTranscriptResponse.status,
        message: await createTranscriptResponse.text(),
      });
    }

    const createdTranscript =
      await parseJsonResponse<AssemblyAiTranscriptResponse>(createTranscriptResponse);
    const transcriptId = createdTranscript?.id;
    if (!transcriptId) {
      throw new VideoFactoryRetryableError(
        "AssemblyAI did not return a transcript ID.",
        { retryable: true },
      );
    }

    let transcript: AssemblyAiTranscriptResponse | null = null;
    for (let poll = 0; poll < assemblyAiMaxPolls(); poll += 1) {
      const transcriptResponse = await fetch(
        `${assemblyAiBaseUrl()}/v2/transcript/${encodeURIComponent(transcriptId)}`,
        {
          headers: {
            Authorization: apiKey,
          },
        },
      );

      if (!transcriptResponse.ok) {
        throw providerHttpError({
          provider: "AssemblyAI",
          status: transcriptResponse.status,
          message: await transcriptResponse.text(),
        });
      }

      transcript = await parseJsonResponse<AssemblyAiTranscriptResponse>(transcriptResponse);
      if (transcript?.status === "completed") {
        break;
      }

      if (transcript?.status === "error") {
        throw new VideoFactoryRetryableError(
          transcript.error?.trim() || "AssemblyAI transcript generation failed.",
          { retryable: false },
        );
      }

      await sleep(assemblyAiPollIntervalMs());
    }

    if (!transcript || transcript.status !== "completed") {
      throw new VideoFactoryRetryableError(
        "AssemblyAI transcript generation timed out before completion.",
        { retryable: true },
      );
    }

    const vttResponse = await fetch(
      `${assemblyAiBaseUrl()}/v2/transcript/${encodeURIComponent(transcriptId)}/vtt`,
      {
        headers: {
          Authorization: apiKey,
        },
      },
    );

    if (!vttResponse.ok) {
      throw providerHttpError({
        provider: "AssemblyAI",
        status: vttResponse.status,
        message: await vttResponse.text(),
      });
    }

    const resultId = generatedCaptionTrackId(input.narration.id);
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
