import type { RenderJob } from "@/lib/render-jobs";
import type { VideoGenerationRequest } from "@/lib/video-generation";
import type { VideoFactoryLifecycle } from "@/lib/video-factory-state";

export const VIDEO_FACTORY_ACTIVE_STATUSES = [
  "queued",
  "preparing",
  "generating_narration",
  "generating_visuals",
  "generating_captions",
  "composing",
  "generated",
] as const;

export type VideoFactoryGenerationAction = "generate" | "regenerate";

export class VideoFactoryActiveRunError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "VideoFactoryActiveRunError";
  }
}

function normalizeKeyPart(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, "-") || "none";
}

export function buildVideoFactoryIdempotencyKey(input: {
  action: VideoFactoryGenerationAction;
  opportunityId: string;
  videoBriefId: string;
  renderVersion: string;
  provider: string;
  preTriageConcern?: string | null;
  regenerationReason?: string | null;
}) {
  return [
    "video-factory",
    input.action,
    normalizeKeyPart(input.opportunityId),
    normalizeKeyPart(input.videoBriefId),
    normalizeKeyPart(input.renderVersion),
    normalizeKeyPart(input.provider),
    normalizeKeyPart(input.preTriageConcern),
    normalizeKeyPart(input.regenerationReason),
  ].join(":");
}

export function isVideoFactoryLifecycleActive(
  lifecycle: Pick<VideoFactoryLifecycle, "status"> | null | undefined,
) {
  return Boolean(
    lifecycle &&
      VIDEO_FACTORY_ACTIVE_STATUSES.includes(
        lifecycle.status as (typeof VIDEO_FACTORY_ACTIVE_STATUSES)[number],
      ),
  );
}

export function getActiveVideoFactoryIdempotencyKey(input: {
  renderJob?: Pick<RenderJob, "idempotencyKey"> | null;
  generationRequest?: Pick<VideoGenerationRequest, "idempotencyKey"> | null;
}) {
  return input.renderJob?.idempotencyKey ?? input.generationRequest?.idempotencyKey ?? null;
}

export function getActiveVideoFactoryRenderVersion(input: {
  lifecycle?: Pick<VideoFactoryLifecycle, "renderVersion"> | null;
  renderJob?: Pick<RenderJob, "renderVersion"> | null;
}) {
  return input.lifecycle?.renderVersion ?? input.renderJob?.renderVersion ?? null;
}

export function resolveVideoFactoryDuplicateRunDecision(input: {
  requestedAction: VideoFactoryGenerationAction;
  requestedIdempotencyKey: string;
  lifecycle?: Pick<VideoFactoryLifecycle, "status" | "renderVersion"> | null;
  renderJob?: Pick<RenderJob, "idempotencyKey" | "renderVersion"> | null;
  generationRequest?: Pick<VideoGenerationRequest, "idempotencyKey"> | null;
}) {
  if (!isVideoFactoryLifecycleActive(input.lifecycle)) {
    return {
      type: "proceed" as const,
    };
  }

  const activeIdempotencyKey = getActiveVideoFactoryIdempotencyKey({
    renderJob: input.renderJob,
    generationRequest: input.generationRequest,
  });

  if (
    activeIdempotencyKey &&
    activeIdempotencyKey === input.requestedIdempotencyKey
  ) {
    return {
      type: "replay" as const,
      renderVersion: getActiveVideoFactoryRenderVersion({
        lifecycle: input.lifecycle,
        renderJob: input.renderJob,
      }),
    };
  }

  return {
    type: "conflict" as const,
    message:
      input.requestedAction === "regenerate"
        ? "A factory regenerate attempt is already active for this brief. Wait for it to finish before starting another one."
        : "A factory generation attempt is already active for this brief. Wait for it to finish before starting another one.",
  };
}
