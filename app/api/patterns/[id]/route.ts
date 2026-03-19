import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import { updatePatternRequestSchema } from "@/lib/pattern-definitions";
import { getPattern, getPatternAuditSubjectId, updatePattern } from "@/lib/patterns";
import type { PatternResponse } from "@/types/api";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;

  const pattern = await getPattern(id);
  if (!pattern) {
    return NextResponse.json<PatternResponse>(
      {
        success: false,
        persisted: false,
        pattern: null,
        message: "Pattern not found.",
        error: "Pattern not found.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json<PatternResponse>({
    success: true,
    persisted: true,
    pattern,
    message: "Pattern loaded.",
  });
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = updatePatternRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PatternResponse>(
      {
        success: false,
        persisted: false,
        pattern: null,
        message: "Pattern could not be updated.",
        error: parsed.error.issues[0]?.message ?? "Invalid pattern payload.",
      },
      { status: 400 },
    );
  }

  try {
    const existingPattern = await getPattern(id);
    if (!existingPattern) {
      return NextResponse.json<PatternResponse>(
        {
          success: false,
          persisted: false,
          pattern: null,
          message: "Pattern not found.",
          error: "Pattern not found.",
        },
        { status: 404 },
      );
    }

    const pattern = await updatePattern(id, parsed.data);

    if (!pattern) {
      return NextResponse.json<PatternResponse>(
        {
          success: false,
          persisted: false,
          pattern: null,
          message: "Pattern not found.",
          error: "Pattern not found.",
        },
        { status: 404 },
      );
    }

    const lifecycleChanged = existingPattern.lifecycleState !== pattern.lifecycleState;
    await appendAuditEventsSafe([
      lifecycleChanged
        ? {
            signalId: getPatternAuditSubjectId(pattern.id),
            eventType: pattern.lifecycleState === "retired" ? "PATTERN_RETIRED" : "PATTERN_REACTIVATED",
            actor: "operator",
            summary:
              pattern.lifecycleState === "retired"
                ? `Retired pattern: ${pattern.name}.`
                : `Reactivated pattern: ${pattern.name}.`,
            metadata: {
              patternId: pattern.id,
              previousLifecycleState: existingPattern.lifecycleState,
              nextLifecycleState: pattern.lifecycleState,
            },
          }
        : {
            signalId: getPatternAuditSubjectId(pattern.id),
            eventType: "PATTERN_UPDATED",
            actor: "operator",
            summary: `Updated pattern: ${pattern.name}.`,
            metadata: {
              patternId: pattern.id,
            },
          },
    ]);

    return NextResponse.json<PatternResponse>({
      success: true,
      persisted: true,
      pattern,
      message: "Pattern updated.",
    });
  } catch (error) {
    return NextResponse.json<PatternResponse>(
      {
        success: false,
        persisted: false,
        pattern: null,
        message: "Pattern could not be updated.",
        error: error instanceof Error ? error.message : "Unable to persist pattern updates.",
      },
      { status: 500 },
    );
  }
}
