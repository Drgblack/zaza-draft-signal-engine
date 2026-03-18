import { buildMockScenarioAngleSuggestions, scenarioAngleSuggestionsSchema, type ScenarioAngleSuggestionsResult } from "@/lib/scenario-angle";
import {
  buildScenarioAngleSystemPrompt,
  buildScenarioAngleUserPrompt,
  SCENARIO_ANGLE_JSON_SCHEMA,
  SCENARIO_ANGLE_PROMPT_VERSION,
} from "@/lib/scenario-angle-prompts";
import { generateStructuredJson, getGenerationProviderConfig, getSafeLlmErrorMessage } from "@/lib/llm";
import type { SignalInterpretationInput } from "@/types/signal";

function normaliseJsonEnvelope(rawJson: string): string {
  const trimmed = rawJson.trim();

  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  }

  return trimmed;
}

export async function suggestScenarioAngles(
  input: SignalInterpretationInput,
): Promise<ScenarioAngleSuggestionsResult & { promptVersion: string }> {
  const providerConfig = getGenerationProviderConfig();

  if (providerConfig.provider === "mock") {
    return {
      ...buildMockScenarioAngleSuggestions(input),
      promptVersion: SCENARIO_ANGLE_PROMPT_VERSION,
    };
  }

  try {
    const generation = await generateStructuredJson({
      systemPrompt: buildScenarioAngleSystemPrompt(),
      userPrompt: buildScenarioAngleUserPrompt(input),
      jsonSchema: SCENARIO_ANGLE_JSON_SCHEMA,
    });

    const parsed = scenarioAngleSuggestionsSchema.parse({
      ...JSON.parse(normaliseJsonEnvelope(generation.rawJson)),
      source: generation.source,
      message: `Scenario-angle suggestions generated with ${generation.source}.`,
    });

    return {
      ...parsed,
      promptVersion: SCENARIO_ANGLE_PROMPT_VERSION,
    };
  } catch (error) {
    return {
      ...buildMockScenarioAngleSuggestions(input),
      source: "mock",
      message: `${getSafeLlmErrorMessage(error)} Falling back to bounded mock suggestions.`,
      promptVersion: SCENARIO_ANGLE_PROMPT_VERSION,
    };
  }
}
