import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const DEFAULT_VIDEO_FACTORY_RUN_QUEUE_PATH = path.join(
  process.cwd(),
  "data",
  "video-factory-run-queue.json",
);

const ACTIVE_QUEUE_JOB_STATUSES = new Set(["queued", "running"]);
const TERMINAL_LIFECYCLE_STATUSES = new Set([
  "review_pending",
  "accepted",
  "rejected",
  "discarded",
  "failed",
  "failed_permanent",
]);

export const VIDEO_FACTORY_QUEUE_ENGINES = [
  "inngest",
  "local-file",
] as const;

export const VIDEO_FACTORY_QUEUE_JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;

export const factoryRenderRequestedEventDataSchema = z.object({
  queueJobId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  batchId: z.string().trim().nullable().default(null),
  factoryJobId: z.string().trim().nullable().default(null),
  renderJobId: z.string().trim().nullable().default(null),
  throttleGroup: z.string().trim().min(1).default("video-factory"),
  concurrencyLimit: z.number().int().positive().default(3),
});

export const videoFactoryQueueJobSchema = z.object({
  queueJobId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  batchId: z.string().trim().nullable().default(null),
  factoryJobId: z.string().trim().nullable().default(null),
  renderJobId: z.string().trim().nullable().default(null),
  engine: z.enum(VIDEO_FACTORY_QUEUE_ENGINES).default("inngest"),
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

const videoFactoryRunQueueStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  jobs: z.array(videoFactoryQueueJobSchema).default([]),
});

export type FactoryRenderRequestedEventData = z.infer<
  typeof factoryRenderRequestedEventDataSchema
>;
export type VideoFactoryQueueJob = z.infer<typeof videoFactoryQueueJobSchema>;
export type VideoFactoryQueueEngine = (typeof VIDEO_FACTORY_QUEUE_ENGINES)[number];

type VideoFactoryRunQueueStore = z.infer<typeof videoFactoryRunQueueStoreSchema>;

type VideoFactoryRunSnapshot = {
  opportunityId: string;
  lifecycleStatus: string | null;
  renderJobStatus: string | null;
  renderJobErrorMessage: string | null;
  runLedger: Array<{
    factoryJobId: string | null;
    renderJobId: string | null;
    terminalOutcome: string | null;
    failureMessage: string | null;
  }>;
};

export interface VideoFactoryRunQueueStateSummary {
  updatedAt: string | null;
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  activeCount: number;
  maxConcurrentRuns: number;
}

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

  if (configured === "local-file") {
    return "local-file";
  }

  return "inngest";
}

export function buildFactoryRenderRequestedEventPayload(input: {
  queueJob: Pick<
    VideoFactoryQueueJob,
    | "queueJobId"
    | "opportunityId"
    | "batchId"
    | "factoryJobId"
    | "renderJobId"
    | "throttleGroup"
    | "concurrencyLimit"
  >;
}) {
  return {
    name: "factory/render.requested",
    data: factoryRenderRequestedEventDataSchema.parse({
      queueJobId: input.queueJob.queueJobId,
      opportunityId: input.queueJob.opportunityId,
      batchId: input.queueJob.batchId,
      factoryJobId: input.queueJob.factoryJobId,
      renderJobId: input.queueJob.renderJobId,
      throttleGroup: input.queueJob.throttleGroup,
      concurrencyLimit: input.queueJob.concurrencyLimit,
    }),
  };
}

export const buildInngestCompatibleEventPayload =
  buildFactoryRenderRequestedEventPayload;

async function readVideoFactoryRunQueueStore(
  queuePath: string = DEFAULT_VIDEO_FACTORY_RUN_QUEUE_PATH,
): Promise<VideoFactoryRunQueueStore> {
  try {
    const raw = await readFile(queuePath, "utf8");
    return videoFactoryRunQueueStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return videoFactoryRunQueueStoreSchema.parse({
        updatedAt: null,
        jobs: [],
      });
    }

    throw error;
  }
}

