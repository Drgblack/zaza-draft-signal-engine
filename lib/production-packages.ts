import { z } from "zod";

import type { ContentOpportunity } from "./content-opportunities";
import { productionDefaultsSchema } from "./production-defaults";
import {
  applyVideoFactoryRetentionPolicyToArtifactRef,
  buildVideoFactoryRetentionPolicy,
  isVideoFactoryRetentionDeletionEligible,
  videoFactoryRetentionPolicySchema,
} from "./video-factory-artifact-storage";
import {
  assetReviewStateSchema,
  renderedAssetSchema,
} from "./rendered-assets";
import { qualityCheckResultSchema } from "./video-factory-quality-checks";
import {
  generatedCaptionTrackArtifactSchema,
  generatedNarrationArtifactSchema,
  generatedSceneAssetArtifactSchema,
  generatedThumbnailArtifactSchema,
  composedVideoArtifactSchema,
  videoFactoryAttemptLineageSchema,
} from "./video-factory-lineage";
import {
  type VideoBrief,
} from "./video-briefs";
import {
  costEstimateSchema,
  jobCostRecordSchema,
  videoFactoryBudgetGuardSchema,
} from "./video-factory-cost";
import {
  factoryPublishOutcomeSchema,
  type FactoryPublishOutcome,
} from "./video-factory-publish-outcomes";
import { factoryReviewReasonListSchema } from "./video-factory-review-reasons";
import { videoFactoryRetryStateSchema } from "./video-factory-retry";
import { factoryRunProviderSetSchema } from "./video-factory-run-ledger";

const exportVideoBeatSchema = z.object({
  order: z.number().int().min(1).max(4),
  purpose: z.string().trim().min(1),
  guidance: z.string().trim().min(1),
  suggestedOverlay: z.string().trim().min(1).optional(),
});

const exportVideoBriefSchema = z.object({
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
  structure: z.array(exportVideoBeatSchema).min(3).max(4),
  visualDirection: z.string().trim().min(1),
  overlayLines: z.array(z.string().trim().min(1)).min(2).max(4),
  cta: z.string().trim().min(1),
  contentType: z.string().trim().nullable().default(null),
  finalScriptTrustScore: z.number().min(0).max(100).nullable().default(null),
  productionNotes: z.array(z.string().trim().min(1)).max(4).optional(),
});

const exportNarrationSpecSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  script: z.string().trim().min(1),
  tone: z.enum(["calm", "grounded", "teacher-real"]),
  pace: z.enum(["slow", "steady", "measured"]),
  targetDurationSec: z.union([
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(45),
  ]),
  pronunciationNotes: z.array(z.string().trim().min(1)).max(4).optional(),
  pauseHints: z.array(z.string().trim().min(1)).max(4).optional(),
});

const exportVideoPromptSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  format: z.enum(["talking-head", "text-led", "b-roll", "carousel-to-video"]),
  scenePrompts: z.array(z.string().trim().min(1)).min(3).max(4),
  overlayPlan: z.array(z.string().trim().min(1)).min(2).max(4),
  styleGuardrails: z.array(z.string().trim().min(1)).min(3).max(6),
  negativePrompt: z.string().trim().min(1).optional(),
});

const exportScenePromptSchema = z.object({
  id: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  visualPrompt: z.string().trim().min(1),
  overlayText: z.string().trim().min(1).optional(),
  order: z.number().int().min(1),
  purpose: z.string().trim().min(1),
  durationSec: z.number().int().positive(),
});

const exportCaptionSpecSchema = z.object({
  id: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  sourceText: z.string().trim().min(1),
  stylePreset: z.string().trim().min(1),
  placement: z.enum(["center", "lower-third"]),
  casing: z.enum(["sentence", "title", "upper"]),
});

const exportCompositionSpecSchema = z.object({
  id: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]),
  resolution: z.enum(["720p", "1080p"]),
  sceneOrder: z.array(z.string().trim().min(1)).min(1),
  narrationSpecId: z.string().trim().min(1),
  captionSpecId: z.string().trim().min(1),
  transitionStyle: z.string().trim().min(1).optional(),
  musicMode: z.enum(["none", "light-bed"]).optional(),
});

