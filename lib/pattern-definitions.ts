import { z } from "zod";

export const PATTERN_TYPES = ["signal", "scenario", "output", "hybrid"] as const;
export const PATTERN_LIFECYCLE_STATES = ["active", "retired"] as const;

export type PatternType = (typeof PATTERN_TYPES)[number];
export type PatternLifecycleState = (typeof PATTERN_LIFECYCLE_STATES)[number];

export const PATTERN_TYPE_LABELS: Record<PatternType, string> = {
  signal: "Signal",
  scenario: "Scenario",
  output: "Output",
  hybrid: "Hybrid",
};

const optionalNullableString = z.union([z.string(), z.null()]).optional();

export const patternSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(600),
  patternType: z.enum(PATTERN_TYPES),
  lifecycleState: z.enum(PATTERN_LIFECYCLE_STATES).default("active"),
  sourceContext: z.union([z.string().trim().min(1), z.null()]),
  exampleSignalId: z.union([z.string().trim().min(1), z.null()]),
  exampleSignalTitle: z.union([z.string().trim().min(1), z.null()]),
  exampleSignalSummary: z.union([z.string().trim().min(1), z.null()]),
  exampleScenarioAngle: z.union([z.string().trim().min(1), z.null()]),
  exampleOutput: z.union([z.string().trim().min(1), z.null()]),
  tags: z.array(z.string().trim().min(1).max(40)).max(8),
  createdAt: z.string().trim().min(1),
  createdBy: z.string().trim().min(1).max(80),
});

export type SignalPattern = z.infer<typeof patternSchema>;

export interface PatternSummary {
  id: string;
  name: string;
  description: string;
  patternType: PatternType;
  lifecycleState: PatternLifecycleState;
  bundleNames?: string[];
}

export interface PatternFormValues {
  name: string;
  description: string;
  patternType: PatternType;
  sourceContext: string;
  exampleSignalId: string;
  exampleSignalTitle: string;
  exampleSignalSummary: string;
  exampleScenarioAngle: string;
  exampleOutput: string;
  tags: string[];
}

const tagsInputSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(8)
  .optional()
  .transform((value) => value ?? []);

export const createPatternRequestSchema = z.object({
  signalId: optionalNullableString,
  createdFromCoverageGap: z.boolean().optional(),
  coverageGapType: optionalNullableString,
  coverageGapReason: optionalNullableString,
  name: z.string().trim().min(1, "Pattern name is required.").max(120),
  description: z.string().trim().min(1, "Pattern description is required.").max(600),
  patternType: z.enum(PATTERN_TYPES),
  sourceContext: optionalNullableString,
  exampleSignalId: optionalNullableString,
  exampleSignalTitle: optionalNullableString,
  exampleSignalSummary: optionalNullableString,
  exampleScenarioAngle: optionalNullableString,
  exampleOutput: optionalNullableString,
  tags: tagsInputSchema,
  createdBy: z.string().trim().min(1).max(80).optional(),
});

export const updatePatternRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(600).optional(),
    patternType: z.enum(PATTERN_TYPES).optional(),
    lifecycleState: z.enum(PATTERN_LIFECYCLE_STATES).optional(),
    sourceContext: optionalNullableString,
    exampleSignalId: optionalNullableString,
    exampleSignalTitle: optionalNullableString,
    exampleSignalSummary: optionalNullableString,
    exampleScenarioAngle: optionalNullableString,
    exampleOutput: optionalNullableString,
    tags: tagsInputSchema,
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "Provide at least one pattern field to update.",
  });

export function normalizePatternText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePatternTags(tags: string[] | null | undefined): string[] {
  if (!tags) {
    return [];
  }

  const deduped = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    deduped.add(normalized.slice(0, 40));
    if (deduped.size >= 8) {
      break;
    }
  }

  return Array.from(deduped);
}

export function tagsToInput(tags: string[]): string {
  return tags.join(", ");
}
