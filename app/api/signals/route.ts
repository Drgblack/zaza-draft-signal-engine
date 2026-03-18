import { NextResponse } from "next/server";

import { createSignal, getSafeAirtableErrorMessage, listSignals } from "@/lib/airtable";
import { buildMockCreatedSignal, mockSignalRecords } from "@/lib/mock-data";
import { getAppConfig } from "@/lib/config";
import {
  createSignalRequestSchema,
  statusFilterSchema,
  toCreateSignalPayload,
  type CreateSignalApiResponse,
  type SignalsApiResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  const parsedFilter = statusFilterSchema.safeParse({ status });

  if (!parsedFilter.success) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        signals: [],
        error: parsedFilter.error.issues[0]?.message ?? "Invalid status filter.",
      },
      { status: 400 },
    );
  }

  const config = getAppConfig();

  if (!config.isAirtableConfigured) {
    const signals = parsedFilter.data.status
      ? mockSignalRecords.filter((signal) => signal.status === parsedFilter.data.status)
      : mockSignalRecords;

    return NextResponse.json<SignalsApiResponse>({
      success: true,
      source: "mock",
      signals,
      message: "Mock mode active because Airtable environment variables are missing.",
    });
  }

  try {
    const signals = await listSignals({ status: parsedFilter.data.status });
    return NextResponse.json<SignalsApiResponse>({
      success: true,
      source: "airtable",
      signals,
      message: signals.length === 0 ? "Airtable is connected. The table is currently empty." : "Airtable is connected.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        signals: [],
        error: `${getSafeAirtableErrorMessage(error)} Check /api/signals/health for diagnostics.`,
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createSignalRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        signals: [],
        error: parsed.error.issues[0]?.message ?? "Invalid payload.",
        errorCode: "validation_error",
      },
      { status: 400 },
    );
  }

  const submission = toCreateSignalPayload(parsed.data);

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
        source: "airtable",
        persisted: false,
        signal: buildMockCreatedSignal(submission),
        message: "Signal was not saved to Airtable.",
        error: `${getSafeAirtableErrorMessage(error)} Check /api/signals/health for diagnostics.`,
        errorCode: "airtable_error",
      },
      { status: 502 },
    );
  }
}
