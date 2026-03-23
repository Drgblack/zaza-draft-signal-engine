import assert from "node:assert/strict";
import test from "node:test";

import { buildFactoryProviderBenchmarkCollection } from "../lib/video-factory-provider-benchmarks";

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
