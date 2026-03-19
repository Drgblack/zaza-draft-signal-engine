import { evaluateDraftQuality, evaluateGenerationReadiness, type DraftQualityEvaluation } from "@/lib/generation-quality";
import type { UnifiedGuidance } from "@/lib/guidance";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import { assessTransformability } from "@/lib/transformability";
import { hasGeneration, hasInterpretation, hasScoring, isFilteredOutSignal } from "@/lib/workflow";
import type { SignalGenerationInput, SignalGenerationResult, SignalRecord } from "@/types/signal";

export type AutoAdvanceStage = "auto_interpret" | "auto_generate" | "auto_prepare_for_review";
export type AutoAdvanceDecision = "advance" | "hold" | "approval_ready" | "skip";
export type ApprovalAssetType = "image" | "carousel" | "short_video" | "text_first";

export interface ApprovalAssetSuggestion {
  type: ApprovalAssetType;
  label: string;
  summary: string;
}

export interface AutoAdvanceAssessment {
  stage: AutoAdvanceStage | null;
  decision: AutoAdvanceDecision;
  summary: string;
  reasons: string[];
  strongestCaution: string | null;
  draftQuality: DraftQualityEvaluation | null;
  assetSuggestion: ApprovalAssetSuggestion | null;
  suggestedPlatformPriority: string | null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function getGenerationInputFromSignal(signal: SignalRecord): SignalGenerationInput | null {
  if (
    !signal.signalCategory ||
    !signal.severityScore ||
    !signal.signalSubtype ||
    !signal.emotionalPattern ||
    !signal.teacherPainPoint ||
    !signal.relevanceToZazaDraft ||
    !signal.riskToTeacher ||
    !signal.interpretationNotes ||
    !signal.hookTemplateUsed ||
    !signal.contentAngle ||
    !signal.platformPriority ||
    !signal.suggestedFormatPriority
  ) {
    return null;
  }

  return {
    recordId: signal.recordId,
    sourceTitle: signal.sourceTitle,
    sourceType: signal.sourceType,
    sourcePublisher: signal.sourcePublisher,
    sourceDate: signal.sourceDate,
    sourceUrl: signal.sourceUrl,
    rawExcerpt: signal.rawExcerpt,
    manualSummary: signal.manualSummary,
    scenarioAngle: signal.scenarioAngle,
    signalCategory: signal.signalCategory,
    severityScore: signal.severityScore,
    signalSubtype: signal.signalSubtype,
    emotionalPattern: signal.emotionalPattern,
    teacherPainPoint: signal.teacherPainPoint,
    relevanceToZazaDraft: signal.relevanceToZazaDraft,
    riskToTeacher: signal.riskToTeacher,
    interpretationNotes: signal.interpretationNotes,
    hookTemplateUsed: signal.hookTemplateUsed as SignalGenerationInput["hookTemplateUsed"],
    contentAngle: signal.contentAngle,
    platformPriority: signal.platformPriority,
    suggestedFormatPriority: signal.suggestedFormatPriority,
  };
}

function getGenerationOutputFromSignal(signal: SignalRecord): SignalGenerationResult | null {
  if (
    !signal.xDraft ||
    !signal.linkedInDraft ||
    !signal.redditDraft ||
    !signal.imagePrompt ||
    !signal.videoScript ||
    !signal.ctaOrClosingLine ||
    !signal.hashtagsOrKeywords ||
    !signal.generationModelVersion ||
    !signal.promptVersion
  ) {
    return null;
  }

  return {
    xDraft: signal.xDraft,
    linkedInDraft: signal.linkedInDraft,
    redditDraft: signal.redditDraft,
    imagePrompt: signal.imagePrompt,
    videoScript: signal.videoScript,
    ctaOrClosingLine: signal.ctaOrClosingLine,
    hashtagsOrKeywords: signal.hashtagsOrKeywords,
    generationSource: "mock",
    generationModelVersion: signal.generationModelVersion,
    promptVersion: signal.promptVersion,
    generatedAt: signal.createdDate,
  };
}

function buildAssetSuggestion(signal: SignalRecord): ApprovalAssetSuggestion {
  const framing = signal.scenarioAngle ?? signal.contentAngle ?? signal.manualSummary ?? signal.sourceTitle;

  switch (signal.suggestedFormatPriority) {
    case "Video":
      return {
        type: "short_video",
        label: "Short video concept",
        summary: `Lead with the tension in "${framing}" and turn it into a calm talking-head or subtitle-led explanation.`,
      };
    case "Image":
      return {
        type: "image",
        label: "Image concept",
        summary: `Use a clean visual that anchors the post around "${framing}" without adding extra claims.`,
      };
    case "Carousel":
      return {
        type: "carousel",
        label: "Carousel concept",
        summary: `Break "${framing}" into a short sequence: tension, practical reframing, then one usable takeaway.`,
      };
    case "Multi-format":
      return {
        type: "carousel",
        label: "Multi-format visual angle",
        summary: `Start with the strongest text draft, then adapt "${framing}" into either a carousel opener or a short video hook.`,
      };
    case "Text":
    default:
      return {
        type: "text_first",
        label: "Text-first asset angle",
        summary: `This is strongest as copy-led content. If a visual is needed, support "${framing}" with a minimal branded still.`,
      };
  }
}

function buildApprovalReasons(signal: SignalRecord, guidance: UnifiedGuidance, draftQuality: DraftQualityEvaluation): string[] {
  const reasons: string[] = [];

  if (guidance.confidence.confidenceReasons[0]) {
    uniquePush(reasons, guidance.confidence.confidenceReasons[0]);
  }

  if (guidance.relatedPlaybookCards[0]) {
    uniquePush(reasons, `Relevant playbook support: ${guidance.relatedPlaybookCards[0].title}`);
  }

  if (guidance.relatedPatterns[0]) {
    uniquePush(reasons, `Pattern support surfaced: ${guidance.relatedPatterns[0].title}`);
  }

  if (guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "positive")) {
    uniquePush(reasons, "Similar judged outcomes have worked before");
  }

