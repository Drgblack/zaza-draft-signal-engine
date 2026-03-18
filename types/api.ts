import { z } from "zod";

import {
  GENERATION_SOURCES,
  HOOK_TEMPLATES,
  INTERPRETATION_CONFIDENCE_LEVELS,
  INTERPRETATION_SOURCES,
  PLATFORM_PRIORITIES,
  RELEVANCE_LEVELS,
  SIGNAL_CATEGORIES,
  SIGNAL_STATUSES,
  SUGGESTED_FORMAT_PRIORITIES,
  type HookTemplate,
  type InterpretationConfidence,
  type InterpretationSource,
  type PlatformPriority,
  type RelevanceToZazaDraft,
  type SignalCreatePayload,
  type SignalGenerationInput,
  type SignalGenerationResult,
  type SignalGenerationSavePayload,
  type SignalInterpretationInput,
  type SignalInterpretationSavePayload,
  type SeverityScore,
  type SignalCategory,
  type SignalDataSource,
  type SignalRecord,
  type SuggestedFormatPriority,
} from "@/types/signal";

const optionalNullableString = z.union([z.string(), z.null()]).optional();

export const createSignalRequestSchema = z
  .object({
    sourceUrl: optionalNullableString,
    sourceTitle: z.string().trim().min(1, "Source title is required."),
    sourceType: optionalNullableString,
    sourcePublisher: optionalNullableString,
    sourceDate: optionalNullableString,
    rawExcerpt: optionalNullableString,
    manualSummary: optionalNullableString,
    signalCategory: z.enum(SIGNAL_CATEGORIES).nullable().optional(),
    severityScore: z.union([z.enum(["1", "2", "3"]), z.number().int().min(1).max(3)]).nullable().optional(),
    hookTemplateUsed: optionalNullableString,
    status: z.enum(SIGNAL_STATUSES).optional(),
  })
  .superRefine((value, context) => {
    if (!normalizeOptionalString(value.rawExcerpt) && !normalizeOptionalString(value.manualSummary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one of raw excerpt or manual summary.",
        path: ["rawExcerpt"],
      });
    }
  });

export const statusFilterSchema = z.object({
  status: z.enum(SIGNAL_STATUSES).optional(),
});

export const interpretRequestSchema = z.object({
  signalId: z.string().trim().min(1).optional(),
  signal: z
    .object({
      recordId: z.string().trim().min(1).optional(),
      sourceTitle: z.string().trim().min(1, "Source title is required."),
      sourceType: optionalNullableString,
      sourcePublisher: optionalNullableString,
      sourceDate: optionalNullableString,
      sourceUrl: optionalNullableString,
      rawExcerpt: optionalNullableString,
      manualSummary: optionalNullableString,
    })
    .optional(),
}).superRefine((value, context) => {
  if (!value.signalId && !value.signal) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either a signalId or a structured signal payload.",
      path: ["signalId"],
    });
  }
});

export const interpretationResultSchema = z.object({
  signalCategory: z.enum(SIGNAL_CATEGORIES),
  severityScore: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  signalSubtype: z.string().trim().min(1),
  emotionalPattern: z.string().trim().min(1),
  teacherPainPoint: z.string().trim().min(1),
  relevanceToZazaDraft: z.enum(RELEVANCE_LEVELS),
  riskToTeacher: z.string().trim().min(1),
  interpretationNotes: z.string().trim().min(1),
  hookTemplateUsed: z.enum(HOOK_TEMPLATES),
  contentAngle: z.string().trim().min(1),
  platformPriority: z.enum(PLATFORM_PRIORITIES),
  suggestedFormatPriority: z.enum(SUGGESTED_FORMAT_PRIORITIES),
  interpretationConfidence: z.enum(INTERPRETATION_CONFIDENCE_LEVELS),
  interpretationSource: z.enum(INTERPRETATION_SOURCES),
  interpretedAt: z.string().trim().min(1),
});

export const saveInterpretationRequestSchema = interpretationResultSchema.extend({
  status: z.enum(SIGNAL_STATUSES).optional(),
});

