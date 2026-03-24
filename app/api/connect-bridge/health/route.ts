import { NextResponse } from "next/server";

import { buildConnectBridgeHealthSnapshot } from "@/lib/connect-bridge-health";
import {
  getZazaConnectBridgeRuntimeState,
  getZazaConnectBridgeStorageDiagnostics,
} from "@/lib/zaza-connect-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const runtimeState = await getZazaConnectBridgeRuntimeState();
    const snapshot = buildConnectBridgeHealthSnapshot({
      latestExport: runtimeState.latestExport,
      exportHistory: runtimeState.exports,
      storage: getZazaConnectBridgeStorageDiagnostics(),
      generationStatus: runtimeState.generationStatus,
    });

    return NextResponse.json(snapshot, {
      status: snapshot.ok ? 200 : 503,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        storage: getZazaConnectBridgeStorageDiagnostics(),
        freshness: {
          expectedCadenceHours: 6,
          staleThresholdHours: 12,
        },
        automation: {
          cronPath: "/api/cron/connect-bridge-export",
          cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
        },
        generation: {
          lastAttemptedAt: null,
          lastAttemptOutcome: null,
          lastSuccessfulExportId: null,
          lastSuccessfulExportAt: null,
          lastDisposition: null,
          lastReplacedExportId: null,
          lastFailedAt: null,
          lastFailedError: error instanceof Error
            ? error.message
            : "Unable to load Zaza Connect bridge health.",
          consecutiveFailureCount: 0,
        },
        latestExport: {
          available: false,
          exportId: null,
          generatedAt: null,
          ageHours: null,
          stale: false,
          strongCandidateCount: 0,
          connectOpportunityCount: 0,
          schemaVersion: null,
          producerVersion: null,
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
        },
        history: {
          recentExports: [],
          lastNonEmptyExportAt: null,
          lastNonEmptyExportId: null,
          diffFromPrevious: null,
        },
        alerts: [
          {
            code: "bridge_health_unavailable",
            severity: "critical",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load Zaza Connect bridge health.",
          },
        ],
        warnings: [
          error instanceof Error
            ? error.message
            : "Unable to load Zaza Connect bridge health.",
        ],
      },
      { status: 500 },
    );
  }
}
