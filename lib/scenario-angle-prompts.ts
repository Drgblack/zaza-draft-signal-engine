import type { SignalInterpretationInput } from "@/types/signal";

export const SCENARIO_ANGLE_PROMPT_VERSION = "v1.0.0";

export const SCENARIO_ANGLE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["angle", "rationale"],
        properties: {
          angle: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
  },
} as const;

export function buildScenarioAngleSystemPrompt(): string {
  return [
    "You are helping an operator frame an education signal as a teacher communication scenario for Zaza Draft.",
    "Return exactly one JSON object matching the required schema and nothing else.",
    "Use UK English.",
    "Produce only 2 or 3 concise scenario angles.",
    "Each angle must be teacher-facing, communication-oriented, grounded in the source, and usable for later interpretation.",
    "Do not repeat the article headline in slightly different words.",
    "Do not produce marketing copy, hashtags, or abstract policy summaries.",
    "Prefer scenarios involving parent emails, leadership documentation, complaint responses, incident follow-up, reporting, wording, or escalation risk.",
  ].join("\n");
}

export function buildScenarioAngleUserPrompt(input: SignalInterpretationInput): string {
  return JSON.stringify(
    {
      task: "Suggest bounded scenario angles for this signal.",
      source: {
        sourceTitle: input.sourceTitle,
        sourceType: input.sourceType,
        sourcePublisher: input.sourcePublisher,
        sourceDate: input.sourceDate,
        sourceUrl: input.sourceUrl,
        rawExcerpt: input.rawExcerpt,
        manualSummary: input.manualSummary,
      },
      existingScenarioAngle: input.scenarioAngle,
      outputRules: {
        count: "Return 2 or 3 suggestions only.",
        angleStyle: "Teacher-facing communication scenario, concise, grounded, usable.",
        avoid: "Headline rewrites, generic summaries, policy abstraction, hype.",
      },
    },
    null,
    2,
  );
}