async function writeVideoFactoryRunQueueStore(
  store: VideoFactoryRunQueueStore,
  queuePath: string = DEFAULT_VIDEO_FACTORY_RUN_QUEUE_PATH,
) {
  await mkdir(path.dirname(queuePath), { recursive: true });
  await writeFile(queuePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function queueJobMatchesIdentity(
  left: VideoFactoryQueueJob,
  right: Pick<
    VideoFactoryQueueJob,
    "queueJobId" | "opportunityId" | "factoryJobId" | "renderJobId"
  >,
) {
  return (
    left.queueJobId === right.queueJobId ||
    (left.factoryJobId !== null &&
      right.factoryJobId !== null &&
      left.factoryJobId === right.factoryJobId) ||
    (left.renderJobId !== null &&
      right.renderJobId !== null &&
      left.renderJobId === right.renderJobId) ||
    (left.opportunityId === right.opportunityId &&
      !left.factoryJobId &&
      !left.renderJobId &&
      !right.factoryJobId &&
      !right.renderJobId)
  );
}

function getSnapshotFromExecutionResult(
  result: unknown,
  opportunityId: string,
): VideoFactoryRunSnapshot | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const opportunities = (result as { opportunities?: unknown }).opportunities;
  if (!Array.isArray(opportunities)) {
    return null;
  }

  const opportunity = opportunities.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { opportunityId?: unknown }).opportunityId === opportunityId,
  ) as
    | {
        opportunityId: string;
        generationState?: {
          factoryLifecycle?: { status?: string | null } | null;
          renderJob?: {
            status?: string | null;
            errorMessage?: string | null;
          } | null;
          runLedger?: Array<{
            factoryJobId?: string | null;
            renderJobId?: string | null;
            terminalOutcome?: string | null;
            failureMessage?: string | null;
          }>;
        } | null;
      }
    | undefined;

  if (!opportunity?.generationState) {
    return null;
  }

  return {
    opportunityId,
    lifecycleStatus: opportunity.generationState.factoryLifecycle?.status ?? null,
    renderJobStatus: opportunity.generationState.renderJob?.status ?? null,
    renderJobErrorMessage:
      opportunity.generationState.renderJob?.errorMessage ?? null,
    runLedger: (opportunity.generationState.runLedger ?? []).map((entry) => ({
      factoryJobId: entry.factoryJobId ?? null,
      renderJobId: entry.renderJobId ?? null,
      terminalOutcome: entry.terminalOutcome ?? null,
      failureMessage: entry.failureMessage ?? null,
    })),
  };
}

async function loadRunSnapshot(
  opportunityId: string,
): Promise<VideoFactoryRunSnapshot | null> {
  const normalizedOpportunityId = opportunityId.trim();
  if (!normalizedOpportunityId) {
    return null;
  }

  const { listContentOpportunityState } = await import("@/lib/content-opportunities");
  const state = await listContentOpportunityState();
  const opportunity = state.opportunities.find(
    (item) => item.opportunityId === normalizedOpportunityId,
  );
  if (!opportunity?.generationState) {
    return null;
  }

  return {
    opportunityId: normalizedOpportunityId,
    lifecycleStatus: opportunity.generationState.factoryLifecycle?.status ?? null,
    renderJobStatus: opportunity.generationState.renderJob?.status ?? null,
    renderJobErrorMessage:
      opportunity.generationState.renderJob?.errorMessage ?? null,
    runLedger: opportunity.generationState.runLedger.map((entry) => ({
      factoryJobId: entry.factoryJobId ?? null,
      renderJobId: entry.renderJobId ?? null,
      terminalOutcome: entry.terminalOutcome ?? null,
      failureMessage: entry.failureMessage ?? null,
    })),
  };
}

function findMatchingRunLedgerEntry(
  snapshot: VideoFactoryRunSnapshot,
  queueJob: VideoFactoryQueueJob,
) {
  for (let index = snapshot.runLedger.length - 1; index >= 0; index -= 1) {
    const entry = snapshot.runLedger[index];
    if (
      (queueJob.factoryJobId && entry.factoryJobId === queueJob.factoryJobId) ||
      (queueJob.renderJobId && entry.renderJobId === queueJob.renderJobId)
    ) {
      return entry;
    }
  }

  return null;
}

