import { NextResponse } from "next/server";

import { generateContentOpportunityVideo } from "@/lib/content-opportunities";
import { VideoFactoryActiveRunError } from "@/lib/video-factory-idempotency";
import { scheduleVideoFactoryRun } from "@/lib/video-factory-runner";
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
      preTriageConcern: parsed.data.preTriageConcern ?? null,
    });
    scheduleVideoFactoryRun({
      opportunityId: parsed.data.opportunityId,
    });

    return NextResponse.json<FactoryInputResponse>({
      success: true,
      state,
      message: "Video generation queued and handed to the factory runner.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to generate video.",
      },
      {
        status: error instanceof VideoFactoryActiveRunError ? 409 : 500,
      },
    );
  }
}
