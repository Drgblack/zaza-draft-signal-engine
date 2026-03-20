import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { PostingOutcome } from "@/lib/outcome-memory";
import type { PostingLogEntry } from "@/lib/posting-memory";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";

export const EXPERIMENT_STATUSES = ["draft", "active", "completed"] as const;
export const EXPERIMENT_TYPES = [
  "hook_variant_test",
  "cta_variant_test",
  "destination_test",
  "editorial_mode_test",
  "platform_expression_test",
  "pattern_vs_no_pattern_test",
] as const;
export const EXPERIMENT_SOURCES = ["operator", "system_proposal"] as const;

export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];
export type ExperimentType = (typeof EXPERIMENT_TYPES)[number];
export type ExperimentSource = (typeof EXPERIMENT_SOURCES)[number];

export const experimentStatusSchema = z.enum(EXPERIMENT_STATUSES);
export const experimentTypeSchema = z.enum(EXPERIMENT_TYPES);
export const experimentSourceSchema = z.enum(EXPERIMENT_SOURCES);

export const experimentVariantSchema = z.object({
  variantId: z.string().trim().min(1),
  variantLabel: z.string().trim().min(1),
  linkedSignalIds: z.array(z.string().trim().min(1)).max(24).default([]),
  linkedPostingIds: z.array(z.string().trim().min(1)).max(24).default([]),
  linkedWeekStartDates: z.array(z.string().trim().min(1)).max(12).default([]),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

export const experimentSchema = z.object({
  experimentId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  status: experimentStatusSchema,
  experimentType: experimentTypeSchema.nullable().default(null),
  learningGoal: z.string().trim().nullable().default(null),
  comparisonTarget: z.string().trim().nullable().default(null),
  source: experimentSourceSchema.default("operator"),
  proposalId: z.string().trim().nullable().default(null),
  variants: z.array(experimentVariantSchema).max(12).default([]),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  closedAt: z.string().trim().nullable().default(null),
});

const experimentStoreSchema = z.object({
  experiments: z.array(experimentSchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export const experimentCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  hypothesis: z.string().trim().min(1).max(280),
  status: experimentStatusSchema.default("active"),
  experimentType: experimentTypeSchema.optional(),
  learningGoal: z.string().trim().min(1).max(240).optional(),
  comparisonTarget: z.string().trim().min(1).max(160).optional(),
  source: experimentSourceSchema.default("operator"),
  proposalId: z.string().trim().min(1).max(160).optional(),
  variantLabel: z.string().trim().min(1).max(80).optional(),
  signalId: z.string().trim().min(1).optional(),
  postingId: z.string().trim().min(1).optional(),
  weekStartDate: z.string().trim().min(1).optional(),
});

export const experimentAssignVariantRequestSchema = z
  .object({
    experimentId: z.string().trim().min(1),
    variantLabel: z.string().trim().min(1).max(80),
    signalId: z.string().trim().min(1).optional(),
    postingId: z.string().trim().min(1).optional(),
    weekStartDate: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) => Boolean(value.signalId || value.postingId || value.weekStartDate),
    "Assign at least one signal, posting, or weekly set.",
  );

export const experimentCloseRequestSchema = z.object({
  experimentId: z.string().trim().min(1),
});

export const experimentActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    data: experimentCreateRequestSchema,
  }),
  z.object({
    action: z.literal("assign_variant"),
    data: experimentAssignVariantRequestSchema,
  }),
  z.object({
    action: z.literal("close"),
    data: experimentCloseRequestSchema,
  }),
]);

const EXPERIMENT_STORE_PATH = path.join(process.cwd(), "data", "experiments.json");

export type ExperimentVariant = z.infer<typeof experimentVariantSchema>;
export type ManualExperiment = z.infer<typeof experimentSchema>;

export interface ExperimentVariantOutcomeSummary {
  variantId: string;
  variantLabel: string;
  linkedSignalIds: string[];
  linkedPostingIds: string[];
  linkedWeekStartDates: string[];
  postingCount: number;
  strongQualityCount: number;
  acceptableQualityCount: number;
  weakQualityCount: number;
  highValueCount: number;
  mediumValueCount: number;
  lowValueCount: number;
  unclearValueCount: number;
  clickTotal: number;
  leadTotal: number;
  latestPostedAt: string | null;
}

