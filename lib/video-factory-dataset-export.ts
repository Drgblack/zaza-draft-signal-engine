import { z } from "zod";

import type { ContentOpportunity } from "./content-opportunities";
import {
  costEstimateSchema,
  jobCostRecordSchema,
  videoFactoryBudgetGuardSchema,
} from "./video-factory-cost";
import {
  factoryComparisonRecordSchema,
  type FactoryComparisonRecord,
} from "./video-factory-comparisons";
import {
  videoFactoryLanguageMemoryRecordSchema,
  type VideoFactoryLanguageMemoryRecord,
} from "./video-factory-language-memory";
import {
  productionPackageSchema,
  buildProductionPackage,
  type ProductionPackage,
} from "./production-packages";
import {
  qualityCheckResultSchema,
} from "./video-factory-quality-checks";
import {
  videoFactoryRetryStateSchema,
} from "./video-factory-retry";
import {
  factoryRunLedgerEntrySchema,
  factoryRunProviderSetSchema,
} from "./video-factory-run-ledger";
import {
  buildFactoryProviderBenchmarkCollection,
  providerBenchmarkCollectionSchema,
} from "./video-factory-provider-benchmarks";
import {
  factoryPublishOutcomeSchema,
  type FactoryPublishOutcome,
} from "./video-factory-publish-outcomes";
import {
  videoFactoryAttemptLineageSchema,
} from "./video-factory-lineage";

const datasetVideoBeatSchema = z.object({
  order: z.number().int().min(1).max(4),
  purpose: z.string().trim().min(1),
  guidance: z.string().trim().min(1),
  suggestedOverlay: z.string().trim().min(1).optional(),
});

const datasetVideoBriefSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  angleId: z.string().trim().min(1),
  hookSetId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  hook: z.string().trim().min(1),
  format: z.enum(["talking-head", "text-led", "b-roll", "carousel-to-video"]),
  durationSec: z.union([
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(45),
  ]),
  goal: z.string().trim().min(1),
  tone: z.string().trim().min(1),
  structure: z.array(datasetVideoBeatSchema).min(3).max(4),
  visualDirection: z.string().trim().min(1),
  overlayLines: z.array(z.string().trim().min(1)).min(2).max(4),
  cta: z.string().trim().min(1),
  productionNotes: z.array(z.string().trim().min(1)).max(4).optional(),
});

const datasetOpportunitySummarySchema = z.object({
  opportunityId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  status: z.string().trim().min(1),
  priority: z.string().trim().min(1),
  primaryPainPoint: z.string().trim().min(1),
  teacherLanguage: z.array(z.string().trim().min(1)).default([]),
  recommendedAngle: z.string().trim().min(1),
  recommendedHookDirection: z.string().trim().min(1),
  recommendedFormat: z.string().trim().min(1),
  recommendedPlatforms: z.array(z.string().trim().min(1)).default([]),
  whyNow: z.string().trim().min(1),
  commercialPotential: z.string().trim().min(1),
  trustRisk: z.string().trim().min(1),
  riskSummary: z.string().trim().nullable().default(null),
  suggestedNextStep: z.string().trim().min(1),
  founderSelectionStatus: z.string().trim().min(1),
});

const datasetSelectionSchema = z.object({
  selectedAngleId: z.string().trim().nullable().default(null),
  selectedHookId: z.string().trim().nullable().default(null),
  selectedVideoBrief: datasetVideoBriefSchema.nullable().default(null),
});

const datasetGenerationSnapshotSchema = z.object({
  currentFactoryJobId: z.string().trim().nullable().default(null),
  currentRenderJobId: z.string().trim().nullable().default(null),
  currentRenderedAssetId: z.string().trim().nullable().default(null),
  currentLifecycleStatus: z.string().trim().nullable().default(null),
  currentReviewStatus: z.string().trim().nullable().default(null),
  latestCostEstimate: costEstimateSchema.nullable().default(null),
  latestActualCost: jobCostRecordSchema.nullable().default(null),
  latestBudgetGuard: videoFactoryBudgetGuardSchema.nullable().default(null),
  latestQualityCheck: qualityCheckResultSchema.nullable().default(null),
  latestRetryState: videoFactoryRetryStateSchema.nullable().default(null),
  runLedger: z.array(factoryRunLedgerEntrySchema).default([]),
  comparisonRecords: z.array(factoryComparisonRecordSchema).default([]),
  attemptLineage: z.array(videoFactoryAttemptLineageSchema).default([]),
});

