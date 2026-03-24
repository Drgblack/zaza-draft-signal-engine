import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";
import {
  buildInngestCompatibleEventPayload,
  buildVideoFactoryQueueJobId,
  getInngestCompatibleWebhookUrl,
  resolveVideoFactoryQueueEngine,
  videoFactoryQueueJobSchema,
  type VideoFactoryQueueEngine,
  type VideoFactoryQueueJob,
} from "@/lib/video-factory-queue-engine";

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

export const MAX_CONCURRENT_VIDEO_FACTORY_RUNS = 3;

type VideoFactoryRunExecutor = (input: {
  opportunityId: string;
}) => Promise<unknown>;

type VideoFactoryRunContext = {
  opportunityId: string;
  factoryJobId: string | null;
  renderJobId: string | null;
  queueJobId: string;
};

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

const videoFactoryRunQueueStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  jobs: z.array(videoFactoryQueueJobSchema).default([]),
});

type VideoFactoryRunQueueStore = z.infer<typeof videoFactoryRunQueueStoreSchema>;

export interface VideoFactoryRunQueueStateSummary {
  updatedAt: string | null;
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  activeCount: number;
  maxConcurrentRuns: number;
}

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
  const completedCount = store.jobs.filter((job) => job.status === "completed").length;
  const failedCount = store.jobs.filter((job) => job.status === "failed").length;

  return {
    updatedAt: store.updatedAt,
    queuedCount,
    runningCount,
    completedCount,
    failedCount,
    activeCount: queuedCount + runningCount,
    maxConcurrentRuns: options.maxConcurrentRuns ?? MAX_CONCURRENT_VIDEO_FACTORY_RUNS,
  };
}

export interface VideoFactoryRunSchedulerOptions {
  loadRunSnapshot?: (opportunityId: string) => Promise<VideoFactoryRunSnapshot | null>;
  maxConcurrentRuns?: number;
  queuePath?: string;
  queueEngine?: VideoFactoryQueueEngine;
  resolveRunContext?: (opportunityId: string) => Promise<VideoFactoryRunContext | null>;
}

function buildQueueJobId(input: {
  opportunityId: string;
  factoryJobId: string | null;
  renderJobId: string | null;
}) {
  return buildVideoFactoryQueueJobId(input);
}

async function defaultResolveRunContext(
  opportunityId: string,
): Promise<VideoFactoryRunContext | null> {
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

  const lifecycle = opportunity.generationState.factoryLifecycle;
  const renderJob = opportunity.generationState.renderJob;
  const hasRunnableExecution =
    (lifecycle?.status !== null &&
      lifecycle?.status !== undefined &&
      !TERMINAL_LIFECYCLE_STATUSES.has(lifecycle.status)) ||
    renderJob?.status === "queued" ||
    renderJob?.status === "submitted" ||
    renderJob?.status === "rendering";

  if (!hasRunnableExecution) {
    return null;
  }

  const factoryJobId = lifecycle?.factoryJobId ?? null;
  const renderJobId = renderJob?.id ?? null;

  return {
    opportunityId: normalizedOpportunityId,
    factoryJobId,
    renderJobId,
    queueJobId: buildQueueJobId({
      opportunityId: normalizedOpportunityId,
      factoryJobId,
      renderJobId,
    }),
  };
}

