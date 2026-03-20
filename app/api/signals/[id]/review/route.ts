import { NextResponse } from "next/server";

import { appendAuditEventsSafe, buildRecommendationEvent, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback, listSignalsWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { getCampaignStrategy } from "@/lib/campaigns";
import { evaluateApprovalPackageCompleteness } from "@/lib/completeness";
import { recordLearnedEditPatterns } from "@/lib/edit-patterns";
import { buildEvergreenSummary, getEvergreenCandidateById } from "@/lib/evergreen";
import { buildFinalReviewSummary } from "@/lib/final-review";
import { listFeedbackEntries } from "@/lib/feedback";
import { assembleGuidanceForSignal } from "@/lib/guidance";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPatterns } from "@/lib/patterns";
import { listPostingLogEntries } from "@/lib/posting-log";
import { parsePublishPrepBundle } from "@/lib/publish-prep";
import { getReviewMacroDefinition } from "@/lib/review-macros";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import {
  finalReviewUpdateRequestSchema,
  toFinalReviewSavePayload,
  type SaveFinalReviewResponse,
} from "@/types/api";
import type { SignalRecord } from "@/types/signal";

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

function getFinalDraft(signal: SignalRecord, platform: "x" | "linkedin" | "reddit"): string | null {
  switch (platform) {
    case "x":
      return signal.finalXDraft;
    case "linkedin":
      return signal.finalLinkedInDraft;
    case "reddit":
    default:
      return signal.finalRedditDraft;
  }
}

