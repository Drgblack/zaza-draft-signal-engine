import {
  generateContentOpportunityVideo,
  VideoFactoryDailyCapExceededError,
  VideoFactoryRegenerationBudgetExceededError,
} from "@/lib/content-opportunities";
import { jsonError, jsonSuccess, parseJsonBody } from "@/lib/api-route";
import { VideoFactoryActiveRunError } from "@/lib/video-factory-idempotency";
import { scheduleVideoFactoryRun } from "@/lib/video-factory-runner";
import {
  factoryInputGenerateVideoRequestSchema,
  type FactoryInputRenderActionResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(
    request,
    factoryInputGenerateVideoRequestSchema,
  );

  if (!parsed.success) {
    return jsonError<FactoryInputRenderActionResponse>(
      {
        success: false,
        state: null,
        jobId: null,
        estimatedCostUsd: null,
        regenerationCount: null,
        budgetRemaining: null,
        error: parsed.error.issues[0]?.message ?? "Invalid generate video payload.",
      },
      400,
    );
  }

  try {
    const result = await generateContentOpportunityVideo({
      opportunityId: parsed.data.opportunityId,
      provider: parsed.data.provider,
      preTriageConcern: parsed.data.preTriageConcern ?? null,
      allowDailyCapOverride: parsed.data.allowDailyCapOverride ?? false,
    });
    await scheduleVideoFactoryRun({
      opportunityId: parsed.data.opportunityId,
    });

    return jsonSuccess<FactoryInputRenderActionResponse>({
      success: true,
      state: result.state,
      jobId: result.jobId,
      estimatedCostUsd: result.estimatedCostUsd,
      regenerationCount: result.regenerationCount,
      budgetRemaining: result.budgetRemaining,
      budgetExhausted: result.budgetExhausted,
      message: "Video generation queued and handed to the factory runner.",
    });
  } catch (error) {
    if (error instanceof VideoFactoryDailyCapExceededError) {
      return jsonError<FactoryInputRenderActionResponse>(
        {
          success: false,
          state: error.state,
          jobId: error.jobId,
          estimatedCostUsd: error.estimatedCostUsd,
          regenerationCount: error.regenerationCount,
          budgetRemaining: error.budgetRemaining,
          budgetExhausted: false,
          dailyCapExceeded: true,
          dailySpendCapUsd: error.dailySpendGuard.dailySpendCapUsd,
          dailySpendUsedUsd: error.dailySpendGuard.dailySpendUsedUsd,
          projectedDailySpendUsd: error.dailySpendGuard.projectedDailySpendUsd,
          error: error.message,
        },
        409,
      );
    }

    if (error instanceof VideoFactoryRegenerationBudgetExceededError) {
      return jsonError<FactoryInputRenderActionResponse>(
        {
          success: false,
          state: error.state,
          jobId: error.jobId,
          estimatedCostUsd: error.estimatedCostUsd,
          regenerationCount: error.regenerationCount,
          budgetRemaining: error.budgetRemaining,
          budgetExhausted: true,
          error: error.message,
        },
        409,
      );
    }

    return jsonError<FactoryInputRenderActionResponse>(
      {
        success: false,
        state: null,
        jobId: null,
        estimatedCostUsd: null,
        regenerationCount: null,
        budgetRemaining: null,
        error: error instanceof Error ? error.message : "Unable to generate video.",
      },
      error instanceof VideoFactoryActiveRunError ? 409 : 500,
    );
  }
}
