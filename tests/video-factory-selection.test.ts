import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVideoFactorySelectionDecision,
  buildVideoFactorySelectionDecision,
} from "../lib/video-factory-selection";

type SelectionInput = Parameters<typeof buildVideoFactorySelectionDecision>[0];
type SelectionPlan = SelectionInput["compiledProductionPlan"];
type HistoricalOpportunity = SelectionInput["historicalOpportunities"][number];

function buildCompiledPlanFixture(): SelectionPlan {
  return {
    id: "compiled-plan-1",
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    defaultsSnapshot: {
      id: "prod-default:teacher-real-core",
      profileId: "prod-default:teacher-real-core",
      version: 1,
      changedAt: "2026-03-22T00:00:00.000Z",
      changedSource: "system-bootstrap",
      changeNote: null,
      name: "Teacher-Real Core",
      isActive: true,
      voiceProvider: "elevenlabs",
      voiceId: "teacher-real-core-v1",
      voiceSettings: {
        stability: 0.48,
        similarityBoost: 0.72,
        style: 0.14,
        speakerBoost: true,
      },
      styleAnchorPrompt: "Teacher-real anchor.",
      motionStyle: "Quiet cuts.",
      negativeConstraints: ["No hype"],
      aspectRatio: "9:16",
      resolution: "1080p",
      captionStyle: {
        preset: "teacher-real-clean",
        placement: "lower-third",
        casing: "sentence",
      },
      compositionDefaults: {
        transitionStyle: "gentle-cut",
        musicMode: "none",
      },
      reviewDefaults: {
        requireCaptionCheck: true,
      },
      providerFallbacks: {
        narration: ["elevenlabs"],
        visuals: ["runway-gen4", "kling-2"],
        captions: ["local-default"],
        composition: ["local-default"],
      },
      updatedAt: "2026-03-22T00:00:00.000Z",
    },
    narrationSpec: {
      id: "brief-1:narration-spec",
      opportunityId: "opportunity-1",
      videoBriefId: "brief-1",
      script: "Every teacher knows the feeling. Zaza Draft helps. Try it free.",
      tone: "teacher-real",
      pace: "steady",
      targetDurationSec: 30,
    },
    scenePrompts: [
      {
        id: "scene-1",
        videoBriefId: "brief-1",
        visualPrompt: "Teacher looking at laptop in classroom.",
        overlayText: "Tone check",
        order: 1,
        purpose: "hook",
        durationSec: 10,
      },
      {
        id: "scene-2",
        videoBriefId: "brief-1",
        visualPrompt: "Teacher revising email draft.",
        overlayText: "Send with confidence",
        order: 2,
        purpose: "reframe",
        durationSec: 10,
      },
      {
        id: "scene-3",
        videoBriefId: "brief-1",
        visualPrompt: "Teacher smiling after sending.",
        overlayText: "Calm before send",
        order: 3,
        purpose: "cta",
        durationSec: 10,
      },
    ],
    captionSpec: {
      id: "brief-1:caption-spec",
      videoBriefId: "brief-1",
      sourceText: "Every teacher knows the feeling. Zaza Draft helps. Try it free.",
      stylePreset: "teacher-real-clean",
      placement: "lower-third",
      casing: "sentence",
    },
    compositionSpec: {
      id: "brief-1:composition-spec",
      videoBriefId: "brief-1",
      aspectRatio: "9:16",
      resolution: "1080p",
      sceneOrder: ["scene-1", "scene-2", "scene-3"],
      narrationSpecId: "brief-1:narration-spec",
      captionSpecId: "brief-1:caption-spec",
      transitionStyle: "gentle-cut",
      musicMode: "none",
    },
    trustAssessment: {
      score: 92,
      status: "safe",
      adjusted: false,
      reasons: [],
    },
  };
}

