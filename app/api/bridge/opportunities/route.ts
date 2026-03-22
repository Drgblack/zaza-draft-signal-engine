import { NextResponse } from "next/server";

import { buildBridgeOpportunitiesResponse } from "@/lib/bridge-opportunities";
import { getLatestZazaConnectExport } from "@/lib/zaza-connect-bridge";
import type { ZazaConnectBridgeOpportunitiesResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const latestExport = await getLatestZazaConnectExport();
    const response = buildBridgeOpportunitiesResponse(latestExport);

    return NextResponse.json<ZazaConnectBridgeOpportunitiesResponse>(response);
  } catch (error) {
    return NextResponse.json<ZazaConnectBridgeOpportunitiesResponse>(
      {
        success: false,
        exportId: null,
        generatedAt: null,
        opportunities: [],
        strongContentCandidates: [],
        message: "Unable to load Zaza Connect bridge opportunities.",
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Zaza Connect bridge opportunities.",
      },
      { status: 500 },
    );
  }
}
