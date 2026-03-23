import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGrowthIntelligence,
  determineExecutionPath,
} from "../lib/growth-intelligence";

const neutralLearningAdjustment = {
  sampleSize: 0,
  formatSuccessRate: null,
  hookTypeSuccessRate: null,
  executionPathSuccessRate: null,
  averageRetries: null,
  costPerSuccess: null,
  priorityDelta: 0,
  learningValueDelta: 0,
  reason: null,
} as const;

test("buildGrowthIntelligence scores a high-impact low-risk candidate strongly", () => {
  const result = buildGrowthIntelligence({
    signal: {
      sourceTitle: "Teacher confidence signal",
      teacherPainPoint: "Teachers need a calmer way to review difficult parent emails.",
      contentAngle: "A practical confidence-building reframe",
      severityScore: 2,
      signalCategory: "Stress",
      platformPriority: "LinkedIn First",
      campaignId: "campaign_teacher-confidence",
      signalNoveltyScore: 82,
      similarityToExistingContent: 18,
      recommendedFormat: "short_video",
      performanceDrivers: {
        stakes: 4,
        generalistAppeal: 4,
        viewerConnection: 4,
        conversionPotential: 4,
      },
      intendedViewerEffect: "confidence",
      productionComplexity: "low",
    },
    activeCampaignIds: ["campaign_teacher-confidence"],
    campaignsExist: true,
    historicalExecutions: [
      {
        topicFingerprint: "low stakes planning reminders",
        recommendedFormat: "carousel",
        intendedViewerEffect: "recognition",
      },
    ],
    learningAdjustment: neutralLearningAdjustment,
  });

  assert.equal(typeof result.executionPriority, "number");
  assert.equal((result.executionPriority ?? 0) >= 70, true);
  assert.equal(result.riskLevel, "low");
  assert.equal((result.learningValue ?? 0) >= 60, true);
  assert.equal((result.campaignFit ?? 0) >= 80, true);
  assert.equal(result.reasoning?.includes("Impact potential"), true);
});

test("buildGrowthIntelligence reduces priority and routes to review for high-risk sensitive topics", () => {
  const result = buildGrowthIntelligence({
    signal: {
      sourceTitle: "Escalating parent complaint",
      teacherPainPoint: "A parent complaint could escalate into a legal issue.",
      riskToTeacher: "This could escalate into a disciplinary complaint.",
      contentAngle: "Quiet risk teachers miss",
      severityScore: 3,
      signalCategory: "Risk",
      platformPriority: "X First",
      signalNoveltyScore: 68,
      similarityToExistingContent: 52,
      recommendedFormat: "short_video",
      performanceDrivers: {
        stakes: 5,
        generalistAppeal: 3,
        viewerConnection: 4,
      },
      intendedViewerEffect: "caution",
      productionComplexity: "high",
    },
    historicalExecutions: [
      {
        topicFingerprint: "a parent complaint could escalate into a legal issue",
        recommendedFormat: "short_video",
        intendedViewerEffect: "caution",
      },
    ],
    learningAdjustment: neutralLearningAdjustment,
  });

  assert.equal(result.riskLevel, "high");
  assert.equal(result.executionPath, "review");
  assert.equal((result.executionPriority ?? 100) <= 65, true);
  assert.equal(result.reasoning?.includes("risk high"), true);
});

test("buildGrowthIntelligence applies learning-loop priority and learning adjustments transparently", () => {
  const result = buildGrowthIntelligence({
    signal: {
      sourceTitle: "Teacher confidence signal",
      teacherPainPoint: "Teachers need a calmer way to review difficult parent emails.",
      contentAngle: "A practical confidence-building reframe",
      severityScore: 2,
      signalCategory: "Stress",
      platformPriority: "LinkedIn First",
      recommendedFormat: "short_video",
      performanceDrivers: {
        stakes: 4,
        generalistAppeal: 4,
        viewerConnection: 4,
      },
      intendedViewerEffect: "confidence",
      productionComplexity: "low",
    },
    learningAdjustment: {
      ...neutralLearningAdjustment,
      priorityDelta: 6,
      learningValueDelta: 5,
      reason: "short_video is converting similar opportunities strongly.",
    },
  });

  assert.equal((result.executionPriority ?? 0) >= 70, true);
  assert.equal((result.learningValue ?? 0) >= 60, true);
  assert.equal(
    result.reasoning?.includes("learning loop short_video is converting similar opportunities strongly."),
    true,
  );
});

test("determineExecutionPath routes medium-priority campaign-aligned opportunities to campaigns", () => {
  const executionPath = determineExecutionPath({
    signal: {
      sourceTitle: "Campaign-aligned support signal",
      teacherPainPoint: "Teachers need a better structure for parent updates.",
      contentAngle: "Simple system for calmer parent communication",
      severityScore: 2,
      platformPriority: "LinkedIn First",
      campaignId: "campaign_teacher-confidence",
      recommendedFormat: "carousel",
      performanceDrivers: {
        stakes: 3,
        generalistAppeal: 4,
        viewerConnection: 3,
      },
      intendedViewerEffect: "confidence",
      productionComplexity: "medium",
    },
    activeCampaignIds: ["campaign_teacher-confidence"],
    campaignsExist: true,
    executionPriority: 61,
    riskLevel: "low",
    campaignFit: 92,
    learningValue: 52,
    strategicValue: 66,
  });

  assert.equal(executionPath, "campaigns");
});

test("determineExecutionPath routes high-learning opportunities to connect", () => {
  const executionPath = determineExecutionPath({
    signal: {
      sourceTitle: "Novel pattern signal",
      teacherPainPoint: "Teachers keep second-guessing what sounds too blunt.",
      contentAngle: "Unexpected perspective on emotional drafting",
      severityScore: 1,
      platformPriority: "Reddit First",
      recommendedFormat: "text",
      performanceDrivers: {
        stakes: 2,
        generalistAppeal: 3,
        viewerConnection: 4,
      },
      intendedViewerEffect: "recognition",
      productionComplexity: "low",
    },
    executionPriority: 58,
    riskLevel: "low",
    learningValue: 82,
    strategicValue: 72,
    campaignFit: 38,
  });

  assert.equal(executionPath, "connect");
});

test("determineExecutionPath holds low-priority opportunities", () => {
  const executionPath = determineExecutionPath({
    signal: {
      sourceTitle: "Low-priority evergreen signal",
      teacherPainPoint: "A minor phrasing reminder for routine updates.",
      contentAngle: "Tiny copy polish",
      severityScore: 1,
      platformPriority: "LinkedIn First",
      recommendedFormat: "text",
      performanceDrivers: {
        stakes: 1,
        generalistAppeal: 2,
        viewerConnection: 2,
      },
      intendedViewerEffect: "relief",
      productionComplexity: "low",
    },
    executionPriority: 34,
    riskLevel: "low",
    learningValue: 41,
    strategicValue: 36,
    campaignFit: 30,
  });

  assert.equal(executionPath, "hold");
});
