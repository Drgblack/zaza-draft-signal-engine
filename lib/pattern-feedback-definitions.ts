import { z } from "zod";

export const PATTERN_FEEDBACK_VALUES = [
  "effective_pattern",
  "needs_refinement",
  "weak_pattern",
] as const;

export type PatternFeedbackValue = (typeof PATTERN_FEEDBACK_VALUES)[number];

export const PATTERN_FEEDBACK_VALUE_DEFINITIONS: Record<
  PatternFeedbackValue,
  {
    label: string;
    buttonLabel: string;
    auditSummary: string;
  }
> = {
  effective_pattern: {
    label: "Effective pattern",
    buttonLabel: "Effective",
    auditSummary: "Marked pattern as effective.",
  },
  needs_refinement: {
    label: "Needs refinement",
    buttonLabel: "Needs refinement",
    auditSummary: "Marked pattern as needing refinement.",
  },
  weak_pattern: {
    label: "Weak pattern",
    buttonLabel: "Weak",
    auditSummary: "Marked pattern as weak.",
  },
};

export const patternFeedbackEntrySchema = z.object({
  id: z.string().trim().min(1),
  patternId: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
  value: z.enum(PATTERN_FEEDBACK_VALUES),
  note: z.union([z.string().trim().min(1), z.null()]),
  actor: z.literal("operator"),
});

export const createPatternFeedbackRequestSchema = z.object({
  value: z.enum(PATTERN_FEEDBACK_VALUES),
  note: z.union([z.string(), z.null()]).optional(),
});

export type PatternFeedbackEntry = z.infer<typeof patternFeedbackEntrySchema>;

export function getPatternFeedbackLabel(value: PatternFeedbackValue): string {
  return PATTERN_FEEDBACK_VALUE_DEFINITIONS[value].label;
}

export function getPatternFeedbackButtonLabel(value: PatternFeedbackValue): string {
  return PATTERN_FEEDBACK_VALUE_DEFINITIONS[value].buttonLabel;
}

export function getPatternFeedbackAuditSummary(value: PatternFeedbackValue): string {
  return PATTERN_FEEDBACK_VALUE_DEFINITIONS[value].auditSummary;
}
