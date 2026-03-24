import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildInngestCompatibleEventPayload,
  buildVideoFactoryQueueJobId,
  resolveVideoFactoryQueueEngine,
} from "../lib/video-factory-queue-engine";
import { createVideoFactoryRunCoordinator } from "../lib/video-factory-runner";

test("queue engine defaults to local-file unless explicitly configured", () => {
  const previous = process.env.VIDEO_FACTORY_QUEUE_ENGINE;
  delete process.env.VIDEO_FACTORY_QUEUE_ENGINE;
  try {
    assert.equal(resolveVideoFactoryQueueEngine(), "inngest");
  } finally {
    if (previous === undefined) {
      delete process.env.VIDEO_FACTORY_QUEUE_ENGINE;
    } else {
      process.env.VIDEO_FACTORY_QUEUE_ENGINE = previous;
    }
  }
});

test("buildInngestCompatibleEventPayload preserves the queue identity fields", () => {
  const queueJobId = buildVideoFactoryQueueJobId({
    opportunityId: "opportunity-1",
    factoryJobId: "factory-job-1",
    renderJobId: "render-job-1",
  });

  const payload = buildInngestCompatibleEventPayload({
    queueJob: {
      queueJobId,
      opportunityId: "opportunity-1",
      batchId: "batch-1",
      factoryJobId: "factory-job-1",
      renderJobId: "render-job-1",
      throttleGroup: "video-factory",
      concurrencyLimit: 3,
    },
  });

  assert.equal(payload.name, "factory/render.requested");
  assert.equal(payload.data.queueJobId, queueJobId);
  assert.equal(payload.data.batchId, "batch-1");
});

test("queue coordinator can dispatch queued runs through an injected Inngest dispatcher", async () => {
  const previousEngine = process.env.VIDEO_FACTORY_QUEUE_ENGINE;
  process.env.VIDEO_FACTORY_QUEUE_ENGINE = "inngest";
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "queue-engine-"));
  const dispatchedOpportunityIds: string[] = [];

  try {
    const coordinator = createVideoFactoryRunCoordinator(async () => {
      throw new Error("Inngest dispatch should not execute the local runner directly.");
    }, {
      queuePath: path.join(tempDir, "video-factory-run-queue.json"),
      queueEngine: "inngest",
      resolveRunContext: async (opportunityId) => ({
        opportunityId,
        factoryJobId: `factory-job:${opportunityId}`,
        renderJobId: `render-job:${opportunityId}`,
        queueJobId: `video-factory-queue:factory-job:${opportunityId}`,
      }),
      dispatchEvent: async (queueJob) => {
        dispatchedOpportunityIds.push(queueJob.opportunityId);
      },
    });

    const scheduled = await coordinator.schedule({ opportunityId: "opportunity-1" });
    assert.equal(scheduled, true);
    assert.deepEqual(dispatchedOpportunityIds, ["opportunity-1"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    if (previousEngine === undefined) {
      delete process.env.VIDEO_FACTORY_QUEUE_ENGINE;
    } else {
      process.env.VIDEO_FACTORY_QUEUE_ENGINE = previousEngine;
    }
  }
});
