import { jsonError, jsonSuccess, parseJsonBody } from "@/lib/api-route";
import { discardContentOpportunityRenderedAsset } from "@/lib/content-opportunities";
import {
  factoryInputDiscardAssetRequestSchema,
  type FactoryInputResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(
    request,
    factoryInputDiscardAssetRequestSchema,
  );

  if (!parsed.success) {
    return jsonError<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid discard asset payload.",
      },
      400,
    );
  }

  try {
    const state = await discardContentOpportunityRenderedAsset({
      opportunityId: parsed.data.opportunityId,
      reviewNotes: parsed.data.reviewNotes,
      structuredReasons: parsed.data.structuredReasons ?? [],
    });

    return jsonSuccess<FactoryInputResponse>({
      success: true,
      state,
      message: "Rendered asset discarded.",
    });
  } catch (error) {
    return jsonError<FactoryInputResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to discard rendered asset.",
      },
      500,
    );
  }
}
