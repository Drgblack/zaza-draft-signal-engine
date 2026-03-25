import assert from "node:assert/strict";
import test from "node:test";

import { contentOpportunitySchema } from "../lib/content-opportunities";
import { buildHookSet, generateHookSets } from "../lib/hook-engine";
import { generateMessageAngles } from "../lib/message-angles";

const baseOpportunity = contentOpportunitySchema.parse({
  opportunityId: "opportunity-hookset-test",
  signalId: "signal-hookset-test",
  title: "Parent email hesitation",
  opportunityType: "pain_point_opportunity",
  status: "approved_for_production",
  priority: "high",
  source: {
    signalId: "signal-hookset-test",
    sourceTitle: "Signal",
    href: "https://example.com",
    clusterId: null,
  },
  primaryPainPoint: "Teachers worry a parent message could escalate the situation.",
  painPointCategory: "parent-communication",
  teacherLanguage: [
    "I keep rewriting the message because I do not want it to land badly.",
  ],
  recommendedAngle: "A calmer pause before sending",
  recommendedHookDirection: "Lead with the risk before the resolution.",
  recommendedFormat: "short_video",
  recommendedPlatforms: ["linkedin", "x"],
  whyNow: "Parent communication pressure is peaking this term.",
  commercialPotential: "medium",
  trustRisk: "medium",
  riskSummary: "One rushed message can create a bigger complaint.",
  confidence: 0.8,
  historicalCostAvg: null,
  historicalApprovalRate: null,
  suggestedNextStep: "Pause before sending and check the tone once more.",
  skipReason: null,
  hookOptions: ["Before you send that reply, read this once more."],
  hookRanking: [
    {
      hook: "Before you send that reply, read this once more.",
      score: 93,
    },
  ],
  performanceDrivers: {
    hookStrength: 4,
    stakes: 5,
    viewerConnection: 5,
    perspectiveShift: 4,
  },
  intendedViewerEffect: "calm clarity with enough caution to act earlier",
  suggestedCTA: "Use the calmer reply framework.",
  productionComplexity: "low",
  growthIntelligence: {
    riskLevel: "medium",
    executionPriority: 79,
  },
  supportingSignals: ["Teachers are looking for calmer parent communication."],
  memoryContext: {
    bestCombo: null,
    weakCombo: null,
    revenuePattern: null,
    audienceCue: "Primary and secondary teachers",
    caution: "Pressure makes rushed wording sound sharper than intended.",
  },
  sourceSignalIds: ["signal-hookset-test"],
  createdAt: "2026-03-24T10:00:00.000Z",
  updatedAt: "2026-03-24T10:05:00.000Z",
  approvedAt: "2026-03-24T10:04:00.000Z",
  dismissedAt: null,
  founderSelectionStatus: "approved",
  selectedAngleId: null,
  selectedHookId: null,
  selectedVideoBrief: null,
  generationState: null,
  operatorNotes: null,
});

test("buildHookSet returns 3-5 ranked hook options with founder-facing metadata", () => {
  const messageAngles = generateMessageAngles(
    {
      ...baseOpportunity,
      messageAngles: [],
      hookSets: [],
    },
    "2026-03-24T10:06:00.000Z",
  );
  const hookSet = buildHookSet(
    {
      ...baseOpportunity,
      messageAngles,
      hookSets: [],
    },
    messageAngles[0]!,
  );

  assert.ok(hookSet.variants.length >= 3 && hookSet.variants.length <= 5);
  assert.equal(hookSet.primaryHook.isRecommended, true);
  assert.deepEqual(
    hookSet.variants.map((variant) => variant.rank),
    hookSet.variants.map((_, index) => index + 1),
  );
  assert.ok(
    hookSet.variants.every((variant) => variant.recommendedPlatforms.length >= 1),
  );
  assert.ok(
    hookSet.variants.every((variant) => variant.intendedEffect.length > 0),
  );
});

test("generateHookSets creates one persisted set per message angle", () => {
  const messageAngles = generateMessageAngles(
    {
      ...baseOpportunity,
      messageAngles: [],
      hookSets: [],
    },
    "2026-03-24T10:06:00.000Z",
  );
  const hookSets = generateHookSets(
    {
      ...baseOpportunity,
      messageAngles,
      hookSets: [],
    },
    messageAngles,
  );

  assert.equal(hookSets.length, messageAngles.length);
  assert.deepEqual(
    hookSets.map((hookSet) => hookSet.angleId).sort(),
    messageAngles.map((angle) => angle.id).sort(),
  );
});
