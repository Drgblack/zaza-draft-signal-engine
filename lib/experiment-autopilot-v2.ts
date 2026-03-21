import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import { evaluateAutonomyPolicy, type AutonomyPolicyDecision } from "@/lib/autonomy-policy";
import { getConversionIntentLabel } from "@/lib/conversion-intent";
import type { ExperimentType, ManualExperiment } from "@/lib/experiments";
import { buildSignalPublishPrepBundle } from "@/lib/publish-prep";
import { buildSignalRepurposingBundle } from "@/lib/repurposing";

export const EXPERIMENT_AUTOPILOT_V2_VARIABLES = [
  "hook_variant",
  "cta_variant",
  "destination_variant",
  "editorial_mode_variant",
  "platform_expression_variant",
  "pattern_vs_no_pattern",
] as const;

export type ExperimentAutopilotVariable = (typeof EXPERIMENT_AUTOPILOT_V2_VARIABLES)[number];

export interface ExperimentAutopilotVariantCandidate {
  label: string;
  summary: string;
  platform: "x" | "linkedin" | "reddit" | null;
}

export interface ExperimentAutopilotV2Package {
  eligible: boolean;
  decision: "created" | "blocked" | "skipped";
  policy: AutonomyPolicyDecision;
  variable: ExperimentAutopilotVariable | null;
  experimentType: ExperimentType | null;
  reason: string | null;
  blockReasons: string[];
  hypothesis: string | null;
  stopConditions: string[];
  safetyNotes: string[];
  expectedLearningGoal: string | null;
  comparisonTarget: string | null;
  outcomeSignal: string | null;
  controlCandidate: ExperimentAutopilotVariantCandidate | null;
  variantCandidate: ExperimentAutopilotVariantCandidate | null;
}

interface ScoredPackage {
  score: number;
  pack: ExperimentAutopilotV2Package;
}

