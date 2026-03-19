import { NextResponse } from "next/server";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback } from "@/lib/airtable";
import { createPatternRequestSchema } from "@/lib/pattern-definitions";
import { appendPattern, getPatternAuditSubjectId, listPatterns } from "@/lib/patterns";
import type { PatternListResponse, PatternResponse } from "@/types/api";

export async function GET() {
  try {
    const patterns = await listPatterns({ includeRetired: true });
    return NextResponse.json<PatternListResponse>({
      success: true,
      patterns,
    });
  } catch (error) {
    return NextResponse.json<PatternListResponse>(
      {
        success: false,
        patterns: [],
        error: error instanceof Error ? error.message : "Unable to load patterns.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createPatternRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PatternResponse>(
      {
        success: false,
        persisted: false,
        pattern: null,
        message: "Pattern could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid pattern payload.",
      },
      { status: 400 },
    );
  }

  try {
    const pattern = await appendPattern({
      name: parsed.data.name,
      description: parsed.data.description,
      patternType: parsed.data.patternType,
      sourceContext: parsed.data.sourceContext ?? null,
      exampleSignalId: parsed.data.exampleSignalId ?? null,
      exampleSignalTitle: parsed.data.exampleSignalTitle ?? null,
      exampleSignalSummary: parsed.data.exampleSignalSummary ?? null,
      exampleScenarioAngle: parsed.data.exampleScenarioAngle ?? null,
      exampleOutput: parsed.data.exampleOutput ?? null,
      tags: parsed.data.tags,
      createdBy: parsed.data.createdBy ?? "operator",
    });

    const auditEvents: AuditEventInput[] = [
      {
        signalId: getPatternAuditSubjectId(pattern.id),
        eventType: "PATTERN_CREATED",
        actor: "operator",
        summary: `Created pattern: ${pattern.name}.`,
        metadata: {
          patternId: pattern.id,
          patternType: pattern.patternType,
          signalId: pattern.exampleSignalId,
        },
      },
    ];

    const signalId = parsed.data.signalId ?? pattern.exampleSignalId;
    if (signalId) {
      const signalResult = await getSignalWithFallback(signalId);
      if (signalResult.signal) {
        auditEvents.push({
          signalId,
          eventType: "PATTERN_CREATED",
          actor: "operator",
          summary: `Created pattern: ${pattern.name}.`,
          metadata: {
            patternId: pattern.id,
            patternType: pattern.patternType,
          },
        });

        if (parsed.data.createdFromCoverageGap) {
          auditEvents.push({
            signalId,
            eventType: "PATTERN_CREATED_FROM_GAP",
            actor: "operator",
            summary: `Created pattern from a coverage gap: ${pattern.name}.`,
            metadata: {
              patternId: pattern.id,
              patternType: pattern.patternType,
              gapType: parsed.data.coverageGapType ?? null,
              gapReason: parsed.data.coverageGapReason ?? null,
            },
          });
        }
      }
    }

    await appendAuditEventsSafe(auditEvents);

    return NextResponse.json<PatternResponse>({
      success: true,
      persisted: true,
      pattern,
      message: "Pattern saved.",
    });
  } catch (error) {
    return NextResponse.json<PatternResponse>(
      {
        success: false,
        persisted: false,
        pattern: null,
        message: "Pattern could not be saved.",
        error: error instanceof Error ? error.message : "Unable to persist pattern.",
      },
      { status: 500 },
    );
  }
}
