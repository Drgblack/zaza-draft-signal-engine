import { NextResponse } from "next/server";
import { z } from "zod";

import { appendAuditEventsSafe } from "@/lib/audit";
import { getSignalWithFallback } from "@/lib/signal-repository";
import { getPattern } from "@/lib/patterns";

const patternSuggestionRequestSchema = z.object({
  patternId: z.string().trim().min(1),
  patternName: z.string().trim().min(1),
  location: z.enum(["copilot", "interpretation", "generation"]),
  action: z.enum(["apply_in_generation", "use_angle"]),
});

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patternSuggestionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid pattern suggestion payload.",
      },
      { status: 400 },
    );
  }

  const signalResult = await getSignalWithFallback(id);
  if (!signalResult.signal) {
    return NextResponse.json(
      {
        success: false,
        error: signalResult.error ?? "Signal not found.",
      },
      { status: 404 },
    );
  }

  const pattern = await getPattern(parsed.data.patternId);
  if (!pattern) {
    return NextResponse.json(
      {
        success: false,
        error: "Pattern not found.",
      },
      { status: 404 },
    );
  }

  const actionSummary =
    parsed.data.action === "use_angle"
      ? `Used suggested pattern angle: ${pattern.name}.`
      : `Applied suggested pattern in generation: ${pattern.name}.`;

  await appendAuditEventsSafe([
    {
      signalId: id,
      eventType: "PATTERN_SUGGESTED",
      actor: "operator",
      summary: actionSummary,
      metadata: {
        patternId: pattern.id,
        patternName: pattern.name,
        location: parsed.data.location,
        action: parsed.data.action,
      },
    },
  ]);

  return NextResponse.json({
    success: true,
  });
}
