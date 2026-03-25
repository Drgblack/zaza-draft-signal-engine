import { NextResponse } from "next/server";

import {
  generateContentOpportunityHookSets,
  listContentOpportunityState,
} from "@/lib/content-opportunities";
import {
  factoryInputHookSetRequestSchema,
  type FactoryInputHookSetsResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = factoryInputHookSetRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FactoryInputHookSetsResponse>(
      {
        success: false,
        state: null,
        opportunity: null,
        hookSets: [],
        error: parsed.error.issues[0]?.message ?? "Invalid hook set generation payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await generateContentOpportunityHookSets({
      opportunityId: parsed.data.opportunityId,
      angleId: parsed.data.angleId ?? null,
      regenerate: parsed.data.regenerate,
    });
    const opportunity =
      state.opportunities.find(
        (item) => item.opportunityId === parsed.data.opportunityId,
      ) ?? null;
    const hookSets = parsed.data.angleId
      ? (opportunity?.hookSets ?? []).filter(
          (hookSet) => hookSet.angleId === parsed.data.angleId,
        )
      : opportunity?.hookSets ?? [];

    return NextResponse.json<FactoryInputHookSetsResponse>({
      success: true,
      state,
      opportunity,
      hookSets,
      message: parsed.data.regenerate ? "Hook sets regenerated." : "Hook sets generated.",
    });
  } catch (error) {
    const state = await listContentOpportunityState().catch(() => null);
    const opportunity =
      state?.opportunities.find(
        (item) => item.opportunityId === parsed.data.opportunityId,
      ) ?? null;
    const hookSets = parsed.data.angleId
      ? (opportunity?.hookSets ?? []).filter(
          (hookSet) => hookSet.angleId === parsed.data.angleId,
        )
      : opportunity?.hookSets ?? [];

    return NextResponse.json<FactoryInputHookSetsResponse>(
      {
        success: false,
        state,
        opportunity,
        hookSets,
        error: error instanceof Error ? error.message : "Unable to generate hook sets.",
      },
      { status: 500 },
    );
  }
}
