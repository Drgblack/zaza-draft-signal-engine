import assert from "node:assert/strict";
import test from "node:test";

import { createVideoFactoryRunScheduler } from "../lib/video-factory-runner";

test("video factory runner scheduler dedupes the same queued opportunity until execution settles", async () => {
  const started: string[] = [];
  let releaseRun: () => void = () => {
    throw new Error("Runner did not start.");
  };
  const schedule = createVideoFactoryRunScheduler(
    async ({ opportunityId }) =>
      new Promise<void>((resolve) => {
        started.push(opportunityId);
        releaseRun = resolve;
      }),
  );

  const first = schedule({ opportunityId: "opportunity-1" });
  const second = schedule({ opportunityId: "opportunity-1" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(first, true);
  assert.equal(second, false);
  assert.deepEqual(started, ["opportunity-1"]);

  releaseRun();
  await new Promise((resolve) => setImmediate(resolve));

  const third = schedule({ opportunityId: "opportunity-1" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(third, true);
  assert.deepEqual(started, ["opportunity-1", "opportunity-1"]);
});
