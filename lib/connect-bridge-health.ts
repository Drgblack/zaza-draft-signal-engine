import { buildBridgeOpportunitiesResponse } from "@/lib/bridge-opportunities";
import type {
  ZazaConnectBridgeStorageDiagnostics,
  ZazaConnectExportPayload,
} from "@/lib/zaza-connect-bridge";

const BRIDGE_EXPORT_STALE_HOURS = 24;

export interface ConnectBridgeHealthSnapshot {
  ok: boolean;
  checkedAt: string;
  storage: ZazaConnectBridgeStorageDiagnostics;
  automation: {
    cronPath: string;
    cronSecretConfigured: boolean;
  };
  latestExport: {
    available: boolean;
    exportId: string | null;
    generatedAt: string | null;
    ageHours: number | null;
    stale: boolean;
    strongCandidateCount: number;
    connectOpportunityCount: number;
  };
  warnings: string[];
}

function getLatestExportAgeHours(generatedAt: string | null, now: Date) {
  if (!generatedAt) {
    return null;
  }

  const timestamp = new Date(generatedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const diffMs = now.getTime() - timestamp;
  return Math.max(0, Math.round((diffMs / (60 * 60 * 1000)) * 10) / 10);
}

export function buildConnectBridgeHealthSnapshot(input: {
  latestExport: ZazaConnectExportPayload | null;
  storage: ZazaConnectBridgeStorageDiagnostics;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const bridgeResponse = buildBridgeOpportunitiesResponse(input.latestExport);
  const generatedAt = input.latestExport?.generatedAt ?? null;
  const ageHours = getLatestExportAgeHours(generatedAt, now);
  const stale = ageHours !== null && ageHours > BRIDGE_EXPORT_STALE_HOURS;
  const strongCandidateCount = input.latestExport?.strongContentCandidates.length ?? 0;
  const connectOpportunityCount = bridgeResponse.opportunities.length;
  const cronSecretConfigured = Boolean(process.env.CRON_SECRET?.trim());
  const warnings: string[] = [];

  if (!input.storage.blobConfigured) {
    warnings.push("BLOB_READ_WRITE_TOKEN is missing. Bridge exports are not durable across instances.");
  }
  if (!cronSecretConfigured) {
    warnings.push("CRON_SECRET is missing. Scheduled bridge export refreshes are not secured or may fail.");
  }
  if (!input.latestExport) {
    warnings.push("No persisted bridge export exists yet.");
  } else {
    if (stale) {
      warnings.push(`Latest bridge export is stale (${ageHours}h old).`);
    }
    if (strongCandidateCount === 0) {
      warnings.push("Latest bridge export contains zero strong content candidates.");
    }
    if (connectOpportunityCount === 0) {
      warnings.push("Bridge opportunities payload is empty for Connect.");
    }
  }

  return {
    ok:
      input.storage.blobConfigured &&
      cronSecretConfigured &&
      Boolean(input.latestExport) &&
      !stale &&
      connectOpportunityCount > 0,
    checkedAt,
    storage: input.storage,
    automation: {
      cronPath: "/api/cron/connect-bridge-export",
      cronSecretConfigured,
    },
    latestExport: {
      available: Boolean(input.latestExport),
      exportId: input.latestExport?.exportId ?? null,
      generatedAt,
      ageHours,
      stale,
      strongCandidateCount,
      connectOpportunityCount,
    },
    warnings,
  } satisfies ConnectBridgeHealthSnapshot;
}