const exportTrustAssessmentSchema = z.object({
  score: z.number().min(0).max(100),
  status: z.enum(["safe", "caution", "blocked"]),
  adjusted: z.boolean(),
  reasons: z.array(z.string().trim().min(1)),
});

const exportCompiledProductionPlanSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  defaultsSnapshot: productionDefaultsSchema,
  narrationSpec: exportNarrationSpecSchema,
  scenePrompts: z.array(exportScenePromptSchema).min(1).max(4),
  captionSpec: exportCaptionSpecSchema,
  compositionSpec: exportCompositionSpecSchema,
  finalScriptTrustAssessment: exportTrustAssessmentSchema.nullable().default(null),
  trustAssessment: exportTrustAssessmentSchema,
});

const exportRenderJobSchema = z.object({
  id: z.string().trim().min(1),
  generationRequestId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1),
  provider: z.enum(["mock", "runway", "capcut", "custom"]),
  renderVersion: z.string().trim().nullable().default(null),
  compiledProductionPlan: exportCompiledProductionPlanSchema.nullable().default(null),
  productionDefaultsSnapshot: productionDefaultsSchema.nullable().default(null),
  providerJobId: z.string().trim().nullable().default(null),
  preTriageConcern: z.string().trim().nullable().default(null),
  regenerationReason: z.string().trim().nullable().default(null),
  regenerationReasonCodes: factoryReviewReasonListSchema,
  regenerationNotes: z.string().trim().nullable().default(null),
  costEstimate: costEstimateSchema.nullable().default(null),
  actualCost: jobCostRecordSchema.nullable().default(null),
  budgetGuard: videoFactoryBudgetGuardSchema.nullable().default(null),
  qualityCheck: qualityCheckResultSchema.nullable().default(null),
  retryState: videoFactoryRetryStateSchema.nullable().default(null),
  status: z.enum(["queued", "submitted", "rendering", "completed", "failed"]),
  submittedAt: z.string().trim().nullable().default(null),
  completedAt: z.string().trim().nullable().default(null),
  errorMessage: z.string().trim().nullable().default(null),
});

const exportPublishOutcomeSchema = factoryPublishOutcomeSchema;

const productionPackageConnectSummarySchema = z.object({
  handoffStatus: z.enum(["accepted_render", "latest_attempt", "brief_only"]),
  isPublishReady: z.boolean(),
  renderJobId: z.string().trim().nullable().default(null),
  renderedAssetId: z.string().trim().nullable().default(null),
  factoryJobId: z.string().trim().nullable().default(null),
  renderVersion: z.string().trim().nullable().default(null),
  finalVideoUrl: z.string().trim().nullable().default(null),
  thumbnailUrl: z.string().trim().nullable().default(null),
  narrationAudioUrl: z.string().trim().nullable().default(null),
  captionTrackUrl: z.string().trim().nullable().default(null),
  sceneAssetUrls: z.array(z.string().trim().min(1)).default([]),
  providerStack: factoryRunProviderSetSchema.nullable().default(null),
  defaultsProfileId: z.string().trim().nullable().default(null),
  voiceProvider: z.string().trim().nullable().default(null),
  voiceId: z.string().trim().nullable().default(null),
  aspectRatio: z.string().trim().nullable().default(null),
  resolution: z.string().trim().nullable().default(null),
  reviewStatus: z.string().trim().nullable().default(null),
  reviewReasonCodes: factoryReviewReasonListSchema,
  qualityPassed: z.boolean().nullable().default(null),
  published: z.boolean().nullable().default(null),
  publishPlatform: z.string().trim().nullable().default(null),
  publishUrl: z.string().trim().nullable().default(null),
});

