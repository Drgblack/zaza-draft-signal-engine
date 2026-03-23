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
    factoryJobId,
    renderJobId,
    queueJobId: `video-factory-queue:${factoryJobId}`,
  };
}

function buildCompletedExecutionResult(opportunityId: string) {
  const context = buildRunContext(opportunityId);
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
              factoryJobId: context.factoryJobId,
              renderJobId: context.renderJobId,
              terminalOutcome: "review_pending",
              failureMessage: null,
            },
          ],
        },
      },
    ],
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

async function waitFor(predicate: () => boolean, timeoutMs = 1_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForQueueJobStatus(
  queuePath: string,
  queueJobId: string,
  status: string,
  timeoutMs = 1_000,
) {
  const startedAt = Date.now();

  while (true) {
    const raw = await readFile(queuePath, "utf8");
    const parsed = JSON.parse(raw) as {
      jobs?: Array<{
        queueJobId?: string;
        status?: string;
      }>;
    };
    const queueJob = parsed.jobs?.find((job) => job.queueJobId === queueJobId);
    if (queueJob?.status === status) {
      return;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for queue job ${queueJobId} to reach ${status}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("video factory runner scheduler dedupes the same queued opportunity until execution settles", async () => {
  const { queuePath, cleanup } = await createQueuePath();
  const started: string[] = [];
  const context = buildRunContext("opportunity-1");
  let releaseRun: () => void = () => {
    throw new Error("Runner did not start.");
  };
  const coordinator = createVideoFactoryRunCoordinator(
    async ({ opportunityId }) =>
      new Promise((resolve) => {
        started.push(opportunityId);
        releaseRun = () => resolve(buildCompletedExecutionResult(opportunityId));
      }),
    {
      queuePath,
      resolveRunContext: async (opportunityId) => buildRunContext(opportunityId),
    },
  );

  try {
    const first = await coordinator.schedule({ opportunityId: "opportunity-1" });
    const second = await coordinator.schedule({ opportunityId: "opportunity-1" });

    await waitFor(() => started.length === 1);

    assert.equal(first, true);
    assert.equal(second, false);
    assert.deepEqual(started, ["opportunity-1"]);

    releaseRun();
    await waitForQueueJobStatus(queuePath, context.queueJobId, "completed");

    const third = await coordinator.schedule({ opportunityId: "opportunity-1" });
    await waitFor(() => started.length === 2);

    assert.equal(third, true);
    assert.deepEqual(started, ["opportunity-1", "opportunity-1"]);
  } finally {
    await cleanup();
  }
});

test("video factory runner coordinator enforces a maximum of three concurrent runs", async () => {
  const { queuePath, cleanup } = await createQueuePath();
  const started: string[] = [];
  const releaseByOpportunityId = new Map<string, () => void>();
  const coordinator = createVideoFactoryRunCoordinator(
    async ({ opportunityId }) =>
      new Promise((resolve) => {
        started.push(opportunityId);
        releaseByOpportunityId.set(opportunityId, () =>
          resolve(buildCompletedExecutionResult(opportunityId)),
        );
      }),
    {
      queuePath,
      resolveRunContext: async (opportunityId) => buildRunContext(opportunityId),
    },
  );

  try {
    await Promise.all([
      coordinator.schedule({ opportunityId: "opportunity-1" }),
      coordinator.schedule({ opportunityId: "opportunity-2" }),
      coordinator.schedule({ opportunityId: "opportunity-3" }),
      coordinator.schedule({ opportunityId: "opportunity-4" }),
    ]);

    await waitFor(() => started.length === 3);
    assert.deepEqual(started, [
      "opportunity-1",
      "opportunity-2",
      "opportunity-3",
    ]);

    releaseByOpportunityId.get("opportunity-1")?.();
    await waitFor(() => started.length === 4);
    assert.deepEqual(started, [
      "opportunity-1",
      "opportunity-2",
      "opportunity-3",
      "opportunity-4",
    ]);
  } finally {
    await cleanup();
  }
});

test("video factory runner coordinator requeues persisted running jobs on resume", async () => {
  const { queuePath, cleanup } = await createQueuePath();
  const started: string[] = [];
  const context = buildRunContext("opportunity-1");
  const coordinator = createVideoFactoryRunCoordinator(
    async ({ opportunityId }) => {
      started.push(opportunityId);
      return buildCompletedExecutionResult(opportunityId);
    },
    {
      queuePath,
      resolveRunContext: async (opportunityId) => buildRunContext(opportunityId),
    },
  );

  try {
    const staleRunningQueueState = {
      updatedAt: new Date().toISOString(),
      jobs: [
        {
          queueJobId: context.queueJobId,
          opportunityId: context.opportunityId,
          factoryJobId: context.factoryJobId,
          renderJobId: context.renderJobId,
          status: "running",
          scheduledAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          completedAt: null,
          errorMessage: null,
        },
      ],
    };

    await mkdir(path.dirname(queuePath), { recursive: true });
    await writeFile(
      queuePath,
      `${JSON.stringify(staleRunningQueueState, null, 2)}\n`,
      "utf8",
    );

    await coordinator.resume();
    await waitFor(() => started.length === 1);
    assert.deepEqual(started, ["opportunity-1"]);
  } finally {
    await cleanup();
  }
});
