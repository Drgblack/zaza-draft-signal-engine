import { NextResponse } from "next/server";

import { buildBridgeOpportunitiesResponse } from "@/lib/bridge-opportunities";
import {
  ZAZA_CONNECT_BRIDGE_SCHEMA_VERSION,
  getLatestZazaConnectExport,
} from "@/lib/zaza-connect-bridge";
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
        schemaVersion: ZAZA_CONNECT_BRIDGE_SCHEMA_VERSION,
        producerVersion: process.env.VERCEL_GIT_COMMIT_SHA?.trim()?.slice(0, 12) ?? "dev",
        exportId: null,
        generatedAt: null,
        contentFingerprint: null,
        metrics: {
          totalSignalsAvailable: 0,
          visibleSignalsConsidered: 0,
          approvalReadySignals: 0,
          filteredOutSignals: 0,
          weeklyPostingPackItemCount: 0,
          fallbackCandidateCount: 0,
          usedFallbackCandidates: false,
          strongContentCandidateCount: 0,
          connectOpportunityCount: 0,
          missingProofPointsCount: 0,
          missingSourceSignalIdsCount: 0,
          missingTeacherLanguageCount: 0,
        },
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
