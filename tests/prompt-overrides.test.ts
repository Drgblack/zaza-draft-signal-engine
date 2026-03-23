import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import type { ContentOpportunity } from "../lib/content-opportunities";
import type { VideoBrief } from "../lib/video-briefs";

const REPO_ROOT = process.cwd();

function buildOpportunityFixture(input?: {
  trustRisk?: "low" | "medium" | "high";
  primaryPainPoint?: string;
  title?: string;
  generationState?: Record<string, unknown> | null;
}): ContentOpportunity {
  return {
    opportunityId: "opportunity-1",
    signalId: "signal-1",
    title: input?.title ?? "Parent complaint email tone check",
    opportunityType: "pain_point_opportunity",
    status: "approved_for_production",
    priority: "high",
    source: {
      signalId: "signal-1",
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint:
      input?.primaryPainPoint ??
      "A parent complaint email feels like it could escalate if the reply lands badly.",
    teacherLanguage: ["I keep rereading the message before I send it."],
    recommendedAngle: "Calm reassurance",
    recommendedHookDirection: "empathetic",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "High parent message volume this week.",
    commercialPotential: "high",
    trustRisk: input?.trustRisk ?? "low",
    riskSummary: null,
    suggestedNextStep: "Send to factory.",
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
      audienceCue: null,
      caution: null,
    },
    sourceSignalIds: ["signal-1"],
    createdAt: "2026-03-23T09:55:00.000Z",
    updatedAt: "2026-03-23T10:10:00.000Z",
    approvedAt: "2026-03-23T10:00:00.000Z",
    dismissedAt: null,
    founderSelectionStatus: "approved",
    selectedAngleId: "angle-1",
    selectedHookId: "hook-1",
    selectedVideoBrief: null,
    generationState:
      input?.generationState === undefined
        ? {
            videoBriefApprovedAt: null,
            videoBriefApprovedBy: null,
            factoryLifecycle: null,
            latestCostEstimate: null,
            latestActualCost: null,
            latestBudgetGuard: null,
            latestQualityCheck: null,
            latestRetryState: null,
            runLedger: [],
            comparisonRecords: [],
            attemptLineage: [],
            narrationSpec: null,
            videoPrompt: null,
            generationRequest: null,
            renderJob: null,
            renderedAsset: null,
            assetReview: null,
            performanceSignals: [],
          }
        : input.generationState,
    operatorNotes: null,
  } as unknown as ContentOpportunity;
}

function buildBriefFixture(input?: {
  format?: "talking-head" | "text-led" | "b-roll" | "carousel-to-video";
  overlayLines?: string[];
}): VideoBrief {
  return {
    id: "brief-1",
    opportunityId: "opportunity-1",
    angleId: "angle-1",
    hookSetId: "hook-set-1",
    title: "Pause before you send it",
    hook: "Before you send this message to a parent, pause for one calmer read.",
    format: input?.format ?? "talking-head",
    durationSec: 30,
    goal: "Drive trials",
    tone: "teacher-real",
    structure: [
      {
        order: 1,
        purpose: "hook",
        guidance: "Open with the risky draft moment before the message goes out.",
      },
      {
        order: 2,
        purpose: "recognition",
        guidance: "Show the emotional pressure of trying to sound firm without escalating.",
      },
      {
        order: 3,
        purpose: "cta",
        guidance: "Land on the calmer version and invite a safer rewrite.",
      },
    ],
    visualDirection: "Simple portrait shot with readable classroom detail.",
    overlayLines:
      input?.overlayLines ?? [
        "Before you send this message",
        "Keep the tone calm and clear",
        "Pause before replying",
      ],
    cta: "Try Zaza Draft",
    productionNotes: [],
  } as unknown as VideoBrief;
}

