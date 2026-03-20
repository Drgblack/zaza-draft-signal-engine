import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import {
  assignExperimentVariant,
  createExperiment,
  EXPERIMENT_TYPES,
  getExperimentTypeLabel,
  listExperimentsForSignal,
  type ExperimentType,
  type ManualExperiment,
} from "@/lib/experiments";
import { buildSignalPublishPrepBundle } from "@/lib/publish-prep";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import { buildSignalRepurposingBundle } from "@/lib/repurposing";
import type { EditorialMode } from "@/types/signal";

const EXPERIMENT_PROPOSAL_STORE_PATH = path.join(process.cwd(), "data", "experiment-proposals.json");

export const EXPERIMENT_PROPOSAL_STATUSES = ["open", "dismissed", "postponed", "confirmed"] as const;

export type ExperimentProposalStatus = (typeof EXPERIMENT_PROPOSAL_STATUSES)[number];

export const experimentProposalStatusSchema = z.enum(EXPERIMENT_PROPOSAL_STATUSES);

export const experimentProposalVariantSchema = z.object({
  variantId: z.string().trim().min(1),
  variantLabel: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  linkedSignalIds: z.array(z.string().trim().min(1)).max(12).default([]),
  platform: z.enum(["x", "linkedin", "reddit"]).nullable().default(null),
});

export const experimentProposalSchema = z.object({
  proposalId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  experimentType: z.enum(EXPERIMENT_TYPES),
  whyProposed: z.string().trim().min(1),
  candidateVariants: z.array(experimentProposalVariantSchema).min(2).max(4),
  expectedLearningGoal: z.string().trim().min(1),
  comparisonTarget: z.string().trim().nullable().default(null),
  reviewHref: z.string().trim().min(1),
  status: experimentProposalStatusSchema.default("open"),
  confirmedExperimentId: z.string().trim().nullable().default(null),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

export const experimentProposalActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm_proposal"),
    proposal: experimentProposalSchema,
  }),
  z.object({
    action: z.literal("dismiss_proposal"),
    proposal: experimentProposalSchema,
  }),
  z.object({
    action: z.literal("postpone_proposal"),
    proposal: experimentProposalSchema,
  }),
]);

