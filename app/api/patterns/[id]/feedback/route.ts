import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import { createPatternFeedbackRequestSchema, getPatternFeedbackAuditSummary } from "@/lib/pattern-feedback-definitions";
import { appendPatternFeedback } from "@/lib/pattern-feedback";
import { getPattern, getPatternAuditSubjectId } from "@/lib/patterns";
import type { PatternFeedbackResponse } from "@/types/api";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = createPatternFeedbackRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PatternFeedbackResponse>(
      {
        success: false,
        persisted: false,
        feedback: null,
        message: "Pattern feedback could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid pattern feedback payload.",
      },
      { status: 400 },
    );
  }

  const pattern = await getPattern(id);
  if (!pattern) {
    return NextResponse.json<PatternFeedbackResponse>(
      {
        success: false,
        persisted: false,
        feedback: null,
        message: "Pattern feedback could not be saved.",
        error: "Pattern not found.",
      },
      { status: 404 },
    );
  }

  try {
    const feedback = await appendPatternFeedback({
      patternId: id,
      value: parsed.data.value,
      note: parsed.data.note ?? null,
    });

    await appendAuditEventsSafe([
      {
        signalId: getPatternAuditSubjectId(id),
        eventType: "PATTERN_FEEDBACK_ADDED",
        actor: "operator",
        summary: getPatternFeedbackAuditSummary(feedback.value),
        metadata: {
          patternId: id,
          value: feedback.value,
          hasNote: Boolean(feedback.note),
        },
      },
    ]);

    return NextResponse.json<PatternFeedbackResponse>({
      success: true,
      persisted: true,
      feedback,
      message: `Pattern feedback saved for ${pattern.name}.`,
    });
  } catch (error) {
    return NextResponse.json<PatternFeedbackResponse>(
      {
        success: false,
        persisted: false,
        feedback: null,
        message: "Pattern feedback could not be saved.",
        error: error instanceof Error ? error.message : "Unable to persist pattern feedback.",
      },
      { status: 500 },
    );
  }
}
