import { NextResponse } from "next/server";

import { appendAuditEventsSafe, buildOperatorOverrideEvent, buildRecommendationEvent, listAuditEvents, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback, listSignalsWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { getFeedbackEntries, listFeedbackEntries } from "@/lib/feedback";
import { buildPatternCoverageRecords, buildPatternGapDetectedEvent } from "@/lib/pattern-coverage";
import { assessPatternCandidate, buildPatternCandidateDetectedEvent } from "@/lib/pattern-discovery";
import { listPatterns } from "@/lib/patterns";
import { getOperatorTuning } from "@/lib/tuning";
import {
  toWorkflowSavePayload,
  workflowUpdateRequestSchema,
  type SaveWorkflowResponse,
} from "@/types/api";

function workflowActionKey(status: string) {
  if (status === "Scheduled") {
    return "schedule" as const;
  }

  if (status === "Posted") {
    return "post" as const;
  }

  if (status === "Reviewed" || status === "Approved") {
    return "review" as const;
  }

  return "none" as const;
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = workflowUpdateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signal: null,
        message: "Workflow update could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid workflow payload.",
      },
      { status: 400 },
    );
  }

  const workflow = toWorkflowSavePayload(parsed.data);
  const tuning = await getOperatorTuning();
  const previousSignalResult = await getSignalWithFallback(id);
  const result = await saveSignalWithFallback(id, {
    status: workflow.status,
    reviewNotes: workflow.reviewNotes,
    scheduledDate: workflow.scheduledDate ?? undefined,
    postedDate: workflow.status === "Posted" ? workflow.postedDate ?? new Date().toISOString() : workflow.postedDate ?? undefined,
    platformPostedTo: workflow.platformPostedTo ?? undefined,
    postUrl: workflow.postUrl ?? undefined,
    finalCaptionUsed: workflow.finalCaptionUsed ?? undefined,
    posted: workflow.status === "Posted" ? true : undefined,
  });

  if (!result.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: result.persisted,
        source: result.source,
        signal: null,
        message: "Workflow update could not be saved.",
        error: result.error ?? "Signal not found.",
      },
      { status: result.source === "mock" ? 404 : 502 },
    );
  }

  const nextSignal = result.signal;
  const auditEvents: AuditEventInput[] = [];
  if (previousSignalResult.signal) {
    const actualAction = workflowActionKey(workflow.status);
    if (actualAction !== "none") {
      const overrideEvent = buildOperatorOverrideEvent(previousSignalResult.signal, actualAction, tuning.settings);
      if (overrideEvent) {
        auditEvents.push(overrideEvent);
      }
    }
  }

  const feedbackEntries = await getFeedbackEntries(id);
  const allFeedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
  const allAuditEvents = await listAuditEvents();
  const candidateEvent = buildPatternCandidateDetectedEvent({
    signal: nextSignal,
    current: assessPatternCandidate(nextSignal, {
      feedbackEntries,
      patterns,
    }),
    previous: previousSignalResult.signal
      ? assessPatternCandidate(previousSignalResult.signal, {
          feedbackEntries,
          patterns,
        })
      : null,
  });
  if (candidateEvent) {
    auditEvents.push(candidateEvent);
  }
  const currentCoverage = buildPatternCoverageRecords(
    allSignals.map((signal) => (signal.recordId === id ? nextSignal : signal)),
    allFeedbackEntries,
    patterns,
    allAuditEvents,
  ).find((record) => record.signalId === id);
  const previousCoverage = previousSignalResult.signal
    ? buildPatternCoverageRecords(allSignals, allFeedbackEntries, patterns, allAuditEvents).find(
        (record) => record.signalId === id,
      )
    : null;
  const gapEvent =
    currentCoverage && previousCoverage !== undefined
      ? buildPatternGapDetectedEvent({
          signal: nextSignal,
          current: currentCoverage,
          previous: previousCoverage ?? null,
        })
      : null;
  if (gapEvent) {
    auditEvents.push(gapEvent);
  }

  auditEvents.push(
    {
      signalId: id,
      eventType: "STATUS_CHANGED",
      actor: "operator",
      summary: `Changed status to ${workflow.status}.`,
      metadata: {
        previousStatus: previousSignalResult.signal?.status ?? null,
        nextStatus: workflow.status,
      },
    },
    buildRecommendationEvent(nextSignal, tuning.settings),
  );
  await appendAuditEventsSafe(auditEvents);

  return NextResponse.json<SaveWorkflowResponse>({
    success: true,
    persisted: result.persisted,
    source: result.source,
    signal: nextSignal,
    message:
      result.source === "airtable"
        ? `Workflow updated in Airtable. Record is now ${workflow.status}.`
        : `Workflow updated in mock mode. Record is now ${workflow.status} for the current session flow only.`,
  });
}
