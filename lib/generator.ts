import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { buildAssetBundle, buildSignalAssetBundle, parseAssetBundle, stringifyAssetBundle } from "@/lib/assets";
import { GENERATION_JSON_SCHEMA, GENERATION_PROMPT_VERSION, buildGenerationSystemPrompt, buildGenerationUserPrompt } from "@/lib/generation-prompts";
import { generateStructuredJson, getGenerationProviderConfig, getSafeLlmErrorMessage } from "@/lib/llm";
import type { PatternSummary, SignalPattern } from "@/lib/pattern-definitions";
import { getPlatformIntentProfile } from "@/lib/platform-profiles";
import { getScenarioPriority } from "@/lib/scenario-angle";
import { generationResultSchema } from "@/types/api";
import { HOOK_TEMPLATES } from "@/types/signal";
import type { EditorialMode, SignalGenerationInput, SignalGenerationResult, SignalRecord } from "@/types/signal";
import { ZodError } from "zod";

export interface DraftGenerationRun {
  outputs: SignalGenerationResult;
  appliedPattern: PatternSummary | null;
  message: string;
  usedFallback: boolean;
}

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

function getModeLead(mode: EditorialMode): {
  xPrefix: string;
  linkedLead: string;
  redditLead: string;
  imageStyle: string;
  videoLead: string;
  close: string;
  keywords: string;
} {
  switch (mode) {
    case "risk_warning":
      return {
        xPrefix: "Professional risk teachers often miss:",
        linkedLead: "The hidden risk in this situation is not loud, but it is real.",
        redditLead: "This is one of those situations that can create avoidable professional risk if the wording is off.",
        imageStyle: "serious, protective, editorial",
        videoLead: "This is a communication risk, not a small admin detail.",
        close: "Professional safety often depends on how calmly the risk is named early.",
        keywords: "teacher risk, school communication, professional judgement",
      };
    case "helpful_tip":
      return {
        xPrefix: "One useful communication shift:",
        linkedLead: "A more useful way to look at this is as a practical wording decision.",
        redditLead: "If I were turning this into one useful takeaway, it would be this.",
        imageStyle: "clear, practical, editorial",
        videoLead: "One practical communication takeaway from this:",
        close: "Small wording changes can remove a surprising amount of friction.",
        keywords: "teacher tip, practical communication, school workflow",
      };
    case "thought_leadership":
      return {
        xPrefix: "What this says about the work:",
        linkedLead: "This signal is really pointing at a larger professional pattern.",
        redditLead: "Stepping back, this feels less like a one-off and more like a wider pattern in the work.",
        imageStyle: "thoughtful, reflective, editorial",
        videoLead: "Here is what this situation really reveals about the work.",
        close: "The larger pattern matters because teachers keep absorbing it quietly.",
        keywords: "teacher leadership, professional insight, school systems",
      };
    case "calm_insight":
      return {
        xPrefix: "A calmer reading of this:",
        linkedLead: "The clearest reading of this signal is quieter than it first appears.",
        redditLead: "What stands out to me here is the underlying pressure, not only the visible moment.",
        imageStyle: "calm, grounded, editorial",
        videoLead: "A calmer way to read this situation:",
        close: "Clarity often lowers the emotional temperature before anything else changes.",
        keywords: "teacher wellbeing, calm clarity, school communication",
      };
    case "this_could_happen_to_you":
      return {
        xPrefix: "This could happen to you faster than you think:",
        linkedLead: "This is the kind of communication situation that can become your problem very quickly.",
        redditLead: "This feels close because most teachers could end up in a version of this scenario.",
        imageStyle: "sharp, grounded, cautionary editorial",
        videoLead: "This could land on your desk too.",
        close: "The point is not fear. It is recognising the risk before it hardens.",
        keywords: "teacher risk, communication pressure, real school scenarios",
      };
    case "professional_guidance":
      return {
        xPrefix: "Professional guidance for this kind of message:",
        linkedLead: "This is best handled as a professional communication judgement call.",
        redditLead: "If the goal is to communicate this professionally, the wording discipline matters more than people think.",
        imageStyle: "professional, structured, editorial",
        videoLead: "Professional guidance for a situation like this:",
        close: "Professional clarity is often the safest form of support.",
        keywords: "professional guidance, teacher communication, documentation",
      };
    case "reassurance_deescalation":
      return {
        xPrefix: "A calmer way to handle this:",
        linkedLead: "In a tense situation like this, lower-temperature language matters first.",
        redditLead: "This feels like a case where the first job is to lower the temperature without losing clarity.",
        imageStyle: "steady, de-escalatory, editorial",
        videoLead: "When the tension rises, steadier language matters.",
        close: "De-escalation is often a form of protection, not softness.",
        keywords: "de-escalation, parent communication, calm response",
      };
    case "awareness":
    default:
      return {
        xPrefix: "A communication pattern worth noticing:",
        linkedLead: "This signal is worth noticing because the pattern is more common than it looks.",
        redditLead: "This feels like a communication pattern that deserves more attention.",
        imageStyle: "clear, observant, editorial",
        videoLead: "Here is the pattern worth noticing.",
        close: "Recognition is often the first useful step.",
        keywords: "teacher awareness, communication patterns, school reality",
      };
  }
}

