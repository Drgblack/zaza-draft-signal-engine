import { z } from "zod";

export const VIDEO_FACTORY_RETRY_FAILURE_MODES = [
  "none",
  "retryable",
  "non_retryable",
] as const;

export const DEFAULT_VIDEO_FACTORY_MAX_RETRIES = 2;
export const DEFAULT_VIDEO_FACTORY_BASE_DELAY_MS = 3000;

export const videoFactoryRetryStateSchema = z.object({
  retryCount: z.number().int().min(0).default(0),
  maxRetries: z.number().int().min(0).default(DEFAULT_VIDEO_FACTORY_MAX_RETRIES),
  backoffDelayMs: z.number().int().min(0).nullable().default(null),
  nextRetryAt: z.string().trim().nullable().default(null),
  lastFailureAt: z.string().trim().nullable().default(null),
  retryStage: z.string().trim().nullable().default(null),
  failureMode: z.enum(VIDEO_FACTORY_RETRY_FAILURE_MODES).default("none"),
  exhausted: z.boolean().default(false),
});

export type VideoFactoryRetryFailureMode =
  (typeof VIDEO_FACTORY_RETRY_FAILURE_MODES)[number];
export type VideoFactoryRetryState = z.infer<typeof videoFactoryRetryStateSchema>;

