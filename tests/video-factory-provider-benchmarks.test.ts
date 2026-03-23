import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFactoryProviderBenchmarkCollection,
  buildFactoryProviderRunBenchmarkReport,
} from "../lib/video-factory-provider-benchmarks";

test("buildFactoryProviderBenchmarkCollection aggregates provider quality, retry, latency, and cost signals", () => {
  const collection = buildFactoryProviderBenchmarkCollection({
    generatedAt: "2026-03-23T14:00:00.000Z",
    opportunities: [
      {
        generationState: {
          runLedger: [
            {
              renderJobId: "render-1",
              providerSet: {
                narrationProvider: "elevenlabs",
                visualProviders: ["runway-gen4"],
                captionProvider: "assemblyai",
                compositionProvider: "ffmpeg",
              },
              estimatedCost: {
                narrationCostUsd: 0.2,
                visualsCostUsd: 0.9,
                transcriptionCostUsd: 0.12,
                compositionCostUsd: 0.05,
              },
              actualCost: {
                narrationActualUsd: 0.18,
                visualsActualUsd: 0.88,
                transcriptActualUsd: 0.11,
                compositionActualUsd: 0.04,
              },
              retryState: null,
              decisionStructuredReasons: [],
              terminalOutcome: "accepted",
              failureStage: null,
            },
            {
              renderJobId: "render-2",
              providerSet: {
                narrationProvider: "elevenlabs",
                visualProviders: ["runway-gen4"],
                captionProvider: "assemblyai",
                compositionProvider: "ffmpeg",
              },
              estimatedCost: {
                narrationCostUsd: 0.22,
                visualsCostUsd: 0.95,
                transcriptionCostUsd: 0.12,
                compositionCostUsd: 0.05,
              },
              actualCost: {
                narrationActualUsd: 0.2,
                visualsActualUsd: 0.9,
                transcriptActualUsd: 0.12,
                compositionActualUsd: 0.04,
              },
              retryState: null,
              decisionStructuredReasons: ["poor_visuals", "weak_hook"],
              terminalOutcome: "rejected",
              failureStage: null,
            },
            {
              renderJobId: "render-3",
              providerSet: {
                narrationProvider: "elevenlabs",
                visualProviders: ["kling-2"],
                captionProvider: "assemblyai",
                compositionProvider: "ffmpeg",
              },
              estimatedCost: {
                narrationCostUsd: 0.21,
                visualsCostUsd: 0.72,
                transcriptionCostUsd: 0.1,
                compositionCostUsd: 0.05,
              },
              actualCost: {
                narrationActualUsd: 0.19,
                visualsActualUsd: 0.7,
                transcriptActualUsd: 0.1,
                compositionActualUsd: 0.04,
              },
              retryState: null,
              decisionStructuredReasons: ["caption_issues", "not_publish_ready"],
              terminalOutcome: "discarded",
              failureStage: null,
            },
            {
              renderJobId: "render-4",
              providerSet: {
                narrationProvider: "elevenlabs",
                visualProviders: ["runway-gen4"],
                captionProvider: "assemblyai",
                compositionProvider: "ffmpeg",
              },
              estimatedCost: {
                narrationCostUsd: 0.19,
                visualsCostUsd: 0.85,
                transcriptionCostUsd: 0.11,
                compositionCostUsd: 0.05,
              },
              actualCost: null,
              retryState: {
                retryCount: 2,
                retryStage: "generating_narration",
              },
              decisionStructuredReasons: [],
              terminalOutcome: "failed",
              failureStage: "generating_narration",
            },
          ],
          attemptLineage: [
            {
              renderJobId: "render-1",
              providerExecutions: [
                {
                  stage: "narration",
                  providerId: "elevenlabs",
                  startedAt: "2026-03-23T10:00:00.000Z",
                  completedAt: "2026-03-23T10:00:05.000Z",
                  retryState: null,
                },
                {
                  stage: "visuals",
                  providerId: "runway-gen4",
                  startedAt: "2026-03-23T10:00:05.000Z",
                  completedAt: "2026-03-23T10:00:35.000Z",
                  retryState: {
                    retryCount: 1,
                    retryStage: "generating_visuals",
                  },
                },
                {
                  stage: "captions",
                  providerId: "assemblyai",
                  startedAt: "2026-03-23T10:00:35.000Z",
                  completedAt: "2026-03-23T10:00:45.000Z",
                  retryState: null,
                },
                {
                  stage: "composition",
                  providerId: "ffmpeg",
                  startedAt: "2026-03-23T10:00:45.000Z",
                  completedAt: "2026-03-23T10:00:55.000Z",
                  retryState: null,
                },
              ],
            },
            {
              renderJobId: "render-2",
              providerExecutions: [
                {
                  stage: "narration",
                  providerId: "elevenlabs",
                  startedAt: "2026-03-23T11:00:00.000Z",
                  completedAt: "2026-03-23T11:00:04.000Z",
                  retryState: null,
                },
                {
                  stage: "visuals",
                  providerId: "runway-gen4",
                  startedAt: "2026-03-23T11:00:04.000Z",
                  completedAt: "2026-03-23T11:00:28.000Z",
                  retryState: null,
                },
                {
                  stage: "captions",
                  providerId: "assemblyai",
                  startedAt: "2026-03-23T11:00:28.000Z",
                  completedAt: "2026-03-23T11:00:38.000Z",
                  retryState: null,
                },
                {
                  stage: "composition",
                  providerId: "ffmpeg",
                  startedAt: "2026-03-23T11:00:38.000Z",
                  completedAt: "2026-03-23T11:00:47.000Z",
                  retryState: null,
                },
              ],
            },
            {
              renderJobId: "render-3",
              providerExecutions: [
                {
                  stage: "narration",
                  providerId: "elevenlabs",
                  startedAt: "2026-03-23T12:00:00.000Z",
                  completedAt: "2026-03-23T12:00:05.000Z",
                  retryState: null,
                },
                {
                  stage: "visuals",
                  providerId: "kling-2",
                  startedAt: "2026-03-23T12:00:05.000Z",
                  completedAt: "2026-03-23T12:00:24.000Z",
                  retryState: null,
                },
                {
                  stage: "captions",
                  providerId: "assemblyai",
                  startedAt: "2026-03-23T12:00:24.000Z",
                  completedAt: "2026-03-23T12:00:34.000Z",
                  retryState: null,
                },
                {
                  stage: "composition",
                  providerId: "ffmpeg",
                  startedAt: "2026-03-23T12:00:34.000Z",
                  completedAt: "2026-03-23T12:00:44.000Z",
                  retryState: null,
                },
              ],
            },
            {
              renderJobId: "render-4",
              providerExecutions: [],
            },
          ],
        },
      },
    ],
  });

  const narration = collection.summaries.find(
    (summary) => summary.provider === "elevenlabs" && summary.stage === "narration",
  );
  const runwayVisuals = collection.summaries.find(
    (summary) => summary.provider === "runway-gen4" && summary.stage === "visuals",
  );
  const captions = collection.summaries.find(
    (summary) => summary.provider === "assemblyai" && summary.stage === "captions",
  );

  assert.equal(collection.generatedAt, "2026-03-23T14:00:00.000Z");
  assert.equal(narration?.runCount, 4);
  assert.equal(narration?.successRate, 0.75);
  assert.equal(narration?.retryRate, 0.25);
  assert.equal(narration?.acceptanceRate, 0.25);
  assert.equal(narration?.averageEstimatedCostUsd, 0.205);
  assert.equal(narration?.averageActualCostUsd, 0.19);

  assert.equal(runwayVisuals?.runCount, 3);
  assert.equal(runwayVisuals?.retryRate, 0.3333);
  assert.equal(runwayVisuals?.averageLatencyMs, 27000);
  assert.equal(runwayVisuals?.rejectionRate, 0.3333);
  assert.deepEqual(runwayVisuals?.rejectionDiscardReasonsSummary, [
    { reasonCode: "poor_visuals", count: 1 },
    { reasonCode: "weak_hook", count: 1 },
  ]);

  assert.equal(captions?.runCount, 4);
  assert.equal(captions?.discardRate, 0.25);
  assert.deepEqual(captions?.rejectionDiscardReasonsSummary, [
    { reasonCode: "caption_issues", count: 1 },
    { reasonCode: "not_publish_ready", count: 1 },
    { reasonCode: "poor_visuals", count: 1 },
    { reasonCode: "weak_hook", count: 1 },
  ]);
});

