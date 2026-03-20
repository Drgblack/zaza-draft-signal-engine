import { NextResponse } from "next/server";

import {
  operatorTaskActionRequestSchema,
  updateOperatorTaskStatus,
} from "@/lib/operator-tasks";
import type { OperatorTaskActionResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = operatorTaskActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        task: null,
        message: "Operator task update failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid operator task payload.",
      } satisfies OperatorTaskActionResponse,
      { status: 400 },
    );
  }

  try {
    const task = await updateOperatorTaskStatus(parsed.data.taskId, parsed.data.status);

    return NextResponse.json({
      success: true,
      task,
      message:
        parsed.data.status === "done"
          ? "Operator task completed."
          : "Operator task dismissed.",
    } satisfies OperatorTaskActionResponse);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        task: null,
        message: "Operator task update failed.",
        error: error instanceof Error ? error.message : "Unable to update operator task.",
      } satisfies OperatorTaskActionResponse,
      { status: 500 },
    );
  }
}