const productionPackageLifecycleSummarySchema = z.object({
  factoryJobId: z.string().trim().nullable().default(null),
  videoBriefId: z.string().trim().nullable().default(null),
  provider: z.string().trim().nullable().default(null),
  renderVersion: z.string().trim().nullable().default(null),
  status: z.string().trim().nullable().default(null),
  lastUpdatedAt: z.string().trim().nullable().default(null),
  timestamps: z.object({
    draftAt: z.string().trim().nullable().default(null),
    queuedAt: z.string().trim().nullable().default(null),
    preparingAt: z.string().trim().nullable().default(null),
    generatingNarrationAt: z.string().trim().nullable().default(null),
    generatingVisualsAt: z.string().trim().nullable().default(null),
    generatingCaptionsAt: z.string().trim().nullable().default(null),
    composingAt: z.string().trim().nullable().default(null),
    generatedAt: z.string().trim().nullable().default(null),
    reviewPendingAt: z.string().trim().nullable().default(null),
    acceptedAt: z.string().trim().nullable().default(null),
    rejectedAt: z.string().trim().nullable().default(null),
    discardedAt: z.string().trim().nullable().default(null),
    failedAt: z.string().trim().nullable().default(null),
  }),
  failureStage: z.string().trim().nullable().default(null),
  failureMessage: z.string().trim().nullable().default(null),
});

const productionPackagePublishReadySchema = z.object({
  handoffStatus: z.enum(["accepted_render", "latest_attempt", "brief_only"]),
  isPublishReady: z.boolean(),
  approvedOutputRetention: videoFactoryRetentionPolicySchema
    .nullable()
    .default(null),
  compiledProductionPlanId: z.string().trim().nullable().default(null),
  acceptedRenderedAsset: renderedAssetSchema.nullable().default(null),
  thumbnailUrl: z.string().trim().nullable().default(null),
  narrationArtifact: generatedNarrationArtifactSchema.nullable().default(null),
  captionArtifact: generatedCaptionTrackArtifactSchema.nullable().default(null),
  sceneArtifacts: z.array(generatedSceneAssetArtifactSchema).default([]),
  compositionArtifact: composedVideoArtifactSchema.nullable().default(null),
  thumbnailArtifact: generatedThumbnailArtifactSchema.nullable().default(null),
  providerStack: factoryRunProviderSetSchema.nullable().default(null),
  defaultsSnapshot: productionDefaultsSchema.nullable().default(null),
  lifecycleSummary: productionPackageLifecycleSummarySchema.nullable().default(null),
  reviewOutcome: assetReviewStateSchema.nullable().default(null),
  reviewReasonCodes: factoryReviewReasonListSchema,
  qualityCheck: qualityCheckResultSchema.nullable().default(null),
  publishOutcome: exportPublishOutcomeSchema.nullable().default(null),
  connectSummary: productionPackageConnectSummarySchema,
});

export const productionPackageSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  retention: videoFactoryRetentionPolicySchema,
  title: z.string().trim().min(1),
  brief: exportVideoBriefSchema,
  narrationSpec: exportNarrationSpecSchema.nullable().default(null),
  videoPrompt: exportVideoPromptSchema.nullable().default(null),
  overlayLines: z.array(z.string().trim().min(1)).max(4),
  cta: z.string().trim().min(1),
  exportSource: z.enum(["accepted_render", "latest_attempt", "brief_only"]),
  defaultsSnapshot: productionDefaultsSchema.nullable().default(null),
  compiledProductionPlan: exportCompiledProductionPlanSchema.nullable().default(null),
  renderJob: exportRenderJobSchema.nullable().default(null),
  renderedAsset: renderedAssetSchema.nullable().default(null),
  assetReview: assetReviewStateSchema.nullable().default(null),
  qualityCheck: qualityCheckResultSchema.nullable().default(null),
  lineage: videoFactoryAttemptLineageSchema.nullable().default(null),
  publishOutcome: exportPublishOutcomeSchema.nullable().default(null),
  artifacts: z.object({
    narration: generatedNarrationArtifactSchema.nullable().default(null),
    sceneAssets: z.array(generatedSceneAssetArtifactSchema).default([]),
    captions: generatedCaptionTrackArtifactSchema.nullable().default(null),
    composedVideo: composedVideoArtifactSchema.nullable().default(null),
    thumbnail: generatedThumbnailArtifactSchema.nullable().default(null),
  }),
  publishReadyPackage: productionPackagePublishReadySchema,
  connectSummary: productionPackageConnectSummarySchema,
  exportFormat: z.literal("json"),
  version: z.literal(1),
});

