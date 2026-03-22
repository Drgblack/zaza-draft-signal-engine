import { z } from "zod";

import type { ScenePrompt } from "@/lib/scene-prompts";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const generatedSceneAssetSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.literal("runway"),
  scenePromptId: z.string().trim().min(1),
  assetUrl: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
});

export type GeneratedSceneAsset = z.infer<typeof generatedSceneAssetSchema>;

export interface VisualProviderAdapter {
  readonly provider: "runway";
  generateSceneAsset(input: {
    scenePrompt: ScenePrompt;
    createdAt?: string;
  }): GeneratedSceneAsset;
}

function generatedSceneAssetId(scenePromptId: string): string {
  return `${scenePromptId}:generated-scene-asset:runway`;
}

export const runwayVisualProvider: VisualProviderAdapter = {
  provider: "runway",
  generateSceneAsset(input) {
    const resultId = generatedSceneAssetId(input.scenePrompt.id);

    return generatedSceneAssetSchema.parse({
      id: resultId,
      provider: "runway",
      scenePromptId: input.scenePrompt.id,
      assetUrl: `mock://runway/scene-assets/${resultId}.mp4`,
      createdAt: input.createdAt ?? MOCK_CREATED_AT,
    });
  },
};
