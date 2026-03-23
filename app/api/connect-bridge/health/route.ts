import { NextResponse } from "next/server";

import { buildConnectBridgeHealthSnapshot } from "@/lib/connect-bridge-health";
import {
  getLatestZazaConnectExport,
  getZazaConnectBridgeStorageDiagnostics,
} from "@/lib/zaza-connect-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const latestExport = await getLatestZazaConnectExport();
    const snapshot = buildConnectBridgeHealthSnapshot({
      latestExport,
      storage: getZazaConnectBridgeStorageDiagnostics(),
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
        automation: {
          cronPath: "/api/cron/connect-bridge-export",
          cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
        },
        latestExport: {
          available: false,
          exportId: null,
          generatedAt: null,
          ageHours: null,
          stale: false,
          strongCandidateCount: 0,
          connectOpportunityCount: 0,
        },
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