function trimOrNull(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function preferredPlatform(candidate: ApprovalQueueCandidate): "x" | "linkedin" | "reddit" {
  if (candidate.signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }

  if (candidate.signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "x";
}

function isSocialPlatform(value: string): value is "x" | "linkedin" | "reddit" {
  return value === "x" || value === "linkedin" || value === "reddit";
}

function hasExperimentConflict(
  candidate: ApprovalQueueCandidate,
  experiments: ManualExperiment[] | undefined,
  experimentType: ExperimentType,
) {
  if (!experiments) {
    return false;
  }

  return experiments.some(
    (experiment) =>
      experiment.status !== "completed" &&
      experiment.experimentType === experimentType &&
      experiment.variants.some((variant) => variant.linkedSignalIds.includes(candidate.signal.recordId)),
  );
}

function buildBaseBlock(input: {
  candidate: ApprovalQueueCandidate;
  policy: AutonomyPolicyDecision;
  blockReason: string;
}): ExperimentAutopilotV2Package {
  return {
    eligible: false,
    decision: "blocked",
    policy: input.policy,
    variable: null,
    experimentType: null,
    reason: null,
    blockReasons: Array.from(new Set([input.blockReason, ...input.policy.reasons].filter(Boolean))),
    hypothesis: null,
    stopConditions: [],
    safetyNotes: [],
    expectedLearningGoal: null,
    comparisonTarget: null,
    outcomeSignal: null,
    controlCandidate: null,
    variantCandidate: null,
  };
}

function buildStopConditions(input: {
  variableLabel: string;
  outcomeSignal: string;
}): string[] {
  return [
    `After 2 judged outcomes or posted observations, compare which ${input.variableLabel.toLowerCase()} better supports ${input.outcomeSignal.toLowerCase()}.`,
    "If one variant clearly underperforms on strategic value, click intent, or revenue support, keep the stronger variant and close the test.",
    "If both variants stay weak or ambiguous, retire this test family instead of expanding it.",
  ];
}

function buildProposalBase(input: {
  candidate: ApprovalQueueCandidate;
  policy: AutonomyPolicyDecision;
  variable: ExperimentAutopilotVariable;
  experimentType: ExperimentType;
  reason: string;
  hypothesis: string;
  comparisonTarget: string;
  expectedLearningGoal: string;
  outcomeSignal: string;
  controlCandidate: ExperimentAutopilotVariantCandidate;
  variantCandidate: ExperimentAutopilotVariantCandidate;
  safetyNotes?: string[];
}): ExperimentAutopilotV2Package {
  return {
    eligible: true,
    decision: "created",
    policy: input.policy,
    variable: input.variable,
    experimentType: input.experimentType,
    reason: input.reason,
    blockReasons: [],
    hypothesis: input.hypothesis,
    stopConditions: buildStopConditions({
      variableLabel: input.controlCandidate.label.includes("Control")
        ? input.controlCandidate.label.replace(/^Control:\s*/i, "")
        : input.variable.replaceAll("_", " "),
      outcomeSignal: input.outcomeSignal,
    }),
    safetyNotes: input.safetyNotes?.length
      ? input.safetyNotes
      : [
          "Only one variable changed. The rest of the package should stay stable.",
          "Operator confirmation is still required before any experiment is created.",
        ],
    expectedLearningGoal: input.expectedLearningGoal,
    comparisonTarget: input.comparisonTarget,
    outcomeSignal: input.outcomeSignal,
    controlCandidate: input.controlCandidate,
    variantCandidate: input.variantCandidate,
  };
}

function buildHookVariantPack(
  candidate: ApprovalQueueCandidate,
  policy: AutonomyPolicyDecision,
  experiments: ManualExperiment[] | undefined,
): ScoredPackage | null {
  if (hasExperimentConflict(candidate, experiments, "hook_variant_test")) {
    return null;
  }

  const bundle = buildSignalPublishPrepBundle(candidate.signal);
  const platform = preferredPlatform(candidate);
  const pkg =
    bundle?.packages.find((entry) => entry.outputKind === "primary_draft" && entry.platform === platform) ??
    bundle?.packages.find(
      (entry) =>
        entry.outputKind === "primary_draft" &&
        (entry.platform === "x" || entry.platform === "linkedin" || entry.platform === "reddit"),
    ) ??
    null;
  const variants = pkg?.hookVariants.slice(0, 2) ?? [];
  if (variants.length < 2) {
    return null;
  }

  const reason =
    candidate.expectedOutcome.expectedOutcomeTier !== "high"
      ? candidate.expectedOutcome.expectedOutcomeReasons[0] ?? "the stronger opening shape is still uncertain"
      : candidate.hypothesis.riskNote;
  if (!reason) {
    return null;
  }

  const platformLabel = platform === "linkedin" ? "LinkedIn" : platform === "reddit" ? "Reddit" : "X";
  const comparisonTarget = `${variants[0].styleLabel} vs ${variants[1].styleLabel}`;

  return {
    score: 6,
    pack: buildProposalBase({
      candidate,
      policy,
      variable: "hook_variant",
      experimentType: "hook_variant_test",
      reason: `Two plausible hook shapes are available and ${reason.toLowerCase()}.`,
      hypothesis: `Test ${variants[0].styleLabel.toLowerCase()} against ${variants[1].styleLabel.toLowerCase()} on ${platformLabel} to learn which opening better supports ${candidate.hypothesis.objective.toLowerCase()}.`,
      comparisonTarget,
      expectedLearningGoal: `Learn which opening shape better improves early response quality on ${platformLabel}.`,
      outcomeSignal:
        candidate.signal.ctaGoal === "Sign up" || candidate.signal.ctaGoal === "Try product"
          ? "lead intent"
          : candidate.signal.ctaGoal === "Visit site"
            ? "click intent"
            : "strategic value",
      controlCandidate: {
        label: `Control: ${variants[0].styleLabel}`,
        summary: variants[0].text,
        platform,
      },
      variantCandidate: {
        label: `Variant: ${variants[1].styleLabel}`,
        summary: variants[1].text,
        platform,
      },
    }),
  };
}

function buildCtaVariantPack(
  candidate: ApprovalQueueCandidate,
  policy: AutonomyPolicyDecision,
  experiments: ManualExperiment[] | undefined,
): ScoredPackage | null {
  if (hasExperimentConflict(candidate, experiments, "cta_variant_test")) {
    return null;
  }

  const platform = preferredPlatform(candidate);
  const bundle = buildSignalPublishPrepBundle(candidate.signal);
  const pkg =
    bundle?.packages.find((entry) => entry.outputKind === "primary_draft" && entry.platform === platform) ??
    null;
  const variants = pkg?.ctaVariants.slice(0, 2) ?? [];
  if (variants.length < 2) {
    return null;
  }

  const posture = candidate.conversionIntent.posture;
  const mismatchReason =
    candidate.preReviewRepair.ctaDestinationHealing.healingType === "soften_cta"
      ? candidate.preReviewRepair.ctaDestinationHealing.reason
      : candidate.expectedOutcome.riskSignals.find((signal) => signal.toLowerCase().includes("cta")) ??
        candidate.expectedOutcome.riskSignals.find((signal) => signal.toLowerCase().includes("destination")) ??
        (posture === "trust_first" || posture === "awareness_first"
          ? `current conversion posture is ${getConversionIntentLabel(posture).toLowerCase()}`
          : null);
  if (!mismatchReason) {
    return null;
  }

  const platformLabel = platform === "linkedin" ? "LinkedIn" : platform === "reddit" ? "Reddit" : "X";
  const comparisonTarget = `${variants[0].goalLabel} vs ${variants[1].goalLabel}`;

  return {
    score: posture === "trust_first" || posture === "soft_conversion" ? 9 : 5,
    pack: buildProposalBase({
      candidate,
      policy,
      variable: "cta_variant",
      experimentType: "cta_variant_test",
      reason: `Two bounded CTA directions are available and ${mismatchReason.toLowerCase()}.`,
      hypothesis: `Test ${variants[0].goalLabel.toLowerCase()} against ${variants[1].goalLabel.toLowerCase()} on ${platformLabel} ${getConversionIntentLabel(posture).toLowerCase()} content to learn which CTA better fits the current funnel posture.`,
      comparisonTarget,
      expectedLearningGoal: `Learn which CTA style produces stronger ${candidate.signal.ctaGoal?.toLowerCase() ?? "response"} without weakening trust.`,
      outcomeSignal:
        candidate.signal.ctaGoal === "Sign up" || candidate.signal.ctaGoal === "Try product" || posture === "direct_conversion"
          ? "lead and signup signals"
          : posture === "soft_conversion"
            ? "click intent and strategic value"
            : "strategic value",
      controlCandidate: {
        label: `Control: ${variants[0].goalLabel}`,
        summary: variants[0].text,
        platform,
      },
      variantCandidate: {
        label: `Variant: ${variants[1].goalLabel}`,
        summary: variants[1].text,
        platform,
      },
      safetyNotes: [
        "Only CTA language changes. The draft, platform, and destination should stay stable.",
        "Use this only when the CTA is not locked by an active experiment or explicit operator decision.",
      ],
    }),
  };
}

function buildDestinationVariantPack(
  candidate: ApprovalQueueCandidate,
  policy: AutonomyPolicyDecision,
  experiments: ManualExperiment[] | undefined,
): ScoredPackage | null {
  if (hasExperimentConflict(candidate, experiments, "destination_test")) {
    return null;
  }

  const platform = preferredPlatform(candidate);
  const bundle = buildSignalPublishPrepBundle(candidate.signal);
  const pkg =
    bundle?.packages.find((entry) => entry.outputKind === "primary_draft" && entry.platform === platform) ??
    null;
  const variants =
    pkg?.linkVariants
      .filter(
        (variant, index, rows) =>
          rows.findIndex((row) => `${row.label}|${row.url}` === `${variant.label}|${variant.url}`) === index,
      )
      .slice(0, 2) ?? [];
  if (variants.length < 2) {
    return null;
  }

  const reason =
    candidate.preReviewRepair.ctaDestinationHealing.healingType === "switch_destination" ||
    candidate.preReviewRepair.ctaDestinationHealing.healingType === "align_destination_to_conversion_posture" ||
    candidate.preReviewRepair.ctaDestinationHealing.healingType === "commercial_pair_upgrade"
      ? candidate.preReviewRepair.ctaDestinationHealing.reason
      : candidate.expectedOutcome.riskSignals.find((signal) => signal.toLowerCase().includes("destination")) ??
        candidate.expectedOutcome.riskSignals.find((signal) => signal.toLowerCase().includes("misaligned"));
  if (!reason) {
    return null;
  }

  const comparisonTarget = `${variants[0].destinationLabel ?? variants[0].label} vs ${variants[1].destinationLabel ?? variants[1].label}`;

  return {
    score: 8,
    pack: buildProposalBase({
      candidate,
      policy,
      variable: "destination_variant",
      experimentType: "destination_test",
      reason: `Two plausible destination paths are available and ${reason.toLowerCase()}.`,
      hypothesis: `Test ${variants[0].destinationLabel?.toLowerCase() ?? variants[0].label.toLowerCase()} against ${variants[1].destinationLabel?.toLowerCase() ?? variants[1].label.toLowerCase()} to learn which route better matches the current conversion posture.`,
      comparisonTarget,
      expectedLearningGoal: "Learn which destination path produces stronger commercial follow-through without forcing a harder sell.",
      outcomeSignal:
        candidate.conversionIntent.posture === "direct_conversion"
          ? "signup and paid intent"
          : candidate.conversionIntent.posture === "soft_conversion"
            ? "click intent and signup signals"
            : "click intent",
      controlCandidate: {
        label: `Control: ${variants[0].destinationLabel ?? variants[0].label}`,
        summary: variants[0].url,
        platform,
      },
      variantCandidate: {
        label: `Variant: ${variants[1].destinationLabel ?? variants[1].label}`,
        summary: variants[1].url,
        platform,
      },
      safetyNotes: [
        "Only the destination changes. Keep the draft, hook, and CTA stable.",
        "Do not use this when a destination experiment is already active for the same signal.",
      ],
    }),
  };
}

function getSuggestedComparisonMode(currentMode: string | null | undefined): string | null {
  switch (currentMode) {
    case "helpful_tip":
      return "professional_guidance";
    case "professional_guidance":
      return "helpful_tip";
    case "risk_warning":
      return "calm_insight";
    case "thought_leadership":
      return "professional_guidance";
    case "this_could_happen_to_you":
      return "reassurance_deescalation";
    case "reassurance_deescalation":
      return "risk_warning";
    case "awareness":
      return "helpful_tip";
    case "calm_insight":
      return "risk_warning";
    default:
      return null;
  }
}

function humanizeMode(value: string | null | undefined): string {
  return trimOrNull(value)?.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase()) ?? "Current mode";
}

function buildEditorialModeVariantPack(
  candidate: ApprovalQueueCandidate,
  policy: AutonomyPolicyDecision,
  experiments: ManualExperiment[] | undefined,
): ScoredPackage | null {
  if (!candidate.signal.editorialMode || hasExperimentConflict(candidate, experiments, "editorial_mode_test")) {
    return null;
  }

  const comparisonMode = getSuggestedComparisonMode(candidate.signal.editorialMode);
  if (!comparisonMode) {
    return null;
  }

  const reason =
    candidate.fatigue.warnings.find((warning) => warning.dimension === "editorial_mode")?.summary ??
    candidate.hypothesis.riskNote;
  if (!reason) {
    return null;
  }

  const currentLabel = humanizeMode(candidate.signal.editorialMode);
  const comparisonLabel = humanizeMode(comparisonMode);

  return {
    score: 4,
    pack: buildProposalBase({
      candidate,
      policy,
      variable: "editorial_mode_variant",
      experimentType: "editorial_mode_test",
      reason: `The current framing is still useful, but ${reason.toLowerCase()}.`,
      hypothesis: `Test ${currentLabel.toLowerCase()} against ${comparisonLabel.toLowerCase()} to learn which framing better carries this idea without changing the core message.`,
      comparisonTarget: `${currentLabel} vs ${comparisonLabel}`,
      expectedLearningGoal: "Learn which editorial wrapper improves clarity and strategic usefulness while keeping the message stable.",
      outcomeSignal: "strategic value",
      controlCandidate: {
        label: `Control: ${currentLabel}`,
        summary: "Keep the current editorial wrapper.",
        platform: preferredPlatform(candidate),
      },
      variantCandidate: {
        label: `Variant: ${comparisonLabel}`,
        summary: "Test one bounded alternate editorial wrapper.",
        platform: preferredPlatform(candidate),
      },
      safetyNotes: [
        "Only the editorial wrapper changes. The content idea should stay stable.",
        "Do not use this when the draft is still strategically unstable.",
      ],
    }),
  };
}

function buildPlatformExpressionVariantPack(
  candidate: ApprovalQueueCandidate,
  policy: AutonomyPolicyDecision,
  experiments: ManualExperiment[] | undefined,
): ScoredPackage | null {
  if (hasExperimentConflict(candidate, experiments, "platform_expression_test")) {
    return null;
  }

  const outputs = buildSignalRepurposingBundle(candidate.signal)?.outputs ?? [];
  const variants = outputs
    .filter((output): output is typeof output & { platform: "x" | "linkedin" | "reddit" } => isSocialPlatform(output.platform))
    .filter((output, index, rows) => rows.findIndex((row) => row.platform === output.platform) === index)
    .slice(0, 2);
  if (variants.length < 2) {
    return null;
  }

  const reason =
    candidate.expectedOutcome.expectedOutcomeTier !== "high"
      ? candidate.expectedOutcome.expectedOutcomeReasons[0] ?? "the strongest platform expression is still unclear"
      : null;
  if (!reason) {
    return null;
  }

  const firstPlatform = variants[0].platform === "linkedin" ? "LinkedIn" : variants[0].platform === "reddit" ? "Reddit" : "X";
  const secondPlatform = variants[1].platform === "linkedin" ? "LinkedIn" : variants[1].platform === "reddit" ? "Reddit" : "X";

  return {
    score: 3,
    pack: buildProposalBase({
      candidate,
      policy,
      variable: "platform_expression_variant",
      experimentType: "platform_expression_test",
      reason: `More than one platform expression looks plausible and ${reason.toLowerCase()}.`,
      hypothesis: `Test ${firstPlatform} against ${secondPlatform} expression for the same idea to learn which platform format better advances ${candidate.hypothesis.objective.toLowerCase()}.`,
      comparisonTarget: `${firstPlatform} vs ${secondPlatform}`,
      expectedLearningGoal: "Learn which platform expression carries the same idea more effectively without changing the core package.",
      outcomeSignal: "strategic value and click intent",
      controlCandidate: {
        label: `Control: ${firstPlatform}`,
        summary: variants[0].title ?? variants[0].content.slice(0, 96),
        platform: variants[0].platform,
      },
      variantCandidate: {
        label: `Variant: ${secondPlatform}`,
        summary: variants[1].title ?? variants[1].content.slice(0, 96),
        platform: variants[1].platform,
      },
      safetyNotes: [
        "Only the platform expression changes. The underlying message should remain stable.",
        "Keep this bounded to safe public-posting contexts, not outreach or replies.",
      ],
    }),
  };
}

function buildPatternVariantPack(
  candidate: ApprovalQueueCandidate,
  policy: AutonomyPolicyDecision,
  experiments: ManualExperiment[] | undefined,
): ScoredPackage | null {
  if (hasExperimentConflict(candidate, experiments, "pattern_vs_no_pattern_test")) {
    return null;
  }

  const pattern = candidate.guidance.relatedPatterns[0];
  if (!pattern) {
    return null;
  }

  if (candidate.expectedOutcome.expectedOutcomeTier === "high" && candidate.assessment.draftQuality?.label === "Strong") {
    return null;
  }

  return {
    score: 2,
    pack: buildProposalBase({
      candidate,
      policy,
      variable: "pattern_vs_no_pattern",
      experimentType: "pattern_vs_no_pattern_test",
      reason: "Pattern support exists, but it is still unclear whether the pattern is materially improving this package.",
      hypothesis: `Test ${pattern.title.toLowerCase()} against a simpler no-pattern version to learn whether pattern support is helping or just adding structure without value.`,
      comparisonTarget: `${pattern.title} vs no pattern`,
      expectedLearningGoal: "Learn whether explicit pattern support improves clarity or outcome quality enough to keep using it.",
      outcomeSignal: "strategic value",
      controlCandidate: {
        label: `Control: ${pattern.title}`,
        summary: `Use ${pattern.title} as the framing support.`,
        platform: preferredPlatform(candidate),
      },
      variantCandidate: {
        label: "Variant: No-pattern simplification",
        summary: "Keep the same idea, but remove explicit pattern framing.",
        platform: preferredPlatform(candidate),
      },
      safetyNotes: [
        "Only pattern support changes. The message and offer should stay stable.",
      ],
    }),
  };
}

export function buildExperimentAutopilotV2(input: {
  candidate: ApprovalQueueCandidate;
  experiments?: ManualExperiment[];
}): ExperimentAutopilotV2Package {
  const { candidate } = input;
  const experimentLinked = (input.experiments ?? []).some(
    (experiment) =>
      experiment.status !== "completed" &&
      experiment.variants.some((variant) => variant.linkedSignalIds.includes(candidate.signal.recordId)),
  );
  const completenessState =
    candidate.completeness.completenessState === "complete"
      ? "complete"
      : candidate.completeness.completenessState === "mostly_complete"
        ? "mostly_complete"
        : "incomplete";
  const policy = evaluateAutonomyPolicy({
    actionType: "create_experiment_variant",
    confidenceLevel: candidate.automationConfidence.level,
    completenessState,
    hasUnresolvedConflicts: candidate.conflicts.conflicts.length > 0,
    experimentLinked,
  });

  if (policy.decision === "block") {
    return buildBaseBlock({
      candidate,
      policy,
      blockReason: policy.summary,
    });
  }

  if (candidate.automationConfidence.level !== "high") {
    return buildBaseBlock({
      candidate,
      policy,
      blockReason: "Experiment autopilot v2 only builds variants for high-confidence candidates.",
    });
  }

  if (candidate.conflicts.conflicts.length > 0) {
    return buildBaseBlock({
      candidate,
      policy,
      blockReason: "Unresolved conflicts still make this package too unstable for autopilot experiment construction.",
    });
  }

  if (
    candidate.triage.triageState === "needs_judgement" ||
    candidate.triage.triageState === "suppress"
  ) {
    return buildBaseBlock({
      candidate,
      policy,
      blockReason: `Queue triage is ${candidate.triage.triageState.replaceAll("_", " ")}, so the system should not auto-build an experiment here.`,
    });
  }

  if (
    candidate.signal.platformPriority === "Reddit First" &&
    (candidate.signal.ctaGoal === "Sign up" || candidate.signal.ctaGoal === "Try product")
  ) {
    return buildBaseBlock({
      candidate,
      policy,
      blockReason: "High-commercial Reddit tests stay operator-built rather than autopilot-constructed.",
    });
  }

  const candidates = [
    buildDestinationVariantPack(candidate, policy, input.experiments),
    buildCtaVariantPack(candidate, policy, input.experiments),
    buildHookVariantPack(candidate, policy, input.experiments),
    buildEditorialModeVariantPack(candidate, policy, input.experiments),
    buildPlatformExpressionVariantPack(candidate, policy, input.experiments),
    buildPatternVariantPack(candidate, policy, input.experiments),
  ].filter((entry): entry is ScoredPackage => Boolean(entry));

  const strongest = candidates.sort((left, right) => right.score - left.score || (left.pack.variable ?? "").localeCompare(right.pack.variable ?? ""))[0];
  if (!strongest) {
    return {
      eligible: false,
      decision: "skipped",
      policy,
      variable: null,
      experimentType: null,
      reason: null,
      blockReasons: [],
      hypothesis: null,
      stopConditions: [],
      safetyNotes: [],
      expectedLearningGoal: null,
      comparisonTarget: null,
      outcomeSignal: null,
      controlCandidate: null,
      variantCandidate: null,
    };
  }

  return strongest.pack;
}
