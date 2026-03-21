import type { AudienceMemoryState } from "@/lib/audience-memory";
import type { ApprovalPackageCompleteness } from "@/lib/completeness";
import type { ConflictAssessment } from "@/lib/conflicts";
import type { ConversionIntentAssessment } from "@/lib/conversion-intent";
import type { FatigueAssessment } from "@/lib/fatigue";
import { getAudienceMemorySegment } from "@/lib/audience-memory";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getPublishPrepPackageForPlatform,
  getSelectedCtaText,
} from "@/lib/publish-prep";
import type { PostingOutcome } from "@/lib/outcomes";
import type { PostingLogEntry } from "@/lib/posting-memory";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { SignalRecord } from "@/types/signal";

export const COMMERCIAL_RISK_TYPES = [
  "over_aggressive_cta",
  "weak_claim",
  "repetitive_pattern",
  "brand_tone_drift",
  "audience_mismatch",
  "low_evidence_assertion",
  "fatigue_risk",
] as const;

export const COMMERCIAL_RISK_SEVERITIES = ["low", "medium", "high"] as const;
export const COMMERCIAL_RISK_DECISIONS = ["allow", "suggest_fix", "block"] as const;

export type CommercialRiskType = (typeof COMMERCIAL_RISK_TYPES)[number];
export type CommercialRiskSeverity = (typeof COMMERCIAL_RISK_SEVERITIES)[number];
export type CommercialRiskDecision = (typeof COMMERCIAL_RISK_DECISIONS)[number];

export interface CommercialRisk {
  riskType: CommercialRiskType;
  severity: CommercialRiskSeverity;
  reason: string;
  suggestedFix: string;
}

export interface CommercialRiskAssessment {
  risks: CommercialRisk[];
  highestSeverity: CommercialRiskSeverity | null;
  decision: CommercialRiskDecision;
  summary: string;
  topRisk: CommercialRisk | null;
  supportingSignals: string[];
}

export interface CommercialRiskInsights {
  riskyCount: number;
  blockedCount: number;
  suggestFixCount: number;
  topRiskTypes: Array<{ label: string; count: number }>;
  severityRows: Array<{ label: string; count: number }>;
  topSuggestedFixes: Array<{ label: string; count: number }>;
  trendSummary: string[];
}

function normalizeText(value: string | null | undefined) {
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

function addRisk(target: CommercialRisk[], next: CommercialRisk | null) {
  if (!next) {
    return;
  }

  if (
    target.some(
      (risk) =>
        risk.riskType === next.riskType &&
        risk.severity === next.severity &&
        risk.reason === next.reason,
    )
  ) {
    return;
  }

  target.push(next);
}

function getPrimaryPlatform(signal: SignalRecord): "x" | "linkedin" | "reddit" {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }

  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "x";
}

function getPrimaryDraft(signal: SignalRecord) {
  const platform = getPrimaryPlatform(signal);
  if (platform === "linkedin") {
    return normalizeText(signal.finalLinkedInDraft) ?? normalizeText(signal.linkedInDraft);
  }
  if (platform === "reddit") {
    return normalizeText(signal.finalRedditDraft) ?? normalizeText(signal.redditDraft);
  }
  return normalizeText(signal.finalXDraft) ?? normalizeText(signal.xDraft);
}

