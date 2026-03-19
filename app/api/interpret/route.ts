import { NextResponse } from "next/server";

import { appendAuditEventsSafe, buildOperatorOverrideEvent, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback } from "@/lib/airtable";
import { interpretSignal, toInterpretationInput as toSignalInterpretationInput } from "@/lib/interpreter";
import {
  interpretRequestSchema,
  interpretationResultSchema,
  toInterpretationInput,
  type InterpretationResponse,
} from "@/types/api";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = interpretRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid interpretation request.",
      },
      { status: 400 },
    );
  }

  const inputSignal = parsed.data.signal
    ? toInterpretationInput(parsed.data.signal)
    : null;

  const sourceSignal = inputSignal
    ? inputSignal
    : parsed.data.signalId
      ? await getSignalWithFallback(parsed.data.signalId)
      : null;

  if (!inputSignal && sourceSignal && "signal" in sourceSignal && !sourceSignal.signal) {
    return NextResponse.json(
      {
        success: false,
        error: sourceSignal.error ?? "Signal not found.",
      },
      { status: 404 },
    );
  }

  const signal = inputSignal ?? (sourceSignal && "signal" in sourceSignal && sourceSignal.signal ? toSignalInterpretationInput(sourceSignal.signal) : null);

  if (!signal) {
    return NextResponse.json(
      {
        success: false,
        error: "Unable to resolve the signal for interpretation.",
      },
      { status: 400 },
    );
  }

  const interpretation = interpretationResultSchema.parse(interpretSignal(signal));
  const currentSignalId = signal.recordId ?? parsed.data.signalId ?? null;

  if (currentSignalId) {
    const currentSignalResult = await getSignalWithFallback(currentSignalId);
    const auditEvents: AuditEventInput[] = [
      {
        signalId: currentSignalId,
        eventType: "INTERPRETATION_RUN",
        actor: "operator",
        summary: "Ran interpretation preview.",
        metadata: {
          category: interpretation.signalCategory,
          severity: interpretation.severityScore,
        },
      },
    ];

    if (currentSignalResult.signal) {
      const overrideEvent = buildOperatorOverrideEvent(currentSignalResult.signal, "interpret");
      if (overrideEvent) {
        auditEvents.push(overrideEvent);
      }
    }

    await appendAuditEventsSafe(auditEvents);
  }

  return NextResponse.json<InterpretationResponse>({
    success: true,
    signal,
    interpretation,
  });
}