export const generationSignalSchema = z.object({
  recordId: z.string().trim().min(1).optional(),
  sourceTitle: z.string().trim().min(1),
  sourceType: optionalNullableString,
  sourcePublisher: optionalNullableString,
  sourceDate: optionalNullableString,
  sourceUrl: optionalNullableString,
  rawExcerpt: optionalNullableString,
  manualSummary: optionalNullableString,
  signalCategory: z.enum(SIGNAL_CATEGORIES),
  severityScore: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  signalSubtype: z.string().trim().min(1),
  emotionalPattern: z.string().trim().min(1),
  teacherPainPoint: z.string().trim().min(1),
  relevanceToZazaDraft: z.enum(RELEVANCE_LEVELS),
  riskToTeacher: z.string().trim().min(1),
  interpretationNotes: z.string().trim().min(1),
  hookTemplateUsed: z.enum(HOOK_TEMPLATES),
  contentAngle: z.string().trim().min(1),
  platformPriority: z.enum(PLATFORM_PRIORITIES),
  suggestedFormatPriority: z.enum(SUGGESTED_FORMAT_PRIORITIES),
});

export const generateRequestSchema = z
  .object({
    signalId: z.string().trim().min(1).optional(),
    signal: generationSignalSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.signalId && !value.signal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either a signalId or a generation payload.",
        path: ["signalId"],
      });
    }
  });

export const generationResultSchema = z.object({
  xDraft: z.string().trim().min(1),
  linkedInDraft: z.string().trim().min(1),
  redditDraft: z.string().trim().min(1),
  imagePrompt: z.string().trim().min(1),
  videoScript: z.string().trim().min(1),
  ctaOrClosingLine: z.string().trim().min(1),
  hashtagsOrKeywords: z.string().trim().min(1),
  generationSource: z.enum(GENERATION_SOURCES),
  generationModelVersion: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1),
  generatedAt: z.string().trim().min(1),
});

export const saveGenerationRequestSchema = generationResultSchema.extend({
  status: z.enum(SIGNAL_STATUSES).optional(),
});

export interface SignalsApiResponse {
  success: boolean;
  source: SignalDataSource;
  signals: SignalRecord[];
  message?: string;
  error?: string;
}

export interface CreateSignalApiResponse {
  success: boolean;
  source: SignalDataSource;
  persisted: boolean;
  signal: SignalRecord;
  message: string;
  errorCode?: "validation_error" | "airtable_error" | "unknown_error";
}

export interface AirtableHealthResponse {
  success: boolean;
  diagnostics: {
    configured: boolean;
    apiReachable: boolean;
    tableReachable: boolean;
    schemaAligned: boolean;
    mappingSucceeded: boolean;
    mode: SignalDataSource;
    missingFields: string[];
    message: string;
  };
}

export interface InterpretationResponse {
  success: true;
  signal: SignalInterpretationInput;
  interpretation: {
    signalCategory: SignalCategory;
    severityScore: SeverityScore;
    signalSubtype: string;
    emotionalPattern: string;
    teacherPainPoint: string;
    relevanceToZazaDraft: RelevanceToZazaDraft;
    riskToTeacher: string;
    hookTemplateUsed: HookTemplate;
    contentAngle: string;
    interpretationConfidence: InterpretationConfidence;
    interpretationSource: InterpretationSource;
    interpretedAt: string;
    interpretationNotes: string;
    platformPriority: PlatformPriority;
    suggestedFormatPriority: SuggestedFormatPriority;
  };
}

export interface SaveInterpretationResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  signal: SignalRecord;
  message: string;
  error?: string;
}

export interface GenerationResponse {
  success: true;
  signal: SignalGenerationInput;
  outputs: SignalGenerationResult;
}

export interface SaveGenerationResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  signal: SignalRecord;
  message: string;
  error?: string;
}

export function normalizeSeverityScore(value: unknown): SeverityScore | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = typeof value === "string" ? Number(value) : value;
  if (numericValue === 1 || numericValue === 2 || numericValue === 3) {
    return numericValue;
  }

  return null;
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toCreateSignalPayload(value: z.infer<typeof createSignalRequestSchema>): SignalCreatePayload {
  return {
    sourceUrl: normalizeOptionalString(value.sourceUrl),
    sourceTitle: value.sourceTitle.trim(),
    sourceType: normalizeOptionalString(value.sourceType),
    sourcePublisher: normalizeOptionalString(value.sourcePublisher),
    sourceDate: normalizeOptionalString(value.sourceDate),
    rawExcerpt: normalizeOptionalString(value.rawExcerpt),
    manualSummary: normalizeOptionalString(value.manualSummary),
    signalCategory: value.signalCategory ?? null,
    severityScore: normalizeSeverityScore(value.severityScore),
    hookTemplateUsed: normalizeOptionalString(value.hookTemplateUsed),
    status: value.status ?? "New",
  };
}

