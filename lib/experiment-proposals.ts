import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import {
  buildExperimentAutopilotV2,
  type ExperimentAutopilotVariable,
} from "@/lib/experiment-autopilot-v2";
import {
  assignExperimentVariant,
  createExperiment,
  EXPERIMENT_TYPES,
  getExperimentTypeLabel,
  type ExperimentType,
  type ManualExperiment,
} from "@/lib/experiments";

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
  candidateVariants: z.array(experimentProposalVariantSchema).length(2),
  expectedLearningGoal: z.string().trim().min(1),
  comparisonTarget: z.string().trim().nullable().default(null),
  reviewHref: z.string().trim().min(1),
  autopilotBuilt: z.boolean().default(false),
  autopilotVersion: z.enum(["v2"]).nullable().default(null),
  autopilotVariable: z
    .enum([
      "hook_variant",
      "cta_variant",
      "destination_variant",
      "editorial_mode_variant",
      "platform_expression_variant",
      "pattern_vs_no_pattern",
    ])
    .nullable()
    .default(null),
  hypothesis: z.string().trim().nullable().default(null),
  stopConditions: z.array(z.string().trim().min(1)).max(6).default([]),
  safetyNotes: z.array(z.string().trim().min(1)).max(6).default([]),
  outcomeSignal: z.string().trim().nullable().default(null),
  controlLabel: z.string().trim().nullable().default(null),
  variantLabel: z.string().trim().nullable().default(null),
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
  autopilotBuiltCount: number;
  acceptedAutopilotCount: number;
  byType: Array<{ experimentType: ExperimentType; label: string; count: number }>;
  byVariable: Array<{ variable: ExperimentAutopilotVariable; label: string; count: number }>;
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

