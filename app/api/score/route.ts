import { NextResponse } from "next/server";

import { getSignalWithFallback, listSignalsWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { appendAuditEventsSafe, buildRecommendationEvent, buildScoredEvent, type AuditEventInput } from "@/lib/audit";
import {
  filterSignalsForActiveReviewQueue,
  getCanonicalSignalForCluster,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { buildInitialScoringFromSignal, scoreSignal } from "@/lib/scoring";
import { getOperatorTuning } from "@/lib/tuning";
import { hasScoring } from "@/lib/workflow";
import {
  scoreRequestSchema,
  scoringResultSchema,
  toScoringSavePayload,
  type ScoreBatchResponse,
  type ScoreResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = scoreRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        message: "Scoring request could not be processed.",
        error: parsed.error.issues[0]?.message ?? "Invalid score payload.",
      },
      { status: 400 },
    );
  }

  const save = parsed.data.save ?? false;
  const allSignalsResult = await listSignalsWithFallback({ limit: 500 });
  const duplicateClusters = await listDuplicateClusters();
  const signalById = new Map(allSignalsResult.signals.map((signal) => [signal.recordId, signal]));
  const tuning = await getOperatorTuning();

  if (parsed.data.signalId) {
    const signalResult = await getSignalWithFallback(parsed.data.signalId);
    if (!signalResult.signal) {
      return NextResponse.json(
        {
          success: false,
          persisted: false,
          source: signalResult.source,
          message: "Signal could not be scored.",
          error: signalResult.error ?? "Signal not found.",
        },
        { status: 404 },
      );
    }

    const signal = signalResult.signal;
    const scoringSource =
      getCanonicalSignalForCluster(signal.recordId, signalById, duplicateClusters) ?? signal;
    const canonicalCluster = duplicateClusters.find(
      (cluster) => cluster.status === "confirmed" && cluster.signalIds.includes(signal.recordId),
    );
    const scoring = toScoringSavePayload(
      scoringResultSchema.parse({
        ...(buildInitialScoringFromSignal(scoringSource) ?? scoreSignal(scoringSource, allSignalsResult.signals, tuning.settings)),
        duplicateClusterId: canonicalCluster?.clusterId ?? signal.duplicateClusterId ?? scoringSource.duplicateClusterId,
      }),
    );

    if (!save) {
      return NextResponse.json<ScoreResponse>({
        success: true,
        persisted: false,
        source: signalResult.source,
        signal,
        scoring,
        message: "Scoring preview completed. Review the recommendation before saving.",
      });
    }

    const persisted = await saveSignalWithFallback(parsed.data.signalId, {
      signalRelevanceScore: scoring.signalRelevanceScore,
      signalNoveltyScore: scoring.signalNoveltyScore,
      signalUrgencyScore: scoring.signalUrgencyScore,
      brandFitScore: scoring.brandFitScore,
      sourceTrustScore: scoring.sourceTrustScore,
      keepRejectRecommendation: scoring.keepRejectRecommendation,
      whySelected: scoring.whySelected,
      whyRejected: scoring.whyRejected,
      needsHumanReview: scoring.needsHumanReview,
      qualityGateResult: scoring.qualityGateResult,
      reviewPriority: scoring.reviewPriority,
      similarityToExistingContent: scoring.similarityToExistingContent,
      duplicateClusterId: scoring.duplicateClusterId,
    });

    if (!persisted.signal) {
      return NextResponse.json(
        {
          success: false,
          persisted: persisted.persisted,
          source: persisted.source,
          message: "Scoring could not be saved.",
          error: persisted.error ?? "Signal not found.",
        },
        { status: persisted.source === "mock" ? 404 : 502 },
      );
    }

    await appendAuditEventsSafe([
      buildScoredEvent(persisted.signal, scoring),
      buildRecommendationEvent(persisted.signal, tuning.settings),
    ]);

    return NextResponse.json<ScoreResponse>({
      success: true,
      persisted: persisted.persisted,
      source: persisted.source,
      signal: persisted.signal,
      scoring,
      message:
        persisted.source === "airtable"
          ? "Scoring saved to Airtable."
          : "Scoring saved in mock mode for the current session flow only.",
    });
  }

  const limit = parsed.data.batch?.limit ?? 20;
  const targetSignals = filterSignalsForActiveReviewQueue(allSignalsResult.signals, duplicateClusters)
    .filter((signal) => (parsed.data.batch?.status ? signal.status === parsed.data.batch.status : true))
    .filter((signal) => (parsed.data.batch?.onlyMissingScores ? !hasScoring(signal) : true))
    .slice(0, limit);

  const results: ScoreBatchResponse["results"] = [];
  const auditEvents: AuditEventInput[] = [];
  let saved = 0;

  for (const signal of targetSignals) {
    const scoring = toScoringSavePayload(scoringResultSchema.parse(scoreSignal(signal, allSignalsResult.signals, tuning.settings)));

    if (!save) {
      results.push({
        recordId: signal.recordId,
        sourceTitle: signal.sourceTitle,
        recommendation: scoring.keepRejectRecommendation,
        reviewPriority: scoring.reviewPriority,
        persisted: false,
      });
      continue;
    }

    const persisted = await saveSignalWithFallback(signal.recordId, {
      signalRelevanceScore: scoring.signalRelevanceScore,
      signalNoveltyScore: scoring.signalNoveltyScore,
      signalUrgencyScore: scoring.signalUrgencyScore,
      brandFitScore: scoring.brandFitScore,
      sourceTrustScore: scoring.sourceTrustScore,
      keepRejectRecommendation: scoring.keepRejectRecommendation,
      whySelected: scoring.whySelected,
      whyRejected: scoring.whyRejected,
      needsHumanReview: scoring.needsHumanReview,
      qualityGateResult: scoring.qualityGateResult,
      reviewPriority: scoring.reviewPriority,
      similarityToExistingContent: scoring.similarityToExistingContent,
      duplicateClusterId: scoring.duplicateClusterId,
    });

    if (persisted.signal) {
      saved += 1;
      auditEvents.push(buildScoredEvent(persisted.signal, scoring), buildRecommendationEvent(persisted.signal, tuning.settings));
    }

    results.push({
      recordId: signal.recordId,
      sourceTitle: signal.sourceTitle,
      recommendation: scoring.keepRejectRecommendation,
      reviewPriority: scoring.reviewPriority,
      persisted: Boolean(persisted.signal) && persisted.persisted,
      error: persisted.signal ? undefined : persisted.error ?? "Unable to save scoring result.",
    });
  }

  await appendAuditEventsSafe(auditEvents);

  return NextResponse.json<ScoreBatchResponse>({
    success: true,
    persisted: save && allSignalsResult.source === "airtable",
    source: allSignalsResult.source,
    processed: targetSignals.length,
    saved,
    results,
    message: save
      ? allSignalsResult.source === "airtable"
        ? "Batch scoring completed and saved."
        : "Batch scoring completed in mock mode."
      : "Batch scoring preview completed.",
  });
}
