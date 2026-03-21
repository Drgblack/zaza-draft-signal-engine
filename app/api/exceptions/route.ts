import { NextResponse } from "next/server";

import { updateOperatorTaskStatus } from "@/lib/operator-tasks";
import {
  exceptionInboxActionRequestSchema,
  resolveExceptionInboxItem,
} from "@/lib/exception-inbox";
import type {
  DuplicateClusterActionResponse,
  ExceptionInboxActionResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = exceptionInboxActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<ExceptionInboxActionResponse>(
      {
        success: false,
        message: "Exception inbox action failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid exception inbox payload.",
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "resolve_duplicate") {
      const duplicateResponse = await fetch(new URL("/api/duplicate-clusters", request.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "confirm_cluster",
          cluster: parsed.data.quickAction.cluster,
        }),
      });
      const duplicateData =
        (await duplicateResponse.json().catch(() => null)) as DuplicateClusterActionResponse | null;

      if (!duplicateResponse.ok || !duplicateData?.success) {
        throw new Error(duplicateData?.error ?? "Unable to resolve duplicate cluster.");
      }

      if (parsed.data.taskId) {
        const task = await updateOperatorTaskStatus(parsed.data.taskId, "done");
        await resolveExceptionInboxItem({
          exceptionId: parsed.data.exceptionId,
          resolution: "resolved",
          signalId: task.signalId,
        });
      } else {
        await resolveExceptionInboxItem({
          exceptionId: parsed.data.exceptionId,
          resolution: "resolved",
        });
      }

      return NextResponse.json<ExceptionInboxActionResponse>({
        success: true,
        message: "Duplicate exception resolved.",
      });
    }

    if (parsed.data.taskId) {
      const status = parsed.data.action === "resolve" ? "done" : "dismissed";
      const task = await updateOperatorTaskStatus(parsed.data.taskId, status);
      await resolveExceptionInboxItem({
        exceptionId: parsed.data.exceptionId,
        resolution: parsed.data.action === "resolve" ? "resolved" : "dismissed",
        signalId: task.signalId,
      });
    } else {
      await resolveExceptionInboxItem({
        exceptionId: parsed.data.exceptionId,
        resolution: parsed.data.action === "resolve" ? "resolved" : "dismissed",
      });
    }

    return NextResponse.json<ExceptionInboxActionResponse>({
      success: true,
      message:
        parsed.data.action === "resolve"
          ? "Exception marked resolved."
          : "Exception dismissed.",
    });
  } catch (error) {
    return NextResponse.json<ExceptionInboxActionResponse>(
      {
        success: false,
        message: "Exception inbox action failed.",
        error: error instanceof Error ? error.message : "Unable to update exception.",
      },
      { status: 500 },
    );
  }
}
