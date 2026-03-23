import { z } from "zod";

import type { ContentOpportunity } from "./content-opportunities";
import { productionDefaultsSchema } from "./production-defaults";
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
import { factoryReviewReasonListSchema } from "./video-factory-review-reasons";
import { videoFactoryRetryStateSchema } from "./video-factory-retry";

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

export const productionPackageSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  title: z.string().trim().min(1),
  brief: exportVideoBriefSchema,
  narrationSpec: exportNarrationSpecSchema,
  videoPrompt: exportVideoPromptSchema,
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
  artifacts: z.object({
    narration: generatedNarrationArtifactSchema.nullable().default(null),
    sceneAssets: z.array(generatedSceneAssetArtifactSchema).default([]),
    captions: generatedCaptionTrackArtifactSchema.nullable().default(null),
    composedVideo: composedVideoArtifactSchema.nullable().default(null),
    thumbnail: generatedThumbnailArtifactSchema.nullable().default(null),
  }),
  exportFormat: z.literal("json"),
  version: z.literal(1),
});

export type ProductionPackage = z.infer<typeof productionPackageSchema>;

function productionPackageId(videoBriefId: string) {
  return `${videoBriefId}:production-package`;
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

function getReusableNarrationSpec(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
) {
  const narrationSpec = opportunity.generationState?.narrationSpec;

  if (!narrationSpec || narrationSpec.videoBriefId !== brief.id) {
    return null;
  }

  return narrationSpec;
}

function fallbackNarrationSpec(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
) {
  const compiledNarration =
    opportunity.generationState?.renderJob?.compiledProductionPlan?.narrationSpec;

  if (compiledNarration && compiledNarration.videoBriefId === brief.id) {
    return exportNarrationSpecSchema.parse(compiledNarration);
  }

  const pronunciationNotes = brief.cta.toLowerCase().includes("zaza draft")
    ? ['Zaza Draft: say "zah-zah draft".']
    : undefined;
  const pauseHints = [
    "Pause briefly after the opening line.",
    "Slow slightly before the closing line.",
  ];

  return exportNarrationSpecSchema.parse({
    id: `${brief.id}:narration-spec`,
    opportunityId: opportunity.opportunityId,
    videoBriefId: brief.id,
    script: [
      brief.hook,
      ...brief.structure.map((beat) => beat.guidance),
      brief.cta,
    ].join(" "),
    tone: brief.tone.toLowerCase().includes("teacher-real")
      ? "teacher-real"
      : brief.tone.toLowerCase().includes("grounded")
        ? "grounded"
        : "calm",
    pace: brief.durationSec >= 30 ? "measured" : "steady",
    targetDurationSec: brief.durationSec,
    pronunciationNotes,
    pauseHints,
  });
}

function getReusableVideoPrompt(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
) {
  const videoPrompt = opportunity.generationState?.videoPrompt;

  if (!videoPrompt || videoPrompt.videoBriefId !== brief.id) {
    return null;
  }

  return videoPrompt;
}

function fallbackVideoPrompt(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
) {
  const compiledPlan = opportunity.generationState?.renderJob?.compiledProductionPlan;
  const scenePrompts = [
    ...(compiledPlan?.scenePrompts.map((scene) => scene.visualPrompt) ?? []),
    brief.visualDirection,
    ...brief.structure.map((beat) => beat.guidance),
  ]
    .map((value) => value.trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index)
    .slice(0, 4);

  while (scenePrompts.length < 3) {
    scenePrompts.push(
      `Keep the scene grounded in ${opportunity.primaryPainPoint.toLowerCase()}.`,
    );
  }

  const overlayPlan = [...brief.overlayLines].slice(0, 4);
  const styleGuardrails = [
    "Keep the visual tone calm, readable, and teacher-real.",
    "Avoid polished ad styling, flashy motion, or heavy transitions.",
    "Do not make the product the hero before the final beat.",
  ];

  return exportVideoPromptSchema.parse({
    id: `${brief.id}:video-prompt`,
    opportunityId: opportunity.opportunityId,
    videoBriefId: brief.id,
    format: brief.format,
    scenePrompts,
    overlayPlan,
    styleGuardrails,
    negativePrompt:
      compiledPlan?.defaultsSnapshot.negativeConstraints.join(", ") ??
      "No hype or glossy ad styling.",
  });
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

export function buildProductionPackage(input: {
  opportunity: ContentOpportunity;
}): ProductionPackage {
  const brief = exportVideoBriefSchema.parse(
    requireStableBrief(input.opportunity),
  );
  const narrationSpec =
    getReusableNarrationSpec(input.opportunity, brief) ??
    fallbackNarrationSpec(input.opportunity, brief);
  const videoPrompt =
    getReusableVideoPrompt(input.opportunity, brief) ??
    fallbackVideoPrompt(input.opportunity, brief);
  const selectedAttempt = selectExportAttempt(input.opportunity);
  const renderJob = selectedAttempt.renderJob;
  const compiledProductionPlan = renderJob?.compiledProductionPlan ?? null;
  const defaultsSnapshot =
    renderJob?.productionDefaultsSnapshot ??
    compiledProductionPlan?.defaultsSnapshot ??
    null;
  const qualityCheck =
    renderJob?.qualityCheck ??
    input.opportunity.generationState?.latestQualityCheck ??
    selectedAttempt.lineage?.qualityCheck ??
    null;

  return productionPackageSchema.parse({
    id: productionPackageId(brief.id),
    opportunityId: input.opportunity.opportunityId,
    videoBriefId: brief.id,
    createdAt: new Date().toISOString(),
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
    artifacts: {
      narration: selectedAttempt.lineage?.narrationArtifact ?? null,
      sceneAssets: selectedAttempt.lineage?.sceneArtifacts ?? [],
      captions: selectedAttempt.lineage?.captionArtifact ?? null,
      composedVideo: selectedAttempt.lineage?.composedVideoArtifact ?? null,
      thumbnail: selectedAttempt.lineage?.thumbnailArtifact ?? null,
    },
    exportFormat: "json",
    version: 1,
  });
}