export type ProductionPackage = z.infer<typeof productionPackageSchema>;

function productionPackageId(videoBriefId: string) {
  return `${videoBriefId}:production-package`;
}

function promoteApprovedOutputArtifactStorage<
  T extends {
    storage?: ReturnType<typeof applyVideoFactoryRetentionPolicyToArtifactRef> | null;
    createdAt: string;
  } | null,
>(artifact: T): T {
  if (!artifact?.storage) {
    return artifact;
  }

  return {
    ...artifact,
    storage: applyVideoFactoryRetentionPolicyToArtifactRef(artifact.storage, {
      createdAt: artifact.createdAt,
      retentionClass: "final_approved_output",
    }),
  };
}

function requireStableBrief(opportunity: ContentOpportunity): VideoBrief {
  if (
    !opportunity.selectedAngleId ||
    !opportunity.selectedHookId ||
    !opportunity.selectedVideoBrief
  ) {
    throw new Error("A stable selected video brief is required before export.");
  }

  return opportunity.selectedVideoBrief;
}

function selectExportAttempt(opportunity: ContentOpportunity) {
  const generationState = opportunity.generationState;
  if (!generationState) {
    return {
      exportSource: "brief_only" as const,
      lineage: null,
      renderJob: null,
      renderedAsset: null,
      assetReview: null,
    };
  }

  if (
    generationState.assetReview?.status === "accepted" &&
    generationState.renderedAsset &&
    generationState.renderJob
  ) {
    const acceptedLineage =
      generationState.attemptLineage.find(
        (attempt) =>
          attempt.renderJobId === generationState.renderJob?.id &&
          attempt.renderedAssetId === generationState.renderedAsset?.id,
      ) ??
      generationState.attemptLineage.at(-1) ??
      null;

    return {
      exportSource: "accepted_render" as const,
      lineage: acceptedLineage,
      renderJob: generationState.renderJob,
      renderedAsset: generationState.renderedAsset,
      assetReview: generationState.assetReview,
    };
  }

  const latestLineage = generationState.attemptLineage.at(-1) ?? null;
  return {
    exportSource: latestLineage ? ("latest_attempt" as const) : ("brief_only" as const),
    lineage: latestLineage,
    renderJob:
      latestLineage && generationState.renderJob?.id === latestLineage.renderJobId
        ? generationState.renderJob
        : generationState.renderJob ?? null,
    renderedAsset:
      latestLineage && generationState.renderedAsset?.id === latestLineage.renderedAssetId
        ? generationState.renderedAsset
        : generationState.renderedAsset ?? null,
    assetReview: generationState.assetReview ?? null,
  };
}

function buildLifecycleSummary(opportunity: ContentOpportunity) {
  const lifecycle = opportunity.generationState?.factoryLifecycle;
  if (!lifecycle) {
    return null;
  }

  return productionPackageLifecycleSummarySchema.parse({
    factoryJobId: lifecycle.factoryJobId,
    videoBriefId: lifecycle.videoBriefId,
    provider: lifecycle.provider,
    renderVersion: lifecycle.renderVersion,
    status: lifecycle.status,
    lastUpdatedAt: lifecycle.lastUpdatedAt,
    timestamps: {
      draftAt: lifecycle.draftAt,
      queuedAt: lifecycle.queuedAt,
      preparingAt: lifecycle.preparingAt,
      generatingNarrationAt: lifecycle.generatingNarrationAt,
      generatingVisualsAt: lifecycle.generatingVisualsAt,
      generatingCaptionsAt: lifecycle.generatingCaptionsAt,
      composingAt: lifecycle.composingAt,
      generatedAt: lifecycle.generatedAt,
      reviewPendingAt: lifecycle.reviewPendingAt,
      acceptedAt: lifecycle.acceptedAt,
      rejectedAt: lifecycle.rejectedAt,
      discardedAt: lifecycle.discardedAt,
      failedAt: lifecycle.failedAt,
    },
    failureStage: lifecycle.failureStage,
    failureMessage: lifecycle.failureMessage,
  });
}

