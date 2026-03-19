import { NextResponse } from "next/server";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { getPostingPlatformLabel, getPostingLogEntries } from "@/lib/posting-log";
import {
  getStrategicValueLabel,
  strategicOutcomeRequestSchema,
} from "@/lib/strategic-outcome-memory";
import { getStrategicOutcome, upsertStrategicOutcome } from "@/lib/strategic-outcomes";
import type { StrategicOutcomeResponse } from "@/types/api";

function metricSummary(payload: {
  clicks?: number | null | undefined;
  leadsOrSignups?: number | null | undefined;
  trialsOrConversions?: number | null | undefined;
}): string | null {
  if ((payload.trialsOrConversions ?? 0) > 0) {
    return `${payload.trialsOrConversions} trials or conversions`;
  }

  if ((payload.leadsOrSignups ?? 0) > 0) {
    return `${payload.leadsOrSignups} leads or signups`;
  }

  if ((payload.clicks ?? 0) > 0) {
    return `${payload.clicks} clicks`;
  }

  return null;
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string; postingLogId: string }>;
  },
) {
  const { id, postingLogId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = strategicOutcomeRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<StrategicOutcomeResponse>(
      {
        success: false,
        persisted: false,
        outcome: null,
        previousOutcome: null,
        message: "Strategic outcome could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid strategic outcome payload.",
      },
      { status: 400 },
    );
  }

  const entries = await getPostingLogEntries(id);
  const postingEntry = entries.find((entry) => entry.id === postingLogId);

  if (!postingEntry) {
    return NextResponse.json<StrategicOutcomeResponse>(
      {
        success: false,
        persisted: false,
        outcome: null,
        previousOutcome: null,
        message: "Strategic outcome could not be saved.",
        error: "Posting log entry not found for this signal.",
      },
      { status: 404 },
    );
  }

  const existing = await getStrategicOutcome(postingLogId);
  const result = await upsertStrategicOutcome({
    postingLogId,
    signalId: id,
    platform: postingEntry.platform,
    ...parsed.data,
  });

  const metricHint = metricSummary(parsed.data);
  const auditEvents: AuditEventInput[] = [
    {
      signalId: id,
      eventType: existing ? "STRATEGIC_OUTCOME_UPDATED" : "STRATEGIC_OUTCOME_RECORDED",
      actor: "operator",
      summary: `${existing ? "Updated" : "Recorded"} strategic outcome for ${getPostingPlatformLabel(postingEntry.platform)} post as ${getStrategicValueLabel(result.outcome.strategicValue).toLowerCase()}.`,
      metadata: {
        platform: postingEntry.platform,
        strategicValue: result.outcome.strategicValue,
        clicks: result.outcome.clicks,
        leadsOrSignups: result.outcome.leadsOrSignups,
        trialsOrConversions: result.outcome.trialsOrConversions,
      },
    },
  ];

  if (metricHint) {
    auditEvents.push({
      signalId: id,
      eventType: existing ? "STRATEGIC_OUTCOME_UPDATED" : "STRATEGIC_OUTCOME_RECORDED",
      actor: "operator",
      summary: `${getPostingPlatformLabel(postingEntry.platform)} strategic outcome includes ${metricHint}.`,
      metadata: {
        platform: postingEntry.platform,
        metricHint,
      },
    });
  }

  await appendAuditEventsSafe(auditEvents);

  return NextResponse.json<StrategicOutcomeResponse>({
    success: true,
    persisted: true,
    outcome: result.outcome,
    previousOutcome: result.previous,
    message: existing ? "Strategic outcome updated." : "Strategic outcome recorded.",
  });
}