function getReviewStatus(signal: SignalRecord, platform: "x" | "linkedin" | "reddit") {
  switch (platform) {
    case "x":
      return signal.xReviewStatus;
    case "linkedin":
      return signal.linkedInReviewStatus;
    case "reddit":
    default:
      return signal.redditReviewStatus;
  }
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = finalReviewUpdateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signal: null,
        message: "Final review could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid final review payload.",
      },
      { status: 400 },
    );
  }

  const review = toFinalReviewSavePayload(parsed.data);
  const tuning = await getOperatorTuning();
  const strategy = await getCampaignStrategy();
  const previousSignalResult = await getSignalWithFallback(id);
  if (!previousSignalResult.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: previousSignalResult.source,
        signal: null,
        message: "Final review could not be saved.",
        error: previousSignalResult.error ?? "Signal not found.",
      },
      { status: previousSignalResult.source === "mock" ? 404 : 502 },
    );
  }

  const previousSignal = previousSignalResult.signal;
  const reviewStarted =
    Boolean(previousSignal.finalReviewStartedAt) ||
    review.finalXDraft !== null ||
    review.finalLinkedInDraft !== null ||
    review.finalRedditDraft !== null ||
    review.xReviewStatus !== null ||
    review.linkedInReviewStatus !== null ||
    review.redditReviewStatus !== null ||
    review.finalReviewNotes !== null;
  const startedAt = previousSignal.finalReviewStartedAt ?? (reviewStarted ? new Date().toISOString() : null);
  const previewNextSignal: SignalRecord = {
    ...previousSignal,
    finalXDraft: review.finalXDraft,
    finalLinkedInDraft: review.finalLinkedInDraft,
    finalRedditDraft: review.finalRedditDraft,
    xReviewStatus: review.xReviewStatus,
    linkedInReviewStatus: review.linkedInReviewStatus,
    redditReviewStatus: review.redditReviewStatus,
    finalReviewNotes: review.finalReviewNotes,
    imagePrompt: review.imagePrompt ?? previousSignal.imagePrompt,
    videoScript: review.videoScript ?? previousSignal.videoScript,
    assetBundleJson: review.assetBundleJson ?? previousSignal.assetBundleJson,
    preferredAssetType: review.preferredAssetType ?? previousSignal.preferredAssetType,
    selectedImageAssetId: review.selectedImageAssetId ?? previousSignal.selectedImageAssetId,
    selectedVideoConceptId: review.selectedVideoConceptId ?? previousSignal.selectedVideoConceptId,
    generatedImageUrl: review.generatedImageUrl ?? previousSignal.generatedImageUrl,
    repurposingBundleJson: review.repurposingBundleJson ?? previousSignal.repurposingBundleJson,
    publishPrepBundleJson: review.publishPrepBundleJson ?? previousSignal.publishPrepBundleJson,
    selectedRepurposedOutputIdsJson:
      review.selectedRepurposedOutputIdsJson ?? previousSignal.selectedRepurposedOutputIdsJson,
    founderVoiceMode: review.founderVoiceMode ?? previousSignal.founderVoiceMode,
    founderVoiceAppliedAt: review.founderVoiceAppliedAt ?? previousSignal.founderVoiceAppliedAt,
    finalReviewStartedAt: startedAt,
    finalReviewedAt: previousSignal.finalReviewedAt,
  };
  const nextSummary = buildFinalReviewSummary(previewNextSignal);
  const finalReviewedAt = nextSummary.completed ? previousSignal.finalReviewedAt ?? new Date().toISOString() : null;

  const result = await saveSignalWithFallback(id, {
    finalXDraft: review.finalXDraft,
    finalLinkedInDraft: review.finalLinkedInDraft,
    finalRedditDraft: review.finalRedditDraft,
    xReviewStatus: review.xReviewStatus,
    linkedInReviewStatus: review.linkedInReviewStatus,
    redditReviewStatus: review.redditReviewStatus,
    finalReviewNotes: review.finalReviewNotes,
    imagePrompt: review.imagePrompt ?? previousSignal.imagePrompt,
    videoScript: review.videoScript ?? previousSignal.videoScript,
    assetBundleJson: review.assetBundleJson ?? previousSignal.assetBundleJson,
    preferredAssetType: review.preferredAssetType ?? previousSignal.preferredAssetType,
    selectedImageAssetId: review.selectedImageAssetId ?? previousSignal.selectedImageAssetId,
    selectedVideoConceptId: review.selectedVideoConceptId ?? previousSignal.selectedVideoConceptId,
    generatedImageUrl: review.generatedImageUrl ?? previousSignal.generatedImageUrl,
    repurposingBundleJson: review.repurposingBundleJson ?? previousSignal.repurposingBundleJson,
    publishPrepBundleJson: review.publishPrepBundleJson ?? previousSignal.publishPrepBundleJson,
    selectedRepurposedOutputIdsJson:
      review.selectedRepurposedOutputIdsJson ?? previousSignal.selectedRepurposedOutputIdsJson,
    founderVoiceMode: review.founderVoiceMode ?? previousSignal.founderVoiceMode,
    founderVoiceAppliedAt: review.founderVoiceAppliedAt ?? previousSignal.founderVoiceAppliedAt,
    finalReviewStartedAt: startedAt,
    finalReviewedAt,
  });

  if (!result.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: result.persisted,
        source: result.source,
        signal: null,
        message: "Final review could not be saved.",
        error: result.error ?? "Signal not found.",
      },
      { status: result.source === "mock" ? 404 : 502 },
    );
  }

  const nextSignal = result.signal;
  const previousSummary = buildFinalReviewSummary(previousSignal);
  const completedSummary = buildFinalReviewSummary(nextSignal);
  const previousCompleteness = evaluateApprovalPackageCompleteness({
    signal: previousSignal,
    guidanceConfidenceLevel: null,
  });
  const nextCompleteness = evaluateApprovalPackageCompleteness({
    signal: nextSignal,
    guidanceConfidenceLevel: null,
  });
  const auditEvents: AuditEventInput[] = [];
  let evergreenCandidate = null;
  const appliedEditSuggestions = review.appliedEditSuggestions ?? [];

  if (!previousSummary.started && completedSummary.started) {
    auditEvents.push({
      signalId: id,
      eventType: "FINAL_REVIEW_STARTED",
      actor: "operator",
      summary: "Started final review workspace.",
    });

    const feedbackEntries = await listFeedbackEntries();
    const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
    const patterns = await listPatterns();
    const bundles = await listPatternBundles();
    const playbookCards = await listPlaybookCards();
    const postingEntries = await listPostingLogEntries();
    const postingOutcomes = await listPostingOutcomes();
    const strategicOutcomes = await listStrategicOutcomes();
    const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
    const updatedSignals = allSignals.map((signal) => (signal.recordId === id ? nextSignal : signal));
    evergreenCandidate = getEvergreenCandidateById(
      buildEvergreenSummary({
        signals: updatedSignals,
        postingEntries,
        postingOutcomes,
        strategicOutcomes,
        strategy,
        bundles,
        maxCandidates: 10,
      }),
      review.evergreenCandidateId,
    );
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
    const confidenceSnapshot = assembleGuidanceForSignal({
      signal: nextSignal,
      context: "review",
      allSignals: updatedSignals,
      feedbackEntries,
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
      summary: `Editorial confidence is ${confidenceSnapshot.confidence.confidenceLevel} when final review begins.`,
      metadata: {
        stage: "final_review_started",
        confidenceLevel: confidenceSnapshot.confidence.confidenceLevel,
        topReason: confidenceSnapshot.confidence.confidenceReasons[0] ?? null,
        topUncertaintyFlag: confidenceSnapshot.confidence.uncertaintyFlags[0]?.code ?? null,
      },
    });
  }

  if (review.evergreenCandidateId && evergreenCandidate === null) {
    const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
    const postingEntries = await listPostingLogEntries();
    const postingOutcomes = await listPostingOutcomes();
    const strategicOutcomes = await listStrategicOutcomes();
    const bundles = await listPatternBundles();
    const updatedSignals = allSignals.map((signal) => (signal.recordId === id ? nextSignal : signal));
    evergreenCandidate = getEvergreenCandidateById(
      buildEvergreenSummary({
        signals: updatedSignals,
        postingEntries,
        postingOutcomes,
        strategicOutcomes,
        strategy,
        bundles,
        maxCandidates: 10,
      }),
      review.evergreenCandidateId,
    );
  }

  for (const platform of ["x", "linkedin", "reddit"] as const) {
    const previousDraft = getFinalDraft(previousSignal, platform);
    const nextDraft = getFinalDraft(nextSignal, platform);
    const previousStatus = getReviewStatus(previousSignal, platform);
    const nextStatus = getReviewStatus(nextSignal, platform);

    if (previousDraft !== nextDraft) {
      auditEvents.push({
        signalId: id,
        eventType: "FINAL_DRAFT_EDITED",
        actor: "operator",
        summary: `Edited final ${platformLabel(platform)} draft.`,
        metadata: {
          platform,
        },
      });
    }

    if (previousStatus !== nextStatus && nextStatus === "ready") {
      auditEvents.push({
        signalId: id,
        eventType: "FINAL_DRAFT_MARKED_READY",
        actor: "operator",
        summary: `Marked ${platformLabel(platform)} draft ready.`,
        metadata: {
          platform,
        },
      });
    }

    if (previousStatus !== nextStatus && nextStatus === "skip") {
      auditEvents.push({
        signalId: id,
        eventType: "FINAL_DRAFT_MARKED_SKIP",
        actor: "operator",
        summary: `Skipped ${platformLabel(platform)} draft.`,
        metadata: {
          platform,
        },
      });
    }
  }

  const learnedPatterns =
    review.appliedEditSuggestions?.length ||
    previousSignal.finalXDraft !== nextSignal.finalXDraft ||
    previousSignal.finalLinkedInDraft !== nextSignal.finalLinkedInDraft ||
    previousSignal.finalRedditDraft !== nextSignal.finalRedditDraft ||
    previousSignal.xReviewStatus !== nextSignal.xReviewStatus ||
    previousSignal.linkedInReviewStatus !== nextSignal.linkedInReviewStatus ||
    previousSignal.redditReviewStatus !== nextSignal.redditReviewStatus
      ? await recordLearnedEditPatterns(nextSignal)
      : [];

  if (learnedPatterns.length > 0) {
    const uniquePatternTypes = Array.from(new Set(learnedPatterns.map((pattern) => pattern.patternType)));
    auditEvents.push({
      signalId: id,
      eventType: "EDIT_PATTERN_LEARNED",
      actor: "system",
      summary: `Learned ${learnedPatterns.length} edit pattern${learnedPatterns.length === 1 ? "" : "s"} from approved final-review changes.`,
      metadata: {
        patternTypes: uniquePatternTypes.join(", "),
        learnedCount: learnedPatterns.length,
      },
    });
  }

  for (const suggestion of appliedEditSuggestions) {
    auditEvents.push({
      signalId: id,
      eventType: "EDIT_SUGGESTION_APPLIED",
      actor: "operator",
      summary: `Applied edit suggestion: ${suggestion.label}.`,
      metadata: {
        platform: suggestion.platform,
        patternType: suggestion.patternType,
        suggestionKey: suggestion.key,
      },
    });
  }

  for (const macro of review.appliedReviewMacros ?? []) {
    auditEvents.push({
      signalId: id,
      eventType: "REVIEW_MACRO_APPLIED",
      actor: "operator",
      summary: `Applied review macro ${getReviewMacroDefinition(macro.macroId).label}.`,
      metadata: {
        macroId: macro.macroId,
        candidateId: id,
        platform: macro.platform,
      },
    });
  }

  if (
    review.founderVoiceAppliedAt &&
    review.founderVoiceAppliedAt !== previousSignal.founderVoiceAppliedAt
  ) {
    auditEvents.push({
      signalId: id,
      eventType: "FOUNDER_VOICE_APPLIED",
      actor: "operator",
      summary: "Applied founder voice revision during final review.",
      metadata: {
        founderVoiceMode: review.founderVoiceMode ?? nextSignal.founderVoiceMode ?? "founder_voice_on",
      },
    });
  }

  if (review.evergreenCandidateId && evergreenCandidate && evergreenCandidate.signalId === id) {
    auditEvents.push({
      signalId: id,
      eventType: "EVERGREEN_APPROVED_FOR_REUSE",
      actor: "operator",
      summary:
        evergreenCandidate.reuseMode === "reuse_directly"
          ? "Approved evergreen candidate for direct reuse in final review."
          : "Approved evergreen candidate for adaptation in final review.",
      metadata: {
        evergreenCandidateId: evergreenCandidate.id,
        reuseMode: evergreenCandidate.reuseMode,
        surfacedPlatform: evergreenCandidate.surfacedPlatform,
        priorOutcomeQuality: evergreenCandidate.priorOutcomeQuality,
      },
    });
  }

  if (
    previousSignal.preferredAssetType !== nextSignal.preferredAssetType ||
    previousSignal.selectedImageAssetId !== nextSignal.selectedImageAssetId ||
    previousSignal.selectedVideoConceptId !== nextSignal.selectedVideoConceptId
  ) {
    auditEvents.push({
      signalId: id,
      eventType: "ASSET_SELECTED",
      actor: "operator",
      summary: "Updated preferred asset selection during final review.",
      metadata: {
        preferredAssetType: nextSignal.preferredAssetType,
        selectedImageAssetId: nextSignal.selectedImageAssetId,
        selectedVideoConceptId: nextSignal.selectedVideoConceptId,
      },
    });
  }

  if (!previousSignal.generatedImageUrl && nextSignal.generatedImageUrl) {
    auditEvents.push({
      signalId: id,
      eventType: "IMAGE_GENERATED",
      actor: "operator",
      summary: "Attached a generated image reference during final review.",
      metadata: {
        generatedImageUrl: nextSignal.generatedImageUrl,
      },
    });
  }

  if (previousSignal.repurposingBundleJson !== nextSignal.repurposingBundleJson) {
    auditEvents.push({
      signalId: id,
      eventType: "REPURPOSED_OUTPUT_EDITED",
      actor: "operator",
      summary: "Edited the repurposing bundle during final review.",
      metadata: {
        bundleChanged: true,
      },
    });
  }

  if (previousSignal.publishPrepBundleJson !== nextSignal.publishPrepBundleJson) {
    auditEvents.push({
      signalId: id,
      eventType: "PUBLISH_PREP_EDITED",
      actor: "operator",
      summary: "Edited publish-prep packaging during final review.",
      metadata: {
        bundleChanged: true,
      },
    });
  }

  const previousPublishPrep = parsePublishPrepBundle(previousSignal.publishPrepBundleJson);
  const nextPublishPrep = parsePublishPrepBundle(nextSignal.publishPrepBundleJson);
  const previousHookSelections = new Map(
    (previousPublishPrep?.packages ?? []).map((pkg) => [pkg.id, pkg.selectedHookId ?? pkg.primaryHook ?? null]),
  );
  const nextHookSelections = new Map(
    (nextPublishPrep?.packages ?? []).map((pkg) => [pkg.id, pkg.selectedHookId ?? pkg.primaryHook ?? null]),
  );
  const previousCtaSelections = new Map(
    (previousPublishPrep?.packages ?? []).map((pkg) => [pkg.id, pkg.selectedCtaId ?? pkg.primaryCta ?? null]),
  );
  const nextCtaSelections = new Map(
    (nextPublishPrep?.packages ?? []).map((pkg) => [pkg.id, pkg.selectedCtaId ?? pkg.primaryCta ?? null]),
  );
  const previousLinks = new Map(
    (previousPublishPrep?.packages ?? []).map((pkg) => [
      pkg.id,
      `${pkg.siteLinkId ?? ""}|${pkg.linkVariants[0]?.url ?? ""}|${pkg.linkVariants[0]?.label ?? ""}`,
    ]),
  );
  const nextLinks = new Map(
    (nextPublishPrep?.packages ?? []).map((pkg) => [
      pkg.id,
      `${pkg.siteLinkId ?? ""}|${pkg.linkVariants[0]?.url ?? ""}|${pkg.linkVariants[0]?.label ?? ""}`,
    ]),
  );

  const hookSelectionChanged = Array.from(nextHookSelections.entries()).some(
    ([packageId, selected]) => previousHookSelections.get(packageId) !== selected,
  );
  const ctaSelectionChanged = Array.from(nextCtaSelections.entries()).some(
    ([packageId, selected]) => previousCtaSelections.get(packageId) !== selected,
  );
  const linkSelectionChanged = Array.from(nextLinks.entries()).some(
    ([packageId, selected]) => previousLinks.get(packageId) !== selected,
  );

  if (hookSelectionChanged) {
    auditEvents.push({
      signalId: id,
      eventType: "HOOK_SELECTED",
      actor: "operator",
      summary: "Updated a preferred publish hook during final review.",
    });
  }

  if (ctaSelectionChanged) {
    auditEvents.push({
      signalId: id,
      eventType: "CTA_SELECTED",
      actor: "operator",
      summary: "Updated a preferred publish CTA during final review.",
    });
  }

  if (linkSelectionChanged) {
    const leadPackage = nextPublishPrep?.packages.find((pkg) => pkg.linkVariants.length > 0) ?? null;
    auditEvents.push({
      signalId: id,
      eventType: "PUBLISH_LINK_UPDATED",
      actor: "operator",
      summary: "Updated a publish destination link during final review.",
      metadata: {
        packageId: leadPackage?.id ?? null,
        siteLinkId: leadPackage?.siteLinkId ?? null,
      },
    });
  }

  if (previousSignal.selectedRepurposedOutputIdsJson !== nextSignal.selectedRepurposedOutputIdsJson) {
    auditEvents.push({
      signalId: id,
      eventType: "REPURPOSED_OUTPUT_SELECTED",
      actor: "operator",
      summary: "Updated selected repurposed outputs during final review.",
      metadata: {
        selectedRepurposedOutputIdsJson: nextSignal.selectedRepurposedOutputIdsJson,
      },
    });
  }

  if (!previousSummary.completed && completedSummary.completed) {
    auditEvents.push({
      signalId: id,
      eventType: "FINAL_REVIEW_COMPLETED",
      actor: "operator",
      summary: "Completed final review decisions for generated drafts.",
      metadata: {
        readyCount: completedSummary.readyCount,
        skipCount: completedSummary.skipCount,
      },
    });
  }

  auditEvents.push({
    signalId: id,
    eventType: "APPROVAL_PACKAGE_EVALUATED",
    actor: "system",
    summary: `Approval package evaluated as ${nextCompleteness.completenessState.replaceAll("_", " ")}.`,
    metadata: {
      completenessScore: nextCompleteness.completenessScore,
      completenessState: nextCompleteness.completenessState,
      missingElements: nextCompleteness.missingElements.join(", "),
    },
  });

  if (
    previousCompleteness.completenessState !== "complete" &&
    nextCompleteness.completenessState === "complete"
  ) {
    auditEvents.push({
      signalId: id,
      eventType: "APPROVAL_PACKAGE_COMPLETED",
      actor: "operator",
      summary: "Approval package reached a complete state.",
      metadata: {
        completenessScore: nextCompleteness.completenessScore,
      },
    });
  }

  auditEvents.push(buildRecommendationEvent(nextSignal, tuning.settings));
  await appendAuditEventsSafe(auditEvents);

  return NextResponse.json<SaveFinalReviewResponse>({
    success: true,
    persisted: result.persisted,
    source: result.source,
    signal: nextSignal,
    message:
      result.source === "airtable"
        ? "Final review decisions saved to Airtable."
        : "Final review decisions saved in mock mode for the current session flow only.",
  });
}
