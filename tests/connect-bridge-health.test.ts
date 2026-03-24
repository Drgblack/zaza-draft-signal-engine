import test from "node:test";
import assert from "node:assert/strict";

import { buildConnectBridgeHealthSnapshot } from "../lib/connect-bridge-health";

test("buildConnectBridgeHealthSnapshot reports missing export and storage prerequisites", () => {
  delete process.env.CRON_SECRET;

  const snapshot = buildConnectBridgeHealthSnapshot({
    latestExport: null,
    exportHistory: [],
    storage: {
      backend: "memory",
      blobPathname: "zaza-connect-bridge/store.json",
      blobAccess: "private",
      blobConfigured: false,
    },
    generationStatus: {
      lastAttemptedAt: null,
      lastAttemptOutcome: null,
      lastSuccessfulExportId: null,
      lastSuccessfulExportAt: null,
      lastDisposition: null,
      lastReplacedExportId: null,
      lastFailedAt: null,
      lastFailedError: null,
      consecutiveFailureCount: 0,
    },
    now: new Date("2026-03-23T12:00:00.000Z"),
  });

  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.latestExport.available, false);
  assert.equal(snapshot.freshness.expectedCadenceHours, 6);
  assert.equal(snapshot.freshness.staleThresholdHours, 12);
  assert.equal(snapshot.generation.lastDisposition, null);
  assert.equal(snapshot.history.diffFromPrevious, null);
  assert.ok(snapshot.alerts.some((alert) => alert.code === "bridge_export_missing"));
  assert.match(snapshot.warnings.join(" "), /No persisted bridge export/i);
  assert.match(snapshot.warnings.join(" "), /BLOB_READ_WRITE_TOKEN/i);
  assert.match(snapshot.warnings.join(" "), /CRON_SECRET/i);
});

test("buildConnectBridgeHealthSnapshot reports fresh populated exports as healthy", () => {
  process.env.CRON_SECRET = "secret";

  const snapshot = buildConnectBridgeHealthSnapshot({
    latestExport: {
      schemaVersion: "2026-03-24.1",
      producerVersion: "test-sha",
      exportId: "connect-export:test",
      generatedAt: "2026-03-23T10:30:00.000Z",
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
      strongContentCandidates: [
        {
          candidateId: "candidate-1",
          signalId: "signal-1",
          sourceTitle: "Teacher trust pattern",
          platform: "LinkedIn",
          expectedOutcomeTier: "high",
          reason: "High-trust teacher-first candidate.",
          href: "/signals/signal-1",
          primaryPainPoint: "Teachers need a lower-friction trust-building angle.",
          teacherLanguage: [],
          audienceSegment: null,
          funnelStage: "Consideration",
          commercialPotential: "high",
          trustRisk: "low",
          recommendedAngle: "Lead with the teacher-trust proof point.",
          recommendedHookDirection: "Open with the trust gap and the concrete classroom payoff.",
          recommendedFormat: "text",
          recommendedPlatforms: ["linkedin"],
          whyNow: "This week’s pack ranked it highly.",
          proofPoints: ["High-trust teacher-first candidate."],
          trustNotes: [],
          sourceSignalIds: ["signal-1"],
        },
      ],
      outreachRelevantThemes: [],
      influencerRelevantPosts: [],
      campaignSupportSignals: [],
      distributionOpportunities: [],
      relationshipContextHints: [],
    },
    exportHistory: [
      {
        schemaVersion: "2026-03-24.1",
        producerVersion: "test-sha",
        exportId: "connect-export:test",
        generatedAt: "2026-03-23T10:30:00.000Z",
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
        strongContentCandidates: [
          {
            candidateId: "candidate-1",
            signalId: "signal-1",
            sourceTitle: "Teacher trust pattern",
            platform: "LinkedIn",
            expectedOutcomeTier: "high",
            reason: "High-trust teacher-first candidate.",
            href: "/signals/signal-1",
            primaryPainPoint: "Teachers need a lower-friction trust-building angle.",
            teacherLanguage: [],
            audienceSegment: null,
            funnelStage: "Consideration",
            commercialPotential: "high",
            trustRisk: "low",
            recommendedAngle: "Lead with the teacher-trust proof point.",
            recommendedHookDirection: "Open with the trust gap and the concrete classroom payoff.",
            recommendedFormat: "text",
            recommendedPlatforms: ["linkedin"],
            whyNow: "This week’s pack ranked it highly.",
            proofPoints: ["High-trust teacher-first candidate."],
            trustNotes: [],
            sourceSignalIds: ["signal-1"],
          },
        ],
        outreachRelevantThemes: [],
        influencerRelevantPosts: [],
        campaignSupportSignals: [],
        distributionOpportunities: [],
        relationshipContextHints: [],
      },
    ],
    storage: {
      backend: "blob",
      blobPathname: "zaza-connect-bridge/store.json",
      blobAccess: "private",
      blobConfigured: true,
    },
    generationStatus: {
      lastAttemptedAt: "2026-03-23T10:30:00.000Z",
      lastAttemptOutcome: "success",
      lastSuccessfulExportId: "connect-export:test",
      lastSuccessfulExportAt: "2026-03-23T10:30:00.000Z",
      lastDisposition: "reused_latest",
      lastReplacedExportId: null,
      lastFailedAt: null,
      lastFailedError: null,
      consecutiveFailureCount: 0,
    },
    now: new Date("2026-03-23T12:00:00.000Z"),
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.latestExport.available, true);
  assert.equal(snapshot.latestExport.connectOpportunityCount, 1);
  assert.equal(snapshot.latestExport.stale, false);
  assert.equal(snapshot.latestExport.schemaVersion, "2026-03-24.1");
  assert.equal(snapshot.latestExport.metrics.totalSignalsAvailable, 10);
  assert.equal(snapshot.generation.lastAttemptOutcome, "success");
  assert.equal(snapshot.generation.lastDisposition, "reused_latest");
  assert.equal(snapshot.history.recentExports.length, 1);
  assert.equal(snapshot.history.diffFromPrevious, null);
  assert.deepEqual(snapshot.alerts, []);
  assert.deepEqual(snapshot.warnings, []);
});