async function withTempFactoryModules(
  run: (context: {
    loadPromptOverrideModule: () => Promise<
      typeof import("../lib/prompt-overrides")
    >;
    loadPromptCompilerModule: () => Promise<
      typeof import("../lib/prompt-compiler")
    >;
    loadProductionDefaultsModule: () => Promise<
      typeof import("../lib/production-defaults")
    >;
  }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prompt-overrides-"));
  await mkdir(path.join(tempDir, "data"), { recursive: true });
  process.chdir(tempDir);

  try {
    await run({
      loadPromptOverrideModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "prompt-overrides.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
      loadPromptCompilerModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "prompt-compiler.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
      loadProductionDefaultsModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "production-defaults.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
    });
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("prompt override resolution is backward compatible when no rules exist", { concurrency: false }, async () => {
  await withTempFactoryModules(async ({ loadPromptOverrideModule, loadPromptCompilerModule }) => {
    const promptOverrides = await loadPromptOverrideModule();
    const promptCompiler = await loadPromptCompilerModule();

    assert.deepEqual(promptOverrides.listPromptOverrideRules(), []);

    const compiledPlan = promptCompiler.compileVideoBriefForProduction({
      opportunity: buildOpportunityFixture(),
      brief: buildBriefFixture(),
    });

    assert.equal(compiledPlan.defaultsSnapshot.motionStyle, "Quiet cuts, restrained movement, and readable pacing.");
    assert.equal(compiledPlan.compositionSpec.musicMode, "none");
    assert.equal(compiledPlan.scenePrompts[0]?.overlayText, "Before you send this message");
  });
});

test("prompt overrides can reduce motion and simplify overlays for a recurring category", { concurrency: false }, async () => {
  await withTempFactoryModules(async ({ loadPromptOverrideModule, loadPromptCompilerModule }) => {
    const promptOverrides = await loadPromptOverrideModule();
    const promptCompiler = await loadPromptCompilerModule();

    await promptOverrides.upsertPromptOverrideRule({
      id: "parent-complaint-calmer-scenes",
      isActive: true,
      priority: 100,
      description: "Use calmer motion and simpler overlays for recurring parent-complaint email briefs.",
      conditions: {
        painPointCategories: ["parent-complaint-emails"],
      },
      overrides: {
        reduceMotion: true,
        simplifyOverlays: true,
      },
      changedAt: "2026-03-23T14:00:00.000Z",
      changedSource: "operator:test",
      changeNote: "Recurring escalation cases need quieter visuals.",
    });

    const compiledPlan = promptCompiler.compileVideoBriefForProduction({
      opportunity: buildOpportunityFixture(),
      brief: buildBriefFixture(),
    });

    assert.equal(
      compiledPlan.defaultsSnapshot.motionStyle,
      "Minimal movement, longer holds, and extra readable pacing.",
    );
    assert.equal(compiledPlan.scenePrompts[0]?.overlayText, "Before you send this");
    assert.equal(
      compiledPlan.scenePrompts[0]?.visualPrompt.includes(
        'Overlay text: "Before you send this"',
      ),
      true,
    );
  });
});

test("prompt overrides can suppress music and reorder visual providers based on deterministic conditions", { concurrency: false }, async () => {
  await withTempFactoryModules(async ({
    loadPromptOverrideModule,
    loadPromptCompilerModule,
    loadProductionDefaultsModule,
  }) => {
    const promptOverrides = await loadPromptOverrideModule();
    const promptCompiler = await loadPromptCompilerModule();
    const productionDefaults = await loadProductionDefaultsModule();
    const currentDefaults = productionDefaults.getActiveProductionDefaults();

    await productionDefaults.updateActiveProductionDefaults({
      voiceId: currentDefaults.voiceId,
      styleAnchorPrompt: currentDefaults.styleAnchorPrompt,
      motionStyle: currentDefaults.motionStyle,
      negativeConstraints: currentDefaults.negativeConstraints,
      aspectRatio: currentDefaults.aspectRatio,
      resolution: currentDefaults.resolution,
      captionStyle: currentDefaults.captionStyle,
      compositionDefaults: {
        ...currentDefaults.compositionDefaults,
        musicMode: "light-bed",
      },
      changedSource: "operator:test",
      changeNote: "Enable music by default for override test.",
    });

    await promptOverrides.upsertPromptOverrideRule({
      id: "high-risk-text-led-suppress-music",
      isActive: true,
      priority: 100,
      description: "Keep high-risk text-led briefs quieter and switch the visual order to the calmer provider.",
      conditions: {
        trustRisks: ["high"],
        briefFormats: ["text-led"],
      },
      overrides: {
        suppressMusic: true,
        preferredVisualProviders: ["kling-2", "runway-gen4"],
      },
      changedAt: "2026-03-23T14:05:00.000Z",
      changedSource: "operator:test",
      changeNote: "Trust-sensitive text-led output should avoid music and start with the calmer provider.",
    });

    const compiledPlan = promptCompiler.compileVideoBriefForProduction({
      opportunity: buildOpportunityFixture({
        trustRisk: "high",
        title: "Report-card comment wording feels risky",
        primaryPainPoint:
          "A report card comment could sound harsher than intended if the wording is off.",
      }),
      brief: buildBriefFixture({
        format: "text-led",
      }),
    });

    assert.equal(compiledPlan.compositionSpec.musicMode, "none");
    assert.deepEqual(compiledPlan.defaultsSnapshot.providerFallbacks.visuals, [
      "kling-2",
      "runway-gen4",
    ]);
  });
});

test("prompt overrides can react to prior regeneration and review patterns on the same opportunity", { concurrency: false }, async () => {
  await withTempFactoryModules(async ({ loadPromptOverrideModule, loadPromptCompilerModule }) => {
    const promptOverrides = await loadPromptOverrideModule();
    const promptCompiler = await loadPromptCompilerModule();

    await promptOverrides.upsertPromptOverrideRule({
      id: "repeat-poor-visuals-simplify",
      isActive: true,
      priority: 100,
      description: "Simplify overlays when the same opportunity already shows poor-visuals regeneration patterns.",
      conditions: {
        reasonCodesAnyOf: ["poor_visuals"],
        performanceEventTypesAnyOf: ["asset_regenerated"],
      },
      overrides: {
        simplifyOverlays: true,
      },
      changedAt: "2026-03-23T14:10:00.000Z",
      changedSource: "operator:test",
      changeNote: "Previous regeneration suggests the prompt should get cleaner.",
    });

    const compiledPlan = promptCompiler.compileVideoBriefForProduction({
      opportunity: buildOpportunityFixture({
        generationState: {
          videoBriefApprovedAt: null,
          videoBriefApprovedBy: null,
          factoryLifecycle: null,
          latestCostEstimate: null,
          latestActualCost: null,
          latestBudgetGuard: null,
          latestQualityCheck: null,
          latestRetryState: null,
          runLedger: [
            {
              regenerationReasonCodes: ["poor_visuals"],
              decisionStructuredReasons: ["poor_visuals"],
              qualityCheck: null,
            },
          ],
          comparisonRecords: [],
          attemptLineage: [],
          narrationSpec: null,
          videoPrompt: null,
          generationRequest: null,
          renderJob: {
            regenerationReasonCodes: ["poor_visuals"],
            qualityCheck: null,
          },
          renderedAsset: null,
          assetReview: {
            structuredReasons: ["poor_visuals"],
          },
          performanceSignals: [
            {
              id: "signal-1:performance-signal:asset_regenerated:brief-1:rendered-1:2026-03-23T10:00:00.000Z",
              opportunityId: "opportunity-1",
              videoBriefId: "brief-1",
              renderedAssetId: "rendered-1",
              eventType: "asset_regenerated",
              value: null,
              metadata: undefined,
              createdAt: "2026-03-23T10:00:00.000Z",
            },
          ],
        },
      }),
      brief: buildBriefFixture(),
    });

    assert.equal(compiledPlan.scenePrompts[1]?.overlayText, "Keep the tone calm");
  });
});