function getSeverityRank(severity: CommercialRiskSeverity) {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function getHighestSeverity(
  risks: CommercialRisk[],
): CommercialRiskSeverity | null {
  const top = [...risks].sort(
    (left, right) => getSeverityRank(right.severity) - getSeverityRank(left.severity),
  )[0];
  return top?.severity ?? null;
}

function buildDecision(highestSeverity: CommercialRiskSeverity | null): CommercialRiskDecision {
  if (highestSeverity === "high") {
    return "block";
  }
  if (highestSeverity === "medium") {
    return "suggest_fix";
  }
  return "allow";
}

function countMatches(text: string, expression: RegExp) {
  return [...text.matchAll(expression)].length;
}

function labelRiskType(riskType: CommercialRiskType) {
  switch (riskType) {
    case "over_aggressive_cta":
      return "Over-aggressive CTA";
    case "weak_claim":
      return "Weak claim";
    case "repetitive_pattern":
      return "Repetitive pattern";
    case "brand_tone_drift":
      return "Brand tone drift";
    case "audience_mismatch":
      return "Audience mismatch";
    case "low_evidence_assertion":
      return "Low-evidence assertion";
    case "fatigue_risk":
    default:
      return "Fatigue risk";
  }
}

function buildTopRiskSummary(risk: CommercialRisk | null) {
  if (!risk) {
    return "No commercial risk guardrail is active.";
  }

  if (risk.severity === "high") {
    return `${labelRiskType(risk.riskType)} is high risk and should be fixed before staging.`;
  }

  if (risk.severity === "medium") {
    return `${labelRiskType(risk.riskType)} should be fixed before approval if possible.`;
  }

  return `${labelRiskType(risk.riskType)} is a light caution to keep visible during review.`;
}

function getOutcomeSupportCount(input: {
  signalId?: string;
  signal?: SignalRecord;
  postingEntries?: PostingLogEntry[];
  postingOutcomes?: PostingOutcome[];
  strategicOutcomes?: StrategicOutcome[];
}) {
  const signalId = input.signalId ?? input.signal?.recordId ?? null;
  if (!signalId) {
    return 0;
  }

  const postingIds = new Set(
    (input.postingEntries ?? [])
      .filter((entry) => entry.signalId === signalId)
      .map((entry) => entry.id),
  );

  const postingOutcomeCount = (input.postingOutcomes ?? []).filter((outcome) =>
    postingIds.has(outcome.postingLogId),
  ).length;
  const strategicOutcomeCount = (input.strategicOutcomes ?? []).filter((outcome) =>
    postingIds.has(outcome.postingLogId),
  ).length;

  return postingOutcomeCount + strategicOutcomeCount;
}

function assessOverAggressiveCta(input: {
  signal: SignalRecord;
  conversionIntent?: ConversionIntentAssessment | null;
}) {
  const bundle = buildSignalPublishPrepBundle(input.signal);
  const primaryPlatform = getPrimaryPlatform(input.signal);
  const primaryPackage = getPublishPrepPackageForPlatform(bundle, primaryPlatform);
  const ctaText = normalizeText(primaryPackage ? getSelectedCtaText(primaryPackage) : null);
  const destination = normalizeText(
    primaryPackage ? getPrimaryLinkVariant(primaryPackage)?.destinationLabel ?? primaryPackage.siteLinkLabel : null,
  );

  if (!ctaText) {
    return null;
  }

  const aggressivePattern =
    /\b(sign up|signup|try it free|start free|get started|book a demo|book demo|join now|buy now|subscribe now|start today)\b/i;
  const directConversion =
    input.conversionIntent?.posture === "direct_conversion" ||
    input.signal.funnelStage === "Conversion" ||
    input.signal.ctaGoal === "Sign up" ||
    input.signal.ctaGoal === "Try product";
  const earlyFunnel =
    input.conversionIntent?.posture === "awareness_first" ||
    input.conversionIntent?.posture === "trust_first" ||
    input.signal.funnelStage === "Awareness" ||
    input.signal.funnelStage === "Trust";

  if (!aggressivePattern.test(ctaText)) {
    return null;
  }

  if (earlyFunnel && !directConversion) {
    return {
      riskType: "over_aggressive_cta" as const,
      severity: "high" as const,
      reason: `CTA "${ctaText}" is too direct for ${input.conversionIntent?.posture?.replaceAll("_", " ") ?? "an early-funnel package"}${destination ? ` and currently points toward ${destination}` : ""}.`,
      suggestedFix: "Soften the CTA to a calmer trust-stage or learn-more invitation before staging.",
    };
  }

  if (input.conversionIntent?.posture === "soft_conversion") {
    return {
      riskType: "over_aggressive_cta" as const,
      severity: "medium" as const,
      reason: `CTA "${ctaText}" is stronger than the current soft-conversion posture.`,
      suggestedFix: "Use the softer CTA variant that keeps the commercial ask aligned with the current posture.",
    };
  }

  return null;
}

function assessWeakClaim(input: { signal: SignalRecord }) {
  const draft = getPrimaryDraft(input.signal);
  if (!draft) {
    return null;
  }

  const claimPattern =
    /\b(always|never|guarantee|guaranteed|everyone|nobody|all teachers|every teacher|completely|perfectly|instantly|100%)\b/gi;
  const matchCount = countMatches(draft, claimPattern);

  if (matchCount <= 0) {
    return null;
  }

  return {
    riskType: "weak_claim" as const,
    severity: matchCount >= 2 ? "high" as const : "medium" as const,
    reason: `Draft uses absolute or overconfident language ${matchCount >= 2 ? "multiple times" : "that reads stronger than the underlying evidence"}.`,
    suggestedFix: "Replace absolute phrasing with a calmer, evidence-bounded claim.",
  };
}

function assessLowEvidenceAssertion(input: {
  signal: SignalRecord;
  postingEntries?: PostingLogEntry[];
  postingOutcomes?: PostingOutcome[];
  strategicOutcomes?: StrategicOutcome[];
}) {
  const draft = getPrimaryDraft(input.signal);
  if (!draft) {
    return null;
  }

  const evidencePattern = /\b(research shows|studies show|data shows|proven|evidence shows|statistically|[\d]{1,3}%|\d+x)\b/i;
  if (!evidencePattern.test(draft)) {
    return null;
  }

  const sourceContext = [
    input.signal.rawExcerpt,
    input.signal.manualSummary,
    input.signal.interpretationNotes,
  ]
    .map((value) => value?.toLowerCase() ?? "")
    .join(" ");
  const outcomeSupportCount = getOutcomeSupportCount(input);

  if (sourceContext.includes("research") || sourceContext.includes("study") || sourceContext.match(/[\d]{1,3}%/)) {
    return null;
  }

  return {
    riskType: "low_evidence_assertion" as const,
    severity: outcomeSupportCount > 0 ? "medium" as const : "high" as const,
    reason:
      outcomeSupportCount > 0
        ? "Draft implies stronger evidence than is explicitly present in the source material."
        : "Draft makes an evidence-style assertion without source or outcome support attached.",
    suggestedFix: "Ground the line in observed experience or remove the implied evidence claim.",
  };
}

function assessRepetitivePattern(input: {
  signal: SignalRecord;
  fatigue: FatigueAssessment;
}) {
  const similarity = input.signal.similarityToExistingContent ?? 0;
  const fatigueWarning =
    input.fatigue.warnings.find((warning) =>
      ["editorial_mode", "pattern_bundle", "source_family"].includes(warning.dimension),
    ) ?? null;

  if (similarity < 82 && !fatigueWarning) {
    return null;
  }

  return {
    riskType: "repetitive_pattern" as const,
    severity:
      similarity >= 92 || fatigueWarning?.severity === "moderate"
        ? "high" as const
        : "medium" as const,
    reason:
      similarity >= 92
        ? "This candidate is extremely close to existing content and risks sounding repetitive."
        : fatigueWarning?.summary ?? "The current pattern family is showing visible repetition risk.",
    suggestedFix: "Shift the framing, destination, or supporting angle before promotion.",
  };
}

function assessBrandToneDrift(input: { signal: SignalRecord }) {
  const draft = getPrimaryDraft(input.signal);
  if (!draft) {
    return null;
  }

  const hypePattern =
    /\b(viral|killer|dominate|must-have|insane|game[- ]changer|hack|unstoppable|skyrocket|crush it|blow up)\b/gi;
  const exclamationCount = countMatches(draft, /!/g);
  const hypeCount = countMatches(draft, hypePattern);

  if (hypeCount === 0 && exclamationCount < 2) {
    return null;
  }

  return {
    riskType: "brand_tone_drift" as const,
    severity: hypeCount >= 2 || exclamationCount >= 3 ? "high" as const : "medium" as const,
    reason: "Draft tone is drifting away from the calm, teacher-safe Zaza voice into hype or pressure language.",
    suggestedFix: "Reduce hype language and restore a calmer practical tone before approval.",
  };
}

function assessAudienceMismatch(input: {
  signal: SignalRecord;
  audienceMemory?: AudienceMemoryState | null;
  conversionIntent?: ConversionIntentAssessment | null;
}) {
  const segment = getAudienceMemorySegment(input.audienceMemory, input.signal.audienceSegmentId);
  if (!segment) {
    return null;
  }

  const primaryPlatform = getPrimaryPlatform(input.signal);
  const bundle = buildSignalPublishPrepBundle(input.signal);
  const primaryPackage = getPublishPrepPackageForPlatform(bundle, primaryPlatform);
  const destinationLabel = normalizeText(
    primaryPackage ? getPrimaryLinkVariant(primaryPackage)?.destinationLabel ?? primaryPackage.siteLinkLabel : null,
  );
  const postureLabel = input.conversionIntent?.posture.replaceAll("_", " ") ?? "";
  const directCta = input.signal.ctaGoal === "Sign up" || input.signal.ctaGoal === "Try product";
  const weakDestination = destinationLabel
    ? segment.weakCombinations.find((note) =>
        note.toLowerCase().includes(destinationLabel.toLowerCase()),
      ) ?? null
    : null;
  const platformMismatch =
    segment.strongestPlatforms.length > 0 &&
    !segment.strongestPlatforms.some((row) => row.id === primaryPlatform);

  if (!weakDestination && !platformMismatch && !(segment.toneCautions.length > 0 && directCta)) {
    return null;
  }

  return {
    riskType: "audience_mismatch" as const,
    severity: weakDestination ? "high" as const : "medium" as const,
    reason:
      weakDestination ??
      (segment.toneCautions.length > 0 && directCta
        ? `${segment.segmentName} currently shows caution around harder CTA pressure, but this package is leaning more direct${postureLabel ? ` for a ${postureLabel} posture` : ""}.`
        : `${segment.segmentName} is stronger on other platforms than the current ${primaryPlatform} route.`),
    suggestedFix:
      weakDestination
        ? "Use a destination or CTA style that better matches this audience segment."
        : "Shift the tone or route toward the segment's stronger platform and CTA fit.",
  };
}

function assessFatigueRisk(input: {
  fatigue: FatigueAssessment;
  signal: SignalRecord;
}) {
  const topWarning = input.fatigue.warnings[0] ?? null;
  if (!topWarning) {
    return null;
  }

  return {
    riskType: "fatigue_risk" as const,
    severity:
      topWarning.severity === "moderate" &&
      ["cta_style", "destination_page"].includes(topWarning.dimension)
        ? "high" as const
        : topWarning.severity === "moderate"
          ? "medium" as const
          : "low" as const,
    reason: topWarning.summary,
    suggestedFix:
      topWarning.dimension === "cta_style" || topWarning.dimension === "destination_page"
        ? "Rotate the CTA or destination before staging this package."
        : "Vary the pattern or platform emphasis before pushing this item further.",
  };
}

export function assessCommercialRisk(input: {
  signal: SignalRecord;
  completeness: ApprovalPackageCompleteness;
  confidenceLevel: "high" | "medium" | "low";
  conflicts?: ConflictAssessment | null;
  fatigue: FatigueAssessment;
  conversionIntent?: ConversionIntentAssessment | null;
  audienceMemory?: AudienceMemoryState | null;
  postingEntries?: PostingLogEntry[];
  postingOutcomes?: PostingOutcome[];
  strategicOutcomes?: StrategicOutcome[];
}): CommercialRiskAssessment {
  const risks: CommercialRisk[] = [];

  addRisk(risks, assessOverAggressiveCta(input));
  addRisk(risks, assessWeakClaim(input));
  addRisk(risks, assessLowEvidenceAssertion(input));
  addRisk(risks, assessRepetitivePattern(input));
  addRisk(risks, assessBrandToneDrift(input));
  addRisk(risks, assessAudienceMismatch(input));
  addRisk(risks, assessFatigueRisk(input));

  if (input.conflicts?.topConflicts.some((conflict) => conflict.conflictType === "cta_destination_mismatch")) {
    addRisk(risks, {
      riskType: "over_aggressive_cta",
      severity: input.conflicts.highestSeverity === "high" ? "high" : "medium",
      reason:
        input.conflicts.topConflicts.find((conflict) => conflict.conflictType === "cta_destination_mismatch")?.reason ??
        "CTA and destination are sending conflicting commercial signals.",
      suggestedFix: "Align the CTA and destination before approval or staging.",
    });
  }

  const highestSeverity = getHighestSeverity(risks);
  const topRisk =
    [...risks].sort(
      (left, right) =>
        getSeverityRank(right.severity) - getSeverityRank(left.severity) ||
        left.riskType.localeCompare(right.riskType),
    )[0] ?? null;
  const supportingSignals: string[] = [];
  uniquePush(
    supportingSignals,
    input.completeness.completenessState !== "complete"
      ? `Package is ${input.completeness.completenessState.replaceAll("_", " ")}.`
      : null,
  );
  uniquePush(supportingSignals, input.fatigue.summary);
  uniquePush(supportingSignals, input.conversionIntent?.whyChosen[0]);
  uniquePush(supportingSignals, input.conflicts?.summary[0]);
  uniquePush(
    supportingSignals,
    getAudienceMemorySegment(input.audienceMemory, input.signal.audienceSegmentId)?.summary[0],
  );

  return {
    risks,
    highestSeverity,
    decision: buildDecision(highestSeverity),
    summary: buildTopRiskSummary(topRisk),
    topRisk,
    supportingSignals: supportingSignals.slice(0, 4),
  };
}

function countRows(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) {
      continue;
    }
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function buildCommercialRiskInsights(
  assessments: CommercialRiskAssessment[],
  auditEvents?: Array<{ eventType: string; metadata?: Record<string, string | number | boolean | null | undefined> }>,
): CommercialRiskInsights {
  const risky = assessments.filter((assessment) => assessment.risks.length > 0);
  const blocked = assessments.filter((assessment) => assessment.decision === "block");
  const suggestFix = assessments.filter((assessment) => assessment.decision === "suggest_fix");
  const riskTypeCounts = new Map<string, number>();
  const severityCounts = new Map<string, number>();
  const suggestedFixes: string[] = [];

  for (const assessment of risky) {
    if (assessment.highestSeverity) {
      severityCounts.set(
        assessment.highestSeverity,
        (severityCounts.get(assessment.highestSeverity) ?? 0) + 1,
      );
    }

    for (const risk of assessment.risks) {
      riskTypeCounts.set(risk.riskType, (riskTypeCounts.get(risk.riskType) ?? 0) + 1);
      suggestedFixes.push(risk.suggestedFix);
    }
  }

  const detectedEvents = (auditEvents ?? []).filter((event) => event.eventType === "RISK_DETECTED").length;
  const blockedEvents = (auditEvents ?? []).filter((event) => event.eventType === "RISK_BLOCKED").length;
  const topRiskTypes = [...riskTypeCounts.entries()]
    .map(([label, count]) => ({ label: labelRiskType(label as CommercialRiskType), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5);

  const trendSummary: string[] = [];
  uniquePush(
    trendSummary,
    topRiskTypes[0]
      ? `${topRiskTypes[0].label} is the most common current commercial risk.`
      : null,
  );
  uniquePush(
    trendSummary,
    blocked.length > 0
      ? `${blocked.length} candidate${blocked.length === 1 ? "" : "s"} are currently blocked by high commercial risk.`
      : null,
  );
  uniquePush(
    trendSummary,
    suggestFix.length > 0
      ? `${suggestFix.length} candidate${suggestFix.length === 1 ? "" : "s"} need a suggested commercial fix before staging.`
      : null,
  );
  uniquePush(
    trendSummary,
    detectedEvents > 0 || blockedEvents > 0
      ? `Audit trail shows ${detectedEvents} detected risk event${detectedEvents === 1 ? "" : "s"} and ${blockedEvents} blocked risk event${blockedEvents === 1 ? "" : "s"}.`
      : null,
  );

  return {
    riskyCount: risky.length,
    blockedCount: blocked.length,
    suggestFixCount: suggestFix.length,
    topRiskTypes,
    severityRows: [...severityCounts.entries()]
      .map(([label, count]) => ({ label: `${label} severity`, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
    topSuggestedFixes: countRows(suggestedFixes).slice(0, 4),
    trendSummary: trendSummary.slice(0, 4),
  };
}
