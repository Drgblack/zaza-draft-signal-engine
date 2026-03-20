import { z } from "zod";

import { getSignalContentContextSummary, type CampaignStrategy } from "@/lib/campaigns";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { ManualExperiment } from "@/lib/experiments";
import type { FatigueAssessment } from "@/lib/fatigue";
import type { ExpectedOutcomeAssessment } from "@/lib/expected-outcome-ranking";
import type { CandidateHypothesis } from "@/lib/hypotheses";
import { getPlatformIntentProfile } from "@/lib/platform-profiles";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getPublishPrepPackageForPlatform,
  getSelectedCtaText,
} from "@/lib/publish-prep";
import { getSiteLinkById, isSiteLinkAlignedToCtaGoal, resolveSiteLinkReference } from "@/lib/site-links";
import type { SignalRecord } from "@/types/signal";

export const CONFLICT_TYPES = [
  "cta_destination_mismatch",
  "mode_funnel_mismatch",
  "platform_tone_mismatch",
  "hypothesis_package_mismatch",
  "campaign_context_mismatch",
  "expected_outcome_mismatch",
  "destination_overreach",
  "reddit_promo_conflict",
] as const;

export const CONFLICT_SEVERITIES = ["low", "medium", "high"] as const;

export type ConflictType = (typeof CONFLICT_TYPES)[number];
export type ConflictSeverity = (typeof CONFLICT_SEVERITIES)[number];

export const candidateConflictSchema = z.object({
  conflictType: z.enum(CONFLICT_TYPES),
  severity: z.enum(CONFLICT_SEVERITIES),
  reason: z.string().trim().min(1),
  suggestedFix: z.string().trim().min(1).nullable().optional(),
  platform: z.enum(["x", "linkedin", "reddit"]).nullable().optional(),
});

export type CandidateConflict = z.infer<typeof candidateConflictSchema>;

export interface ConflictAssessment {
  conflicts: CandidateConflict[];
  topConflicts: CandidateConflict[];
  summary: string[];
  highestSeverity: ConflictSeverity | null;
  rankPenalty: number;
  requiresJudgement: boolean;
  fingerprint: string | null;
}

export interface ConflictInsights {
  conflictedCandidateCount: number;
  highSeverityCount: number;
  topConflictTypes: Array<{ type: ConflictType; label: string; count: number }>;
  platformRows: Array<{ label: string; count: number }>;
  modeRows: Array<{ label: string; count: number }>;
}