function buildProposalId(
  signalId: string,
  experimentType: ExperimentType,
  variable: ExperimentAutopilotVariable,
  comparisonTarget: string | null,
): string {
  return [signalId, experimentType, variable, slugify(comparisonTarget ?? "default")].join(":");
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

function buildAutopilotProposal(
  candidate: ApprovalQueueCandidate,
  experiments: ManualExperiment[] | undefined,
): { proposal: ExperimentProposal; score: number } | null {
  const autopilot = buildExperimentAutopilotV2({
    candidate,
    experiments,
  });
  if (autopilot.decision !== "created" || !autopilot.variable || !autopilot.experimentType || !autopilot.controlCandidate || !autopilot.variantCandidate) {
    return null;
  }

  const proposalId = buildProposalId(
    candidate.signal.recordId,
    autopilot.experimentType,
    autopilot.variable,
    autopilot.comparisonTarget,
  );

  const proposal = buildOpenProposal({
    proposalId,
    signalId: candidate.signal.recordId,
    sourceTitle: candidate.signal.sourceTitle,
    experimentType: autopilot.experimentType,
    whyProposed: autopilot.reason ?? "A bounded one-variable experiment is justified here.",
    candidateVariants: [
      buildProposalVariant(
        proposalId,
        candidate.signal.recordId,
        autopilot.controlCandidate.label,
        autopilot.controlCandidate.summary,
        autopilot.controlCandidate.platform,
      ),
      buildProposalVariant(
        proposalId,
        candidate.signal.recordId,
        autopilot.variantCandidate.label,
        autopilot.variantCandidate.summary,
        autopilot.variantCandidate.platform,
      ),
    ],
    expectedLearningGoal: autopilot.expectedLearningGoal ?? "Learn which bounded variant is stronger.",
    comparisonTarget: autopilot.comparisonTarget,
    reviewHref: `/signals/${candidate.signal.recordId}/review`,
    autopilotBuilt: true,
    autopilotVersion: "v2",
    autopilotVariable: autopilot.variable,
    hypothesis: autopilot.hypothesis,
    stopConditions: autopilot.stopConditions,
    safetyNotes: autopilot.safetyNotes,
    outcomeSignal: autopilot.outcomeSignal,
    controlLabel: autopilot.controlCandidate.label,
    variantLabel: autopilot.variantCandidate.label,
  });

  const scoreBase = {
    destination_variant: 9,
    cta_variant: 8,
    hook_variant: 6,
    editorial_mode_variant: 4,
    platform_expression_variant: 3,
    pattern_vs_no_pattern: 2,
  } satisfies Record<ExperimentAutopilotVariable, number>;

  return {
    proposal,
    score: scoreBase[autopilot.variable],
  };
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
    hypothesis: (proposal.hypothesis ?? proposal.whyProposed).slice(0, 280),
    status: "active",
    experimentType: proposal.experimentType,
    learningGoal: proposal.expectedLearningGoal,
    comparisonTarget: proposal.comparisonTarget ?? undefined,
    source: "system_proposal",
    proposalId: proposal.proposalId,
    variantLabel: firstVariant.variantLabel,
    signalId: proposal.signalId,
    autopilotBuilt: proposal.autopilotBuilt,
    autopilotVersion: proposal.autopilotVersion ?? undefined,
    autopilotVariable: proposal.autopilotVariable ?? undefined,
    stopConditions: proposal.stopConditions,
    safetyNotes: proposal.safetyNotes,
    controlSummary: proposal.candidateVariants[0]?.summary,
    variantSummary: proposal.candidateVariants[1]?.summary,
    outcomeSignal: proposal.outcomeSignal ?? undefined,
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

export function buildAutonomousExperimentProposals(input: {
  candidates: ApprovalQueueCandidate[];
  experiments: ManualExperiment[];
  storedProposals?: ExperimentProposal[];
  maxProposals?: number;
}): ExperimentProposal[] {
  const storedById = new Map((input.storedProposals ?? []).map((proposal) => [proposal.proposalId, proposal]));
  const scoredProposals: Array<{ proposal: ExperimentProposal; score: number }> = [];

  for (const candidate of input.candidates) {
    const proposal = buildAutopilotProposal(candidate, input.experiments);
    if (!proposal) {
      continue;
    }

    scoredProposals.push({
      proposal: mergeWithStoredProposal(proposal.proposal, storedById.get(proposal.proposal.proposalId)),
      score: proposal.score,
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

function variableLabel(value: ExperimentAutopilotVariable): string {
  return value.replaceAll("_", " ");
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
  const byVariable = Array.from(
    openProposals.reduce((map, proposal) => {
      if (!proposal.autopilotVariable) {
        return map;
      }
      map.set(proposal.autopilotVariable, (map.get(proposal.autopilotVariable) ?? 0) + 1);
      return map;
    }, new Map<ExperimentAutopilotVariable, number>()),
  )
    .map(([variable, count]) => ({
      variable,
      label: variableLabel(variable),
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  const summaries: string[] = [];
  if (openProposals[0]) {
    summaries.push(openProposals[0].whyProposed);
  }
  if (openProposals[0]?.hypothesis && summaries.length < 3) {
    summaries.push(openProposals[0].hypothesis);
  }
  if (byVariable[0] && summaries.length < 3) {
    summaries.push(`${byVariable[0].label} is the most common autopilot-built variable right now.`);
  }

  return {
    openCount: openProposals.length,
    confirmedCount: proposals.filter((proposal) => proposal.status === "confirmed").length,
    postponedCount: proposals.filter((proposal) => proposal.status === "postponed").length,
    dismissedCount: proposals.filter((proposal) => proposal.status === "dismissed").length,
    autopilotBuiltCount: proposals.filter((proposal) => proposal.autopilotBuilt).length,
    acceptedAutopilotCount: proposals.filter((proposal) => proposal.autopilotBuilt && proposal.status === "confirmed").length,
    byType,
    byVariable,
    openProposals: openProposals.slice(0, 4),
    summaries: summaries.slice(0, 3),
  };
}

