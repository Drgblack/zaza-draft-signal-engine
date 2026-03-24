import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createVideoFactoryRunCoordinator } from "../lib/video-factory-runner";

function buildRunContext(opportunityId: string) {
  const factoryJobId = `factory-job:${opportunityId}`;
  const renderJobId = `render-job:${opportunityId}`;

  return {
    opportunityId,
    batchId: null,
    factoryJobId,
    renderJobId,
    queueJobId: `video-factory-queue:${factoryJobId}`,
    contextSnapshot: null,
  };
}

async function createQueuePath() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "video-factory-runner-"));
  return {
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
    queuePath: path.join(tempDir, "video-factory-run-queue.json"),
  };
}

test("video factory runner scheduler dedupes the same queued opportunity before Inngest dispatch", async () => {
  const { queuePath, cleanup } = await createQueuePath();
  const dispatchedOpportunityIds: string[] = [];
  const coordinator = createVideoFactoryRunCoordinator(
    async () => {
      throw new Error("Inngest dispatch should not invoke the local executor.");
    },
    {
      queuePath,
      queueEngine: "inngest",
      resolveRunContext: async (opportunityId) => buildRunContext(opportunityId),
      dispatchEvent: async (queueJob) => {
        dispatchedOpportunityIds.push(queueJob.opportunityId);
      },
    },
  );

  try {
    const first = await coordinator.schedule({ opportunityId: "opportunity-1" });
    const second = await coordinator.schedule({ opportunityId: "opportunity-1" });

    assert.equal(first, true);
    assert.equal(second, false);
    assert.deepEqual(dispatchedOpportunityIds, ["opportunity-1"]);
  } finally {
    await cleanup();
  }
});

test("video factory runner resume redispatches queued Inngest jobs that were never marked as dispatched", async () => {
  const { queuePath, cleanup } = await createQueuePath();
  const context = buildRunContext("opportunity-1");
  const dispatchedOpportunityIds: string[] = [];
  const coordinator = createVideoFactoryRunCoordinator(
    async () => {
      throw new Error("Resume should not invoke the local executor.");
    },
    {
      queuePath,
      queueEngine: "inngest",
      resolveRunContext: async (opportunityId) => buildRunContext(opportunityId),
      dispatchEvent: async (queueJob) => {
        dispatchedOpportunityIds.push(queueJob.opportunityId);
      },
    },
  );

  try {
    await mkdir(path.dirname(queuePath), { recursive: true });
    await writeFile(
      queuePath,
      `${JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          jobs: [
            {
              queueJobId: context.queueJobId,
              opportunityId: context.opportunityId,
              batchId: null,
              factoryJobId: context.factoryJobId,
              renderJobId: context.renderJobId,
              engine: "inngest",
              status: "queued",
              priority: "normal",
              throttleGroup: "video-factory",
              concurrencyLimit: 3,
              eventName: null,
              externalDispatchUrl: null,
              externalDispatchedAt: null,
              scheduledAt: new Date().toISOString(),
              startedAt: null,
              completedAt: null,
              errorMessage: null,
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await coordinator.resume();
    assert.deepEqual(dispatchedOpportunityIds, ["opportunity-1"]);
  } finally {
    await cleanup();
  }
});

test("video factory runner still supports explicit local-file execution as a compatibility mode", async () => {
  const { queuePath, cleanup } = await createQueuePath();
  const started: string[] = [];
  const coordinator = createVideoFactoryRunCoordinator(
    async ({ opportunityId }) => {
      started.push(opportunityId);
      return {
        opportunities: [
          {
            opportunityId,
            generationState: {
              factoryLifecycle: {
                status: "review_pending",
              },
              renderJob: {
                status: "completed",
                errorMessage: null,
              },
              runLedger: [
                {
                  factoryJobId: `factory-job:${opportunityId}`,
                  renderJobId: `render-job:${opportunityId}`,
                  terminalOutcome: "review_pending",
                  failureMessage: null,
                },
              ],
            },
          },
        ],
      };
    },
    {
      queuePath,
      queueEngine: "local-file",
      resolveRunContext: async (opportunityId) => buildRunContext(opportunityId),
    },
  );

  try {
    const scheduled = await coordinator.schedule({ opportunityId: "opportunity-1" });
    const raw = await readFile(queuePath, "utf8");
    const parsed = JSON.parse(raw) as {
      jobs: Array<{ status: string }>;
    };

    assert.equal(scheduled, true);
    assert.deepEqual(started, ["opportunity-1"]);
    assert.equal(parsed.jobs[0]?.status, "completed");
  } finally {
    await cleanup();
  }
});

test("video factory runner persists queue context snapshots for dispatched jobs", async () => {
  const { queuePath, cleanup } = await createQueuePath();
  const coordinator = createVideoFactoryRunCoordinator(
    async () => {
      throw new Error("Inngest dispatch should not invoke the local executor.");
    },
    {
      queuePath,
      queueEngine: "inngest",
      resolveRunContext: async (opportunityId) => ({
        ...buildRunContext(opportunityId),
        contextSnapshot: {
          growthIntelligence: {
            executionPriority: 84,
            strategicValue: 76,
            riskLevel: "low",
            learningValue: 55,
            executionPath: "video_factory",
            expectedOutcome: "Teacher trials",
          },
          productionDefaults: null,
          platformOutputs: [
            {
              platform: "linkedin",
              recommendedFormat: "short_video",
              contentType: "validation",
              goal: "Drive trials",
              callToAction: "Try Zaza Draft",
            },
          ],
        },
      }),
      dispatchEvent: async () => {},
    },
  );

  try {
    await coordinator.schedule({ opportunityId: "opportunity-ctx" });

    const raw = await readFile(queuePath, "utf8");
    const parsed = JSON.parse(raw) as {
      jobs: Array<{
        contextSnapshot?: {
          growthIntelligence?: { executionPriority?: number | null } | null;
          platformOutputs?: Array<{ platform: string }>;
        } | null;
      }>;
    };

    assert.equal(
      parsed.jobs[0]?.contextSnapshot?.growthIntelligence?.executionPriority,
      84,
    );
    assert.equal(parsed.jobs[0]?.contextSnapshot?.platformOutputs?.[0]?.platform, "linkedin");
  } finally {
    await cleanup();
  }
});
