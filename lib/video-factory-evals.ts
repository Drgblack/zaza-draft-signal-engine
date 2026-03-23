import { z } from "zod";

import { captionSpecSchema } from "@/lib/caption-specs";
import { compositionSpecSchema } from "@/lib/composition-specs";
import { narrationSpecSchema } from "@/lib/narration-specs";
import { compiledProductionPlanSchema } from "@/lib/prompt-compiler";
import { productionDefaultsSchema } from "@/lib/production-defaults";
import { renderJobSchema } from "@/lib/render-jobs";
import {
  assetReviewStateSchema,
  ASSET_REVIEW_STATUSES,
  renderedAssetSchema,
} from "@/lib/rendered-assets";
import { scenePromptSchema } from "@/lib/scene-prompts";
import { trustAssessmentSchema } from "@/lib/trust-evaluator";
import { videoBriefSchema } from "@/lib/video-briefs";
import {
  FACTORY_RUN_TERMINAL_OUTCOMES,
  factoryRunLedgerEntrySchema,
} from "@/lib/video-factory-run-ledger";
import {
  VIDEO_FACTORY_STATUSES,
  videoFactoryLifecycleSchema,
} from "@/lib/video-factory-state";

const VIDEO_FACTORY_EVAL_REQUIRED_ARTIFACTS = [
  "compiled_plan",
  "rendered_asset",
  "thumbnail",
  "asset_review",
  "quality_check",
  "run_ledger_entry",
  "defaults_snapshot",
  "provider_metadata",
] as const;

const VIDEO_FACTORY_EVAL_CHECK_KEYS = [
  "lifecycle_terminal_state",
  "required_artifacts",
  "trust_status",
  "provider_defaults_presence",
  "review_state",
] as const;

export const videoFactoryEvalRenderOutcomeSummarySchema = z.object({
  lifecycleStatus: z.enum(VIDEO_FACTORY_STATUSES),
  terminalOutcome: z.enum(FACTORY_RUN_TERMINAL_OUTCOMES).nullable().default(null),
  requiredArtifactIds: z.array(z.string().trim().min(1)).default([]),
  hasCompiledPlan: z.boolean(),
  hasRenderedAsset: z.boolean(),
  hasThumbnail: z.boolean(),
  hasAssetReview: z.boolean(),
  hasQualityCheck: z.boolean(),
  hasDefaultsSnapshot: z.boolean(),
  trustStatus: trustAssessmentSchema.shape.status.nullable().default(null),
  renderProvider: z.string().trim().nullable().default(null),
  narrationProviderId: z.string().trim().nullable().default(null),
  visualProviderIds: z.array(z.string().trim().min(1)).default([]),
  captionProviderId: z.string().trim().nullable().default(null),
  compositionProviderId: z.string().trim().nullable().default(null),
  defaultsSnapshotId: z.string().trim().nullable().default(null),
  voiceProvider: z.literal("elevenlabs").nullable().default(null),
  voiceId: z.string().trim().nullable().default(null),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]).nullable().default(null),
  resolution: z.enum(["720p", "1080p"]).nullable().default(null),
  reviewStatus: z.enum(ASSET_REVIEW_STATUSES).nullable().default(null),
  reviewStructuredReasonCount: z.number().int().nonnegative().default(0),
  reviewHasNotes: z.boolean().default(false),
});

export const videoFactoryEvalExpectationSchema = z.object({
  expectedLifecycleStatus: z.enum(VIDEO_FACTORY_STATUSES),
  expectedTerminalOutcome: z.enum(FACTORY_RUN_TERMINAL_OUTCOMES),
  requiredArtifacts: z.array(z.enum(VIDEO_FACTORY_EVAL_REQUIRED_ARTIFACTS)).default([]),
  acceptableTrustStatuses: z
    .array(z.enum(["safe", "caution", "blocked"]))
    .min(1)
    .default(["safe", "caution"]),
  requireProviderMetadata: z.boolean().default(true),
  requireDefaultsSnapshotFields: z.boolean().default(true),
  expectedReviewStatus: z.enum(ASSET_REVIEW_STATUSES).nullable().default(null),
  requireCoherentReviewState: z.boolean().default(true),
});

export const videoFactoryEvalCaseSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  brief: videoBriefSchema,
  compiledPlan: compiledProductionPlanSchema,
  renderOutcomeSummary: videoFactoryEvalRenderOutcomeSummarySchema,
  reviewOutcomeExpectation: videoFactoryEvalExpectationSchema,
});

export const videoFactoryEvalCheckSchema = z.object({
  key: z.enum(VIDEO_FACTORY_EVAL_CHECK_KEYS),
  passed: z.boolean(),
  message: z.string().trim().min(1),
});

export const videoFactoryEvalResultSchema = z.object({
  caseId: z.string().trim().min(1),
  passed: z.boolean(),
  failedChecks: z.number().int().nonnegative(),
  checks: z.array(videoFactoryEvalCheckSchema),
});

export type VideoFactoryEvalRenderOutcomeSummary = z.infer<
  typeof videoFactoryEvalRenderOutcomeSummarySchema
>;
export type VideoFactoryEvalExpectation = z.infer<
  typeof videoFactoryEvalExpectationSchema
>;
export type VideoFactoryEvalCase = z.infer<typeof videoFactoryEvalCaseSchema>;
export type VideoFactoryEvalCheck = z.infer<typeof videoFactoryEvalCheckSchema>;
export type VideoFactoryEvalResult = z.infer<typeof videoFactoryEvalResultSchema>;

function buildSeedBrief(input: {
  id: string;
  title: string;
  hook: string;
  cta: string;
  format?: z.infer<typeof videoBriefSchema>["format"];
  durationSec?: z.infer<typeof videoBriefSchema>["durationSec"];
}) {
  return videoBriefSchema.parse({
    id: input.id,
    opportunityId: `${input.id}:opportunity`,
    angleId: `${input.id}:angle`,
    hookSetId: `${input.id}:hook-set`,
    title: input.title,
    hook: input.hook,
    format: input.format ?? "talking-head",
    durationSec: input.durationSec ?? 30,
    goal: "Help teachers slow down risky parent communication before it escalates.",
    tone: "teacher-real grounded",
    structure: [
      {
        order: 1,
        purpose: "Hook",
        guidance: "Open with the concrete pressure point.",
        suggestedOverlay: "Pause before send",
      },
      {
        order: 2,
        purpose: "Recognition",
        guidance: "Show the teacher why the message feels risky.",
        suggestedOverlay: "Risk rises fast",
      },
      {
        order: 3,
        purpose: "Reframe",
        guidance: "Reframe toward safer drafting and calmer tone.",
        suggestedOverlay: "Rewrite safely",
      },
      {
        order: 4,
        purpose: "CTA",
        guidance: "Close with a gentle next step.",
        suggestedOverlay: "Try Zaza Draft",
      },
    ],
    visualDirection: "Quiet classroom and laptop visuals with restrained motion.",
    overlayLines: [
      "Pause before send",
      "Risk rises fast",
      "Rewrite safely",
      "Try Zaza Draft",
    ],
    cta: input.cta,
    productionNotes: ["Keep the message teacher-real and low-drama."],
  });
}

