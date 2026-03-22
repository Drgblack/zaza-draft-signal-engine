import type { ApprovalQueueCandidate } from "./approval-ranking";
import {
  assignSignalContentContext,
  getSignalContentContextSummary,
  type CampaignStrategy,
} from "./campaigns";
import type { BridgeFallbackCandidateInput } from "./zaza-connect-bridge";

const GENERIC_SUPPORT_REASONS = new Set([
  "playbook support exists",
  "pattern support exists",
  "bundle context exists",
]);

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function firstSentence(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return normalized.split(/(?<=[.!?])\s+/)[0]?.trim() ?? normalized;
}

function isGenericSupportReason(value: string | null | undefined) {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized ? GENERIC_SUPPORT_REASONS.has(normalized) : false;
}

function isLowValueReason(value: string | null | undefined) {
  const normalized = normalizeText(value)?.toLowerCase() ?? "";
  return normalized.startsWith("low expected value:");
}

function buildTeacherLanguage(candidate: ApprovalQueueCandidate) {
  const rows: string[] = [];

  uniquePush(rows, firstSentence(candidate.signal.rawExcerpt));
  uniquePush(rows, firstSentence(candidate.signal.manualSummary));
  uniquePush(rows, firstSentence(candidate.signal.teacherPainPoint));
  uniquePush(rows, firstSentence(candidate.signal.sourceTitle));

  return rows.slice(0, 3);
}

function buildCommercialPotential(candidate: ApprovalQueueCandidate) {
  if (
    candidate.expectedOutcome.expectedOutcomeTier === "high" ||
    candidate.revenueAmplifierMatch?.revenueStrength === "high"
  ) {
    return "high" as const;
  }

  if (
    candidate.expectedOutcome.expectedOutcomeTier === "medium" ||
    candidate.revenueAmplifierMatch?.revenueStrength === "medium"
  ) {
    return "medium" as const;
  }

  return "low" as const;
}

function buildTrustRisk(candidate: ApprovalQueueCandidate) {
  if (candidate.commercialRisk.highestSeverity === "high") {
    return "high" as const;
  }

  if (candidate.commercialRisk.highestSeverity === "medium") {
    return "medium" as const;
  }

  return candidate.assessment.decision === "approval_ready" ||
    candidate.assessment.decision === "advance"
    ? ("low" as const)
    : ("medium" as const);
}

function buildRecommendedFormat(candidate: ApprovalQueueCandidate) {
  if (
    candidate.distributionPriority.distributionStrategy === "multi" &&
    candidate.signal.suggestedFormatPriority === "Multi-format"
  ) {
    return "multi_asset" as const;
  }

  if (candidate.signal.suggestedFormatPriority === "Carousel") {
    return "carousel" as const;
  }

  if (candidate.signal.suggestedFormatPriority === "Video") {
    return "short_video" as const;
  }

  return "text" as const;
}

function buildRecommendedHookDirection(candidate: ApprovalQueueCandidate) {
  const hook = normalizeText(candidate.signal.hookTemplateUsed)?.replace(/\.$/, "");
  const posture = candidate.conversionIntent.posture.replaceAll("_", " ");
  const platform = candidate.distributionPriority.primaryPlatformLabel;

  if (hook) {
    return `Lead with "${hook}" and keep the opening ${posture} for ${platform}.`;
  }

  const opening = firstSentence(
    candidate.signal.scenarioAngle ??
      candidate.signal.contentAngle ??
      candidate.signal.teacherPainPoint,
  );

  return opening
    ? `Open with "${opening}" and keep the posture ${posture} for ${platform}.`
    : `Open with the clearest teacher tension and keep the posture ${posture} for ${platform}.`;
}

function buildReason(candidate: ApprovalQueueCandidate) {
  const nonLowExpectedReason = candidate.expectedOutcome.expectedOutcomeReasons.find(
    (reason) => !isLowValueReason(reason),
  );
  const preferredRankReason = candidate.rankReasons.find(
    (reason) => !isGenericSupportReason(reason),
  );

  return (
    normalizeText(candidate.signal.contentAngle) ??
    normalizeText(candidate.signal.scenarioAngle) ??
    normalizeText(nonLowExpectedReason) ??
    normalizeText(candidate.hypothesis.whyItMayWork) ??
    normalizeText(candidate.hypothesis.objective) ??
    normalizeText(candidate.triage.reason) ??
    normalizeText(preferredRankReason) ??
    normalizeText(candidate.signal.manualSummary) ??
    candidate.signal.sourceTitle
  );
}

