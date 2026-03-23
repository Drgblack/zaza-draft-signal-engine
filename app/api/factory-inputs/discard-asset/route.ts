import { NextResponse } from "next/server";

import { discardContentOpportunityRenderedAsset } from "@/lib/content-opportunities";
import {
  factoryInputDiscardAssetRequestSchema,
  type FactoryInputResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = factoryInputDiscardAssetRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid discard asset payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await discardContentOpportunityRenderedAsset({
      opportunityId: parsed.data.opportunityId,
      reviewNotes: parsed.data.reviewNotes,
      structuredReasons: parsed.data.structuredReasons ?? [],
    });

    return NextResponse.json<FactoryInputResponse>({
      success: true,
      state,
      message: "Rendered asset discarded.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to discard rendered asset.",
      },
      { status: 500 },
    );
  }
}
