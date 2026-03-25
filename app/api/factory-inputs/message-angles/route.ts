import { NextResponse } from "next/server";

import {
  generateContentOpportunityMessageAngles,
  listContentOpportunityState,
} from "@/lib/content-opportunities";
import {
  factoryInputMessageAngleRequestSchema,
  type FactoryInputMessageAnglesResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = factoryInputMessageAngleRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FactoryInputMessageAnglesResponse>(
      {
        success: false,
        state: null,
        opportunity: null,
        messageAngles: [],
        error:
          parsed.error.issues[0]?.message ??
          "Invalid message angle generation payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await generateContentOpportunityMessageAngles({
      opportunityId: parsed.data.opportunityId,
      regenerate: parsed.data.regenerate,
    });
    const opportunity =
      state.opportunities.find(
        (item) => item.opportunityId === parsed.data.opportunityId,
      ) ?? null;

    return NextResponse.json<FactoryInputMessageAnglesResponse>({
      success: true,
      state,
      opportunity,
      messageAngles: opportunity?.messageAngles ?? [],
      message: parsed.data.regenerate
        ? "Message angles regenerated."
        : "Message angles generated.",
    });
  } catch (error) {
    const state = await listContentOpportunityState().catch(() => null);

    return NextResponse.json<FactoryInputMessageAnglesResponse>(
      {
        success: false,
        state,
        opportunity:
          state?.opportunities.find(
            (item) => item.opportunityId === parsed.data.opportunityId,
          ) ?? null,
        messageAngles:
          state?.opportunities.find(
            (item) => item.opportunityId === parsed.data.opportunityId,
          )?.messageAngles ?? [],
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate message angles.",
      },
      { status: 500 },
    );
  }
}
