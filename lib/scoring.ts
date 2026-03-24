import { buildDuplicateKeyFromSignal, canonicalizeSourceUrl } from "@/lib/ingestion/normalize";
import { flattenSignalEnvelope, toSignalEnvelope } from "@/lib/signal-envelope";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import {
  ABSTRACT_COMMENTARY_PATTERNS,
  BRAND_FIT_KEYWORDS,
  clampScore,
  COMMUNICATION_SIGNAL_KEYWORDS,
  countKeywordMatches,
  GENERIC_TITLE_PATTERNS,
  LOW_CONTEXT_SOURCE_TYPES,
  normalizeTitleFingerprint,
  RELEVANCE_KEYWORDS,
  SCORING_VERSION,
  SYSTEM_NOTE_SOURCE_TYPES,
  tokenOverlapScore,
  TRUSTED_PUBLISHER_KEYWORDS,
  URGENCY_KEYWORDS,
} from "@/lib/scoring-rules";
import { getSourceProfile } from "@/lib/source-profiles";
import {
  getScoringDecisionConfig,
  getSourceStrictnessConfig,
  type OperatorTuningSettings,
} from "@/lib/tuning";
import { assessTransformability } from "@/lib/transformability";
import type { SignalEnvelope, SignalRecord, SignalScoringResult } from "@/types/signal";