function buildSeedDefaultsSnapshot(seedId: string) {
  return productionDefaultsSchema.parse({
    id: `${seedId}:defaults`,
    name: "Teacher-Real Core",
    isActive: true,
    voiceProvider: "elevenlabs",
    voiceId: "teacher-real-core-v1",
    voiceSettings: {
      stability: 0.48,
      similarityBoost: 0.72,
      style: 0.14,
      speakerBoost: true,
    },
    styleAnchorPrompt:
      "Calm, teacher-real delivery. Plainspoken and grounded before polished.",
    motionStyle: "Quiet cuts and readable pacing.",
    negativeConstraints: ["No hype", "No glossy ad energy"],
    aspectRatio: "9:16",
    resolution: "1080p",
    captionStyle: {
      preset: "teacher-real-clean",
      placement: "lower-third",
      casing: "sentence",
    },
    compositionDefaults: {
      transitionStyle: "gentle-cut",
      musicMode: "none",
    },
    reviewDefaults: {
      requireCaptionCheck: true,
    },
    providerFallbacks: {
      narration: ["elevenlabs"],
      visuals: ["runway-gen4", "kling-2"],
      captions: ["assemblyai"],
      composition: ["ffmpeg"],
    },
    updatedAt: "2026-03-23T10:00:00.000Z",
  });
}

function buildSeedCompiledPlan(input: {
  brief: z.infer<typeof videoBriefSchema>;
  trustStatus?: z.infer<typeof trustAssessmentSchema>["status"];
  adjusted?: boolean;
}) {
  const defaultsSnapshot = buildSeedDefaultsSnapshot(input.brief.id);
  const narrationSpec = narrationSpecSchema.parse({
    id: `${input.brief.id}:narration-spec`,
    opportunityId: input.brief.opportunityId,
    videoBriefId: input.brief.id,
    script: `${input.brief.hook} Teachers need a safer draft before they send. ${input.brief.cta}`,
    tone: "teacher-real",
    pace: "steady",
    targetDurationSec: input.brief.durationSec,
  });
  const scenePrompts = [
    {
      id: `${input.brief.id}:scene-1`,
      videoBriefId: input.brief.id,
      order: 1,
      purpose: "hook" as const,
      visualPrompt: "Teacher reading a tense email draft at a classroom desk.",
      overlayText: input.brief.overlayLines[0],
      durationSec: 8,
    },
    {
      id: `${input.brief.id}:scene-2`,
      videoBriefId: input.brief.id,
      order: 2,
      purpose: "recognition" as const,
      visualPrompt: "Teacher revising language with calmer phrasing.",
      overlayText: input.brief.overlayLines[1],
      durationSec: 8,
    },
    {
      id: `${input.brief.id}:scene-3`,
      videoBriefId: input.brief.id,
      order: 3,
      purpose: "reframe" as const,
      visualPrompt: "Quiet typing and a cleaner rewritten sentence on screen.",
      overlayText: input.brief.overlayLines[2],
      durationSec: 7,
    },
    {
      id: `${input.brief.id}:scene-4`,
      videoBriefId: input.brief.id,
      order: 4,
      purpose: "cta" as const,
      visualPrompt: "Teacher closes the laptop with visible relief.",
      overlayText: input.brief.overlayLines[3],
      durationSec: 7,
    },
  ].map((scene) => scenePromptSchema.parse(scene));
  const captionSpec = captionSpecSchema.parse({
    id: `${input.brief.id}:caption-spec`,
    videoBriefId: input.brief.id,
    sourceText: narrationSpec.script,
    stylePreset: defaultsSnapshot.captionStyle.preset,
    placement: defaultsSnapshot.captionStyle.placement,
    casing: defaultsSnapshot.captionStyle.casing,
  });
  const compositionSpec = compositionSpecSchema.parse({
    id: `${input.brief.id}:composition-spec`,
    videoBriefId: input.brief.id,
    aspectRatio: defaultsSnapshot.aspectRatio,
    resolution: defaultsSnapshot.resolution,
    sceneOrder: scenePrompts.map((scene) => scene.id),
    narrationSpecId: narrationSpec.id,
    captionSpecId: captionSpec.id,
    transitionStyle: defaultsSnapshot.compositionDefaults.transitionStyle,
    musicMode: defaultsSnapshot.compositionDefaults.musicMode,
  });

  return compiledProductionPlanSchema.parse({
    id: `${input.brief.id}:compiled-plan`,
    opportunityId: input.brief.opportunityId,
    videoBriefId: input.brief.id,
    defaultsSnapshot,
    narrationSpec,
    scenePrompts,
    captionSpec,
    compositionSpec,
    trustAssessment: {
      score: input.trustStatus === "caution" ? 82 : input.trustStatus === "blocked" ? 48 : 93,
      status: input.trustStatus ?? "safe",
      adjusted: input.adjusted ?? false,
      reasons: input.adjusted ? ["music-downgraded-for-trust"] : [],
    },
  });
}

