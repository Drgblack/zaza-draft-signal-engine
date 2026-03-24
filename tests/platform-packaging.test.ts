import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlatformReadyOutputs,
  transformToLinkedIn,
  transformToReels,
  transformToTikTok,
} from "../lib/platform-packaging";

const baseInput = {
  title: "Pause before you send it",
  hook: "Before you send this, read it once like a parent would.",
  cta: "Try Zaza Draft free.",
  overlayLines: ["Pause before sending", "Keep the tone calm"],
  finalVideoUrl: "https://blob.example/video.mp4",
  thumbnailUrl: "https://blob.example/thumb.jpg",
  durationSec: 30,
  contentType: "solution",
};

test("transformToTikTok returns a short-form mobile-first package", () => {
  const transformed = transformToTikTok(baseInput);

  assert.equal(transformed.platform, "tiktok");
  assert.equal(transformed.finalVideoConfig.aspectRatio, "9:16");
  assert.equal(transformed.finalVideoConfig.maxDurationSec, 60);
  assert.equal(transformed.finalVideoConfig.captionFormat, "burned_in_dynamic");
  assert.equal(transformed.finalVideoConfig.hookPlacement.windowEndSec, 2);
  assert.equal(transformed.finalVideoConfig.ctaFormat, "short_imperative");
  assert.equal(transformed.deliveryAsset?.deliveryClass, "cdn_ready");
});

test("transformToLinkedIn returns a professional-feed package", () => {
  const transformed = transformToLinkedIn(baseInput);

  assert.equal(transformed.platform, "linkedin");
  assert.equal(transformed.finalVideoConfig.aspectRatio, "4:5");
  assert.equal(transformed.finalVideoConfig.maxDurationSec, 90);
  assert.equal(transformed.finalVideoConfig.captionFormat, "native_friendly");
  assert.equal(transformed.finalVideoConfig.hookPlacement.placement, "professional_open");
  assert.equal(transformed.finalVideoConfig.ctaFormat, "soft_professional");
});

test("transformToReels returns an instagram reels package", () => {
  const transformed = transformToReels(baseInput);

  assert.equal(transformed.platform, "instagram_reels");
  assert.equal(transformed.finalVideoConfig.aspectRatio, "9:16");
  assert.equal(transformed.finalVideoConfig.maxDurationSec, 90);
  assert.equal(transformed.finalVideoConfig.captionFormat, "burned_in_minimal");
  assert.equal(transformed.finalVideoConfig.ctaFormat, "proof_then_cta");
});

test("buildPlatformReadyOutputs returns the supported platform set deterministically", () => {
  const outputs = buildPlatformReadyOutputs(baseInput);

  assert.deepEqual(outputs.map((item) => item.platform), [
    "tiktok",
    "linkedin",
    "instagram_reels",
  ]);
});
