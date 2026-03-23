import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();

async function withTempProductionDefaultsModule(
  run: (context: {
    tempDir: string;
    dataDir: string;
    loadModule: () => Promise<typeof import("../lib/production-defaults")>;
  }) => Promise<void>,
) {
  const previousCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "production-defaults-"));
  const dataDir = path.join(tempDir, "data");

  await mkdir(dataDir, { recursive: true });
  process.chdir(tempDir);

  try {
    await run({
      tempDir,
      dataDir,
      loadModule: async () =>
        import(
          `${pathToFileURL(
            path.join(REPO_ROOT, "lib", "production-defaults.ts"),
          ).href}?t=${Date.now()}-${Math.random()}`
        ),
    });
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("getActiveProductionDefaults backfills legacy persisted records", { concurrency: false }, async () => {
  await withTempProductionDefaultsModule(async ({ dataDir, loadModule }) => {
    await writeFile(
      path.join(dataDir, "production-defaults.json"),
      `${JSON.stringify(
        {
          updatedAt: "2026-03-22T00:00:00.000Z",
          profiles: [
            {
              id: "prod-default:teacher-real-core",
              name: "Teacher-Real Core",
              isActive: true,
              voiceProvider: "elevenlabs",
              voiceId: "teacher-real-core-v1",
              voiceSettings: {
                stability: 0.48,
                similarityBoost: 0.72,
                style: 0.14,
                speakerBoost: true,
              },
              styleAnchorPrompt: "Teacher-real anchor prompt.",
              motionStyle: "Quiet cuts.",
              negativeConstraints: ["No hype"],
              aspectRatio: "9:16",
              resolution: "1080p",
              captionStyle: {
                preset: "teacher-real-clean",
                placement: "lower-third",
                casing: "sentence",
              },
              compositionDefaults: {
                transitionStyle: "gentle-cut",
                musicMode: "none",
              },
              reviewDefaults: {
                requireCaptionCheck: true,
              },
              providerFallbacks: {
                narration: ["elevenlabs"],
                visuals: ["runway-gen4"],
                captions: ["local-default"],
                composition: ["local-default"],
              },
              updatedAt: "2026-03-22T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const productionDefaultsModule = await loadModule();
    const activeDefaults = productionDefaultsModule.getActiveProductionDefaults();

    assert.equal(activeDefaults.id, "prod-default:teacher-real-core");
    assert.equal(activeDefaults.profileId, "prod-default:teacher-real-core");
    assert.equal(activeDefaults.version, 1);
    assert.equal(activeDefaults.changedAt, "2026-03-22T00:00:00.000Z");
    assert.equal(activeDefaults.changedSource, "legacy-import");
    assert.equal(activeDefaults.changeNote, null);
  });
});

test("updateActiveProductionDefaults appends a new active version while preserving history", { concurrency: false }, async () => {
  await withTempProductionDefaultsModule(async ({ dataDir, loadModule }) => {
    const productionDefaultsModule = await loadModule();
    const currentDefaults = productionDefaultsModule.getActiveProductionDefaults();

    const updatedDefaults = await productionDefaultsModule.updateActiveProductionDefaults({
      voiceId: "teacher-real-core-v2",
      styleAnchorPrompt: `${currentDefaults.styleAnchorPrompt} Keep the pacing closer to a spoken draft.`,
      motionStyle: currentDefaults.motionStyle,
      negativeConstraints: currentDefaults.negativeConstraints,
      aspectRatio: currentDefaults.aspectRatio,
      resolution: currentDefaults.resolution,
      captionStyle: currentDefaults.captionStyle,
      compositionDefaults: currentDefaults.compositionDefaults,
      changedSource: "operator:test",
      changeNote: "Adjusted voice and anchor for Phase D benchmark.",
    });

    assert.equal(updatedDefaults.profileId, currentDefaults.profileId);
    assert.equal(updatedDefaults.version, currentDefaults.version + 1);
    assert.equal(updatedDefaults.changedSource, "operator:test");
    assert.equal(
      updatedDefaults.changeNote,
      "Adjusted voice and anchor for Phase D benchmark.",
    );

    const versions = productionDefaultsModule.listProductionDefaultVersions(
      currentDefaults.profileId,
    );
    assert.equal(versions.length, 2);
    assert.equal(versions[0]?.isActive, true);
    assert.equal(versions[0]?.version, 2);
    assert.equal(versions[1]?.isActive, false);
    assert.equal(versions[1]?.version, 1);

    const rawStore = JSON.parse(
      await readFile(path.join(dataDir, "production-defaults.json"), "utf8"),
    ) as {
      profiles: Array<{
        isActive?: boolean;
        version?: number;
      }>;
    };

    assert.equal(
      rawStore.profiles.filter((profile) => profile.isActive).length,
      1,
    );
    assert.deepEqual(
      rawStore.profiles.map((profile) => profile.version),
      [2, 1],
    );
  });
});

test("compareCurrentProductionDefaultsVersion reports changed fields against the previous version", { concurrency: false }, async () => {
  await withTempProductionDefaultsModule(async ({ loadModule }) => {
    const productionDefaultsModule = await loadModule();
    const currentDefaults = productionDefaultsModule.getActiveProductionDefaults();

    await productionDefaultsModule.updateActiveProductionDefaults({
      voiceId: "teacher-real-core-v2",
      styleAnchorPrompt: currentDefaults.styleAnchorPrompt,
      motionStyle: `${currentDefaults.motionStyle} Hold longer on readable pauses.`,
      negativeConstraints: currentDefaults.negativeConstraints,
      aspectRatio: currentDefaults.aspectRatio,
      resolution: "720p",
      captionStyle: currentDefaults.captionStyle,
      compositionDefaults: currentDefaults.compositionDefaults,
      changedSource: "operator:test",
      changeNote: "Benchmarking lighter export resolution.",
    });

    const comparison = productionDefaultsModule.compareCurrentProductionDefaultsVersion(
      currentDefaults.profileId,
    );

    assert.ok(comparison);
    assert.equal(comparison.currentVersion, 2);
    assert.equal(comparison.previousVersion, 1);
    assert.equal(comparison.changedSource, "operator:test");
    assert.deepEqual(
      comparison.changedFields.sort(),
      ["motionStyle", "resolution", "voiceId"],
    );
  });
});
