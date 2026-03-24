import { NextResponse } from "next/server";

import { getSignalWithFallback } from "@/lib/signal-repository";
import { appendAuditEventsSafe } from "@/lib/audit";
import {
  getStaleQueueOperatorStateSync,
  getStaleQueueOperatorActionLabel,
  persistStaleQueueOperatorAction,
  staleQueueActionRequestSchema,
} from "@/lib/stale-queue";
import type { StaleQueueActionResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = staleQueueActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signalId: "",
        operatorState: null,
        error: parsed.error.issues[0]?.message ?? "Invalid stale queue action payload.",
      },
      { status: 400 },
    );
  }

  const signalResult = await getSignalWithFallback(parsed.data.signalId);
  if (!signalResult.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: signalResult.source,
        signalId: parsed.data.signalId,
        operatorState: null,
        error: "Signal not found.",
      },
      { status: 404 },
    );
  }

  try {
    persistStaleQueueOperatorAction(parsed.data);

    const auditEvent =
      parsed.data.action === "refresh_requested"
        ? {
            eventType: "QUEUE_ITEM_REFRESH_REQUESTED" as const,
            summary: `Requested refresh for ${signalResult.signal.sourceTitle}.`,
          }
        : parsed.data.action === "move_to_evergreen_later"
          ? {
              eventType: "QUEUE_ITEM_MOVED_TO_EVERGREEN_LATER" as const,
              summary: `Moved ${signalResult.signal.sourceTitle} into evergreen later.`,
            }
          : parsed.data.action === "suppress"
            ? {
                eventType: "QUEUE_ITEM_SUPPRESSED" as const,
                summary: `Suppressed ${signalResult.signal.sourceTitle} from the top queue.`,
              }
            : null;

    if (auditEvent) {
      await appendAuditEventsSafe([
        {
          signalId: parsed.data.signalId,
          eventType: auditEvent.eventType,
          actor: "operator",
          summary: auditEvent.summary,
          metadata: {
            operatorAction: parsed.data.action,
            note: parsed.data.note?.trim() || null,
          },
        },
      ]);
    }

    return NextResponse.json<StaleQueueActionResponse>({
      success: true,
      persisted: true,
      source: signalResult.source,
      signalId: parsed.data.signalId,
      operatorState: getStaleQueueOperatorStateSync(parsed.data.signalId),
      stale: null,
      message: `${getStaleQueueOperatorActionLabel(parsed.data.action)} saved for ${signalResult.signal.sourceTitle}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: signalResult.source,
        signalId: parsed.data.signalId,
        operatorState: null,
        error: error instanceof Error ? error.message : "Unable to update stale queue state.",
      },
      { status: 500 },
    );
  }
}

