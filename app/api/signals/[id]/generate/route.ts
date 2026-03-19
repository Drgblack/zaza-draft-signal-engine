import { NextResponse } from "next/server";

import { appendAuditEventsSafe, buildOperatorOverrideEvent, buildRecommendationEvent, listAuditEvents, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback, listSignalsWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { assignSignalContentContext, getCampaignStrategy } from "@/lib/campaigns";
import { buildSignalAssetBundle } from "@/lib/assets";
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
import {
  assessRepurposingEligibility,
  buildRepurposingBundle,
  stringifyRepurposingBundle,
  stringifySelectedRepurposedOutputIds,
} from "@/lib/repurposing";
import { buildSignalPublishPrepBundle, stringifyPublishPrepBundle } from "@/lib/publish-prep";
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
  const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
  const strategy = await getCampaignStrategy();
  const baseSignal = previousSignalResult.signal ?? allSignals.find((signal) => signal.recordId === id) ?? null;
  const signalForAssignment = baseSignal
      ? {
        ...baseSignal,
        xDraft: generation.xDraft,
        linkedInDraft: generation.linkedInDraft,
        redditDraft: generation.redditDraft,
        imagePrompt: generation.imagePrompt,
        videoScript: generation.videoScript,
        ctaOrClosingLine: generation.ctaOrClosingLine,
        hashtagsOrKeywords: generation.hashtagsOrKeywords,
        assetBundleJson: generation.assetBundleJson ?? null,
        preferredAssetType: generation.preferredAssetType ?? null,
        selectedImageAssetId: generation.selectedImageAssetId ?? null,
        selectedVideoConceptId: generation.selectedVideoConceptId ?? null,
        generatedImageUrl: generation.generatedImageUrl ?? null,
        editorialMode: generation.editorialMode,
      }
    : null;
  const contextAssignment = signalForAssignment
    ? assignSignalContentContext(signalForAssignment, strategy, {
        campaignId: generation.campaignId,
        pillarId: generation.pillarId,
        audienceSegmentId: generation.audienceSegmentId,
        funnelStage: generation.funnelStage,
        ctaGoal: generation.ctaGoal,
      })
    : null;
  const result = await saveSignalWithFallback(id, {
    xDraft: generation.xDraft,
    linkedInDraft: generation.linkedInDraft,
    redditDraft: generation.redditDraft,
    imagePrompt: generation.imagePrompt,
    videoScript: generation.videoScript,
    ctaOrClosingLine: generation.ctaOrClosingLine,
    hashtagsOrKeywords: generation.hashtagsOrKeywords,
    assetBundleJson: generation.assetBundleJson ?? null,
    publishPrepBundleJson: generation.publishPrepBundleJson ?? null,
    preferredAssetType: generation.preferredAssetType ?? null,
    selectedImageAssetId: generation.selectedImageAssetId ?? null,
    selectedVideoConceptId: generation.selectedVideoConceptId ?? null,
    generatedImageUrl: generation.generatedImageUrl ?? null,
    generationModelVersion: generation.generationModelVersion,
    promptVersion: generation.promptVersion,
    editorialMode: generation.editorialMode,
    campaignId: contextAssignment?.context.campaignId ?? generation.campaignId ?? null,
    pillarId: contextAssignment?.context.pillarId ?? generation.pillarId ?? null,
    audienceSegmentId: contextAssignment?.context.audienceSegmentId ?? generation.audienceSegmentId ?? null,
    funnelStage: contextAssignment?.context.funnelStage ?? generation.funnelStage ?? null,
    ctaGoal: contextAssignment?.context.ctaGoal ?? generation.ctaGoal ?? null,
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

  let nextSignal = result.signal;
  const auditEvents: AuditEventInput[] = [];
  if (previousSignalResult.signal) {
    const overrideEvent = buildOperatorOverrideEvent(previousSignalResult.signal, "generate", tuning.settings);
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
    {
      signalId: id,
      eventType: "ASSETS_GENERATED" as const,
      actor: "system" as const,
      summary: "Structured image and video asset concepts were generated for review.",
      metadata: {
        preferredAssetType: generation.preferredAssetType ?? "text_first",
        imageAssetSelected: generation.selectedImageAssetId ?? null,
        videoConceptSelected: generation.selectedVideoConceptId ?? null,
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

  const repurposingEligibility = assessRepurposingEligibility({
    signal: nextSignal,
    confidenceLevel: confidenceSnapshot.confidence.confidenceLevel,
  });
  if (repurposingEligibility.eligible) {
    const repurposingBundle = buildRepurposingBundle({
      signal: nextSignal,
      assetBundle: buildSignalAssetBundle(nextSignal),
    });
    const repurposingSave = await saveSignalWithFallback(id, {
      repurposingBundleJson: stringifyRepurposingBundle(repurposingBundle),
      selectedRepurposedOutputIdsJson: stringifySelectedRepurposedOutputIds(repurposingBundle.recommendedSubset ?? []),
    });

    if (repurposingSave.signal) {
      nextSignal = repurposingSave.signal;
      auditEvents.push({
        signalId: id,
        eventType: "REPURPOSING_GENERATED",
        actor: "system",
        summary: `Generated ${repurposingBundle.outputs.length} bounded repurposed variants for review.`,
        metadata: {
          primaryPlatform: repurposingBundle.primaryPlatform,
          variantCount: repurposingBundle.outputs.length,
        },
      });
    }
  } else if (nextSignal.repurposingBundleJson || nextSignal.selectedRepurposedOutputIdsJson) {
    const clearedRepurposing = await saveSignalWithFallback(id, {
      repurposingBundleJson: null,
      selectedRepurposedOutputIdsJson: null,
    });
    if (clearedRepurposing.signal) {
      nextSignal = clearedRepurposing.signal;
    }
  }

  const publishPrepBundle = buildSignalPublishPrepBundle(nextSignal);
  const publishPrepSave = await saveSignalWithFallback(id, {
    publishPrepBundleJson: stringifyPublishPrepBundle(publishPrepBundle),
  });
  if (publishPrepSave.signal) {
    nextSignal = publishPrepSave.signal;
    auditEvents.push({
      signalId: id,
      eventType: "PUBLISH_PREP_GENERATED",
      actor: "system",
      summary: `Prepared ${publishPrepBundle?.packages.length ?? 0} publish-prep package${publishPrepBundle?.packages.length === 1 ? "" : "s"} for manual posting review.`,
      metadata: {
        packageCount: publishPrepBundle?.packages.length ?? 0,
        primaryPlatform: publishPrepBundle?.primaryPlatform ?? null,
      },
    });
  }
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
