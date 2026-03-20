import type { AutoAdvanceAssessment } from "@/lib/auto-advance";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import type { ApprovalPackageCompleteness } from "@/lib/completeness";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { ManualExperiment } from "@/lib/experiments";
import { listExperimentsForSignal } from "@/lib/experiments";
import type { FatigueAssessment } from "@/lib/fatigue";
import type { UnifiedGuidance } from "@/lib/guidance";
import type { CandidateHypothesis } from "@/lib/hypotheses";
import type { PostingOutcome } from "@/lib/outcomes";
import { getPrimaryLinkVariant, getPublishPrepPackageForPlatform, buildSignalPublishPrepBundle } from "@/lib/publish-prep";
import type { PostingLogEntry, PostingPlatform } from "@/lib/posting-memory";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import { buildRevisionGuidance } from "@/lib/revision-guidance";
import { getSourceProfile } from "@/lib/source-profiles";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import { resolveSiteLinkReference, isSiteLinkAlignedToCtaGoal } from "@/lib/site-links";
import type { SignalRecord } from "@/types/signal";

export type ExpectedOutcomeTier = "high" | "medium" | "low";

export interface ExpectedOutcomeFactor {
  key: string;
  label: string;
}

export interface ExpectedOutcomeAssessment {
  expectedOutcomeTier: ExpectedOutcomeTier;
  expectedOutcomeScore: number;
  expectedOutcomeReasons: string[];
  positiveSignals: string[];
  riskSignals: string[];
  positiveFactors: ExpectedOutcomeFactor[];
  riskFactors: ExpectedOutcomeFactor[];
  platformLabel: string;
  modeLabel: string | null;
  destinationLabel: string | null;
}