function buildWhyNow(candidate: ApprovalQueueCandidate) {
  const reasons: string[] = [];
  const nonLowExpectedReason = candidate.expectedOutcome.expectedOutcomeReasons.find(
    (reason) => !isLowValueReason(reason),
  );

  uniquePush(reasons, candidate.triage.reason);
  uniquePush(reasons, nonLowExpectedReason);
  uniquePush(reasons, candidate.revenueAmplifierMatch?.reason);
  uniquePush(reasons, candidate.distributionPriority.reason);
  uniquePush(reasons, candidate.expectedOutcome.positiveSignals[0]);

  return (
    reasons[0] ??
    "Current review ranking surfaced this as a timely founder-reviewed opportunity."
  );
}

function buildProofPoints(candidate: ApprovalQueueCandidate) {
  const proofPoints: string[] = [];

  uniquePush(proofPoints, firstSentence(candidate.signal.teacherPainPoint));
  uniquePush(proofPoints, firstSentence(candidate.signal.contentAngle));
  uniquePush(proofPoints, firstSentence(candidate.signal.scenarioAngle));
  uniquePush(proofPoints, candidate.expectedOutcome.positiveSignals[0]);
  uniquePush(proofPoints, candidate.expectedOutcome.positiveSignals[1]);
  uniquePush(proofPoints, candidate.hypothesis.keyLevers[0]);
  uniquePush(proofPoints, candidate.hypothesis.keyLevers[1]);
  uniquePush(proofPoints, candidate.distributionPriority.supportingSignals[0]);
  uniquePush(proofPoints, candidate.revenueAmplifierMatch?.supportingSignals[0]);

  return proofPoints.slice(0, 5);
}

function buildTrustNotes(candidate: ApprovalQueueCandidate) {
  const notes: string[] = [];

  uniquePush(notes, candidate.commercialRisk.summary);
  uniquePush(notes, candidate.commercialRisk.topRisk?.reason);
  uniquePush(notes, candidate.commercialRisk.topRisk?.suggestedFix);
  uniquePush(notes, candidate.assessment.strongestCaution);
  uniquePush(notes, candidate.commercialRisk.supportingSignals[0]);

  return notes.slice(0, 4);
}

function resolveCandidateContext(
  candidate: ApprovalQueueCandidate,
  strategy: CampaignStrategy,
) {
  const assignment = assignSignalContentContext(candidate.signal, strategy);

  return getSignalContentContextSummary(
    {
      campaignId: assignment.context.campaignId ?? candidate.signal.campaignId ?? null,
      pillarId: assignment.context.pillarId ?? candidate.signal.pillarId ?? null,
      audienceSegmentId:
        assignment.context.audienceSegmentId ?? candidate.signal.audienceSegmentId ?? null,
      funnelStage: assignment.context.funnelStage ?? candidate.signal.funnelStage ?? null,
      ctaGoal: assignment.context.ctaGoal ?? candidate.signal.ctaGoal ?? null,
    },
    strategy,
  );
}

function getFallbackAssessmentPriority(
  decision: ApprovalQueueCandidate["assessment"]["decision"],
) {
  switch (decision) {
    case "approval_ready":
      return 4;
    case "advance":
      return 3;
    case "hold":
      return 2;
    case "skip":
    default:
      return 0;
  }
}

