import { inngest } from "@/lib/inngest/client";
import { runQueuedContentOpportunityVideoGeneration } from "@/lib/content-opportunities";
import {
  factoryRenderRequestedEventDataSchema,
  finalizeVideoFactoryQueueJobFromExecution,
  getVideoFactoryQueueJob,
  markVideoFactoryQueueJobFailed,
  markVideoFactoryQueueJobRunning,
} from "@/lib/video-factory-queue-engine";

export const factoryRenderFunction = inngest.createFunction(
  {
    id: "factory-render",
    retries: 0,
    concurrency: {
      limit: 3,
      key: "event.data.throttleGroup",
    },
    triggers: [
      {
        event: "factory/render.requested",
      },
    ],
  },
  async ({ event, step }) => {
    const payload = factoryRenderRequestedEventDataSchema.parse(event.data);

    const queueJob = await step.run("load-queue-job", async () =>
      getVideoFactoryQueueJob({
        queueJobId: payload.queueJobId,
      }),
    );

    if (!queueJob) {
      return {
        queueJobId: payload.queueJobId,
        status: "failed",
        errorMessage: "Queue job not found.",
      };
    }

    if (queueJob.status === "completed") {
      return {
        queueJobId: queueJob.queueJobId,
        status: "completed",
        errorMessage: null,
      };
    }

    await step.run("mark-running", async () =>
      markVideoFactoryQueueJobRunning({
        queueJobId: payload.queueJobId,
      }),
    );

    try {
      await step.run("provider-execution", async () =>
        runQueuedContentOpportunityVideoGeneration({
          opportunityId: payload.opportunityId,
        }),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Factory run failed.";
      await step.run("mark-failed", async () =>
        markVideoFactoryQueueJobFailed({
          queueJobId: payload.queueJobId,
          errorMessage,
        }),
      );
      return {
        queueJobId: payload.queueJobId,
        status: "failed",
        errorMessage,
      };
    }

    return step.run("finalise-persist", async () =>
      finalizeVideoFactoryQueueJobFromExecution({
        queueJobId: payload.queueJobId,
        opportunityId: payload.opportunityId,
      }),
    );
  },
);