function buildSignalText(signal: SignalRecord): string {
  return [
    signal.sourceTitle,
    signal.manualSummary,
    signal.rawExcerpt,
    signal.sourcePublisher,
    signal.interpretationNotes,
    signal.teacherPainPoint,
    signal.riskToTeacher,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreRelevance(signal: SignalRecord, text: string, tuning?: OperatorTuningSettings): number {
  const profile = getSourceProfile(signal);
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const transformability = assessTransformability(signal, tuning);
  const communicationHits = countKeywordMatches(text, COMMUNICATION_SIGNAL_KEYWORDS);
  let score = 10;
  score += countKeywordMatches(text, RELEVANCE_KEYWORDS) * 8;

  if (signal.sourceType && SYSTEM_NOTE_SOURCE_TYPES.includes(signal.sourceType as (typeof SYSTEM_NOTE_SOURCE_TYPES)[number])) {
    score += 10;
  }

  if (signal.signalCategory === "Risk" || signal.signalCategory === "Stress" || signal.signalCategory === "Conflict") {
    score += 12;
  }

  if (profile.teacherProximity >= 80 && communicationHits >= 1) {
    score += 8;
  } else if (profile.teacherProximity >= 65 && communicationHits >= 1) {
    score += 4;
  }

  if (profile.id === "feed-policy-news" || profile.id === "formal-report") {
    if (scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable") {
      score += 8;
    } else if (communicationHits === 0) {
      score -= 10;
    }
  }

  if (transformability.materiallyImprovedByScenario) {
    score += 12;
  } else if (transformability.score >= 55 && transformability.isIndirectSource) {
    score += 6;
  }

  if (profile.sourceKind === "reddit" && communicationHits === 0) {
    score -= 6;
  }

  return clampScore(score);
}

function scoreBrandFit(signal: SignalRecord, text: string, tuning?: OperatorTuningSettings): number {
  const profile = getSourceProfile(signal);
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const transformability = assessTransformability(signal, tuning);
  const communicationHits = countKeywordMatches(text, COMMUNICATION_SIGNAL_KEYWORDS);
  let score = 10;
  score += countKeywordMatches(text, BRAND_FIT_KEYWORDS) * 9;

  if (signal.riskToTeacher || signal.teacherPainPoint) {
    score += 12;
  }

  if (signal.platformPriority || signal.hookTemplateUsed) {
    score += 6;
  }

  if (text.includes("edtech") && !text.includes("teacher") && !text.includes("workload")) {
    score -= 20;
  }

  if (profile.communicationProximity >= 75 && communicationHits >= 2) {
    score += 10;
  } else if (profile.communicationProximity >= 55 && communicationHits >= 1) {
    score += 5;
  }

  if ((profile.id === "feed-policy-news" || profile.id === "formal-report") && communicationHits === 0) {
    score -= scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable" ? 2 : 12;
  }

  if (ABSTRACT_COMMENTARY_PATTERNS.some((pattern) => text.includes(pattern))) {
    score -= 10;
  }

  if (transformability.materiallyImprovedByScenario) {
    score += 12;
  } else if (transformability.score >= 55 && transformability.isIndirectSource) {
    score += 5;
  } else if (transformability.isIndirectSource && transformability.score < 35) {
    score -= 6;
  }

  return clampScore(score);
}

function scoreUrgency(signal: SignalRecord, text: string): number {
  let score = 15;
  score += countKeywordMatches(text, URGENCY_KEYWORDS) * 10;

  const sourceDate = signal.sourceDate ? new Date(signal.sourceDate) : null;
  if (sourceDate && !Number.isNaN(sourceDate.getTime())) {
    const ageInDays = (Date.now() - sourceDate.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays <= 2) {
      score += 18;
    } else if (ageInDays <= 7) {
      score += 10;
    } else if (ageInDays > 30) {
      score -= 10;
    }
  }

  if (signal.signalCategory === "Risk") {
    score += 12;
  }

  return clampScore(score);
}

function scoreSourceTrust(signal: SignalRecord, text: string, tuning?: OperatorTuningSettings): number {
  const profile = getSourceProfile(signal);
  const sourceStrictness = getSourceStrictnessConfig(tuning);
  const publisher = signal.sourcePublisher?.toLowerCase() ?? "";
  const canonicalUrl = canonicalizeSourceUrl(signal.sourceUrl);
  let score = profile.trustBaseline;

  if (canonicalUrl) {
    try {
      const hostname = new URL(canonicalUrl).hostname.toLowerCase();
      if (hostname.endsWith(".gov.uk") || hostname.endsWith(".gov") || hostname.endsWith(".edu")) {
        score += 35;
      } else if (hostname.includes("news.google.com")) {
        score += 20;
      }
    } catch {
      // ignore URL parse issues after canonicalization fallback
    }
  }

  if (TRUSTED_PUBLISHER_KEYWORDS.some((keyword) => publisher.includes(keyword))) {
    score += 25;
  }

  if (signal.sourceType && LOW_CONTEXT_SOURCE_TYPES.includes(signal.sourceType as (typeof LOW_CONTEXT_SOURCE_TYPES)[number])) {
    score -= sourceStrictness.lowContextPenalty;
  }

  if (signal.sourceType && SYSTEM_NOTE_SOURCE_TYPES.includes(signal.sourceType as (typeof SYSTEM_NOTE_SOURCE_TYPES)[number])) {
    score += 10;
  }

  if (profile.sourceKind === "reddit" && countKeywordMatches(text, COMMUNICATION_SIGNAL_KEYWORDS) === 0) {
    score -= sourceStrictness.redditWithoutCommunicationPenalty;
  }

  if (!signal.sourcePublisher && !signal.sourceUrl) {
    score -= sourceStrictness.missingContextPenalty;
  }

  if (text.includes("anonymous")) {
    score -= sourceStrictness.anonymousPenalty;
  }

  return clampScore(score);
}

function getSimilarityToExistingContent(signal: SignalRecord, existingSignals: SignalRecord[]): number | null {
  const signalUrl = canonicalizeSourceUrl(signal.sourceUrl);
  const signalFingerprint = normalizeTitleFingerprint(signal.sourceTitle);
  let maxSimilarity = 0;

  for (const existing of existingSignals) {
    if (existing.recordId === signal.recordId) {
      continue;
    }

    const existingUrl = canonicalizeSourceUrl(existing.sourceUrl);
    if (signalUrl && existingUrl && signalUrl === existingUrl) {
      return 100;
    }

    const existingFingerprint = normalizeTitleFingerprint(existing.sourceTitle);
    if (!signalFingerprint || !existingFingerprint) {
      continue;
    }

    const titleSimilarity = tokenOverlapScore(signalFingerprint, existingFingerprint);
    if (titleSimilarity > maxSimilarity) {
      maxSimilarity = titleSimilarity;
    }
  }

  return maxSimilarity > 0 ? clampScore(maxSimilarity) : null;
}

function scoreNovelty(
  signal: SignalRecord,
  similarityToExistingContent: number | null,
  tuning?: OperatorTuningSettings,
): number {
  const profile = getSourceProfile(signal);
  const transformability = assessTransformability(signal, tuning);
  let score = 60;
  const titleFingerprint = normalizeTitleFingerprint(signal.sourceTitle);

  if (GENERIC_TITLE_PATTERNS.some((pattern) => titleFingerprint.includes(pattern))) {
    score -= 30;
  }

  const uniqueWordCount = new Set(titleFingerprint.split(" ").filter(Boolean)).size;
  if (uniqueWordCount >= 8) {
    score += 10;
  } else if (uniqueWordCount <= 4) {
    score -= 10;
  }

  if (signal.manualSummary && signal.manualSummary.length > 100) {
    score += 8;
  }

  if (profile.sourceKind === "reddit" || profile.sourceKind === "forum") {
    if (signal.rawExcerpt && signal.rawExcerpt.length > 140) {
      score += 6;
    }
  }

  if (profile.id === "feed-policy-news" && signal.scenarioAngle === null && signal.manualSummary && signal.manualSummary.length < 120) {
    score -= 6;
  }

  if (transformability.materiallyImprovedByScenario) {
    score += 6;
  }

  if (similarityToExistingContent !== null) {
    score -= Math.round(similarityToExistingContent * 0.55);
  }

  return clampScore(score);
}

function decideRecommendation(scores: {
  relevance: number;
  novelty: number;
  urgency: number;
  brandFit: number;
  trust: number;
  similarityToExistingContent: number | null;
}, tuning?: OperatorTuningSettings): Pick<
  SignalScoringResult,
  "keepRejectRecommendation" | "qualityGateResult" | "reviewPriority" | "needsHumanReview"
> {
  const decisionConfig = getScoringDecisionConfig(tuning);
  const weighted =
    scores.relevance * 0.3 +
    scores.brandFit * 0.25 +
    scores.trust * 0.15 +
    scores.novelty * 0.15 +
    scores.urgency * 0.15;

  const highlySimilar = (scores.similarityToExistingContent ?? 0) >= decisionConfig.highSimilarityFloor;
  const weakFit =
    scores.relevance < decisionConfig.weakFitFloor || scores.brandFit < decisionConfig.weakFitFloor;
  const weakTrust = scores.trust < decisionConfig.weakTrustFloor;

  if (highlySimilar || weakFit || weakTrust || weighted < decisionConfig.rejectWeightedFloor) {
    return {
      keepRejectRecommendation: "Reject",
      qualityGateResult: "Fail",
      reviewPriority: weighted < 28 ? "Low" : "Medium",
      needsHumanReview: false,
    };
  }

  if (
    weighted >= decisionConfig.keepWeightedFloor &&
    scores.relevance >= decisionConfig.keepFieldFloor &&
    scores.brandFit >= decisionConfig.keepFieldFloor &&
    scores.trust >= decisionConfig.keepTrustFloor &&
    (scores.similarityToExistingContent ?? 0) < decisionConfig.keepSimilarityCeiling
  ) {
    return {
      keepRejectRecommendation: "Keep",
      qualityGateResult: "Pass",
      reviewPriority: scores.urgency >= 80 ? "Urgent" : scores.urgency >= 60 ? "High" : "Medium",
      needsHumanReview: true,
    };
  }

  return {
    keepRejectRecommendation: "Review",
    qualityGateResult: "Needs Review",
    reviewPriority: scores.urgency >= 70 || scores.relevance >= 70 ? "High" : "Medium",
    needsHumanReview: true,
  };
}

function buildSelectedReason(
  signal: SignalRecord,
  result: SignalScoringResult,
  tuning?: OperatorTuningSettings,
): string | null {
  if (result.keepRejectRecommendation === "Reject") {
    return null;
  }

  const reasons: string[] = [];
  const profile = getSourceProfile(signal);
  const text = buildSignalText(signal);
  const transformability = assessTransformability(signal, tuning);
  const communicationHits = countKeywordMatches(text, COMMUNICATION_SIGNAL_KEYWORDS);
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });

  if ((profile.sourceKind === "reddit" || profile.sourceKind === "forum") && communicationHits >= 1) {
    reasons.push("it came from a teacher discussion source with direct communication tension");
  }

  if ((profile.id === "feed-policy-news" || profile.id === "formal-report") && (scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable")) {
    reasons.push("policy-style source context was made more usable by a stronger teacher-response frame");
  }

  if (transformability.materiallyImprovedByScenario) {
    reasons.push("a strong scenario angle materially improved its transformability into a teacher communication problem");
  }

  if (result.signalRelevanceScore >= 65) {
    reasons.push("strong teacher and school relevance");
  }
  if (result.brandFitScore >= 65) {
    reasons.push("clear fit with Zaza's teacher-protection and communication focus");
  }
  if (result.signalUrgencyScore >= 70) {
    reasons.push("time-sensitive enough to justify attention");
  }
  if (result.sourceTrustScore >= 70) {
    reasons.push("source context looks credible enough for review");
  }

  if (reasons.length === 0) {
    reasons.push("plausible signal worth operator review");
  }

  return `Selected because it shows ${reasons.slice(0, 2).join(" and ")}.`;
}

function buildRejectedReason(
  signal: SignalRecord,
  result: SignalScoringResult,
  tuning?: OperatorTuningSettings,
): string | null {
  if (result.keepRejectRecommendation !== "Reject") {
    return null;
  }

  const reasons: string[] = [];
  const profile = getSourceProfile(signal);
  const text = buildSignalText(signal);
  const transformability = assessTransformability(signal, tuning);
  const communicationHits = countKeywordMatches(text, COMMUNICATION_SIGNAL_KEYWORDS);
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });

  if ((profile.sourceKind === "reddit" || profile.sourceKind === "forum") && communicationHits === 0) {
    reasons.push("it is a public discussion source without enough direct teacher communication detail");
  }

  if ((profile.id === "feed-policy-news" || profile.id === "formal-report") && scenarioAssessment.quality !== "strong" && scenarioAssessment.quality !== "usable" && communicationHits === 0) {
    reasons.push("it is policy or sector coverage without a strong teacher-response framing");
  }

  if (transformability.isIndirectSource && transformability.score < 40) {
    reasons.push("transformability stayed low because the current scenario framing did not convert the source into a practical communication situation");
  }

  if (ABSTRACT_COMMENTARY_PATTERNS.some((pattern) => text.includes(pattern))) {
    reasons.push("it reads more like abstract sector commentary than a live teacher situation");
  }

  if ((result.similarityToExistingContent ?? 0) >= 92) {
    reasons.push("it looks too close to existing content already in the queue");
  }
  if (result.signalRelevanceScore < 35) {
    reasons.push("the signal is weakly connected to core teacher-risk and workload themes");
  }
  if (result.brandFitScore < 35) {
    reasons.push("it does not fit Zaza's positioning strongly enough");
  }
  if (result.sourceTrustScore < 30) {
    reasons.push("the source context is too thin to trust");
  }
  if (result.signalNoveltyScore < 30) {
    reasons.push("the framing is too generic to justify operator attention");
  }

  if (reasons.length === 0) {
    reasons.push("it is currently too weak to move forward");
  }

  return `Rejected because ${reasons.slice(0, 2).join(" and ")}.`;
}

