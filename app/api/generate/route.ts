import { NextResponse } from "next/server";

import { getSignalWithFallback } from "@/lib/airtable";
import { generateDrafts, getSafeLlmErrorMessage, toGenerationInputFromSignal } from "@/lib/generator";
import { generateRequestSchema, toGenerationInput, type GenerationResponse } from "@/types/api";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = generateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid generation request.",
      },
      { status: 400 },
    );
  }

  const inputSignal = parsed.data.signal ? toGenerationInput(parsed.data.signal) : null;
  const sourceSignal = inputSignal ? null : parsed.data.signalId ? await getSignalWithFallback(parsed.data.signalId) : null;

  if (!inputSignal && sourceSignal && !sourceSignal.signal) {
    return NextResponse.json(
      {
        success: false,
        error: sourceSignal.error ?? "Signal not found.",
      },
      { status: 404 },
    );
  }

  const signal = inputSignal ?? (sourceSignal?.signal ? toGenerationInputFromSignal(sourceSignal.signal) : null);
  if (!signal) {
    return NextResponse.json(
      {
        success: false,
        error: "Generation requires interpretation fields to be present first.",
      },
      { status: 400 },
    );
  }

  try {
    const outputs = await generateDrafts(signal);

    return NextResponse.json<GenerationResponse>({
      success: true,
      signal,
      outputs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: getSafeLlmErrorMessage(error),
      },
      { status: 502 },
    );
  }
}
