import { NextResponse } from "next/server";

import { regenerateContentOpportunityVideo } from "@/lib/content-opportunities";
import {
  factoryInputRegenerateVideoRequestSchema,
  type FactoryInputResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = factoryInputRegenerateVideoRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid regenerate video payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await regenerateContentOpportunityVideo({
      opportunityId: parsed.data.opportunityId,
      provider: parsed.data.provider,
    });

    return NextResponse.json<FactoryInputResponse>({
      success: true,
      state,
      message: "Video regenerated through the mock production pipeline and is ready for review.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to regenerate video.",
      },
      { status: 500 },
    );
  }
}