type SignalScoringSource = SignalRecord | SignalEnvelope;

export function buildInitialScoringFromSignal(signal: SignalScoringSource): SignalScoringResult | null {
  const envelope = toSignalEnvelope(signal);

  if (
    envelope.score.signalRelevanceScore === null ||
    envelope.score.signalNoveltyScore === null ||
    envelope.score.signalUrgencyScore === null ||
    envelope.score.brandFitScore === null ||
    envelope.score.sourceTrustScore === null ||
    envelope.score.keepRejectRecommendation === null ||
    envelope.score.qualityGateResult === null ||
    envelope.score.reviewPriority === null ||
    envelope.score.needsHumanReview === null
  ) {
    return null;
  }

  return {
    signalRelevanceScore: envelope.score.signalRelevanceScore,
    signalNoveltyScore: envelope.score.signalNoveltyScore,
    signalUrgencyScore: envelope.score.signalUrgencyScore,
    brandFitScore: envelope.score.brandFitScore,
    sourceTrustScore: envelope.score.sourceTrustScore,
    keepRejectRecommendation: envelope.score.keepRejectRecommendation,
    whySelected: envelope.score.whySelected,
    whyRejected: envelope.score.whyRejected,
    needsHumanReview: envelope.score.needsHumanReview,
    qualityGateResult: envelope.score.qualityGateResult,
    reviewPriority: envelope.score.reviewPriority,
    similarityToExistingContent: envelope.score.similarityToExistingContent,
    duplicateClusterId: envelope.score.duplicateClusterId,
    scoringVersion: SCORING_VERSION,
    scoredAt: envelope.meta.createdDate,
  };
}