const experimentProposalStoreSchema = z.object({
  proposals: z.array(experimentProposalSchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export type ExperimentProposal = z.infer<typeof experimentProposalSchema>;
export type ExperimentProposalVariant = z.infer<typeof experimentProposalVariantSchema>;
export type ExperimentProposalActionRequest = z.infer<typeof experimentProposalActionRequestSchema>;

export interface ExperimentProposalInsights {
  openCount: number;
  confirmedCount: number;
  postponedCount: number;
  dismissedCount: number;
  byType: Array<{ experimentType: ExperimentType; label: string; count: number }>;
  openProposals: ExperimentProposal[];
  summaries: string[];
}

function sortProposals(proposals: ExperimentProposal[]): ExperimentProposal[] {
  return [...proposals].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
      left.sourceTitle.localeCompare(right.sourceTitle),
  );
}

function buildEmptyStore() {
  return experimentProposalStoreSchema.parse({
    proposals: [],
    updatedAt: null,
  });
}

async function readPersistedProposalStore() {
  try {
    const raw = await readFile(EXPERIMENT_PROPOSAL_STORE_PATH, "utf8");
    return experimentProposalStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return buildEmptyStore();
    }

    throw error;
  }
}

async function writeProposalStore(store: z.infer<typeof experimentProposalStoreSchema>): Promise<void> {
  await mkdir(path.dirname(EXPERIMENT_PROPOSAL_STORE_PATH), { recursive: true });
  await writeFile(EXPERIMENT_PROPOSAL_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function preferredSocialPlatform(candidate: ApprovalQueueCandidate): "x" | "linkedin" | "reddit" {
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

function pickPrimaryDraftPackage(candidate: ApprovalQueueCandidate) {
  const preferredPlatform = preferredSocialPlatform(candidate);
  const bundle = buildSignalPublishPrepBundle(candidate.signal);
  return (
    bundle?.packages.find(
      (pkg) => pkg.outputKind === "primary_draft" && pkg.platform === preferredPlatform,
    ) ??
    bundle?.packages.find(
      (pkg) => pkg.outputKind === "primary_draft" && (pkg.platform === "x" || pkg.platform === "linkedin" || pkg.platform === "reddit"),
    ) ??
    null
  );
}

function getSuggestedComparisonMode(currentMode: EditorialMode): EditorialMode {
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
    default:
      return "risk_warning";
  }
}

function hasExperimentConflict(
  candidate: ApprovalQueueCandidate,
  experiments: ManualExperiment[],
  experimentType: ExperimentType,
): boolean {
  return listExperimentsForSignal(experiments, candidate.signal.recordId, [])
    .some((experiment) => experiment.experimentType === experimentType && experiment.status !== "completed");
}

function buildProposalId(signalId: string, experimentType: ExperimentType, comparisonTarget: string | null): string {
  return [signalId, experimentType, slugify(comparisonTarget ?? "default")].join(":");
}

function buildProposalVariant(
  proposalId: string,
  signalId: string,
  variantLabel: string,
  summary: string,
  platform: "x" | "linkedin" | "reddit" | null = null,
): ExperimentProposalVariant {
  return experimentProposalVariantSchema.parse({
    variantId: `${proposalId}:${slugify(variantLabel) || "variant"}`,
    variantLabel,
    summary,
    linkedSignalIds: [signalId],
    platform,
  });
}

function buildOpenProposal(input: Omit<ExperimentProposal, "status" | "confirmedExperimentId" | "createdAt" | "updatedAt">): ExperimentProposal {
  const timestamp = new Date().toISOString();
  return experimentProposalSchema.parse({
    ...input,
    status: "open",
    confirmedExperimentId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function mergeWithStoredProposal(proposal: ExperimentProposal, storedProposal: ExperimentProposal | undefined): ExperimentProposal {
  if (!storedProposal) {
    return proposal;
  }

  return experimentProposalSchema.parse({
    ...proposal,
    status: storedProposal.status,
    confirmedExperimentId: storedProposal.confirmedExperimentId,
    createdAt: storedProposal.createdAt,
    updatedAt: storedProposal.updatedAt,
  });
}

export async function listExperimentProposals(): Promise<ExperimentProposal[]> {
  const store = await readPersistedProposalStore();
  return sortProposals(store.proposals);
}

export async function updateExperimentProposalStatus(input: {
  proposal: ExperimentProposal;
  status: ExperimentProposalStatus;
  confirmedExperimentId?: string | null;
}): Promise<ExperimentProposal> {
  const store = await readPersistedProposalStore();
  const timestamp = new Date().toISOString();
  const nextProposal = experimentProposalSchema.parse({
    ...input.proposal,
    status: input.status,
    confirmedExperimentId: input.confirmedExperimentId ?? input.proposal.confirmedExperimentId ?? null,
    updatedAt: timestamp,
    createdAt: input.proposal.createdAt,
  });
  const nextStore = experimentProposalStoreSchema.parse({
    proposals: sortProposals([
      nextProposal,
      ...store.proposals.filter((proposal) => proposal.proposalId !== nextProposal.proposalId),
    ]),
    updatedAt: timestamp,
  });

  await writeProposalStore(nextStore);
  return nextProposal;
}

export async function confirmExperimentProposal(
  proposal: ExperimentProposal,
): Promise<{ proposal: ExperimentProposal; experiment: ManualExperiment }> {
  const firstVariant = proposal.candidateVariants[0];
  const experiment = await createExperiment({
    name: `${proposal.sourceTitle} · ${getExperimentTypeLabel(proposal.experimentType)}`.slice(0, 120),
    hypothesis: proposal.whyProposed.slice(0, 280),
    status: "active",
    experimentType: proposal.experimentType,
    learningGoal: proposal.expectedLearningGoal,
    comparisonTarget: proposal.comparisonTarget ?? undefined,
    source: "system_proposal",
    proposalId: proposal.proposalId,
    variantLabel: firstVariant.variantLabel,
    signalId: proposal.signalId,
  });

  for (const variant of proposal.candidateVariants.slice(1)) {
    await assignExperimentVariant({
      experimentId: experiment.experimentId,
      variantLabel: variant.variantLabel,
      signalId: proposal.signalId,
    });
  }

  const persistedProposal = await updateExperimentProposalStatus({
    proposal,
    status: "confirmed",
    confirmedExperimentId: experiment.experimentId,
  });

  return {
    proposal: persistedProposal,
    experiment,
  };
}

function buildHookVariantProposal(
  candidate: ApprovalQueueCandidate,
): { proposal: ExperimentProposal; score: number } | null {
  if (!candidate.automationConfidence.allowExperimentProposal) {
    return null;
  }

  const pkg = pickPrimaryDraftPackage(candidate);
  if (!pkg || pkg.hookVariants.length < 2) {
    return null;
  }

  const variants = pkg.hookVariants.slice(0, 2);
  const comparisonTarget = `${variants[0].styleLabel} vs ${variants[1].styleLabel}`;
  const whyProposedReasons: string[] = [];

  if (candidate.automationConfidence.level === "medium") {
    uniquePush(whyProposedReasons, "automation confidence is still medium");
  }
  if (candidate.hypothesis.riskNote) {
    uniquePush(whyProposedReasons, candidate.hypothesis.riskNote);
  }
  if (candidate.fatigue.warnings[0]) {
    uniquePush(whyProposedReasons, candidate.fatigue.warnings[0].summary);
  }
  if (candidate.expectedOutcome.expectedOutcomeTier !== "high") {
    uniquePush(whyProposedReasons, candidate.expectedOutcome.expectedOutcomeReasons[0]);
  }

  if (whyProposedReasons.length === 0) {
    return null;
  }

  const proposalId = buildProposalId(candidate.signal.recordId, "hook_variant_test", comparisonTarget);
  return {
    proposal: buildOpenProposal({
      proposalId,
      signalId: candidate.signal.recordId,
      sourceTitle: candidate.signal.sourceTitle,
      experimentType: "hook_variant_test",
      whyProposed: `Two strong hook shapes are available and ${whyProposedReasons[0]}.`,
      candidateVariants: variants.map((variant) =>
        buildProposalVariant(
          proposalId,
          candidate.signal.recordId,
          variant.styleLabel,
          variant.text,
          pkg.platform === "x" || pkg.platform === "linkedin" || pkg.platform === "reddit" ? pkg.platform : null,
        ),
      ),
      expectedLearningGoal: `Learn which opening shape better supports ${candidate.hypothesis.objective.toLowerCase()} on ${getPostingPlatformLabel(preferredSocialPlatform(candidate))}.`,
      comparisonTarget,
      reviewHref: `/signals/${candidate.signal.recordId}/review`,
    }),
    score: 6,
  };
}

function buildCtaVariantProposal(
  candidate: ApprovalQueueCandidate,
): { proposal: ExperimentProposal; score: number } | null {
  if (!candidate.automationConfidence.allowExperimentProposal) {
    return null;
  }

  const pkg = pickPrimaryDraftPackage(candidate);
  if (!pkg || pkg.ctaVariants.length < 2) {
    return null;
  }

  const variants = pkg.ctaVariants.slice(0, 2);
  const comparisonTarget = `${variants[0].goalLabel} vs ${variants[1].goalLabel}`;
  const whyProposed =
    candidate.expectedOutcome.riskSignals.find((signal) => signal.toLowerCase().includes("destination")) ??
    candidate.expectedOutcome.riskSignals.find((signal) => signal.toLowerCase().includes("cta")) ??
    (candidate.automationConfidence.level === "medium" ? "the call to action still looks debatable" : null);

  if (!whyProposed) {
    return null;
  }

  const proposalId = buildProposalId(candidate.signal.recordId, "cta_variant_test", comparisonTarget);
  return {
    proposal: buildOpenProposal({
      proposalId,
      signalId: candidate.signal.recordId,
      sourceTitle: candidate.signal.sourceTitle,
      experimentType: "cta_variant_test",
      whyProposed: `Two plausible CTA directions are available and ${whyProposed}.`,
      candidateVariants: variants.map((variant) =>
        buildProposalVariant(
          proposalId,
          candidate.signal.recordId,
          variant.goalLabel,
          variant.text,
          pkg.platform === "x" || pkg.platform === "linkedin" || pkg.platform === "reddit" ? pkg.platform : null,
        ),
      ),
      expectedLearningGoal: `Learn which CTA style produces stronger ${candidate.signal.ctaGoal?.toLowerCase() ?? "response"} without weakening platform fit.`,
      comparisonTarget,
      reviewHref: `/signals/${candidate.signal.recordId}/review`,
    }),
    score: 5,
  };
}

function buildDestinationProposal(
  candidate: ApprovalQueueCandidate,
): { proposal: ExperimentProposal; score: number } | null {
  if (!candidate.automationConfidence.allowExperimentProposal) {
    return null;
  }

  const pkg = pickPrimaryDraftPackage(candidate);
  const variants = pkg
    ?.linkVariants.filter(
      (variant, index, allVariants) =>
        allVariants.findIndex((entry) => `${entry.label}|${entry.url}` === `${variant.label}|${variant.url}`) === index,
    )
    .slice(0, 2);
  if (!pkg || !variants || variants.length < 2) {
    return null;
  }

  const destinationRisk =
    candidate.expectedOutcome.riskSignals.find((signal) => signal.toLowerCase().includes("destination")) ??
    candidate.expectedOutcome.riskSignals.find((signal) => signal.toLowerCase().includes("misaligned"));
  if (!destinationRisk && candidate.expectedOutcome.expectedOutcomeTier === "high") {
    return null;
  }

  const comparisonTarget = `${variants[0].destinationLabel ?? variants[0].label} vs ${variants[1].destinationLabel ?? variants[1].label}`;
  const proposalId = buildProposalId(candidate.signal.recordId, "destination_test", comparisonTarget);
  return {
    proposal: buildOpenProposal({
      proposalId,
      signalId: candidate.signal.recordId,
      sourceTitle: candidate.signal.sourceTitle,
      experimentType: "destination_test",
      whyProposed: `Two destination paths look plausible and ${destinationRisk ?? "the stronger commercial route is still uncertain"}.`,
      candidateVariants: variants.map((variant) =>
        buildProposalVariant(
          proposalId,
          candidate.signal.recordId,
          variant.destinationLabel ?? variant.label,
          variant.url,
          pkg.platform === "x" || pkg.platform === "linkedin" || pkg.platform === "reddit" ? pkg.platform : null,
        ),
      ),
      expectedLearningGoal: `Learn which destination best supports ${candidate.signal.ctaGoal?.toLowerCase() ?? "the intended CTA"} for this candidate.`,
      comparisonTarget,
      reviewHref: `/signals/${candidate.signal.recordId}/review`,
    }),
    score: 7,
  };
}

function buildPlatformExpressionProposal(
  candidate: ApprovalQueueCandidate,
): { proposal: ExperimentProposal; score: number } | null {
  if (!candidate.automationConfidence.allowExperimentProposal) {
    return null;
  }

  const outputs = buildSignalRepurposingBundle(candidate.signal)?.outputs ?? [];
  const platformVariants = outputs
    .filter((output): output is typeof output & { platform: "x" | "linkedin" | "reddit" } => isSocialPlatform(output.platform))
    .filter(
      (output, index, allOutputs) =>
        allOutputs.findIndex((entry) => entry.platform === output.platform) === index,
    )
    .slice(0, 2);
  if (platformVariants.length < 2) {
    return null;
  }

  const comparisonTarget = `${getPostingPlatformLabel(platformVariants[0].platform)} vs ${getPostingPlatformLabel(platformVariants[1].platform)}`;
  const proposalId = buildProposalId(candidate.signal.recordId, "platform_expression_test", comparisonTarget);
  return {
    proposal: buildOpenProposal({
      proposalId,
      signalId: candidate.signal.recordId,
      sourceTitle: candidate.signal.sourceTitle,
      experimentType: "platform_expression_test",
      whyProposed: `More than one platform expression looks viable and the strongest expression path is not obvious yet.`,
      candidateVariants: platformVariants.map((variant) =>
        buildProposalVariant(
          proposalId,
          candidate.signal.recordId,
          getPostingPlatformLabel(variant.platform),
          variant.title ?? variant.content.slice(0, 96),
          variant.platform,
        ),
      ),
      expectedLearningGoal: `Learn which platform expression best advances ${candidate.hypothesis.objective.toLowerCase()} without diluting the idea.`,
      comparisonTarget,
      reviewHref: `/signals/${candidate.signal.recordId}/review`,
    }),
    score: 4,
  };
}

function buildEditorialModeProposal(
  candidate: ApprovalQueueCandidate,
): { proposal: ExperimentProposal; score: number } | null {
  if (!candidate.automationConfidence.allowExperimentProposal) {
    return null;
  }

  if (!candidate.signal.editorialMode) {
    return null;
  }

  const hasModeFatigue = candidate.fatigue.warnings.some((warning) => warning.dimension === "editorial_mode");
  if (!hasModeFatigue && !candidate.hypothesis.riskNote && candidate.expectedOutcome.expectedOutcomeTier === "high") {
    return null;
  }

  const comparisonMode = getSuggestedComparisonMode(candidate.signal.editorialMode);
  const currentLabel = getEditorialModeDefinition(candidate.signal.editorialMode).label;
  const comparisonLabel = getEditorialModeDefinition(comparisonMode).label;
  const comparisonTarget = `${currentLabel} vs ${comparisonLabel}`;
  const proposalId = buildProposalId(candidate.signal.recordId, "editorial_mode_test", comparisonTarget);
  return {
    proposal: buildOpenProposal({
      proposalId,
      signalId: candidate.signal.recordId,
      sourceTitle: candidate.signal.sourceTitle,
      experimentType: "editorial_mode_test",
      whyProposed: `The current mode is useful, but ${hasModeFatigue ? "recent mode fatigue is visible" : "the framing still carries some uncertainty"}.`,
      candidateVariants: [
        buildProposalVariant(proposalId, candidate.signal.recordId, currentLabel, "Keep the current editorial mode framing."),
        buildProposalVariant(proposalId, candidate.signal.recordId, comparisonLabel, "Test a bounded alternate editorial mode framing."),
      ],
      expectedLearningGoal: `Learn whether ${comparisonLabel.toLowerCase()} or ${currentLabel.toLowerCase()} is the stronger wrapper for this idea.`,
      comparisonTarget,
      reviewHref: `/signals/${candidate.signal.recordId}/review`,
    }),
    score: hasModeFatigue ? 6 : 3,
  };
}

function buildPatternProposal(
  candidate: ApprovalQueueCandidate,
): { proposal: ExperimentProposal; score: number } | null {
  if (!candidate.automationConfidence.allowExperimentProposal) {
    return null;
  }

  const pattern = candidate.guidance.relatedPatterns[0];
  if (!pattern) {
    return null;
  }

  if (candidate.assessment.draftQuality?.label === "Strong" && candidate.expectedOutcome.expectedOutcomeTier === "high") {
    return null;
  }

  const comparisonTarget = `${pattern.title} vs no pattern`;
  const proposalId = buildProposalId(candidate.signal.recordId, "pattern_vs_no_pattern_test", comparisonTarget);
  return {
    proposal: buildOpenProposal({
      proposalId,
      signalId: candidate.signal.recordId,
      sourceTitle: candidate.signal.sourceTitle,
      experimentType: "pattern_vs_no_pattern_test",
      whyProposed: `Pattern support exists, but the system still cannot tell whether the pattern is helping enough to keep.`,
      candidateVariants: [
        buildProposalVariant(proposalId, candidate.signal.recordId, "Pattern-guided", `Use ${pattern.title} as the framing support.`),
        buildProposalVariant(proposalId, candidate.signal.recordId, "No-pattern simplification", "Test the same idea without explicit pattern framing."),
      ],
      expectedLearningGoal: `Learn whether pattern support materially improves clarity or outcome quality for this candidate.`,
      comparisonTarget,
      reviewHref: `/signals/${candidate.signal.recordId}/review`,
    }),
    score: 4,
  };
}

export function buildAutonomousExperimentProposals(input: {
  candidates: ApprovalQueueCandidate[];
  experiments: ManualExperiment[];
  storedProposals?: ExperimentProposal[];
  maxProposals?: number;
}): ExperimentProposal[] {
  const storedById = new Map((input.storedProposals ?? []).map((proposal) => [proposal.proposalId, proposal]));
  const scoredProposals: Array<{ proposal: ExperimentProposal; score: number }> = [];

  for (const candidate of input.candidates) {
    const proposals = [
      buildDestinationProposal(candidate),
      buildHookVariantProposal(candidate),
      buildCtaVariantProposal(candidate),
      buildEditorialModeProposal(candidate),
      buildPlatformExpressionProposal(candidate),
      buildPatternProposal(candidate),
    ]
      .filter((proposal): proposal is { proposal: ExperimentProposal; score: number } => Boolean(proposal))
      .filter(({ proposal }) => !hasExperimentConflict(candidate, input.experiments, proposal.experimentType));

    const strongest = proposals.sort((left, right) => right.score - left.score || left.proposal.proposalId.localeCompare(right.proposal.proposalId))[0];
    if (!strongest) {
      continue;
    }

    scoredProposals.push({
      proposal: mergeWithStoredProposal(strongest.proposal, storedById.get(strongest.proposal.proposalId)),
      score: strongest.score,
    });
  }

  return scoredProposals
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.proposal.sourceTitle.localeCompare(right.proposal.sourceTitle),
    )
    .slice(0, input.maxProposals ?? 6)
    .map((entry) => entry.proposal);
}

export function buildExperimentProposalInsights(proposals: ExperimentProposal[]): ExperimentProposalInsights {
  const openProposals = proposals.filter((proposal) => proposal.status === "open");
  const byType = Array.from(
    openProposals.reduce((map, proposal) => {
      map.set(proposal.experimentType, (map.get(proposal.experimentType) ?? 0) + 1);
      return map;
    }, new Map<ExperimentType, number>()),
  )
    .map(([experimentType, count]) => ({
      experimentType,
      label: getExperimentTypeLabel(experimentType),
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  const summaries: string[] = [];
  if (openProposals[0]) {
    summaries.push(openProposals[0].whyProposed);
  }
  if (openProposals[1] && summaries.length < 3) {
    summaries.push(openProposals[1].expectedLearningGoal);
  }
  if (byType[0] && summaries.length < 3) {
    summaries.push(`${byType[0].label} is the most common open proposal type right now.`);
  }

  return {
    openCount: openProposals.length,
    confirmedCount: proposals.filter((proposal) => proposal.status === "confirmed").length,
    postponedCount: proposals.filter((proposal) => proposal.status === "postponed").length,
    dismissedCount: proposals.filter((proposal) => proposal.status === "dismissed").length,
    byType,
    openProposals: openProposals.slice(0, 4),
    summaries: summaries.slice(0, 3),
  };
}
