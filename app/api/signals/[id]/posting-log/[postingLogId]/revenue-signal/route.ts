import { NextResponse } from "next/server";

import { getSignalWithFallback } from "@/lib/signal-repository";
import { getPostingPlatformLabel, getPostingLogEntries } from "@/lib/posting-log";
import {
  getRevenueSignal,
  revenueSignalRequestSchema,
  upsertRevenueSignal,
} from "@/lib/revenue-signals";
import type { RevenueSignalResponse } from "@/types/api";

function labelRevenueType(type: "signup" | "trial" | "paid" | "unknown"): string {
  switch (type) {
    case "signup":
      return "signup";
    case "trial":
      return "trial";
    case "paid":
      return "paid";
    case "unknown":
    default:
      return "revenue";
  }
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string; postingLogId: string }>;
  },
) {
  const { id, postingLogId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = revenueSignalRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<RevenueSignalResponse>(
      {
        success: false,
        persisted: false,
        revenueSignal: null,
        previousRevenueSignal: null,
        message: "Revenue signal could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid revenue signal payload.",
      },
      { status: 400 },
    );
  }

  const entries = await getPostingLogEntries(id);
  const postingEntry = entries.find((entry) => entry.id === postingLogId);

  if (!postingEntry) {
    return NextResponse.json<RevenueSignalResponse>(
      {
        success: false,
        persisted: false,
        revenueSignal: null,
        previousRevenueSignal: null,
        message: "Revenue signal could not be saved.",
        error: "Posting log entry not found for this signal.",
      },
      { status: 404 },
    );
  }

  const signalResult = await getSignalWithFallback(id);
  const existing = await getRevenueSignal(postingLogId);
  const result = await upsertRevenueSignal({
    postingEntry,
    signal: signalResult.signal,
    type: parsed.data.type,
    strength: parsed.data.strength,
    confidence: parsed.data.confidence,
    notes: parsed.data.notes ?? null,
  });

  return NextResponse.json<RevenueSignalResponse>({
    success: true,
    persisted: true,
    revenueSignal: result.revenueSignal,
    previousRevenueSignal: result.previous,
    message: existing
      ? `${getPostingPlatformLabel(postingEntry.platform)} ${labelRevenueType(result.revenueSignal.type)} revenue signal updated.`
      : `${getPostingPlatformLabel(postingEntry.platform)} ${labelRevenueType(result.revenueSignal.type)} revenue signal recorded.`,
  });
}
