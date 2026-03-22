import { z } from "zod";

import type { CompiledProductionPlan } from "@/lib/prompt-compiler";

const NARRATION_COST_PER_SECOND_USD = 0.0004;
const CAPTION_COST_PER_SECOND_USD = 0.00012;
const COMPOSITION_COST_PER_SECOND_USD = 0;
const VISUAL_PROVIDER_COSTS_USD_PER_SECOND: Record<string, number> = {
  "runway-gen4": 0.01,
  "kling-2": 0.008,
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

export type CostEstimate = z.infer<typeof costEstimateSchema>;

function roundUsd(value: number) {
  return Math.round(value * 10000) / 10000;
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
