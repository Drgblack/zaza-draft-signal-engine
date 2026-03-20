import { NextResponse } from "next/server";

import { followUpActionRequestSchema, updateFollowUpTaskStatus } from "@/lib/follow-up";

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = followUpActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        task: null,
        message: "Follow-up task update failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid follow-up task payload.",
      },
      { status: 400 },
    );
  }

  try {
    const task = await updateFollowUpTaskStatus(parsed.data.taskId, parsed.data.status);
    return NextResponse.json({
      success: true,
      task,
      message: parsed.data.status === "done" ? "Follow-up task completed." : "Follow-up task dismissed.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        task: null,
        message: "Follow-up task update failed.",
        error: error instanceof Error ? error.message : "Unable to update follow-up task.",
      },
      { status: 500 },
    );
  }
}
