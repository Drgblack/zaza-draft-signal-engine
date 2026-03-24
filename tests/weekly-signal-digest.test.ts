import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import type { ContentOpportunity } from "../lib/content-opportunities";
import {
  buildWeeklySignalDigest,
} from "../lib/weekly-signal-digest";

const REPO_ROOT = process.cwd();

function buildOpportunityFixture(input: {
  id: string;
  signalId: string;
  provider: "runway" | "custom";
  terminalOutcome: "accepted" | "rejected" | "failed";
  reviewStatus: "accepted" | "rejected" | "pending_review";
  attemptNumber: number;
  retryCount: number;
  defaultsVersion: number;
  estimatedCostUsd: number;
  actualCostUsd: number | null;
  failureStage?: "generating_visuals" | null;
  decisionReasons?: string[];
  qualityFailureCode?: string | null;
  compiledTrustReasons?: string[];
  finalScriptTrustReasons?: string[];
}): ContentOpportunity {
  const compiledTrustReasons = input.compiledTrustReasons ?? [];
  const finalScriptTrustReasons = input.finalScriptTrustReasons ?? [];
  const qualityCheck =
    input.qualityFailureCode !== null && input.qualityFailureCode !== undefined
      ? {
          passed: false,
          hasAudio: true,
          durationSeconds: 30,
          expectedDuration: 30,
          durationInRange: true,
          captionsPresent: true,
          sceneCount: 1,
          failures: [
            {
              stage: "visuals",
              code: input.qualityFailureCode,
              message: `Failure for ${input.qualityFailureCode}`,
            },
          ],
          checkedAt: "2026-03-25T10:04:00.000Z",
        }
      : {
          passed: true,
          hasAudio: true,
          durationSeconds: 30,
          expectedDuration: 30,
          durationInRange: true,
          captionsPresent: true,
          sceneCount: 1,
          failures: [],
          checkedAt: "2026-03-25T10:04:00.000Z",
        };

  return {
    opportunityId: input.id,
    signalId: input.signalId,
    title: `Opportunity ${input.id}`,
    opportunityType: "pain_point_opportunity",
    status: "approved_for_production",
    priority: "high",
    source: {
      signalId: input.signalId,
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "Teachers worry a parent reply could escalate.",
    painPointCategory: "parent-communication",
    teacherLanguage: ["I keep rereading the message before I send it."],
    recommendedAngle: "Calm reassurance",
    recommendedHookDirection: "empathetic",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "This pressure is active this week.",
    commercialPotential: "high",
    trustRisk: "low",
    riskSummary: null,
    confidence: null,
    historicalCostAvg: null,
    historicalApprovalRate: null,
    suggestedNextStep: "Generate a video.",
    skipReason: null,
    hookOptions: null,
    hookRanking: null,
    performanceDrivers: null,
    intendedViewerEffect: null,
    suggestedCTA: null,
    productionComplexity: null,
    growthIntelligence: null,
    supportingSignals: [],
    memoryContext: {
      bestCombo: null,
      weakCombo: null,
      revenuePattern: null,
      audienceCue: "Teachers handling difficult parent replies",
      caution: null,
    },
    sourceSignalIds: [input.signalId],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-25T10:05:00.000Z",
    approvedAt: "2026-03-24T09:05:00.000Z",
    dismissedAt: null,
    founderSelectionStatus: "approved",
    selectedAngleId: "angle-1",
    selectedHookId: "hook-1",
    selectedVideoBrief: {
      id: `${input.id}-brief`,
      opportunityId: input.id,
      angleId: "angle-1",
      hookSetId: "hook-set-1",
      title: "Pause before you send it",
      hook: "Before you send this message, pause once and read it like a parent would.",
      format: "talking-head",
      durationSec: 30,
      goal: "Drive trials",
      tone: "teacher-real",
      structure: [
        { order: 1, purpose: "hook", guidance: "Open with the risky draft moment." },
        { order: 2, purpose: "recognition", guidance: "Name the pressure." },
        { order: 3, purpose: "cta", guidance: "Offer the calmer rewrite path." },
      ],
      visualDirection: "Simple portrait shot.",
      overlayLines: ["Pause before sending", "Catch risky tone early"],
      cta: "Try Zaza Draft",
      contentType: null,
      finalScriptTrustScore:
        finalScriptTrustReasons.length > 0 ? 64 : 89,
      productionNotes: ["No exaggerated claims", "No urgency language"],
    },
    generationState: {
      videoBriefApprovedAt: "2026-03-24T09:05:00.000Z",
      videoBriefApprovedBy: "founder",
      factoryLifecycle: {
        factoryJobId: `${input.id}:factory-job`,
        videoBriefId: `${input.id}-brief`,
        provider: input.provider,
        renderVersion: "phase-c-render-v1",
        status:
          input.terminalOutcome === "accepted"
            ? "accepted"
            : input.terminalOutcome === "rejected"
              ? "rejected"
              : "failed",
        draftAt: "2026-03-25T10:00:00.000Z",
        queuedAt: "2026-03-25T10:00:05.000Z",
        retryQueuedAt: null,
        preparingAt: "2026-03-25T10:00:10.000Z",
        generatingNarrationAt: "2026-03-25T10:00:15.000Z",
        generatingVisualsAt: "2026-03-25T10:00:20.000Z",
        generatingCaptionsAt:
          input.terminalOutcome === "failed" ? null : "2026-03-25T10:00:25.000Z",
        composingAt:
          input.terminalOutcome === "failed" ? null : "2026-03-25T10:00:30.000Z",
        generatedAt:
          input.terminalOutcome === "failed" ? null : "2026-03-25T10:00:35.000Z",
        reviewPendingAt:
          input.terminalOutcome === "failed" ? null : "2026-03-25T10:00:40.000Z",
        acceptedAt:
          input.terminalOutcome === "accepted" ? "2026-03-25T10:00:50.000Z" : null,
        rejectedAt:
          input.terminalOutcome === "rejected" ? "2026-03-25T10:00:50.000Z" : null,
        discardedAt: null,
        failedAt:
          input.terminalOutcome === "failed" ? "2026-03-25T10:00:28.000Z" : null,
        failedPermanentAt: null,
        lastUpdatedAt: "2026-03-25T10:05:00.000Z",
        failureStage: input.failureStage ?? null,
        failureMessage:
          input.terminalOutcome === "failed" ? "Visual generation timed out." : null,
        retryState: {
          retryCount: input.retryCount,
          maxRetries: 3,
          backoffDelayMs: null,
          nextRetryAt: null,
          lastFailureAt: null,
          retryStage: input.failureStage ?? null,
          failureMode:
            input.terminalOutcome === "failed" ? "retryable" : "none",
          exhausted: false,
        },
      },
      latestCostEstimate: {
        estimatedTotalUsd: input.estimatedCostUsd,
        narrationCostUsd: 0.2,
        visualsCostUsd: Math.max(input.estimatedCostUsd - 0.32, 0),
        transcriptionCostUsd: 0.12,
        compositionCostUsd: 0,
        providerId: input.provider === "runway" ? "runway-gen4" : "custom-provider",
        mode: "quality",
        estimatedAt: "2026-03-25T10:00:05.000Z",
      },
      latestActualCost:
        input.actualCostUsd !== null
          ? {
              jobId: `${input.id}:render-job`,
              estimatedCostUsd: input.estimatedCostUsd,
              actualCostUsd: input.actualCostUsd,
              narrationActualUsd: 0.18,
              visualsActualUsd: Math.max(input.actualCostUsd - 0.3, 0),
              transcriptActualUsd: 0.12,
              compositionActualUsd: 0,
              providerId:
                input.provider === "runway" ? "runway-gen4" : "custom-provider",
              completedAt: "2026-03-25T10:00:50.000Z",
            }
          : null,
      latestBudgetGuard: null,
      latestQualityCheck: qualityCheck,
      latestRetryState: {
        retryCount: input.retryCount,
        maxRetries: 3,
        backoffDelayMs: null,
        nextRetryAt: null,
        lastFailureAt: null,
        retryStage: input.failureStage ?? null,
        failureMode: input.terminalOutcome === "failed" ? "retryable" : "none",
        exhausted: false,
      },
      runLedger: [
        {
          ledgerEntryId: `${input.id}:ledger:1`,
          factoryJobId: `${input.id}:factory-job`,
          opportunityId: input.id,
          videoBriefId: `${input.id}-brief`,
          attemptNumber: input.attemptNumber,
          generationRequestId: `${input.id}:generation-request`,
          renderJobId: `${input.id}:render-job`,
          renderedAssetId:
            input.terminalOutcome === "failed" ? null : `${input.id}:rendered-asset`,
          providerSet: {
            renderProvider: input.provider,
            narrationProvider: "elevenlabs",
            visualProviders: [
              input.provider === "runway" ? "runway-gen4" : "custom-visuals",
            ],
            captionProvider: "assemblyai",
            compositionProvider: "ffmpeg",
          },
          lifecycleTransitions: [
            { status: "queued", at: "2026-03-25T10:00:05.000Z" },
            {
              status:
                input.terminalOutcome === "accepted"
                  ? "accepted"
                  : input.terminalOutcome === "rejected"
                    ? "rejected"
                    : "failed",
              at: "2026-03-25T10:00:50.000Z",
            },
          ],
          artifactIds:
            input.terminalOutcome === "failed"
              ? ["narration-1"]
              : ["narration-1", "scene-1", "caption-1", "video-1"],
          estimatedCost: {
            estimatedTotalUsd: input.estimatedCostUsd,
            narrationCostUsd: 0.2,
            visualsCostUsd: Math.max(input.estimatedCostUsd - 0.32, 0),
            transcriptionCostUsd: 0.12,
            compositionCostUsd: 0,
            providerId: input.provider === "runway" ? "runway-gen4" : "custom-provider",
            mode: "quality",
            estimatedAt: "2026-03-25T10:00:05.000Z",
          },
          actualCost:
            input.actualCostUsd !== null
              ? {
                  jobId: `${input.id}:render-job`,
                  estimatedCostUsd: input.estimatedCostUsd,
                  actualCostUsd: input.actualCostUsd,
                  narrationActualUsd: 0.18,
                  visualsActualUsd: Math.max(input.actualCostUsd - 0.3, 0),
                  transcriptActualUsd: 0.12,
                  compositionActualUsd: 0,
                  providerId:
                    input.provider === "runway"
                      ? "runway-gen4"
                      : "custom-provider",
                  completedAt: "2026-03-25T10:00:50.000Z",
                }
              : null,
          budgetGuard: null,
          qualityCheck,
          retryState: {
            retryCount: input.retryCount,
            maxRetries: 3,
            backoffDelayMs: null,
            nextRetryAt: null,
            lastFailureAt: null,
            retryStage: input.failureStage ?? null,
            failureMode: input.terminalOutcome === "failed" ? "retryable" : "none",
            exhausted: false,
          },
          regenerationReasonCodes: [],
          regenerationNotes: null,
          decisionStructuredReasons: input.decisionReasons ?? [],
          decisionNotes: null,
          autonomyPolicyReason: null,
          autonomyPolicyRiskLevel: null,
          growthExecutionPath: "video_factory",
          growthExecutionPriority: 80,
          growthRiskLevel: "low",
          growthReasoning: "Execution-ready this week.",
          finalScriptTrustScore:
            finalScriptTrustReasons.length > 0 ? 64 : 89,
          finalScriptTrustStatus:
            finalScriptTrustReasons.length > 0 ? "caution" : "safe",
          terminalOutcome:
            input.terminalOutcome === "accepted"
              ? "accepted"
              : input.terminalOutcome === "rejected"
                ? "rejected"
                : "failed",
          lastUpdatedAt: "2026-03-25T10:05:00.000Z",
          failureStage: input.failureStage ?? null,
          failureMessage:
            input.terminalOutcome === "failed" ? "Visual generation timed out." : null,
        },
      ],
      comparisonRecords: [],
      attemptLineage: [],
      narrationSpec: null,
      videoPrompt: null,
      generationRequest: null,
      renderJob: {
        id: `${input.id}:render-job`,
        generationRequestId: `${input.id}:generation-request`,
        idempotencyKey: `video-factory:${input.id}`,
        provider: input.provider,
        renderVersion: "phase-c-render-v1",
        compiledProductionPlan: {
          id: `${input.id}:compiled-plan`,
          opportunityId: input.id,
          videoBriefId: `${input.id}-brief`,
          defaultsSnapshot: {
            id: "prod-default:teacher-real-core",
            profileId: "prod-default:teacher-real-core",
            version: input.defaultsVersion,
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
            styleAnchorPrompt: "Teacher-real anchor prompt.",
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
              visuals: ["runway-gen4"],
              captions: ["assemblyai"],
              composition: ["ffmpeg"],
            },
            updatedAt: "2026-03-22T00:00:00.000Z",
          },
          narrationSpec: {
            id: `${input.id}:narration-spec`,
            opportunityId: input.id,
            videoBriefId: `${input.id}-brief`,
            targetDurationSec: 30,
            script: "Narration text for testing.",
            tone: "teacher-real",
            pace: "steady",
          },
          scenePrompts: [
            {
              id: `${input.id}:scene-1`,
              videoBriefId: `${input.id}-brief`,
              visualPrompt: "Teacher reviewing a draft reply.",
              overlayText: "Pause before sending",
              order: 1,
              purpose: "hook",
              durationSec: 30,
            },
          ],
          captionSpec: {
            id: `${input.id}:caption-spec`,
            videoBriefId: `${input.id}-brief`,
            sourceText: "Caption text",
            stylePreset: "teacher-real-clean",
            placement: "lower-third",
            casing: "sentence",
          },
          compositionSpec: {
            id: `${input.id}:composition-spec`,
            videoBriefId: `${input.id}-brief`,
            aspectRatio: "9:16",
            resolution: "1080p",
            sceneOrder: [`${input.id}:scene-1`],
            narrationSpecId: `${input.id}:narration-spec`,
            captionSpecId: `${input.id}:caption-spec`,
            transitionStyle: "gentle-cut",
            musicMode: "none",
          },
          finalScriptTrustAssessment: {
            score: finalScriptTrustReasons.length > 0 ? 64 : 89,
            status: finalScriptTrustReasons.length > 0 ? "caution" : "safe",
            adjusted: finalScriptTrustReasons.length > 0,
            reasons: finalScriptTrustReasons,
          },
          trustAssessment: {
            score: compiledTrustReasons.length > 0 ? 72 : 92,
            status: compiledTrustReasons.length > 0 ? "caution" : "safe",
            adjusted: compiledTrustReasons.length > 0,
            reasons: compiledTrustReasons,
          },
        },
        productionDefaultsSnapshot: null,
        providerJobId: `${input.id}:provider-job`,
        preTriageConcern: null,
        regenerationReason: null,
        regenerationReasonCodes: [],
        regenerationNotes: null,
        costEstimate: null,
        actualCost: null,
        budgetGuard: null,
        qualityCheck,
        retryState: null,
        status:
          input.terminalOutcome === "failed" ? "failed" : "completed",
        submittedAt: "2026-03-25T10:00:05.000Z",
        completedAt:
          input.terminalOutcome === "failed" ? null : "2026-03-25T10:00:50.000Z",
        errorMessage:
          input.terminalOutcome === "failed" ? "Visual generation timed out." : null,
      },
      renderedAsset:
        input.terminalOutcome === "failed"
          ? null
          : {
              id: `${input.id}:rendered-asset`,
              renderJobId: `${input.id}:render-job`,
              assetType: "video",
              url: `https://example.com/${input.id}.mp4`,
              thumbnailUrl: `https://example.com/${input.id}.jpg`,
              durationSec: 30,
              createdAt: "2026-03-25T10:00:50.000Z",
            },
      assetReview:
        input.terminalOutcome === "failed"
          ? null
          : {
              id: `${input.id}:review`,
              renderedAssetId: `${input.id}:rendered-asset`,
              status: input.reviewStatus,
              reviewedAt:
                input.reviewStatus === "pending_review"
                  ? null
                  : "2026-03-25T10:01:00.000Z",
              structuredReasons:
                input.reviewStatus === "rejected"
                  ? (input.decisionReasons ?? [])
                  : [],
              reviewNotes: null,
              rejectionReason: null,
            },
      performanceSignals: [
        {
          id: `${input.id}:performance-signal:asset_generated`,
          opportunityId: input.id,
          videoBriefId: `${input.id}-brief`,
          renderedAssetId:
            input.terminalOutcome === "failed" ? null : `${input.id}:rendered-asset`,
          eventType: "asset_generated",
          value: null,
          metadata: undefined,
          createdAt: "2026-03-25T10:00:50.000Z",
        },
      ],
    },
    operatorNotes: null,
  } as unknown as ContentOpportunity;
}

