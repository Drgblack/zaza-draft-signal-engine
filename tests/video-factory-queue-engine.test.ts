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
    assert.equal(resolveVideoFactoryQueueEngine(), "local-file");
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
    },
  });

  assert.equal(payload.name, "video-factory/run.requested");
  assert.equal(payload.data.queueJobId, queueJobId);
  assert.equal(payload.data.batchId, "batch-1");
});

test("inngest-compatible queue mode fails explicitly when no webhook is configured", async () => {
  const previousEngine = process.env.VIDEO_FACTORY_QUEUE_ENGINE;
  const previousWebhook = process.env.VIDEO_FACTORY_INNGEST_WEBHOOK_URL;
  process.env.VIDEO_FACTORY_QUEUE_ENGINE = "inngest-compatible";
  delete process.env.VIDEO_FACTORY_INNGEST_WEBHOOK_URL;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "queue-engine-"));

  try {
    const coordinator = createVideoFactoryRunCoordinator(async () => {
      throw new Error("External queue mode should not execute the local runner.");
    }, {
      queuePath: path.join(tempDir, "video-factory-run-queue.json"),
      queueEngine: "inngest-compatible",
      resolveRunContext: async (opportunityId) => ({
        opportunityId,
        factoryJobId: `factory-job:${opportunityId}`,
        renderJobId: `render-job:${opportunityId}`,
        queueJobId: `video-factory-queue:factory-job:${opportunityId}`,
      }),
    });

    await assert.rejects(
      () => coordinator.schedule({ opportunityId: "opportunity-1" }),
      /VIDEO_FACTORY_INNGEST_WEBHOOK_URL is not configured/i,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    if (previousEngine === undefined) {
      delete process.env.VIDEO_FACTORY_QUEUE_ENGINE;
    } else {
      process.env.VIDEO_FACTORY_QUEUE_ENGINE = previousEngine;
    }
    if (previousWebhook === undefined) {
      delete process.env.VIDEO_FACTORY_INNGEST_WEBHOOK_URL;
    } else {
      process.env.VIDEO_FACTORY_INNGEST_WEBHOOK_URL = previousWebhook;
    }
  }
});
