import test from "node:test";
import assert from "node:assert/strict";

import { buildConnectBridgeHealthSnapshot } from "../lib/connect-bridge-health";

test("buildConnectBridgeHealthSnapshot reports missing export and storage prerequisites", () => {
  delete process.env.CRON_SECRET;

  const snapshot = buildConnectBridgeHealthSnapshot({
    latestExport: null,
    storage: {
      backend: "memory",
      blobPathname: "zaza-connect-bridge/store.json",
      blobAccess: "private",
      blobConfigured: false,
    },
    now: new Date("2026-03-23T12:00:00.000Z"),
  });

  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.latestExport.available, false);
  assert.match(snapshot.warnings.join(" "), /No persisted bridge export/i);
  assert.match(snapshot.warnings.join(" "), /BLOB_READ_WRITE_TOKEN/i);
  assert.match(snapshot.warnings.join(" "), /CRON_SECRET/i);
});

test("buildConnectBridgeHealthSnapshot reports fresh populated exports as healthy", () => {
  process.env.CRON_SECRET = "secret";

  const snapshot = buildConnectBridgeHealthSnapshot({
    latestExport: {
      exportId: "connect-export:test",
      generatedAt: "2026-03-23T10:30:00.000Z",
      weekStartDate: "2026-03-23",
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
    storage: {
      backend: "blob",
      blobPathname: "zaza-connect-bridge/store.json",
      blobAccess: "private",
      blobConfigured: true,
    },
    now: new Date("2026-03-23T12:00:00.000Z"),
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.latestExport.available, true);
  assert.equal(snapshot.latestExport.connectOpportunityCount, 1);
  assert.equal(snapshot.latestExport.stale, false);
  assert.deepEqual(snapshot.warnings, []);
});
