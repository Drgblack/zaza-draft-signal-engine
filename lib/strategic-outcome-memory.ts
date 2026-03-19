import { z } from "zod";

import type { PostingPlatform } from "@/lib/posting-memory";

export const STRATEGIC_VALUE_LEVELS = ["high", "medium", "low", "unclear"] as const;

export type StrategicValue = (typeof STRATEGIC_VALUE_LEVELS)[number];

export const strategicOutcomeSchema = z.object({
  id: z.string().trim().min(1),
  postingLogId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  platform: z.enum(["x", "linkedin", "reddit"]),
  recordedAt: z.string().trim().min(1),
  impressionsOrReach: z.number().int().min(0).nullable(),
  savesOrBookmarks: z.number().int().min(0).nullable(),
  sharesOrReposts: z.number().int().min(0).nullable(),
  commentsOrReplies: z.number().int().min(0).nullable(),
  clicks: z.number().int().min(0).nullable(),
  leadsOrSignups: z.number().int().min(0).nullable(),
  trialsOrConversions: z.number().int().min(0).nullable(),
  strategicValue: z.enum(STRATEGIC_VALUE_LEVELS),
  note: z.union([z.string().trim().min(1), z.null()]),
  actor: z.enum(["operator"]),
});

export type StrategicOutcome = z.infer<typeof strategicOutcomeSchema>;

export interface UpsertStrategicOutcomeInput {
  postingLogId: string;
  signalId: string;
  platform: PostingPlatform;
  impressionsOrReach?: number | null;
  savesOrBookmarks?: number | null;
  sharesOrReposts?: number | null;
  commentsOrReplies?: number | null;
  clicks?: number | null;
  leadsOrSignups?: number | null;
  trialsOrConversions?: number | null;
  strategicValue: StrategicValue;
  note?: string | null;
  actor?: "operator";
}

export const strategicOutcomeRequestSchema = z.object({
  impressionsOrReach: z.number().int().min(0).nullable().optional(),
  savesOrBookmarks: z.number().int().min(0).nullable().optional(),
  sharesOrReposts: z.number().int().min(0).nullable().optional(),
  commentsOrReplies: z.number().int().min(0).nullable().optional(),
  clicks: z.number().int().min(0).nullable().optional(),
  leadsOrSignups: z.number().int().min(0).nullable().optional(),
  trialsOrConversions: z.number().int().min(0).nullable().optional(),
  strategicValue: z.enum(STRATEGIC_VALUE_LEVELS),
  note: z.union([z.string(), z.null()]).optional(),
});

export function getStrategicValueLabel(value: StrategicValue): string {
  switch (value) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "unclear":
    default:
      return "Unclear";
  }
}
