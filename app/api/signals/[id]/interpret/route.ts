import { NextResponse } from "next/server";

import { appendAuditEventsSafe, buildOperatorOverrideEvent, buildRecommendationEvent, listAuditEvents, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback, listSignalsWithFallback, saveSignalWithFallback } from "@/lib/signal-repository";
import { assignSignalContentContext, getCampaignStrategy } from "@/lib/campaigns";
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
import { saveInterpretationRequestSchema, toInterpretationSavePayload, type SaveInterpretationResponse } from "@/types/api";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = saveInterpretationRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signal: null,
        message: "Interpretation could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid interpretation payload.",
      },
      { status: 400 },
    );
  }

  const interpretation = toInterpretationSavePayload(parsed.data);
  const tuning = await getOperatorTuning();
  const previousSignalResult = await getSignalWithFallback(id);
  const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
  const strategy = await getCampaignStrategy();
  const baseSignal = previousSignalResult.signal ?? allSignals.find((signal) => signal.recordId === id) ?? null;
  const signalForAssignment = baseSignal
    ? {
        ...baseSignal,
        scenarioAngle: interpretation.scenarioAngle ?? null,
        signalCategory: interpretation.signalCategory,
        severityScore: interpretation.severityScore,
        signalSubtype: interpretation.signalSubtype,
        emotionalPattern: interpretation.emotionalPattern,
        teacherPainPoint: interpretation.teacherPainPoint,
        relevanceToZazaDraft: interpretation.relevanceToZazaDraft,
        riskToTeacher: interpretation.riskToTeacher,
        interpretationNotes: interpretation.interpretationNotes,
        hookTemplateUsed: interpretation.hookTemplateUsed,
        contentAngle: interpretation.contentAngle,
        platformPriority: interpretation.platformPriority,
        suggestedFormatPriority: interpretation.suggestedFormatPriority,
      }
    : null;
  const contextAssignment = signalForAssignment
    ? assignSignalContentContext(signalForAssignment, strategy, {
        campaignId: interpretation.campaignId,
        pillarId: interpretation.pillarId,
        audienceSegmentId: interpretation.audienceSegmentId,
        funnelStage: interpretation.funnelStage,
        ctaGoal: interpretation.ctaGoal,
      })
    : null;
  const result = await saveSignalWithFallback(id, {
    scenarioAngle: interpretation.scenarioAngle,
    signalCategory: interpretation.signalCategory,
    severityScore: interpretation.severityScore,
    signalSubtype: interpretation.signalSubtype,
    emotionalPattern: interpretation.emotionalPattern,
    teacherPainPoint: interpretation.teacherPainPoint,
    relevanceToZazaDraft: interpretation.relevanceToZazaDraft,
    riskToTeacher: interpretation.riskToTeacher,
    interpretationNotes: interpretation.interpretationNotes,
    hookTemplateUsed: interpretation.hookTemplateUsed,
    contentAngle: interpretation.contentAngle,
    platformPriority: interpretation.platformPriority,
    suggestedFormatPriority: interpretation.suggestedFormatPriority,
    campaignId: contextAssignment?.context.campaignId ?? interpretation.campaignId ?? null,
    pillarId: contextAssignment?.context.pillarId ?? interpretation.pillarId ?? null,
    audienceSegmentId: contextAssignment?.context.audienceSegmentId ?? interpretation.audienceSegmentId ?? null,
    funnelStage: contextAssignment?.context.funnelStage ?? interpretation.funnelStage ?? null,
    ctaGoal: contextAssignment?.context.ctaGoal ?? interpretation.ctaGoal ?? null,
    status: interpretation.status ?? "Interpreted",
  });

  if (!result.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: result.persisted,
        source: result.source,
        signal: null,
        message: "Interpretation could not be saved.",
        error: result.error ?? "Signal not found.",
      },
      { status: result.source === "mock" ? 404 : 502 },
    );
  }

  const nextSignal = result.signal;
  const feedbackEntries = await getFeedbackEntries(id);
  const allFeedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const bundles = await listPatternBundles();
  const playbookCards = await listPlaybookCards();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
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
  const auditEvents: AuditEventInput[] = [];
  if (previousSignalResult.signal) {
    const previousScenarioAngle = previousSignalResult.signal.scenarioAngle?.trim() ?? "";
    const nextScenarioAngle = interpretation.scenarioAngle?.trim() ?? "";
    if (nextScenarioAngle && nextScenarioAngle !== previousScenarioAngle) {
      auditEvents.push({
        signalId: id,
        eventType: "SCENARIO_ANGLE_ADDED",
        actor: "operator",
        summary: previousScenarioAngle ? "Updated Scenario Angle." : "Added Scenario Angle.",
        metadata: {
          hadPreviousScenarioAngle: previousScenarioAngle.length > 0,
        },
      });
    }

    const overrideEvent = buildOperatorOverrideEvent(previousSignalResult.signal, "interpret", tuning.settings);
    if (overrideEvent) {
      auditEvents.push(overrideEvent);
    }

    const nextContext = contextAssignment?.context;
    if (
      nextContext &&
      (nextContext.campaignId !== previousSignalResult.signal.campaignId ||
        nextContext.pillarId !== previousSignalResult.signal.pillarId ||
        nextContext.audienceSegmentId !== previousSignalResult.signal.audienceSegmentId ||
        nextContext.funnelStage !== previousSignalResult.signal.funnelStage ||
        nextContext.ctaGoal !== previousSignalResult.signal.ctaGoal)
    ) {
      auditEvents.push({
        signalId: id,
        eventType: contextAssignment.autoAssignedKeys.length > 0 ? "CONTEXT_AUTO_ASSIGNED" : "CONTENT_CONTEXT_ASSIGNED",
        actor: "system",
        summary: contextAssignment.summary,
        metadata: {
          campaignId: nextContext.campaignId,
          pillarId: nextContext.pillarId,
          audienceSegmentId: nextContext.audienceSegmentId,
          funnelStage: nextContext.funnelStage,
          ctaGoal: nextContext.ctaGoal,
        },
      });
    }
  }

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
      eventType: "INTERPRETATION_SAVED",
      actor: "operator",
      summary: `Saved interpretation as ${nextSignal.status}.`,
      metadata: {
        category: interpretation.signalCategory,
        severity: interpretation.severityScore,
      },
    },
    buildRecommendationEvent(nextSignal, tuning.settings),
  );
  const confidenceSnapshot = assembleGuidanceForSignal({
    signal: nextSignal,
    context: "interpretation",
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
    eventType: "EDITORIAL_CONFIDENCE_SNAPSHOT",
    actor: "system",
    summary: `Editorial confidence is ${confidenceSnapshot.confidence.confidenceLevel} for interpretation guidance.`,
    metadata: {
      stage: "interpretation_saved",
      confidenceLevel: confidenceSnapshot.confidence.confidenceLevel,
      topReason: confidenceSnapshot.confidence.confidenceReasons[0] ?? null,
      topUncertaintyFlag: confidenceSnapshot.confidence.uncertaintyFlags[0]?.code ?? null,
    },
  });
  await appendAuditEventsSafe(auditEvents);

  return NextResponse.json<SaveInterpretationResponse>({
    success: true,
    persisted: result.persisted,
    source: result.source,
    signal: nextSignal,
    message:
      result.source === "airtable"
        ? "Interpretation saved to Airtable and status updated to Interpreted."
        : "Interpretation saved in mock mode for the current session flow only.",
  });
}
