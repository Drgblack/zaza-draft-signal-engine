import { z } from "zod";

import { compiledProductionPlanSchema } from "@/lib/prompt-compiler";
import { productionDefaultsSchema } from "@/lib/production-defaults";
import { costEstimateSchema } from "@/lib/video-factory-cost";
import { qualityCheckResultSchema } from "@/lib/video-factory-quality-checks";
import { videoFactoryRetryStateSchema } from "@/lib/video-factory-retry";

export const RENDER_PROVIDERS = ["mock", "runway", "capcut", "custom"] as const;
export const RENDER_JOB_PRE_TRIAGE_CONCERNS = [
  "voice_concern",
  "visual_mood_concern",
  "scene_setting_concern",
  "pacing_concern",
  "trust_concern",
  "no_concern",
] as const;
export const RENDER_JOB_REGENERATION_REASONS = [
  "wrong_visual_setting",
  "wrong_mood",
  "wrong_subject",
  "poor_narration_quality",
  "trust_concern",
  "off_brand",
  "other",
] as const;
export const RENDER_JOB_STATUSES = [
  "queued",
  "submitted",
  "rendering",
  "completed",
  "failed",
] as const;

export type RenderProvider = (typeof RENDER_PROVIDERS)[number];

export const renderJobSchema = z.object({
  id: z.string().trim().min(1),
  generationRequestId: z.string().trim().min(1),
  provider: z.enum(RENDER_PROVIDERS),
  renderVersion: z.string().trim().nullable().default(null),
  compiledProductionPlan: compiledProductionPlanSchema.nullable().default(null),
  productionDefaultsSnapshot: productionDefaultsSchema.nullable().default(null),
  providerJobId: z.string().trim().nullable().default(null),
  preTriageConcern: z.enum(RENDER_JOB_PRE_TRIAGE_CONCERNS).nullable().default(null),
  regenerationReason: z.enum(RENDER_JOB_REGENERATION_REASONS).nullable().default(null),
  costEstimate: costEstimateSchema.nullable().default(null),
  qualityCheck: qualityCheckResultSchema.nullable().default(null),
  retryState: videoFactoryRetryStateSchema.nullable().default(null),
  status: z.enum(RENDER_JOB_STATUSES),
  submittedAt: z.string().trim().nullable().default(null),
  completedAt: z.string().trim().nullable().default(null),
  errorMessage: z.string().trim().nullable().default(null),
});

export type RenderJob = z.infer<typeof renderJobSchema>;

function renderJobId(
  generationRequestId: string,
  provider: RenderProvider,
  renderVersion?: string | null,
): string {
  const versionSuffix = renderVersion ? `:${renderVersion}` : "";
  return `${generationRequestId}:render-job:${provider}${versionSuffix}`;
}

export function createRenderJob(input: {
  generationRequestId: string;
  provider: RenderProvider;
  renderVersion?: string | null;
  compiledProductionPlan?: z.infer<typeof compiledProductionPlanSchema> | null;
  productionDefaultsSnapshot?: z.infer<typeof productionDefaultsSchema> | null;
  preTriageConcern?: (typeof RENDER_JOB_PRE_TRIAGE_CONCERNS)[number] | null;
  regenerationReason?: (typeof RENDER_JOB_REGENERATION_REASONS)[number] | null;
  costEstimate?: z.infer<typeof costEstimateSchema> | null;
  qualityCheck?: z.infer<typeof qualityCheckResultSchema> | null;
  retryState?: z.infer<typeof videoFactoryRetryStateSchema> | null;
}): RenderJob {
  return renderJobSchema.parse({
    id: renderJobId(
      input.generationRequestId,
      input.provider,
      input.renderVersion ?? null,
    ),
    generationRequestId: input.generationRequestId,
    provider: input.provider,
    renderVersion: input.renderVersion ?? null,
    compiledProductionPlan: input.compiledProductionPlan ?? null,
    productionDefaultsSnapshot: input.productionDefaultsSnapshot ?? null,
    providerJobId: null,
    preTriageConcern: input.preTriageConcern ?? null,
    regenerationReason: input.regenerationReason ?? null,
    costEstimate: input.costEstimate ?? null,
    qualityCheck: input.qualityCheck ?? null,
    retryState: input.retryState ?? null,
    status: "queued",
    submittedAt: null,
    completedAt: null,
    errorMessage: null,
  });
}