function buildPublishOutcomePlaceholder(input: {
  opportunity: ContentOpportunity;
  videoBriefId: string;
  selectedAttempt: ReturnType<typeof selectExportAttempt>;
}): FactoryPublishOutcome | null {
  const renderedAsset = input.selectedAttempt.renderedAsset;
  const renderJob = input.selectedAttempt.renderJob;
  if (!renderedAsset || !renderJob) {
    return null;
  }

  return exportPublishOutcomeSchema.parse({
    publishOutcomeId: `${renderedAsset.id}:publish-outcome`,
    opportunityId: input.opportunity.opportunityId,
    videoBriefId: input.videoBriefId,
    factoryJobId:
      input.selectedAttempt.lineage?.factoryJobId ??
      input.opportunity.generationState?.factoryLifecycle?.factoryJobId ??
      null,
    renderJobId: renderJob.id,
    renderedAssetId: renderedAsset.id,
    assetReviewId: input.selectedAttempt.assetReview?.id ?? null,
    published: false,
    platform: null,
    publishDate: null,
    publishedUrl: null,
    impressions: null,
    clicks: null,
    signups: null,
    notes: null,
    attributionSource: null,
    createdAt:
      input.selectedAttempt.assetReview?.reviewedAt ??
      renderedAsset.createdAt,
    lastUpdatedAt:
      input.selectedAttempt.assetReview?.reviewedAt ??
      renderedAsset.createdAt,
  });
}

function buildProviderStack(input: {
  selectedAttempt: ReturnType<typeof selectExportAttempt>;
}) {
  const renderJob = input.selectedAttempt.renderJob;
  const lineage = input.selectedAttempt.lineage;

  if (!renderJob && !lineage) {
    return null;
  }

  return factoryRunProviderSetSchema.parse({
    renderProvider: renderJob?.provider ?? "mock",
    narrationProvider: lineage?.narrationArtifact?.providerId ?? null,
    visualProviders: Array.from(
      new Set(lineage?.sceneArtifacts.map((artifact) => artifact.providerId) ?? []),
    ),
    captionProvider: lineage?.captionArtifact?.providerId ?? null,
    compositionProvider: lineage?.composedVideoArtifact?.providerId ?? null,
  });
}

function buildPublishReadyFlag(input: {
  selectedAttempt: ReturnType<typeof selectExportAttempt>;
  compiledProductionPlan: z.infer<typeof exportCompiledProductionPlanSchema> | null;
  publishOutcome: FactoryPublishOutcome | null;
}) {
  const renderJob = input.selectedAttempt.renderJob;
  const renderedAsset = input.selectedAttempt.renderedAsset;
  const lineage = input.selectedAttempt.lineage;

  return (
    input.selectedAttempt.exportSource === "accepted_render" &&
    renderJob?.status === "completed" &&
    Boolean(input.compiledProductionPlan) &&
    Boolean(renderedAsset?.url) &&
    Boolean(lineage?.narrationArtifact) &&
    Boolean(lineage?.captionArtifact) &&
    Boolean(lineage?.composedVideoArtifact) &&
    (lineage?.sceneArtifacts.length ?? 0) > 0 &&
    Boolean(input.publishOutcome)
  );
}

