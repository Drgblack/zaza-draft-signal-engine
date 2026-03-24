import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import { listContentOpportunityState } from "@/lib/content-opportunities";
import {
  buildConnectPerformanceSignal,
  upsertConnectPerformanceSignal,
} from "@/lib/phase-e-orchestration";
import { buildPerformanceSignal } from "@/lib/performance-signals";
import {
  zazaConnectPerformanceSignalRequestSchema,
  type ZazaConnectPerformanceSignalResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = zazaConnectPerformanceSignalRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<ZazaConnectPerformanceSignalResponse>(
      {
        success: false,
        signal: null,
        message: "Connect performance signal rejected.",
        error:
          parsed.error.issues[0]?.message ??
          "Invalid Connect performance signal payload.",
      },
      { status: 400 },
    );
  }

  try {
    const createdAt = parsed.data.createdAt ?? new Date().toISOString();
    const contentState = await listContentOpportunityState().catch(() => null);
    const opportunitySignalId =
      contentState?.opportunities.find(
        (opportunity) => opportunity.opportunityId === parsed.data.opportunityId,
      )?.signalId ?? parsed.data.opportunityId;
    const baseSignal = buildPerformanceSignal({
      opportunityId: parsed.data.opportunityId,
      videoBriefId: parsed.data.videoBriefId ?? null,
      renderedAssetId: parsed.data.renderedAssetId ?? null,
      eventType: parsed.data.eventType,
      value: parsed.data.value ?? null,
      metadata: parsed.data.metadata,
      createdAt,
    });
    const signal = await upsertConnectPerformanceSignal(
      buildConnectPerformanceSignal({
        baseSignal,
        campaignType: parsed.data.campaignType,
        connectOutcome: parsed.data.connectOutcome,
        connectNotes: parsed.data.connectNotes ?? null,
      }),
    );

    await appendAuditEventsSafe([
      {
        signalId: opportunitySignalId,
        eventType: "ZAZA_CONNECT_CONTEXT_IMPORTED",
        actor: "system",
        summary: "Recorded a Connect performance signal for a factory opportunity.",
        metadata: {
          performanceSignalId: signal.id,
          connectOutcome: signal.connectOutcome,
          campaignType: signal.campaignType,
          renderedAssetId: signal.renderedAssetId ?? null,
          videoBriefId: signal.videoBriefId ?? null,
        },
      },
    ]);

    return NextResponse.json<ZazaConnectPerformanceSignalResponse>({
      success: true,
      signal,
      message: "Connect performance signal recorded.",
    });
  } catch (error) {
    return NextResponse.json<ZazaConnectPerformanceSignalResponse>(
      {
        success: false,
        signal: null,
        message: "Connect performance signal rejected.",
        error:
          error instanceof Error
            ? error.message
            : "Unable to persist Connect performance signal.",
      },
      { status: 500 },
    );
  }
}
