import assert from "node:assert/strict";
import test from "node:test";

import {
  contentOpportunitySchema,
} from "../lib/content-opportunities";
import { videoBriefSchema } from "../lib/video-briefs";

test("contentOpportunitySchema backfills additive spec-alignment fields for legacy records", () => {
  const legacyOpportunity = contentOpportunitySchema.parse({
    opportunityId: "opportunity-legacy-1",
    signalId: "signal-legacy-1",
    title: "Teacher email tone risk",
    opportunityType: "pain_point_opportunity",
    status: "open",
    priority: "high",
    source: {
      signalId: "signal-legacy-1",
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "A parent email could escalate if the tone is off.",
    teacherLanguage: ["I keep rereading the message before I send it."],
    recommendedAngle: "Calm reassurance",
    recommendedHookDirection: "Lead with the risk before the resolution.",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "Parent communication is peaking this week.",
    commercialPotential: "high",
    trustRisk: "medium",
    riskSummary: null,
    suggestedNextStep: "Pause before sending and review the tone.",
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
    sourceSignalIds: ["signal-legacy-1"],
    createdAt: "2026-03-23T10:00:00.000Z",
    updatedAt: "2026-03-23T10:00:00.000Z",
    approvedAt: null,
    dismissedAt: null,
    founderSelectionStatus: "pending",
    selectedAngleId: null,
    selectedHookId: null,
    selectedVideoBrief: null,
    generationState: null,
    operatorNotes: null,
  });

  assert.equal(legacyOpportunity.painPointCategory, null);
  assert.equal(legacyOpportunity.confidence, null);
  assert.equal(legacyOpportunity.historicalCostAvg, null);
  assert.equal(legacyOpportunity.historicalApprovalRate, null);
  assert.equal(legacyOpportunity.skipReason, null);
});

test("videoBriefSchema backfills additive spec-alignment fields for legacy briefs", () => {
  const legacyBrief = videoBriefSchema.parse({
    id: "brief-legacy-1",
    opportunityId: "opportunity-legacy-1",
    angleId: "angle-legacy-1",
    hookSetId: "hook-set-legacy-1",
    title: "Pause before you send it",
    hook: "Before you send this, read it once like a parent would.",
    format: "talking-head",
    durationSec: 30,
    goal: "Drive trials",
    tone: "teacher-real",
    structure: [
      { order: 1, purpose: "hook", guidance: "Open with the risky draft moment." },
      { order: 2, purpose: "recognition", guidance: "Name the emotional pressure." },
      { order: 3, purpose: "cta", guidance: "Offer the safer rewrite path." },
    ],
    visualDirection: "Simple portrait shot.",
    overlayLines: ["Before you send this", "Pause before replying"],
    cta: "Try Zaza Draft",
    productionNotes: ["No exaggerated claims"],
  });

  assert.equal(legacyBrief.contentType, null);
  assert.equal(legacyBrief.finalScriptTrustScore, null);
});

test("spec-alignment fields survive parse and serialize paths", () => {
  const serializedOpportunity = JSON.stringify(
    contentOpportunitySchema.parse({
      opportunityId: "opportunity-serialised-1",
      signalId: "signal-serialised-1",
      title: "Teacher message hesitation",
      opportunityType: "pain_point_opportunity",
      status: "approved_for_production",
      priority: "medium",
      source: {
        signalId: "signal-serialised-1",
        sourceTitle: "Signal",
        href: "https://example.com",
        clusterId: null,
      },
      primaryPainPoint: "A reply draft feels risky.",
      painPointCategory: "parent-communication",
      teacherLanguage: ["I know this email needs another pass."],
      recommendedAngle: "Calm caution before sending",
      recommendedHookDirection: "Lead with the risk.",
      recommendedFormat: "short_video",
      recommendedPlatforms: ["linkedin"],
      whyNow: "Teachers are feeling this right now.",
      commercialPotential: "medium",
      trustRisk: "low",
      riskSummary: null,
      confidence: 0.72,
      historicalCostAvg: 1.18,
      historicalApprovalRate: 0.64,
      suggestedNextStep: "Generate a video.",
      skipReason: "held for later",
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
      sourceSignalIds: ["signal-serialised-1"],
      createdAt: "2026-03-23T10:00:00.000Z",
      updatedAt: "2026-03-23T10:00:00.000Z",
      approvedAt: "2026-03-23T10:01:00.000Z",
      dismissedAt: null,
      founderSelectionStatus: "approved",
      selectedAngleId: null,
      selectedHookId: null,
      selectedVideoBrief: videoBriefSchema.parse({
        id: "brief-serialised-1",
        opportunityId: "opportunity-serialised-1",
        angleId: "angle-serialised-1",
        hookSetId: "hook-set-serialised-1",
        title: "Pause before you send it",
        hook: "Before you send this, read it once like a parent would.",
        format: "talking-head",
        durationSec: 30,
        goal: "Drive trials",
        tone: "teacher-real",
        structure: [
          { order: 1, purpose: "hook", guidance: "Open with the risky draft moment." },
          { order: 2, purpose: "recognition", guidance: "Name the emotional pressure." },
          { order: 3, purpose: "cta", guidance: "Offer the safer rewrite path." },
        ],
        visualDirection: "Simple portrait shot.",
        overlayLines: ["Before you send this", "Pause before replying"],
        cta: "Try Zaza Draft",
        contentType: "teacher_reactive",
        finalScriptTrustScore: 88,
        productionNotes: ["No exaggerated claims"],
      }),
      generationState: null,
      operatorNotes: null,
    }),
  );

  const reparsedOpportunity = contentOpportunitySchema.parse(
    JSON.parse(serializedOpportunity),
  );

  assert.equal(reparsedOpportunity.painPointCategory, "parent-communication");
  assert.equal(reparsedOpportunity.confidence, 0.72);
  assert.equal(reparsedOpportunity.historicalCostAvg, 1.18);
  assert.equal(reparsedOpportunity.historicalApprovalRate, 0.64);
  assert.equal(reparsedOpportunity.skipReason, "held for later");
  assert.equal(reparsedOpportunity.selectedVideoBrief?.contentType, "teacher_reactive");
  assert.equal(reparsedOpportunity.selectedVideoBrief?.finalScriptTrustScore, 88);
});
