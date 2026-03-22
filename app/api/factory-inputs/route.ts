import { NextResponse } from "next/server";

import {
  approveContentOpportunity,
  approveContentOpportunityVideoBriefForGeneration,
  dismissContentOpportunity,
  listContentOpportunityState,
  refreshContentOpportunityStateFromSystem,
  reopenContentOpportunity,
  updateContentOpportunityFounderSelection,
  updateContentOpportunityNotes,
} from "@/lib/content-opportunities";
import {
  factoryInputActionRequestSchema,
  factoryInputRefreshRequestSchema,
  type FactoryInputResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await listContentOpportunityState();

    return NextResponse.json<FactoryInputResponse>({
      success: true,
      state,
      message: "Factory inputs loaded.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to load factory inputs.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = factoryInputRefreshRequestSchema.safeParse(payload ?? { refresh: true });

  if (!parsed.success) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid factory input refresh payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await refreshContentOpportunityStateFromSystem();

    return NextResponse.json<FactoryInputResponse>({
      success: true,
      state,
      message: "Factory inputs refreshed.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to refresh factory inputs.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = factoryInputActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid factory input action payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state =
      parsed.data.action === "approve_for_production"
        ? await approveContentOpportunity(parsed.data.opportunityId)
        : parsed.data.action === "approve_video_brief_for_generation"
          ? await approveContentOpportunityVideoBriefForGeneration(parsed.data.opportunityId)
        : parsed.data.action === "dismiss"
          ? await dismissContentOpportunity(parsed.data.opportunityId)
          : parsed.data.action === "reopen"
            ? await reopenContentOpportunity(parsed.data.opportunityId)
            : parsed.data.action === "update_notes"
              ? await updateContentOpportunityNotes(parsed.data.opportunityId, parsed.data.notes)
              : await updateContentOpportunityFounderSelection({
                  opportunityId: parsed.data.opportunityId,
                  selectedAngleId: parsed.data.selectedAngleId,
                  selectedHookId: parsed.data.selectedHookId,
                });

    return NextResponse.json<FactoryInputResponse>({
      success: true,
      state,
      message:
        parsed.data.action === "approve_for_production"
          ? "Factory input approved for production."
          : parsed.data.action === "approve_video_brief_for_generation"
            ? "Video brief approved for generation."
          : parsed.data.action === "dismiss"
            ? "Factory input dismissed."
            : parsed.data.action === "reopen"
              ? "Factory input reopened."
              : parsed.data.action === "update_notes"
                ? "Factory input notes updated."
                : "Founder selection saved.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to update factory input.",
      },
      { status: 500 },
    );
  }
}
