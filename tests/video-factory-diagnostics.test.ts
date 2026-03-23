import assert from "node:assert/strict";
import test from "node:test";

import { getVideoFactoryDiagnostics } from "../lib/video-factory-diagnostics";

test("video factory diagnostics report ready when providers, blob, and ffmpeg are available", () => {
  const diagnostics = getVideoFactoryDiagnostics({
    providerMode: "real",
    checkedAt: "2026-03-23T10:00:00.000Z",
    blobEnabled: true,
    envReader: (name) => {
      switch (name) {
        case "ELEVENLABS_API_KEY":
        case "RUNWAYML_API_SECRET":
        case "ASSEMBLYAI_API_KEY":
          return "configured";
        default:
          return null;
      }
    },
    binaryChecker: () => ({
      available: true,
      message: "ok",
    }),
  });

  assert.equal(diagnostics.status, "ready");
  assert.equal(diagnostics.checks.every((check) => check.status === "ready"), true);
});

test("video factory diagnostics report unavailable in auto mode when provider config is missing", () => {
  const diagnostics = getVideoFactoryDiagnostics({
    providerMode: "auto",
    checkedAt: "2026-03-23T10:00:00.000Z",
    blobEnabled: false,
    envReader: () => null,
    binaryChecker: () => ({
      available: true,
      message: "ok",
    }),
  });

  assert.equal(diagnostics.status, "unavailable");
  assert.equal(diagnostics.checks.find((check) => check.key === "elevenlabs")?.status, "unavailable");
  assert.equal(diagnostics.checks.find((check) => check.key === "blob")?.status, "degraded");
});

test("video factory diagnostics report unavailable in real mode when runtime assumptions fail", () => {
  const diagnostics = getVideoFactoryDiagnostics({
    providerMode: "real",
    checkedAt: "2026-03-23T10:00:00.000Z",
    blobEnabled: true,
    envReader: (name) => {
      switch (name) {
        case "ELEVENLABS_API_KEY":
        case "RUNWAYML_API_SECRET":
        case "ASSEMBLYAI_API_KEY":
          return "configured";
        default:
          return null;
      }
    },
    binaryChecker: () => ({
      available: false,
      message: "command not found",
    }),
  });

  assert.equal(diagnostics.status, "unavailable");
  assert.equal(
    diagnostics.checks.find((check) => check.key === "ffmpeg_runtime")?.status,
    "unavailable",
  );
});
