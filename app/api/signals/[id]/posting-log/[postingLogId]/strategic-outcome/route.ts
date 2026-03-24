import { NextResponse } from "next/server";

import { listSignalsWithFallback } from "@/lib/signal-repository";
import { syncAttributionMemory } from "@/lib/attribution";
import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { getCampaignStrategy } from "@/lib/campaigns";
import { listExperiments } from "@/lib/experiments";
import { listFollowUpTasks } from "@/lib/follow-up";
import { getPostingPlatformLabel, getPostingLogEntries, listPostingLogEntries } from "@/lib/posting-log";
import { syncRevenueSignals } from "@/lib/revenue-signals";
import { listPostingOutcomes } from "@/lib/outcomes";
import {
  getStrategicValueLabel,
  strategicOutcomeRequestSchema,
} from "@/lib/strategic-outcome-memory";
import { getStrategicOutcome, listStrategicOutcomes, upsertStrategicOutcome } from "@/lib/strategic-outcomes";
import { getWeeklyPlanStore } from "@/lib/weekly-plan";
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
  const [signalsResult, postingEntries, postingOutcomes, strategicOutcomes, experiments, strategy] = await Promise.all([
    listSignalsWithFallback({ limit: 1000 }),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
    listExperiments(),
    getCampaignStrategy(),
  ]);
  const weeklyPlanStore = await getWeeklyPlanStore(strategy);
  await listFollowUpTasks({
    signals: signalsResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    weeklyPlans: weeklyPlanStore.plans,
  });
  await syncAttributionMemory({
    signals: signalsResult.signals,
    postingEntries,
    strategicOutcomes,
  });
  await syncRevenueSignals({
    signals: signalsResult.signals,
    postingEntries,
    strategicOutcomes,
  });

  return NextResponse.json<StrategicOutcomeResponse>({
    success: true,
    persisted: true,
    outcome: result.outcome,
    previousOutcome: result.previous,
    message: existing ? "Strategic outcome updated." : "Strategic outcome recorded.",
  });
}