export class VideoFactoryRetryableError extends Error {
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(
    message: string,
    options?: {
      retryable?: boolean;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "VideoFactoryRetryableError";
    this.retryable = options?.retryable ?? true;
    this.details = options?.details;

    if (options?.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: options.cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

export class VideoFactoryRetryExecutionError extends Error {
  readonly retryState: VideoFactoryRetryState;
  readonly details: unknown;

  constructor(
    message: string,
    options: {
      retryState: VideoFactoryRetryState;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "VideoFactoryRetryExecutionError";
    this.retryState = options.retryState;
    this.details = options.details;

    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: options.cause,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMs(timestamp: string, delayMs: number): string {
  return new Date(new Date(timestamp).getTime() + delayMs).toISOString();
}

async function defaultSleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function retryableFailureMode(error: unknown): VideoFactoryRetryFailureMode {
  if (error instanceof VideoFactoryRetryableError) {
    return error.retryable ? "retryable" : "non_retryable";
  }

  return "retryable";
}

function executionErrorDetails(error: unknown): unknown {
  if (error instanceof VideoFactoryRetryableError) {
    return error.details;
  }

  if (error instanceof VideoFactoryRetryExecutionError) {
    return error.details;
  }

  return null;
}

export function calculateRetryBackoffDelay(
  retryCount: number,
  baseDelayMs = DEFAULT_VIDEO_FACTORY_BASE_DELAY_MS,
): number {
  return baseDelayMs * Math.pow(2, Math.max(0, retryCount - 1));
}

export async function executeWithRetry<T>(input: {
  step: () => Promise<T> | T;
  stage?: string | null;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => string;
  isRetryableFailure?: (error: unknown) => boolean;
}): Promise<{
  value: T;
  retryState: VideoFactoryRetryState;
}> {
  const maxRetries = input.maxRetries ?? DEFAULT_VIDEO_FACTORY_MAX_RETRIES;
  const baseDelayMs = input.baseDelayMs ?? DEFAULT_VIDEO_FACTORY_BASE_DELAY_MS;
  const sleep = input.sleep ?? defaultSleep;
  const getNow = input.now ?? nowIso;
  let retryCount = 0;
  let lastFailureAt: string | null = null;
  let failureMode: VideoFactoryRetryFailureMode = "none";

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const value = await input.step();

      return {
        value,
        retryState: videoFactoryRetryStateSchema.parse({
          retryCount,
          maxRetries,
          backoffDelayMs: null,
          nextRetryAt: null,
          lastFailureAt,
          retryStage: input.stage ?? null,
          failureMode,
          exhausted: false,
        }),
      };
    } catch (error) {
      lastFailureAt = getNow();
      const retryable = input.isRetryableFailure
        ? input.isRetryableFailure(error)
        : retryableFailureMode(error) === "retryable";
      failureMode = retryable ? "retryable" : "non_retryable";

      if (!retryable || attempt === maxRetries) {
        const retryState = videoFactoryRetryStateSchema.parse({
          retryCount,
          maxRetries,
          backoffDelayMs: null,
          nextRetryAt: null,
          lastFailureAt,
          retryStage: input.stage ?? null,
          failureMode,
          exhausted: retryable,
        });

        throw new VideoFactoryRetryExecutionError(
          error instanceof Error
            ? error.message
            : `Factory step "${input.stage ?? "unknown"}" failed.`,
          {
            retryState,
            details: executionErrorDetails(error),
            cause: error,
          },
        );
      }

      retryCount += 1;
      const backoffDelayMs = calculateRetryBackoffDelay(retryCount, baseDelayMs);
      await sleep(backoffDelayMs);
    }
  }

  throw new Error("executeWithRetry reached an unreachable state.");
}

export function summarizeVideoFactoryRetryStates(
  states: Array<VideoFactoryRetryState | null | undefined>,
): VideoFactoryRetryState {
  const parsedStates = states
    .filter((state): state is VideoFactoryRetryState => Boolean(state))
    .map((state) => videoFactoryRetryStateSchema.parse(state));

  if (parsedStates.length === 0) {
    return videoFactoryRetryStateSchema.parse({
      retryCount: 0,
      maxRetries: DEFAULT_VIDEO_FACTORY_MAX_RETRIES,
      backoffDelayMs: null,
      nextRetryAt: null,
      lastFailureAt: null,
      retryStage: null,
      failureMode: "none",
      exhausted: false,
    });
  }

  const latestFailureState = parsedStates
    .filter((state) => typeof state.lastFailureAt === "string")
    .sort(
      (left, right) =>
        new Date(left.lastFailureAt ?? 0).getTime() -
        new Date(right.lastFailureAt ?? 0).getTime(),
    )
    .at(-1);

  return videoFactoryRetryStateSchema.parse({
    retryCount: parsedStates.reduce((sum, state) => sum + state.retryCount, 0),
    maxRetries: Math.max(...parsedStates.map((state) => state.maxRetries)),
    backoffDelayMs: latestFailureState?.backoffDelayMs ?? null,
    nextRetryAt: latestFailureState?.nextRetryAt ?? null,
    lastFailureAt: latestFailureState?.lastFailureAt ?? null,
    retryStage: latestFailureState?.retryStage ?? null,
    failureMode:
      latestFailureState?.failureMode ??
      (parsedStates.some((state) => state.retryCount > 0) ? "retryable" : "none"),
    exhausted: parsedStates.some((state) => state.exhausted),
  });
}

export function buildNextRetryState(input: {
  retryCount: number;
  maxRetries?: number;
  stage?: string | null;
  failureMode?: VideoFactoryRetryFailureMode;
  lastFailureAt?: string | null;
  baseDelayMs?: number;
}): VideoFactoryRetryState {
  const maxRetries = input.maxRetries ?? DEFAULT_VIDEO_FACTORY_MAX_RETRIES;
  const lastFailureAt = input.lastFailureAt ?? nowIso();
  const backoffDelayMs =
    input.retryCount > 0
      ? calculateRetryBackoffDelay(
          input.retryCount,
          input.baseDelayMs ?? DEFAULT_VIDEO_FACTORY_BASE_DELAY_MS,
        )
      : null;

  return videoFactoryRetryStateSchema.parse({
    retryCount: input.retryCount,
    maxRetries,
    backoffDelayMs,
    nextRetryAt:
      backoffDelayMs !== null ? addMs(lastFailureAt, backoffDelayMs) : null,
    lastFailureAt,
    retryStage: input.stage ?? null,
    failureMode: input.failureMode ?? "retryable",
    exhausted: input.retryCount >= maxRetries,
  });
}
