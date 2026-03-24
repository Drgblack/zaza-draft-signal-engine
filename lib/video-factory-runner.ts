import {
  buildFactoryRenderRequestedEventPayload,
  buildVideoFactoryQueueJobId,
  enqueueVideoFactoryQueueJob,
  finalizeVideoFactoryQueueJobFromExecution,
  getVideoFactoryRunQueueStateSummary as getQueueStateSummary,
  listVideoFactoryQueueJobs,
  markVideoFactoryQueueJobDispatchRecorded,
  markVideoFactoryQueueJobFailed,
  markVideoFactoryQueueJobRunning,
  resolveVideoFactoryQueueEngine,
  videoFactoryQueueJobSchema,
  type VideoFactoryQueueEngine,
  type VideoFactoryQueueJob,
  type VideoFactoryRunQueueStateSummary,
} from "@/lib/video-factory-queue-engine";
import { inngest } from "@/lib/inngest/client";
import { queuePriorityForGrowthIntelligence } from "@/lib/video-factory-selection";

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
  batchId?: string | null;
  queuePriority?: "normal" | "high";
};

export interface VideoFactoryRunSchedulerOptions {
  maxConcurrentRuns?: number;
  queuePath?: string;
  queueEngine?: VideoFactoryQueueEngine;
  resolveRunContext?: (opportunityId: string) => Promise<VideoFactoryRunContext | null>;
  dispatchEvent?: (queueJob: VideoFactoryQueueJob) => Promise<void>;
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
    ((lifecycle?.status ?? null) !== null &&
      !TERMINAL_LIFECYCLE_STATUSES.has(lifecycle?.status ?? "")) ||
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
    batchId: renderJob?.batchId ?? null,
    factoryJobId,
    renderJobId,
    queuePriority: queuePriorityForGrowthIntelligence(
      opportunity.growthIntelligence ?? null,
    ),
    queueJobId: buildVideoFactoryQueueJobId({
      opportunityId: normalizedOpportunityId,
      factoryJobId,
      renderJobId,
    }),
  };
}

async function dispatchViaInngest(queueJob: VideoFactoryQueueJob) {
  const payload = buildFactoryRenderRequestedEventPayload({
    queueJob,
  });

  await inngest.send(payload);
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

export async function getVideoFactoryRunQueueStateSummary(options: {
  queuePath?: string;
  maxConcurrentRuns?: number;
} = {}): Promise<VideoFactoryRunQueueStateSummary> {
  return getQueueStateSummary(options);
}

export function createVideoFactoryRunCoordinator(
  executor: VideoFactoryRunExecutor = runVideoFactoryRunnerNow,
  options: VideoFactoryRunSchedulerOptions = {},
) {
  const queuePath = options.queuePath?.trim();
  const maxConcurrentRuns =
    options.maxConcurrentRuns ?? MAX_CONCURRENT_VIDEO_FACTORY_RUNS;
  const queueEngine = options.queueEngine ?? resolveVideoFactoryQueueEngine();
  const resolveRunContext =
    options.resolveRunContext ?? defaultResolveRunContext;
  const dispatchEvent = options.dispatchEvent ?? dispatchViaInngest;

  return {
    async schedule(input: { opportunityId: string }) {
      const context = await resolveRunContext(input.opportunityId);
      if (!context) {
        return false;
      }

      const timestamp = new Date().toISOString();
      const queueJob = await enqueueVideoFactoryQueueJob({
        queuePath,
        queueJob: videoFactoryQueueJobSchema.parse({
          queueJobId: context.queueJobId,
          opportunityId: context.opportunityId,
          batchId: context.batchId ?? null,
            factoryJobId: context.factoryJobId,
            renderJobId: context.renderJobId,
            engine: queueEngine,
            status: "queued",
            priority: context.queuePriority ?? "normal",
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
      });

      if (!queueJob) {
        return false;
      }

      if (queueEngine === "local-file") {
        await markVideoFactoryQueueJobRunning({
          queueJobId: queueJob.queueJobId,
          queuePath,
        });

        try {
          const executionResult = await executor({
            opportunityId: queueJob.opportunityId,
          });
          await finalizeVideoFactoryQueueJobFromExecution({
            queueJobId: queueJob.queueJobId,
            opportunityId: queueJob.opportunityId,
            queuePath,
            executionResult,
          });
        } catch (error) {
          await markVideoFactoryQueueJobFailed({
            queueJobId: queueJob.queueJobId,
            queuePath,
            errorMessage:
              error instanceof Error ? error.message : "Factory run failed.",
          });
          throw error;
        }

        return true;
      }

      await dispatchEvent(queueJob);
      await markVideoFactoryQueueJobDispatchRecorded({
        queueJobId: queueJob.queueJobId,
        queuePath,
        eventName: "factory/render.requested",
        externalDispatchUrl: "inngest",
      });
      return true;
    },
    async resume() {
      if (queueEngine === "local-file") {
        return;
      }

      const queuedJobs = (await listVideoFactoryQueueJobs({ queuePath })).filter(
        (job) =>
          job.engine === "inngest" &&
          job.status === "queued" &&
          !job.externalDispatchedAt,
      ).sort(
        (left, right) =>
          Number(right.priority === "high") - Number(left.priority === "high") ||
          left.scheduledAt.localeCompare(right.scheduledAt),
      );

      for (const queueJob of queuedJobs) {
        await dispatchEvent(queueJob);
        await markVideoFactoryQueueJobDispatchRecorded({
          queueJobId: queueJob.queueJobId,
          queuePath,
          eventName: "factory/render.requested",
          externalDispatchUrl: "inngest",
        });
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
