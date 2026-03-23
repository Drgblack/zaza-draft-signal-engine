import assert from "node:assert/strict";
import test from "node:test";

import { getCampaignStrategy } from "../lib/campaigns";
import { buildMockUpdatedSignal } from "../lib/mock-data";
import {
  buildSignalPublishPrepBundle,
  getPublishPrepPackageForPlatform,
  parsePublishPrepBundle,
  stringifyPublishPrepBundle,
} from "../lib/publish-prep";
import { runRepairAutopilot } from "../lib/repair-autopilot";
import type { SignalRecord } from "../types/signal";

function buildSignalFixture(
  updates: Partial<SignalRecord> = {},
): SignalRecord {
  const signal = buildMockUpdatedSignal("mock_sig_002", {
    finalReviewStartedAt: null,
    finalReviewedAt: null,
    finalXDraft: null,
    finalLinkedInDraft: null,
    finalRedditDraft: null,
    xReviewStatus: null,
    linkedInReviewStatus: null,
    redditReviewStatus: null,
    ...updates,
  });

  if (!signal) {
    throw new Error("Expected mock signal fixture.");
  }

  return signal;
}

test("runRepairAutopilot fills missing destination, CTA, alt text, and metadata defaults", async () => {
  const strategy = await getCampaignStrategy();
  const seededSignal = buildSignalFixture();
  const seededBundle = buildSignalPublishPrepBundle(seededSignal);
  assert.ok(seededBundle);

  const brokenBundle = JSON.parse(JSON.stringify(seededBundle));
  const brokenPackage = getPublishPrepPackageForPlatform(brokenBundle, "x");
  assert.ok(brokenPackage);

  brokenPackage.linkVariants = [];
  brokenPackage.siteLinkId = null;
  brokenPackage.siteLinkLabel = null;
  brokenPackage.siteLinkReason = null;
  brokenPackage.primaryCta = null;
  brokenPackage.selectedCtaId = null;
  brokenPackage.ctaVariants = [];
  brokenPackage.altText = null;
  brokenPackage.hashtagsOrKeywords.items = [];

  const signal = buildSignalFixture({
    campaignId: null,
    pillarId: null,
    audienceSegmentId: null,
    funnelStage: null,
    ctaGoal: null,
    hashtagsOrKeywords: null,
    publishPrepBundleJson: stringifyPublishPrepBundle(brokenBundle),
  });

  const result = runRepairAutopilot({
    signal,
    strategy,
    autonomyPolicy: {
      allowAutoProceed: true,
      riskLevel: "low",
    },
  });

  assert.deepEqual(
    result.appliedFixes.sort(),
    [
      "apply_fallback_cta",
      "choose_default_destination",
      "fill_campaign_metadata_defaults",
      "generate_placeholder_alt_text",
    ].sort(),
  );

  const repairedBundle = parsePublishPrepBundle(signal.publishPrepBundleJson);
  const repairedPackage = repairedBundle
    ? getPublishPrepPackageForPlatform(repairedBundle, "x")
    : null;

  assert.ok(repairedPackage);
  assert.equal(repairedPackage.linkVariants.length > 0, true);
  assert.equal(Boolean(repairedPackage.altText?.text), true);
  assert.equal(Boolean(repairedPackage.primaryCta), true);
  assert.equal(repairedPackage.hashtagsOrKeywords.items.length > 0, true);
  assert.equal(Boolean(signal.campaignId), true);
  assert.equal(Boolean(signal.funnelStage), true);
  assert.equal(Boolean(signal.ctaGoal), true);
});

test("runRepairAutopilot adds default UTM parameters when the destination exists but tracking is missing", async () => {
  const strategy = await getCampaignStrategy();
  const seededSignal = buildSignalFixture();
  const seededBundle = buildSignalPublishPrepBundle(seededSignal);
  assert.ok(seededBundle);

  const brokenBundle = JSON.parse(JSON.stringify(seededBundle));
  const brokenPackage = getPublishPrepPackageForPlatform(brokenBundle, "x");
  assert.ok(brokenPackage);
  const primaryLink = brokenPackage.linkVariants[0];
  assert.ok(primaryLink);

  primaryLink.url = "https://zazadraft.com/resources";
  delete primaryLink.utmParameters;

  const signal = buildSignalFixture({
    publishPrepBundleJson: stringifyPublishPrepBundle(brokenBundle),
  });

  const result = runRepairAutopilot({
    signal,
    strategy,
    autonomyPolicy: {
      allowAutoProceed: true,
      riskLevel: "low",
    },
  });

  assert.equal(result.appliedFixes.includes("add_default_utm"), true);

  const repairedBundle = parsePublishPrepBundle(signal.publishPrepBundleJson);
  const repairedPackage = repairedBundle
    ? getPublishPrepPackageForPlatform(repairedBundle, "x")
    : null;
  const repairedLink = repairedPackage?.linkVariants[0] ?? null;

  assert.ok(repairedLink);
  assert.equal(repairedLink.url.includes("utm_source="), true);
  assert.equal(Boolean(repairedLink.utmParameters?.utm_campaign), true);
});

test("runRepairAutopilot skips every fix when policy does not allow auto proceed", async () => {
  const strategy = await getCampaignStrategy();
  const signal = buildSignalFixture({
    ctaOrClosingLine: "LEARN MORE!!!",
    campaignId: null,
    pillarId: null,
    audienceSegmentId: null,
    funnelStage: null,
    ctaGoal: null,
    hashtagsOrKeywords: null,
    publishPrepBundleJson: null,
  });
  const originalBundle = signal.publishPrepBundleJson;

  const result = runRepairAutopilot({
    signal,
    strategy,
    autonomyPolicy: {
      allowAutoProceed: false,
      riskLevel: "medium",
    },
  });

  assert.equal(result.appliedFixes.length, 0);
  assert.equal(result.skippedFixes.length, 6);
  assert.equal(signal.publishPrepBundleJson, originalBundle);
  assert.equal(signal.campaignId, null);
});
