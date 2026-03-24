import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildBridgeOpportunitiesResponse,
  bridgeOpportunitySchema,
} from "../lib/bridge-opportunities";
import { getZazaConnectBridgeBlobAccess } from "../lib/zaza-connect-bridge-config";

const bridgeFixture = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests/fixtures/bridge-opportunities-response.json"),
    "utf8",
  ),
);

test("getZazaConnectBridgeBlobAccess defaults to private for the bridge store", () => {
  const original = process.env.ZAZA_CONNECT_BRIDGE_BLOB_ACCESS;
  delete process.env.ZAZA_CONNECT_BRIDGE_BLOB_ACCESS;

  assert.equal(getZazaConnectBridgeBlobAccess(), "private");

  process.env.ZAZA_CONNECT_BRIDGE_BLOB_ACCESS = "public";
  assert.equal(getZazaConnectBridgeBlobAccess(), "public");

  if (original === undefined) {
    delete process.env.ZAZA_CONNECT_BRIDGE_BLOB_ACCESS;
  } else {
    process.env.ZAZA_CONNECT_BRIDGE_BLOB_ACCESS = original;
  }
});

test("buildBridgeOpportunitiesResponse returns empty opportunities when no export exists", () => {
  const response = buildBridgeOpportunitiesResponse(null);

  assert.equal(response.success, true);
  assert.equal(typeof response.schemaVersion, "string");
  assert.equal(typeof response.producerVersion, "string");
  assert.equal(response.exportId, null);
  assert.equal(response.generatedAt, null);
  assert.equal(response.contentFingerprint, null);
  assert.deepEqual(response.opportunities, []);
  assert.deepEqual(response.strongContentCandidates, []);
  assert.equal(response.metrics.connectOpportunityCount, 0);
  assert.match(response.message, /No Zaza Connect export/i);
});

test("buildBridgeOpportunitiesResponse exposes latest strong content candidates under both bridge keys", () => {
  const opportunity = {
    candidateId: "candidate-1",
    signalId: "signal-1",
    sourceTitle: "Teacher trust pattern",
    platform: "LinkedIn",
    expectedOutcomeTier: "high" as const,
    reason: "High-trust teacher-first candidate.",
    href: "/signals/signal-1",
    primaryPainPoint: "Teachers need a lower-friction trust-building angle.",
    teacherLanguage: [],
    audienceSegment: null,
    funnelStage: "Consideration",
    commercialPotential: "high" as const,
    trustRisk: "low" as const,
    recommendedAngle: "Lead with the teacher-trust proof point.",
    recommendedHookDirection: "Open with the trust gap and the concrete classroom payoff.",
    recommendedFormat: "text" as const,
    recommendedPlatforms: ["linkedin"],
    whyNow: "This week’s pack ranked it highly.",
    proofPoints: ["High-trust teacher-first candidate."],
    trustNotes: [],
    sourceSignalIds: ["signal-1"],
  };
  bridgeOpportunitySchema.parse(opportunity);
  const exportPayload = {
    schemaVersion: "2026-03-24.1",
    producerVersion: "test-sha",
    exportId: "connect-export:test",
    generatedAt: "2026-03-23T09:00:00.000Z",
    weekStartDate: "2026-03-23",
    contentFingerprint: "abc12345def67890",
    metrics: {
      totalSignalsAvailable: 10,
      visibleSignalsConsidered: 8,
      approvalReadySignals: 4,
      filteredOutSignals: 4,
      weeklyPostingPackItemCount: 3,
      fallbackCandidateCount: 0,
      usedFallbackCandidates: false,
      strongContentCandidateCount: 1,
      connectOpportunityCount: 1,
      missingProofPointsCount: 0,
      missingSourceSignalIdsCount: 0,
      missingTeacherLanguageCount: 1,
    },
    strongContentCandidates: [opportunity],
    outreachRelevantThemes: [],
    influencerRelevantPosts: [],
    campaignSupportSignals: [],
    distributionOpportunities: [],
    relationshipContextHints: [],
  };

  const response = buildBridgeOpportunitiesResponse(exportPayload);

  assert.deepEqual(response, bridgeFixture);
});
