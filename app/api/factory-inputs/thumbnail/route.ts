import { NextResponse } from "next/server";

import { updateContentOpportunityThumbnail } from "@/lib/content-opportunities";
import {
  factoryInputThumbnailRequestSchema,
  type FactoryInputResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = factoryInputThumbnailRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid thumbnail update payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await updateContentOpportunityThumbnail({
      opportunityId: parsed.data.opportunityId,
      action: parsed.data.action,
      thumbnailUrl: parsed.data.thumbnailUrl ?? null,
    });

    return NextResponse.json<FactoryInputResponse>({
      success: true,
      state,
      message:
        parsed.data.action === "override"
          ? "Thumbnail override saved."
          : "Thumbnail reset to generated output.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update the rendered asset thumbnail.",
      },
      { status: 500 },
    );
  }
}
