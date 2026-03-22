import { z } from "zod";

const VIDEO_FACTORY_RENDER_PROVIDERS = ["mock", "runway", "capcut", "custom"] as const;

export const VIDEO_FACTORY_STATUSES = [
  "draft",
  "queued",
  "preparing",
  "generating_narration",
  "generating_visuals",
  "generating_captions",
  "composing",
  "generated",
  "review_pending",
  "accepted",
  "rejected",
  "discarded",
  "failed",
] as const;

export type VideoFactoryStatus = (typeof VIDEO_FACTORY_STATUSES)[number];

export const videoFactoryLifecycleSchema = z.object({
  factoryJobId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  provider: z.enum(VIDEO_FACTORY_RENDER_PROVIDERS).nullable().default(null),
  renderVersion: z.string().trim().nullable().default(null),
  status: z.enum(VIDEO_FACTORY_STATUSES),
  draftAt: z.string().trim().nullable().default(null),
  queuedAt: z.string().trim().nullable().default(null),
  preparingAt: z.string().trim().nullable().default(null),
  generatingNarrationAt: z.string().trim().nullable().default(null),
  generatingVisualsAt: z.string().trim().nullable().default(null),
  generatingCaptionsAt: z.string().trim().nullable().default(null),
  composingAt: z.string().trim().nullable().default(null),
  generatedAt: z.string().trim().nullable().default(null),
  reviewPendingAt: z.string().trim().nullable().default(null),
  acceptedAt: z.string().trim().nullable().default(null),
  rejectedAt: z.string().trim().nullable().default(null),
  discardedAt: z.string().trim().nullable().default(null),
  failedAt: z.string().trim().nullable().default(null),
  lastUpdatedAt: z.string().trim().min(1),
  failureStage: z.enum(VIDEO_FACTORY_STATUSES).nullable().default(null),
  failureMessage: z.string().trim().nullable().default(null),
});

export type VideoFactoryLifecycle = z.infer<typeof videoFactoryLifecycleSchema>;

function factoryJobId(videoBriefId: string, renderVersion?: string | null): string {
  return `${videoBriefId}:factory-job:${renderVersion ?? "draft"}`;
}

function timestampFieldForStatus(status: VideoFactoryStatus): keyof VideoFactoryLifecycle {
  switch (status) {
    case "draft":
      return "draftAt";
    case "queued":
      return "queuedAt";
    case "preparing":
      return "preparingAt";
    case "generating_narration":
      return "generatingNarrationAt";
    case "generating_visuals":
      return "generatingVisualsAt";
    case "generating_captions":
      return "generatingCaptionsAt";
    case "composing":
      return "composingAt";
    case "generated":
      return "generatedAt";
    case "review_pending":
      return "reviewPendingAt";
    case "accepted":
      return "acceptedAt";
    case "rejected":
      return "rejectedAt";
    case "discarded":
      return "discardedAt";
    case "failed":
      return "failedAt";
  }
}

function canTransition(from: VideoFactoryStatus, to: VideoFactoryStatus): boolean {
  if (from === to) {
    return true;
  }

  switch (from) {
    case "draft":
      return to === "queued";
    case "queued":
      return to === "preparing" || to === "failed";
    case "preparing":
      return to === "generating_narration" || to === "failed";
    case "generating_narration":
      return to === "generating_visuals" || to === "failed";
    case "generating_visuals":
      return to === "generating_captions" || to === "failed";
    case "generating_captions":
      return to === "composing" || to === "failed";
    case "composing":
      return to === "generated" || to === "failed";
    case "generated":
      return to === "review_pending" || to === "failed";
    case "review_pending":
      return to === "accepted" || to === "rejected" || to === "discarded" || to === "failed";
    case "accepted":
    case "rejected":
    case "discarded":
    case "failed":
      return false;
  }
}

export function createDraftVideoFactoryLifecycle(input: {
  videoBriefId: string;
  createdAt: string;
}): VideoFactoryLifecycle {
  return videoFactoryLifecycleSchema.parse({
    factoryJobId: factoryJobId(input.videoBriefId, null),
    videoBriefId: input.videoBriefId,
    provider: null,
    renderVersion: null,
    status: "draft",
    draftAt: input.createdAt,
    lastUpdatedAt: input.createdAt,
    failureStage: null,
    failureMessage: null,
  });
}

export function transitionVideoFactoryLifecycle(
  lifecycle: VideoFactoryLifecycle,
  nextStatus: VideoFactoryStatus,
    input: {
    timestamp: string;
    provider?: (typeof VIDEO_FACTORY_RENDER_PROVIDERS)[number] | null;
    renderVersion?: string | null;
    failureStage?: VideoFactoryStatus | null;
    failureMessage?: string | null;
  },
): VideoFactoryLifecycle {
  if (!canTransition(lifecycle.status, nextStatus)) {
    throw new Error(
      `Cannot transition video factory lifecycle from "${lifecycle.status}" to "${nextStatus}".`,
    );
  }

  const timestampField = timestampFieldForStatus(nextStatus);
  const nextLifecycle: VideoFactoryLifecycle = {
    ...lifecycle,
    factoryJobId: factoryJobId(
      lifecycle.videoBriefId,
      input.renderVersion ?? lifecycle.renderVersion ?? null,
    ),
    provider:
      input.provider === undefined ? lifecycle.provider : input.provider ?? null,
    renderVersion:
      input.renderVersion === undefined
        ? lifecycle.renderVersion
        : input.renderVersion ?? null,
    status: nextStatus,
    lastUpdatedAt: input.timestamp,
    failureStage: nextStatus === "failed" ? input.failureStage ?? lifecycle.status : null,
    failureMessage: nextStatus === "failed" ? input.failureMessage ?? null : null,
    [timestampField]:
      lifecycle[timestampField] ?? input.timestamp,
  };

  return videoFactoryLifecycleSchema.parse(nextLifecycle);
}