interface ConflictAssessmentInput {
  signal: SignalRecord;
  hypothesis: CandidateHypothesis;
  expectedOutcome: Pick<ExpectedOutcomeAssessment, "expectedOutcomeTier" | "expectedOutcomeReasons" | "riskSignals">;
  fatigue: Pick<FatigueAssessment, "warnings">;
  strategy?: CampaignStrategy | null;
  experiments?: ManualExperiment[];
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

function conflictLabel(type: ConflictType): string {
  switch (type) {
    case "cta_destination_mismatch":
      return "CTA / destination mismatch";
    case "mode_funnel_mismatch":
      return "Mode / funnel mismatch";
    case "platform_tone_mismatch":
      return "Platform / tone mismatch";
    case "hypothesis_package_mismatch":
      return "Hypothesis / package mismatch";
    case "campaign_context_mismatch":
      return "Campaign context mismatch";
    case "expected_outcome_mismatch":
      return "Expected outcome mismatch";
    case "destination_overreach":
      return "Destination overreach";
    case "reddit_promo_conflict":
    default:
      return "Reddit promo conflict";
  }
}

function uniquePush(target: CandidateConflict[], next: CandidateConflict | null) {
  if (!next || target.some((item) => item.conflictType === next.conflictType && item.platform === next.platform)) {
    return;
  }

  target.push(candidateConflictSchema.parse(next));
}

function severityScore(severity: ConflictSeverity): number {
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

function detectPromotionalLanguage(text: string): boolean {
  return /sign up|try product|pricing|book a demo|visit site|start free|free trial|zazadraft\.com|buy/i.test(text);
}

function detectAlarmistLanguage(text: string): boolean {
  return /this could happen to you|stop scrolling|urgent|!!!|you won't believe|disaster|panic/i.test(text);
}

function buildConflict(
  conflictType: ConflictType,
  severity: ConflictSeverity,
  reason: string,
  suggestedFix?: string | null,
  platform?: "x" | "linkedin" | "reddit" | null,
): CandidateConflict {
  return candidateConflictSchema.parse({
    conflictType,
    severity,
    reason,
    suggestedFix: suggestedFix ?? null,
    platform: platform ?? null,
  });
}

function getCampaignText(input: ConflictAssessmentInput): string {
  const context = input.strategy ? getSignalContentContextSummary(input.signal, input.strategy) : null;
  const campaign =
    context?.campaignId && input.strategy
      ? input.strategy.campaigns.find((entry) => entry.id === context.campaignId) ?? null
      : null;

  return [context?.campaignName, campaign?.goal, input.signal.campaignId].filter(Boolean).join(" ").toLowerCase();
}

function hasDirectConversionIntent(signal: SignalRecord, hypothesis: CandidateHypothesis): boolean {
  return (
    signal.ctaGoal === "Sign up" ||
    signal.ctaGoal === "Try product" ||
    signal.funnelStage === "Conversion" ||
    /drive signups|drive trials|drive conversion|drive site visits/.test(hypothesis.objective)
  );
}

function hasTrustObjective(signal: SignalRecord, hypothesis: CandidateHypothesis): boolean {
  return (
    signal.funnelStage === "Trust" ||
    signal.ctaGoal === "Awareness" ||
    signal.ctaGoal === "Share / engage" ||
    /build trust|invite response|practical takeaway/.test(hypothesis.objective)
  );
}

function hasActiveExperiment(signalId: string, experiments: ManualExperiment[]): boolean {
  return experiments.some(
    (experiment) =>
      experiment.status === "active" &&
      experiment.variants.some((variant) => variant.linkedSignalIds.includes(signalId)),
  );
}

export function assessCandidateConflicts(input: ConflictAssessmentInput): ConflictAssessment {
  const primaryPlatform = getPrimaryPlatform(input.signal);
  const bundle = buildSignalPublishPrepBundle(input.signal);
  const primaryPackage = getPublishPrepPackageForPlatform(bundle, primaryPlatform);
  const primaryLink = primaryPackage ? getPrimaryLinkVariant(primaryPackage) : null;
  const primarySiteLink =
    getSiteLinkById(primaryPackage?.siteLinkId ?? null) ??
    resolveSiteLinkReference({
      siteLinkId: primaryLink?.siteLinkId,
      destinationUrl: primaryLink?.url,
      destinationLabel: primaryLink?.destinationLabel ?? primaryLink?.label,
    }).siteLink;
  const selectedCta = primaryPackage ? getSelectedCtaText(primaryPackage) : input.signal.ctaOrClosingLine;
  const primaryDraft =
    primaryPlatform === "linkedin"
      ? input.signal.finalLinkedInDraft ?? input.signal.linkedInDraft ?? ""
      : primaryPlatform === "reddit"
        ? input.signal.finalRedditDraft ?? input.signal.redditDraft ?? ""
        : input.signal.finalXDraft ?? input.signal.xDraft ?? "";
  const redditPackage = getPublishPrepPackageForPlatform(bundle, "reddit");
  const redditCta = redditPackage ? getSelectedCtaText(redditPackage) : input.signal.ctaOrClosingLine;
  const redditDraft = input.signal.finalRedditDraft ?? input.signal.redditDraft ?? "";
  const mode = input.signal.editorialMode ? getEditorialModeDefinition(input.signal.editorialMode) : null;
  const profile = getPlatformIntentProfile(primaryPlatform);
  const campaignText = getCampaignText(input);
  const conflicts: CandidateConflict[] = [];
  const destinationWarning = input.fatigue.warnings.find((warning) => warning.dimension === "destination_page") ?? null;
  const ctaWarning = input.fatigue.warnings.find((warning) => warning.dimension === "cta_style") ?? null;
  const directConversionIntent = hasDirectConversionIntent(input.signal, input.hypothesis);
  const trustObjective = hasTrustObjective(input.signal, input.hypothesis);

  if (primarySiteLink && input.signal.ctaGoal && !isSiteLinkAlignedToCtaGoal(primarySiteLink, input.signal.ctaGoal)) {
    uniquePush(
      conflicts,
      buildConflict(
        "cta_destination_mismatch",
        input.signal.ctaGoal === "Sign up" || input.signal.ctaGoal === "Try product" ? "high" : "medium",
        `${primarySiteLink.label} does not match the current ${input.signal.ctaGoal.toLowerCase()} CTA.`,
        "Switch to a destination aligned with the current CTA goal, or soften the CTA.",
        primaryPlatform,
      ),
    );
  }

  if (
    primarySiteLink &&
    (input.signal.funnelStage === "Awareness" || input.signal.funnelStage === "Trust" || trustObjective) &&
    (primarySiteLink.id === "pricing" || primarySiteLink.id === "get_started")
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "destination_overreach",
        primaryPlatform === "reddit" ? "high" : "medium",
        `${primarySiteLink.label} is a hard conversion destination for a ${input.signal.funnelStage?.toLowerCase() ?? "trust-stage"} package.`,
        "Switch to a softer destination such as Product Overview, Resources, or Homepage.",
        primaryPlatform,
      ),
    );
  }