export interface ExperimentOutcomeSummary {
  experimentId: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  experimentType: ExperimentType | null;
  learningGoal: string | null;
  comparisonTarget: string | null;
  source: ExperimentSource;
  proposalId: string | null;
  variantCount: number;
  totalPostingCount: number;
  highValueCount: number;
  mediumValueCount: number;
  lowValueCount: number;
  clickTotal: number;
  leadTotal: number;
  comparisonSummary: string | null;
  variants: ExperimentVariantOutcomeSummary[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface ExperimentInsights {
  activeCount: number;
  draftCount: number;
  completedCount: number;
  systemProposedCount: number;
  byType: Array<{ experimentType: ExperimentType; label: string; count: number }>;
  allExperiments: ExperimentOutcomeSummary[];
  activeExperiments: ExperimentOutcomeSummary[];
  completedExperiments: ExperimentOutcomeSummary[];
  summaries: string[];
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeOptionalText(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function sortExperiments(experiments: ManualExperiment[]): ManualExperiment[] {
  return [...experiments].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
      left.name.localeCompare(right.name),
  );
}

function buildEmptyStore() {
  return experimentStoreSchema.parse({
    experiments: [],
    updatedAt: null,
  });
}

async function readPersistedExperimentStore() {
  try {
    const raw = await readFile(EXPERIMENT_STORE_PATH, "utf8");
    return experimentStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return buildEmptyStore();
    }

    throw error;
  }
}

async function writeExperimentStore(store: z.infer<typeof experimentStoreSchema>): Promise<void> {
  await mkdir(path.dirname(EXPERIMENT_STORE_PATH), { recursive: true });
  await writeFile(EXPERIMENT_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildExperimentVariant(input: {
  variantLabel: string;
  signalId?: string | null;
  postingId?: string | null;
  weekStartDate?: string | null;
}): ExperimentVariant {
  const timestamp = new Date().toISOString();

  return experimentVariantSchema.parse({
    variantId: crypto.randomUUID(),
    variantLabel: input.variantLabel.trim(),
    linkedSignalIds: uniqueSorted([input.signalId]),
    linkedPostingIds: uniqueSorted([input.postingId]),
    linkedWeekStartDates: uniqueSorted([input.weekStartDate]),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function findExperiment(experiments: ManualExperiment[], experimentId: string): ManualExperiment | null {
  return experiments.find((experiment) => experiment.experimentId === experimentId) ?? null;
}

export async function listExperiments(): Promise<ManualExperiment[]> {
  const store = await readPersistedExperimentStore();
  return sortExperiments(store.experiments);
}

export async function createExperiment(input: z.infer<typeof experimentCreateRequestSchema>): Promise<ManualExperiment> {
  const store = await readPersistedExperimentStore();
  const timestamp = new Date().toISOString();
  const variants =
    input.variantLabel || input.signalId || input.postingId || input.weekStartDate
      ? [
          buildExperimentVariant({
            variantLabel: input.variantLabel ?? "Variant A",
            signalId: input.signalId,
            postingId: input.postingId,
            weekStartDate: input.weekStartDate,
          }),
        ]
      : [];
  const experiment = experimentSchema.parse({
    experimentId: crypto.randomUUID(),
    name: input.name.trim(),
    hypothesis: input.hypothesis.trim(),
    status: input.status,
    experimentType: input.experimentType ?? null,
    learningGoal: input.learningGoal?.trim() ?? null,
    comparisonTarget: input.comparisonTarget?.trim() ?? null,
    source: input.source,
    proposalId: input.proposalId?.trim() ?? null,
    variants,
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: input.status === "completed" ? timestamp : null,
  });
  const nextStore = experimentStoreSchema.parse({
    experiments: sortExperiments([experiment, ...store.experiments]),
    updatedAt: timestamp,
  });

  await writeExperimentStore(nextStore);
  return experiment;
}

export async function assignExperimentVariant(
  input: z.infer<typeof experimentAssignVariantRequestSchema>,
): Promise<ManualExperiment> {
  const store = await readPersistedExperimentStore();
  const existing = findExperiment(store.experiments, input.experimentId);

  if (!existing) {
    throw new Error("Experiment not found.");
  }

  const timestamp = new Date().toISOString();
  const normalizedLabel = input.variantLabel.trim().toLowerCase();
  let variantFound = false;

  const nextExperiment = experimentSchema.parse({
    ...existing,
    status: existing.status === "draft" ? "active" : existing.status,
    updatedAt: timestamp,
    variants: existing.variants.map((variant) => {
      if (variant.variantLabel.trim().toLowerCase() !== normalizedLabel) {
        return variant;
      }

      variantFound = true;
      return experimentVariantSchema.parse({
        ...variant,
        linkedSignalIds: uniqueSorted([...variant.linkedSignalIds, input.signalId]),
        linkedPostingIds: uniqueSorted([...variant.linkedPostingIds, input.postingId]),
        linkedWeekStartDates: uniqueSorted([...variant.linkedWeekStartDates, input.weekStartDate]),
        updatedAt: timestamp,
      });
    }),
  });

  const experimentToStore = !variantFound
    ? experimentSchema.parse({
        ...nextExperiment,
        variants: [
          ...nextExperiment.variants,
          buildExperimentVariant({
            variantLabel: input.variantLabel,
            signalId: input.signalId,
            postingId: input.postingId,
            weekStartDate: input.weekStartDate,
          }),
        ],
      })
    : nextExperiment;

  const nextStore = experimentStoreSchema.parse({
    experiments: sortExperiments(
      store.experiments.map((experiment) =>
        experiment.experimentId === experimentToStore.experimentId ? experimentToStore : experiment,
      ),
    ),
    updatedAt: timestamp,
  });

  await writeExperimentStore(nextStore);
  return experimentToStore;
}

export async function closeExperiment(experimentId: string): Promise<ManualExperiment> {
  const store = await readPersistedExperimentStore();
  const existing = findExperiment(store.experiments, experimentId);

  if (!existing) {
    throw new Error("Experiment not found.");
  }

  const timestamp = new Date().toISOString();
  const nextExperiment = experimentSchema.parse({
    ...existing,
    status: "completed",
    updatedAt: timestamp,
    closedAt: timestamp,
  });
  const nextStore = experimentStoreSchema.parse({
    experiments: sortExperiments(
      store.experiments.map((experiment) =>
        experiment.experimentId === experimentId ? nextExperiment : experiment,
      ),
    ),
    updatedAt: timestamp,
  });

  await writeExperimentStore(nextStore);
  return nextExperiment;
}

function isPostingInsideWeek(postedAt: string, weekStartDate: string): boolean {
  const start = new Date(`${weekStartDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const value = new Date(postedAt).getTime();
  return Number.isFinite(value) && value >= start.getTime() && value < end.getTime();
}

function getVariantPostingEntries(variant: ExperimentVariant, postingEntries: PostingLogEntry[]): PostingLogEntry[] {
  const linkedPostingIds = new Set(variant.linkedPostingIds);
  const linkedSignalIds = new Set(variant.linkedSignalIds);
  const weekStartDates = new Set(variant.linkedWeekStartDates);
  const entries = postingEntries.filter(
    (entry) =>
      linkedPostingIds.has(entry.id) ||
      linkedSignalIds.has(entry.signalId) ||
      Array.from(weekStartDates).some((weekStartDate) => isPostingInsideWeek(entry.postedAt, weekStartDate)),
  );
  const deduped = new Map(entries.map((entry) => [entry.id, entry]));

  return Array.from(deduped.values()).sort(
    (left, right) =>
      new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime() ||
      left.id.localeCompare(right.id),
  );
}

function buildVariantOutcomeSummary(
  variant: ExperimentVariant,
  postingEntries: PostingLogEntry[],
  postingOutcomesByPostingId: Map<string, PostingOutcome>,
  strategicOutcomesByPostingId: Map<string, StrategicOutcome>,
): ExperimentVariantOutcomeSummary {
  const linkedEntries = getVariantPostingEntries(variant, postingEntries);
  let strongQualityCount = 0;
  let acceptableQualityCount = 0;
  let weakQualityCount = 0;
  let highValueCount = 0;
  let mediumValueCount = 0;
  let lowValueCount = 0;
  let unclearValueCount = 0;
  let clickTotal = 0;
  let leadTotal = 0;

  for (const entry of linkedEntries) {
    const postingOutcome = postingOutcomesByPostingId.get(entry.id);
    const strategicOutcome = strategicOutcomesByPostingId.get(entry.id);

    if (postingOutcome?.outcomeQuality === "strong") {
      strongQualityCount += 1;
    } else if (postingOutcome?.outcomeQuality === "acceptable") {
      acceptableQualityCount += 1;
    } else if (postingOutcome?.outcomeQuality === "weak") {
      weakQualityCount += 1;
    }

    if (strategicOutcome?.strategicValue === "high") {
      highValueCount += 1;
    } else if (strategicOutcome?.strategicValue === "medium") {
      mediumValueCount += 1;
    } else if (strategicOutcome?.strategicValue === "low") {
      lowValueCount += 1;
    } else if (strategicOutcome?.strategicValue === "unclear") {
      unclearValueCount += 1;
    }

    clickTotal += strategicOutcome?.clicks ?? 0;
    leadTotal += (strategicOutcome?.leadsOrSignups ?? 0) + (strategicOutcome?.trialsOrConversions ?? 0);
  }

  return {
    variantId: variant.variantId,
    variantLabel: variant.variantLabel,
    linkedSignalIds: variant.linkedSignalIds,
    linkedPostingIds: variant.linkedPostingIds,
    linkedWeekStartDates: variant.linkedWeekStartDates,
    postingCount: linkedEntries.length,
    strongQualityCount,
    acceptableQualityCount,
    weakQualityCount,
    highValueCount,
    mediumValueCount,
    lowValueCount,
    unclearValueCount,
    clickTotal,
    leadTotal,
    latestPostedAt: linkedEntries[0]?.postedAt ?? null,
  };
}

function buildComparisonSummary(variants: ExperimentVariantOutcomeSummary[]): string | null {
  if (variants.length === 0) {
    return null;
  }

  if (variants.every((variant) => variant.postingCount === 0)) {
    return "No posted outcomes have been linked to this experiment yet.";
  }

  const ranked = [...variants].sort(
    (left, right) =>
      right.highValueCount - left.highValueCount ||
      right.leadTotal - left.leadTotal ||
      right.clickTotal - left.clickTotal ||
      right.strongQualityCount - left.strongQualityCount ||
      right.postingCount - left.postingCount ||
      left.variantLabel.localeCompare(right.variantLabel),
  );
  const leader = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;

  if (!leader) {
    return null;
  }

  if (leader.highValueCount > 0) {
    return runnerUp
      ? `${leader.variantLabel} is currently leading ${runnerUp.variantLabel} on high-value strategic outcomes.`
      : `${leader.variantLabel} has the strongest high-value strategic signal so far.`;
  }

  if (leader.leadTotal > 0) {
    return runnerUp
      ? `${leader.variantLabel} is currently ahead on leads and signups.`
      : `${leader.variantLabel} is generating the strongest lead signal so far.`;
  }

  if (leader.clickTotal > 0) {
    return runnerUp
      ? `${leader.variantLabel} is currently ahead on clicks.`
      : `${leader.variantLabel} is generating the strongest click signal so far.`;
  }

  if (leader.strongQualityCount > 0) {
    return runnerUp
      ? `${leader.variantLabel} is collecting the most strong qualitative outcome ratings so far.`
      : `${leader.variantLabel} has the strongest qualitative feedback so far.`;
  }

  return `${leader.variantLabel} has the most linked posting activity so far.`;
}

function buildExperimentOutcomeSummary(
  experiment: ManualExperiment,
  postingEntries: PostingLogEntry[],
  postingOutcomes: PostingOutcome[],
  strategicOutcomes: StrategicOutcome[],
): ExperimentOutcomeSummary {
  const postingOutcomesByPostingId = new Map(postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicOutcomesByPostingId = new Map(strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const variants = experiment.variants
    .map((variant) =>
      buildVariantOutcomeSummary(variant, postingEntries, postingOutcomesByPostingId, strategicOutcomesByPostingId),
    )
    .sort(
      (left, right) =>
        right.highValueCount - left.highValueCount ||
        right.leadTotal - left.leadTotal ||
        right.clickTotal - left.clickTotal ||
        left.variantLabel.localeCompare(right.variantLabel),
    );

  return {
    experimentId: experiment.experimentId,
    name: experiment.name,
    hypothesis: experiment.hypothesis,
    status: experiment.status,
    experimentType: experiment.experimentType,
    learningGoal: experiment.learningGoal,
    comparisonTarget: experiment.comparisonTarget,
    source: experiment.source,
    proposalId: experiment.proposalId,
    variantCount: experiment.variants.length,
    totalPostingCount: variants.reduce((sum, variant) => sum + variant.postingCount, 0),
    highValueCount: variants.reduce((sum, variant) => sum + variant.highValueCount, 0),
    mediumValueCount: variants.reduce((sum, variant) => sum + variant.mediumValueCount, 0),
    lowValueCount: variants.reduce((sum, variant) => sum + variant.lowValueCount, 0),
    clickTotal: variants.reduce((sum, variant) => sum + variant.clickTotal, 0),
    leadTotal: variants.reduce((sum, variant) => sum + variant.leadTotal, 0),
    comparisonSummary: buildComparisonSummary(variants),
    variants,
    createdAt: experiment.createdAt,
    updatedAt: experiment.updatedAt,
    closedAt: experiment.closedAt,
  };
}

export function buildExperimentInsights(input: {
  experiments: ManualExperiment[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
}): ExperimentInsights {
  const summaries = input.experiments.map((experiment) =>
    buildExperimentOutcomeSummary(
      experiment,
      input.postingEntries,
      input.postingOutcomes,
      input.strategicOutcomes,
    ),
  );
  const activeExperiments = summaries
    .filter((experiment) => experiment.status === "active")
    .sort(
      (left, right) =>
        right.highValueCount - left.highValueCount ||
        right.leadTotal - left.leadTotal ||
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
        left.name.localeCompare(right.name),
    );
  const completedExperiments = summaries
    .filter((experiment) => experiment.status === "completed")
    .sort(
      (left, right) =>
        new Date(right.closedAt ?? right.updatedAt).getTime() - new Date(left.closedAt ?? left.updatedAt).getTime() ||
        right.highValueCount - left.highValueCount ||
        right.leadTotal - left.leadTotal ||
        left.name.localeCompare(right.name),
    );
  const summariesCopy: string[] = [];
  const byType = Array.from(
    summaries.reduce((map, experiment) => {
      if (!experiment.experimentType) {
        return map;
      }

      map.set(experiment.experimentType, (map.get(experiment.experimentType) ?? 0) + 1);
      return map;
    }, new Map<ExperimentType, number>()),
  )
    .map(([experimentType, count]) => ({
      experimentType,
      label: getExperimentTypeLabel(experimentType),
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  if (activeExperiments[0]?.comparisonSummary) {
    summariesCopy.push(activeExperiments[0].comparisonSummary);
  }
  if (completedExperiments[0]?.comparisonSummary && summariesCopy.length < 3) {
    summariesCopy.push(completedExperiments[0].comparisonSummary);
  }
  const mostCommercial = [...summaries]
    .filter((experiment) => experiment.leadTotal > 0)
    .sort((left, right) => right.leadTotal - left.leadTotal || left.name.localeCompare(right.name))[0];
  if (mostCommercial && summariesCopy.length < 3) {
    summariesCopy.push(`${mostCommercial.name} is currently the experiment with the strongest lead signal.`);
  }

  return {
    activeCount: activeExperiments.length,
    draftCount: summaries.filter((experiment) => experiment.status === "draft").length,
    completedCount: completedExperiments.length,
    systemProposedCount: summaries.filter((experiment) => experiment.source === "system_proposal").length,
    byType,
    allExperiments: summaries,
    activeExperiments: activeExperiments.slice(0, 4),
    completedExperiments: completedExperiments.slice(0, 4),
    summaries: summariesCopy.slice(0, 3),
  };
}

export function listExperimentsForSignal(
  experiments: ManualExperiment[],
  signalId: string,
  postingEntries: PostingLogEntry[],
): ManualExperiment[] {
  const signalPostingIds = new Set(
    postingEntries.filter((entry) => entry.signalId === signalId).map((entry) => entry.id),
  );

  return experiments.filter((experiment) =>
    experiment.variants.some(
      (variant) =>
        variant.linkedSignalIds.includes(signalId) ||
        variant.linkedPostingIds.some((postingId) => signalPostingIds.has(postingId)),
    ),
  );
}

export function getExperimentStatusLabel(status: ExperimentStatus): string {
  if (status === "draft") {
    return "Draft";
  }

  if (status === "completed") {
    return "Completed";
  }

  return "Active";
}

export function getExperimentTypeLabel(experimentType: ExperimentType): string {
  switch (experimentType) {
    case "hook_variant_test":
      return "Hook variant test";
    case "cta_variant_test":
      return "CTA variant test";
    case "destination_test":
      return "Destination test";
    case "editorial_mode_test":
      return "Editorial mode test";
    case "platform_expression_test":
      return "Platform expression test";
    case "pattern_vs_no_pattern_test":
    default:
      return "Pattern vs no-pattern test";
  }
}