function buildHistoricalOpportunity(input: {
  id: string;
  visualProvider: "runway-gen4" | "kling-2";
  terminalOutcome: "accepted" | "rejected" | "discarded" | "failed";
  visualRetryCount?: number;
}): HistoricalOpportunity {
  return {
    selectedVideoBrief: {
      format: "talking-head",
      durationSec: 30,
    },
    generationState: {
      renderJob: {
        compiledProductionPlan: {
          trustAssessment: {
            status: "safe",
          },
          defaultsSnapshot: {
            aspectRatio: "9:16",
            resolution: "1080p",
          },
        },
      },
      runLedger: [
        {
          renderJobId: `${input.id}:render-job`,
          providerSet: {
            narrationProvider: "elevenlabs",
            visualProviders: [input.visualProvider],
            captionProvider: "assemblyai",
            compositionProvider: "ffmpeg",
          },
          estimatedCost: {
            narrationCostUsd: 0.02,
            visualsCostUsd: input.visualProvider === "kling-2" ? 0.7 : 0.9,
            transcriptionCostUsd: 0.01,
            compositionCostUsd: 0,
          },
          actualCost: {
            narrationActualUsd: 0.02,
            visualsActualUsd: input.visualProvider === "kling-2" ? 0.68 : 0.88,
            transcriptActualUsd: 0.01,
            compositionActualUsd: 0,
          },
          retryState: {
            retryCount: input.visualRetryCount ?? 0,
            retryStage:
              (input.visualRetryCount ?? 0) > 0 ? "generating_visuals" : null,
          },
          decisionStructuredReasons:
            input.terminalOutcome === "accepted"
              ? []
              : ["poor_visuals" as const],
          terminalOutcome: input.terminalOutcome,
          failureStage:
            input.terminalOutcome === "failed" ? "generating_visuals" : null,
        },
      ],
      attemptLineage: [
        {
          renderJobId: `${input.id}:render-job`,
          costEstimate: {
            narrationCostUsd: 0.02,
            visualsCostUsd: input.visualProvider === "kling-2" ? 0.7 : 0.9,
            transcriptionCostUsd: 0.01,
            compositionCostUsd: 0,
          },
          actualCost: {
            narrationActualUsd: 0.02,
            visualsActualUsd: input.visualProvider === "kling-2" ? 0.68 : 0.88,
            transcriptActualUsd: 0.01,
            compositionActualUsd: 0,
          },
          retryState: {
            retryCount: input.visualRetryCount ?? 0,
            retryStage:
              (input.visualRetryCount ?? 0) > 0 ? "generating_visuals" : null,
          },
          providerExecutions: [
            {
              stage: "narration" as const,
              providerId: "elevenlabs",
              startedAt: "2026-03-23T10:00:00.000Z",
              completedAt: "2026-03-23T10:00:05.000Z",
              retryState: {
                retryCount: 0,
                retryStage: null,
              },
            },
            {
              stage: "visuals" as const,
              providerId: input.visualProvider,
              startedAt: "2026-03-23T10:00:05.000Z",
              completedAt: "2026-03-23T10:00:35.000Z",
              retryState: {
                retryCount: input.visualRetryCount ?? 0,
                retryStage:
                  (input.visualRetryCount ?? 0) > 0 ? "generating_visuals" : null,
              },
            },
            {
              stage: "captions" as const,
              providerId: "assemblyai",
              startedAt: "2026-03-23T10:00:35.000Z",
              completedAt: "2026-03-23T10:00:42.000Z",
              retryState: {
                retryCount: 0,
                retryStage: null,
              },
            },
            {
              stage: "composition" as const,
              providerId: "ffmpeg",
              startedAt: "2026-03-23T10:00:42.000Z",
              completedAt: "2026-03-23T10:00:55.000Z",
              retryState: {
                retryCount: 0,
                retryStage: null,
              },
            },
          ],
        },
      ],
    },
  };
}

