import { NextResponse } from "next/server";

import { createSignal, listSignalsWithFallback } from "@/lib/airtable";
import { buildMockCreatedSignal } from "@/lib/mock-data";
import { getAppConfig } from "@/lib/config";
import {
  createSignalRequestSchema,
  normalizeOptionalString,
  normalizeSeverityScore,
  type CreateSignalApiResponse,
  type SignalsApiResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listSignalsWithFallback();

  return NextResponse.json<SignalsApiResponse>({
    success: true,
    source: data.source,
    signals: data.signals,
    error: data.error,
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createSignalRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid payload.",
      },
      { status: 400 },
    );
  }

  const submission = {
    sourceUrl: normalizeOptionalString(parsed.data.sourceUrl),
    sourceTitle: parsed.data.sourceTitle.trim(),
    sourceType: normalizeOptionalString(parsed.data.sourceType),
    sourcePublisher: normalizeOptionalString(parsed.data.sourcePublisher),
    sourceDate: normalizeOptionalString(parsed.data.sourceDate),
    rawExcerpt: normalizeOptionalString(parsed.data.rawExcerpt),
    manualSummary: normalizeOptionalString(parsed.data.manualSummary),
    signalCategory: parsed.data.signalCategory ?? null,
    severityScore: normalizeSeverityScore(parsed.data.severityScore),
    hookTemplateUsed: normalizeOptionalString(parsed.data.hookTemplateUsed),
    status: parsed.data.status ?? "New",
  } as const;

  if (!submission.rawExcerpt && !submission.manualSummary) {
    return NextResponse.json(
      {
        success: false,
        error: "Provide at least one of raw excerpt or manual summary.",
      },
      { status: 400 },
    );
  }

  const config = getAppConfig();

  if (!config.isAirtableConfigured) {
    return NextResponse.json<CreateSignalApiResponse>({
      success: true,
      source: "mock",
      persisted: false,
      signal: buildMockCreatedSignal(submission),
      message: "Signal accepted in mock mode. Configure Airtable to persist submissions.",
    });
  }

  try {
    const signal = await createSignal(submission);

    return NextResponse.json<CreateSignalApiResponse>({
      success: true,
      source: "airtable",
      persisted: true,
      signal,
      message: "Signal saved to Airtable.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to save signal.",
      },
      { status: 500 },
    );
  }
}