function getPatternToneCue(pattern: SignalPattern | null | undefined): string | null {
  if (!pattern) {
    return null;
  }

  const fromDescription = pattern.description.split(".")[0]?.trim();
  if (fromDescription) {
    return fromDescription;
  }

  return pattern.exampleScenarioAngle?.trim() ?? null;
}

function toPatternSummary(pattern: SignalPattern | null | undefined): PatternSummary | null {
  if (!pattern) {
    return null;
  }

  return {
    id: pattern.id,
    name: pattern.name,
    description: pattern.description,
    patternType: pattern.patternType,
    lifecycleState: pattern.lifecycleState,
  };
}

export function buildMockDrafts(
  input: SignalGenerationInput,
  options?: {
    pattern?: SignalPattern | null;
    editorialMode?: EditorialMode;
  },
): SignalGenerationResult {
  const editorialMode = options?.editorialMode ?? "awareness";
  const modeDefinition = getEditorialModeDefinition(editorialMode);
  const modeLead = getModeLead(editorialMode);
  const linkedInProfile = getPlatformIntentProfile("linkedin");
  const redditProfile = getPlatformIntentProfile("reddit");
  const close = buildSoftClose(input);
  const preferredScenario = getScenarioPriority({
    scenarioAngle: input.scenarioAngle,
    sourceTitle: input.sourceTitle,
  }).preferredScenario;
  const scenarioLead = preferredScenario ?? input.sourceTitle;
  const patternCue = getPatternToneCue(options?.pattern);
  const patternDirection = patternCue ? ` Keep the tone aligned with this guidance: ${patternCue}.` : "";
  const patternStructureNote =
    options?.pattern?.exampleOutput
      ? " Shape the draft with the same calm clarity, but keep the wording original."
      : "";
  const draftResult: SignalGenerationResult = {
    xDraft: `${modeLead.xPrefix} ${scenarioLead}. ${input.riskToTeacher}${patternCue ? ` ${patternCue}.` : ""} ${modeLead.close}`.replace(/\s+/g, " ").trim(),
    linkedInDraft: `${input.hookTemplateUsed}\n\n${modeLead.linkedLead}\n\n${scenarioLead}\n\nWhat this really shows is ${input.contentAngle.toLowerCase()}. ${linkedInProfile.helperNote}.${patternDirection}${patternStructureNote}\n\n${modeDefinition.label} works here because ${modeDefinition.framing.toLowerCase()}\n\n${close}`,
    redditDraft: `${modeLead.redditLead}\n\nScenario: "${scenarioLead}".\n\nThe part that stands out is ${input.riskToTeacher.toLowerCase()}. ${redditProfile.helperNote}.${patternCue ? " I’d still want the wording to stay clear and non-defensive." : ""}\n\nHow would you handle this without making it sound colder than you mean?`,
    imagePrompt: `Create a ${modeLead.imageStyle} visual in a soft documentary editorial style. Show a teacher-centred scene connected to ${input.signalSubtype.toLowerCase()} and the scenario "${scenarioLead}". Keep the emotional tone ${input.emotionalPattern.toLowerCase()}, grounded in real school communication, with no clutter.${patternCue ? ` Let the composition feel ${patternCue.toLowerCase()}.` : ""} Reflect ${modeDefinition.label.toLowerCase()} intent without exaggeration. Optional text overlay idea: "${input.hookTemplateUsed}".`,
    videoScript: `Hook: ${modeLead.videoLead}\nIssue: ${scenarioLead}.\nIntent: ${modeDefinition.label}.\nTakeaway: ${input.riskToTeacher}${patternCue ? `\nPattern cue: ${patternCue}.` : ""}\nSoft close: ${modeLead.close}`,
    ctaOrClosingLine: modeLead.close,
    hashtagsOrKeywords: modeLead.keywords,
    generationSource: "mock",
    generationModelVersion: "mock-fixed-template-v1",
    promptVersion: GENERATION_PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  };
  const assetBundle = buildAssetBundle(input, draftResult, {
    editorialMode,
    pattern: options?.pattern ? toPatternSummary(options.pattern) : null,
  });

  return {
    ...draftResult,
    assetBundleJson: stringifyAssetBundle(assetBundle),
    preferredAssetType: assetBundle.suggestedPrimaryAssetType,
    selectedImageAssetId: assetBundle.imageAssets[0]?.id ?? null,
    selectedVideoConceptId: assetBundle.videoConcepts[0]?.id ?? null,
    generatedImageUrl: null,
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
  const assetBundle = parseAssetBundle(signal.assetBundleJson) ?? buildSignalAssetBundle(signal);

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
    assetBundleJson: signal.assetBundleJson,
    preferredAssetType: signal.preferredAssetType,
    selectedImageAssetId: signal.selectedImageAssetId ?? assetBundle?.imageAssets[0]?.id ?? null,
    selectedVideoConceptId: signal.selectedVideoConceptId ?? assetBundle?.videoConcepts[0]?.id ?? null,
    generatedImageUrl: signal.generatedImageUrl,
  };
}

