import assert from "node:assert/strict";
import test from "node:test";

import { buildInitialGenerationFromSignal, toGenerationInputFromSignal } from "../lib/generator";
import { buildInitialInterpretationFromSignal, toInterpretationInput } from "../lib/interpreter";
import { flattenSignalEnvelope, toSignalEnvelope } from "../lib/signal-envelope";
import { buildInitialScoringFromSignal } from "../lib/scoring";
import { getMockSignalById } from "../lib/mock-data";
import { hasGeneration, hasInterpretation, hasScoring } from "../lib/workflow";

test("SignalEnvelope adapters round-trip a legacy SignalRecord without losing fields", () => {
  const signal = getMockSignalById("mock_sig_002");
  assert.ok(signal, "expected mock signal fixture");

  const envelope = toSignalEnvelope(signal);
  const flattened = flattenSignalEnvelope(envelope);

  assert.deepEqual(flattened, signal);
});

test("critical signal helpers accept SignalEnvelope without changing behavior", () => {
  const signal = getMockSignalById("mock_sig_002");
  assert.ok(signal, "expected mock signal fixture");

  const envelope = toSignalEnvelope(signal);

  assert.equal(hasScoring(envelope), hasScoring(signal));
  assert.equal(hasInterpretation(envelope), hasInterpretation(signal));
  assert.equal(hasGeneration(envelope), hasGeneration(signal));
  assert.deepEqual(toInterpretationInput(envelope), toInterpretationInput(signal));
  assert.deepEqual(toGenerationInputFromSignal(envelope), toGenerationInputFromSignal(signal));
  assert.deepEqual(buildInitialScoringFromSignal(envelope), buildInitialScoringFromSignal(signal));
  assert.deepEqual(buildInitialInterpretationFromSignal(envelope), buildInitialInterpretationFromSignal(signal));
  assert.deepEqual(buildInitialGenerationFromSignal(envelope), buildInitialGenerationFromSignal(signal));
});
