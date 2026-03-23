import { z } from "zod";

import type { ProductionDefaults } from "./production-defaults";
import type { RenderJob } from "./render-jobs";
import {
  factoryReviewReasonListSchema,
  type FactoryReviewReasonCode,
} from "./video-factory-review-reasons";

export const FACTORY_COMPARISON_CHANGE_TYPES = [
  "regenerate",
  "provider_change",
  "defaults_change",
  "voice_change",
] as const;

export const FACTORY_COMPARISON_WINNERS = [
  "baseline",
  "comparison",
  "inconclusive",
] as const;

export const factoryComparisonAttemptRefSchema = z.object({
  attemptNumber: z.number().int().positive(),
  attemptId: z.string().trim().min(1),
  renderJobId: z.string().trim().min(1),
  factoryJobId: z.string().trim().nullable().default(null),
  renderVersion: z.string().trim().nullable().default(null),
  provider: z.string().trim().min(1),
  defaultsProfileId: z.string().trim().nullable().default(null),
  defaultsUpdatedAt: z.string().trim().nullable().default(null),
  voiceProvider: z.string().trim().nullable().default(null),
  voiceId: z.string().trim().nullable().default(null),
  terminalOutcome: z
    .enum([
      "review_pending",
      "accepted",
      "rejected",
      "discarded",
      "failed",
      "failed_permanent",
    ])
    .nullable()
    .default(null),
});

export const factoryComparisonDecisionSchema = z.object({
  outcome: z
    .enum(["accepted", "rejected", "discarded", "failed", "failed_permanent"])
    .nullable()
    .default(null),
  structuredReasons: factoryReviewReasonListSchema,
  notes: z.string().trim().nullable().default(null),
});