function buildSeedOutcomeSummary(input: {
  compiledPlan: z.infer<typeof compiledProductionPlanSchema>;
  lifecycleStatus: z.infer<typeof videoFactoryLifecycleSchema>["status"];
  terminalOutcome: z.infer<typeof videoFactoryEvalRenderOutcomeSummarySchema>["terminalOutcome"];
  reviewStatus: z.infer<typeof assetReviewStateSchema>["status"] | null;
  hasRenderedAsset: boolean;
  hasThumbnail: boolean;
  hasQualityCheck: boolean;
  providerSet?: {
    render?: string | null;
    narration?: string | null;
    visuals?: string[];
    captions?: string | null;
    composition?: string | null;
  };
}) {
  const providerSet = input.providerSet ?? {
    render: "runway",
    narration: "elevenlabs",
    visuals: ["runway-gen4"],
    captions: "assemblyai",
    composition: "ffmpeg",
  };

  return videoFactoryEvalRenderOutcomeSummarySchema.parse({
    lifecycleStatus: input.lifecycleStatus,
    terminalOutcome: input.terminalOutcome,
    requiredArtifactIds: input.hasRenderedAsset
      ? [
          `${input.compiledPlan.videoBriefId}:narration-spec`,
          `${input.compiledPlan.videoBriefId}:scene-1`,
          `${input.compiledPlan.videoBriefId}:caption-spec`,
          `${input.compiledPlan.videoBriefId}:rendered-asset`,
        ]
      : [`${input.compiledPlan.videoBriefId}:narration-spec`],
    hasCompiledPlan: true,
    hasRenderedAsset: input.hasRenderedAsset,
    hasThumbnail: input.hasThumbnail,
    hasAssetReview: input.reviewStatus !== null,
    hasQualityCheck: input.hasQualityCheck,
    hasDefaultsSnapshot: true,
    trustStatus: input.compiledPlan.trustAssessment.status,
    renderProvider: providerSet.render ?? null,
    narrationProviderId: providerSet.narration ?? null,
    visualProviderIds: providerSet.visuals ?? [],
    captionProviderId: providerSet.captions ?? null,
    compositionProviderId: providerSet.composition ?? null,
    defaultsSnapshotId: input.compiledPlan.defaultsSnapshot.id,
    voiceProvider: input.compiledPlan.defaultsSnapshot.voiceProvider,
    voiceId: input.compiledPlan.defaultsSnapshot.voiceId,
    aspectRatio: input.compiledPlan.defaultsSnapshot.aspectRatio,
    resolution: input.compiledPlan.defaultsSnapshot.resolution,
    reviewStatus: input.reviewStatus,
    reviewStructuredReasonCount: input.reviewStatus === "rejected" ? 1 : 0,
    reviewHasNotes: input.reviewStatus === "rejected",
  });
}

function isReviewStateCoherent(summary: VideoFactoryEvalRenderOutcomeSummary) {
  switch (summary.lifecycleStatus) {
    case "review_pending":
      return summary.reviewStatus === "pending_review";
    case "accepted":
      return summary.reviewStatus === "accepted";
    case "rejected":
      return summary.reviewStatus === "rejected";
    case "discarded":
      return summary.reviewStatus === "discarded";
    case "failed":
    case "failed_permanent":
      return summary.reviewStatus === null;
    default:
      return true;
  }
}