function buildConnectSummary(input: {
  selectedAttempt: ReturnType<typeof selectExportAttempt>;
  defaultsSnapshot: z.infer<typeof productionDefaultsSchema> | null;
  qualityCheck: z.infer<typeof qualityCheckResultSchema> | null;
  publishOutcome: FactoryPublishOutcome | null;
}) {
  const renderJob = input.selectedAttempt.renderJob;
  const renderedAsset = input.selectedAttempt.renderedAsset;
  const lineage = input.selectedAttempt.lineage;
  const assetReview = input.selectedAttempt.assetReview;

  return productionPackageConnectSummarySchema.parse({
    handoffStatus: input.selectedAttempt.exportSource,
    isPublishReady:
      input.selectedAttempt.exportSource === "accepted_render" &&
      Boolean(renderedAsset?.url),
    renderJobId: renderJob?.id ?? null,
    renderedAssetId: renderedAsset?.id ?? null,
    factoryJobId:
      lineage?.factoryJobId ??
      null,
    renderVersion:
      lineage?.renderVersion ??
      renderJob?.renderVersion ??
      null,
    finalVideoUrl:
      renderedAsset?.url ??
      lineage?.composedVideoArtifact?.storage?.url ??
      lineage?.composedVideoArtifact?.videoUrl ??
      null,
    thumbnailUrl:
      renderedAsset?.thumbnailUrl ??
      lineage?.thumbnailArtifact?.storage?.url ??
      lineage?.thumbnailArtifact?.imageUrl ??
      lineage?.composedVideoArtifact?.thumbnailUrl ??
      null,
    narrationAudioUrl:
      lineage?.narrationArtifact?.storage?.url ??
      lineage?.narrationArtifact?.audioUrl ??
      null,
    captionTrackUrl:
      lineage?.captionArtifact?.storage?.url ??
      lineage?.captionArtifact?.captionUrl ??
      null,
    sceneAssetUrls:
      lineage?.sceneArtifacts.map((artifact) => artifact.storage?.url ?? artifact.assetUrl) ??
      [],
    providerStack: buildProviderStack({
      selectedAttempt: input.selectedAttempt,
    }),
    defaultsProfileId: input.defaultsSnapshot?.id ?? null,
    voiceProvider: input.defaultsSnapshot?.voiceProvider ?? null,
    voiceId: input.defaultsSnapshot?.voiceId ?? null,
    aspectRatio: input.defaultsSnapshot?.aspectRatio ?? null,
    resolution: input.defaultsSnapshot?.resolution ?? null,
    reviewStatus: assetReview?.status ?? null,
    reviewReasonCodes: assetReview?.structuredReasons ?? [],
    qualityPassed: input.qualityCheck?.passed ?? null,
    published: input.publishOutcome?.published ?? null,
    publishPlatform: input.publishOutcome?.platform ?? null,
    publishUrl: input.publishOutcome?.publishedUrl ?? null,
  });
}

