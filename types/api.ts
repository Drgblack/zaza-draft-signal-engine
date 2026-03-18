import { z } from "zod";

import {
  SIGNAL_CATEGORIES,
  SIGNAL_STATUSES,
  type PlatformPriority,
  type RelevanceToZazaDraft,
  type SeverityScore,
  type SignalCategory,
  type SignalDataSource,
  type SignalRecord,
  type SuggestedFormatPriority,
} from "@/types/signal";

const optionalNullableString = z.union([z.string(), z.null()]).optional();

export const createSignalRequestSchema = z.object({
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
});

export const interpretRequestSchema = z.object({
  sourceTitle: z.string().trim().min(1).optional(),
  rawExcerpt: optionalNullableString,
  manualSummary: optionalNullableString,
  signalCategory: z.enum(SIGNAL_CATEGORIES).nullable().optional(),
});

export const generateRequestSchema = z.object({
  sourceTitle: z.string().trim().min(1),
  signalCategory: z.enum(SIGNAL_CATEGORIES).nullable().optional(),
  severityScore: z.union([z.enum(["1", "2", "3"]), z.number().int().min(1).max(3)]).nullable().optional(),
  hookTemplateUsed: optionalNullableString,
  contentAngle: optionalNullableString,
});

export interface SignalsApiResponse {
  success: boolean;
  source: SignalDataSource;
  signals: SignalRecord[];
  error?: string;
}

export interface CreateSignalApiResponse {
  success: boolean;
  source: SignalDataSource;
  persisted: boolean;
  signal: SignalRecord;
  message: string;
}

export interface InterpretationResponse {
  success: true;
  interpretation: {
    signalCategory: SignalCategory;
    severityScore: SeverityScore;
    relevanceToZazaDraft: RelevanceToZazaDraft;
    hookTemplateUsed: string;
    interpretationNotes: string;
    platformPriority: PlatformPriority;
    suggestedFormatPriority: SuggestedFormatPriority;
  };
}

export interface GenerationResponse {
  success: true;
  outputs: {
    xDraft: string;
    linkedInDraft: string;
    redditDraft: string;
    imagePrompt: string;
    videoScript: string;
    ctaOrClosingLine: string;
  };
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

export const DEFAULT_INTERPRETATION = {
  signalCategory: "Stress" as SignalCategory,
  severityScore: 2 as SeverityScore,
  relevanceToZazaDraft: "High" as RelevanceToZazaDraft,
  hookTemplateUsed: "Name the hidden friction",
  platformPriority: "LinkedIn First" as PlatformPriority,
  suggestedFormatPriority: "Text" as SuggestedFormatPriority,
};