  if (draftQuality.label === "Strong") {
    uniquePush(reasons, "Draft quality checks look strong enough for review");
  } else {
    uniquePush(reasons, "Draft quality checks look workable enough for bounded review");
  }

  if (signal.reviewPriority === "High" || signal.reviewPriority === "Urgent") {
    uniquePush(reasons, `${signal.reviewPriority} review priority`);
  }

  return reasons.slice(0, 3);
}

function buildHoldReasons(signal: SignalRecord, guidance: UnifiedGuidance, draftQuality?: DraftQualityEvaluation | null): string[] {
  const reasons: string[] = [];
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const transformability = assessTransformability(signal);

  if (guidance.confidence.confidenceLevel === "low") {
    uniquePush(reasons, "Low confidence");
  }

  if (scenarioAssessment.quality === "missing" || scenarioAssessment.quality === "weak") {
    uniquePush(reasons, "Weak framing");
  }

  if (guidance.confidence.uncertaintyFlags.some((flag) => flag.code === "no_playbook_support")) {
    uniquePush(reasons, "No playbook support");
  }

  if (
    guidance.confidence.uncertaintyFlags.some((flag) => flag.code === "weak_pattern_match") &&
    guidance.relatedPatterns.length === 0
  ) {
    uniquePush(reasons, "No reliable pattern support");
  }

  if (guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "caution")) {
    uniquePush(reasons, "Cautionary reuse memory");
  }

  if (transformability.isIndirectSource && transformability.label !== "High transformability") {
    uniquePush(reasons, "Indirect source still needs judgement");
  }

  if (draftQuality?.label === "Weak") {
    uniquePush(reasons, "Drafts still look weak or generic");
  }

  return reasons.slice(0, 3);
}