test("buildFactoryProviderRunBenchmarkReport rolls up provider metrics and A/B-ready comparison groups", () => {
  const report = buildFactoryProviderRunBenchmarkReport({
    generatedAt: "2026-03-23T14:00:00.000Z",
    runs: [
      {
        attemptNumber: 1,
        format: "talking-head",
        terminalOutcome: "accepted",
        isActive: false,
        providerSet: {
          renderProvider: "runway",
        },
        defaultsVersion: 3,
        trustStatus: "safe",
        trustAdjusted: false,
        retryCount: 0,
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:04:00.000Z",
        timeline: [
          { status: "queued", at: "2026-03-23T10:00:00.000Z" },
          { status: "accepted", at: "2026-03-23T10:04:00.000Z" },
        ],
        estimatedCostUsd: 1.2,
        actualCostUsd: 1.1,
        reviewOutcome: {
          status: "accepted",
        },
      },
      {
        attemptNumber: 2,
        format: "talking-head",
        terminalOutcome: "rejected",
        isActive: false,
        providerSet: {
          renderProvider: "runway",
        },
        defaultsVersion: 3,
        trustStatus: "safe",
        trustAdjusted: false,
        retryCount: 2,
        createdAt: "2026-03-23T11:00:00.000Z",
        updatedAt: "2026-03-23T11:06:00.000Z",
        timeline: [
          { status: "queued", at: "2026-03-23T11:00:00.000Z" },
          { status: "rejected", at: "2026-03-23T11:06:00.000Z" },
        ],
        estimatedCostUsd: 1.5,
        actualCostUsd: null,
        reviewOutcome: {
          status: "rejected",
        },
      },
      {
        attemptNumber: 1,
        format: "scenario-cut",
        terminalOutcome: "accepted",
        isActive: false,
        providerSet: {
          renderProvider: "kling",
        },
        defaultsVersion: 4,
        trustStatus: "adjusted",
        trustAdjusted: true,
        retryCount: 1,
        createdAt: "2026-03-23T12:00:00.000Z",
        updatedAt: "2026-03-23T12:03:00.000Z",
        timeline: [
          { status: "queued", at: "2026-03-23T12:00:00.000Z" },
          { status: "accepted", at: "2026-03-23T12:03:00.000Z" },
        ],
        estimatedCostUsd: 0.95,
        actualCostUsd: 0.92,
        reviewOutcome: {
          status: "accepted",
        },
      },
      {
        attemptNumber: 1,
        format: "talking-head",
        terminalOutcome: null,
        isActive: true,
        providerSet: {
          renderProvider: "runway",
        },
        defaultsVersion: 4,
        trustStatus: "safe",
        trustAdjusted: false,
        retryCount: 1,
        createdAt: "2026-03-23T13:00:00.000Z",
        updatedAt: "2026-03-23T13:02:00.000Z",
        timeline: [{ status: "generating_visuals", at: "2026-03-23T13:00:00.000Z" }],
        estimatedCostUsd: 1.25,
        actualCostUsd: null,
        reviewOutcome: {
          status: null,
        },
      },
    ],
  });

  const runway = report.providerSummaries.find(
    (summary) => summary.provider === "runway",
  );
  const kling = report.providerSummaries.find(
    (summary) => summary.provider === "kling",
  );
  const runwayV3TalkingHead = report.comparisonGroups.find(
    (group) =>
      group.provider === "runway" &&
      group.defaultsVersion === 3 &&
      group.format === "talking-head" &&
      group.trustStatus === "safe",
  );

  assert.equal(report.generatedAt, "2026-03-23T14:00:00.000Z");

  assert.equal(runway?.runCount, 3);
  assert.equal(runway?.terminalRunCount, 2);
  assert.equal(runway?.approvalRate, 0.5);
  assert.equal(runway?.regenerationRate, 0.3333);
  assert.equal(runway?.averageRetries, 1);
  assert.equal(runway?.averageCostUsd, 1.2833);
  assert.equal(runway?.averageTimeToTerminalMs, 300000);
  assert.deepEqual(runway?.defaultsVersions, [3, 4]);
  assert.deepEqual(runway?.formats, ["talking-head"]);
  assert.equal(runway?.adjustedCount, 0);
  assert.equal(runway?.evidence.level, "directional");

  assert.equal(kling?.approvalRate, 1);
  assert.equal(kling?.evidence.level, "low_sample");

  assert.equal(runwayV3TalkingHead?.runCount, 2);
  assert.equal(runwayV3TalkingHead?.terminalRunCount, 2);
  assert.equal(runwayV3TalkingHead?.approvalRate, 0.5);
  assert.equal(runwayV3TalkingHead?.regenerationRate, 0.5);
  assert.equal(runwayV3TalkingHead?.averageRetries, 1);
  assert.equal(runwayV3TalkingHead?.averageCostUsd, 1.3);
  assert.equal(runwayV3TalkingHead?.averageTimeToTerminalMs, 300000);
});
