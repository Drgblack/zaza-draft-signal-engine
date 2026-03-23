import assert from "node:assert/strict";
import test from "node:test";

import type { ContentOpportunity } from "../lib/content-opportunities";
import { scoreOpportunity } from "../lib/performance-scorer";

function buildOpportunityFixture(): ContentOpportunity {
  return {
    opportunityId: "opportunity-performance-1",
    signalId: "signal-performance-1",
    title: "Teacher message risk before a parent complaint",
    opportunityType: "evergreen_opportunity",
    status: "open",
    priority: "high",
    source: {
      signalId: "signal-performance-1",
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "A rushed teacher message could escalate into a complaint.",
    teacherLanguage: ["I keep rewriting the email because it feels tense and risky."],
    recommendedAngle: "A calmer way to handle a high-pressure teacher scenario",
    recommendedHookDirection: "Lead with the risk and emotional tension.",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "This is a broad teacher scenario that almost everyone recognises.",
    commercialPotential: "high",
    trustRisk: "low",
    riskSummary: "The risk is not the message alone. It is how quickly it can escalate.",
    suggestedNextStep: "Pause before sending and review the wording.",
    hookOptions: ["This could escalate quickly.", "Before you send this..."],
    hookRanking: [
      { hook: "This could escalate quickly.", score: 22 },
      { hook: "Before you send this...", score: 19 },
    ],
    performanceDrivers: null,
    intendedViewerEffect: null,
    suggestedCTA: null,
    productionComplexity: null,
    supportingSignals: ["Most teachers recognise this exact emotional tension."],
    memoryContext: {
      bestCombo: null,
      weakCombo: null,
      revenuePattern: null,
      audienceCue: "Broad teacher-parent communication scenario",
      caution: "What feels minor can go wrong fast.",
    },
    sourceSignalIds: ["signal-performance-1"],
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
}

test("scoreOpportunity always returns a complete performance driver structure", () => {
  const scores = scoreOpportunity(buildOpportunityFixture());

  assert.deepEqual(Object.keys(scores).sort(), [
    "authenticityFit",
    "brandAlignment",
    "conversionPotential",
    "generalistAppeal",
    "hookStrength",
    "perspectiveShift",
    "stakes",
    "viewerConnection",
  ]);
  assert.equal(
    Object.values(scores).every((value) => Number.isInteger(value) && value >= 1 && value <= 5),
    true,
  );
});

test("scoreOpportunity boosts stakes, viewer connection, and generalist appeal from heuristics", () => {
  const scores = scoreOpportunity(buildOpportunityFixture());

  assert.equal((scores.stakes ?? 0) >= 4, true);
  assert.equal((scores.viewerConnection ?? 0) >= 4, true);
  assert.equal((scores.generalistAppeal ?? 0) >= 4, true);
});
