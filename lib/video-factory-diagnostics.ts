import { spawnSync } from "node:child_process";

import { z } from "zod";

import { listAuditEvents } from "./audit";
import {
  assemblyAiBaseUrl,
  elevenLabsBaseUrl,
  ffmpegBinaryPath,
  ffprobeBinaryPath,
  getVideoFactoryProviderMode,
  runwayApiVersion,
  runwayBaseUrl,
  type VideoFactoryProviderMode,
} from "./providers/provider-runtime";
import { listContentOpportunityState } from "./content-opportunities";
import { getVideoFactoryRunQueueStateSummary } from "./video-factory-runner";
import {
  getVideoFactoryArtifactBlobAccess,
  isVideoFactoryArtifactBlobEnabled,
} from "./video-factory-artifact-storage";

export const VIDEO_FACTORY_HEALTH_STATUSES = [
  "ready",
  "degraded",
  "unavailable",
] as const;

export const VIDEO_FACTORY_DIAGNOSTIC_KEYS = [
  "elevenlabs",
  "runway",
  "assemblyai",
  "blob",
  "ffmpeg_runtime",
] as const;

export const videoFactoryHealthStatusSchema = z.enum(VIDEO_FACTORY_HEALTH_STATUSES);

export const videoFactoryDiagnosticCheckSchema = z.object({
  key: z.enum(VIDEO_FACTORY_DIAGNOSTIC_KEYS),
  label: z.string().trim().min(1),
  configured: z.boolean(),
  status: videoFactoryHealthStatusSchema,
  messages: z.array(z.string().trim().min(1)).min(1),
});

export const videoFactoryDiagnosticsSchema = z.object({
  providerMode: z.enum(["auto", "mock", "real"]),
  status: videoFactoryHealthStatusSchema,
  checkedAt: z.string().trim().min(1),
  messages: z.array(z.string().trim().min(1)).min(1),
  checks: z.array(videoFactoryDiagnosticCheckSchema).length(5),
});

const videoFactoryQueueHealthSchema = z.object({
  updatedAt: z.string().trim().nullable(),
  queuedCount: z.number().int().nonnegative(),
  runningCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  maxConcurrentRuns: z.number().int().positive(),
});

const videoFactoryAutonomySummarySchema = z.object({
  evaluatedCount: z.number().int().nonnegative(),
  allowedCount: z.number().int().nonnegative(),
  suggestOnlyCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  topBlockedReasons: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        count: z.number().int().positive(),
      }),
    )
    .default([]),
});

const videoFactoryRepairSummarySchema = z.object({
  appliedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  topRepairTypes: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        count: z.number().int().positive(),
      }),
    )
    .default([]),
});

const videoFactoryCostSnapshotSchema = z.object({
  estimatedActiveUsd: z.number().nonnegative(),
  actualLast24hUsd: z.number().nonnegative(),
  averageSuccessfulOutputUsd: z.number().nonnegative().nullable(),
  blockedBudgetCount: z.number().int().nonnegative(),
});

const videoFactoryFailureItemSchema = z.object({
  source: z.enum(["run_ledger", "queue"]),
  opportunityId: z.string().trim().min(1),
  factoryJobId: z.string().trim().nullable(),
  renderJobId: z.string().trim().nullable(),
  stage: z.string().trim().nullable(),
  message: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
});

export const videoFactoryHealthSnapshotSchema = z.object({
  queue: videoFactoryQueueHealthSchema,
  autonomy: videoFactoryAutonomySummarySchema,
  repairs: videoFactoryRepairSummarySchema,
  costs: videoFactoryCostSnapshotSchema,
  failures: z.array(videoFactoryFailureItemSchema),
});

export type VideoFactoryHealthStatus = z.infer<typeof videoFactoryHealthStatusSchema>;
export type VideoFactoryDiagnosticCheck = z.infer<typeof videoFactoryDiagnosticCheckSchema>;
export type VideoFactoryDiagnostics = z.infer<typeof videoFactoryDiagnosticsSchema>;
export type VideoFactoryHealthSnapshot = z.infer<typeof videoFactoryHealthSnapshotSchema>;

