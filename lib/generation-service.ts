import { toGenerationInputFromSignal } from "@/lib/generator";
import type { SignalGenerationResult, SignalRecord } from "@/types/signal";

export interface GenerationStageInput {
  signal: SignalRecord;
}

export interface GenerationStagePreparationResult {
  generationInput: ReturnType<typeof toGenerationInputFromSignal>;
}

export function prepareGenerationStage(input: GenerationStageInput): GenerationStagePreparationResult {
  return {
    generationInput: toGenerationInputFromSignal(input.signal),
  };
}

export function buildGenerationUpdate(outputs: SignalGenerationResult) {
  return {
    xDraft: outputs.xDraft,
    linkedInDraft: outputs.linkedInDraft,
    redditDraft: outputs.redditDraft,
    imagePrompt: outputs.imagePrompt,
    videoScript: outputs.videoScript,
    ctaOrClosingLine: outputs.ctaOrClosingLine,
    hashtagsOrKeywords: outputs.hashtagsOrKeywords,
    assetBundleJson: outputs.assetBundleJson ?? null,
    preferredAssetType: outputs.preferredAssetType ?? null,
    selectedImageAssetId: outputs.selectedImageAssetId ?? null,
    selectedVideoConceptId: outputs.selectedVideoConceptId ?? null,
    generatedImageUrl: outputs.generatedImageUrl ?? null,
    generationModelVersion: outputs.generationModelVersion,
    promptVersion: outputs.promptVersion,
    needsHumanReview: true,
    status: "Draft Generated" as const,
  };
}
