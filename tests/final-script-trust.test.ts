import assert from "node:assert/strict";
import test from "node:test";

import {
  contentOpportunitySchema,
  type ContentOpportunity,
} from "../lib/content-opportunities";
import { compileVideoBriefForProduction } from "../lib/prompt-compiler";
import { evaluateFinalAssembledScriptTrust } from "../lib/trust-evaluator";
import {
  videoBriefSchema,
  type VideoBrief,
} from "../lib/video-briefs";

function buildOpportunityFixture(
  overrides?: Partial<ContentOpportunity>,
): ContentOpportunity {
  return contentOpportunitySchema.parse({
    opportunityId: "opportunity-1",
    signalId: "signal-1",
    title: "Teacher email tone check",
    opportunityType: "pain_point_opportunity",
    status: "approved_for_production",
    priority: "high",
    source: {
      signalId: "signal-1",
      sourceTitle: "Signal",
      href: "https://example.com",
      clusterId: null,
    },
    primaryPainPoint: "A parent message can escalate if the reply lands badly.",
    painPointCategory: "parent-communication",
    teacherLanguage: ["I keep rereading the message before I send it."],
    recommendedAngle: "Calm reassurance before the reply goes out.",
    recommendedHookDirection: "empathetic",
    recommendedFormat: "short_video",
    recommendedPlatforms: ["linkedin"],
    whyNow: "Parent communication pressure is high this week.",
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
    sourceSignalIds: ["signal-1"],
    createdAt: "2026-03-23T10:00:00.000Z",
    updatedAt: "2026-03-23T10:00:00.000Z",
    approvedAt: "2026-03-23T10:01:00.000Z",
    dismissedAt: null,
    founderSelectionStatus: "approved",
    selectedAngleId: null,
    selectedHookId: null,
    selectedVideoBrief: null,
    generationState: null,
    operatorNotes: null,
    ...overrides,
  });
}

function buildBriefFixture(
  overrides?: Partial<VideoBrief>,
): VideoBrief {
  return videoBriefSchema.parse({
    id: "brief-1",
    opportunityId: "opportunity-1",
    angleId: "angle-1",
    hookSetId: "hook-set-1",
    title: "Pause before you send it",
    hook: "Before you send this message, pause once and read it like a parent would.",
    format: "talking-head",
    durationSec: 30,
    goal: "Help teachers catch risky tone before it escalates.",
    tone: "teacher-real",
    structure: [
      {
        order: 1,
        purpose: "hook",
        guidance: "Open with the risky draft moment.",
      },
      {
        order: 2,
        purpose: "recognition",
        guidance: "Name the pressure of trying to sound clear without escalating.",
      },
      {
        order: 3,
        purpose: "cta",
        guidance: "Offer the calmer rewrite path.",
      },
    ],
    visualDirection: "Simple portrait shot with calm classroom context.",
    overlayLines: [
      "Before you send this message",
      "Catch risky tone early",
      "Pause before replying",
    ],
    cta: "Try Zaza Draft",
    contentType: null,
    finalScriptTrustScore: null,
    productionNotes: ["No exaggerated claims", "No urgency language"],
    ...overrides,
  });
}

test("evaluateFinalAssembledScriptTrust returns a safe score for grounded teacher-real narration", () => {
  const opportunity = buildOpportunityFixture();
  const brief = buildBriefFixture();

  const result = evaluateFinalAssembledScriptTrust({
    opportunity,
    brief,
    narrationScript:
      "Before you send this message, pause once and read it like a parent would. I keep rereading the message before I send it. This helps teachers catch risky tone before it escalates and try Zaza Draft with more confidence.",
  });

  assert.equal(result.status, "safe");
  assert.equal(result.adjusted, false);
  assert.equal(result.score >= 85, true);
});

test("evaluateFinalAssembledScriptTrust degrades sharply for manipulative or unsafe narration", () => {
  const opportunity = buildOpportunityFixture();
  const brief = buildBriefFixture();

  const result = evaluateFinalAssembledScriptTrust({
    opportunity,
    brief,
    narrationScript:
      "Urgent. This is a disaster if you wait. Guaranteed fix right now.",
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.adjusted, true);
  assert.equal(result.score < 70, true);
  assert.equal(result.reasons.includes("manipulative-urgency"), true);
  assert.equal(result.reasons.includes("exaggerated-fear"), true);
  assert.equal(result.reasons.includes("overpromising"), true);
  assert.equal(result.reasons.includes("final-script-language-not-preserved"), true);
});

test("compileVideoBriefForProduction persists final script trust separately from broad compiled-plan trust", () => {
  const opportunity = buildOpportunityFixture();
  const brief = buildBriefFixture();

  const compiledPlan = compileVideoBriefForProduction({
    opportunity,
    brief,
  });
  const expected = evaluateFinalAssembledScriptTrust({
    opportunity,
    brief,
    narrationScript: compiledPlan.narrationSpec.script,
  });

  assert.deepEqual(compiledPlan.finalScriptTrustAssessment, expected);
  assert.notDeepEqual(compiledPlan.trustAssessment, compiledPlan.finalScriptTrustAssessment);
  assert.equal(compiledPlan.finalScriptTrustAssessment?.score !== null, true);
});
