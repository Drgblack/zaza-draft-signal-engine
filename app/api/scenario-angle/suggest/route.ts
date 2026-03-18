import { NextResponse } from "next/server";

import { getSignalWithFallback } from "@/lib/airtable";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import { suggestScenarioAngles } from "@/lib/scenario-angle-suggest";
import {
  scenarioAngleSuggestRequestSchema,
  toInterpretationInput,
  type ScenarioAngleSuggestResponse,
} from "@/types/api";
import { toInterpretationInput as toSignalInterpretationInput } from "@/lib/interpreter";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = scenarioAngleSuggestRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid scenario-angle suggestion request.",
      },
      { status: 400 },
    );
  }

  const inputSignal = parsed.data.signal ? toInterpretationInput(parsed.data.signal) : null;
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

  const signal = inputSignal ?? (sourceSignal?.signal ? toSignalInterpretationInput(sourceSignal.signal) : null);

  if (!signal) {
    return NextResponse.json(
      {
        success: false,
        error: "Unable to resolve the signal for scenario-angle suggestions.",
      },
      { status: 400 },
    );
  }

  const assessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });

  const suggestionResult = await suggestScenarioAngles(signal);

  return NextResponse.json<ScenarioAngleSuggestResponse>({
    success: true,
    signal,
    assessment,
    suggestions: suggestionResult.suggestions,
    source: suggestionResult.source,
    promptVersion: suggestionResult.promptVersion,
    message: suggestionResult.message,
  });
}
