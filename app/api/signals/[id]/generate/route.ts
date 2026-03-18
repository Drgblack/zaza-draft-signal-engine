import { NextResponse } from "next/server";

import { saveSignalWithFallback } from "@/lib/airtable";
import { saveGenerationRequestSchema, toGenerationSavePayload, type SaveGenerationResponse } from "@/types/api";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = saveGenerationRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signal: null,
        message: "Generated drafts could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid generation payload.",
      },
      { status: 400 },
    );
  }

  const generation = toGenerationSavePayload(parsed.data);
  const result = await saveSignalWithFallback(id, {
    xDraft: generation.xDraft,
    linkedInDraft: generation.linkedInDraft,
    redditDraft: generation.redditDraft,
    imagePrompt: generation.imagePrompt,
    videoScript: generation.videoScript,
    ctaOrClosingLine: generation.ctaOrClosingLine,
    hashtagsOrKeywords: generation.hashtagsOrKeywords,
    generationModelVersion: generation.generationModelVersion,
    promptVersion: generation.promptVersion,
    status: generation.status ?? "Draft Generated",
  });

  if (!result.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: result.persisted,
        source: result.source,
        signal: null,
        message: "Generated drafts could not be saved.",
        error: result.error ?? "Signal not found.",
      },
      { status: result.source === "mock" ? 404 : 502 },
    );
  }

  return NextResponse.json<SaveGenerationResponse>({
    success: true,
    persisted: result.persisted,
    source: result.source,
    signal: result.signal,
    message:
      result.source === "airtable"
        ? "Generated drafts saved to Airtable and status updated to Draft Generated."
        : "Generated drafts saved in mock mode for the current session flow only.",
  });
}