export async function listVideoFactoryQueueJobs(options: {
  queuePath?: string;
} = {}): Promise<VideoFactoryQueueJob[]> {
  const store = await readVideoFactoryRunQueueStore(
    options.queuePath?.trim() || DEFAULT_VIDEO_FACTORY_RUN_QUEUE_PATH,
  );
  return store.jobs;
}

export async function getVideoFactoryQueueJob(input: {
  queueJobId: string;
  queuePath?: string;
}): Promise<VideoFactoryQueueJob | null> {
  const store = await readVideoFactoryRunQueueStore(
    input.queuePath?.trim() || DEFAULT_VIDEO_FACTORY_RUN_QUEUE_PATH,
  );

  return (
    store.jobs.find((job) => job.queueJobId === input.queueJobId.trim()) ?? null
  );
}

export async function getVideoFactoryRunQueueStateSummary(
  options: {
    queuePath?: string;
    maxConcurrentRuns?: number;
  } = {},
): Promise<VideoFactoryRunQueueStateSummary> {
  const store = await readVideoFactoryRunQueueStore(
    options.queuePath?.trim() || DEFAULT_VIDEO_FACTORY_RUN_QUEUE_PATH,
  );
  const queuedCount = store.jobs.filter((job) => job.status === "queued").length;
  const runningCount = store.jobs.filter((job) => job.status === "running").length;
  const completedCount = store.jobs.filter(
    (job) => job.status === "completed",
  ).length;
  const failedCount = store.jobs.filter((job) => job.status === "failed").length;

  return {
    updatedAt: store.updatedAt,
    queuedCount,
    runningCount,
    completedCount,
    failedCount,
    activeCount: queuedCount + runningCount,
    maxConcurrentRuns: options.maxConcurrentRuns ?? 3,
  };
}

export async function enqueueVideoFactoryQueueJob(input: {
  queueJob: VideoFactoryQueueJob;
  queuePath?: string;
}) {
  const queuePath =
    input.queuePath?.trim() || DEFAULT_VIDEO_FACTORY_RUN_QUEUE_PATH;
  const store = await readVideoFactoryRunQueueStore(queuePath);
  const hasActiveMatch = store.jobs.some(
    (job) =>
      ACTIVE_QUEUE_JOB_STATUSES.has(job.status) &&
      queueJobMatchesIdentity(job, input.queueJob),
  );

  if (hasActiveMatch) {
    return null;
  }

  const queueJob = videoFactoryQueueJobSchema.parse(input.queueJob);
  await writeVideoFactoryRunQueueStore(
    {
      updatedAt: queueJob.scheduledAt,
      jobs: [...store.jobs, queueJob],
    },
    queuePath,
  );

  return queueJob;
}

export async function updateVideoFactoryQueueJob(input: {
  queueJobId: string;
  queuePath?: string;
  updater: (queueJob: VideoFactoryQueueJob) => VideoFactoryQueueJob;
}) {
  const queuePath =
    input.queuePath?.trim() || DEFAULT_VIDEO_FACTORY_RUN_QUEUE_PATH;
  const store = await readVideoFactoryRunQueueStore(queuePath);
  let updatedJob: VideoFactoryQueueJob | null = null;
  const jobs = store.jobs.map((job) => {
    if (job.queueJobId !== input.queueJobId) {
      return job;
    }

    updatedJob = videoFactoryQueueJobSchema.parse(input.updater(job));
    return updatedJob;
  });

  await writeVideoFactoryRunQueueStore(
    {
      updatedAt: new Date().toISOString(),
      jobs,
    },
    queuePath,
  );

  return updatedJob;
}

export async function markVideoFactoryQueueJobRunning(input: {
  queueJobId: string;
  queuePath?: string;
}) {
  return updateVideoFactoryQueueJob({
    queueJobId: input.queueJobId,
    queuePath: input.queuePath,
    updater: (queueJob) => ({
      ...queueJob,
      status: "running",
      startedAt: queueJob.startedAt ?? new Date().toISOString(),
      completedAt: null,
      errorMessage: null,
    }),
  });
}