function artifactPresent(
  artifact: z.infer<typeof videoFactoryEvalExpectationSchema>["requiredArtifacts"][number],
  summary: VideoFactoryEvalRenderOutcomeSummary,
) {
  switch (artifact) {
    case "compiled_plan":
      return summary.hasCompiledPlan;
    case "rendered_asset":
      return summary.hasRenderedAsset;
    case "thumbnail":
      return summary.hasThumbnail;
    case "asset_review":
      return summary.hasAssetReview;
    case "quality_check":
      return summary.hasQualityCheck;
    case "run_ledger_entry":
      return summary.requiredArtifactIds.length > 0;
    case "defaults_snapshot":
      return summary.hasDefaultsSnapshot;
    case "provider_metadata":
      return (
        Boolean(summary.renderProvider) &&
        Boolean(summary.narrationProviderId) &&
        summary.visualProviderIds.length > 0 &&
        Boolean(summary.captionProviderId) &&
        Boolean(summary.compositionProviderId)
      );
  }
}

export function buildVideoFactoryEvalSnapshot(input: {
  lifecycle?: z.infer<typeof videoFactoryLifecycleSchema> | null;
  renderJob?: z.infer<typeof renderJobSchema> | null;
  renderedAsset?: z.infer<typeof renderedAssetSchema> | null;
  assetReview?: z.infer<typeof assetReviewStateSchema> | null;
  runLedgerEntry?: z.infer<typeof factoryRunLedgerEntrySchema> | null;
}): VideoFactoryEvalRenderOutcomeSummary {
  const renderJob = input.renderJob ? renderJobSchema.parse(input.renderJob) : null;
  const renderedAsset = input.renderedAsset
    ? renderedAssetSchema.parse(input.renderedAsset)
    : null;
  const assetReview = input.assetReview
    ? assetReviewStateSchema.parse(input.assetReview)
    : null;
  const runLedgerEntry = input.runLedgerEntry
    ? factoryRunLedgerEntrySchema.parse(input.runLedgerEntry)
    : null;
  const lifecycle = input.lifecycle
    ? videoFactoryLifecycleSchema.parse(input.lifecycle)
    : null;

  return videoFactoryEvalRenderOutcomeSummarySchema.parse({
    lifecycleStatus: lifecycle?.status ?? "draft",
    terminalOutcome: runLedgerEntry?.terminalOutcome ?? null,
    requiredArtifactIds: runLedgerEntry?.artifactIds ?? [],
    hasCompiledPlan: Boolean(renderJob?.compiledProductionPlan),
    hasRenderedAsset: Boolean(renderedAsset),
    hasThumbnail: Boolean(renderedAsset?.thumbnailUrl),
    hasAssetReview: Boolean(assetReview),
    hasQualityCheck: Boolean(renderJob?.qualityCheck),
    hasDefaultsSnapshot: Boolean(
      renderJob?.productionDefaultsSnapshot ?? renderJob?.compiledProductionPlan?.defaultsSnapshot,
    ),
    trustStatus: renderJob?.compiledProductionPlan?.trustAssessment.status ?? null,
    renderProvider: renderJob?.provider ?? lifecycle?.provider ?? null,
    narrationProviderId: runLedgerEntry?.providerSet.narrationProvider ?? null,
    visualProviderIds: runLedgerEntry?.providerSet.visualProviders ?? [],
    captionProviderId: runLedgerEntry?.providerSet.captionProvider ?? null,
    compositionProviderId: runLedgerEntry?.providerSet.compositionProvider ?? null,
    defaultsSnapshotId:
      renderJob?.productionDefaultsSnapshot?.id ??
      renderJob?.compiledProductionPlan?.defaultsSnapshot.id ??
      null,
    voiceProvider:
      renderJob?.productionDefaultsSnapshot?.voiceProvider ??
      renderJob?.compiledProductionPlan?.defaultsSnapshot.voiceProvider ??
      null,
    voiceId:
      renderJob?.productionDefaultsSnapshot?.voiceId ??
      renderJob?.compiledProductionPlan?.defaultsSnapshot.voiceId ??
      null,
    aspectRatio:
      renderJob?.productionDefaultsSnapshot?.aspectRatio ??
      renderJob?.compiledProductionPlan?.defaultsSnapshot.aspectRatio ??
      null,
    resolution:
      renderJob?.productionDefaultsSnapshot?.resolution ??
      renderJob?.compiledProductionPlan?.defaultsSnapshot.resolution ??
      null,
    reviewStatus: assetReview?.status ?? null,
    reviewStructuredReasonCount: assetReview?.structuredReasons.length ?? 0,
    reviewHasNotes: Boolean(assetReview?.reviewNotes),
  });
}

