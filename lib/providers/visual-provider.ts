import { z } from "zod";

import type { ScenePrompt } from "@/lib/scene-prompts";
import {
  fetchWithProviderTimeout,
  parseProviderJsonResponse,
  providerConfigError,
  providerInvalidResponseError,
  providerHttpError,
  providerPolicyError,
  providerRequestTimeoutMs,
  providerRuntimeError,
  runwayApiVersion,
  runwayBaseUrl,
  runwayMaxPolls,
  runwayModelId,
  runwayPollIntervalMs,
  shouldAllowMockProviderExecution,
  shouldUseRealProvider,
  sleep,
} from "./provider-runtime";

const MOCK_CREATED_AT = "2026-03-22T00:00:00.000Z";

export const VISUAL_PROVIDER_IDS = ["runway-gen4", "kling-2", "veo-3"] as const;
export type VisualProviderId = (typeof VISUAL_PROVIDER_IDS)[number];

export const generatedSceneAssetSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.enum(VISUAL_PROVIDER_IDS),
  scenePromptId: z.string().trim().min(1),
  assetUrl: z.string().trim().min(1),
  providerJobId: z.string().trim().nullable().optional().default(null),
  createdAt: z.string().trim().min(1),
});

export type GeneratedSceneAsset = z.infer<typeof generatedSceneAssetSchema>;

export interface VisualProvider {
  readonly id: VisualProviderId;
  readonly displayName: string;
  readonly costPerSecond: number;
  generateScene(input: {
    scenePrompt: ScenePrompt;
    aspectRatio?: "9:16" | "1:1" | "16:9" | null;
    createdAt?: string;
  }): Promise<GeneratedSceneAsset>;
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
    async generateScene({ scenePrompt, createdAt }) {
      if (
        !shouldAllowMockProviderExecution({
          provider: input.displayName,
          stage: "visuals",
        })
      ) {
        throw providerConfigError(
          input.displayName,
          `${input.displayName} is only available in explicit mock mode outside production.`,
          "visuals",
        );
      }

      const resultId = generatedSceneAssetId(scenePrompt.id, input.id);

      return generatedSceneAssetSchema.parse({
        id: resultId,
        provider: input.id,
        scenePromptId: scenePrompt.id,
        assetUrl: `mock://${input.id}/scene-assets/${resultId}.mp4`,
        providerJobId: null,
        createdAt: createdAt ?? MOCK_CREATED_AT,
      });
    },
  };
}

function runwayRatio(aspectRatio?: "9:16" | "1:1" | "16:9" | null) {
  switch (aspectRatio) {
    case "1:1":
      return "960:960";
    case "16:9":
      return "1280:720";
    case "9:16":
    default:
      return "720:1280";
  }
}

function runwayDuration(durationSec?: number): number {
  if ((durationSec ?? 0) >= 10) {
    return 10;
  }

  return 5;
}

type RunwayTaskResponse = {
  id: string;
  status?: string | null;
  output?: string[] | null;
  failureCode?: string | null;
  failure?: string | null;
};

