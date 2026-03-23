import { z } from "zod";

import { VideoFactoryRetryableError } from "./video-factory-retry";

export const VIDEO_FACTORY_PROVIDER_ERROR_CATEGORIES = [
  "provider_error",
  "timeout",
  "invalid_response",
  "quota/rate_limit",
  "unknown_failure",
] as const;

export const videoFactoryProviderErrorCategorySchema = z.enum(
  VIDEO_FACTORY_PROVIDER_ERROR_CATEGORIES,
);

export const videoFactoryProviderFailureSummarySchema = z.object({
  provider: z.string().trim().min(1),
  stage: z.string().trim().min(1),
  category: videoFactoryProviderErrorCategorySchema,
  retryable: z.boolean(),
  operatorSummary: z.string().trim().min(1),
  rawMessage: z.string().trim().min(1),
});

export type VideoFactoryProviderErrorCategory = z.infer<
  typeof videoFactoryProviderErrorCategorySchema
>;
export type VideoFactoryProviderFailureSummary = z.infer<
  typeof videoFactoryProviderFailureSummarySchema
>;

function stageLabel(stage: string) {
  return stage.replace(/_/g, " ");
}

function providerLabel(provider: string) {
  return provider.trim();
}

function operatorSummary(input: {
  provider: string;
  stage: string;
  category: VideoFactoryProviderErrorCategory;
  rawMessage: string;
}) {
  const prefix = `${providerLabel(input.provider)} ${stageLabel(input.stage)} failed`;

  switch (input.category) {
    case "provider_error":
      return `${prefix}: the provider returned an execution error.`;
    case "quota/rate_limit":
      return `${prefix}: upstream rate limit was hit.`;
    case "timeout":
      return `${prefix}: the provider timed out before returning a result.`;
    case "invalid_response":
      return `${prefix}: the provider returned an invalid or incomplete response.`;
    case "unknown_failure":
    default:
      return `${prefix}: ${input.rawMessage}`;
  }
}

export class VideoFactoryProviderError extends VideoFactoryRetryableError {
  readonly provider: string;
  readonly stage: string;
  readonly category: VideoFactoryProviderErrorCategory;
  readonly operatorSummary: string;

  constructor(input: {
    provider: string;
    stage: string;
    category: VideoFactoryProviderErrorCategory;
    message: string;
    retryable: boolean;
    details?: unknown;
    cause?: unknown;
  }) {
    super(input.message, {
      retryable: input.retryable,
      details: input.details,
      cause: input.cause,
    });
    this.name = "VideoFactoryProviderError";
    this.provider = input.provider;
    this.stage = input.stage;
    this.category = input.category;
    this.operatorSummary = operatorSummary({
      provider: input.provider,
      stage: input.stage,
      category: input.category,
      rawMessage: input.message,
    });
  }
}

export function createVideoFactoryProviderError(input: {
  provider: string;
  stage: string;
  category: VideoFactoryProviderErrorCategory;
  message: string;
  retryable: boolean;
  details?: unknown;
  cause?: unknown;
}) {
  return new VideoFactoryProviderError(input);
}

export function summarizeVideoFactoryProviderFailure(
  error: unknown,
  fallback?: {
    provider?: string | null;
    stage?: string | null;
  },
): VideoFactoryProviderFailureSummary {
  if (error instanceof VideoFactoryProviderError) {
    return videoFactoryProviderFailureSummarySchema.parse({
      provider: error.provider,
      stage: error.stage,
      category: error.category,
      retryable: error.retryable,
      operatorSummary: error.operatorSummary,
      rawMessage: error.message,
    });
  }

  return videoFactoryProviderFailureSummarySchema.parse({
    provider: fallback?.provider?.trim() || "factory",
    stage: fallback?.stage?.trim() || "execution",
    category: "unknown_failure",
    retryable:
      error instanceof VideoFactoryRetryableError ? error.retryable : false,
    operatorSummary:
      error instanceof Error ? error.message : "Factory execution failed.",
    rawMessage:
      error instanceof Error ? error.message : "Factory execution failed.",
  });
}