const datasetBenchmarkMetadataSchema = z.object({
  attemptCount: z.number().int().nonnegative(),
  acceptedAttemptCount: z.number().int().nonnegative(),
  rejectedAttemptCount: z.number().int().nonnegative(),
  discardedAttemptCount: z.number().int().nonnegative(),
  failedAttemptCount: z.number().int().nonnegative(),
  publishedOutcomeCount: z.number().int().nonnegative(),
  latestProviderSet: factoryRunProviderSetSchema.nullable().default(null),
  latestDefaultsProfileId: z.string().trim().nullable().default(null),
  latestVoiceProvider: z.string().trim().nullable().default(null),
  latestVoiceId: z.string().trim().nullable().default(null),
});

export const factoryDatasetRecordSchema = z.object({
  rowId: z.string().trim().min(1),
  opportunity: datasetOpportunitySummarySchema,
  selection: datasetSelectionSchema,
  productionPackage: productionPackageSchema.nullable().default(null),
  generation: datasetGenerationSnapshotSchema,
  publishOutcomes: z.array(factoryPublishOutcomeSchema).default([]),
  languageMemory: z.array(videoFactoryLanguageMemoryRecordSchema).default([]),
  benchmarkMetadata: datasetBenchmarkMetadataSchema,
});

export const factoryDatasetExportSchema = z.object({
  generatedAt: z.string().trim().min(1),
  exportFormat: z.literal("json"),
  version: z.literal(1),
  recordCount: z.number().int().nonnegative(),
  acceptedRecordCount: z.number().int().nonnegative(),
  providerBenchmarks: providerBenchmarkCollectionSchema,
  records: z.array(factoryDatasetRecordSchema).default([]),
});

export type FactoryDatasetRecord = z.infer<typeof factoryDatasetRecordSchema>;
export type FactoryDatasetExport = z.infer<typeof factoryDatasetExportSchema>;

function maybeBuildProductionPackage(
  opportunity: ContentOpportunity,
): ProductionPackage | null {
  if (
    !opportunity.selectedAngleId ||
    !opportunity.selectedHookId ||
    !opportunity.selectedVideoBrief
  ) {
    return null;
  }

  return buildProductionPackage({
    opportunity,
  });
}

function getComparisonRecords(
  opportunity: ContentOpportunity,
): FactoryComparisonRecord[] {
  return opportunity.generationState?.comparisonRecords ?? [];
}

function buildBenchmarkMetadata(input: {
  opportunity: ContentOpportunity;
  productionPackage: ProductionPackage | null;
  publishOutcomes: FactoryPublishOutcome[];
}) {
  const generationState = input.opportunity.generationState;
  const runLedger = generationState?.runLedger ?? [];
  const defaultsSnapshot =
    input.productionPackage?.defaultsSnapshot ??
    generationState?.renderJob?.productionDefaultsSnapshot ??
    generationState?.renderJob?.compiledProductionPlan?.defaultsSnapshot ??
    null;

  return datasetBenchmarkMetadataSchema.parse({
    attemptCount: runLedger.length,
    acceptedAttemptCount: runLedger.filter((entry) => entry.terminalOutcome === "accepted")
      .length,
    rejectedAttemptCount: runLedger.filter((entry) => entry.terminalOutcome === "rejected")
      .length,
    discardedAttemptCount: runLedger.filter((entry) => entry.terminalOutcome === "discarded")
      .length,
    failedAttemptCount: runLedger.filter((entry) => entry.terminalOutcome === "failed")
      .length,
    publishedOutcomeCount: input.publishOutcomes.filter((entry) => entry.published).length,
    latestProviderSet: runLedger.at(-1)?.providerSet ?? null,
    latestDefaultsProfileId: defaultsSnapshot?.id ?? null,
    latestVoiceProvider: defaultsSnapshot?.voiceProvider ?? null,
    latestVoiceId: defaultsSnapshot?.voiceId ?? null,
  });
}

