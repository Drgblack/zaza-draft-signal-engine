import { NextResponse } from "next/server";

import { saveSignalWithFallback } from "@/lib/airtable";
import { saveInterpretationRequestSchema, toInterpretationSavePayload, type SaveInterpretationResponse } from "@/types/api";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = saveInterpretationRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signal: null,
        message: "Interpretation could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid interpretation payload.",
      },
      { status: 400 },
    );
  }

  const interpretation = toInterpretationSavePayload(parsed.data);
  const result = await saveSignalWithFallback(id, {
    signalCategory: interpretation.signalCategory,
    severityScore: interpretation.severityScore,
    signalSubtype: interpretation.signalSubtype,
    emotionalPattern: interpretation.emotionalPattern,
    teacherPainPoint: interpretation.teacherPainPoint,
    relevanceToZazaDraft: interpretation.relevanceToZazaDraft,
    riskToTeacher: interpretation.riskToTeacher,
    interpretationNotes: interpretation.interpretationNotes,
    hookTemplateUsed: interpretation.hookTemplateUsed,
    contentAngle: interpretation.contentAngle,
    platformPriority: interpretation.platformPriority,
    suggestedFormatPriority: interpretation.suggestedFormatPriority,
    status: interpretation.status ?? "Interpreted",
  });

  if (!result.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: result.persisted,
        source: result.source,
        signal: null,
        message: "Interpretation could not be saved.",
        error: result.error ?? "Signal not found.",
      },
      { status: result.source === "mock" ? 404 : 502 },
    );
  }

  return NextResponse.json<SaveInterpretationResponse>({
    success: true,
    persisted: result.persisted,
    source: result.source,
    signal: result.signal,
    message:
      result.source === "airtable"
        ? "Interpretation saved to Airtable and status updated to Interpreted."
        : "Interpretation saved in mock mode for the current session flow only.",
  });
}
