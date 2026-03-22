import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBridgeOpportunitiesResponse,
  bridgeOpportunitySchema,
} from "../lib/bridge-opportunities";

test("buildBridgeOpportunitiesResponse returns empty opportunities when no export exists", () => {
  const response = buildBridgeOpportunitiesResponse(null);

  assert.equal(response.success, true);
  assert.equal(response.exportId, null);
  assert.equal(response.generatedAt, null);
  assert.deepEqual(response.opportunities, []);
  assert.deepEqual(response.strongContentCandidates, []);
  assert.match(response.message, /No Zaza Connect export/i);
});

test("buildBridgeOpportunitiesResponse exposes latest strong content candidates under both bridge keys", () => {
  const opportunity = bridgeOpportunitySchema.parse({
    candidateId: "candidate-1",
    signalId: "signal-1",
    sourceTitle: "Teacher trust pattern",
    platform: "LinkedIn",
    expectedOutcomeTier: "high",
    reason: "High-trust teacher-first candidate.",
    href: "/signals/signal-1",
  });
  const exportPayload = {
    exportId: "connect-export:test",
    generatedAt: "2026-03-22T10:00:00.000Z",
    weekStartDate: "2026-03-16",
    strongContentCandidates: [opportunity],
    outreachRelevantThemes: [],
    influencerRelevantPosts: [],
    campaignSupportSignals: [],
    distributionOpportunities: [],
    relationshipContextHints: [],
  };

  const response = buildBridgeOpportunitiesResponse(exportPayload);

  assert.equal(response.success, true);
  assert.equal(response.exportId, exportPayload.exportId);
  assert.equal(response.generatedAt, exportPayload.generatedAt);
  assert.deepEqual(response.opportunities, exportPayload.strongContentCandidates);
  assert.deepEqual(
    response.strongContentCandidates,
    exportPayload.strongContentCandidates,
  );
});