  if (
    input.signal.funnelStage === "Trust" &&
    (input.signal.editorialMode === "risk_warning" || input.signal.editorialMode === "this_could_happen_to_you")
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "mode_funnel_mismatch",
        "medium",
        `${mode?.label ?? "Current mode"} is sharper than the current trust-stage package needs.`,
        "Consider Calm Insight, Professional Guidance, or Reassurance / De-escalation.",
      ),
    );
  }

  if (
    input.signal.funnelStage === "Conversion" &&
    (input.signal.editorialMode === "awareness" || input.signal.editorialMode === "calm_insight") &&
    !directConversionIntent
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "mode_funnel_mismatch",
        "medium",
        `${mode?.label ?? "Current mode"} is packaging this more like soft awareness than conversion.`,
        "Tighten the CTA or switch to a more commercially direct mode.",
      ),
    );
  }

  if (
    directConversionIntent &&
    (!selectedCta || input.signal.ctaGoal === "Awareness" || input.signal.ctaGoal === "Share / engage" || !primarySiteLink)
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "hypothesis_package_mismatch",
        "medium",
        `The hypothesis is ${input.hypothesis.objective}, but the package still reads like soft awareness.`,
        "Add a direct CTA and choose a clearer commercial destination.",
        primaryPlatform,
      ),
    );
  }

  if (
    trustObjective &&
    (input.signal.ctaGoal === "Sign up" || input.signal.ctaGoal === "Try product" || primarySiteLink?.id === "pricing" || primarySiteLink?.id === "get_started")
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "hypothesis_package_mismatch",
        "medium",
        `The hypothesis is ${input.hypothesis.objective}, but the package is pushing a harder conversion ask.`,
        "Soften the CTA or switch to a trust-stage destination.",
        primaryPlatform,
      ),
    );
  }

  if (
    primaryPlatform === "linkedin" &&
    (input.signal.funnelStage === "Trust" || input.signal.editorialMode === "calm_insight" || input.signal.editorialMode === "professional_guidance") &&
    detectAlarmistLanguage(primaryDraft)
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "platform_tone_mismatch",
        "medium",
        `${profile.label} packaging is sharper and more alarmist than the current mode or funnel stage supports.`,
        "Soften the opening and keep the tone more professional and grounded.",
        primaryPlatform,
      ),
    );
  }

  if (
    redditDraft &&
    (detectPromotionalLanguage(redditDraft) || detectPromotionalLanguage(redditCta ?? "")) &&
    (input.signal.ctaGoal === "Try product" || input.signal.ctaGoal === "Sign up" || Boolean(primarySiteLink?.id === "pricing" || primarySiteLink?.id === "get_started"))
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "reddit_promo_conflict",
        primarySiteLink?.id === "pricing" || primarySiteLink?.id === "get_started" ? "high" : "medium",
        "The Reddit package reads too promotional for a discussion-first platform posture.",
        "Soften the CTA, switch to a softer destination, or turn this into an experiment.",
        "reddit",
      ),
    );
  }

  if (
    /trust|awareness|education/.test(campaignText) &&
    (input.signal.ctaGoal === "Try product" || input.signal.ctaGoal === "Sign up" || input.signal.editorialMode === "this_could_happen_to_you")
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "campaign_context_mismatch",
        "medium",
        "The saved campaign context looks trust-oriented, but the package is still more click-aggressive than trust-building.",
        "Bring the CTA and destination back toward trust-stage packaging.",
      ),
    );
  }

  if (
    input.expectedOutcome.expectedOutcomeTier === "high" &&
    conflicts.some((conflict) => conflict.severity === "medium" || conflict.severity === "high")
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "expected_outcome_mismatch",
        hasActiveExperiment(input.signal.recordId, input.experiments ?? []) ? "medium" : "low",
        "Expected outcome is strong, but the package still has alignment conflicts that weaken that confidence.",
        "Resolve the top package conflict before treating this as a clean high-value candidate.",
        primaryPlatform,
      ),
    );
  }

  if (hasActiveExperiment(input.signal.recordId, input.experiments ?? []) && input.expectedOutcome.expectedOutcomeTier === "high") {
    uniquePush(
      conflicts,
      buildConflict(
        "expected_outcome_mismatch",
        "low",
        "This candidate is still inside an active experiment, so strong expected-value confidence should stay a little more cautious.",
        "If the commercial route is still uncertain, consider converting the package into a clearer experiment path.",
        primaryPlatform,
      ),
    );
  }

  if (
    (destinationWarning?.severity === "moderate" || ctaWarning?.severity === "moderate") &&
    conflicts.every((conflict) => conflict.conflictType !== "cta_destination_mismatch")
  ) {
    uniquePush(
      conflicts,
      buildConflict(
        "cta_destination_mismatch",
        "low",
        "Destination or CTA fatigue is already elevated, so this package may be leaning on an overused route.",
        "Switch destination or CTA variant before final approval.",
        primaryPlatform,
      ),
    );
  }

  const sorted = [...conflicts].sort(
    (left, right) =>
      severityScore(right.severity) - severityScore(left.severity) ||
      conflictLabel(left.conflictType).localeCompare(conflictLabel(right.conflictType)),
  );
  const highestSeverity = sorted[0]?.severity ?? null;
  const rankPenalty = Math.min(4, sorted.reduce((sum, conflict) => sum + severityScore(conflict.severity), 0));
  const topConflicts = sorted.slice(0, 3);

  return {
    conflicts: sorted,
    topConflicts,
    summary: topConflicts.map((conflict) => conflictLabel(conflict.conflictType)),
    highestSeverity,
    rankPenalty,
    requiresJudgement: sorted.some((conflict) => conflict.severity === "high"),
    fingerprint:
      topConflicts.length > 0
        ? topConflicts.map((conflict) => `${conflict.conflictType}:${conflict.severity}:${conflict.platform ?? "all"}`).join("|")
        : null,
  };
}