export interface ExpectedOutcomeInsights {
  highCount: number;
  mediumCount: number;
  lowCount: number;
  topPositiveFactors: Array<{ label: string; count: number }>;
  topRiskFactors: Array<{ label: string; count: number }>;
  platformRows: Array<{ label: string; count: number }>;
  modeRows: Array<{ label: string; count: number }>;
  destinationRows: Array<{ label: string; count: number }>;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function pushFactor(
  factors: ExpectedOutcomeFactor[],
  key: string,
  label: string,
) {
  if (factors.find((factor) => factor.key === key)) {
    return;
  }

  factors.push({ key, label });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPrimaryPlatform(signal: SignalRecord): PostingPlatform {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }

  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "x";
}

function getOutcomeScore(postingOutcome: PostingOutcome | undefined, strategicOutcome: StrategicOutcome | undefined): number {
  let score = 0;

  if (postingOutcome?.outcomeQuality === "strong") {
    score += 2;
  } else if (postingOutcome?.outcomeQuality === "acceptable") {
    score += 1;
  } else if (postingOutcome?.outcomeQuality === "weak") {
    score -= 1;
  }

  if (postingOutcome?.reuseRecommendation === "reuse_this_approach") {
    score += 1;
  } else if (postingOutcome?.reuseRecommendation === "do_not_repeat") {
    score -= 1;
  }

  if (strategicOutcome?.strategicValue === "high") {
    score += 3;
  } else if (strategicOutcome?.strategicValue === "medium") {
    score += 1;
  } else if (strategicOutcome?.strategicValue === "low") {
    score -= 2;
  }

  if ((strategicOutcome?.leadsOrSignups ?? 0) + (strategicOutcome?.trialsOrConversions ?? 0) > 0) {
    score += 1;
  } else if ((strategicOutcome?.clicks ?? 0) >= 10) {
    score += 1;
  }

  return score;
}

function buildContextHistory(input: {
  signal: SignalRecord;
  primaryPlatform: PostingPlatform;
  destinationId: string | null;
  allSignals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
}) {
  const signalById = new Map(input.allSignals.map((signal) => [signal.recordId, signal]));
  const postingOutcomesById = new Map(input.postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicOutcomesById = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const currentSourceProfile = getSourceProfile(input.signal);
  let sampleCount = 0;
  let weightedScore = 0;
  let weightTotal = 0;
  let highValueCount = 0;
  let lowValueCount = 0;
  let leadTotal = 0;

  for (const entry of input.postingEntries) {
    if (entry.signalId === input.signal.recordId) {
      continue;
    }

    const relatedSignal = signalById.get(entry.signalId);
    if (!relatedSignal) {
      continue;
    }

    let matchWeight = 0;
    if (entry.platform === input.primaryPlatform) {
      matchWeight += 2;
    }
    if (input.signal.editorialMode && relatedSignal.editorialMode === input.signal.editorialMode) {
      matchWeight += 2;
    }
    if (input.signal.funnelStage && relatedSignal.funnelStage === input.signal.funnelStage) {
      matchWeight += 1;
    }
    if (input.signal.ctaGoal && relatedSignal.ctaGoal === input.signal.ctaGoal) {
      matchWeight += 1;
    }
    if (getSourceProfile(relatedSignal).id === currentSourceProfile.id) {
      matchWeight += 1;
    }
    if (input.destinationId) {
      const entryDestination = resolveSiteLinkReference({
        siteLinkId: entry.selectedSiteLinkId,
        destinationUrl: entry.destinationUrl,
        destinationLabel: entry.destinationLabel,
      });
      if (entryDestination.siteLink?.id === input.destinationId) {
        matchWeight += 2;
      }
    }

    if (matchWeight < 3) {
      continue;
    }

    const postingOutcome = postingOutcomesById.get(entry.id);
    const strategicOutcome = strategicOutcomesById.get(entry.id);
    const outcomeScore = getOutcomeScore(postingOutcome, strategicOutcome);
    sampleCount += 1;
    weightedScore += outcomeScore * matchWeight;
    weightTotal += matchWeight;
    if (strategicOutcome?.strategicValue === "high") {
      highValueCount += 1;
    } else if (strategicOutcome?.strategicValue === "low") {
      lowValueCount += 1;
    }
    leadTotal += (strategicOutcome?.leadsOrSignups ?? 0) + (strategicOutcome?.trialsOrConversions ?? 0);
  }

  return {
    sampleCount,
    averageScore: weightTotal > 0 ? weightedScore / weightTotal : 0,
    highValueCount,
    lowValueCount,
    leadTotal,
  };
}

function buildDestinationHistory(input: {
  signal: SignalRecord;
  primaryPlatform: PostingPlatform;
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
}) {
  const bundle = buildSignalPublishPrepBundle(input.signal);
  const primaryPackage = getPublishPrepPackageForPlatform(bundle, input.primaryPlatform);
  const primaryLink = primaryPackage ? getPrimaryLinkVariant(primaryPackage) : null;
  const destination = resolveSiteLinkReference({
    siteLinkId: primaryLink?.siteLinkId,
    destinationUrl: primaryLink?.url,
    destinationLabel: primaryLink?.label,
  });

  if (!destination.siteLink && !destination.url) {
    return {
      destination,
      usageCount: 0,
      highValueCount: 0,
      lowValueCount: 0,
      clickTotal: 0,
      leadTotal: 0,
      alignedCount: 0,
      misalignedCount: 0,
    };
  }

  const strategicByPostingId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  let usageCount = 0;
  let highValueCount = 0;
  let lowValueCount = 0;
  let clickTotal = 0;
  let leadTotal = 0;
  let alignedCount = 0;
  let misalignedCount = 0;

  for (const entry of input.postingEntries) {
    const entryDestination = resolveSiteLinkReference({
      siteLinkId: entry.selectedSiteLinkId,
      destinationUrl: entry.destinationUrl,
      destinationLabel: entry.destinationLabel,
    });
    const destinationMatch =
      destination.siteLink?.id
        ? entryDestination.siteLink?.id === destination.siteLink.id
        : destination.url
          ? entryDestination.url === destination.url
          : false;
    if (!destinationMatch) {
      continue;
    }

    usageCount += 1;
    const strategicOutcome = strategicByPostingId.get(entry.id);
    if (strategicOutcome?.strategicValue === "high") {
      highValueCount += 1;
    } else if (strategicOutcome?.strategicValue === "low") {
      lowValueCount += 1;
    }
    clickTotal += strategicOutcome?.clicks ?? 0;
    leadTotal += (strategicOutcome?.leadsOrSignups ?? 0) + (strategicOutcome?.trialsOrConversions ?? 0);
    const aligned = isSiteLinkAlignedToCtaGoal(destination.siteLink, input.signal.ctaGoal);
    if (aligned === true) {
      alignedCount += 1;
    } else if (aligned === false) {
      misalignedCount += 1;
    }
  }

  return {
    destination,
    usageCount,
    highValueCount,
    lowValueCount,
    clickTotal,
    leadTotal,
    alignedCount,
    misalignedCount,
  };
}

export function assessExpectedOutcome(input: {
  signal: SignalRecord;
  guidance: UnifiedGuidance;
  assessment: AutoAdvanceAssessment;
  completeness: ApprovalPackageCompleteness;
  fatigue: FatigueAssessment;
  hypothesis: CandidateHypothesis;
  allSignals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  experiments?: ManualExperiment[];
  strategy?: CampaignStrategy;
  cadence?: CampaignCadenceSummary;
}): ExpectedOutcomeAssessment {
  const primaryPlatform = getPrimaryPlatform(input.signal);
  const platformLabel = getPostingPlatformLabel(primaryPlatform);
  const modeLabel = input.signal.editorialMode ? getEditorialModeDefinition(input.signal.editorialMode).label : null;
  const positiveSignals: string[] = [];
  const riskSignals: string[] = [];
  const positiveFactors: ExpectedOutcomeFactor[] = [];
  const riskFactors: ExpectedOutcomeFactor[] = [];
  let score = 0;

  const destinationHistory = buildDestinationHistory({
    signal: input.signal,
    primaryPlatform,
    postingEntries: input.postingEntries,
    strategicOutcomes: input.strategicOutcomes,
  });
  const destinationId = destinationHistory.destination.siteLink?.id ?? null;
  const contextHistory = buildContextHistory({
    signal: input.signal,
    primaryPlatform,
    destinationId,
    allSignals: input.allSignals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    strategicOutcomes: input.strategicOutcomes,
  });
  const revisionGuidance = buildRevisionGuidance({
    signal: input.signal,
    allSignals: input.allSignals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    strategicOutcomes: input.strategicOutcomes,
  }).insightsByPlatform[primaryPlatform];
  const relatedExperiments = input.experiments
    ? listExperimentsForSignal(input.experiments, input.signal.recordId, input.postingEntries)
    : [];
  const activeExperiment = relatedExperiments.find((experiment) => experiment.status === "active") ?? null;
  const sourceProfile = getSourceProfile(input.signal);
  const strategicContext =
    input.strategy ? getSignalContentContextSummary(input.signal, input.strategy) : null;

  if (input.completeness.completenessState === "complete") {
    score += 2;
    uniquePush(positiveSignals, "Complete approval package");
    pushFactor(positiveFactors, "completeness:complete", "Complete package");
  } else if (input.completeness.completenessState === "mostly_complete") {
    score += 1;
    uniquePush(positiveSignals, "Mostly complete package");
    pushFactor(positiveFactors, "completeness:mostly_complete", "Mostly complete package");
  } else {
    score -= 2;
    uniquePush(riskSignals, `Incomplete package: ${input.completeness.missingElements[0] ?? "missing essentials"}`);
    pushFactor(riskFactors, "completeness:incomplete", "Incomplete package");
  }

  if (input.guidance.confidence.confidenceLevel === "high") {
    score += 2;
    uniquePush(positiveSignals, "High confidence support");
    pushFactor(positiveFactors, "confidence:high", "High confidence");
  } else if (input.guidance.confidence.confidenceLevel === "moderate") {
    score += 1;
    uniquePush(positiveSignals, "Moderate confidence support");
    pushFactor(positiveFactors, "confidence:moderate", "Moderate confidence");
  } else {
    score -= 2;
    uniquePush(riskSignals, "Low confidence guidance");
    pushFactor(riskFactors, "confidence:low", "Low confidence");
  }

  if (input.hypothesis.keyLevers.length >= 3 && !input.hypothesis.riskNote) {
    score += 2;
    uniquePush(positiveSignals, "Strong hypothesis quality");
    pushFactor(positiveFactors, "hypothesis:strong", "Strong hypothesis");
  } else if (input.hypothesis.keyLevers.length >= 2) {
    score += 1;
    uniquePush(positiveSignals, "Usable hypothesis support");
    pushFactor(positiveFactors, "hypothesis:usable", "Usable hypothesis");
  }

  if (input.hypothesis.riskNote) {
    score -= 1;
    uniquePush(riskSignals, input.hypothesis.riskNote);
    pushFactor(riskFactors, "hypothesis:risk", "Hypothesis risk");
  }

  if (contextHistory.sampleCount >= 2 && (contextHistory.averageScore >= 1.2 || contextHistory.leadTotal > 0)) {
    score += 2;
    uniquePush(positiveSignals, `Strong ${platformLabel} outcome history for similar items`);
    pushFactor(positiveFactors, `history:${primaryPlatform}`, `${platformLabel} outcome history`);
  } else if (contextHistory.sampleCount >= 1 && contextHistory.averageScore > 0.4) {
    score += 1;
    uniquePush(positiveSignals, `Some positive ${platformLabel} outcome history`);
    pushFactor(positiveFactors, `history:${primaryPlatform}:some`, `${platformLabel} outcome history`);
  } else if (
    contextHistory.sampleCount >= 2 &&
    (contextHistory.averageScore <= -0.75 || contextHistory.lowValueCount > contextHistory.highValueCount)
  ) {
    score -= 2;
    uniquePush(riskSignals, `Weak ${platformLabel} outcome history for similar items`);
    pushFactor(riskFactors, `history:${primaryPlatform}:weak`, `Weak ${platformLabel} history`);
  }

  if (destinationHistory.usageCount > 0 && (destinationHistory.highValueCount >= 2 || destinationHistory.leadTotal > 0)) {
    score += 2;
    uniquePush(
      positiveSignals,
      `${destinationHistory.destination.label} has strong destination history`,
    );
    pushFactor(
      positiveFactors,
      `destination:${destinationHistory.destination.key}:strong`,
      `${destinationHistory.destination.label} performs well`,
    );
  } else if (
    destinationHistory.usageCount >= 2 &&
    destinationHistory.lowValueCount > destinationHistory.highValueCount
  ) {
    score -= 2;
    uniquePush(riskSignals, `${destinationHistory.destination.label} has weak destination history`);
    pushFactor(
      riskFactors,
      `destination:${destinationHistory.destination.key}:weak`,
      `${destinationHistory.destination.label} underperforms`,
    );
  }

  if (destinationHistory.misalignedCount > destinationHistory.alignedCount && destinationHistory.misalignedCount > 0) {
    score -= 1;
    uniquePush(riskSignals, "Destination link is often misaligned to CTA intent");
    pushFactor(riskFactors, "destination:misaligned_cta", "CTA-link misalignment");
  }

  if (revisionGuidance.positive && revisionGuidance.evidenceCount >= 1) {
    score += 1;
    uniquePush(positiveSignals, revisionGuidance.positive);
    pushFactor(positiveFactors, `revision:${primaryPlatform}:positive`, `${platformLabel} revision support`);
  }

  if (revisionGuidance.caution && revisionGuidance.evidenceCount >= 1) {
    score -= 1;
    uniquePush(riskSignals, revisionGuidance.caution);
    pushFactor(riskFactors, `revision:${primaryPlatform}:caution`, `${platformLabel} revision caution`);
  }

  if ((input.signal.sourceTrustScore ?? sourceProfile.trustBaseline) >= 70) {
    score += 1;
    uniquePush(positiveSignals, `${sourceProfile.contextLabel} source quality is strong`);
    pushFactor(positiveFactors, `source:${sourceProfile.id}:strong`, "Strong source quality");
  } else if ((input.signal.sourceTrustScore ?? sourceProfile.trustBaseline) <= 45) {
    score -= 1;
    uniquePush(riskSignals, `${sourceProfile.contextLabel} source quality is weaker`);
    pushFactor(riskFactors, `source:${sourceProfile.id}:weak`, "Weak source quality");
  }

  if (input.guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "positive")) {
    score += 1;
    uniquePush(positiveSignals, "Positive reuse memory");
    pushFactor(positiveFactors, "reuse:positive", "Positive reuse memory");
  }

  if (input.guidance.reuseMemory?.highlights.find((highlight) => highlight.tone === "caution")) {
    score -= 1;
    uniquePush(riskSignals, "Cautionary reuse memory");
    pushFactor(riskFactors, "reuse:caution", "Cautionary reuse memory");
  }

  if (input.guidance.relatedPatterns[0] || input.guidance.relatedBundles[0] || input.guidance.relatedPlaybookCards[0]) {
    score += 1;
    uniquePush(positiveSignals, "Pattern or playbook support exists");
    pushFactor(positiveFactors, "support:pattern_playbook", "Pattern / playbook support");
  }

  if (strategicContext?.campaignName && input.cadence) {
    const campaignRow = input.cadence.byCampaign.find((row) => row.id === strategicContext.campaignId);
    if (campaignRow?.status === "active") {
      score += 1;
      uniquePush(positiveSignals, "Supports an active campaign");
      pushFactor(positiveFactors, "campaign:active", "Active campaign support");
    }
  }

  if (strategicContext?.funnelStage === "Consideration" || strategicContext?.funnelStage === "Conversion") {
    score += 1;
    uniquePush(positiveSignals, `${strategicContext.funnelStage} funnel fit is commercially stronger`);
    pushFactor(positiveFactors, `funnel:${strategicContext.funnelStage}`, `${strategicContext.funnelStage} funnel fit`);
  }

  if (activeExperiment) {
    score += 1;
    uniquePush(positiveSignals, `Active experiment context: ${activeExperiment.name}`);
    pushFactor(positiveFactors, "experiment:active", "Active experiment context");
  }

  if (input.fatigue.scorePenalty > 0) {
    score -= input.fatigue.scorePenalty;
    uniquePush(riskSignals, input.fatigue.summary);
    pushFactor(riskFactors, "fatigue", "Fatigue penalty");
  }

  if ((input.signal.similarityToExistingContent ?? 0) >= 80) {
    score -= 1;
    uniquePush(riskSignals, "High similarity to existing content");
    pushFactor(riskFactors, "similarity:high", "High similarity");
  }

  const normalizedScore = clamp(score, -5, 7);
  const expectedOutcomeTier: ExpectedOutcomeTier =
    normalizedScore >= 5 ? "high" : normalizedScore >= 1 ? "medium" : "low";
  const expectedOutcomeReasons =
    expectedOutcomeTier === "high"
      ? [
          `High expected value: ${positiveSignals.slice(0, 3).join(", ")}`,
          riskSignals[0] ? `Watch: ${riskSignals[0]}` : null,
        ]
      : expectedOutcomeTier === "medium"
        ? [
            `Medium expected value: ${positiveSignals[0] ?? "some support exists"}`,
            riskSignals[0] ? `Constraint: ${riskSignals[0]}` : null,
          ]
        : [
            `Low expected value: ${riskSignals.slice(0, 2).join(", ") || "support is still thin"}`,
            positiveSignals[0] ? `Offsetting support: ${positiveSignals[0]}` : null,
          ];

  return {
    expectedOutcomeTier,
    expectedOutcomeScore: normalizedScore,
    expectedOutcomeReasons: expectedOutcomeReasons.filter((reason): reason is string => Boolean(reason)),
    positiveSignals: positiveSignals.slice(0, 4),
    riskSignals: riskSignals.slice(0, 4),
    positiveFactors: positiveFactors.slice(0, 5),
    riskFactors: riskFactors.slice(0, 5),
    platformLabel,
    modeLabel,
    destinationLabel: destinationHistory.destination.label,
  };
}

export function buildExpectedOutcomeInsights(
  candidates: Array<{
    signal: SignalRecord;
    expectedOutcome: ExpectedOutcomeAssessment;
  }>,
): ExpectedOutcomeInsights {
  const topPositiveFactors = new Map<string, { label: string; count: number }>();
  const topRiskFactors = new Map<string, { label: string; count: number }>();
  const highPlatformCounts = new Map<string, number>();
  const highModeCounts = new Map<string, number>();
  const highDestinationCounts = new Map<string, number>();

  for (const candidate of candidates) {
    for (const factor of candidate.expectedOutcome.positiveFactors) {
      const current = topPositiveFactors.get(factor.key) ?? { label: factor.label, count: 0 };
      current.count += 1;
      topPositiveFactors.set(factor.key, current);
    }

    for (const factor of candidate.expectedOutcome.riskFactors) {
      const current = topRiskFactors.get(factor.key) ?? { label: factor.label, count: 0 };
      current.count += 1;
      topRiskFactors.set(factor.key, current);
    }

    if (candidate.expectedOutcome.expectedOutcomeTier !== "high") {
      continue;
    }

    highPlatformCounts.set(
      candidate.expectedOutcome.platformLabel,
      (highPlatformCounts.get(candidate.expectedOutcome.platformLabel) ?? 0) + 1,
    );
    if (candidate.expectedOutcome.modeLabel) {
      highModeCounts.set(
        candidate.expectedOutcome.modeLabel,
        (highModeCounts.get(candidate.expectedOutcome.modeLabel) ?? 0) + 1,
      );
    }
    if (candidate.expectedOutcome.destinationLabel) {
      highDestinationCounts.set(
        candidate.expectedOutcome.destinationLabel,
        (highDestinationCounts.get(candidate.expectedOutcome.destinationLabel) ?? 0) + 1,
      );
    }
  }

  const sortFactorRows = (map: Map<string, { label: string; count: number }>) =>
    Array.from(map.values())
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4);

  const sortCountRows = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4);

  return {
    highCount: candidates.filter((candidate) => candidate.expectedOutcome.expectedOutcomeTier === "high").length,
    mediumCount: candidates.filter((candidate) => candidate.expectedOutcome.expectedOutcomeTier === "medium").length,
    lowCount: candidates.filter((candidate) => candidate.expectedOutcome.expectedOutcomeTier === "low").length,
    topPositiveFactors: sortFactorRows(topPositiveFactors),
    topRiskFactors: sortFactorRows(topRiskFactors),
    platformRows: sortCountRows(highPlatformCounts),
    modeRows: sortCountRows(highModeCounts),
    destinationRows: sortCountRows(highDestinationCounts),
  };
}