export const factoryComparisonRecordSchema = z.object({
  comparisonId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  baselineAttempt: factoryComparisonAttemptRefSchema,
  comparisonAttempt: factoryComparisonAttemptRefSchema,
  whatChanged: z
    .array(z.enum(FACTORY_COMPARISON_CHANGE_TYPES))
    .max(FACTORY_COMPARISON_CHANGE_TYPES.length)
    .default([]),
  providerDifference: z
    .object({
      baseline: z.string().trim().nullable().default(null),
      comparison: z.string().trim().nullable().default(null),
    })
    .nullable()
    .default(null),
  defaultsDifference: z
    .object({
      baselineProfileId: z.string().trim().nullable().default(null),
      comparisonProfileId: z.string().trim().nullable().default(null),
      baselineUpdatedAt: z.string().trim().nullable().default(null),
      comparisonUpdatedAt: z.string().trim().nullable().default(null),
    })
    .nullable()
    .default(null),
  voiceDifference: z
    .object({
      baselineVoiceProvider: z.string().trim().nullable().default(null),
      comparisonVoiceProvider: z.string().trim().nullable().default(null),
      baselineVoiceId: z.string().trim().nullable().default(null),
      comparisonVoiceId: z.string().trim().nullable().default(null),
    })
    .nullable()
    .default(null),
  winner: z.enum(FACTORY_COMPARISON_WINNERS).nullable().default(null),
  decisionBasis: factoryComparisonDecisionSchema.nullable().default(null),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

export type FactoryComparisonRecord = z.infer<
  typeof factoryComparisonRecordSchema
>;

function normalizeReasonCodes(
  reasons: FactoryReviewReasonCode[] | null | undefined,
) {
  return factoryReviewReasonListSchema.parse(reasons ?? []);
}

function getRenderJobDefaultsSnapshot(
  renderJob: Pick<RenderJob, "productionDefaultsSnapshot" | "compiledProductionPlan"> | null | undefined,
): ProductionDefaults | null {
  return (
    renderJob?.productionDefaultsSnapshot ??
    renderJob?.compiledProductionPlan?.defaultsSnapshot ??
    null
  );
}

function buildAttemptRef(input: {
  attemptNumber: number;
  renderJob: Pick<
    RenderJob,
    "id" | "provider" | "renderVersion" | "productionDefaultsSnapshot" | "compiledProductionPlan"
  >;
  factoryJobId?: string | null;
  terminalOutcome?: FactoryComparisonRecord["comparisonAttempt"]["terminalOutcome"];
}) {
  const defaultsSnapshot = getRenderJobDefaultsSnapshot(input.renderJob);

  return factoryComparisonAttemptRefSchema.parse({
    attemptNumber: input.attemptNumber,
    attemptId: `${input.renderJob.id}:attempt-lineage`,
    renderJobId: input.renderJob.id,
    factoryJobId: input.factoryJobId ?? null,
    renderVersion: input.renderJob.renderVersion ?? null,
    provider: input.renderJob.provider,
    defaultsProfileId: defaultsSnapshot?.id ?? null,
    defaultsUpdatedAt: defaultsSnapshot?.updatedAt ?? null,
    voiceProvider: defaultsSnapshot?.voiceProvider ?? null,
    voiceId: defaultsSnapshot?.voiceId ?? null,
    terminalOutcome: input.terminalOutcome ?? null,
  });
}

function comparisonId(input: {
  baselineRenderJobId: string;
  comparisonRenderJobId: string;
}) {
  return `${input.baselineRenderJobId}:vs:${input.comparisonRenderJobId}`;
}

function buildChangeMetadata(input: {
  baseline: FactoryComparisonRecord["baselineAttempt"];
  comparison: FactoryComparisonRecord["comparisonAttempt"];
  includeRegenerate: boolean;
}) {
  const whatChanged = new Set<
    (typeof FACTORY_COMPARISON_CHANGE_TYPES)[number]
  >();

  if (input.includeRegenerate) {
    whatChanged.add("regenerate");
  }

  const providerDifference =
    input.baseline.provider !== input.comparison.provider
      ? {
          baseline: input.baseline.provider,
          comparison: input.comparison.provider,
        }
      : null;
  if (providerDifference) {
    whatChanged.add("provider_change");
  }

  const defaultsDifference =
    (input.comparison.defaultsProfileId || input.comparison.defaultsUpdatedAt) &&
    (input.baseline.defaultsProfileId !== input.comparison.defaultsProfileId ||
      input.baseline.defaultsUpdatedAt !== input.comparison.defaultsUpdatedAt)
      ? {
          baselineProfileId: input.baseline.defaultsProfileId,
          comparisonProfileId: input.comparison.defaultsProfileId,
          baselineUpdatedAt: input.baseline.defaultsUpdatedAt,
          comparisonUpdatedAt: input.comparison.defaultsUpdatedAt,
        }
      : null;
  if (defaultsDifference) {
    whatChanged.add("defaults_change");
  }

  const voiceDifference =
    (input.comparison.voiceId || input.comparison.voiceProvider) &&
    (input.baseline.voiceId !== input.comparison.voiceId ||
      input.baseline.voiceProvider !== input.comparison.voiceProvider)
      ? {
          baselineVoiceProvider: input.baseline.voiceProvider,
          comparisonVoiceProvider: input.comparison.voiceProvider,
          baselineVoiceId: input.baseline.voiceId,
          comparisonVoiceId: input.comparison.voiceId,
        }
      : null;
  if (voiceDifference) {
    whatChanged.add("voice_change");
  }

  return {
    whatChanged: [...whatChanged],
    providerDifference,
    defaultsDifference,
    voiceDifference,
  };
}

export function buildFactoryComparisonRecord(input: {
  opportunityId: string;
  videoBriefId: string;
  baselineAttemptNumber: number;
  baselineRenderJob: Pick<
    RenderJob,
    "id" | "provider" | "renderVersion" | "productionDefaultsSnapshot" | "compiledProductionPlan"
  >;
  baselineFactoryJobId?: string | null;
  baselineOutcome?: FactoryComparisonRecord["baselineAttempt"]["terminalOutcome"];
  comparisonAttemptNumber: number;
  comparisonRenderJob: Pick<
    RenderJob,
    "id" | "provider" | "renderVersion" | "productionDefaultsSnapshot" | "compiledProductionPlan"
  >;
  comparisonFactoryJobId?: string | null;
  comparisonOutcome?: FactoryComparisonRecord["comparisonAttempt"]["terminalOutcome"];
  includeRegenerate: boolean;
  createdAt: string;
  updatedAt?: string;
}): FactoryComparisonRecord {
  const baselineAttempt = buildAttemptRef({
    attemptNumber: input.baselineAttemptNumber,
    renderJob: input.baselineRenderJob,
    factoryJobId: input.baselineFactoryJobId ?? null,
    terminalOutcome: input.baselineOutcome ?? null,
  });
  const comparisonAttempt = buildAttemptRef({
    attemptNumber: input.comparisonAttemptNumber,
    renderJob: input.comparisonRenderJob,
    factoryJobId: input.comparisonFactoryJobId ?? null,
    terminalOutcome: input.comparisonOutcome ?? null,
  });
  const changeMetadata = buildChangeMetadata({
    baseline: baselineAttempt,
    comparison: comparisonAttempt,
    includeRegenerate: input.includeRegenerate,
  });

  return factoryComparisonRecordSchema.parse({
    comparisonId: comparisonId({
      baselineRenderJobId: baselineAttempt.renderJobId,
      comparisonRenderJobId: comparisonAttempt.renderJobId,
    }),
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId,
    baselineAttempt,
    comparisonAttempt,
    whatChanged: changeMetadata.whatChanged,
    providerDifference: changeMetadata.providerDifference,
    defaultsDifference: changeMetadata.defaultsDifference,
    voiceDifference: changeMetadata.voiceDifference,
    winner: null,
    decisionBasis: null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  });
}

export function appendFactoryComparisonRecord(
  existing: FactoryComparisonRecord[],
  next: FactoryComparisonRecord,
): FactoryComparisonRecord[] {
  const deduped = new Map<string, FactoryComparisonRecord>();

  for (const record of [...existing, next]) {
    deduped.set(
      record.comparisonId,
      factoryComparisonRecordSchema.parse(record),
    );
  }

  return Array.from(deduped.values()).sort(
    (left, right) =>
      left.baselineAttempt.attemptNumber - right.baselineAttempt.attemptNumber ||
      left.comparisonAttempt.attemptNumber - right.comparisonAttempt.attemptNumber,
  );
}

export function updateFactoryComparisonRecordForRenderJob(
  existing: FactoryComparisonRecord[],
  input: {
    comparisonRenderJob: Pick<
      RenderJob,
      "id" | "provider" | "renderVersion" | "productionDefaultsSnapshot" | "compiledProductionPlan"
    >;
    comparisonFactoryJobId?: string | null;
    comparisonOutcome?: FactoryComparisonRecord["comparisonAttempt"]["terminalOutcome"];
    updatedAt: string;
  },
): FactoryComparisonRecord[] {
  return existing.map((record) => {
    if (record.comparisonAttempt.renderJobId !== input.comparisonRenderJob.id) {
      return record;
    }

    const comparisonAttempt = buildAttemptRef({
      attemptNumber: record.comparisonAttempt.attemptNumber,
      renderJob: input.comparisonRenderJob,
      factoryJobId: input.comparisonFactoryJobId ?? record.comparisonAttempt.factoryJobId,
      terminalOutcome:
        input.comparisonOutcome ?? record.comparisonAttempt.terminalOutcome,
    });
    const changeMetadata = buildChangeMetadata({
      baseline: record.baselineAttempt,
      comparison: comparisonAttempt,
      includeRegenerate: record.whatChanged.includes("regenerate"),
    });

    return factoryComparisonRecordSchema.parse({
      ...record,
      comparisonAttempt,
      whatChanged: changeMetadata.whatChanged,
      providerDifference: changeMetadata.providerDifference,
      defaultsDifference: changeMetadata.defaultsDifference,
      voiceDifference: changeMetadata.voiceDifference,
      updatedAt: input.updatedAt,
    });
  });
}

export function updateFactoryComparisonDecision(
  existing: FactoryComparisonRecord[],
  input: {
    comparisonRenderJobId: string;
    outcome:
      | "accepted"
      | "rejected"
      | "discarded"
      | "failed"
      | "failed_permanent";
    structuredReasons?: FactoryReviewReasonCode[];
    notes?: string | null;
    updatedAt: string;
  },
): FactoryComparisonRecord[] {
  return existing.map((record) => {
    if (record.comparisonAttempt.renderJobId !== input.comparisonRenderJobId) {
      return record;
    }

    const winner =
      input.outcome === "accepted"
        ? "comparison"
        : input.outcome === "rejected" ||
            input.outcome === "discarded" ||
            input.outcome === "failed" ||
            input.outcome === "failed_permanent"
          ? "baseline"
          : null;

    return factoryComparisonRecordSchema.parse({
      ...record,
      comparisonAttempt: {
        ...record.comparisonAttempt,
        terminalOutcome: input.outcome,
      },
      winner,
      decisionBasis: {
        outcome: input.outcome,
        structuredReasons: normalizeReasonCodes(input.structuredReasons),
        notes: input.notes ?? null,
      },
      updatedAt: input.updatedAt,
    });
  });
}

export function maybeBuildFactoryComparisonRecord(input: {
  opportunityId: string;
  videoBriefId: string;
  includeRegenerate: boolean;
  baselineAttemptNumber?: number | null;
  baselineRenderJob?: Pick<
    RenderJob,
    "id" | "provider" | "renderVersion" | "productionDefaultsSnapshot" | "compiledProductionPlan"
  > | null;
  baselineFactoryJobId?: string | null;
  baselineOutcome?: FactoryComparisonRecord["baselineAttempt"]["terminalOutcome"];
  comparisonAttemptNumber: number;
  comparisonRenderJob: Pick<
    RenderJob,
    "id" | "provider" | "renderVersion" | "productionDefaultsSnapshot" | "compiledProductionPlan"
  >;
  comparisonFactoryJobId?: string | null;
  comparisonOutcome?: FactoryComparisonRecord["comparisonAttempt"]["terminalOutcome"];
  createdAt: string;
}): FactoryComparisonRecord | null {
  if (!input.baselineRenderJob || !input.baselineAttemptNumber) {
    return null;
  }

  const record = buildFactoryComparisonRecord({
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId,
    baselineAttemptNumber: input.baselineAttemptNumber,
    baselineRenderJob: input.baselineRenderJob,
    baselineFactoryJobId: input.baselineFactoryJobId ?? null,
    baselineOutcome: input.baselineOutcome ?? null,
    comparisonAttemptNumber: input.comparisonAttemptNumber,
    comparisonRenderJob: input.comparisonRenderJob,
    comparisonFactoryJobId: input.comparisonFactoryJobId ?? null,
    comparisonOutcome: input.comparisonOutcome ?? null,
    includeRegenerate: input.includeRegenerate,
    createdAt: input.createdAt,
  });

  return record.whatChanged.length > 0 ? record : null;
}