async function defaultLoadRunSnapshot(
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

export async function runVideoFactoryRunnerNow(input: {
  opportunityId: string;
}) {
  const { runQueuedContentOpportunityVideoGeneration } = await import(
    "@/lib/content-opportunities"
  );
  return runQueuedContentOpportunityVideoGeneration({
    opportunityId: input.opportunityId,
  });
}

export function createVideoFactoryRunCoordinator(
  executor: VideoFactoryRunExecutor = runVideoFactoryRunnerNow,
  options: VideoFactoryRunSchedulerOptions = {},
) {
  const queuePath =
    options.queuePath?.trim() || DEFAULT_VIDEO_FACTORY_RUN_QUEUE_PATH;
  const maxConcurrentRuns =
    options.maxConcurrentRuns ?? MAX_CONCURRENT_VIDEO_FACTORY_RUNS;
  const queueEngine =
    options.queueEngine ?? resolveVideoFactoryQueueEngine();
  const resolveRunContext =
    options.resolveRunContext ?? defaultResolveRunContext;
  const loadRunSnapshot =
    options.loadRunSnapshot ?? defaultLoadRunSnapshot;
  const activeQueueExecutions = new Map<string, Promise<void>>();
  let queueMutationChain = Promise.resolve();
  let activeDrain: Promise<void> | null = null;

  function withQueueMutationLock<T>(operation: () => Promise<T>) {
    const run = queueMutationChain.then(operation, operation);
    queueMutationChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function readQueueStore(): Promise<VideoFactoryRunQueueStore> {
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

  async function writeQueueStore(store: VideoFactoryRunQueueStore) {
    await mkdir(path.dirname(queuePath), { recursive: true });
    await writeFile(queuePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }

  function isActiveQueueJob(job: VideoFactoryQueueJob) {
    return ACTIVE_QUEUE_JOB_STATUSES.has(job.status);
  }

  function queueJobMatchesContext(
    job: VideoFactoryQueueJob,
    context: VideoFactoryRunContext,
  ) {
    return (
      job.queueJobId === context.queueJobId ||
      (context.factoryJobId !== null && job.factoryJobId === context.factoryJobId) ||
      (context.renderJobId !== null && job.renderJobId === context.renderJobId) ||
      (job.opportunityId === context.opportunityId &&
        isActiveQueueJob(job) &&
        !job.factoryJobId &&
        !job.renderJobId)
    );
  }

  async function dispatchExternally(
    queueJob: VideoFactoryQueueJob,
  ): Promise<VideoFactoryQueueJob> {
    const webhookUrl = getInngestCompatibleWebhookUrl();
    if (!webhookUrl) {
      throw new Error(
        "VIDEO_FACTORY_QUEUE_ENGINE is set to inngest-compatible but VIDEO_FACTORY_INNGEST_WEBHOOK_URL is not configured.",
      );
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildInngestCompatibleEventPayload({
          queueJob,
        }),
      ),
    });

    if (!response.ok) {
      throw new Error(
        `Unable to dispatch the queue job to the Inngest-compatible webhook (${response.status}).`,
      );
    }

    return videoFactoryQueueJobSchema.parse({
      ...queueJob,
      eventName: "video-factory/run.requested",
      externalDispatchUrl: webhookUrl,
      externalDispatchedAt: new Date().toISOString(),
    });
  }

  async function enqueueRun(opportunityId: string) {
    const normalizedOpportunityId = opportunityId.trim();
    if (!normalizedOpportunityId) {
      return false;
    }

    return withQueueMutationLock(async () => {
      const context = await resolveRunContext(normalizedOpportunityId);
      if (!context) {
        return false;
      }

      const store = await readQueueStore();
      const hasActiveMatch = store.jobs.some(
        (job) => isActiveQueueJob(job) && queueJobMatchesContext(job, context),
      );
      if (hasActiveMatch) {
        return false;
      }

      const timestamp = new Date().toISOString();
      store.jobs.push(
        videoFactoryQueueJobSchema.parse({
          queueJobId: context.queueJobId,
          opportunityId: context.opportunityId,
          batchId: null,
          factoryJobId: context.factoryJobId,
          renderJobId: context.renderJobId,
          engine: queueEngine,
          status: "queued",
          priority: "normal",
          throttleGroup: "video-factory",
          concurrencyLimit: maxConcurrentRuns,
          eventName: null,
          externalDispatchUrl: null,
          externalDispatchedAt: null,
          scheduledAt: timestamp,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
        }),
      );
      store.updatedAt = timestamp;
      await writeQueueStore(store);

      return true;
    });
  }

  async function claimQueuedRuns() {
    return withQueueMutationLock(async () => {
      const store = await readQueueStore();
      let didMutate = false;
      const timestamp = new Date().toISOString();
      const repairedJobs = store.jobs.map((job) => {
        if (job.status !== "running" || activeQueueExecutions.has(job.queueJobId)) {
          return job;
        }

        didMutate = true;
        return videoFactoryQueueJobSchema.parse({
          ...job,
          status: "queued",
          startedAt: null,
          completedAt: null,
          errorMessage: null,
        });
      });

      const runningCount = repairedJobs.filter(
        (job) => job.status === "running",
      ).length;
      const remainingCapacity = Math.max(0, maxConcurrentRuns - runningCount);
      const nextQueuedJobs: VideoFactoryQueueJob[] = [];
      let claimed = 0;
      const nextJobs = repairedJobs.map((job) => {
        if (
          job.status !== "queued" ||
          job.engine !== "local-file" ||
          claimed >= remainingCapacity
        ) {
          return job;
        }

        claimed += 1;
        didMutate = true;
        const claimedJob = videoFactoryQueueJobSchema.parse({
          ...job,
          status: "running",
          startedAt: timestamp,
          completedAt: null,
          errorMessage: null,
        });
        nextQueuedJobs.push(claimedJob);
        return claimedJob;
      });

      if (didMutate) {
        await writeQueueStore({
          updatedAt: timestamp,
          jobs: nextJobs,
        });
      }

      return nextQueuedJobs;
    });
  }

  async function finalizeQueuedRun(input: {
    queueJobId: string;
    status: "completed" | "failed";
    errorMessage?: string | null;
  }) {
    await withQueueMutationLock(async () => {
      const store = await readQueueStore();
      const timestamp = new Date().toISOString();
      const nextJobs = store.jobs.map((job) =>
        job.queueJobId !== input.queueJobId
          ? job
          : videoFactoryQueueJobSchema.parse({
              ...job,
              status: input.status,
              completedAt: timestamp,
              errorMessage:
                input.status === "failed"
                  ? input.errorMessage ?? "Factory run failed."
                  : null,
            }),
      );

      await writeQueueStore({
        updatedAt: timestamp,
        jobs: nextJobs,
      });
    });
  }

  async function resolveExecutionOutcome(
    queueJob: VideoFactoryQueueJob,
    executionResult: unknown,
  ) {
    const snapshot =
      getSnapshotFromExecutionResult(executionResult, queueJob.opportunityId) ??
      (await loadRunSnapshot(queueJob.opportunityId));

    if (!snapshot) {
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
      return {
        status: "failed" as const,
        errorMessage:
          matchingEntry?.failureMessage ??
          snapshot.renderJobErrorMessage ??
          "Factory run failed.",
      };
    }

    if (
      terminalOutcome ||
      snapshot.renderJobStatus === "completed" ||
      (snapshot.lifecycleStatus !== null &&
        TERMINAL_LIFECYCLE_STATUSES.has(snapshot.lifecycleStatus))
    ) {
      return {
        status: "completed" as const,
        errorMessage: null,
      };
    }

    return {
      status: "failed" as const,
      errorMessage:
        "Factory run returned without reaching a persisted terminal state.",
    };
  }

  function startClaimedRun(job: VideoFactoryQueueJob) {
    const execution = (async () => {
      try {
        const result = await executor({
          opportunityId: job.opportunityId,
        });
        const outcome = await resolveExecutionOutcome(job, result);
        await finalizeQueuedRun({
          queueJobId: job.queueJobId,
          status: outcome.status,
          errorMessage: outcome.errorMessage,
        });
      } catch (error) {
        await finalizeQueuedRun({
          queueJobId: job.queueJobId,
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Factory run failed.",
        });
      } finally {
        activeQueueExecutions.delete(job.queueJobId);
        void drainQueue();
      }
    })();

    activeQueueExecutions.set(job.queueJobId, execution);
  }

  async function drainQueue() {
    if (queueEngine !== "local-file") {
      return;
    }

    if (activeDrain) {
      return activeDrain;
    }

    activeDrain = (async () => {
      try {
        while (true) {
          const claimedJobs = await claimQueuedRuns();
          if (claimedJobs.length === 0) {
            return;
          }

          for (const job of claimedJobs) {
            startClaimedRun(job);
          }
        }
      } finally {
        activeDrain = null;
      }
    })();

    return activeDrain;
  }

  return {
    async schedule(input: { opportunityId: string }) {
      const scheduled = await enqueueRun(input.opportunityId);

      if (scheduled && queueEngine === "inngest-compatible") {
        await withQueueMutationLock(async () => {
          const store = await readQueueStore();
          const queueJob = [...store.jobs]
            .reverse()
            .find(
              (job) =>
                job.opportunityId === input.opportunityId &&
                job.status === "queued" &&
                job.engine === "inngest-compatible",
            );
          if (!queueJob) {
            return;
          }

          const dispatchedJob = await dispatchExternally(queueJob);
          await writeQueueStore({
            updatedAt:
              dispatchedJob.externalDispatchedAt ?? new Date().toISOString(),
            jobs: store.jobs.map((job) =>
              job.queueJobId === dispatchedJob.queueJobId
                ? dispatchedJob
                : job,
            ),
          });
        });
      } else {
        await drainQueue();
      }

      return scheduled;
    },
    async resume() {
      if (queueEngine === "local-file") {
        await drainQueue();
      }
    },
  };
}

export function createVideoFactoryRunScheduler(
  executor: VideoFactoryRunExecutor = runVideoFactoryRunnerNow,
  options: VideoFactoryRunSchedulerOptions = {},
) {
  return createVideoFactoryRunCoordinator(executor, options).schedule;
}

const defaultVideoFactoryRunCoordinator = createVideoFactoryRunCoordinator();

export const scheduleVideoFactoryRun =
  defaultVideoFactoryRunCoordinator.schedule;
export const resumeVideoFactoryRunQueue =
  defaultVideoFactoryRunCoordinator.resume;