export function assessAutoInterpret(signal: SignalRecord, guidance: UnifiedGuidance): AutoAdvanceAssessment {
  if (hasInterpretation(signal)) {
    return {
      stage: "auto_interpret",
      decision: "skip",
      summary: "Interpretation already exists.",
      reasons: [],
      strongestCaution: null,
      draftQuality: null,
      assetSuggestion: null,
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  const holdReasons: string[] = [];

  if (!hasScoring(signal)) {
    uniquePush(holdReasons, "Scoring missing");
  }

  if (signal.keepRejectRecommendation !== "Keep" || signal.qualityGateResult !== "Pass") {
    uniquePush(
      holdReasons,
      signal.keepRejectRecommendation === "Review" || signal.qualityGateResult === "Needs Review"
        ? "Held by scoring gate"
        : "Rejected by scoring gate",
    );
  }

  if (guidance.confidence.confidenceLevel === "low") {
    uniquePush(holdReasons, "Low confidence");
  }

  if (guidance.readinessState === "blocked") {
    uniquePush(holdReasons, guidance.primaryAction.toLowerCase());
  }

  if (guidance.cautionNotes[0] && guidance.relatedPatterns.length === 0 && guidance.relatedPlaybookCards.length === 0) {
    uniquePush(holdReasons, guidance.cautionNotes[0]);
  }

  if (holdReasons.length > 0) {
    return {
      stage: "auto_interpret",
      decision: "hold",
      summary: `Held before interpretation: ${holdReasons.join(" and ").toLowerCase()}.`,
      reasons: holdReasons,
      strongestCaution: holdReasons[0] ?? null,
      draftQuality: null,
      assetSuggestion: null,
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  return {
    stage: "auto_interpret",
    decision: "advance",
    summary: "Auto-interpretable because scoring passed and support looks strong enough.",
    reasons: [
      guidance.confidence.confidenceReasons[0] ?? "Scoring passed cleanly",
      signal.reviewPriority ? `${signal.reviewPriority} priority` : "Priority not set",
    ].filter(Boolean),
    strongestCaution: guidance.cautionNotes[0] ?? null,
    draftQuality: null,
    assetSuggestion: null,
    suggestedPlatformPriority: signal.platformPriority,
  };
}

export function assessAutoGenerate(signal: SignalRecord, guidance: UnifiedGuidance): AutoAdvanceAssessment {
  if (hasGeneration(signal)) {
    return {
      stage: "auto_generate",
      decision: "skip",
      summary: "Drafts already exist.",
      reasons: [],
      strongestCaution: null,
      draftQuality: null,
      assetSuggestion: null,
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  if (!hasInterpretation(signal)) {
    return {
      stage: "auto_generate",
      decision: "hold",
      summary: "Held before generation because interpretation is still missing.",
      reasons: ["Interpretation missing"],
      strongestCaution: "Interpretation missing",
      draftQuality: null,
      assetSuggestion: null,
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  const generationReadiness = evaluateGenerationReadiness(signal);
  const holdReasons = buildHoldReasons(signal, guidance);

  if (generationReadiness.status === "blocked") {
    uniquePush(holdReasons, generationReadiness.label);
  }

  if (generationReadiness.status === "caution" && guidance.confidence.confidenceLevel !== "high") {
    uniquePush(holdReasons, generationReadiness.label);
  }

  if (holdReasons.length > 0) {
    return {
      stage: "auto_generate",
      decision: "hold",
      summary: `Held before generation: ${holdReasons.join(" and ").toLowerCase()}.`,
      reasons: holdReasons,
      strongestCaution: holdReasons[0] ?? null,
      draftQuality: null,
      assetSuggestion: null,
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  return {
    stage: "auto_generate",
    decision: "advance",
    summary: "Auto-generated because interpretation, framing, and current support look workable.",
    reasons: [
      guidance.confidence.confidenceReasons[0] ?? "Interpretation already exists",
      generationReadiness.message,
    ].filter(Boolean),
    strongestCaution: guidance.cautionNotes[0] ?? null,
    draftQuality: null,
    assetSuggestion: null,
    suggestedPlatformPriority: signal.platformPriority,
  };
}

export function assessApprovalReadiness(signal: SignalRecord, guidance: UnifiedGuidance): AutoAdvanceAssessment {
  if (isFilteredOutSignal(signal) || signal.status === "Approved" || signal.status === "Scheduled" || signal.status === "Posted" || signal.status === "Archived") {
    return {
      stage: null,
      decision: "skip",
      summary: "This record is outside the approval-ready automation path.",
      reasons: [],
      strongestCaution: null,
      draftQuality: null,
      assetSuggestion: null,
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  if (!hasGeneration(signal)) {
    return {
      stage: "auto_prepare_for_review",
      decision: "hold",
      summary: "Held before approval-ready because full draft outputs are still missing.",
      reasons: ["Drafts missing"],
      strongestCaution: "Drafts missing",
      draftQuality: null,
      assetSuggestion: null,
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  const generationInput = getGenerationInputFromSignal(signal);
  const generationOutput = getGenerationOutputFromSignal(signal);
  const draftQuality =
    generationInput && generationOutput ? evaluateDraftQuality(generationInput, generationOutput) : null;
  const holdReasons = buildHoldReasons(signal, guidance, draftQuality);

  if (!generationInput || !generationOutput) {
    uniquePush(holdReasons, "Draft package is incomplete");
  }

  if (draftQuality?.label === "Weak") {
    uniquePush(holdReasons, "Draft quality is weak");
  }

  if (guidance.gapWarnings[0] && guidance.relatedPlaybookCards.length === 0 && guidance.reuseMemory?.highlights.length === 0) {
    uniquePush(holdReasons, "Support coverage is still thin");
  }

  if (signal.finalReviewStartedAt) {
    return {
      stage: "auto_prepare_for_review",
      decision: "approval_ready",
      summary: "Already in final review with drafts prepared.",
      reasons: buildApprovalReasons(signal, guidance, draftQuality ?? { label: "Needs Review", checks: [] }),
      strongestCaution: guidance.cautionNotes[0] ?? null,
      draftQuality,
      assetSuggestion: buildAssetSuggestion(signal),
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  if (holdReasons.length > 0) {
    return {
      stage: "auto_prepare_for_review",
      decision: "hold",
      summary: `Held from approval-ready queue: ${holdReasons.join(" and ").toLowerCase()}.`,
      reasons: holdReasons,
      strongestCaution: holdReasons[0] ?? null,
      draftQuality,
      assetSuggestion: buildAssetSuggestion(signal),
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  return {
    stage: "auto_prepare_for_review",
    decision: "approval_ready",
    summary: "Auto-promoted to the approval-ready queue because the drafts look near-finished and support is strong enough.",
    reasons: buildApprovalReasons(signal, guidance, draftQuality ?? { label: "Needs Review", checks: [] }),
    strongestCaution: guidance.cautionNotes[0] ?? null,
    draftQuality,
    assetSuggestion: buildAssetSuggestion(signal),
    suggestedPlatformPriority: signal.platformPriority,
  };
}

export function assessAutonomousSignal(signal: SignalRecord, guidance: UnifiedGuidance): AutoAdvanceAssessment {
  if (isFilteredOutSignal(signal) || signal.status === "Rejected" || signal.status === "Archived" || signal.status === "Posted") {
    return {
      stage: null,
      decision: "skip",
      summary: "This record is not an active autonomous candidate.",
      reasons: [],
      strongestCaution: null,
      draftQuality: null,
      assetSuggestion: null,
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  if (!hasScoring(signal)) {
    return {
      stage: "auto_interpret",
      decision: "hold",
      summary: "Held before interpretation because scoring is still missing.",
      reasons: ["Scoring missing"],
      strongestCaution: "Scoring missing",
      draftQuality: null,
      assetSuggestion: null,
      suggestedPlatformPriority: signal.platformPriority,
    };
  }

  if (!hasInterpretation(signal)) {
    return assessAutoInterpret(signal, guidance);
  }

  if (!hasGeneration(signal)) {
    return assessAutoGenerate(signal, guidance);
  }

  return assessApprovalReadiness(signal, guidance);
}
