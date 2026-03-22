import test from "node:test";
import assert from "node:assert/strict";

import {
  firstSpecificBridgeValue,
  getBridgeDiversityPenalty,
} from "../lib/connect-bridge-fallback-quality";

test("firstSpecificBridgeValue skips generic bridge support phrases", () => {
  const value = firstSpecificBridgeValue([
    "Playbook support exists",
    "Missing Final draft",
    "Concrete classroom tension creates stronger comment intent on LinkedIn.",
  ]);

  assert.equal(
    value,
    "Concrete classroom tension creates stronger comment intent on LinkedIn.",
  );
});

test("getBridgeDiversityPenalty penalizes near-duplicate candidates more than differentiated ones", () => {
  const selected = [
    {
      platform: "LinkedIn",
      audienceSegment: "Mentor Teachers",
      funnelStage: "Trust",
      recommendedFormat: "text",
      recommendedAngle: "Teachers need a calmer script before sending a parent reply.",
      recommendedHookDirection:
        'Start with "When a teacher re-reads the same parent email three times." and land the opening with "You are not behind. You are overloaded." for LinkedIn while keeping the posture trust first.',
    },
  ];

  const duplicatePenalty = getBridgeDiversityPenalty(
    {
      platform: "LinkedIn",
      audienceSegment: "Mentor Teachers",
      funnelStage: "Trust",
      recommendedFormat: "text",
      recommendedAngle: "Teachers need a calmer script before sending a parent reply.",
      recommendedHookDirection:
        'Start with "When a teacher re-reads the same parent email three times." and land the opening with "You are not behind. You are overloaded." for LinkedIn while keeping the posture trust first.',
    },
    selected,
  );

  const differentiatedPenalty = getBridgeDiversityPenalty(
    {
      platform: "Reddit",
      audienceSegment: "School Leaders",
      funnelStage: "Awareness",
      recommendedFormat: "multi_asset",
      recommendedAngle:
        "A discussion-first angle surfaces the hidden labour behind behaviour notes.",
      recommendedHookDirection:
        'Start with "When behaviour logging becomes the end of the day’s second job." and land the opening with "The work after the bell is still work." for Reddit while keeping the posture trust first.',
    },
    selected,
  );

  assert.ok(duplicatePenalty > differentiatedPenalty);
});
