import { NextResponse } from "next/server";

import {
  approveSafeReply,
  buildSafeReplyState,
  dismissSafeReply,
  safeReplyActionRequestSchema,
  stageSafeReply,
} from "@/lib/safe-replies";
import type { SafeReplyActionResponse } from "@/types/api";

export async function GET() {
  const state = await buildSafeReplyState();

  return NextResponse.json<SafeReplyActionResponse>({
    success: true,
    reply: null,
    rows: state.rows,
    summary: state.summary,
    message: "Safe reply state loaded.",
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = safeReplyActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<SafeReplyActionResponse>(
      {
        success: false,
        reply: null,
        rows: [],
        summary: null,
        message: "Safe reply action could not be completed.",
        error: parsed.error.issues[0]?.message ?? "Invalid safe reply payload.",
      },
      { status: 400 },
    );
  }

  try {
    let reply = null;
    let message = "Safe reply action completed.";

    if (parsed.data.action === "stage_reply") {
      reply = await stageSafeReply(parsed.data.replyId, parsed.data.replyText ?? null);
      message = "Low-risk reply staged for operator confirmation.";
    } else if (parsed.data.action === "approve_reply") {
      await approveSafeReply(parsed.data.replyId, parsed.data.replyText ?? null);
      message = "Safe reply approved for manual sending.";
    } else {
      await dismissSafeReply(parsed.data.replyId);
      message = "Safe reply suggestion dismissed.";
    }

    const state = await buildSafeReplyState();
    return NextResponse.json<SafeReplyActionResponse>({
      success: true,
      reply,
      rows: state.rows,
      summary: state.summary,
      message,
    });
  } catch (error) {
    return NextResponse.json<SafeReplyActionResponse>(
      {
        success: false,
        reply: null,
        rows: [],
        summary: null,
        message: "Safe reply action could not be completed.",
        error: error instanceof Error ? error.message : "Unknown safe reply failure.",
      },
      { status: 500 },
    );
  }
}