export async function generateDrafts(
  input: SignalGenerationInput,
  options?: {
    pattern?: SignalPattern | null;
    editorialMode?: EditorialMode;
  },
): Promise<DraftGenerationRun> {
  const providerConfig = getGenerationProviderConfig();
  const appliedPattern = toPatternSummary(options?.pattern);
  const editorialMode = options?.editorialMode ?? "awareness";
  const editorialModeLabel = getEditorialModeDefinition(editorialMode).label;

  if (providerConfig.provider === "mock") {
    return {
      outputs: buildMockDrafts(input, options),
      appliedPattern,
      message: options?.pattern
        ? `Mock draft set returned in ${editorialModeLabel} mode with pattern guidance from ${options.pattern.name} because no live generation provider is configured.`
        : `Mock draft set returned in ${editorialModeLabel} mode for review because no live generation provider is configured.`,
      usedFallback: true,
    };
  }

  try {
    const generation = await generateStructuredJson({
      systemPrompt: buildGenerationSystemPrompt(editorialMode),
      userPrompt: buildGenerationUserPrompt(input, {
        pattern: options?.pattern,
        editorialMode,
      }),
      jsonSchema: GENERATION_JSON_SCHEMA,
    });

    const parsed = generationResultSchema.parse({
      ...JSON.parse(normaliseJsonEnvelope(generation.rawJson)),
      generationSource: generation.source,
      generationModelVersion: generation.modelVersion,
      promptVersion: GENERATION_PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
    });
    const assetBundle = buildAssetBundle(input, parsed, {
      editorialMode,
      pattern: appliedPattern,
    });
    const outputs: SignalGenerationResult = {
      ...parsed,
      assetBundleJson: stringifyAssetBundle(assetBundle),
      preferredAssetType: parsed.preferredAssetType ?? assetBundle.suggestedPrimaryAssetType,
      selectedImageAssetId: parsed.selectedImageAssetId ?? assetBundle.imageAssets[0]?.id ?? null,
      selectedVideoConceptId: parsed.selectedVideoConceptId ?? assetBundle.videoConcepts[0]?.id ?? null,
      generatedImageUrl: parsed.generatedImageUrl ?? null,
    };

    return {
      outputs,
      appliedPattern,
      message: options?.pattern
        ? `Drafts generated via ${generation.source} using ${generation.modelVersion} in ${editorialModeLabel} mode with pattern guidance from ${options.pattern.name}.`
        : `Drafts generated via ${generation.source} using ${generation.modelVersion} in ${editorialModeLabel} mode.`,
      usedFallback: false,
    };
  } catch (error) {
    const fallbackOutputs = buildMockDrafts(input, options);
    const message =
      error instanceof SyntaxError || error instanceof ZodError
        ? options?.pattern
          ? `Live generation parsing failed. Mock draft set returned in ${editorialModeLabel} mode with pattern guidance from ${options.pattern.name}.`
          : `Live generation parsing failed. Mock draft set returned in ${editorialModeLabel} mode for review.`
        : options?.pattern
          ? `Live generation was unavailable. Mock draft set returned in ${editorialModeLabel} mode with pattern guidance from ${options.pattern.name}.`
          : `Live generation was unavailable. Mock draft set returned in ${editorialModeLabel} mode for review.`;

    return {
      outputs: fallbackOutputs,
      appliedPattern,
      message,
      usedFallback: true,
    };
  }
}

export { GENERATION_PROMPT_VERSION, getSafeLlmErrorMessage };