function getFallbackOutcomePriority(expectedOutcomeTier: "high" | "medium" | "low") {
  switch (expectedOutcomeTier) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function getFallbackRiskPriority(decision: ApprovalQueueCandidate["commercialRisk"]["decision"]) {
  switch (decision) {
    case "allow":
      return 3;
    case "suggest_fix":
      return 2;
    case "block":
    default:
      return 0;
  }
}

function getFallbackCompletenessPriority(
  completenessState: ApprovalQueueCandidate["completeness"]["completenessState"],
) {
  switch (completenessState) {
    case "complete":
      return 2;
    case "mostly_complete":
      return 1;
    case "incomplete":
    default:
      return 0;
  }
}

function getFallbackTriagePriority(
  triageState: ApprovalQueueCandidate["triage"]["triageState"],
) {
  switch (triageState) {
    case "approve_ready":
      return 3;
    case "repairable":
      return 2;
    case "needs_judgement":
      return 1;
    case "stale_but_reusable":
    default:
      return 0;
  }
}

function getFallbackQualityBonus(candidate: BridgeFallbackCandidateInput) {
  let score = 0;

  if (candidate.teacherLanguage?.length) {
    score += 2;
  }
  if (candidate.audienceSegment) {
    score += 1;
  }
  if (candidate.funnelStage) {
    score += 1;
  }
  if ((candidate.recommendedPlatforms?.length ?? 0) > 1) {
    score += 1;
  }
  if ((candidate.proofPoints?.length ?? 0) >= 3) {
    score += 1;
  }

  return score;
}

export function buildBridgeFallbackCandidateFromApprovalCandidate(input: {
  candidate: ApprovalQueueCandidate;
  strategy: CampaignStrategy;
}): BridgeFallbackCandidateInput {
  const { candidate, strategy } = input;
  const context = resolveCandidateContext(candidate, strategy);
  const teacherLanguage = buildTeacherLanguage(candidate);
  const recommendedPlatforms = [
    candidate.distributionPriority.primaryPlatform,
    ...candidate.distributionPriority.secondaryPlatforms,
  ].slice(
    0,
    candidate.distributionPriority.distributionStrategy === "single" ? 1 : 3,
  );
  const primaryPainPoint =
    normalizeText(candidate.signal.teacherPainPoint) ??
    firstSentence(candidate.signal.manualSummary) ??
    firstSentence(candidate.signal.rawExcerpt) ??
    candidate.signal.sourceTitle;
  const reason = buildReason(candidate);

  return {
    candidateId: `review-candidate:${candidate.signal.recordId}`,
    signalId: candidate.signal.recordId,
    sourceTitle: candidate.signal.sourceTitle,
    platform: candidate.distributionPriority.primaryPlatformLabel,
    expectedOutcomeTier: candidate.expectedOutcome.expectedOutcomeTier,
    reason,
    href: `/signals/${candidate.signal.recordId}/review`,
    primaryPainPoint,
    teacherLanguage,
    audienceSegment: context.audienceSegmentName ?? context.audienceSegmentId,
    funnelStage: context.funnelStage,
    commercialPotential: buildCommercialPotential(candidate),
    trustRisk: buildTrustRisk(candidate),
    recommendedAngle:
      normalizeText(candidate.signal.contentAngle) ??
      normalizeText(candidate.signal.scenarioAngle) ??
      normalizeText(candidate.hypothesis.objective) ??
      primaryPainPoint,
    recommendedHookDirection: buildRecommendedHookDirection(candidate),
    recommendedFormat: buildRecommendedFormat(candidate),
    recommendedPlatforms,
    whyNow: buildWhyNow(candidate),
    proofPoints: buildProofPoints(candidate),
    trustNotes: buildTrustNotes(candidate),
    sourceSignalIds: [candidate.signal.recordId],
  };
}

export function buildFallbackBridgeCandidates(input: {
  candidates: ApprovalQueueCandidate[];
  strategy: CampaignStrategy;
  limit?: number;
}): BridgeFallbackCandidateInput[] {
  const limit = Math.max(1, input.limit ?? 5);

  return input.candidates
    .filter((candidate) => candidate.triage.triageState !== "suppress")
    .map((candidate, index) => {
      const bridgeCandidate = buildBridgeFallbackCandidateFromApprovalCandidate({
        candidate,
        strategy: input.strategy,
      });

      return {
        bridgeCandidate,
        index,
        exportPriority:
          getFallbackAssessmentPriority(candidate.assessment.decision) * 100 +
          getFallbackOutcomePriority(candidate.expectedOutcome.expectedOutcomeTier) * 10 +
          getFallbackRiskPriority(candidate.commercialRisk.decision) * 10 +
          getFallbackCompletenessPriority(candidate.completeness.completenessState) * 5 +
          getFallbackTriagePriority(candidate.triage.triageState) +
          getFallbackQualityBonus(bridgeCandidate),
      };
    })
    .sort(
      (left, right) =>
        right.exportPriority - left.exportPriority ||
        left.index - right.index,
    )
    .slice(0, limit)
    .map((entry) => entry.bridgeCandidate);
}
