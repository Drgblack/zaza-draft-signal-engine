import { NextResponse } from "next/server";

import { appendAuditEventsSafe, listAuditEvents, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback, listSignalsWithFallback } from "@/lib/airtable";
import { createFeedbackRequestSchema, getFeedbackAuditSummary } from "@/lib/feedback-definitions";
import { appendFeedback, getFeedbackEntries, listFeedbackEntries } from "@/lib/feedback";
import { buildPatternCoverageRecords, buildPatternGapDetectedEvent } from "@/lib/pattern-coverage";
import { assessPatternCandidate, buildPatternCandidateDetectedEvent } from "@/lib/pattern-discovery";
import { listPatterns } from "@/lib/patterns";
import type { SaveFeedbackResponse } from "@/types/api";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = createFeedbackRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<SaveFeedbackResponse>(
      {
        success: false,
        persisted: false,
        source: "airtable",
        feedback: null,
        message: "Feedback could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid feedback payload.",
      },
      { status: 400 },
    );
  }

  const signalResult = await getSignalWithFallback(id);
  if (!signalResult.signal) {
    return NextResponse.json<SaveFeedbackResponse>(
      {
        success: false,
        persisted: false,
        source: signalResult.source,
        feedback: null,
        message: "Feedback could not be saved.",
        error: signalResult.error ?? "Signal not found.",
      },
      { status: 404 },
    );
  }

  try {
    const previousFeedbackEntries = await getFeedbackEntries(id);
    const allFeedbackEntries = await listFeedbackEntries();
    const feedback = await appendFeedback({
      signalId: id,
      category: parsed.data.category,
      value: parsed.data.value,
      note: parsed.data.note ?? null,
    });

    const auditEvents: AuditEventInput[] = [
      {
        signalId: id,
        eventType: "FEEDBACK_ADDED",
        actor: "operator",
        summary: getFeedbackAuditSummary(feedback.value),
        metadata: {
          category: feedback.category,
          value: feedback.value,
          hasNote: Boolean(feedback.note),
        },
      },
    ];
    const patterns = await listPatterns();
    const { signals } = await listSignalsWithFallback({ limit: 1000 });
    const allAuditEvents = await listAuditEvents();
    const candidateEvent = buildPatternCandidateDetectedEvent({
      signal: signalResult.signal,
      current: assessPatternCandidate(signalResult.signal, {
        feedbackEntries: [feedback, ...previousFeedbackEntries],
        patterns,
      }),
      previous: assessPatternCandidate(signalResult.signal, {
        feedbackEntries: previousFeedbackEntries,
        patterns,
      }),
    });
    const currentCoverage = buildPatternCoverageRecords(
      signals,
      [feedback, ...allFeedbackEntries],
      patterns,
      allAuditEvents,
    ).find((record) => record.signalId === id);
    const previousCoverage = buildPatternCoverageRecords(
      signals,
      allFeedbackEntries,
      patterns,
      allAuditEvents,
    ).find((record) => record.signalId === id);
    if (candidateEvent) {
      auditEvents.push(candidateEvent);
    }
    const gapEvent =
      currentCoverage && previousCoverage !== undefined
        ? buildPatternGapDetectedEvent({
            signal: signalResult.signal,
            current: currentCoverage,
            previous: previousCoverage ?? null,
          })
        : null;
    if (gapEvent) {
      auditEvents.push(gapEvent);
    }
    await appendAuditEventsSafe(auditEvents);

    return NextResponse.json<SaveFeedbackResponse>({
      success: true,
      persisted: true,
      source: signalResult.source,
      feedback,
      message: "Feedback saved.",
    });
  } catch (error) {
    return NextResponse.json<SaveFeedbackResponse>(
      {
        success: false,
        persisted: false,
        source: signalResult.source,
        feedback: null,
        message: "Feedback could not be saved.",
        error: error instanceof Error ? error.message : "Unable to persist feedback.",
      },
      { status: 500 },
    );
  }
}