test("buildVideoFactorySelectionDecision keeps current defaults when similar-job evidence is weak", () => {
  const decision = buildVideoFactorySelectionDecision({
    compiledProductionPlan: buildCompiledPlanFixture(),
    briefFormat: "talking-head",
    briefDurationSec: 30,
    historicalOpportunities: [
      buildHistoricalOpportunity({
        id: "opportunity-a",
        visualProvider: "runway-gen4",
        terminalOutcome: "accepted",
      }),
      buildHistoricalOpportunity({
        id: "opportunity-b",
        visualProvider: "kling-2",
        terminalOutcome: "accepted",
      }),
    ],
    appliedAt: "2026-03-23T10:30:00.000Z",
  });

  assert.equal(decision.visualDecisionSource, "default");
  assert.deepEqual(decision.visualProviderOrder, ["runway-gen4", "kling-2"]);
  assert.equal(
    decision.retryPolicies.every((policy) => policy.reason === "default"),
    true,
  );
});

test("buildVideoFactorySelectionDecision promotes a clearly stronger visual provider for similar jobs", () => {
  const decision = buildVideoFactorySelectionDecision({
    compiledProductionPlan: buildCompiledPlanFixture(),
    briefFormat: "talking-head",
    briefDurationSec: 30,
    historicalOpportunities: [
      buildHistoricalOpportunity({
        id: "runway-1",
        visualProvider: "runway-gen4",
        terminalOutcome: "accepted",
      }),
      buildHistoricalOpportunity({
        id: "runway-2",
        visualProvider: "runway-gen4",
        terminalOutcome: "rejected",
      }),
      buildHistoricalOpportunity({
        id: "runway-3",
        visualProvider: "runway-gen4",
        terminalOutcome: "rejected",
      }),
      buildHistoricalOpportunity({
        id: "kling-1",
        visualProvider: "kling-2",
        terminalOutcome: "accepted",
      }),
      buildHistoricalOpportunity({
        id: "kling-2",
        visualProvider: "kling-2",
        terminalOutcome: "accepted",
      }),
      buildHistoricalOpportunity({
        id: "kling-3",
        visualProvider: "kling-2",
        terminalOutcome: "accepted",
      }),
    ],
    appliedAt: "2026-03-23T10:30:00.000Z",
  });

  assert.equal(decision.visualDecisionSource, "memory");
  assert.equal(decision.selectedVisualProvider, "kling-2");
  assert.deepEqual(decision.visualProviderOrder, ["kling-2", "runway-gen4"]);

  const optimizedPlan = applyVideoFactorySelectionDecision({
    compiledProductionPlan: buildCompiledPlanFixture(),
    decision,
  });
  assert.deepEqual(optimizedPlan.defaultsSnapshot.providerFallbacks.visuals, [
    "kling-2",
    "runway-gen4",
  ]);
});

test("buildVideoFactorySelectionDecision widens retry policy only for transient high-recovery stages", () => {
  const decision = buildVideoFactorySelectionDecision({
    compiledProductionPlan: buildCompiledPlanFixture(),
    briefFormat: "talking-head",
    briefDurationSec: 30,
    historicalOpportunities: [
      buildHistoricalOpportunity({
        id: "runway-1",
        visualProvider: "runway-gen4",
        terminalOutcome: "accepted",
        visualRetryCount: 1,
      }),
      buildHistoricalOpportunity({
        id: "runway-2",
        visualProvider: "runway-gen4",
        terminalOutcome: "accepted",
        visualRetryCount: 1,
      }),
      buildHistoricalOpportunity({
        id: "runway-3",
        visualProvider: "runway-gen4",
        terminalOutcome: "accepted",
        visualRetryCount: 1,
      }),
      buildHistoricalOpportunity({
        id: "runway-4",
        visualProvider: "runway-gen4",
        terminalOutcome: "accepted",
        visualRetryCount: 1,
      }),
    ],
    appliedAt: "2026-03-23T10:30:00.000Z",
  });

  const visualsPolicy = decision.retryPolicies.find(
    (policy) => policy.stage === "visuals",
  );
  assert.equal(visualsPolicy?.reason, "memory_more_patience");
  assert.equal(visualsPolicy?.maxRetries, 3);
  assert.equal(visualsPolicy?.baseDelayMs, 5000);

  const narrationPolicy = decision.retryPolicies.find(
    (policy) => policy.stage === "narration",
  );
  assert.equal(narrationPolicy?.reason, "default");
});
