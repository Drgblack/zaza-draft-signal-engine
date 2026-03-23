import { z } from "zod";

import type { CompiledProductionPlan } from "@/lib/prompt-compiler";
import type { ComposedVideoResult } from "@/lib/providers/composition-provider";
import type { GeneratedCaptionTrack } from "@/lib/providers/caption-provider";
import type { GeneratedNarration } from "@/lib/providers/narration-provider";
import type { GeneratedSceneAsset } from "@/lib/providers/visual-provider";

const NARRATION_COST_PER_SECOND_USD = 0.0004;
const CAPTION_COST_PER_SECOND_USD = 0.00012;
const COMPOSITION_COST_PER_SECOND_USD = 0;
const VISUAL_PROVIDER_COSTS_USD_PER_SECOND: Record<string, number> = {
  "runway-gen4": 0.01,
  "kling-2": 0.008,
};
const NARRATION_PROVIDER_COSTS_USD_PER_SECOND: Record<string, number> = {
  elevenlabs: NARRATION_COST_PER_SECOND_USD,
};
const CAPTION_PROVIDER_COSTS_USD_PER_SECOND: Record<string, number> = {
  assemblyai: CAPTION_COST_PER_SECOND_USD,
};
const COMPOSITION_PROVIDER_COSTS_USD_PER_SECOND: Record<string, number> = {
  ffmpeg: COMPOSITION_COST_PER_SECOND_USD,
};

export const costEstimateSchema = z.object({
  estimatedTotalUsd: z.number().min(0),
  narrationCostUsd: z.number().min(0),
  visualsCostUsd: z.number().min(0),
  transcriptionCostUsd: z.number().min(0),
  compositionCostUsd: z.number().min(0),
  providerId: z.string().trim().min(1),
  mode: z.enum(["fast", "quality"]),
  estimatedAt: z.string().trim().min(1),
});

export const jobCostRecordSchema = z.object({
  jobId: z.string().trim().min(1),
  estimatedCostUsd: z.number().min(0),
  actualCostUsd: z.number().min(0),
  narrationActualUsd: z.number().min(0),
  visualsActualUsd: z.number().min(0),
  transcriptActualUsd: z.number().min(0),
  compositionActualUsd: z.number().min(0),
  providerId: z.string().trim().min(1),
  completedAt: z.string().trim().min(1),
});

export const videoFactoryBudgetGuardSchema = z.object({
  status: z.enum(["within_budget", "warning", "blocked"]),
  estimatedTotalUsd: z.number().min(0),
  warningThresholdUsd: z.number().min(0).nullable().default(null),
  hardStopThresholdUsd: z.number().min(0).nullable().default(null),
  warningMessage: z.string().trim().nullable().default(null),
  hardStopMessage: z.string().trim().nullable().default(null),
  evaluatedAt: z.string().trim().min(1),
});

export type CostEstimate = z.infer<typeof costEstimateSchema>;
export type JobCostRecord = z.infer<typeof jobCostRecordSchema>;
export type VideoFactoryBudgetGuard = z.infer<typeof videoFactoryBudgetGuardSchema>;

function roundUsd(value: number) {
  return Math.round(value * 10000) / 10000;
}

