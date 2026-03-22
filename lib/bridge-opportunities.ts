import { z } from "zod";

import type { ZazaConnectExportPayload } from "./zaza-connect-bridge";

export const bridgeOpportunitySchema = z.object({
  candidateId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  expectedOutcomeTier: z.enum(["high", "medium", "low"]),
  reason: z.string().trim().min(1),
  href: z.string().trim().min(1),
});

export type BridgeOpportunity = z.infer<typeof bridgeOpportunitySchema>;

export const bridgeOpportunitiesResponseSchema = z.object({
  success: z.boolean(),
  exportId: z.string().trim().nullable().default(null),
  generatedAt: z.string().trim().nullable().default(null),
  opportunities: z.array(bridgeOpportunitySchema).default([]),
  strongContentCandidates: z.array(bridgeOpportunitySchema).default([]),
  message: z.string().trim().min(1),
  error: z.string().optional(),
});

export type BridgeOpportunitiesResponse = z.infer<
  typeof bridgeOpportunitiesResponseSchema
>;

export function buildBridgeOpportunitiesResponse(
  latestExport: ZazaConnectExportPayload | null,
): BridgeOpportunitiesResponse {
  const opportunities = latestExport?.strongContentCandidates ?? [];

  return bridgeOpportunitiesResponseSchema.parse({
    success: true,
    exportId: latestExport?.exportId ?? null,
    generatedAt: latestExport?.generatedAt ?? null,
    opportunities,
    strongContentCandidates: opportunities,
    message: latestExport
      ? "Latest Zaza Connect opportunities loaded."
      : "No Zaza Connect export is available yet.",
  });
}
