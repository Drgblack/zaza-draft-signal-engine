import { NextResponse } from "next/server";

import {
  updateWeeklyPostingPackItemAction,
  weeklyPostingPackActionRequestSchema,
} from "@/lib/weekly-posting-pack";
import type { WeeklyPostingPackActionResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = weeklyPostingPackActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        action: null,
        message: "Weekly posting pack action failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid weekly posting pack payload.",
      } satisfies WeeklyPostingPackActionResponse,
      { status: 400 },
    );
  }

  try {
    const action = await updateWeeklyPostingPackItemAction(parsed.data);

    return NextResponse.json(
      {
        success: true,
        persisted: true,
        action,
        message:
          parsed.data.action === "approve"
            ? "Weekly pack item approved."
            : "Weekly pack item removed from the current recommendation.",
      } satisfies WeeklyPostingPackActionResponse,
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        action: null,
        message: "Weekly posting pack action failed.",
        error: error instanceof Error ? error.message : "Unable to update weekly posting pack state.",
      } satisfies WeeklyPostingPackActionResponse,
      { status: 500 },
    );
  }
}
