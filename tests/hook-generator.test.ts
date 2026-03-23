import assert from "node:assert/strict";
import test from "node:test";

import type { ContentOpportunity } from "../lib/content-opportunities";
import { generateHooks, rankHooks } from "../lib/hook-generator";

function buildOpportunityFixture(): ContentOpportunity {
  return {
    opportunityId: "opportunity-hooks-1",
    signalId: "signal-hooks-1",
    title: "Teacher message hesitation",
    opportunityType: "pain_point_opportunity",
    status: "open",
    priority: "high",
    source: {
      signalId: "signal-hooks-1",
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "Teachers worry a parent message could escalate the situation.",
    teacherLanguage: ["I keep rewriting the message because I do not want it to land badly."],
    recommendedAngle: "A calmer pause before sending",
    recommendedHookDirection: "Lead with the risk before the resolution.",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "Parent communication pressure is peaking this term.",
    commercialPotential: "medium",
    trustRisk: "medium",
    riskSummary: "One rushed message can create a bigger complaint.",
    suggestedNextStep: "Pause before sending and check the tone once more.",
    hookOptions: null,
    hookRanking: null,
    performanceDrivers: null,
    intendedViewerEffect: null,
    suggestedCTA: null,
    productionComplexity: null,
    growthIntelligence: null,
    supportingSignals: ["Teachers are looking for calmer parent communication."],
    memoryContext: {
      bestCombo: null,
      weakCombo: null,
      revenuePattern: null,
      audienceCue: "Primary and secondary teachers",
      caution: "Pressure makes rushed wording sound sharper than intended.",
    },
    sourceSignalIds: ["signal-hooks-1"],
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

test("generateHooks always returns multiple hook options for an opportunity", () => {
  const opportunity = buildOpportunityFixture();

  const hooks = generateHooks(opportunity);

  assert.equal(hooks.length >= 5, true);
  assert.equal(hooks.length <= 10, true);
  assert.equal(hooks.includes("This could escalate quickly."), true);
  assert.equal(hooks.includes("Before you send this..."), true);
});

test("rankHooks returns sorted scores for generated hooks", () => {
  const opportunity = buildOpportunityFixture();
  const hooks = generateHooks(opportunity);

  const ranking = rankHooks(hooks, opportunity);

  assert.equal(ranking.length, hooks.length);
  assert.deepEqual(
    ranking.map((item) => item.hook).sort(),
    hooks.slice().sort(),
  );
  assert.equal(ranking[0].score >= ranking[ranking.length - 1].score, true);
  assert.equal(ranking.every((item) => item.score >= 5 && item.score <= 25), true);
});
