import { buildPhaseEOperationsSnapshot } from "@/lib/phase-e-operations";
import { jsonError, jsonSuccess } from "@/lib/api-route";
import type { PhaseEOperationsResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await buildPhaseEOperationsSnapshot();

    return jsonSuccess<PhaseEOperationsResponse>({
      success: true,
      snapshot,
    });
  } catch (error) {
    return jsonError<PhaseEOperationsResponse>(
      {
        success: false,
        snapshot: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Phase E operations snapshot.",
      },
      500,
    );
  }
}
