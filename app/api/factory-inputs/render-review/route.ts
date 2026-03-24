import { jsonError, jsonSuccess, parseJsonBody } from "@/lib/api-route";
import { reviewContentOpportunityRenderedAsset } from "@/lib/content-opportunities";
import {
  factoryInputRenderReviewRequestSchema,
  type FactoryInputResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const parsed = await parseJsonBody(
    request,
    factoryInputRenderReviewRequestSchema,
  );

  if (!parsed.success) {
    return jsonError<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid render review payload.",
      },
      400,
    );
  }

  try {
    const state = await reviewContentOpportunityRenderedAsset({
      opportunityId: parsed.data.opportunityId,
      status: parsed.data.status,
      reviewNotes: parsed.data.reviewNotes,
      rejectionReason: parsed.data.rejectionReason,
      structuredReasons: parsed.data.structuredReasons ?? [],
    });

    return jsonSuccess<FactoryInputResponse>({
      success: true,
      state,
      message:
        parsed.data.status === "accepted"
          ? "Rendered asset accepted."
          : "Rendered asset rejected.",
    });
  } catch (error) {
    return jsonError<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update rendered asset review.",
      },
      500,
    );
  }
}
