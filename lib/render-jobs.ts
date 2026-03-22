import { z } from "zod";

import { compiledProductionPlanSchema } from "@/lib/prompt-compiler";
import { productionDefaultsSchema } from "@/lib/production-defaults";
import { costEstimateSchema } from "@/lib/video-factory-cost";
import { qualityCheckResultSchema } from "@/lib/video-factory-quality-checks";

export const RENDER_PROVIDERS = ["mock", "runway", "capcut", "custom"] as const;
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
  costEstimate: costEstimateSchema.nullable().default(null),
  qualityCheck: qualityCheckResultSchema.nullable().default(null),
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
  costEstimate?: z.infer<typeof costEstimateSchema> | null;
  qualityCheck?: z.infer<typeof qualityCheckResultSchema> | null;
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
    costEstimate: input.costEstimate ?? null,
    qualityCheck: input.qualityCheck ?? null,
    status: "queued",
    submittedAt: null,
    completedAt: null,
    errorMessage: null,
  });
}