export function buildConflictInsights(
  items: Array<{
    conflicts: ConflictAssessment;
    signal: Pick<SignalRecord, "platformPriority" | "editorialMode">;
  }>,
): ConflictInsights {
  const typeCounts = new Map<ConflictType, number>();
  const platformCounts = new Map<string, number>();
  const modeCounts = new Map<string, number>();

  for (const item of items) {
    if (item.conflicts.conflicts.length === 0) {
      continue;
    }

    const platform = item.signal.platformPriority === "LinkedIn First" ? "LinkedIn" : item.signal.platformPriority === "Reddit First" ? "Reddit" : "X";
    platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);

    if (item.signal.editorialMode) {
      modeCounts.set(item.signal.editorialMode, (modeCounts.get(item.signal.editorialMode) ?? 0) + 1);
    }

    for (const conflict of item.conflicts.conflicts) {
      typeCounts.set(conflict.conflictType, (typeCounts.get(conflict.conflictType) ?? 0) + 1);
    }
  }

  return {
    conflictedCandidateCount: items.filter((item) => item.conflicts.conflicts.length > 0).length,
    highSeverityCount: items.filter((item) => item.conflicts.highestSeverity === "high").length,
    topConflictTypes: [...typeCounts.entries()]
      .map(([type, count]) => ({ type, label: conflictLabel(type), count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 6),
    platformRows: [...platformCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4),
    modeRows: [...modeCounts.entries()]
      .map(([label, count]) => ({
        label: getEditorialModeDefinition(label as NonNullable<SignalRecord["editorialMode"]>).label,
        count,
      }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 4),
  };
}