function numberEnv(name: string): number | null {
  const raw = process.env[name]?.trim() ?? "";
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function providerRate(
  rates: Record<string, number>,
  providerId: string | null | undefined,
) {
  if (!providerId) {
    return 0;
  }

  return rates[providerId] ?? 0;
}

export function buildCostEstimate(input: {
  compiledProductionPlan: CompiledProductionPlan;
  estimatedAt: string;
}): CostEstimate {
  const primaryVisualProviderId =
    input.compiledProductionPlan.defaultsSnapshot.providerFallbacks.visuals[0] ??
    "runway-gen4";
  const visualCostPerSecond =
    VISUAL_PROVIDER_COSTS_USD_PER_SECOND[primaryVisualProviderId] ??
    VISUAL_PROVIDER_COSTS_USD_PER_SECOND["runway-gen4"];
  const durationSec = input.compiledProductionPlan.narrationSpec.targetDurationSec;
  const sceneCount = input.compiledProductionPlan.scenePrompts.length;

  const narrationCostUsd = roundUsd(durationSec * NARRATION_COST_PER_SECOND_USD);
  const visualsCostUsd = roundUsd(durationSec * sceneCount * visualCostPerSecond);
  const transcriptionCostUsd = roundUsd(durationSec * CAPTION_COST_PER_SECOND_USD);
  const compositionCostUsd = roundUsd(durationSec * COMPOSITION_COST_PER_SECOND_USD);
  const estimatedTotalUsd = roundUsd(
    narrationCostUsd +
      visualsCostUsd +
      transcriptionCostUsd +
      compositionCostUsd,
  );

  return costEstimateSchema.parse({
    estimatedTotalUsd,
    narrationCostUsd,
    visualsCostUsd,
    transcriptionCostUsd,
    compositionCostUsd,
    providerId: primaryVisualProviderId,
    mode: primaryVisualProviderId === "kling-2" ? "fast" : "quality",
    estimatedAt: input.estimatedAt,
  });
}

export function getVideoFactoryCostWarningThresholdUsd() {
  return numberEnv("VIDEO_FACTORY_COST_WARNING_USD");
}

export function getVideoFactoryCostHardStopThresholdUsd() {
  return numberEnv("VIDEO_FACTORY_COST_HARD_STOP_USD");
}

export function evaluateVideoFactoryBudgetGuard(input: {
  estimatedCost: CostEstimate;
  evaluatedAt: string;
  warningThresholdUsd?: number | null;
  hardStopThresholdUsd?: number | null;
}): VideoFactoryBudgetGuard {
  const warningThresholdUsd =
    input.warningThresholdUsd ?? getVideoFactoryCostWarningThresholdUsd();
  const hardStopThresholdUsd =
    input.hardStopThresholdUsd ?? getVideoFactoryCostHardStopThresholdUsd();

  const estimatedTotalUsd = input.estimatedCost.estimatedTotalUsd;
  const isBlocked =
    hardStopThresholdUsd !== null && estimatedTotalUsd > hardStopThresholdUsd;
  const isWarning =
    !isBlocked &&
    warningThresholdUsd !== null &&
    estimatedTotalUsd > warningThresholdUsd;

  return videoFactoryBudgetGuardSchema.parse({
    status: isBlocked ? "blocked" : isWarning ? "warning" : "within_budget",
    estimatedTotalUsd,
    warningThresholdUsd,
    hardStopThresholdUsd,
    warningMessage: isWarning
      ? `Estimated run cost $${estimatedTotalUsd.toFixed(2)} exceeds the warning threshold of $${warningThresholdUsd?.toFixed(2)}.`
      : null,
    hardStopMessage: isBlocked
      ? `Estimated run cost $${estimatedTotalUsd.toFixed(2)} exceeds the hard-stop threshold of $${hardStopThresholdUsd?.toFixed(2)}.`
      : null,
    evaluatedAt: input.evaluatedAt,
  });
}

export function buildJobCostRecord(input: {
  jobId: string;
  estimatedCost: CostEstimate;
  compiledProductionPlan: CompiledProductionPlan;
  providerResults: {
    narration: GeneratedNarration;
    sceneAssets: GeneratedSceneAsset[];
    captionTrack: GeneratedCaptionTrack;
    composedVideo: ComposedVideoResult;
  };
  completedAt: string;
}): JobCostRecord {
  const durationSec =
    input.providerResults.narration.durationSec ??
    input.providerResults.composedVideo.durationSec ??
    input.compiledProductionPlan.narrationSpec.targetDurationSec;
  const sceneDurationByPromptId = new Map(
    input.compiledProductionPlan.scenePrompts.map((scenePrompt) => [
      scenePrompt.id,
      scenePrompt.durationSec,
    ]),
  );

  const narrationActualUsd = roundUsd(
    durationSec *
      providerRate(
        NARRATION_PROVIDER_COSTS_USD_PER_SECOND,
        input.providerResults.narration.provider,
      ),
  );
  const visualsActualUsd = roundUsd(
    input.providerResults.sceneAssets.reduce((total, sceneAsset) => {
      const sceneDurationSec = sceneDurationByPromptId.get(sceneAsset.scenePromptId) ?? 0;
      return (
        total +
        sceneDurationSec *
          providerRate(
            VISUAL_PROVIDER_COSTS_USD_PER_SECOND,
            sceneAsset.provider,
          )
      );
    }, 0),
  );
  const transcriptActualUsd = roundUsd(
    durationSec *
      providerRate(
        CAPTION_PROVIDER_COSTS_USD_PER_SECOND,
        input.providerResults.captionTrack.provider,
      ),
  );
  const compositionActualUsd = roundUsd(
    (input.providerResults.composedVideo.durationSec ?? durationSec) *
      providerRate(
        COMPOSITION_PROVIDER_COSTS_USD_PER_SECOND,
        input.providerResults.composedVideo.provider,
      ),
  );
  const actualCostUsd = roundUsd(
    narrationActualUsd +
      visualsActualUsd +
      transcriptActualUsd +
      compositionActualUsd,
  );

  return jobCostRecordSchema.parse({
    jobId: input.jobId,
    estimatedCostUsd: input.estimatedCost.estimatedTotalUsd,
    actualCostUsd,
    narrationActualUsd,
    visualsActualUsd,
    transcriptActualUsd,
    compositionActualUsd,
    providerId:
      input.providerResults.sceneAssets[0]?.provider ??
      input.estimatedCost.providerId,
    completedAt: input.completedAt,
  });
}