async function withTempDigestModule(
  run: (context: {
    loadModule: () => Promise<typeof import("../lib/weekly-signal-digest")>;
  }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "weekly-signal-digest-"));
  await mkdir(path.join(tempDir, "data"), { recursive: true });
  process.chdir(tempDir);

  try {
    await run({
      loadModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "weekly-signal-digest.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
    });
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("buildWeeklySignalDigest summarizes weekly run, cost, provider, defaults, and trust patterns", () => {
  const digest = buildWeeklySignalDigest({
    weekStartDate: "2026-03-23",
    generatedAt: "2026-03-29T18:00:00.000Z",
    now: new Date("2026-03-29T18:00:00.000Z"),
    opportunities: [
      buildOpportunityFixture({
        id: "opportunity-1",
        signalId: "signal-1",
        provider: "runway",
        terminalOutcome: "accepted",
        reviewStatus: "accepted",
        attemptNumber: 1,
        retryCount: 0,
        defaultsVersion: 3,
        estimatedCostUsd: 1.1,
        actualCostUsd: 1,
        decisionReasons: [],
        qualityFailureCode: null,
        compiledTrustReasons: [],
        finalScriptTrustReasons: [],
      }),
      buildOpportunityFixture({
        id: "opportunity-2",
        signalId: "signal-2",
        provider: "runway",
        terminalOutcome: "rejected",
        reviewStatus: "rejected",
        attemptNumber: 2,
        retryCount: 2,
        defaultsVersion: 3,
        estimatedCostUsd: 1.4,
        actualCostUsd: 1.3,
        decisionReasons: ["poor_visuals"],
        qualityFailureCode: "scene_mismatch",
        compiledTrustReasons: ["video-brief-used-fallback"],
        finalScriptTrustReasons: ["final-script-language-not-preserved"],
      }),
      buildOpportunityFixture({
        id: "opportunity-3",
        signalId: "signal-3",
        provider: "custom",
        terminalOutcome: "failed",
        reviewStatus: "pending_review",
        attemptNumber: 1,
        retryCount: 1,
        defaultsVersion: 4,
        estimatedCostUsd: 0.9,
        actualCostUsd: null,
        failureStage: "generating_visuals",
        decisionReasons: [],
        qualityFailureCode: "scene_render_failed",
        compiledTrustReasons: ["brief-anchor-thin"],
        finalScriptTrustReasons: [],
      }),
    ],
  });

  assert.equal(digest.weekStartDate, "2026-03-23");
  assert.equal(digest.weekEndDate, "2026-03-29");
  assert.equal(digest.signalsConsidered, 3);
  assert.equal(digest.opportunitiesTouched, 3);
  assert.equal(digest.videosGenerated, 2);
  assert.deepEqual(digest.reviewSummary, {
    approved: 1,
    rejected: 1,
    discarded: 0,
    pendingReview: 0,
    failed: 1,
  });
  assert.equal(digest.regenerationRate, 0.3333);
  assert.equal(digest.averageRetries, 1);
  assert.equal(digest.costPerApprovedVideoUsd, 1);
  assert.equal(digest.providerComparisonSummary[0]?.provider, "runway");
  assert.equal(digest.providerComparisonSummary[0]?.runCount, 2);
  assert.equal(digest.providerComparisonSummary[0]?.approvalRate, 0.5);
  assert.equal(
    digest.defaultsVersionComparisonSummary.find(
      (summary) => summary.defaultsVersion === 3,
    )?.runCount,
    2,
  );
  assert.equal(
    digest.topFailureReasons.some(
      (reason) =>
        reason.label === "review: poor visuals" && reason.count === 1,
    ),
    true,
  );
  assert.equal(
    digest.topFailureReasons.some(
      (reason) =>
        reason.label === "failure stage: generating visuals" && reason.count === 1,
    ),
    true,
  );
  assert.equal(
    digest.topTrustWarnings.some(
      (reason) =>
        reason.label === "compiled: video-brief-used-fallback" &&
        reason.count === 1,
    ),
    true,
  );
  assert.equal(
    digest.topTrustWarnings.some(
      (reason) =>
        reason.label ===
          "final script: final-script-language-not-preserved" &&
        reason.count === 1,
    ),
    true,
  );
});

test("generateWeeklySignalDigest persists and retrieves stored weekly digests", { concurrency: false }, async () => {
  await withTempDigestModule(async ({ loadModule }) => {
    const weeklySignalDigestModule = await loadModule();
    const digest = await weeklySignalDigestModule.generateWeeklySignalDigest({
      weekStartDate: "2026-03-23",
      generatedAt: "2026-03-29T18:00:00.000Z",
      now: new Date("2026-03-29T18:00:00.000Z"),
      opportunities: [
        buildOpportunityFixture({
          id: "opportunity-1",
          signalId: "signal-1",
          provider: "runway",
          terminalOutcome: "accepted",
          reviewStatus: "accepted",
          attemptNumber: 1,
          retryCount: 0,
          defaultsVersion: 3,
          estimatedCostUsd: 1.1,
          actualCostUsd: 1,
          decisionReasons: [],
          qualityFailureCode: null,
          compiledTrustReasons: [],
          finalScriptTrustReasons: [],
        }),
      ],
    });

    const stored = await weeklySignalDigestModule.getStoredWeeklySignalDigest(
      "2026-03-23",
    );
    const listed = await weeklySignalDigestModule.listWeeklySignalDigests();
    const rawStore = JSON.parse(
      await readFile(
        path.join(process.cwd(), "data", "weekly-signal-digests.json"),
        "utf8",
      ),
    ) as {
      digestsByWeekStartDate: Record<string, { weekStartDate: string }>;
    };

    assert.equal(digest.weekStartDate, "2026-03-23");
    assert.equal(stored?.weekStartDate, "2026-03-23");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.weekStartDate, "2026-03-23");
    assert.equal(
      rawStore.digestsByWeekStartDate["2026-03-23"]?.weekStartDate,
      "2026-03-23",
    );
  });
});
