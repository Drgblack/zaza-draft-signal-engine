import { VideoFactoryRetryableError } from "../video-factory-retry";
import {
  createVideoFactoryProviderError,
} from "../video-factory-provider-errors";

export type VideoFactoryProviderMode = "auto" | "mock" | "real";

const DEFAULT_RUNWAY_POLL_INTERVAL_MS = 5000;
const DEFAULT_RUNWAY_MAX_POLLS = 24;
const DEFAULT_ASSEMBLYAI_POLL_INTERVAL_MS = 3000;
const DEFAULT_ASSEMBLYAI_MAX_POLLS = 30;
const DEFAULT_FFMPEG_THUMBNAIL_TIMESTAMP_SEC = 0.5;
const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 45000;
const DEFAULT_FFMPEG_EXECUTION_TIMEOUT_MS = 180000;

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function isVideoFactoryProductionEnvironment(): boolean {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() ?? "";
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase() ?? "";

  return nodeEnv === "production" || vercelEnv === "production";
}

export function getVideoFactoryProviderMode(): VideoFactoryProviderMode {
  const raw = process.env.VIDEO_FACTORY_PROVIDER_MODE?.trim().toLowerCase();

  if (raw === "mock" || raw === "real") {
    return raw;
  }

  return "auto";
}

export function shouldAllowMockProviderExecution(input: {
  provider: string;
  stage: string;
}): boolean {
  const mode = getVideoFactoryProviderMode();

  if (mode !== "mock") {
    return false;
  }

  if (isVideoFactoryProductionEnvironment()) {
    throw providerConfigError(
      input.provider,
      "VIDEO_FACTORY_PROVIDER_MODE=mock is not allowed in production.",
      input.stage,
    );
  }

  return true;
}

export function shouldUseRealProvider(input: {
  provider: string;
  stage: string;
  requiredEnvNames: string[];
}): boolean {
  if (shouldAllowMockProviderExecution({
    provider: input.provider,
    stage: input.stage,
  })) {
    return false;
  }

  const configured = input.requiredEnvNames.every((name) => Boolean(envValue(name)));
  if (!configured) {
    throw providerConfigError(
      input.provider,
      `Real provider execution requires configured credentials: ${input.requiredEnvNames.join(", ")}. Set VIDEO_FACTORY_PROVIDER_MODE=mock only in non-production dev/test when you intentionally want mock execution.`,
      input.stage,
    );
  }

  return true;
}

export function providerHttpError(input: {
  provider: string;
  stage: string;
  status: number;
  message: string;
}): VideoFactoryRetryableError {
  const retryable = input.status === 429 || input.status >= 500 || input.status === 408;
  const category =
    input.status === 401 || input.status === 403
      ? "authentication"
      : input.status === 404
        ? "not_found"
        : input.status === 408
          ? "timeout"
          : input.status === 429
            ? "rate_limit"
            : input.status >= 500
              ? "upstream"
              : "invalid_request";

  return createVideoFactoryProviderError({
    provider: input.provider,
    stage: input.stage,
    category:
      category === "timeout"
        ? "timeout"
        : category === "rate_limit"
          ? "quota/rate_limit"
          : category === "invalid_request" || category === "not_found"
            ? "invalid_response"
            : "provider_error",
    message: `${input.provider} request failed (${input.status}): ${input.message}`,
    retryable,
    details: {
      status: input.status,
      message: input.message,
    },
  });
}

export function providerConfigError(
  provider: string,
  message: string,
  stage = "configuration",
): VideoFactoryRetryableError {
  return createVideoFactoryProviderError({
    provider,
    stage,
    category: "provider_error",
    message: `${provider} configuration error: ${message}`,
    retryable: false,
  });
}

export function providerTimeoutError(input: {
  provider: string;
  stage: string;
  timeoutMs: number;
}): VideoFactoryRetryableError {
  return createVideoFactoryProviderError({
    provider: input.provider,
    stage: input.stage,
    category: "timeout",
    message: `${input.provider} timed out after ${input.timeoutMs}ms.`,
    retryable: true,
    details: {
      timeoutMs: input.timeoutMs,
    },
  });
}

export function providerNetworkError(input: {
  provider: string;
  stage: string;
  error: unknown;
}): VideoFactoryRetryableError {
  return createVideoFactoryProviderError({
    provider: input.provider,
    stage: input.stage,
    category: "provider_error",
    message:
      input.error instanceof Error
        ? input.error.message
        : `${input.provider} network request failed.`,
    retryable: true,
    cause: input.error,
  });
}

export function providerRuntimeError(input: {
  provider: string;
  stage: string;
  message: string;
  category?: "provider_error" | "invalid_response" | "unknown_failure";
  retryable?: boolean;
  cause?: unknown;
}): VideoFactoryRetryableError {
  return createVideoFactoryProviderError({
    provider: input.provider,
    stage: input.stage,
    category: input.category ?? "provider_error",
    message: input.message,
    retryable: input.retryable ?? false,
    cause: input.cause,
  });
}

export function providerInvalidResponseError(input: {
  provider: string;
  stage: string;
  message: string;
  retryable?: boolean;
  cause?: unknown;
}): VideoFactoryRetryableError {
  return createVideoFactoryProviderError({
    provider: input.provider,
    stage: input.stage,
    category: "invalid_response",
    message: input.message,
    retryable: input.retryable ?? false,
    cause: input.cause,
  });
}

export function providerPolicyError(input: {
  provider: string;
  stage: string;
  message: string;
}): VideoFactoryRetryableError {
  return createVideoFactoryProviderError({
    provider: input.provider,
    stage: input.stage,
    category: "provider_error",
    message: input.message,
    retryable: false,
  });
}

export function providerRequestTimeoutMs(providerEnvPrefix: string) {
  return Number(
    envValue(`${providerEnvPrefix}_REQUEST_TIMEOUT_MS`) ??
      DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  );
}

export function ffmpegExecutionTimeoutMs() {
  return Number(
    envValue("VIDEO_FACTORY_FFMPEG_TIMEOUT_MS") ??
      DEFAULT_FFMPEG_EXECUTION_TIMEOUT_MS,
  );
}

export async function fetchWithProviderTimeout(input: {
  provider: string;
  stage: string;
  url: string;
  timeoutMs: number;
  init?: RequestInit;
}): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    return await fetch(input.url, {
      ...input.init,
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message))
    ) {
      throw providerTimeoutError({
        provider: input.provider,
        stage: input.stage,
        timeoutMs: input.timeoutMs,
      });
    }

    throw providerNetworkError({
      provider: input.provider,
      stage: input.stage,
      error,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
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

export async function parseProviderJsonResponse<T>(input: {
  provider: string;
  stage: string;
  response: Response;
}): Promise<T | null> {
  const text = await input.response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw providerInvalidResponseError({
      provider: input.provider,
      stage: input.stage,
      message: `${input.provider} returned malformed JSON.`,
      retryable: false,
      cause: error,
    });
  }
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
