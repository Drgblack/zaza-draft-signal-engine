import { buildBridgeOpportunitiesResponse } from "./bridge-opportunities";
import type {
  ZazaConnectBridgeGenerationStatus,
  ZazaConnectBridgeStorageDiagnostics,
  ZazaConnectExportPayload,
} from "@/lib/zaza-connect-bridge";

const BRIDGE_EXPORT_EXPECTED_CADENCE_HOURS = 6;
const BRIDGE_EXPORT_STALE_HOURS = 12;

export interface ConnectBridgeHealthSnapshot {
  ok: boolean;
  checkedAt: string;
  storage: ZazaConnectBridgeStorageDiagnostics;
  freshness: {
    expectedCadenceHours: number;
    staleThresholdHours: number;
  };
  automation: {
    cronPath: string;
    cronSecretConfigured: boolean;
  };
  generation: {
    lastAttemptedAt: string | null;
    lastAttemptOutcome: "success" | "failed" | null;
    lastSuccessfulExportId: string | null;
    lastSuccessfulExportAt: string | null;
    lastFailedAt: string | null;
    lastFailedError: string | null;
    consecutiveFailureCount: number;
  };
  latestExport: {
    available: boolean;
    exportId: string | null;
    generatedAt: string | null;
    ageHours: number | null;
    stale: boolean;
    strongCandidateCount: number;
    connectOpportunityCount: number;
    schemaVersion: string | null;
    producerVersion: string | null;
    metrics: {
      totalSignalsAvailable: number;
      visibleSignalsConsidered: number;
      approvalReadySignals: number;
      filteredOutSignals: number;
      weeklyPostingPackItemCount: number;
      fallbackCandidateCount: number;
      usedFallbackCandidates: boolean;
      strongContentCandidateCount: number;
      connectOpportunityCount: number;
      missingProofPointsCount: number;
      missingSourceSignalIdsCount: number;
      missingTeacherLanguageCount: number;
    };
  };
  history: {
    recentExports: Array<{
      exportId: string;
      generatedAt: string;
      connectOpportunityCount: number;
      strongCandidateCount: number;
      contentFingerprint: string;
    }>;
    lastNonEmptyExportAt: string | null;
    lastNonEmptyExportId: string | null;
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
  exportHistory: ZazaConnectExportPayload[];
  storage: ZazaConnectBridgeStorageDiagnostics;
  generationStatus: ZazaConnectBridgeGenerationStatus;
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
  const recentExports = input.exportHistory.slice(0, 5).map((item) => ({
    exportId: item.exportId,
    generatedAt: item.generatedAt,
    connectOpportunityCount: item.metrics.connectOpportunityCount,
    strongCandidateCount: item.strongContentCandidates.length,
    contentFingerprint: item.contentFingerprint,
  }));
  const lastNonEmptyExport =
    input.exportHistory.find((item) => item.metrics.connectOpportunityCount > 0) ?? null;

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
    if (connectOpportunityCount === 0 && lastNonEmptyExport && lastNonEmptyExport.exportId !== input.latestExport.exportId) {
      warnings.push(
        `Latest bridge export is empty after prior populated export ${lastNonEmptyExport.exportId} from ${lastNonEmptyExport.generatedAt}.`,
      );
    }
  }

  if (input.generationStatus.lastAttemptOutcome === "failed" && input.generationStatus.lastFailedError) {
    warnings.push(`Last bridge export attempt failed: ${input.generationStatus.lastFailedError}`);
  }
  if (input.generationStatus.consecutiveFailureCount > 0) {
    warnings.push(
      `Bridge export has ${input.generationStatus.consecutiveFailureCount} consecutive failure${input.generationStatus.consecutiveFailureCount === 1 ? "" : "s"}.`,
    );
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
    freshness: {
      expectedCadenceHours: BRIDGE_EXPORT_EXPECTED_CADENCE_HOURS,
      staleThresholdHours: BRIDGE_EXPORT_STALE_HOURS,
    },
    automation: {
      cronPath: "/api/cron/connect-bridge-export",
      cronSecretConfigured,
    },
    generation: {
      lastAttemptedAt: input.generationStatus.lastAttemptedAt,
      lastAttemptOutcome: input.generationStatus.lastAttemptOutcome,
      lastSuccessfulExportId: input.generationStatus.lastSuccessfulExportId,
      lastSuccessfulExportAt: input.generationStatus.lastSuccessfulExportAt,
      lastFailedAt: input.generationStatus.lastFailedAt,
      lastFailedError: input.generationStatus.lastFailedError,
      consecutiveFailureCount: input.generationStatus.consecutiveFailureCount,
    },
    latestExport: {
      available: Boolean(input.latestExport),
      exportId: input.latestExport?.exportId ?? null,
      generatedAt,
      ageHours,
      stale,
      strongCandidateCount,
      connectOpportunityCount,
      schemaVersion: input.latestExport?.schemaVersion ?? null,
      producerVersion: input.latestExport?.producerVersion ?? null,
      metrics: input.latestExport?.metrics ?? {
        totalSignalsAvailable: 0,
        visibleSignalsConsidered: 0,
        approvalReadySignals: 0,
        filteredOutSignals: 0,
        weeklyPostingPackItemCount: 0,
        fallbackCandidateCount: 0,
        usedFallbackCandidates: false,
        strongContentCandidateCount: strongCandidateCount,
        connectOpportunityCount,
        missingProofPointsCount: 0,
        missingSourceSignalIdsCount: 0,
        missingTeacherLanguageCount: 0,
      },
    },
    history: {
      recentExports,
      lastNonEmptyExportAt: lastNonEmptyExport?.generatedAt ?? null,
      lastNonEmptyExportId: lastNonEmptyExport?.exportId ?? null,
    },
    warnings,
  } satisfies ConnectBridgeHealthSnapshot;
}
