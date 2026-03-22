import { z } from "zod";

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
  providerJobId: z.string().trim().nullable().default(null),
  status: z.enum(RENDER_JOB_STATUSES),
  submittedAt: z.string().trim().nullable().default(null),
  completedAt: z.string().trim().nullable().default(null),
  errorMessage: z.string().trim().nullable().default(null),
});

export type RenderJob = z.infer<typeof renderJobSchema>;

function renderJobId(
  generationRequestId: string,
  provider: RenderProvider,
): string {
  return `${generationRequestId}:render-job:${provider}`;
}

export function createRenderJob(input: {
  generationRequestId: string;
  provider: RenderProvider;
}): RenderJob {
  return renderJobSchema.parse({
    id: renderJobId(input.generationRequestId, input.provider),
    generationRequestId: input.generationRequestId,
    provider: input.provider,
    providerJobId: null,
    status: "queued",
    submittedAt: null,
    completedAt: null,
    errorMessage: null,
  });
}
