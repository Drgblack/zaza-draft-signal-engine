import { NextResponse } from "next/server";

import { generateContentOpportunityVideo } from "@/lib/content-opportunities";
import {
  factoryInputGenerateVideoRequestSchema,
  type FactoryInputResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = factoryInputGenerateVideoRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid generate video payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await generateContentOpportunityVideo({
      opportunityId: parsed.data.opportunityId,
      provider: parsed.data.provider,
    });

    return NextResponse.json<FactoryInputResponse>({
      success: true,
      state,
      message: "Mock video generated and ready for review.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to generate video.",
      },
      { status: 500 },
    );
  }
}
