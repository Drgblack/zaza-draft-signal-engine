import assert from "node:assert/strict";
import test from "node:test";

import type { ContentOpportunity } from "../lib/content-opportunities";
import { recommendFormat } from "../lib/format-recommender";

function buildOpportunityFixture(
  overrides: Partial<ContentOpportunity> = {},
): ContentOpportunity {
  return {
    opportunityId: "opportunity-format-1",
    signalId: "signal-format-1",
    title: "Teacher risk before a parent complaint",
    opportunityType: "pain_point_opportunity",
    status: "open",
    priority: "high",
    source: {
      signalId: "signal-format-1",
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "A rushed parent email could escalate into a complaint.",
    teacherLanguage: ["I keep pausing before I send because it feels risky."],
    recommendedAngle: "Calm caution before sending",
    recommendedHookDirection: "Lead with the risk and the emotional hesitation.",
    recommendedFormat: "text",
    recommendedPlatforms: ["linkedin"],
    whyNow: "Most teachers recognise this scenario immediately.",
    commercialPotential: "medium",
    trustRisk: "medium",
    riskSummary: "This can escalate quickly if the wording lands badly.",
    suggestedNextStep: "Pause before sending and review the tone.",
    hookOptions: null,
    hookRanking: null,
    performanceDrivers: null,
    intendedViewerEffect: null,
    suggestedCTA: null,
    productionComplexity: null,
    growthIntelligence: null,
    supportingSignals: ["Broad teacher-parent communication scenario."],
    memoryContext: {
      bestCombo: null,
      weakCombo: null,
      revenuePattern: null,
      audienceCue: "Teacher-parent communication",
      caution: "A small message can become a bigger issue.",
    },
    sourceSignalIds: ["signal-format-1"],
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
    ...overrides,
  };
}

test("recommendFormat always returns a supported delivery format", () => {
  const recommendedFormat = recommendFormat(buildOpportunityFixture());

  assert.equal(
    ["text", "carousel", "short_video", "multi_asset"].includes(recommendedFormat),
    true,
  );
});

test("recommendFormat prefers carousel for perspective-shift opportunities", () => {
  const recommendedFormat = recommendFormat(
    buildOpportunityFixture({
      recommendedAngle: "Reframe a common teacher belief",
      primaryPainPoint: "A misconception is making the parent message worse.",
      trustRisk: "low",
    }),
  );

  assert.equal(recommendedFormat, "carousel");
});