function buildDatasetRecord(input: {
  opportunity: ContentOpportunity;
  publishOutcomes: FactoryPublishOutcome[];
  languageMemory: VideoFactoryLanguageMemoryRecord[];
}): FactoryDatasetRecord {
  const { opportunity } = input;
  const generationState = opportunity.generationState;
  const productionPackage = maybeBuildProductionPackage(opportunity);

  return factoryDatasetRecordSchema.parse({
    rowId: opportunity.opportunityId,
    opportunity: {
      opportunityId: opportunity.opportunityId,
      signalId: opportunity.signalId,
      title: opportunity.title,
      status: opportunity.status,
      priority: opportunity.priority,
      primaryPainPoint: opportunity.primaryPainPoint,
      teacherLanguage: opportunity.teacherLanguage,
      recommendedAngle: opportunity.recommendedAngle,
      recommendedHookDirection: opportunity.recommendedHookDirection,
      recommendedFormat: opportunity.recommendedFormat,
      recommendedPlatforms: opportunity.recommendedPlatforms,
      whyNow: opportunity.whyNow,
      commercialPotential: opportunity.commercialPotential,
      trustRisk: opportunity.trustRisk,
      riskSummary: opportunity.riskSummary,
      suggestedNextStep: opportunity.suggestedNextStep,
      founderSelectionStatus: opportunity.founderSelectionStatus,
    },
    selection: {
      selectedAngleId: opportunity.selectedAngleId,
      selectedHookId: opportunity.selectedHookId,
      selectedVideoBrief: opportunity.selectedVideoBrief,
    },
    productionPackage,
    generation: {
      currentFactoryJobId: generationState?.factoryLifecycle?.factoryJobId ?? null,
      currentRenderJobId: generationState?.renderJob?.id ?? null,
      currentRenderedAssetId: generationState?.renderedAsset?.id ?? null,
      currentLifecycleStatus: generationState?.factoryLifecycle?.status ?? null,
      currentReviewStatus: generationState?.assetReview?.status ?? null,
      latestCostEstimate: generationState?.latestCostEstimate ?? null,
      latestActualCost: generationState?.latestActualCost ?? null,
      latestBudgetGuard: generationState?.latestBudgetGuard ?? null,
      latestQualityCheck: generationState?.latestQualityCheck ?? null,
      latestRetryState: generationState?.latestRetryState ?? null,
      runLedger: generationState?.runLedger ?? [],
      comparisonRecords: getComparisonRecords(opportunity),
      attemptLineage: generationState?.attemptLineage ?? [],
    },
    publishOutcomes: input.publishOutcomes,
    languageMemory: input.languageMemory,
    benchmarkMetadata: buildBenchmarkMetadata({
      opportunity,
      productionPackage,
      publishOutcomes: input.publishOutcomes,
    }),
  });
}

export function buildFactoryDatasetExport(input: {
  opportunities: ContentOpportunity[];
  publishOutcomes?: FactoryPublishOutcome[];
  languageMemory?: VideoFactoryLanguageMemoryRecord[];
  generatedAt?: string;
}): FactoryDatasetExport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const publishOutcomes = input.publishOutcomes ?? [];
  const languageMemory = input.languageMemory ?? [];

  const records = input.opportunities.map((opportunity) =>
    buildDatasetRecord({
      opportunity,
      publishOutcomes: publishOutcomes.filter(
        (entry) => entry.opportunityId === opportunity.opportunityId,
      ),
      languageMemory: languageMemory.filter(
        (entry) => entry.opportunityId === opportunity.opportunityId,
      ),
    }),
  );

  return factoryDatasetExportSchema.parse({
    generatedAt,
    exportFormat: "json",
    version: 1,
    recordCount: records.length,
    acceptedRecordCount: records.filter(
      (record) => record.generation.currentReviewStatus === "accepted",
    ).length,
    providerBenchmarks: buildFactoryProviderBenchmarkCollection({
      opportunities: input.opportunities,
      generatedAt,
    }),
    records,
  });
}
