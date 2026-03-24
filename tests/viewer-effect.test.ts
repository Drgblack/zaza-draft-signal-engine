import assert from "node:assert/strict";
import test from "node:test";

import type { ContentOpportunity } from "../lib/content-opportunities";
import { scoreOpportunity } from "../lib/performance-scorer";
import { determineViewerEffect, suggestCTA } from "../lib/viewer-effect";

function buildOpportunityFixture(): ContentOpportunity {
  const opportunity: ContentOpportunity = {
    opportunityId: "opportunity-viewer-effect-1",
    signalId: "signal-viewer-effect-1",
    title: "Teacher message hesitation before a complaint escalates",
    opportunityType: "pain_point_opportunity",
    status: "open",
    priority: "high",
    source: {
      signalId: "signal-viewer-effect-1",
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "A rushed parent email could escalate into a complaint.",
    painPointCategory: null,
    teacherLanguage: ["I keep rewriting the message because I do not want it to land badly."],
    recommendedAngle: "Calm caution before sending",
    recommendedHookDirection: "Lead with the risk before the resolution.",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "Most teachers recognise this exact pressure.",
    commercialPotential: "medium",
    trustRisk: "medium",
    riskSummary: "This could escalate quickly if the wording is off.",
    confidence: null,
    historicalCostAvg: null,
    historicalApprovalRate: null,
    suggestedNextStep: "Pause before sending and review the tone once more.",
    skipReason: null,
    hookOptions: ["This could escalate quickly.", "Before you send this..."],
    hookRanking: [
      { hook: "This could escalate quickly.", score: 21 },
      { hook: "Before you send this...", score: 19 },
    ],
    performanceDrivers: null,
    intendedViewerEffect: null,
    suggestedCTA: null,
    productionComplexity: null,
    growthIntelligence: null,
    supportingSignals: ["Emotional tension is high in parent communication."],
    memoryContext: {
      bestCombo: null,
      weakCombo: null,
      revenuePattern: null,
      audienceCue: "Broad teacher-parent scenario",
      caution: "What sounds fine at first can land badly.",
    },
    sourceSignalIds: ["signal-viewer-effect-1"],
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
  };

  return {
    ...opportunity,
    performanceDrivers: scoreOpportunity(opportunity),
  };
}

test("viewer effect and CTA always return allowed populated values", () => {
  const opportunity = buildOpportunityFixture();
  const viewerEffect = determineViewerEffect(opportunity);
  const cta = suggestCTA(opportunity);

  assert.equal(
    ["recognition", "relief", "caution", "validation", "confidence"].includes(viewerEffect),
    true,
  );
  assert.equal(
    [
      "Try Zaza Draft",
      "Pause before sending",
      "Rewrite safely",
      "Download template",
    ].includes(cta),
    true,
  );
});

test("risk-heavy send scenarios map to caution with a pause CTA", () => {
  const opportunity = buildOpportunityFixture();

  assert.equal(determineViewerEffect(opportunity), "caution");
  assert.equal(suggestCTA(opportunity), "Pause before sending");
});
