import { NextResponse } from "next/server";

import { assessAutonomousSignal } from "@/lib/auto-advance";
import {
  appendAutoRepairHistory,
  assessAutoRepairPlan,
  buildAutoRepairHistoryEntry,
} from "@/lib/auto-repair";
import { getSignalWithFallback, listSignalsWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { appendAuditEventsSafe, buildRecommendationEvent, type AuditEventInput } from "@/lib/audit";
import { listFeedbackEntries } from "@/lib/feedback";
import { assembleGuidanceForSignal } from "@/lib/guidance";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { getOperatorTuning } from "@/lib/tuning";
import { borderlineReviewRequestSchema, type BorderlineReviewResponse } from "@/types/api";

function appendReviewNote(existing: string | null | undefined, note: string): string {
  const normalizedExisting = existing?.trim();
  return normalizedExisting ? `${normalizedExisting}\n\n${note}` : note;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = borderlineReviewRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signal: null,
        message: "Borderline action failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid borderline review payload.",
      } satisfies BorderlineReviewResponse,
      { status: 400 },
    );
  }

  const signalResult = await getSignalWithFallback(id);
  if (!signalResult.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: signalResult.source,
        signal: null,
        message: "Borderline action failed.",
        error: signalResult.error ?? "Signal not found.",
      } satisfies BorderlineReviewResponse,
      { status: 404 },
    );
  }

  const signal = signalResult.signal;
  const tuning = await getOperatorTuning();
  const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
  const feedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const bundles = await listPatternBundles();
  const playbookCards = await listPlaybookCards();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: allSignals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: allSignals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const guidance = assembleGuidanceForSignal({
    signal,
    context: "review",
    allSignals,
    feedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning: tuning.settings,
  });
  const assessment = assessAutonomousSignal(signal, guidance);
  const action = parsed.data.action;
  const note = parsed.data.note?.trim() || null;
  const auditEvents: AuditEventInput[] = [];

  if (action === "open_workbench") {
    auditEvents.push({
      signalId: id,
      eventType: "BORDERLINE_REVIEW_OPENED",
      actor: "operator",
      summary: "Opened the borderline review workbench.",
      metadata: {
        holdStage: assessment.stage,
        strongestCaution: assessment.strongestCaution,
      },
    });
    await appendAuditEventsSafe(auditEvents);
    return NextResponse.json({
      success: true,
      persisted: true,
      source: signalResult.source,
      signal,
      message: "Borderline workbench opened.",
    } satisfies BorderlineReviewResponse);
  }

  if (assessment.decision !== "hold") {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: signalResult.source,
        signal,
        message: "Borderline action failed.",
        error: "This record is no longer in a borderline held state.",
      } satisfies BorderlineReviewResponse,
      { status: 409 },
    );
  }

  if (action === "approve_anyway") {
    const result = await saveSignalWithFallback(id, {
      status: "Approved",
      reviewNotes: appendReviewNote(signal.reviewNotes, note ?? "Approved anyway from the borderline review workbench."),
    });

    if (!result.signal) {
      return NextResponse.json(
        {
          success: false,
          persisted: result.persisted,
          source: result.source,
          signal: null,
          message: "Borderline action failed.",
          error: result.error ?? "Signal not found.",
        } satisfies BorderlineReviewResponse,
        { status: 502 },
      );
    }

    auditEvents.push(
      {
        signalId: id,
        eventType: "BORDERLINE_RESOLVED",
        actor: "operator",
        summary: "Resolved borderline case by approving anyway.",
        metadata: {
          resolution: "approved_anyway",
          holdStage: assessment.stage,
        },
      },
      {
        signalId: id,
        eventType: "STATUS_CHANGED",
        actor: "operator",
        summary: "Changed status to Approved.",
        metadata: {
          previousStatus: signal.status,
          nextStatus: "Approved",
        },
      },
      buildRecommendationEvent(result.signal, tuning.settings),
    );
    await appendAuditEventsSafe(auditEvents);
    return NextResponse.json({
      success: true,
      persisted: result.persisted,
      source: result.source,
      signal: result.signal,
      message: "Borderline case approved with operator confirmation.",
    } satisfies BorderlineReviewResponse);
  }

  if (action === "reject") {
    const result = await saveSignalWithFallback(id, {
      status: "Rejected",
      reviewNotes: appendReviewNote(signal.reviewNotes, note ?? "Rejected from the borderline review workbench."),
    });

    if (!result.signal) {
      return NextResponse.json(
        {
          success: false,
          persisted: result.persisted,
          source: result.source,
          signal: null,
          message: "Borderline action failed.",
          error: result.error ?? "Signal not found.",
        } satisfies BorderlineReviewResponse,
        { status: 502 },
      );
    }

    auditEvents.push(
      {
        signalId: id,
        eventType: "BORDERLINE_RESOLVED",
        actor: "operator",
        summary: "Resolved borderline case by rejecting it.",
        metadata: {
          resolution: "rejected",
          holdStage: assessment.stage,
        },
      },
      {
        signalId: id,
        eventType: "STATUS_CHANGED",
        actor: "operator",
        summary: "Changed status to Rejected.",
        metadata: {
          previousStatus: signal.status,
          nextStatus: "Rejected",
        },
      },
      buildRecommendationEvent(result.signal, tuning.settings),
    );
    await appendAuditEventsSafe(auditEvents);
    return NextResponse.json({
      success: true,
      persisted: result.persisted,
      source: result.source,
      signal: result.signal,
      message: "Borderline case rejected with operator confirmation.",
    } satisfies BorderlineReviewResponse);
  }

  if (action === "request_more_context") {
    const noteText =
      note ??
      "Borderline workbench requested more source context before a keep-or-reject decision.";
    const result = await saveSignalWithFallback(id, {
      reviewNotes: appendReviewNote(signal.reviewNotes, noteText),
    });

    if (!result.signal) {
      return NextResponse.json(
        {
          success: false,
          persisted: result.persisted,
          source: result.source,
          signal: null,
          message: "Borderline action failed.",
          error: result.error ?? "Signal not found.",
        } satisfies BorderlineReviewResponse,
        { status: 502 },
      );
    }

    auditEvents.push(
      {
        signalId: id,
        eventType: "BORDERLINE_RESOLVED",
        actor: "operator",
        summary: "Resolved borderline case by requesting more context.",
        metadata: {
          resolution: "requested_more_context",
          holdStage: assessment.stage,
        },
      },
      buildRecommendationEvent(result.signal, tuning.settings),
    );
    await appendAuditEventsSafe(auditEvents);
    return NextResponse.json({
      success: true,
      persisted: result.persisted,
      source: result.source,
      signal: result.signal,
      message: "Marked for more context before the next decision.",
    } satisfies BorderlineReviewResponse);
  }

  const repairPlan = assessAutoRepairPlan(signal, guidance, assessment);
  if (repairPlan.eligibility !== "repairable") {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: signalResult.source,
        signal,
        message: "Borderline action failed.",
        error: "No bounded repair is available for this held case.",
      } satisfies BorderlineReviewResponse,
      { status: 409 },
    );
  }

  const repairSummary = note ?? `Applied bounded borderline repair: ${repairPlan.notes[0] ?? repairPlan.whyAttempted}`;
  const autoRepairHistoryJson = appendAutoRepairHistory(
    signal,
    buildAutoRepairHistoryEntry({
      stage: assessment.stage ?? "auto_prepare_for_review",
      plan: repairPlan,
      outcome: "repaired_still_held",
      summary: repairSummary,
    }),
  );
  const result = await saveSignalWithFallback(id, {
    ...repairPlan.updates,
    autoRepairHistoryJson,
    reviewNotes: appendReviewNote(
      signal.reviewNotes,
      `${repairSummary}${repairPlan.rerunGeneration ? " Re-run generation before approving." : ""}`,
    ),
  });

  if (!result.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: result.persisted,
        source: result.source,
        signal: null,
        message: "Borderline action failed.",
        error: result.error ?? "Signal not found.",
      } satisfies BorderlineReviewResponse,
      { status: 502 },
    );
  }

  auditEvents.push(
    {
      signalId: id,
      eventType: "BORDERLINE_RESOLVED",
      actor: "operator",
      summary: "Resolved borderline case by applying a bounded repair.",
      metadata: {
        resolution: "repair_applied",
        holdStage: assessment.stage,
        repairType: repairPlan.repairType,
      },
    },
    {
      signalId: id,
      eventType: "AUTO_REPAIR_ATTEMPTED",
      actor: "operator",
      summary: repairSummary,
      metadata: {
        repairType: repairPlan.repairType,
        changedFields: repairPlan.changedFields.join(", "),
      },
    },
    buildRecommendationEvent(result.signal, tuning.settings),
  );
  await appendAuditEventsSafe(auditEvents);

  return NextResponse.json({
    success: true,
    persisted: result.persisted,
    source: result.source,
    signal: result.signal,
    message: "Bounded repair applied. The record stays held until the operator confirms the next step.",
  } satisfies BorderlineReviewResponse);
}
