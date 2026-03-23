import { spawnSync } from "node:child_process";

import { z } from "zod";

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

export type VideoFactoryHealthStatus = z.infer<typeof videoFactoryHealthStatusSchema>;
export type VideoFactoryDiagnosticCheck = z.infer<typeof videoFactoryDiagnosticCheckSchema>;
export type VideoFactoryDiagnostics = z.infer<typeof videoFactoryDiagnosticsSchema>;

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