export async function markVideoFactoryQueueJobDispatchRecorded(input: {
  queueJobId: string;
  queuePath?: string;
  eventName: string;
  externalDispatchUrl?: string | null;
  externalDispatchedAt?: string;
}) {
  return updateVideoFactoryQueueJob({
    queueJobId: input.queueJobId,
    queuePath: input.queuePath,
    updater: (queueJob) => ({
      ...queueJob,
      eventName: input.eventName,
      externalDispatchUrl: input.externalDispatchUrl ?? "inngest",
      externalDispatchedAt:
        input.externalDispatchedAt ?? new Date().toISOString(),
      errorMessage: null,
    }),
  });
}

export async function markVideoFactoryQueueJobFailed(input: {
  queueJobId: string;
  queuePath?: string;
  errorMessage?: string | null;
}) {
  return updateVideoFactoryQueueJob({
    queueJobId: input.queueJobId,
    queuePath: input.queuePath,
    updater: (queueJob) => ({
      ...queueJob,
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage: input.errorMessage ?? "Factory run failed.",
    }),
  });
}

export async function markVideoFactoryQueueJobCompleted(input: {
  queueJobId: string;
  queuePath?: string;
}) {
  return updateVideoFactoryQueueJob({
    queueJobId: input.queueJobId,
    queuePath: input.queuePath,
    updater: (queueJob) => ({
      ...queueJob,
      status: "completed",
      completedAt: new Date().toISOString(),
      errorMessage: null,
    }),
  });
}

export async function finalizeVideoFactoryQueueJobFromExecution(input: {
  queueJobId: string;
  opportunityId: string;
  executionResult?: unknown;
  queuePath?: string;
}) {
  const queueJob = await getVideoFactoryQueueJob({
    queueJobId: input.queueJobId,
    queuePath: input.queuePath,
  });

  if (!queueJob) {
    return {
      status: "failed" as const,
      errorMessage: "Queue job not found.",
    };
  }

  const snapshot =
    getSnapshotFromExecutionResult(
      input.executionResult,
      input.opportunityId,
    ) ?? (await loadRunSnapshot(input.opportunityId));

  if (!snapshot) {
    await markVideoFactoryQueueJobFailed({
      queueJobId: input.queueJobId,
      queuePath: input.queuePath,
      errorMessage: "Factory run snapshot was unavailable after execution.",
    });
    return {
      status: "failed" as const,
      errorMessage: "Factory run snapshot was unavailable after execution.",
    };
  }

  const matchingEntry = findMatchingRunLedgerEntry(snapshot, queueJob);
  const terminalOutcome = matchingEntry?.terminalOutcome ?? null;

  if (
    terminalOutcome === "failed" ||
    terminalOutcome === "failed_permanent" ||
    snapshot.renderJobStatus === "failed"
  ) {
    const errorMessage =
      matchingEntry?.failureMessage ??
      snapshot.renderJobErrorMessage ??
      "Factory run failed.";
    await markVideoFactoryQueueJobFailed({
      queueJobId: input.queueJobId,
      queuePath: input.queuePath,
      errorMessage,
    });
    return {
      status: "failed" as const,
      errorMessage,
    };
  }

  if (
    terminalOutcome ||
    snapshot.renderJobStatus === "completed" ||
    (snapshot.lifecycleStatus !== null &&
      TERMINAL_LIFECYCLE_STATUSES.has(snapshot.lifecycleStatus))
  ) {
    await markVideoFactoryQueueJobCompleted({
      queueJobId: input.queueJobId,
      queuePath: input.queuePath,
    });
    return {
      status: "completed" as const,
      errorMessage: null,
    };
  }

  await markVideoFactoryQueueJobFailed({
    queueJobId: input.queueJobId,
    queuePath: input.queuePath,
    errorMessage:
      "Factory run returned without reaching a persisted terminal state.",
  });
  return {
    status: "failed" as const,
    errorMessage:
      "Factory run returned without reaching a persisted terminal state.",
  };
}
