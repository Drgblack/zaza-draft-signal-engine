import { z } from "zod";

import type { PostingPlatform } from "@/lib/posting-memory";

export const OUTCOME_QUALITIES = ["strong", "acceptable", "weak"] as const;
export const REUSE_RECOMMENDATIONS = [
  "reuse_this_approach",
  "adapt_before_reuse",
  "do_not_repeat",
] as const;

export type OutcomeQuality = (typeof OUTCOME_QUALITIES)[number];
export type ReuseRecommendation = (typeof REUSE_RECOMMENDATIONS)[number];

export const postingOutcomeSchema = z.object({
  id: z.string().trim().min(1),
  postingLogId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  platform: z.enum(["x", "linkedin", "reddit"]),
  outcomeQuality: z.enum(OUTCOME_QUALITIES),
  reuseRecommendation: z.enum(REUSE_RECOMMENDATIONS),
  note: z.union([z.string().trim().min(1), z.null()]),
  timestamp: z.string().trim().min(1),
  actor: z.enum(["operator"]),
});

export type PostingOutcome = z.infer<typeof postingOutcomeSchema>;

export interface UpsertPostingOutcomeInput {
  postingLogId: string;
  signalId: string;
  platform: PostingPlatform;
  outcomeQuality: OutcomeQuality;
  reuseRecommendation: ReuseRecommendation;
  note?: string | null;
  actor?: "operator";
}

export const postingOutcomeRequestSchema = z.object({
  outcomeQuality: z.enum(OUTCOME_QUALITIES),
  reuseRecommendation: z.enum(REUSE_RECOMMENDATIONS),
  note: z.union([z.string(), z.null()]).optional(),
});

export function getOutcomeQualityLabel(value: OutcomeQuality): string {
  switch (value) {
    case "strong":
      return "Strong";
    case "acceptable":
      return "Acceptable";
    case "weak":
    default:
      return "Weak";
  }
}

export function getReuseRecommendationLabel(value: ReuseRecommendation): string {
  switch (value) {
    case "reuse_this_approach":
      return "Reuse this approach";
    case "adapt_before_reuse":
      return "Adapt before reuse";
    case "do_not_repeat":
    default:
      return "Do not repeat";
  }
}
