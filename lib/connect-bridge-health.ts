import { buildBridgeOpportunitiesResponse } from "./bridge-opportunities";
import type {
  ZazaConnectBridgeGenerationStatus,
  ZazaConnectBridgeGenerationDisposition,
  ZazaConnectBridgeStorageDiagnostics,
  ZazaConnectExportPayload,
} from "@/lib/zaza-connect-bridge";

const BRIDGE_EXPORT_EXPECTED_CADENCE_HOURS = 6;
const BRIDGE_EXPORT_STALE_HOURS = 12;

export interface ConnectBridgeHealthAlert {
  code: string;
  severity: "warning" | "critical";
  message: string;
}

function createAlert(
  code: string,
  severity: ConnectBridgeHealthAlert["severity"],
  message: string,
) {
  return { code, severity, message } satisfies ConnectBridgeHealthAlert;
}

function getExportDiff(
  latestExport: ZazaConnectExportPayload | null,
  previousExport: ZazaConnectExportPayload | null,
) {
  if (!latestExport || !previousExport) {
    return null;
  }

  return {
    previousExportId: previousExport.exportId,
    previousGeneratedAt: previousExport.generatedAt,
    contentFingerprintChanged:
      latestExport.contentFingerprint !== previousExport.contentFingerprint,
    connectOpportunityDelta:
      latestExport.metrics.connectOpportunityCount -
      previousExport.metrics.connectOpportunityCount,
    strongCandidateDelta:
      latestExport.strongContentCandidates.length -
      previousExport.strongContentCandidates.length,
    missingProofPointsDelta:
      latestExport.metrics.missingProofPointsCount -
      previousExport.metrics.missingProofPointsCount,
    missingSourceSignalIdsDelta:
      latestExport.metrics.missingSourceSignalIdsCount -
      previousExport.metrics.missingSourceSignalIdsCount,
    missingTeacherLanguageDelta:
      latestExport.metrics.missingTeacherLanguageCount -
      previousExport.metrics.missingTeacherLanguageCount,
  };
}

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
    lastDisposition: ZazaConnectBridgeGenerationDisposition | null;
    lastReplacedExportId: string | null;
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
    diffFromPrevious: {
      previousExportId: string;
      previousGeneratedAt: string;
      contentFingerprintChanged: boolean;
      connectOpportunityDelta: number;
      strongCandidateDelta: number;
      missingProofPointsDelta: number;
      missingSourceSignalIdsDelta: number;
      missingTeacherLanguageDelta: number;
    } | null;
  };
  alerts: ConnectBridgeHealthAlert[];
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
  const recentExports = input.exportHistory.slice(0, 5).map((item) => ({
    exportId: item.exportId,
    generatedAt: item.generatedAt,
    connectOpportunityCount: item.metrics.connectOpportunityCount,
    strongCandidateCount: item.strongContentCandidates.length,
    contentFingerprint: item.contentFingerprint,
  }));
  const previousExport =
    input.exportHistory.find((item) => item.exportId !== input.latestExport?.exportId) ?? null;
  const lastNonEmptyExport =
    input.exportHistory.find((item) => item.metrics.connectOpportunityCount > 0) ?? null;
  const diffFromPrevious = getExportDiff(input.latestExport, previousExport);
  const alerts: ConnectBridgeHealthAlert[] = [];

  if (!input.storage.blobConfigured) {
    alerts.push(
      createAlert(
        "bridge_blob_unconfigured",
        "warning",
        "BLOB_READ_WRITE_TOKEN is missing. Bridge exports are not durable across instances.",
      ),
    );
  }
  if (!cronSecretConfigured) {
    alerts.push(
      createAlert(
        "bridge_cron_secret_missing",
        "warning",
        "CRON_SECRET is missing. Scheduled bridge export refreshes are not secured or may fail.",
      ),
    );
  }
  if (!input.latestExport) {
    alerts.push(
      createAlert(
        "bridge_export_missing",
        "critical",
        "No persisted bridge export exists yet.",
      ),
    );
  } else {
    if (stale) {
      alerts.push(
        createAlert(
          "bridge_export_stale",
          "critical",
          `Latest bridge export is stale (${ageHours}h old).`,
        ),
      );
    }
    if (strongCandidateCount === 0) {
      alerts.push(
        createAlert(
          "bridge_strong_candidates_empty",
          "warning",
          "Latest bridge export contains zero strong content candidates.",
        ),
      );
    }
    if (connectOpportunityCount === 0) {
      alerts.push(
        createAlert(
          "bridge_opportunities_empty",
          "warning",
          "Bridge opportunities payload is empty for Connect.",
        ),
      );
    }
    if (connectOpportunityCount === 0 && lastNonEmptyExport && lastNonEmptyExport.exportId !== input.latestExport.exportId) {
      alerts.push(
        createAlert(
          "bridge_regressed_to_empty",
          "critical",
          `Latest bridge export is empty after prior populated export ${lastNonEmptyExport.exportId} from ${lastNonEmptyExport.generatedAt}.`,
        ),
      );
    }
  }

  if (input.generationStatus.lastAttemptOutcome === "failed" && input.generationStatus.lastFailedError) {
    alerts.push(
      createAlert(
        "bridge_generation_failed",
        "critical",
        `Last bridge export attempt failed: ${input.generationStatus.lastFailedError}`,
      ),
    );
  }
  if (input.generationStatus.consecutiveFailureCount > 0) {
    alerts.push(
      createAlert(
        "bridge_generation_repeated_failures",
        "critical",
        `Bridge export has ${input.generationStatus.consecutiveFailureCount} consecutive failure${input.generationStatus.consecutiveFailureCount === 1 ? "" : "s"}.`,
      ),
    );
  }
  const warnings = alerts.map((alert) => alert.message);

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
      lastDisposition: input.generationStatus.lastDisposition ?? null,
      lastReplacedExportId: input.generationStatus.lastReplacedExportId ?? null,
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
      diffFromPrevious,
    },
    alerts,
    warnings,
  } satisfies ConnectBridgeHealthSnapshot;
}