export function buildProductionPackage(input: {
  opportunity: ContentOpportunity;
  publishOutcome?: FactoryPublishOutcome | null;
}): ProductionPackage {
  const createdAt = new Date().toISOString();
  const brief = exportVideoBriefSchema.parse(
    requireStableBrief(input.opportunity),
  );
  const selectedAttempt = selectExportAttempt(input.opportunity);
  const renderJob = selectedAttempt.renderJob;
  const compiledProductionPlan = renderJob?.compiledProductionPlan
    ? exportCompiledProductionPlanSchema.parse(renderJob.compiledProductionPlan)
    : null;
  const narrationSpec = compiledProductionPlan?.narrationSpec ?? null;
  const videoPrompt = input.opportunity.generationState?.videoPrompt
    ? exportVideoPromptSchema.parse(input.opportunity.generationState.videoPrompt)
    : null;
  const defaultsSnapshot =
    renderJob?.productionDefaultsSnapshot ??
    compiledProductionPlan?.defaultsSnapshot ??
    null;
  const qualityCheck =
    renderJob?.qualityCheck ??
    input.opportunity.generationState?.latestQualityCheck ??
    selectedAttempt.lineage?.qualityCheck ??
    null;
  const publishOutcome =
    input.publishOutcome ??
    buildPublishOutcomePlaceholder({
      opportunity: input.opportunity,
      videoBriefId: brief.id,
      selectedAttempt,
    });
  const connectSummary = buildConnectSummary({
    selectedAttempt,
    defaultsSnapshot,
    qualityCheck,
    publishOutcome,
  });
  const lifecycleSummary = buildLifecycleSummary(input.opportunity);
  const approvedOutputRetention =
    selectedAttempt.exportSource === "accepted_render" &&
    selectedAttempt.renderedAsset
      ? buildVideoFactoryRetentionPolicy({
          createdAt: selectedAttempt.renderedAsset.createdAt,
          retentionClass: "final_approved_output",
          asOf: createdAt,
        })
      : null;
  const publishReadyPackage = productionPackagePublishReadySchema.parse({
    handoffStatus: selectedAttempt.exportSource,
    isPublishReady: buildPublishReadyFlag({
      selectedAttempt,
      compiledProductionPlan,
      publishOutcome,
    }),
    approvedOutputRetention,
    compiledProductionPlanId: compiledProductionPlan?.id ?? null,
    acceptedRenderedAsset:
      selectedAttempt.exportSource === "accepted_render"
        ? selectedAttempt.renderedAsset
        : null,
    thumbnailUrl:
      selectedAttempt.renderedAsset?.thumbnailUrl ??
      selectedAttempt.lineage?.thumbnailArtifact?.storage?.url ??
      selectedAttempt.lineage?.thumbnailArtifact?.imageUrl ??
      selectedAttempt.lineage?.composedVideoArtifact?.thumbnailUrl ??
      null,
    narrationArtifact: selectedAttempt.lineage?.narrationArtifact ?? null,
    captionArtifact: selectedAttempt.lineage?.captionArtifact ?? null,
    sceneArtifacts: selectedAttempt.lineage?.sceneArtifacts ?? [],
    compositionArtifact:
      selectedAttempt.exportSource === "accepted_render"
        ? promoteApprovedOutputArtifactStorage(
            selectedAttempt.lineage?.composedVideoArtifact ?? null,
          )
        : selectedAttempt.lineage?.composedVideoArtifact ?? null,
    thumbnailArtifact:
      selectedAttempt.exportSource === "accepted_render"
        ? promoteApprovedOutputArtifactStorage(
            selectedAttempt.lineage?.thumbnailArtifact ?? null,
          )
        : selectedAttempt.lineage?.thumbnailArtifact ?? null,
    providerStack: buildProviderStack({
      selectedAttempt,
    }),
    defaultsSnapshot,
    lifecycleSummary,
    reviewOutcome: selectedAttempt.assetReview,
    reviewReasonCodes: selectedAttempt.assetReview?.structuredReasons ?? [],
    qualityCheck,
    publishOutcome,
    connectSummary,
  });

  return productionPackageSchema.parse({
    id: productionPackageId(brief.id),
    opportunityId: input.opportunity.opportunityId,
    videoBriefId: brief.id,
    createdAt,
    retention: buildVideoFactoryRetentionPolicy({
      createdAt,
      retentionClass: "exported_production_package",
      asOf: createdAt,
    }),
    title: brief.title,
    brief,
    narrationSpec,
    videoPrompt,
    overlayLines: brief.overlayLines,
    cta: brief.cta,
    exportSource: selectedAttempt.exportSource,
    defaultsSnapshot,
    compiledProductionPlan,
    renderJob,
    renderedAsset: selectedAttempt.renderedAsset,
    assetReview: selectedAttempt.assetReview,
    qualityCheck,
    lineage: selectedAttempt.lineage,
    publishOutcome,
    artifacts: {
      narration: selectedAttempt.lineage?.narrationArtifact ?? null,
      sceneAssets: selectedAttempt.lineage?.sceneArtifacts ?? [],
      captions: selectedAttempt.lineage?.captionArtifact ?? null,
      composedVideo: selectedAttempt.lineage?.composedVideoArtifact ?? null,
      thumbnail: selectedAttempt.lineage?.thumbnailArtifact ?? null,
    },
    publishReadyPackage,
    connectSummary,
    exportFormat: "json",
    version: 1,
  });
}

export function listCleanupEligibleProductionPackages(
  packages: ProductionPackage[],
  options?: { asOf?: string | Date },
) {
  return packages.filter((productionPackage) =>
    isVideoFactoryRetentionDeletionEligible(
      productionPackage.retention,
      options?.asOf,
    ),
  );
}
