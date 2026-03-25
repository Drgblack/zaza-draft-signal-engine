import assert from "node:assert/strict";
import test from "node:test";

import { contentOpportunitySchema } from "../lib/content-opportunities";
import {
  buildMessageAngles,
  generateMessageAngles,
} from "../lib/message-angles";

const baseOpportunity = contentOpportunitySchema.parse({
  opportunityId: "opportunity-angle-test",
  signalId: "signal-angle-test",
  title: "Parent reply spiral",
  opportunityType: "pain_point_opportunity",
  status: "approved_for_production",
  priority: "high",
  source: {
    signalId: "signal-angle-test",
    sourceTitle: "Signal",
    href: "https://example.com",
    clusterId: null,
  },
  primaryPainPoint: "A parent reply can escalate when the tone is even slightly off.",
  painPointCategory: "parent-communication",
  teacherLanguage: [
    "I keep rereading the draft before I send it.",
    "One wrong sentence can turn into a bigger issue fast.",
  ],
  recommendedAngle: "Make the response feel safer before it feels smarter.",
  recommendedHookDirection: "empathetic and practical",
  recommendedFormat: "short_video",
  recommendedPlatforms: ["linkedin"],
  whyNow: "Communication pressure rises at the end of term.",
  commercialPotential: "high",
  trustRisk: "medium",
  riskSummary: "A small wording miss can escalate the situation.",
  confidence: 0.84,
  historicalCostAvg: null,
  historicalApprovalRate: null,
  suggestedNextStep: "Review the framing before hooks.",
  skipReason: null,
  hookOptions: null,
  hookRanking: [
    { hook: "If you keep rewriting the reply, this is why.", score: 91 },
  ],
  performanceDrivers: {
    viewerConnection: 5,
    stakes: 5,
    authenticityFit: 4,
  },
  intendedViewerEffect: "calm clarity with enough caution to act earlier",
  suggestedCTA: "Use the calmer reply framework.",
  productionComplexity: "low",
  growthIntelligence: {
    riskLevel: "medium",
    executionPriority: 82,
  },
  supportingSignals: ["The issue usually gets worse after one rushed send."],
  memoryContext: {
    bestCombo: "Teachers save the reply draft overnight and come back calmer.",
    weakCombo: null,
    revenuePattern: null,
    audienceCue: "Teachers handling difficult parent communication",
    caution: "The safest reply usually sounds calmer, not cleverer.",
  },
  sourceSignalIds: ["signal-angle-test"],
  createdAt: "2026-03-24T09:00:00.000Z",
  updatedAt: "2026-03-24T09:10:00.000Z",
  approvedAt: "2026-03-24T09:05:00.000Z",
  dismissedAt: null,
  founderSelectionStatus: "approved",
  selectedAngleId: null,
  selectedHookId: null,
  selectedVideoBrief: null,
  generationState: null,
  operatorNotes: null,
});

test("generateMessageAngles returns 2-3 ranked founder-facing angles", () => {
  const angles = generateMessageAngles(
    {
      ...baseOpportunity,
      messageAngles: [],
    },
    "2026-03-24T09:12:00.000Z",
  );

  assert.ok(angles.length >= 2 && angles.length <= 3);
  assert.deepEqual(
    angles.map((angle) => angle.rank),
    angles.map((_, index) => index + 1),
  );
  assert.equal(angles[0]?.isRecommended, true);
  assert.equal(new Set(angles.map((angle) => angle.framingType)).size, angles.length);
  assert.ok(
    angles.some((angle) =>
      angle.teacherVoiceLine.includes("I keep rereading the draft before I send it"),
    ),
  );
});

test("buildMessageAngles safely falls back when persisted angles are missing", () => {
  const opportunity = contentOpportunitySchema.parse({
    ...baseOpportunity,
    messageAngles: undefined,
  });
  const angles = buildMessageAngles(opportunity);

  assert.ok(angles.length >= 2 && angles.length <= 3);
  assert.equal(angles[0]?.rank, 1);
  assert.equal(angles[0]?.isRecommended, true);
});
