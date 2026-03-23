import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFactoryPublishOutcomeRecord,
  factoryPublishOutcomeId,
} from "../lib/video-factory-publish-outcomes";

test("factoryPublishOutcomeId is deterministic per rendered asset", () => {
  assert.equal(
    factoryPublishOutcomeId("render-job-1:rendered-asset"),
    "render-job-1:rendered-asset:publish-outcome",
  );
});

test("buildFactoryPublishOutcomeRecord creates a manual-entry-ready unpublished placeholder", () => {
  const record = buildFactoryPublishOutcomeRecord({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    factoryJobId: "factory-job-1",
    renderJobId: "render-job-1",
    renderedAssetId: "render-job-1:rendered-asset",
    assetReviewId: "render-job-1:rendered-asset:asset-review",
    published: false,
    updatedAt: "2026-03-23T10:15:00.000Z",
  });

  assert.equal(record.publishOutcomeId, "render-job-1:rendered-asset:publish-outcome");
  assert.equal(record.published, false);
  assert.equal(record.platform, null);
  assert.equal(record.impressions, null);
  assert.equal(record.attributionSource, null);
});

test("buildFactoryPublishOutcomeRecord updates publish metrics while preserving identity", () => {
  const placeholder = buildFactoryPublishOutcomeRecord({
    opportunityId: "opportunity-1",
    videoBriefId: "brief-1",
    factoryJobId: "factory-job-1",
    renderJobId: "render-job-1",
    renderedAssetId: "render-job-1:rendered-asset",
    assetReviewId: "render-job-1:rendered-asset:asset-review",
    published: false,
    updatedAt: "2026-03-23T10:15:00.000Z",
  });

  const updated = buildFactoryPublishOutcomeRecord(
    {
      opportunityId: "opportunity-1",
      videoBriefId: "brief-1",
      factoryJobId: "factory-job-1",
      renderJobId: "render-job-1",
      renderedAssetId: "render-job-1:rendered-asset",
      assetReviewId: "render-job-1:rendered-asset:asset-review",
      published: true,
      platform: "linkedin",
      publishDate: "2026-03-24T09:00:00.000Z",
      publishedUrl: "https://linkedin.example/post/1",
      impressions: 1800,
      clicks: 74,
      signups: 5,
      notes: "Entered manually after checking native analytics.",
      attributionSource: "native_platform_analytics",
      updatedAt: "2026-03-24T12:30:00.000Z",
    },
    placeholder,
  );

  assert.equal(updated.publishOutcomeId, placeholder.publishOutcomeId);
  assert.equal(updated.createdAt, placeholder.createdAt);
  assert.equal(updated.published, true);
  assert.equal(updated.platform, "linkedin");
  assert.equal(updated.impressions, 1800);
  assert.equal(updated.clicks, 74);
  assert.equal(updated.signups, 5);
  assert.equal(updated.attributionSource, "native_platform_analytics");
});
