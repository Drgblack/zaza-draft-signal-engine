import { VideoFactoryRetryableError } from "../video-factory-retry";

export type VideoFactoryProviderMode = "auto" | "mock" | "real";

const DEFAULT_RUNWAY_POLL_INTERVAL_MS = 5000;
const DEFAULT_RUNWAY_MAX_POLLS = 24;
const DEFAULT_ASSEMBLYAI_POLL_INTERVAL_MS = 3000;
const DEFAULT_ASSEMBLYAI_MAX_POLLS = 30;
const DEFAULT_FFMPEG_THUMBNAIL_TIMESTAMP_SEC = 0.5;

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function getVideoFactoryProviderMode(): VideoFactoryProviderMode {
  const raw = process.env.VIDEO_FACTORY_PROVIDER_MODE?.trim().toLowerCase();

  if (raw === "mock" || raw === "real") {
    return raw;
  }

  return "auto";
}

export function shouldUseRealProvider(requiredEnvNames: string[]): boolean {
  const mode = getVideoFactoryProviderMode();

  if (mode === "mock") {
    return false;
  }

  const configured = requiredEnvNames.every((name) => Boolean(envValue(name)));
  if (mode === "real" && !configured) {
    throw new VideoFactoryRetryableError(
      `Provider mode is set to real, but required provider credentials are missing: ${requiredEnvNames.join(", ")}.`,
      { retryable: false },
    );
  }

  return configured;
}

export function providerHttpError(input: {
  provider: string;
  status: number;
  message: string;
}): VideoFactoryRetryableError {
  const retryable = input.status === 429 || input.status >= 500;

  return new VideoFactoryRetryableError(
    `${input.provider} request failed (${input.status}): ${input.message}`,
    { retryable },
  );
}

export function providerConfigError(
  provider: string,
  message: string,
): VideoFactoryRetryableError {
  return new VideoFactoryRetryableError(`${provider} configuration error: ${message}`, {
    retryable: false,
  });
}

export async function sleep(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function parseJsonResponse<T>(
  response: Response,
): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  return JSON.parse(text) as T;
}

export function runwayBaseUrl() {
  return envValue("RUNWAY_BASE_URL") ?? "https://api.dev.runwayml.com";
}

export function runwayApiVersion() {
  return envValue("RUNWAY_API_VERSION") ?? "2024-11-06";
}

export function runwayModelId() {
  return envValue("RUNWAY_IMAGE_TO_VIDEO_MODEL") ?? "gen4.5";
}

export function runwayPollIntervalMs() {
  return Number(envValue("RUNWAY_POLL_INTERVAL_MS") ?? DEFAULT_RUNWAY_POLL_INTERVAL_MS);
}

export function runwayMaxPolls() {
  return Number(envValue("RUNWAY_MAX_POLLS") ?? DEFAULT_RUNWAY_MAX_POLLS);
}

export function assemblyAiBaseUrl() {
  return envValue("ASSEMBLYAI_BASE_URL") ?? "https://api.assemblyai.com";
}

export function assemblyAiPollIntervalMs() {
  return Number(
    envValue("ASSEMBLYAI_POLL_INTERVAL_MS") ?? DEFAULT_ASSEMBLYAI_POLL_INTERVAL_MS,
  );
}

export function assemblyAiMaxPolls() {
  return Number(envValue("ASSEMBLYAI_MAX_POLLS") ?? DEFAULT_ASSEMBLYAI_MAX_POLLS);
}

export function elevenLabsBaseUrl() {
  return envValue("ELEVENLABS_BASE_URL") ?? "https://api.elevenlabs.io";
}

export function elevenLabsModelId() {
  return envValue("ELEVENLABS_MODEL_ID") ?? "eleven_multilingual_v2";
}

export function ffmpegBinaryPath() {
  return envValue("FFMPEG_PATH") ?? "ffmpeg";
}

export function ffprobeBinaryPath() {
  return envValue("FFPROBE_PATH") ?? "ffprobe";
}

export function ffmpegThumbnailTimestampSec() {
  return Number(
    envValue("VIDEO_FACTORY_FFMPEG_THUMBNAIL_TIMESTAMP_SEC") ??
      DEFAULT_FFMPEG_THUMBNAIL_TIMESTAMP_SEC,
  );
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