export function toInterpretationInput(
  value: NonNullable<z.infer<typeof interpretRequestSchema>["signal"]>,
): SignalInterpretationInput {
  return {
    recordId: value.recordId,
    sourceTitle: value.sourceTitle.trim(),
    sourceType: normalizeOptionalString(value.sourceType),
    sourcePublisher: normalizeOptionalString(value.sourcePublisher),
    sourceDate: normalizeOptionalString(value.sourceDate),
    sourceUrl: normalizeOptionalString(value.sourceUrl),
    rawExcerpt: normalizeOptionalString(value.rawExcerpt),
    manualSummary: normalizeOptionalString(value.manualSummary),
  };
}

export function toInterpretationSavePayload(
  value: z.infer<typeof saveInterpretationRequestSchema>,
): SignalInterpretationSavePayload {
  return {
    signalCategory: value.signalCategory,
    severityScore: value.severityScore,
    signalSubtype: value.signalSubtype.trim(),
    emotionalPattern: value.emotionalPattern.trim(),
    teacherPainPoint: value.teacherPainPoint.trim(),
    relevanceToZazaDraft: value.relevanceToZazaDraft,
    riskToTeacher: value.riskToTeacher.trim(),
    interpretationNotes: value.interpretationNotes.trim(),
    hookTemplateUsed: value.hookTemplateUsed,
    contentAngle: value.contentAngle.trim(),
    platformPriority: value.platformPriority,
    suggestedFormatPriority: value.suggestedFormatPriority,
    interpretationConfidence: value.interpretationConfidence,
    interpretationSource: value.interpretationSource,
    interpretedAt: value.interpretedAt,
    status: value.status,
  };
}

export function toGenerationInput(
  value: z.infer<typeof generationSignalSchema>,
): SignalGenerationInput {
  return {
    recordId: value.recordId,
    sourceTitle: value.sourceTitle.trim(),
    sourceType: normalizeOptionalString(value.sourceType),
    sourcePublisher: normalizeOptionalString(value.sourcePublisher),
    sourceDate: normalizeOptionalString(value.sourceDate),
    sourceUrl: normalizeOptionalString(value.sourceUrl),
    rawExcerpt: normalizeOptionalString(value.rawExcerpt),
    manualSummary: normalizeOptionalString(value.manualSummary),
    signalCategory: value.signalCategory,
    severityScore: value.severityScore,
    signalSubtype: value.signalSubtype.trim(),
    emotionalPattern: value.emotionalPattern.trim(),
    teacherPainPoint: value.teacherPainPoint.trim(),
    relevanceToZazaDraft: value.relevanceToZazaDraft,
    riskToTeacher: value.riskToTeacher.trim(),
    interpretationNotes: value.interpretationNotes.trim(),
    hookTemplateUsed: value.hookTemplateUsed,
    contentAngle: value.contentAngle.trim(),
    platformPriority: value.platformPriority,
    suggestedFormatPriority: value.suggestedFormatPriority,
  };
}

export function toGenerationSavePayload(
  value: z.infer<typeof saveGenerationRequestSchema>,
): SignalGenerationSavePayload {
  return {
    xDraft: value.xDraft.trim(),
    linkedInDraft: value.linkedInDraft.trim(),
    redditDraft: value.redditDraft.trim(),
    imagePrompt: value.imagePrompt.trim(),
    videoScript: value.videoScript.trim(),
    ctaOrClosingLine: value.ctaOrClosingLine.trim(),
    hashtagsOrKeywords: value.hashtagsOrKeywords.trim(),
    generationSource: value.generationSource,
    generationModelVersion: value.generationModelVersion.trim(),
    promptVersion: value.promptVersion.trim(),
    generatedAt: value.generatedAt,
    status: value.status,
  };
}

export const DEFAULT_INTERPRETATION = {
  signalCategory: "Stress" as SignalCategory,
  severityScore: 2 as SeverityScore,
  relevanceToZazaDraft: "High" as RelevanceToZazaDraft,
  hookTemplateUsed: "This sounds fine… but it isn’t",
  platformPriority: "LinkedIn First" as PlatformPriority,
  suggestedFormatPriority: "Text" as SuggestedFormatPriority,
};
