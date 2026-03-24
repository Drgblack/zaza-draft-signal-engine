import { z } from "zod";

export const VIDEO_FACTORY_QUEUE_ENGINES = [
  "local-file",
  "inngest-compatible",
] as const;

export const VIDEO_FACTORY_QUEUE_JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;

export const videoFactoryQueueJobSchema = z.object({
  queueJobId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  batchId: z.string().trim().nullable().default(null),
  factoryJobId: z.string().trim().nullable().default(null),
  renderJobId: z.string().trim().nullable().default(null),
  engine: z.enum(VIDEO_FACTORY_QUEUE_ENGINES).default("local-file"),
  status: z.enum(VIDEO_FACTORY_QUEUE_JOB_STATUSES),
  priority: z.enum(["normal", "high"]).default("normal"),
  throttleGroup: z.string().trim().min(1).default("video-factory"),
  concurrencyLimit: z.number().int().positive().default(3),
  eventName: z.string().trim().nullable().default(null),
  externalDispatchUrl: z.string().trim().nullable().default(null),
  externalDispatchedAt: z.string().trim().nullable().default(null),
  scheduledAt: z.string().trim().min(1),
  startedAt: z.string().trim().nullable().default(null),
  completedAt: z.string().trim().nullable().default(null),
  errorMessage: z.string().trim().nullable().default(null),
});

export type VideoFactoryQueueJob = z.infer<typeof videoFactoryQueueJobSchema>;
export type VideoFactoryQueueEngine = (typeof VIDEO_FACTORY_QUEUE_ENGINES)[number];

export function buildVideoFactoryQueueJobId(input: {
  opportunityId: string;
  factoryJobId: string | null;
  renderJobId: string | null;
}) {
  return `video-factory-queue:${input.factoryJobId ?? input.renderJobId ?? input.opportunityId}`;
}

export function resolveVideoFactoryQueueEngine(): VideoFactoryQueueEngine {
  const configured =
    process.env.VIDEO_FACTORY_QUEUE_ENGINE?.trim().toLowerCase() ?? "";

  if (configured === "inngest" || configured === "inngest-compatible") {
    return "inngest-compatible";
  }

  return "local-file";
}

export function getInngestCompatibleWebhookUrl(): string | null {
  const url = process.env.VIDEO_FACTORY_INNGEST_WEBHOOK_URL?.trim() ?? "";
  return url.length > 0 ? url : null;
}

export function buildInngestCompatibleEventPayload(input: {
  queueJob: Pick<
    VideoFactoryQueueJob,
    "queueJobId" | "opportunityId" | "batchId" | "factoryJobId" | "renderJobId"
  >;
}) {
  return {
    name: "video-factory/run.requested",
    data: {
      queueJobId: input.queueJob.queueJobId,
      opportunityId: input.queueJob.opportunityId,
      batchId: input.queueJob.batchId,
      factoryJobId: input.queueJob.factoryJobId,
      renderJobId: input.queueJob.renderJobId,
    },
  };
}
