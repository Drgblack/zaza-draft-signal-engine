import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { buildFactoryRunLedgerEntry } from "../lib/video-factory-run-ledger";
import { createRenderJob } from "../lib/render-jobs";

const REPO_ROOT = process.cwd();

async function withTempABTestModule(
  run: (context: {
    loadModule: () => Promise<typeof import("../lib/factory-ab-tests")>;
  }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "factory-ab-tests-"));
  await mkdir(path.join(tempDir, "data"), { recursive: true });
  process.chdir(tempDir);

  try {
    await run({
      loadModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "factory-ab-tests.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
    });
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("assignABTestVariant is deterministic for the same opportunity and brief", { concurrency: false }, async () => {
  await withTempABTestModule(async ({ loadModule }) => {
    const abTests = await loadModule();

    await abTests.upsertABTestConfig({
      id: "ab-provider-1",
      name: "Provider choice baseline",
      isActive: true,
      priority: 10,
      dimension: "provider_choice",
      scope: {
        briefFormats: ["talking-head"],
        opportunityIds: [],
      },
      variants: [
        {
          variant: "A",
          label: "Runway control",
          provider: "runway",
          defaultsVersion: null,
          promptOverrideEnabled: null,
          captionStylePreset: null,
        },
        {
          variant: "B",
          label: "CapCut treatment",
          provider: "capcut",
          defaultsVersion: null,
          promptOverrideEnabled: null,
          captionStylePreset: null,
        },
      ],
      assignmentSalt: "provider-choice-v1",
      changedAt: "2026-03-24T08:00:00.000Z",
      changedSource: "operator:test",
      changeNote: "Initial deterministic provider split.",
    });

    const first = abTests.resolveActiveABTestResult({
      opportunityId: "opportunity-1",
      brief: {
        id: "brief-1",
        format: "talking-head",
      },
      observedProvider: "runway",
      observedDefaultsVersion: 3,
      observedPromptOverrideEnabled: null,
      observedCaptionStylePreset: "teacher-real-clean",
      assignedAt: "2026-03-24T08:30:00.000Z",
    });
    const second = abTests.resolveActiveABTestResult({
      opportunityId: "opportunity-1",
      brief: {
        id: "brief-1",
        format: "talking-head",
      },
      observedProvider: "runway",
      observedDefaultsVersion: 3,
      observedPromptOverrideEnabled: null,
      observedCaptionStylePreset: "teacher-real-clean",
      assignedAt: "2026-03-24T08:45:00.000Z",
    });

    assert.ok(first);
    assert.ok(second);
    assert.equal(first?.configId, "ab-provider-1");
    assert.equal(first?.assignmentKey, second?.assignmentKey);
    assert.equal(first?.variant, second?.variant);
    assert.equal(first?.dimension, "provider_choice");
    assert.equal(first?.observedCaptionStylePreset, "teacher-real-clean");
  });
});

test("variant tagging flows through render jobs and factory ledger entries", () => {
  const abTest = {
    configId: "ab-caption-1",
    configName: "Caption style test",
    dimension: "caption_style_variant" as const,
    scopeKey: "caption_style_variant|all-formats|all-opportunities|talking-head",
    assignmentKey: "ab-caption-1|caption-style-v1|opportunity-1|brief-1|talking-head",
    variant: "B" as const,
    label: "Treatment captions",
    expectedProvider: null,
    expectedDefaultsVersion: null,
    expectedPromptOverrideEnabled: null,
    expectedCaptionStylePreset: "teacher-real-bold",
    observedProvider: "runway",
    observedDefaultsVersion: 3,
    observedPromptOverrideEnabled: null,
    observedCaptionStylePreset: "teacher-real-clean",
    assignedAt: "2026-03-24T09:00:00.000Z",
  };
  const renderJob = createRenderJob({
    generationRequestId: "generation-request-1",
    idempotencyKey: "video-factory:opportunity-1",
    provider: "runway",
    renderVersion: "phase-d-render-v1",
    abTest,
  });
  const ledgerEntry = buildFactoryRunLedgerEntry({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    attemptNumber: 1,
    lifecycle: {
      factoryJobId: "factory-job-1",
      videoBriefId: "brief-1",
      provider: "runway",
      renderVersion: "phase-d-render-v1",
      status: "review_pending",
      draftAt: "2026-03-24T09:00:00.000Z",
      queuedAt: "2026-03-24T09:00:01.000Z",
      retryQueuedAt: null,
      preparingAt: "2026-03-24T09:00:02.000Z",
      generatingNarrationAt: "2026-03-24T09:00:03.000Z",
      generatingVisualsAt: "2026-03-24T09:00:04.000Z",
      generatingCaptionsAt: "2026-03-24T09:00:05.000Z",
      composingAt: "2026-03-24T09:00:06.000Z",
      generatedAt: "2026-03-24T09:00:07.000Z",
      reviewPendingAt: "2026-03-24T09:00:08.000Z",
      acceptedAt: null,
      rejectedAt: null,
      discardedAt: null,
      failedAt: null,
      failedPermanentAt: null,
      lastUpdatedAt: "2026-03-24T09:00:08.000Z",
      failureStage: null,
      failureMessage: null,
      retryState: null,
    },
    renderProvider: "runway",
    generationRequestId: renderJob.generationRequestId,
    renderJobId: renderJob.id,
    abTest: renderJob.abTest ?? null,
  });

  assert.equal(renderJob.abTest?.configId, "ab-caption-1");
  assert.equal(renderJob.abTest?.variant, "B");
  assert.equal(ledgerEntry.abTest?.configId, "ab-caption-1");
  assert.equal(ledgerEntry.abTest?.variant, "B");
});
