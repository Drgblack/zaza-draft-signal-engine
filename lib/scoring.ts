import { buildDuplicateKeyFromSignal, canonicalizeSourceUrl } from "@/lib/ingestion/normalize";
import {
  BRAND_FIT_KEYWORDS,
  clampScore,
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
import type { SignalRecord, SignalScoringResult } from "@/types/signal";

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

function scoreRelevance(signal: SignalRecord, text: string): number {
  let score = 10;
  score += countKeywordMatches(text, RELEVANCE_KEYWORDS) * 8;

  if (signal.sourceType && SYSTEM_NOTE_SOURCE_TYPES.includes(signal.sourceType as (typeof SYSTEM_NOTE_SOURCE_TYPES)[number])) {
    score += 10;
  }

  if (signal.signalCategory === "Risk" || signal.signalCategory === "Stress" || signal.signalCategory === "Conflict") {
    score += 12;
  }

  return clampScore(score);
}

function scoreBrandFit(signal: SignalRecord, text: string): number {
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

function scoreSourceTrust(signal: SignalRecord, text: string): number {
  const publisher = signal.sourcePublisher?.toLowerCase() ?? "";
  const canonicalUrl = canonicalizeSourceUrl(signal.sourceUrl);
  let score = 45;

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
    score -= 18;
  }

  if (signal.sourceType && SYSTEM_NOTE_SOURCE_TYPES.includes(signal.sourceType as (typeof SYSTEM_NOTE_SOURCE_TYPES)[number])) {
    score += 10;
  }

  if (!signal.sourcePublisher && !signal.sourceUrl) {
    score -= 15;
  }

  if (text.includes("anonymous")) {
    score -= 8;
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

function scoreNovelty(signal: SignalRecord, similarityToExistingContent: number | null): number {
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
}): Pick<
  SignalScoringResult,
  "keepRejectRecommendation" | "qualityGateResult" | "reviewPriority" | "needsHumanReview"
> {
  const weighted =
    scores.relevance * 0.3 +
    scores.brandFit * 0.25 +
    scores.trust * 0.15 +
    scores.novelty * 0.15 +
    scores.urgency * 0.15;

  const highlySimilar = (scores.similarityToExistingContent ?? 0) >= 92;
  const weakFit = scores.relevance < 35 || scores.brandFit < 35;
  const weakTrust = scores.trust < 30;

  if (highlySimilar || weakFit || weakTrust || weighted < 38) {
    return {
      keepRejectRecommendation: "Reject",
      qualityGateResult: "Fail",
      reviewPriority: weighted < 28 ? "Low" : "Medium",
      needsHumanReview: false,
    };
  }

  if (
    weighted >= 68 &&
    scores.relevance >= 60 &&
    scores.brandFit >= 60 &&
    scores.trust >= 45 &&
    (scores.similarityToExistingContent ?? 0) < 85
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

function buildSelectedReason(signal: SignalRecord, result: SignalScoringResult): string | null {
  if (result.keepRejectRecommendation === "Reject") {
    return null;
  }

  const reasons: string[] = [];

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

function buildRejectedReason(signal: SignalRecord, result: SignalScoringResult): string | null {
  if (result.keepRejectRecommendation !== "Reject") {
    return null;
  }

  const reasons: string[] = [];

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

export function buildInitialScoringFromSignal(signal: SignalRecord): SignalScoringResult | null {
  if (
    signal.signalRelevanceScore === null ||
    signal.signalNoveltyScore === null ||
    signal.signalUrgencyScore === null ||
    signal.brandFitScore === null ||
    signal.sourceTrustScore === null ||
    signal.keepRejectRecommendation === null ||
    signal.qualityGateResult === null ||
    signal.reviewPriority === null ||
    signal.needsHumanReview === null
  ) {
    return null;
  }

  return {
    signalRelevanceScore: signal.signalRelevanceScore,
    signalNoveltyScore: signal.signalNoveltyScore,
    signalUrgencyScore: signal.signalUrgencyScore,
    brandFitScore: signal.brandFitScore,
    sourceTrustScore: signal.sourceTrustScore,
    keepRejectRecommendation: signal.keepRejectRecommendation,
    whySelected: signal.whySelected,
    whyRejected: signal.whyRejected,
    needsHumanReview: signal.needsHumanReview,
    qualityGateResult: signal.qualityGateResult,
    reviewPriority: signal.reviewPriority,
    similarityToExistingContent: signal.similarityToExistingContent,
    duplicateClusterId: signal.duplicateClusterId,
    scoringVersion: SCORING_VERSION,
    scoredAt: signal.createdDate,
  };
}

export function scoreSignal(signal: SignalRecord, existingSignals: SignalRecord[]): SignalScoringResult {
  const text = buildSignalText(signal);
  const similarityToExistingContent = getSimilarityToExistingContent(signal, existingSignals);
  const relevance = scoreRelevance(signal, text);
  const brandFit = scoreBrandFit(signal, text);
  const urgency = scoreUrgency(signal, text);
  const trust = scoreSourceTrust(signal, text);
  const novelty = scoreNovelty(signal, similarityToExistingContent);
  const decision = decideRecommendation({
    relevance,
    novelty,
    urgency,
    brandFit,
    trust,
    similarityToExistingContent,
  });

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
      (similarityToExistingContent ?? 0) >= 95 ? buildDuplicateKeyFromSignal(signal).replace(/^url:|^title-date:/, "dup-") : null,
    scoringVersion: SCORING_VERSION,
    scoredAt,
  };

  return {
    ...provisional,
    whySelected: buildSelectedReason(signal, provisional),
    whyRejected: buildRejectedReason(signal, provisional),
  };
}
