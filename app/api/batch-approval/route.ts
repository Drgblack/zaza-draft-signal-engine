import { NextResponse } from "next/server";

import { getSignalWithFallback, saveSignalWithFallback } from "@/lib/signal-repository";
import { appendAuditEventsSafe } from "@/lib/audit";
import { batchApprovalActionRequestSchema } from "@/lib/batch-approval";
import { buildFinalReviewSummary } from "@/lib/final-review";
import { createExperiment, getExperimentTypeLabel } from "@/lib/experiments";
import { getReviewMacroDefinition } from "@/lib/review-macros";
import type { BatchApprovalResponse } from "@/types/api";
import type { SignalRecord, UpdateSignalInput } from "@/types/signal";

function platformLabel(platform: "x" | "linkedin" | "reddit"): string {
  switch (platform) {
    case "x":
      return "X";
    case "linkedin":
      return "LinkedIn";
    case "reddit":
    default:
      return "Reddit";
  }
}

function withMergedNotes(existing: string | null, addition: string | null | undefined): string | null {
  const parts = [existing?.trim() ?? "", addition?.trim() ?? ""].filter((value) => value.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function buildPlatformUpdate(
  signal: SignalRecord,
  platform: "x" | "linkedin" | "reddit",
  action: "approve" | "hold" | "skip",
  finalDraft: string | null | undefined,
  publishPrepBundleJson: string | null | undefined,
  note: string | null | undefined,
): UpdateSignalInput {
  const now = new Date().toISOString();
  const trimmedDraft = finalDraft?.trim() ? finalDraft.trim() : null;
  const mergedNotes = withMergedNotes(
    signal.finalReviewNotes,
    note ?? `Batch action: ${action.replaceAll("_", " ")} on ${platformLabel(platform)}.`,
  );
  const startedAt = signal.finalReviewStartedAt ?? now;
  const nextStatus = action === "approve" ? "Approved" : "Reviewed";
  const reviewStatus = action === "approve" ? "ready" : action === "hold" ? "needs_edit" : "skip";
  const baseNextSignal: SignalRecord = {
    ...signal,
    finalReviewNotes: mergedNotes,
    publishPrepBundleJson: publishPrepBundleJson?.trim() ? publishPrepBundleJson.trim() : signal.publishPrepBundleJson,
    finalReviewStartedAt: startedAt,
    status: nextStatus,
    xReviewStatus: platform === "x" ? reviewStatus : signal.xReviewStatus,
    linkedInReviewStatus: platform === "linkedin" ? reviewStatus : signal.linkedInReviewStatus,
    redditReviewStatus: platform === "reddit" ? reviewStatus : signal.redditReviewStatus,
    finalXDraft: platform === "x" ? trimmedDraft ?? signal.finalXDraft ?? signal.xDraft : signal.finalXDraft,
    finalLinkedInDraft:
      platform === "linkedin" ? trimmedDraft ?? signal.finalLinkedInDraft ?? signal.linkedInDraft : signal.finalLinkedInDraft,
    finalRedditDraft:
      platform === "reddit" ? trimmedDraft ?? signal.finalRedditDraft ?? signal.redditDraft : signal.finalRedditDraft,
  };
  const reviewSummary = buildFinalReviewSummary(baseNextSignal);

  return {
    finalReviewNotes: mergedNotes,
    publishPrepBundleJson: baseNextSignal.publishPrepBundleJson,
    finalReviewStartedAt: startedAt,
    finalReviewedAt:
      action !== "hold" && reviewSummary.completed ? signal.finalReviewedAt ?? now : signal.finalReviewedAt,
    status: nextStatus,
    finalXDraft: baseNextSignal.finalXDraft,
    finalLinkedInDraft: baseNextSignal.finalLinkedInDraft,
    finalRedditDraft: baseNextSignal.finalRedditDraft,
    xReviewStatus: baseNextSignal.xReviewStatus,
    linkedInReviewStatus: baseNextSignal.linkedInReviewStatus,
    redditReviewStatus: baseNextSignal.redditReviewStatus,
  };
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = batchApprovalActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<BatchApprovalResponse>(
      {
        success: false,
        persisted: false,
        signal: null,
        experiment: null,
        message: "Batch approval action failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid batch approval payload.",
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const signalResult = await getSignalWithFallback(data.signalId);
  if (!signalResult.signal) {
    return NextResponse.json<BatchApprovalResponse>(
      {
        success: false,
        persisted: false,
        signal: null,
        experiment: null,
        message: "Batch approval action failed.",
        error: signalResult.error ?? "Signal not found.",
      },
      { status: signalResult.source === "mock" ? 404 : 502 },
    );
  }

  try {
    if (data.action === "convert_to_experiment") {
      const experiment = await createExperiment({
        name: `${signalResult.signal.sourceTitle} ${getExperimentTypeLabel(data.experimentType ?? "platform_expression_test")}`,
        hypothesis:
          data.note?.trim() ??
          `Batch review surfaced unresolved ${getExperimentTypeLabel(data.experimentType ?? "platform_expression_test").toLowerCase()} for ${signalResult.signal.sourceTitle}.`,
        status: "active",
        experimentType: data.experimentType ?? "platform_expression_test",
        learningGoal: `Resolve the strongest remaining tradeoff before final approval on ${platformLabel(data.platform)}.`,
        comparisonTarget: platformLabel(data.platform),
        source: "operator",
        variantLabel: "Variant A",
        signalId: signalResult.signal.recordId,
      });

      await appendAuditEventsSafe([
        ...(data.macroId
          ? [{
              signalId: signalResult.signal.recordId,
              eventType: "REVIEW_MACRO_APPLIED" as const,
              actor: "operator" as const,
              summary: `Applied review macro ${getReviewMacroDefinition(data.macroId).label} in batch review.`,
              metadata: {
                macroId: data.macroId,
                candidateId: signalResult.signal.recordId,
                platform: data.platform,
              },
            }]
          : []),
        {
          signalId: signalResult.signal.recordId,
          eventType: "BATCH_ITEM_CONVERTED_TO_EXPERIMENT",
          actor: "operator",
          summary: `Converted ${signalResult.signal.sourceTitle} into a batch experiment.`,
          metadata: {
            experimentId: experiment.experimentId,
            experimentType: experiment.experimentType,
            platform: data.platform,
          },
        },
        {
          signalId: `experiment:${experiment.experimentId}`,
          eventType: "EXPERIMENT_CREATED",
          actor: "operator",
          summary: `Created experiment ${experiment.name} from batch approval.`,
          metadata: {
            status: experiment.status,
            hypothesis: experiment.hypothesis,
            variantCount: experiment.variants.length,
          },
        },
      ]);

      return NextResponse.json<BatchApprovalResponse>({
        success: true,
        persisted: true,
        signal: signalResult.signal,
        experiment,
        message: "Batch candidate converted to experiment.",
      });
    }

    const update = buildPlatformUpdate(
      signalResult.signal,
      data.platform,
      data.action,
      data.finalDraft,
      data.publishPrepBundleJson,
      data.note,
    );
    const saved = await saveSignalWithFallback(data.signalId, update);

    if (!saved.signal) {
      return NextResponse.json<BatchApprovalResponse>(
        {
          success: false,
          persisted: saved.persisted,
          signal: null,
          experiment: null,
          message: "Batch approval action failed.",
          error: saved.error ?? "Unable to save signal.",
        },
        { status: saved.persisted ? 500 : saved.source === "mock" ? 404 : 502 },
      );
    }

    const eventType =
      data.action === "approve"
        ? "BATCH_ITEM_APPROVED"
        : data.action === "hold"
          ? "BATCH_ITEM_HELD"
          : "BATCH_ITEM_SKIPPED";
    const summary =
      data.action === "approve"
        ? `Approved ${saved.signal.sourceTitle} from batch review.`
        : data.action === "hold"
          ? `Held ${saved.signal.sourceTitle} from batch review.`
          : `Skipped ${saved.signal.sourceTitle} in batch review.`;

    await appendAuditEventsSafe([
      ...(data.macroId
        ? [{
            signalId: saved.signal.recordId,
            eventType: "REVIEW_MACRO_APPLIED" as const,
            actor: "operator" as const,
            summary: `Applied review macro ${getReviewMacroDefinition(data.macroId).label} in batch review.`,
            metadata: {
              macroId: data.macroId,
              candidateId: saved.signal.recordId,
              platform: data.platform,
            },
          }]
        : []),
      {
        signalId: saved.signal.recordId,
        eventType,
        actor: "operator",
        summary,
        metadata: {
          platform: data.platform,
          reason: data.note?.trim() ?? null,
        },
      },
    ]);

    return NextResponse.json<BatchApprovalResponse>({
      success: true,
      persisted: saved.persisted,
      signal: saved.signal,
      experiment: null,
      message:
        data.action === "approve"
          ? "Batch candidate approved."
          : data.action === "hold"
            ? "Batch candidate held."
            : "Batch candidate skipped.",
    });
  } catch (error) {
    return NextResponse.json<BatchApprovalResponse>(
      {
        success: false,
        persisted: false,
        signal: null,
        experiment: null,
        message: "Batch approval action failed.",
        error: error instanceof Error ? error.message : "Unable to update batch candidate.",
      },
      { status: 500 },
    );
  }
}