export function evaluateVideoFactoryEvalCase(input: {
  evalCase: VideoFactoryEvalCase;
  currentOutput: VideoFactoryEvalRenderOutcomeSummary;
}): VideoFactoryEvalResult {
  const evalCase = videoFactoryEvalCaseSchema.parse(input.evalCase);
  const currentOutput = videoFactoryEvalRenderOutcomeSummarySchema.parse(
    input.currentOutput,
  );
  const expectation = evalCase.reviewOutcomeExpectation;
  const checks: VideoFactoryEvalCheck[] = [];

  checks.push(
    videoFactoryEvalCheckSchema.parse({
      key: "lifecycle_terminal_state",
      passed:
        currentOutput.lifecycleStatus === expectation.expectedLifecycleStatus &&
        currentOutput.terminalOutcome === expectation.expectedTerminalOutcome,
      message:
        currentOutput.lifecycleStatus === expectation.expectedLifecycleStatus &&
        currentOutput.terminalOutcome === expectation.expectedTerminalOutcome
          ? `Lifecycle reached ${currentOutput.lifecycleStatus} with terminal outcome ${currentOutput.terminalOutcome}.`
          : `Expected lifecycle ${expectation.expectedLifecycleStatus}/${expectation.expectedTerminalOutcome}, received ${currentOutput.lifecycleStatus}/${currentOutput.terminalOutcome ?? "null"}.`,
    }),
  );

  const missingArtifacts = expectation.requiredArtifacts.filter(
    (artifact) => !artifactPresent(artifact, currentOutput),
  );
  checks.push(
    videoFactoryEvalCheckSchema.parse({
      key: "required_artifacts",
      passed: missingArtifacts.length === 0,
      message:
        missingArtifacts.length === 0
          ? "All required artifacts and metadata are present."
          : `Missing required artifacts: ${missingArtifacts.join(", ")}.`,
    }),
  );

  checks.push(
    videoFactoryEvalCheckSchema.parse({
      key: "trust_status",
      passed:
        currentOutput.trustStatus !== null &&
        expectation.acceptableTrustStatuses.includes(currentOutput.trustStatus),
      message:
        currentOutput.trustStatus !== null &&
        expectation.acceptableTrustStatuses.includes(currentOutput.trustStatus)
          ? `Trust status ${currentOutput.trustStatus} is acceptable for this baseline.`
          : `Trust status ${currentOutput.trustStatus ?? "null"} is outside the acceptable range ${expectation.acceptableTrustStatuses.join(", ")}.`,
    }),
  );

  const providerDefaultsPresent =
    (!expectation.requireProviderMetadata ||
      artifactPresent("provider_metadata", currentOutput)) &&
    (!expectation.requireDefaultsSnapshotFields ||
      (currentOutput.hasDefaultsSnapshot &&
        Boolean(currentOutput.defaultsSnapshotId) &&
        Boolean(currentOutput.voiceProvider) &&
        Boolean(currentOutput.voiceId) &&
        Boolean(currentOutput.aspectRatio) &&
        Boolean(currentOutput.resolution)));
  checks.push(
    videoFactoryEvalCheckSchema.parse({
      key: "provider_defaults_presence",
      passed: providerDefaultsPresent,
      message: providerDefaultsPresent
        ? "Provider IDs and defaults snapshot fields are present."
        : "Provider IDs or defaults snapshot fields are missing.",
    }),
  );

  const reviewStatePassed =
    currentOutput.reviewStatus === expectation.expectedReviewStatus &&
    (!expectation.requireCoherentReviewState || isReviewStateCoherent(currentOutput));
  checks.push(
    videoFactoryEvalCheckSchema.parse({
      key: "review_state",
      passed: reviewStatePassed,
      message: reviewStatePassed
        ? "Review state is coherent for the lifecycle outcome."
        : `Expected review state ${expectation.expectedReviewStatus ?? "null"}, received ${currentOutput.reviewStatus ?? "null"}.`,
    }),
  );

  return videoFactoryEvalResultSchema.parse({
    caseId: evalCase.id,
    passed: checks.every((check) => check.passed),
    failedChecks: checks.filter((check) => !check.passed).length,
    checks,
  });
}

