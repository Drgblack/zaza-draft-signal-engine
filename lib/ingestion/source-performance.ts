import { hasGeneration, hasInterpretation } from "@/lib/workflow";
import { listSignalsWithFallback } from "@/lib/airtable";
import { managedIngestionSourceSchema, type IngestionSourceDefinition, type ManagedIngestionSource } from "@/lib/ingestion/types";
import type { SignalRecord } from "@/types/signal";
import { buildIngestionSourceLabel, listIngestionSources } from "@/lib/ingestion/sources";

function countSignals(signals: SignalRecord[], predicate: (signal: SignalRecord) => boolean): number {
  return signals.reduce((count, signal) => (predicate(signal) ? count + 1 : count), 0);
}

export function buildManagedIngestionSources(
  sources: IngestionSourceDefinition[],
  signals: SignalRecord[],
): ManagedIngestionSource[] {
  return sources.map((source) => {
    const ingestionLabel = buildIngestionSourceLabel(source);
    const matchingSignals = signals.filter(
      (signal) => (signal.ingestionSource ?? "").trim().toLowerCase() === ingestionLabel.trim().toLowerCase(),
    );

    return managedIngestionSourceSchema.parse({
      ...source,
      ingestionLabel,
      performance: {
        totalSignals: matchingSignals.length,
        keepSignals: countSignals(matchingSignals, (signal) => signal.keepRejectRecommendation === "Keep"),
        reviewSignals: countSignals(
          matchingSignals,
          (signal) => signal.keepRejectRecommendation === "Review" || signal.status === "Reviewed",
        ),
        rejectedSignals: countSignals(
          matchingSignals,
          (signal) => signal.keepRejectRecommendation === "Reject" || signal.status === "Rejected",
        ),
        interpretedSignals: countSignals(matchingSignals, hasInterpretation),
        generatedSignals: countSignals(matchingSignals, hasGeneration),
      },
    });
  });
}

export async function getManagedIngestionSourcesWithFallback(): Promise<{
  source: "airtable" | "mock";
  sources: ManagedIngestionSource[];
  message?: string;
  error?: string;
}> {
  const [sourceRegistry, signalResult] = await Promise.all([listIngestionSources(), listSignalsWithFallback({ limit: 500 })]);

  return {
    source: signalResult.source,
    sources: buildManagedIngestionSources(sourceRegistry, signalResult.signals),
    message: signalResult.message,
    error: signalResult.error,
  };
}
