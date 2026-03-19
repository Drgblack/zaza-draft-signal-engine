import { NextResponse } from "next/server";

import { appendAuditEventsSafe, buildRecommendationEvent, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { buildFinalReviewSummary } from "@/lib/final-review";
import {
  finalReviewUpdateRequestSchema,
  toFinalReviewSavePayload,
  type SaveFinalReviewResponse,
} from "@/types/api";
import type { SignalRecord } from "@/types/signal";

function platformLabel(platform: "x" | "linkedin" | "reddit"): string {
  switch (platform) {
    case "x":
      return "X";
    case "linkedin":
      return "LinkedIn";
    case "reddit":
    default:
      return "Reddit";
  }
}

function getFinalDraft(signal: SignalRecord, platform: "x" | "linkedin" | "reddit"): string | null {
  switch (platform) {
    case "x":
      return signal.finalXDraft;
    case "linkedin":
      return signal.finalLinkedInDraft;
    case "reddit":
    default:
      return signal.finalRedditDraft;
  }
}

function getReviewStatus(signal: SignalRecord, platform: "x" | "linkedin" | "reddit") {
  switch (platform) {
    case "x":
      return signal.xReviewStatus;
    case "linkedin":
      return signal.linkedInReviewStatus;
    case "reddit":
    default:
      return signal.redditReviewStatus;
  }
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = finalReviewUpdateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signal: null,
        message: "Final review could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid final review payload.",
      },
      { status: 400 },
    );
  }

  const review = toFinalReviewSavePayload(parsed.data);
  const previousSignalResult = await getSignalWithFallback(id);
  if (!previousSignalResult.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: previousSignalResult.source,
        signal: null,
        message: "Final review could not be saved.",
        error: previousSignalResult.error ?? "Signal not found.",
      },
      { status: previousSignalResult.source === "mock" ? 404 : 502 },
    );
  }

  const previousSignal = previousSignalResult.signal;
  const reviewStarted =
    Boolean(previousSignal.finalReviewStartedAt) ||
    review.finalXDraft !== null ||
    review.finalLinkedInDraft !== null ||
    review.finalRedditDraft !== null ||
    review.xReviewStatus !== null ||
    review.linkedInReviewStatus !== null ||
    review.redditReviewStatus !== null ||
    review.finalReviewNotes !== null;
  const startedAt = previousSignal.finalReviewStartedAt ?? (reviewStarted ? new Date().toISOString() : null);
  const previewNextSignal: SignalRecord = {
    ...previousSignal,
    finalXDraft: review.finalXDraft,
    finalLinkedInDraft: review.finalLinkedInDraft,
    finalRedditDraft: review.finalRedditDraft,
    xReviewStatus: review.xReviewStatus,
    linkedInReviewStatus: review.linkedInReviewStatus,
    redditReviewStatus: review.redditReviewStatus,
    finalReviewNotes: review.finalReviewNotes,
    finalReviewStartedAt: startedAt,
    finalReviewedAt: previousSignal.finalReviewedAt,
  };
  const nextSummary = buildFinalReviewSummary(previewNextSignal);
  const finalReviewedAt = nextSummary.completed ? previousSignal.finalReviewedAt ?? new Date().toISOString() : null;

  const result = await saveSignalWithFallback(id, {
    finalXDraft: review.finalXDraft,
    finalLinkedInDraft: review.finalLinkedInDraft,
    finalRedditDraft: review.finalRedditDraft,
    xReviewStatus: review.xReviewStatus,
    linkedInReviewStatus: review.linkedInReviewStatus,
    redditReviewStatus: review.redditReviewStatus,
    finalReviewNotes: review.finalReviewNotes,
    finalReviewStartedAt: startedAt,
    finalReviewedAt,
  });

  if (!result.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: result.persisted,
        source: result.source,
        signal: null,
        message: "Final review could not be saved.",
        error: result.error ?? "Signal not found.",
      },
      { status: result.source === "mock" ? 404 : 502 },
    );
  }

  const nextSignal = result.signal;
  const previousSummary = buildFinalReviewSummary(previousSignal);
  const completedSummary = buildFinalReviewSummary(nextSignal);
  const auditEvents: AuditEventInput[] = [];

  if (!previousSummary.started && completedSummary.started) {
    auditEvents.push({
      signalId: id,
      eventType: "FINAL_REVIEW_STARTED",
      actor: "operator",
      summary: "Started final review workspace.",
    });
  }

  for (const platform of ["x", "linkedin", "reddit"] as const) {
    const previousDraft = getFinalDraft(previousSignal, platform);
    const nextDraft = getFinalDraft(nextSignal, platform);
    const previousStatus = getReviewStatus(previousSignal, platform);
    const nextStatus = getReviewStatus(nextSignal, platform);

    if (previousDraft !== nextDraft) {
      auditEvents.push({
        signalId: id,
        eventType: "FINAL_DRAFT_EDITED",
        actor: "operator",
        summary: `Edited final ${platformLabel(platform)} draft.`,
        metadata: {
          platform,
        },
      });
    }

    if (previousStatus !== nextStatus && nextStatus === "ready") {
      auditEvents.push({
        signalId: id,
        eventType: "FINAL_DRAFT_MARKED_READY",
        actor: "operator",
        summary: `Marked ${platformLabel(platform)} draft ready.`,
        metadata: {
          platform,
        },
      });
    }

    if (previousStatus !== nextStatus && nextStatus === "skip") {
      auditEvents.push({
        signalId: id,
        eventType: "FINAL_DRAFT_MARKED_SKIP",
        actor: "operator",
        summary: `Skipped ${platformLabel(platform)} draft.`,
        metadata: {
          platform,
        },
      });
    }
  }

  if (!previousSummary.completed && completedSummary.completed) {
    auditEvents.push({
      signalId: id,
      eventType: "FINAL_REVIEW_COMPLETED",
      actor: "operator",
      summary: "Completed final review decisions for generated drafts.",
      metadata: {
        readyCount: completedSummary.readyCount,
        skipCount: completedSummary.skipCount,
      },
    });
  }

  auditEvents.push(buildRecommendationEvent(nextSignal));
  await appendAuditEventsSafe(auditEvents);

  return NextResponse.json<SaveFinalReviewResponse>({
    success: true,
    persisted: result.persisted,
    source: result.source,
    signal: nextSignal,
    message:
      result.source === "airtable"
        ? "Final review decisions saved to Airtable."
        : "Final review decisions saved in mock mode for the current session flow only.",
  });
}