const reviewPendingBrief = buildSeedBrief({
  id: "eval-brief-review-pending",
  title: "Pause before a risky parent reply",
  hook: "Before you send this, pause for ten seconds.",
  cta: "Try Zaza Draft",
});
const reviewPendingCompiledPlan = buildSeedCompiledPlan({
  brief: reviewPendingBrief,
  trustStatus: "safe",
});

const acceptedBrief = buildSeedBrief({
  id: "eval-brief-accepted",
  title: "Safer wording before things escalate",
  hook: "This could escalate quickly if the tone lands wrong.",
  cta: "Rewrite safely",
});
const acceptedCompiledPlan = buildSeedCompiledPlan({
  brief: acceptedBrief,
  trustStatus: "safe",
});

const rejectedBrief = buildSeedBrief({
  id: "eval-brief-rejected",
  title: "Rework a tense teacher message",
  hook: "Most teachers do not realise how fast this complaint can build.",
  cta: "Pause before sending",
});
const rejectedCompiledPlan = buildSeedCompiledPlan({
  brief: rejectedBrief,
  trustStatus: "caution",
  adjusted: true,
});

const failedBrief = buildSeedBrief({
  id: "eval-brief-failed",
  title: "Factory stop before founder review",
  hook: "This is where things go wrong when the video never stabilises.",
  cta: "Try Zaza Draft",
});
const failedCompiledPlan = buildSeedCompiledPlan({
  brief: failedBrief,
  trustStatus: "safe",
});

/**
 * Golden-set cases are Phase D regression anchors.
 *
 * They are not semantic/video-quality benchmarks. They only lock structural
 * expectations so provider changes, prompt-compiler changes, or lifecycle work
 * can be checked against durable metadata guardrails inside the repo.
 */