export function scoreSignal(
  signal: SignalScoringSource,
  existingSignals: SignalScoringSource[],
  tuning?: OperatorTuningSettings,
): SignalScoringResult {
  const legacySignal = flattenSignalEnvelope(signal);
  const legacySignals = existingSignals.map(flattenSignalEnvelope);
  const text = buildSignalText(legacySignal);
  const similarityToExistingContent = getSimilarityToExistingContent(legacySignal, legacySignals);
  const relevance = scoreRelevance(legacySignal, text, tuning);
  const brandFit = scoreBrandFit(legacySignal, text, tuning);
  const urgency = scoreUrgency(legacySignal, text);
  const trust = scoreSourceTrust(legacySignal, text, tuning);
  const novelty = scoreNovelty(legacySignal, similarityToExistingContent, tuning);
  const decision = decideRecommendation({
    relevance,
    novelty,
    urgency,
    brandFit,
    trust,
    similarityToExistingContent,
  }, tuning);

  const scoredAt = new Date().toISOString();
  const provisional: SignalScoringResult = {
    signalRelevanceScore: relevance,
    signalNoveltyScore: novelty,
    signalUrgencyScore: urgency,
    brandFitScore: brandFit,
    sourceTrustScore: trust,
    keepRejectRecommendation: decision.keepRejectRecommendation,
    whySelected: null,
    whyRejected: null,
    needsHumanReview: decision.needsHumanReview,
    qualityGateResult: decision.qualityGateResult,
    reviewPriority: decision.reviewPriority,
    similarityToExistingContent,
    duplicateClusterId:
      (similarityToExistingContent ?? 0) >= 95 ? buildDuplicateKeyFromSignal(legacySignal).replace(/^url:|^title-date:/, "dup-") : null,
    scoringVersion: SCORING_VERSION,
    scoredAt,
  };

  return {
    ...provisional,
    whySelected: buildSelectedReason(legacySignal, provisional, tuning),
    whyRejected: buildRejectedReason(legacySignal, provisional, tuning),
  };
}
