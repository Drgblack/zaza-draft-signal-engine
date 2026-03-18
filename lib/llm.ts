import { getAppConfig } from "@/lib/config";

type GenerationProvider = "anthropic" | "openai" | "mock";

class LlmClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider: Exclude<GenerationProvider, "mock">,
  ) {
    super(message);
    this.name = "LlmClientError";
  }
}

export interface StructuredGenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: object;
}

export interface StructuredGenerationResult {
  rawJson: string;
  source: GenerationProvider;
  modelVersion: string;
}

export function getGenerationProviderConfig(): {
  provider: GenerationProvider;
  apiKey?: string;
  modelVersion: string;
} {
  const config = getAppConfig();

  if (config.anthropicApiKey) {
    return {
      provider: "anthropic",
      apiKey: config.anthropicApiKey,
      modelVersion: "claude-sonnet-4-20250514",
    };
  }

  if (config.openaiApiKey) {
    return {
      provider: "openai",
      apiKey: config.openaiApiKey,
      modelVersion: "gpt-4.1-mini",
    };
  }

  return {
    provider: "mock",
    modelVersion: "mock-fixed-template-v1",
  };
}

function extractOpenAiText(response: {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  return "";
}

function extractAnthropicText(response: {
  content?: Array<{ type?: string; text?: string }>;
}) {
  return (
    response.content
      ?.filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text?.trim() ?? "")
      .join("")
      .trim() ?? ""
  );
}

export function getSafeLlmErrorMessage(error: unknown): string {
  if (error instanceof LlmClientError) {
    if (error.status === 401 || error.status === 403) {
      return `${error.provider} credentials were rejected.`;
    }

    return `${error.provider} generation failed (${error.status}).`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Generation failed.";
}

export async function generateStructuredJson(request: StructuredGenerationRequest): Promise<StructuredGenerationResult> {
  const config = getGenerationProviderConfig();

  if (config.provider === "mock" || !config.apiKey) {
    throw new Error("No AI provider is configured.");
  }

  if (config.provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelVersion,
        temperature: 0.3,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "signal_generation_output",
            strict: true,
            schema: request.jsonSchema,
          },
        },
      }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new LlmClientError(data?.error?.message ?? "OpenAI request failed.", response.status, "openai");
    }

    const rawJson = extractOpenAiText(data);
    if (!rawJson) {
      throw new Error("OpenAI returned an empty response.");
    }

    return {
      rawJson,
      source: "openai",
      modelVersion: config.modelVersion,
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.modelVersion,
      max_tokens: 1400,
      temperature: 0.3,
      system: request.systemPrompt,
      messages: [
        {
          role: "user",
          content: `${request.userPrompt}\n\nReturn only valid JSON matching the required schema.`,
        },
      ],
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LlmClientError(data?.error?.message ?? "Anthropic request failed.", response.status, "anthropic");
  }

  const rawJson = extractAnthropicText(data);
  if (!rawJson) {
    throw new Error("Anthropic returned an empty response.");
  }

  return {
    rawJson,
    source: "anthropic",
    modelVersion: config.modelVersion,
  };
}
