import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();

async function withTempThumbnailModule(
  run: (context: {
    dataDir: string;
    loadModule: () => Promise<typeof import("../lib/video-factory-thumbnail-specs")>;
  }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "thumbnail-specs-"));
  const dataDir = path.join(tempDir, "data");
  await mkdir(dataDir, { recursive: true });
  process.chdir(tempDir);

  try {
    await run({
      dataDir,
      loadModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "video-factory-thumbnail-specs.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
    });
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("buildVideoFactoryThumbnailSpec marks external thumbnail URLs as CDN-ready delivery assets", async () => {
  const thumbnailSpecs = await import("../lib/video-factory-thumbnail-specs");

  const spec = thumbnailSpecs.buildVideoFactoryThumbnailSpec({
    opportunityId: "opportunity-1",
    renderJobId: "render-job-1",
    renderedAssetId: "asset-1",
    source: "generated",
    imageUrl: "https://blob.example/generated-thumb.jpg",
    generatedImageUrl: "https://blob.example/generated-thumb.jpg",
    providerId: "ffmpeg",
    createdAt: "2026-03-24T10:00:00.000Z",
  });

  assert.equal(spec.source, "generated");
  assert.equal(spec.delivery?.deliveryClass, "cdn_ready");
  assert.equal(spec.delivery?.publicUrl, "https://blob.example/generated-thumb.jpg");
});

test("upsertVideoFactoryThumbnailSpec persists the latest manual override", { concurrency: false }, async () => {
  await withTempThumbnailModule(async ({ dataDir, loadModule }) => {
    const thumbnailSpecs = await loadModule();
    const persisted = await thumbnailSpecs.upsertVideoFactoryThumbnailSpec(
      thumbnailSpecs.buildVideoFactoryThumbnailSpec({
        opportunityId: "opportunity-1",
        renderJobId: "render-job-1",
        renderedAssetId: "asset-1",
        source: "manual_override",
        imageUrl: "https://cdn.example/manual-thumb.jpg",
        generatedImageUrl: "https://blob.example/generated-thumb.jpg",
        providerId: "manual-override",
        createdAt: "2026-03-24T10:05:00.000Z",
      }),
    );

    assert.equal(persisted.source, "manual_override");
    assert.equal(
      thumbnailSpecs.getVideoFactoryThumbnailSpec("opportunity-1")?.imageUrl,
      "https://cdn.example/manual-thumb.jpg",
    );

    const rawStore = JSON.parse(
      await readFile(
        path.join(dataDir, "video-factory-thumbnail-specs.json"),
        "utf8",
      ),
    ) as {
      specs: Array<{ providerId: string; imageUrl: string }>;
    };

    assert.equal(rawStore.specs.length, 1);
    assert.equal(rawStore.specs[0]?.providerId, "manual-override");
    assert.equal(rawStore.specs[0]?.imageUrl, "https://cdn.example/manual-thumb.jpg");
  });
});