type BinaryCheckResult = {
  available: boolean;
  message: string;
};

type EnvReader = (name: string) => string | null;
type BinaryChecker = (command: string) => BinaryCheckResult;

function defaultEnvReader(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function defaultBinaryChecker(command: string): BinaryCheckResult {
  const result = spawnSync(command, ["-version"], {
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });

  if (result.error) {
    return {
      available: false,
      message: result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      available: false,
      message: result.stderr?.trim() || `Exited with code ${result.status}.`,
    };
  }

  const firstLine = result.stdout?.split(/\r?\n/, 1)[0]?.trim();
  return {
    available: true,
    message: firstLine || "Binary executable responded successfully.",
  };
}

function envNamesConfigured(envReader: EnvReader, names: string[]) {
  return names.every((name) => Boolean(envReader(name)));
}

function providerCheck(input: {
  key: "elevenlabs" | "runway" | "assemblyai";
  label: string;
  providerMode: VideoFactoryProviderMode;
  configured: boolean;
  baseMessage: string;
}): VideoFactoryDiagnosticCheck {
  if (input.configured) {
    return videoFactoryDiagnosticCheckSchema.parse({
      key: input.key,
      label: input.label,
      configured: true,
      status: "ready",
      messages: [input.baseMessage],
    });
  }

  return videoFactoryDiagnosticCheckSchema.parse({
    key: input.key,
    label: input.label,
    configured: false,
    status: input.providerMode === "mock" ? "degraded" : "unavailable",
    messages: [
      input.providerMode === "mock"
        ? `${input.label} is intentionally bypassed because explicit mock mode is enabled.`
        : `${input.label} is required for real execution, but credentials are missing. Mock execution is only available when VIDEO_FACTORY_PROVIDER_MODE=mock is set outside production.`,
    ],
  });
}

function deriveOverallStatus(checks: VideoFactoryDiagnosticCheck[]): VideoFactoryHealthStatus {
  if (checks.some((check) => check.status === "unavailable")) {
    return "unavailable";
  }

  if (checks.some((check) => check.status === "degraded")) {
    return "degraded";
  }

  return "ready";
}

function buildOverallMessages(
  status: VideoFactoryHealthStatus,
  providerMode: VideoFactoryProviderMode,
): string[] {
  if (status === "ready") {
    return ["Factory providers, artifact storage, and runtime checks are ready."];
  }

  if (status === "degraded") {
    return [
      providerMode === "mock"
        ? "Factory is running in explicit mock mode outside production. Real provider readiness is intentionally bypassed."
        : "Factory is usable, but one or more providers or storage/runtime checks are not production-ready.",
    ];
  }

  return ["Factory is not ready for real execution. Resolve unavailable provider or runtime checks first."];
}

function countByLabel(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function getVideoFactoryDiagnostics(input?: {
  envReader?: EnvReader;
  binaryChecker?: BinaryChecker;
  providerMode?: VideoFactoryProviderMode;
  checkedAt?: string;
  blobEnabled?: boolean;
}): VideoFactoryDiagnostics {
  const envReader = input?.envReader ?? defaultEnvReader;
  const binaryChecker = input?.binaryChecker ?? defaultBinaryChecker;
  const providerMode = input?.providerMode ?? getVideoFactoryProviderMode();
  const checkedAt = input?.checkedAt ?? new Date().toISOString();

  const elevenLabsConfigured = envNamesConfigured(envReader, ["ELEVENLABS_API_KEY"]);
  const runwayConfigured = envNamesConfigured(envReader, ["RUNWAYML_API_SECRET"]);
  const assemblyAiConfigured = envNamesConfigured(envReader, ["ASSEMBLYAI_API_KEY"]);
  const blobEnabled = input?.blobEnabled ?? isVideoFactoryArtifactBlobEnabled();

  const ffmpegResult = binaryChecker(ffmpegBinaryPath());
  const ffprobeResult = binaryChecker(ffprobeBinaryPath());

  const checks = [
    providerCheck({
      key: "elevenlabs",
      label: "ElevenLabs narration",
      providerMode,
      configured: elevenLabsConfigured,
      baseMessage: `ElevenLabs is configured for ${elevenLabsBaseUrl()}.`,
    }),
    providerCheck({
      key: "runway",
      label: "Runway visuals",
      providerMode,
      configured: runwayConfigured,
      baseMessage: `Runway is configured for ${runwayBaseUrl()} (${runwayApiVersion()}).`,
    }),
    providerCheck({
      key: "assemblyai",
      label: "AssemblyAI captions",
      providerMode,
      configured: assemblyAiConfigured,
      baseMessage: `AssemblyAI is configured for ${assemblyAiBaseUrl()}.`,
    }),
    videoFactoryDiagnosticCheckSchema.parse({
      key: "blob",
      label: "Blob artifact storage",
      configured: blobEnabled,
      status: blobEnabled ? "ready" : providerMode === "real" ? "unavailable" : "degraded",
      messages: [
        blobEnabled
          ? `Blob storage is configured with ${getVideoFactoryArtifactBlobAccess()} access.`
          : providerMode === "real"
            ? "Blob storage is required for durable factory artifacts in real mode, but BLOB_READ_WRITE_TOKEN is missing."
            : "Blob storage is not configured. The factory will fall back to source-backed artifact references.",
      ],
    }),
    videoFactoryDiagnosticCheckSchema.parse({
      key: "ffmpeg_runtime",
      label: "ffmpeg composition runtime",
      configured: ffmpegResult.available && ffprobeResult.available,
      status:
        ffmpegResult.available && ffprobeResult.available
          ? "ready"
          : "unavailable",
      messages:
        ffmpegResult.available && ffprobeResult.available
          ? [
              `ffmpeg available at ${ffmpegBinaryPath()}.`,
              `ffprobe available at ${ffprobeBinaryPath()}.`,
            ]
          : [
              `ffmpeg check: ${ffmpegResult.message}`,
              `ffprobe check: ${ffprobeResult.message}`,
            ],
    }),
  ] as const;

  const status = deriveOverallStatus([...checks]);

  return videoFactoryDiagnosticsSchema.parse({
    providerMode,
    status,
    checkedAt,
    messages: buildOverallMessages(status, providerMode),
    checks,
  });
}

export async function getVideoFactoryHealthSnapshot(options?: {
  failureLimit?: number;
  auditWindowSize?: number;
}): Promise<VideoFactoryHealthSnapshot> {
  const failureLimit = options?.failureLimit ?? 5;
  const auditWindowSize = options?.auditWindowSize ?? 100;
  const [queue, contentState, auditEvents] = await Promise.all([
    getVideoFactoryRunQueueStateSummary(),
    listContentOpportunityState(),
    listAuditEvents(),
  ]);
  const recentAuditEvents = auditEvents.slice(-auditWindowSize);
  const autonomyEvents = recentAuditEvents.filter((event) =>
    event.eventType === "AUTONOMY_POLICY_ALLOWED_ACTION" ||
    event.eventType === "AUTONOMY_POLICY_SUGGESTED_ONLY" ||
    event.eventType === "AUTONOMY_POLICY_BLOCKED_ACTION",
  );
  const repairEvents = recentAuditEvents.filter((event) =>
    event.eventType === "PRE_REVIEW_REPAIR_APPLIED" ||
    event.eventType === "PRE_REVIEW_REPAIR_BLOCKED" ||
    event.eventType === "PRE_REVIEW_REPAIR_SKIPPED",
  );
  const autonomy = {
    evaluatedCount: autonomyEvents.length,
    allowedCount: autonomyEvents.filter((event) => event.eventType === "AUTONOMY_POLICY_ALLOWED_ACTION").length,
    suggestOnlyCount: autonomyEvents.filter((event) => event.eventType === "AUTONOMY_POLICY_SUGGESTED_ONLY").length,
    blockedCount: autonomyEvents.filter((event) => event.eventType === "AUTONOMY_POLICY_BLOCKED_ACTION").length,
    topBlockedReasons: countByLabel(
      autonomyEvents
        .filter((event) => event.eventType === "AUTONOMY_POLICY_BLOCKED_ACTION")
        .map((event) => {
          const reason = event.metadata?.reason;
          return typeof reason === "string" ? reason : event.summary;
        }),
    ).slice(0, 5),
  };
  const repairs = {
    appliedCount: repairEvents.filter((event) => event.eventType === "PRE_REVIEW_REPAIR_APPLIED").length,
    blockedCount: repairEvents.filter((event) => event.eventType === "PRE_REVIEW_REPAIR_BLOCKED").length,
    skippedCount: repairEvents.filter((event) => event.eventType === "PRE_REVIEW_REPAIR_SKIPPED").length,
    topRepairTypes: countByLabel(
      repairEvents
        .filter((event) => event.eventType === "PRE_REVIEW_REPAIR_APPLIED")
        .flatMap((event) => {
          const raw = event.metadata?.repairTypes;
          return typeof raw === "string"
            ? raw.split(",").map((value) => value.trim()).filter(Boolean)
            : [];
        }),
    ).slice(0, 5),
  };

  const now = Date.now();
  const successfulCosts: number[] = [];
  let estimatedActiveUsd = 0;
  let actualLast24hUsd = 0;
  let blockedBudgetCount = 0;
  const failures = contentState.opportunities
    .flatMap((opportunity) =>
      (opportunity.generationState?.runLedger ?? [])
        .filter(
          (entry) =>
            entry.terminalOutcome === "failed" ||
            entry.terminalOutcome === "failed_permanent" ||
            Boolean(entry.failureMessage),
        )
        .map((entry) => ({
          source: "run_ledger" as const,
          opportunityId: opportunity.opportunityId,
          factoryJobId: entry.factoryJobId ?? null,
          renderJobId: entry.renderJobId ?? null,
          stage: entry.failureStage ?? null,
          message: entry.failureMessage ?? "Factory run failed.",
          timestamp: entry.lastUpdatedAt,
        })),
    );

  for (const opportunity of contentState.opportunities) {
    const generationState = opportunity.generationState;
    const lifecycleStatus = generationState?.factoryLifecycle?.status ?? null;
    if (
      lifecycleStatus === "queued" ||
      lifecycleStatus === "preparing" ||
      lifecycleStatus === "generating_narration" ||
      lifecycleStatus === "generating_visuals" ||
      lifecycleStatus === "generating_captions" ||
      lifecycleStatus === "composing" ||
      lifecycleStatus === "retry_queued"
    ) {
      estimatedActiveUsd += generationState?.latestCostEstimate?.estimatedTotalUsd ?? 0;
    }

    if (generationState?.latestBudgetGuard?.status === "blocked") {
      blockedBudgetCount += 1;
    }

    for (const entry of generationState?.runLedger ?? []) {
      const actualCost = entry.actualCost?.actualCostUsd ?? 0;
      const entryTimestamp = new Date(entry.lastUpdatedAt).getTime();
      if (Number.isFinite(entryTimestamp) && now - entryTimestamp <= 24 * 60 * 60 * 1000) {
        actualLast24hUsd += actualCost;
      }

      if (entry.terminalOutcome === "accepted") {
        successfulCosts.push(actualCost || (entry.estimatedCost?.estimatedTotalUsd ?? 0));
      }
    }
  }

  const queueFailures = queue.failedCount === 0
    ? []
    : [{
        source: "queue" as const,
        opportunityId: "queue",
        factoryJobId: null,
        renderJobId: null,
        stage: null,
        message: `${queue.failedCount} queue job${queue.failedCount === 1 ? "" : "s"} failed recently.`,
        timestamp: queue.updatedAt ?? new Date().toISOString(),
      }];

  return videoFactoryHealthSnapshotSchema.parse({
    queue,
    autonomy,
    repairs,
    costs: {
      estimatedActiveUsd: Number(estimatedActiveUsd.toFixed(2)),
      actualLast24hUsd: Number(actualLast24hUsd.toFixed(2)),
      averageSuccessfulOutputUsd:
        successfulCosts.length > 0
          ? Number(
              (
                successfulCosts.reduce((sum, value) => sum + value, 0) /
                successfulCosts.length
              ).toFixed(2),
            )
          : null,
      blockedBudgetCount,
    },
    failures: [...failures, ...queueFailures]
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
      )
      .slice(0, failureLimit),
  });
}
