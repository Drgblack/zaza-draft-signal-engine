import { GENERATION_JSON_SCHEMA, GENERATION_PROMPT_VERSION, buildGenerationSystemPrompt, buildGenerationUserPrompt } from "@/lib/generation-prompts";
import { generateStructuredJson, getGenerationProviderConfig, getSafeLlmErrorMessage } from "@/lib/llm";
import { getScenarioPriority } from "@/lib/scenario-angle";
import { generationResultSchema } from "@/types/api";
import { HOOK_TEMPLATES } from "@/types/signal";
import type { SignalGenerationInput, SignalGenerationResult, SignalRecord } from "@/types/signal";

function normaliseJsonEnvelope(rawJson: string): string {
  const trimmed = rawJson.trim();

  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  }

  return trimmed;
}

function buildSoftClose(input: SignalGenerationInput): string {
  if (input.signalCategory === "Risk") {
    return "Teachers carry more professional risk in communication than most people realise.";
  }

  if (input.signalCategory === "Stress") {
    return "Sometimes the issue is not effort. It is the emotional cost hidden inside ordinary work.";
  }

  if (input.signalCategory === "Conflict") {
    return "Sometimes the danger is not what was meant. It is how it lands under pressure.";
  }

  if (input.signalCategory === "Confusion") {
    return "Clarity is a form of protection when the work is already stretched.";
  }

  return "Small shifts in structure can change how the work feels to carry.";
}

export function buildMockDrafts(input: SignalGenerationInput): SignalGenerationResult {
  const severityPhrase = input.severityScore === 3 ? "serious" : input.severityScore === 2 ? "heavy" : "quiet";
  const close = buildSoftClose(input);
  const preferredScenario = getScenarioPriority({
    scenarioAngle: input.scenarioAngle,
    sourceTitle: input.sourceTitle,
  }).preferredScenario;
  const scenarioLead = preferredScenario ?? input.sourceTitle;

  return {
    xDraft: `${input.hookTemplateUsed}: ${scenarioLead} This is a ${severityPhrase} ${input.signalCategory.toLowerCase()} communication signal about ${input.teacherPainPoint.toLowerCase()}. ${close}`,
    linkedInDraft: `${input.hookTemplateUsed}\n\n${scenarioLead}\n\nWhat this really shows is ${input.contentAngle.toLowerCase()}\n\n${input.teacherPainPoint}\n\n${close}`,
    redditDraft: `Noticing a ${input.signalCategory.toLowerCase()} communication pattern here, especially around "${scenarioLead}".\n\nThe part that stands out is ${input.riskToTeacher.toLowerCase()}\n\nHow would you handle that as a teacher?`,
    imagePrompt: `Create a calm editorial visual in a soft documentary style. Show a teacher-centred scene connected to ${input.signalSubtype.toLowerCase()} and the scenario "${scenarioLead}". Keep the emotional tone ${input.emotionalPattern.toLowerCase()}, grounded in real school communication, with no clutter. Optional text overlay idea: "${input.hookTemplateUsed}".`,
    videoScript: `Hook: ${input.hookTemplateUsed}.\nCore issue: ${scenarioLead}.\nTakeaway: ${input.riskToTeacher}\nSoft close: ${close}`,
    ctaOrClosingLine: close,
    hashtagsOrKeywords:
      input.platformPriority === "LinkedIn First"
        ? "teacher wellbeing, school communication, professional risk"
        : input.platformPriority === "X First"
          ? "teachers, workload, communication"
          : "teacher stress, classroom reality, school systems",
    generationSource: "mock",
    generationModelVersion: "mock-fixed-template-v1",
    promptVersion: GENERATION_PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

export function toGenerationInputFromSignal(signal: SignalRecord): SignalGenerationInput | null {
  const hookTemplateUsed = signal.hookTemplateUsed && HOOK_TEMPLATES.includes(signal.hookTemplateUsed as SignalGenerationInput["hookTemplateUsed"])
    ? (signal.hookTemplateUsed as SignalGenerationInput["hookTemplateUsed"])
    : null;

  if (
    !signal.signalCategory ||
    !signal.severityScore ||
    !signal.signalSubtype ||
    !signal.emotionalPattern ||
    !signal.teacherPainPoint ||
    !signal.relevanceToZazaDraft ||
    !signal.riskToTeacher ||
    !signal.interpretationNotes ||
    !hookTemplateUsed ||
    !signal.contentAngle ||
    !signal.platformPriority ||
    !signal.suggestedFormatPriority
  ) {
    return null;
  }

  return {
    recordId: signal.recordId,
    sourceTitle: signal.sourceTitle,
    sourceType: signal.sourceType,
    sourcePublisher: signal.sourcePublisher,
    sourceDate: signal.sourceDate,
    sourceUrl: signal.sourceUrl,
    rawExcerpt: signal.rawExcerpt,
    manualSummary: signal.manualSummary,
    scenarioAngle: signal.scenarioAngle,
    signalCategory: signal.signalCategory,
    severityScore: signal.severityScore,
    signalSubtype: signal.signalSubtype,
    emotionalPattern: signal.emotionalPattern,
    teacherPainPoint: signal.teacherPainPoint,
    relevanceToZazaDraft: signal.relevanceToZazaDraft,
    riskToTeacher: signal.riskToTeacher,
    interpretationNotes: signal.interpretationNotes,
    hookTemplateUsed,
    contentAngle: signal.contentAngle,
    platformPriority: signal.platformPriority,
    suggestedFormatPriority: signal.suggestedFormatPriority,
  };
}

export function buildInitialGenerationFromSignal(signal: SignalRecord): SignalGenerationResult | null {
  if (
    !signal.xDraft ||
    !signal.linkedInDraft ||
    !signal.redditDraft ||
    !signal.imagePrompt ||
    !signal.videoScript ||
    !signal.ctaOrClosingLine ||
    !signal.hashtagsOrKeywords
  ) {
    return null;
  }

  const providerConfig = getGenerationProviderConfig();

  return {
    xDraft: signal.xDraft,
    linkedInDraft: signal.linkedInDraft,
    redditDraft: signal.redditDraft,
    imagePrompt: signal.imagePrompt,
    videoScript: signal.videoScript,
    ctaOrClosingLine: signal.ctaOrClosingLine,
    hashtagsOrKeywords: signal.hashtagsOrKeywords,
    generationSource: providerConfig.provider === "mock" ? "manual" : providerConfig.provider,
    generationModelVersion: signal.generationModelVersion ?? "manual-save",
    promptVersion: signal.promptVersion ?? GENERATION_PROMPT_VERSION,
    generatedAt: signal.createdDate,
  };
}

export async function generateDrafts(input: SignalGenerationInput): Promise<SignalGenerationResult> {
  const providerConfig = getGenerationProviderConfig();

  if (providerConfig.provider === "mock") {
    return buildMockDrafts(input);
  }

  const generation = await generateStructuredJson({
    systemPrompt: buildGenerationSystemPrompt(),
    userPrompt: buildGenerationUserPrompt(input),
    jsonSchema: GENERATION_JSON_SCHEMA,
  });

  const parsed = generationResultSchema.parse({
    ...JSON.parse(normaliseJsonEnvelope(generation.rawJson)),
    generationSource: generation.source,
    generationModelVersion: generation.modelVersion,
    promptVersion: GENERATION_PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  });

  return parsed;
}

export { GENERATION_PROMPT_VERSION, getSafeLlmErrorMessage };
