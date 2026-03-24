import { z } from "zod";

import { abTestResultSchema } from "@/lib/factory-ab-tests";
import { compiledProductionPlanSchema } from "@/lib/prompt-compiler";
import { productionDefaultsSchema } from "@/lib/production-defaults";
import {
  costEstimateSchema,
  jobCostRecordSchema,
  videoFactoryBudgetGuardSchema,
} from "@/lib/video-factory-cost";
import { qualityCheckResultSchema } from "@/lib/video-factory-quality-checks";
import { factoryReviewReasonListSchema } from "@/lib/video-factory-review-reasons";
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
  idempotencyKey: z.string().trim().min(1),
  provider: z.enum(RENDER_PROVIDERS),
  renderVersion: z.string().trim().nullable().default(null),
  compiledProductionPlan: compiledProductionPlanSchema.nullable().default(null),
  productionDefaultsSnapshot: productionDefaultsSchema.nullable().default(null),
  providerJobId: z.string().trim().nullable().default(null),
  preTriageConcern: z.enum(RENDER_JOB_PRE_TRIAGE_CONCERNS).nullable().default(null),
  regenerationReason: z.enum(RENDER_JOB_REGENERATION_REASONS).nullable().default(null),
  regenerationReasonCodes: factoryReviewReasonListSchema,
  regenerationNotes: z.string().trim().nullable().default(null),
  costEstimate: costEstimateSchema.nullable().default(null),
  actualCost: jobCostRecordSchema.nullable().default(null),
  budgetGuard: videoFactoryBudgetGuardSchema.nullable().default(null),
  qualityCheck: qualityCheckResultSchema.nullable().default(null),
  retryState: videoFactoryRetryStateSchema.nullable().default(null),
  abTest: abTestResultSchema.nullable().optional(),
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
  idempotencyKey: string;
  provider: RenderProvider;
  renderVersion?: string | null;
  compiledProductionPlan?: z.infer<typeof compiledProductionPlanSchema> | null;
  productionDefaultsSnapshot?: z.infer<typeof productionDefaultsSchema> | null;
  preTriageConcern?: (typeof RENDER_JOB_PRE_TRIAGE_CONCERNS)[number] | null;
  regenerationReason?: (typeof RENDER_JOB_REGENERATION_REASONS)[number] | null;
  regenerationReasonCodes?: z.infer<typeof factoryReviewReasonListSchema>;
  regenerationNotes?: string | null;
  costEstimate?: z.infer<typeof costEstimateSchema> | null;
  actualCost?: z.infer<typeof jobCostRecordSchema> | null;
  budgetGuard?: z.infer<typeof videoFactoryBudgetGuardSchema> | null;
  qualityCheck?: z.infer<typeof qualityCheckResultSchema> | null;
  retryState?: z.infer<typeof videoFactoryRetryStateSchema> | null;
  abTest?: z.infer<typeof abTestResultSchema> | null;
}): RenderJob {
  return renderJobSchema.parse({
    id: renderJobId(
      input.generationRequestId,
      input.provider,
      input.renderVersion ?? null,
    ),
    generationRequestId: input.generationRequestId,
    idempotencyKey: input.idempotencyKey,
    provider: input.provider,
    renderVersion: input.renderVersion ?? null,
    compiledProductionPlan: input.compiledProductionPlan ?? null,
    productionDefaultsSnapshot: input.productionDefaultsSnapshot ?? null,
    providerJobId: null,
    preTriageConcern: input.preTriageConcern ?? null,
    regenerationReason: input.regenerationReason ?? null,
    regenerationReasonCodes: input.regenerationReasonCodes ?? [],
    regenerationNotes: input.regenerationNotes ?? null,
    costEstimate: input.costEstimate ?? null,
    actualCost: input.actualCost ?? null,
    budgetGuard: input.budgetGuard ?? null,
    qualityCheck: input.qualityCheck ?? null,
    retryState: input.retryState ?? null,
    abTest: input.abTest ?? null,
    status: "queued",
    submittedAt: null,
    completedAt: null,
    errorMessage: null,
  });
}
