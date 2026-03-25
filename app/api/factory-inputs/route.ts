import { NextResponse } from "next/server";

import {
  approveContentOpportunity,
  approveContentOpportunityVideoBrief,
  approveContentOpportunityVideoBriefForGeneration,
  createTestContentOpportunity,
  dismissContentOpportunity,
  listContentOpportunityState,
  refreshContentOpportunityStateFromSystem,
  reopenContentOpportunity,
  saveContentOpportunityVideoBriefDraft,
  selectContentOpportunityHook,
  selectContentOpportunityMessageAngle,
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
    if (
      parsed.data.action === "dismiss" &&
      !parsed.data.skipReason
    ) {
      return NextResponse.json<FactoryInputResponse>(
        {
          success: false,
          state: null,
          error: "Dismiss requires a skip reason.",
        },
        { status: 400 },
      );
    }

    let state;
    let message = "Founder selection saved.";
    let opportunityId: string | null = null;

    if (parsed.data.action === "approve_for_production") {
      state = await approveContentOpportunity(parsed.data.opportunityId);
      message = "Factory input approved for production.";
    } else if (parsed.data.action === "create_test_opportunity") {
      const result = await createTestContentOpportunity();
      state = result.state;
      opportunityId = result.opportunity.opportunityId;
      message = "Test opportunity created. The brief builder is ready.";
    } else if (parsed.data.action === "approve_video_brief") {
      state = await approveContentOpportunityVideoBrief(parsed.data.opportunityId);
      message = "Video brief approved.";
    } else if (parsed.data.action === "approve_video_brief_for_generation") {
      state = await approveContentOpportunityVideoBriefForGeneration(parsed.data.opportunityId);
      message = "Video brief approved for generation.";
    } else if (parsed.data.action === "dismiss") {
      state = await dismissContentOpportunity(
        parsed.data.opportunityId,
        parsed.data.skipReason,
      );
      message = "Factory input dismissed.";
    } else if (parsed.data.action === "reopen") {
      state = await reopenContentOpportunity(parsed.data.opportunityId);
      message = "Factory input reopened.";
    } else if (parsed.data.action === "update_notes") {
      state = await updateContentOpportunityNotes(parsed.data.opportunityId, parsed.data.notes);
      message = "Factory input notes updated.";
    } else if (parsed.data.action === "select_message_angle") {
      state = await selectContentOpportunityMessageAngle({
        opportunityId: parsed.data.opportunityId,
        angleId: parsed.data.angleId,
      });
      message = "Message angle selected.";
    } else if (parsed.data.action === "select_hook_option") {
      state = await selectContentOpportunityHook({
        opportunityId: parsed.data.opportunityId,
        angleId: parsed.data.angleId,
        hookId: parsed.data.hookId,
      });
      message = "Hook option selected.";
    } else if (parsed.data.action === "save_video_brief_draft") {
      state = await saveContentOpportunityVideoBriefDraft({
        opportunityId: parsed.data.opportunityId,
        briefDraft: parsed.data.briefDraft,
      });
      message = "Video brief draft saved.";
    } else {
      state = await updateContentOpportunityFounderSelection({
        opportunityId: parsed.data.opportunityId,
        selectedAngleId: parsed.data.selectedAngleId,
        selectedHookId: parsed.data.selectedHookId,
      });
    }

    return NextResponse.json<FactoryInputResponse>({
      success: true,
      state,
      opportunityId,
      message,
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
