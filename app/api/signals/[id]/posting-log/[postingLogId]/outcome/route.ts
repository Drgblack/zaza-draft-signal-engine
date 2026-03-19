import { NextResponse } from "next/server";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { getPostingPlatformLabel, getPostingLogEntries } from "@/lib/posting-log";
import {
  getOutcomeQualityLabel,
  getPostingOutcome,
  getReuseRecommendationLabel,
  postingOutcomeRequestSchema,
  upsertPostingOutcome,
} from "@/lib/outcomes";
import type { PostingOutcomeResponse } from "@/types/api";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string; postingLogId: string }>;
  },
) {
  const { id, postingLogId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = postingOutcomeRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PostingOutcomeResponse>(
      {
        success: false,
        persisted: false,
        outcome: null,
        previousOutcome: null,
        message: "Outcome could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid outcome payload.",
      },
      { status: 400 },
    );
  }

  const entries = await getPostingLogEntries(id);
  const postingEntry = entries.find((entry) => entry.id === postingLogId);

  if (!postingEntry) {
    return NextResponse.json<PostingOutcomeResponse>(
      {
        success: false,
        persisted: false,
        outcome: null,
        previousOutcome: null,
        message: "Outcome could not be saved.",
        error: "Posting log entry not found for this signal.",
      },
      { status: 404 },
    );
  }

  const existing = await getPostingOutcome(postingLogId);
  const result = await upsertPostingOutcome({
    postingLogId,
    signalId: id,
    platform: postingEntry.platform,
    outcomeQuality: parsed.data.outcomeQuality,
    reuseRecommendation: parsed.data.reuseRecommendation,
    note: parsed.data.note ?? null,
  });

  const auditEvents: AuditEventInput[] = [
    {
      signalId: id,
      eventType: existing ? "OUTCOME_UPDATED" : "OUTCOME_RECORDED",
      actor: "operator",
      summary: `${existing ? "Updated" : "Marked"} ${getPostingPlatformLabel(postingEntry.platform)} post outcome as ${getOutcomeQualityLabel(result.outcome.outcomeQuality).toLowerCase()}.`,
      metadata: {
        platform: postingEntry.platform,
        outcomeQuality: result.outcome.outcomeQuality,
        reuseRecommendation: result.outcome.reuseRecommendation,
      },
    },
  ];

  if (!existing || existing.reuseRecommendation !== result.outcome.reuseRecommendation) {
    auditEvents.push({
      signalId: id,
      eventType: existing ? "OUTCOME_UPDATED" : "OUTCOME_RECORDED",
      actor: "operator",
      summary: `${getPostingPlatformLabel(postingEntry.platform)} post marked ${getReuseRecommendationLabel(result.outcome.reuseRecommendation).toLowerCase()}.`,
      metadata: {
        platform: postingEntry.platform,
        reuseRecommendation: result.outcome.reuseRecommendation,
      },
    });
  }

  await appendAuditEventsSafe(auditEvents);

  return NextResponse.json<PostingOutcomeResponse>({
    success: true,
    persisted: true,
    outcome: result.outcome,
    previousOutcome: result.previous,
    message: existing ? "Outcome updated." : "Outcome recorded.",
  });
}
