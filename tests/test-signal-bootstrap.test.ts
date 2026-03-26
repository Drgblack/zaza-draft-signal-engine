import assert from "node:assert/strict";
import test from "node:test";

import { buildMockCreatedSignal } from "../lib/mock-data";
import {
  resetSignalRepository,
  setSignalRepository,
  type SignalRepositoryAdapter,
} from "../lib/signal-repository";
import { createTestSignalReadyForApproval } from "../lib/test-signal-bootstrap";
import { hasReviewableDraftPackage } from "../lib/workflow-state-machine";
import type {
  SignalCreatePayload,
  SignalRecord,
  SignalStatus,
  UpdateSignalInput,
} from "../types/signal";

function buildInMemorySignalRepository(): SignalRepositoryAdapter {
  const records = new Map<string, SignalRecord>();

  async function updateStoredSignal(recordId: string, input: UpdateSignalInput) {
    const current = records.get(recordId) ?? null;

    if (!current) {
      throw new Error("Signal not found.");
    }

    const nextSignal = {
      ...current,
      ...input,
    } as SignalRecord;
    records.set(recordId, nextSignal);
    return nextSignal;
  }

  return {
    async getSignal(recordId) {
      const signal = records.get(recordId);

      if (!signal) {
        throw new Error("Signal not found.");
      }

      return signal;
    },
    async saveSignal(input: SignalCreatePayload) {
      const signal = buildMockCreatedSignal(input);
      records.set(signal.recordId, signal);
      return signal;
    },
    async updateSignal(recordId: string, input: UpdateSignalInput) {
      return updateStoredSignal(recordId, input);
    },
    async listSignals(options?: { limit?: number; status?: SignalStatus }) {
      return [...records.values()]
        .filter((signal) => (options?.status ? signal.status === options.status : true))
        .slice(0, options?.limit ?? records.size);
    },
    async getSignalWithFallback(recordId) {
      return {
        source: "mock" as const,
        signal: records.get(recordId) ?? null,
        error: records.has(recordId) ? undefined : "Signal not found.",
      };
    },
    async saveSignalWithFallback(recordId, input) {
      try {
        const signal = await updateStoredSignal(recordId, input);
        return {
          source: "mock" as const,
          persisted: false,
          signal,
        };
      } catch (error) {
        return {
          source: "mock" as const,
          persisted: false,
          signal: null,
          error: error instanceof Error ? error.message : "Signal not found.",
        };
      }
    },
    async listSignalsWithFallback(options) {
      return {
        source: "mock" as const,
        signals: await this.listSignals(options),
      };
    },
    async getDiagnostics() {
      return {
        configured: false,
        apiReachable: false,
        tableReachable: false,
        schemaAligned: false,
        mappingSucceeded: false,
        mode: "mock" as const,
        missingFields: [],
        message: "In-memory test repository.",
      };
    },
    getSafeErrorMessage(error) {
      return error instanceof Error ? error.message : "Unknown repository error.";
    },
    deriveDisplayEngagementScore() {
      return null;
    },
  };
}

test("createTestSignalReadyForApproval creates a reviewed signal with a reviewable draft package", async () => {
  setSignalRepository(buildInMemorySignalRepository());

  try {
    const result = await createTestSignalReadyForApproval();

    assert.equal(result.signal.status, "Reviewed");
    assert.equal(result.signal.keepRejectRecommendation, "Keep");
    assert.equal(result.signal.qualityGateResult, "Pass");
    assert.ok(result.signal.signalCategory);
    assert.ok(result.signal.teacherPainPoint);
    assert.ok(result.signal.xDraft);
    assert.ok(result.signal.videoScript);
    assert.ok(result.signal.ctaOrClosingLine);
    assert.ok(result.signal.finalReviewStartedAt);
    assert.ok(hasReviewableDraftPackage(result.signal));
  } finally {
    resetSignalRepository();
  }
});