const realRunwayGen4VisualProvider: VisualProvider = {
  id: "runway-gen4",
  displayName: "Runway Gen-4",
  costPerSecond: 0.01,
  async generateScene({ scenePrompt, aspectRatio, createdAt }) {
    if (
      !shouldUseRealProvider({
        provider: "Runway",
        stage: "visuals",
        requiredEnvNames: ["RUNWAYML_API_SECRET"],
      })
    ) {
      return runwayGen4MockProvider.generateScene({ scenePrompt, aspectRatio, createdAt });
    }

    const apiKey = process.env.RUNWAYML_API_SECRET?.trim();
    if (!apiKey) {
      throw providerConfigError("Runway", "RUNWAYML_API_SECRET is missing.", "visuals");
    }

    const createTaskResponse = await fetchWithProviderTimeout({
      provider: "Runway",
      stage: "visuals",
      url: `${runwayBaseUrl()}/v1/image_to_video`,
      timeoutMs: providerRequestTimeoutMs("RUNWAY"),
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Runway-Version": runwayApiVersion(),
        },
        body: JSON.stringify({
          model: runwayModelId(),
          promptText: scenePrompt.visualPrompt,
          ratio: runwayRatio(aspectRatio),
          duration: runwayDuration(scenePrompt.durationSec),
        }),
      },
    });

    if (!createTaskResponse.ok) {
      throw providerHttpError({
        provider: "Runway",
        stage: "visuals",
        status: createTaskResponse.status,
        message: await createTaskResponse.text(),
      });
    }

    const createdTask = await parseProviderJsonResponse<RunwayTaskResponse>({
      provider: "Runway",
      stage: "visuals",
      response: createTaskResponse,
    });
    const taskId = createdTask?.id;
    if (!taskId) {
      throw providerInvalidResponseError({
        provider: "Runway",
        stage: "visuals",
        message: "Runway did not return a task ID.",
        retryable: true,
      });
    }

    let task: RunwayTaskResponse | null = createdTask;
    for (let poll = 0; poll < runwayMaxPolls(); poll += 1) {
      const status = task?.status?.toUpperCase() ?? "";
      if (status === "SUCCEEDED" && task?.output?.[0]) {
        break;
      }

      if (status === "FAILED" || status === "CANCELLED") {
        const failureCode = task?.failureCode?.trim() ?? "";
        const failureMessage =
          task?.failure?.trim() ||
          task?.failureCode?.trim() ||
          "Runway generation failed.";
        if (
          failureCode.startsWith("SAFETY.") ||
          failureCode === "INPUT_PREPROCESSING.SAFETY.TEXT"
        ) {
          throw providerPolicyError({
            provider: "Runway",
            stage: "visuals",
            message: failureMessage,
          });
        }

        throw providerRuntimeError({
          provider: "Runway",
          stage: "visuals",
          message: failureMessage,
          retryable: true,
        });
      }

      await sleep(runwayPollIntervalMs());

      const taskResponse = await fetchWithProviderTimeout({
        provider: "Runway",
        stage: "visuals",
        url: `${runwayBaseUrl()}/v1/tasks/${encodeURIComponent(taskId)}`,
        timeoutMs: providerRequestTimeoutMs("RUNWAY"),
        init: {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-Runway-Version": runwayApiVersion(),
          },
        },
      });

      if (!taskResponse.ok) {
        throw providerHttpError({
          provider: "Runway",
          stage: "visuals",
          status: taskResponse.status,
          message: await taskResponse.text(),
        });
      }

      task = await parseProviderJsonResponse<RunwayTaskResponse>({
        provider: "Runway",
        stage: "visuals",
        response: taskResponse,
      });
    }

    if (!task?.output?.[0]) {
      throw providerRuntimeError({
        provider: "Runway",
        stage: "visuals",
        message: "Runway task did not complete before the polling window ended.",
        retryable: true,
      });
    }

    return generatedSceneAssetSchema.parse({
      id: generatedSceneAssetId(scenePrompt.id, "runway-gen4"),
      provider: "runway-gen4",
      scenePromptId: scenePrompt.id,
      assetUrl: task.output[0],
      providerJobId: taskId,
      createdAt: createdAt ?? new Date().toISOString(),
    });
  },
};

const runwayGen4MockProvider = buildMockVisualProvider({
  id: "runway-gen4",
  displayName: "Runway Gen-4",
  costPerSecond: 0.01,
});

export const runwayGen4VisualProvider = realRunwayGen4VisualProvider;

export const kling2VisualProvider = buildMockVisualProvider({
  id: "kling-2",
  displayName: "Kling 2",
  costPerSecond: 0.008,
});

export const veo3VisualProvider = buildMockVisualProvider({
  id: "veo-3",
  displayName: "Google Veo 3",
  costPerSecond: 0.012,
});

export const visualProviderRegistry: Record<VisualProviderId, VisualProvider> = {
  "runway-gen4": runwayGen4VisualProvider,
  "kling-2": kling2VisualProvider,
  "veo-3": veo3VisualProvider,
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
