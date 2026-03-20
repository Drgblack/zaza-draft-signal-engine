import { hasGeneration, hasInterpretation } from "@/lib/workflow";
import { listSignalsWithFallback } from "@/lib/airtable";
import { managedIngestionSourceSchema, type IngestionSourceDefinition, type ManagedIngestionSource } from "@/lib/ingestion/types";
import { listPostingLogEntries, type PostingLogEntry } from "@/lib/posting-log";
import { listPostingOutcomes, type PostingOutcome } from "@/lib/outcomes";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { SignalRecord } from "@/types/signal";
import { buildIngestionSourceLabel, listIngestionSources } from "@/lib/ingestion/sources";

function countSignals(signals: SignalRecord[], predicate: (signal: SignalRecord) => boolean): number {
  return signals.reduce((count, signal) => (predicate(signal) ? count + 1 : count), 0);
}

function safeRate(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function isApprovedSignal(signal: SignalRecord): boolean {
  return (
    signal.status === "Approved" ||
    signal.status === "Scheduled" ||
    signal.status === "Posted" ||
    signal.xReviewStatus === "ready" ||
    signal.linkedInReviewStatus === "ready" ||
    signal.redditReviewStatus === "ready"
  );
}

function isUsefulSignal(signal: SignalRecord): boolean {
  return Boolean(
    signal.keepRejectRecommendation === "Keep" ||
      hasInterpretation(signal) ||
      hasGeneration(signal) ||
      isApprovedSignal(signal),
  );
}

function buildOutcomeScore(
  outcome: PostingOutcome | undefined,
  strategicOutcome: StrategicOutcome | undefined,
): number | null {
  if (!outcome && !strategicOutcome) {
    return null;
  }

  const outcomeScore =
    !outcome
      ? 0
      : outcome.outcomeQuality === "strong"
        ? 2
        : outcome.outcomeQuality === "acceptable"
          ? 1
          : -2;
  const reuseScore =
    !outcome
      ? 0
      : outcome.reuseRecommendation === "reuse_this_approach"
        ? 1
        : outcome.reuseRecommendation === "adapt_before_reuse"
          ? 0
          : -1;
  const strategicScore =
    !strategicOutcome
      ? 0
      : strategicOutcome.strategicValue === "high"
        ? 2
        : strategicOutcome.strategicValue === "medium"
          ? 1
          : strategicOutcome.strategicValue === "low"
            ? -1
            : 0;

  return outcomeScore + reuseScore + strategicScore;
}

function buildRecommendations(input: {
  source: IngestionSourceDefinition;
  totalSignals: number;
  approvalRate: number;
  rejectionRate: number;
  usefulnessRate: number;
  reviewSignals: number;
  strongOutcomeSignals: number;
  weakOutcomeSignals: number;
  averageOutcomeScore: number | null;
}): ManagedIngestionSource["recommendations"] {
  const recommendations: ManagedIngestionSource["recommendations"] = [];

  if (
    input.totalSignals >= 5 &&
    input.rejectionRate >= 0.55 &&
    input.approvalRate <= 0.12 &&
    input.usefulnessRate <= 0.35
  ) {
    recommendations.push({
      action: "pause_source",
      summary: "Pause source",
      rationale: `This source is producing a high rejection rate (${Math.round(input.rejectionRate * 100)}%) with very few approval-ready or useful signals.`,
    });
  } else if (
    input.totalSignals >= 4 &&
    (
      input.rejectionRate >= 0.45 ||
      input.usefulnessRate <= 0.4 ||
      (input.averageOutcomeScore !== null && input.averageOutcomeScore <= -0.5)
    )
  ) {
    recommendations.push({
      action: "reduce_source_weight",
      summary: "Reduce source weight",
      rationale: `This source is contributing more low-value candidates than useful ones, so lowering the cap or priority should reduce queue noise.`,
    });
  }

  if (
    input.source.kind === "query" &&
    input.totalSignals >= 3 &&
    (
      input.reviewSignals >= Math.max(2, input.totalSignals / 2) ||
      input.weakOutcomeSignals > input.strongOutcomeSignals ||
      input.approvalRate < 0.2
    )
  ) {
    recommendations.push({
      action: "refine_query",
      summary: "Refine query",
      rationale: `This query is surfacing too many borderline or weak candidates relative to approvals, so the wording likely needs tightening.`,
    });
  }

  return recommendations.slice(0, 2);
}

export function buildManagedIngestionSources(
  sources: IngestionSourceDefinition[],
  signals: SignalRecord[],
  postingEntries: PostingLogEntry[] = [],
  postingOutcomes: PostingOutcome[] = [],
  strategicOutcomes: StrategicOutcome[] = [],
): ManagedIngestionSource[] {
  const postingEntriesBySignalId = postingEntries.reduce<Record<string, PostingLogEntry[]>>((index, entry) => {
    index[entry.signalId] = [...(index[entry.signalId] ?? []), entry];
    return index;
  }, {});
  const outcomesByPostingLogId = new Map(postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicByPostingLogId = new Map(strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));

  return sources.map((source) => {
    const ingestionLabel = buildIngestionSourceLabel(source);
    const matchingSignals = signals.filter(
      (signal) => (signal.ingestionSource ?? "").trim().toLowerCase() === ingestionLabel.trim().toLowerCase(),
    );
    const approvedSignals = countSignals(matchingSignals, isApprovedSignal);
    const usefulSignals = countSignals(matchingSignals, isUsefulSignal);
    const postedSignalIds = new Set(
      matchingSignals
        .flatMap((signal) => postingEntriesBySignalId[signal.recordId] ?? [])
        .map((entry) => entry.signalId),
    );
    const outcomeScores = matchingSignals
      .flatMap((signal) => postingEntriesBySignalId[signal.recordId] ?? [])
      .map((entry) => buildOutcomeScore(outcomesByPostingLogId.get(entry.id), strategicByPostingLogId.get(entry.id)))
      .filter((score): score is number => score !== null);
    const strongOutcomeSignals = outcomeScores.filter((score) => score >= 3).length;
    const acceptableOutcomeSignals = outcomeScores.filter((score) => score >= 1 && score < 3).length;
    const weakOutcomeSignals = outcomeScores.filter((score) => score < 1).length;
    const averageOutcomeScore =
      outcomeScores.length === 0
        ? null
        : outcomeScores.reduce((total, score) => total + score, 0) / outcomeScores.length;
    const approvalRate = safeRate(approvedSignals, matchingSignals.length);
    const rejectionRate = safeRate(
      countSignals(
        matchingSignals,
        (signal) => signal.keepRejectRecommendation === "Reject" || signal.status === "Rejected",
      ),
      matchingSignals.length,
    );
    const usefulnessRate = safeRate(usefulSignals, matchingSignals.length);
    const reviewSignals = countSignals(
      matchingSignals,
      (signal) => signal.keepRejectRecommendation === "Review" || signal.status === "Reviewed",
    );

    return managedIngestionSourceSchema.parse({
      ...source,
      ingestionLabel,
      performance: {
        totalSignals: matchingSignals.length,
        keepSignals: countSignals(matchingSignals, (signal) => signal.keepRejectRecommendation === "Keep"),
        reviewSignals,
        rejectedSignals: countSignals(
          matchingSignals,
          (signal) => signal.keepRejectRecommendation === "Reject" || signal.status === "Rejected",
        ),
        approvedSignals,
        usefulSignals,
        interpretedSignals: countSignals(matchingSignals, hasInterpretation),
        generatedSignals: countSignals(matchingSignals, hasGeneration),
        postedSignals: postedSignalIds.size,
        strongOutcomeSignals,
        acceptableOutcomeSignals,
        weakOutcomeSignals,
        approvalRate,
        rejectionRate,
        usefulnessRate,
        averageOutcomeScore,
      },
      recommendations: buildRecommendations({
        source,
        totalSignals: matchingSignals.length,
        approvalRate,
        rejectionRate,
        usefulnessRate,
        reviewSignals,
        strongOutcomeSignals,
        weakOutcomeSignals,
        averageOutcomeScore,
      }),
    });
  });
}

export async function getManagedIngestionSourcesWithFallback(): Promise<{
  source: "airtable" | "mock";
  sources: ManagedIngestionSource[];
  message?: string;
  error?: string;
}> {
  const [sourceRegistry, signalResult, postingEntries, postingOutcomes, strategicOutcomes] = await Promise.all([
    listIngestionSources(),
    listSignalsWithFallback({ limit: 500 }),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
  ]);

  return {
    source: signalResult.source,
    sources: buildManagedIngestionSources(
      sourceRegistry,
      signalResult.signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
    ),
    message: signalResult.message,
    error: signalResult.error,
  };
}