export const VIDEO_FACTORY_GOLDEN_SET: VideoFactoryEvalCase[] = [
  videoFactoryEvalCaseSchema.parse({
    id: "review-pending-structural-baseline",
    label: "Founder-reviewable render with pending review state",
    brief: reviewPendingBrief,
    compiledPlan: reviewPendingCompiledPlan,
    renderOutcomeSummary: buildSeedOutcomeSummary({
      compiledPlan: reviewPendingCompiledPlan,
      lifecycleStatus: "review_pending",
      terminalOutcome: "review_pending",
      reviewStatus: "pending_review",
      hasRenderedAsset: true,
      hasThumbnail: true,
      hasQualityCheck: true,
    }),
    reviewOutcomeExpectation: {
      expectedLifecycleStatus: "review_pending",
      expectedTerminalOutcome: "review_pending",
      requiredArtifacts: [
        "compiled_plan",
        "rendered_asset",
        "thumbnail",
        "asset_review",
        "quality_check",
        "run_ledger_entry",
        "defaults_snapshot",
        "provider_metadata",
      ],
      acceptableTrustStatuses: ["safe", "caution"],
      requireProviderMetadata: true,
      requireDefaultsSnapshotFields: true,
      expectedReviewStatus: "pending_review",
      requireCoherentReviewState: true,
    },
  }),
  videoFactoryEvalCaseSchema.parse({
    id: "accepted-render-baseline",
    label: "Accepted render remains export-ready",
    brief: acceptedBrief,
    compiledPlan: acceptedCompiledPlan,
    renderOutcomeSummary: buildSeedOutcomeSummary({
      compiledPlan: acceptedCompiledPlan,
      lifecycleStatus: "accepted",
      terminalOutcome: "accepted",
      reviewStatus: "accepted",
      hasRenderedAsset: true,
      hasThumbnail: true,
      hasQualityCheck: true,
    }),
    reviewOutcomeExpectation: {
      expectedLifecycleStatus: "accepted",
      expectedTerminalOutcome: "accepted",
      requiredArtifacts: [
        "compiled_plan",
        "rendered_asset",
        "thumbnail",
        "asset_review",
        "quality_check",
        "defaults_snapshot",
        "provider_metadata",
      ],
      acceptableTrustStatuses: ["safe", "caution"],
      requireProviderMetadata: true,
      requireDefaultsSnapshotFields: true,
      expectedReviewStatus: "accepted",
      requireCoherentReviewState: true,
    },
  }),
  videoFactoryEvalCaseSchema.parse({
    id: "rejected-render-baseline",
    label: "Rejected render preserves coherent review metadata",
    brief: rejectedBrief,
    compiledPlan: rejectedCompiledPlan,
    renderOutcomeSummary: buildSeedOutcomeSummary({
      compiledPlan: rejectedCompiledPlan,
      lifecycleStatus: "rejected",
      terminalOutcome: "rejected",
      reviewStatus: "rejected",
      hasRenderedAsset: true,
      hasThumbnail: true,
      hasQualityCheck: true,
    }),
    reviewOutcomeExpectation: {
      expectedLifecycleStatus: "rejected",
      expectedTerminalOutcome: "rejected",
      requiredArtifacts: [
        "compiled_plan",
        "rendered_asset",
        "thumbnail",
        "asset_review",
        "quality_check",
        "defaults_snapshot",
        "provider_metadata",
      ],
      acceptableTrustStatuses: ["safe", "caution"],
      requireProviderMetadata: true,
      requireDefaultsSnapshotFields: true,
      expectedReviewStatus: "rejected",
      requireCoherentReviewState: true,
    },
  }),
  videoFactoryEvalCaseSchema.parse({
    id: "failed-permanent-baseline",
    label: "Permanent failure stays structurally coherent without review artifacts",
    brief: failedBrief,
    compiledPlan: failedCompiledPlan,
    renderOutcomeSummary: buildSeedOutcomeSummary({
      compiledPlan: failedCompiledPlan,
      lifecycleStatus: "failed_permanent",
      terminalOutcome: "failed_permanent",
      reviewStatus: null,
      hasRenderedAsset: false,
      hasThumbnail: false,
      hasQualityCheck: true,
      providerSet: {
        render: "runway",
        narration: "elevenlabs",
        visuals: ["runway-gen4"],
        captions: "assemblyai",
        composition: "ffmpeg",
      },
    }),
    reviewOutcomeExpectation: {
      expectedLifecycleStatus: "failed_permanent",
      expectedTerminalOutcome: "failed_permanent",
      requiredArtifacts: [
        "compiled_plan",
        "quality_check",
        "defaults_snapshot",
        "provider_metadata",
      ],
      acceptableTrustStatuses: ["safe", "caution"],
      requireProviderMetadata: true,
      requireDefaultsSnapshotFields: true,
      expectedReviewStatus: null,
      requireCoherentReviewState: true,
    },
  }),
];
