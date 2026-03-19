import { z } from "zod";

export const FEEDBACK_ACTORS = ["operator"] as const;
export const FEEDBACK_CATEGORIES = ["signal", "scenario", "copilot", "output", "source"] as const;
export const FEEDBACK_VALUES = [
  "useful_signal",
  "weak_signal",
  "irrelevant_signal",
  "strong_framing",
  "weak_framing",
  "good_recommendation",
  "bad_recommendation",
  "strong_output",
  "weak_output",
  "needs_revision",
  "high_quality_source",
  "noisy_source",
] as const;

export type FeedbackActor = (typeof FEEDBACK_ACTORS)[number];
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackValue = (typeof FEEDBACK_VALUES)[number];

export const FEEDBACK_VALUE_DEFINITIONS: Record<
  FeedbackValue,
  {
    category: FeedbackCategory;
    buttonLabel: string;
    label: string;
    auditSummary: string;
  }
> = {
  useful_signal: {
    category: "signal",
    buttonLabel: "Useful",
    label: "Useful signal",
    auditSummary: "Marked signal as useful.",
  },
  weak_signal: {
    category: "signal",
    buttonLabel: "Weak",
    label: "Weak signal",
    auditSummary: "Marked signal as weak.",
  },
  irrelevant_signal: {
    category: "signal",
    buttonLabel: "Irrelevant",
    label: "Irrelevant signal",
    auditSummary: "Marked signal as irrelevant.",
  },
  strong_framing: {
    category: "scenario",
    buttonLabel: "Strong framing",
    label: "Strong framing",
    auditSummary: "Marked scenario framing as strong.",
  },
  weak_framing: {
    category: "scenario",
    buttonLabel: "Weak framing",
    label: "Weak framing",
    auditSummary: "Marked scenario framing as weak.",
  },
  good_recommendation: {
    category: "copilot",
    buttonLabel: "Good recommendation",
    label: "Good recommendation",
    auditSummary: "Marked recommendation as good.",
  },
  bad_recommendation: {
    category: "copilot",
    buttonLabel: "Bad recommendation",
    label: "Bad recommendation",
    auditSummary: "Marked recommendation as bad.",
  },
  strong_output: {
    category: "output",
    buttonLabel: "Strong output",
    label: "Strong output",
    auditSummary: "Marked output as strong.",
  },
  weak_output: {
    category: "output",
    buttonLabel: "Weak output",
    label: "Weak output",
    auditSummary: "Marked output as weak.",
  },
  needs_revision: {
    category: "output",
    buttonLabel: "Needs revision",
    label: "Needs revision",
    auditSummary: "Marked output as needing revision.",
  },
  high_quality_source: {
    category: "source",
    buttonLabel: "High-quality source",
    label: "High-quality source",
    auditSummary: "Marked source as high quality.",
  },
  noisy_source: {
    category: "source",
    buttonLabel: "Noisy source",
    label: "Noisy source",
    auditSummary: "Marked source as noisy.",
  },
};

export const FEEDBACK_CATEGORY_DEFINITIONS: Record<
  FeedbackCategory,
  {
    label: string;
    description: string;
  }
> = {
  signal: {
    label: "Signal quality",
    description: "Was the record itself useful, weak, or irrelevant?",
  },
  scenario: {
    label: "Scenario Angle",
    description: "Was the framing strong enough to shape the record well?",
  },
  copilot: {
    label: "Co-Pilot recommendation",
    description: "Was the recommended next action helpful?",
  },
  output: {
    label: "Output quality",
    description: "Was the interpretation or draft output strong enough, weak, or in need of revision?",
  },
  source: {
    label: "Source quality",
    description: "Is this source worth more manual attention, or is it noisy?",
  },
};

const feedbackMetadataSchema = z.string().trim().max(280).nullable().optional();

export const feedbackEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    signalId: z.string().trim().min(1),
    timestamp: z.string().trim().min(1),
    category: z.enum(FEEDBACK_CATEGORIES),
    value: z.enum(FEEDBACK_VALUES),
    note: feedbackMetadataSchema,
    actor: z.enum(FEEDBACK_ACTORS),
  })
  .superRefine((value, context) => {
    if (FEEDBACK_VALUE_DEFINITIONS[value.value].category !== value.category) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Feedback value does not match the selected feedback category.",
        path: ["value"],
      });
    }
  });

export const createFeedbackRequestSchema = z
  .object({
    category: z.enum(FEEDBACK_CATEGORIES),
    value: z.enum(FEEDBACK_VALUES),
    note: z.union([z.string().trim().max(280), z.null()]).optional(),
  })
  .superRefine((value, context) => {
    if (FEEDBACK_VALUE_DEFINITIONS[value.value].category !== value.category) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Feedback value does not match the selected feedback category.",
        path: ["value"],
      });
    }
  });

export type SignalFeedback = z.infer<typeof feedbackEntrySchema>;

export function getFeedbackLabel(value: FeedbackValue): string {
  return FEEDBACK_VALUE_DEFINITIONS[value].label;
}

export function getFeedbackButtonLabel(value: FeedbackValue): string {
  return FEEDBACK_VALUE_DEFINITIONS[value].buttonLabel;
}

export function getFeedbackAuditSummary(value: FeedbackValue): string {
  return FEEDBACK_VALUE_DEFINITIONS[value].auditSummary;
}

export function getFeedbackValuesForCategory(category: FeedbackCategory): FeedbackValue[] {
  return FEEDBACK_VALUES.filter((value) => FEEDBACK_VALUE_DEFINITIONS[value].category === category);
}

export function getLatestFeedbackByCategory(entries: SignalFeedback[]): Partial<Record<FeedbackCategory, SignalFeedback>> {
  const latest: Partial<Record<FeedbackCategory, SignalFeedback>> = {};

  for (const entry of [...entries].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())) {
    if (!latest[entry.category]) {
      latest[entry.category] = entry;
    }
  }

  return latest;
}

export function getFeedbackCountByCategory(entries: SignalFeedback[]): Record<FeedbackCategory, number> {
  return entries.reduce<Record<FeedbackCategory, number>>(
    (counts, entry) => {
      counts[entry.category] += 1;
      return counts;
    },
    {
      signal: 0,
      scenario: 0,
      copilot: 0,
      output: 0,
      source: 0,
    },
  );
}
