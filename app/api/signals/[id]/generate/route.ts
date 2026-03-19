import { NextResponse } from "next/server";

import { appendAuditEventsSafe, buildOperatorOverrideEvent, buildRecommendationEvent, listAuditEvents } from "@/lib/audit";
import { getSignalWithFallback, listSignalsWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { getFeedbackEntries, listFeedbackEntries } from "@/lib/feedback";
import { assembleGuidanceForSignal } from "@/lib/guidance";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { buildPatternCoverageRecords, buildPatternGapDetectedEvent } from "@/lib/pattern-coverage";
import { assessPatternCandidate, buildPatternCandidateDetectedEvent } from "@/lib/pattern-discovery";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPatterns } from "@/lib/patterns";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { getOperatorTuning } from "@/lib/tuning";
import { saveGenerationRequestSchema, toGenerationSavePayload, type SaveGenerationResponse } from "@/types/api";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = saveGenerationRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signal: null,
        message: "Generated drafts could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid generation payload.",
      },
      { status: 400 },
    );
  }

  const generation = toGenerationSavePayload(parsed.data);
  const tuning = await getOperatorTuning();
  const previousSignalResult = await getSignalWithFallback(id);
  const result = await saveSignalWithFallback(id, {
    xDraft: generation.xDraft,
    linkedInDraft: generation.linkedInDraft,
    redditDraft: generation.redditDraft,
    imagePrompt: generation.imagePrompt,
    videoScript: generation.videoScript,
    ctaOrClosingLine: generation.ctaOrClosingLine,
    hashtagsOrKeywords: generation.hashtagsOrKeywords,
    generationModelVersion: generation.generationModelVersion,
    promptVersion: generation.promptVersion,
    editorialMode: generation.editorialMode,
    status: generation.status ?? "Draft Generated",
  });

  if (!result.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: result.persisted,
        source: result.source,
        signal: null,
        message: "Generated drafts could not be saved.",
        error: result.error ?? "Signal not found.",
      },
      { status: result.source === "mock" ? 404 : 502 },
    );
  }

  const nextSignal = result.signal;
  const auditEvents = [];
  if (previousSignalResult.signal) {
    const overrideEvent = buildOperatorOverrideEvent(previousSignalResult.signal, "generate", tuning.settings);
    if (overrideEvent) {
      auditEvents.push(overrideEvent);
    }
  }

  const feedbackEntries = await getFeedbackEntries(id);
  const allFeedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const bundles = await listPatternBundles();
  const playbookCards = await listPlaybookCards();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
  const allAuditEvents = await listAuditEvents();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const updatedSignals = allSignals.map((signal) => (signal.recordId === id ? nextSignal : signal));
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: updatedSignals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: updatedSignals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const candidateEvent = buildPatternCandidateDetectedEvent({
    signal: nextSignal,
    current: assessPatternCandidate(nextSignal, {
      feedbackEntries,
      patterns,
    }),
    previous: previousSignalResult.signal
      ? assessPatternCandidate(previousSignalResult.signal, {
          feedbackEntries,
          patterns,
        })
      : null,
  });
  if (candidateEvent) {
    auditEvents.push(candidateEvent);
  }
  const currentCoverage = buildPatternCoverageRecords(
    allSignals.map((signal) => (signal.recordId === id ? nextSignal : signal)),
    allFeedbackEntries,
    patterns,
    allAuditEvents,
  ).find((record) => record.signalId === id);
  const previousCoverage = previousSignalResult.signal
    ? buildPatternCoverageRecords(allSignals, allFeedbackEntries, patterns, allAuditEvents).find(
        (record) => record.signalId === id,
      )
    : null;
  const gapEvent =
    currentCoverage && previousCoverage !== undefined
      ? buildPatternGapDetectedEvent({
          signal: nextSignal,
          current: currentCoverage,
          previous: previousCoverage ?? null,
        })
      : null;
  if (gapEvent) {
    auditEvents.push(gapEvent);
  }

  auditEvents.push(
    {
      signalId: id,
      eventType: "GENERATION_SAVED" as const,
      actor: "operator" as const,
      summary: `Saved generated drafts as ${nextSignal.status} using ${getEditorialModeDefinition(generation.editorialMode).label}.`,
      metadata: {
        generationSource: generation.generationSource,
        promptVersion: generation.promptVersion,
        editorialMode: generation.editorialMode,
      },
    },
    buildRecommendationEvent(nextSignal, tuning.settings),
  );
  const confidenceSnapshot = assembleGuidanceForSignal({
    signal: nextSignal,
    context: "generation",
    allSignals: updatedSignals,
    feedbackEntries: allFeedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning: tuning.settings,
  });
  auditEvents.push({
    signalId: id,
    eventType: "EDITORIAL_CONFIDENCE_SNAPSHOT" as const,
    actor: "system" as const,
    summary: `Editorial confidence is ${confidenceSnapshot.confidence.confidenceLevel} for generation guidance.`,
    metadata: {
      stage: "generation_saved",
      confidenceLevel: confidenceSnapshot.confidence.confidenceLevel,
      topReason: confidenceSnapshot.confidence.confidenceReasons[0] ?? null,
      topUncertaintyFlag: confidenceSnapshot.confidence.uncertaintyFlags[0]?.code ?? null,
    },
  });
  await appendAuditEventsSafe(auditEvents);

  return NextResponse.json<SaveGenerationResponse>({
    success: true,
    persisted: result.persisted,
    source: result.source,
    signal: nextSignal,
    message:
      result.source === "airtable"
        ? "Generated drafts saved to Airtable and status updated to Draft Generated."
        : "Generated drafts saved in mock mode for the current session flow only.",
  });
}
