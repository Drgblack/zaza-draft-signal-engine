import { z } from "zod";

import type { ScenePrompt } from "@/lib/scene-prompts";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const VISUAL_PROVIDER_IDS = ["runway-gen4", "kling-2"] as const;
export type VisualProviderId = (typeof VISUAL_PROVIDER_IDS)[number];

export const generatedSceneAssetSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.enum(VISUAL_PROVIDER_IDS),
  scenePromptId: z.string().trim().min(1),
  assetUrl: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
});

export type GeneratedSceneAsset = z.infer<typeof generatedSceneAssetSchema>;

export interface VisualProvider {
  readonly id: VisualProviderId;
  readonly displayName: string;
  readonly costPerSecond: number;
  generateScene(input: {
    scenePrompt: ScenePrompt;
    createdAt?: string;
  }): GeneratedSceneAsset;
}

function generatedSceneAssetId(scenePromptId: string, providerId: VisualProviderId): string {
  return `${scenePromptId}:generated-scene-asset:${providerId}`;
}

function buildMockVisualProvider(input: {
  id: VisualProviderId;
  displayName: string;
  costPerSecond: number;
}): VisualProvider {
  return {
    id: input.id,
    displayName: input.displayName,
    costPerSecond: input.costPerSecond,
    generateScene({ scenePrompt, createdAt }) {
      const resultId = generatedSceneAssetId(scenePrompt.id, input.id);

      return generatedSceneAssetSchema.parse({
        id: resultId,
        provider: input.id,
        scenePromptId: scenePrompt.id,
        assetUrl: `mock://${input.id}/scene-assets/${resultId}.mp4`,
        createdAt: createdAt ?? MOCK_CREATED_AT,
      });
    },
  };
}

export const runwayGen4VisualProvider = buildMockVisualProvider({
  id: "runway-gen4",
  displayName: "Runway Gen-4",
  costPerSecond: 0.01,
});

export const kling2VisualProvider = buildMockVisualProvider({
  id: "kling-2",
  displayName: "Kling 2",
  costPerSecond: 0.008,
});

export const visualProviderRegistry: Record<VisualProviderId, VisualProvider> = {
  "runway-gen4": runwayGen4VisualProvider,
  "kling-2": kling2VisualProvider,
};

export function listVisualProviders(): VisualProvider[] {
  return VISUAL_PROVIDER_IDS.map((providerId) => visualProviderRegistry[providerId]);
}

export function getVisualProvider(
  providerId?: string | null,
): VisualProvider {
  if (providerId && providerId in visualProviderRegistry) {
    return visualProviderRegistry[providerId as VisualProviderId];
  }

  if (providerId === "local-default") {
    return runwayGen4VisualProvider;
  }

  return runwayGen4VisualProvider;
}
