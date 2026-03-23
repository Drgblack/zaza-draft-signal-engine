import { z } from "zod";

import { buildContentIntelligenceFromSignal } from "./strategic-intelligence-types";
import type { ZazaConnectExportPayload } from "./zaza-connect-bridge";

export const bridgeOpportunitySchema = z.object({
  candidateId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  expectedOutcomeTier: z.enum(["high", "medium", "low"]),
  reason: z.string().trim().min(1),
  href: z.string().trim().min(1),
  primaryPainPoint: z.string().trim().min(1).optional(),
  teacherLanguage: z.array(z.string().trim().min(1)).optional(),
  audienceSegment: z.string().trim().nullable().optional(),
  funnelStage: z.string().trim().nullable().optional(),
  commercialPotential: z.enum(["high", "medium", "low"]).optional(),
  trustRisk: z.enum(["low", "medium", "high"]).optional(),
  recommendedAngle: z.string().trim().min(1).optional(),
  recommendedHookDirection: z.string().trim().min(1).optional(),
  recommendedFormat: z.enum(["text", "carousel", "short_video", "multi_asset"]).optional(),
  recommendedPlatforms: z.array(z.string().trim().min(1)).optional(),
  whyNow: z.string().trim().min(1).optional(),
  proofPoints: z.array(z.string().trim().min(1)).optional(),
  trustNotes: z.array(z.string().trim().min(1)).optional(),
  sourceSignalIds: z.array(z.string().trim().min(1)).optional(),
});

export type BridgeOpportunity = z.infer<typeof bridgeOpportunitySchema>;

export const connectOpportunitySchema = z.object({
  opportunityId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  primaryPainPoint: z.string().trim().min(1),
  teacherLanguage: z.array(z.string().trim().min(1)).default([]),
  audienceSegment: z.string().trim().nullable().default(null),
  funnelStage: z.string().trim().nullable().default(null),
  commercialPotential: z.enum(["high", "medium", "low"]),
  trustRisk: z.enum(["low", "medium", "high"]),
  recommendedAngle: z.string().trim().min(1),
  recommendedHookDirection: z.string().trim().min(1),
  recommendedFormat: z.enum(["text", "carousel", "short_video", "multi_asset"]),
  recommendedPlatforms: z.array(z.string().trim().min(1)).default([]),
  whyNow: z.string().trim().min(1),
  proofPoints: z.array(z.string().trim().min(1)).default([]),
  trustNotes: z.array(z.string().trim().min(1)).default([]),
  sourceSignalIds: z.array(z.string().trim().min(1)).default([]),
});

export type ConnectOpportunity = z.infer<typeof connectOpportunitySchema>;

export const bridgeOpportunitiesResponseSchema = z.object({
  success: z.boolean(),
  exportId: z.string().trim().nullable().default(null),
  generatedAt: z.string().trim().nullable().default(null),
  opportunities: z.array(connectOpportunitySchema).default([]),
  strongContentCandidates: z.array(bridgeOpportunitySchema).default([]),
  message: z.string().trim().min(1),
  error: z.string().optional(),
});

export type BridgeOpportunitiesResponse = z.infer<
  typeof bridgeOpportunitiesResponseSchema
>;

function toConnectOpportunity(opportunity: BridgeOpportunity): ConnectOpportunity {
  const ci = buildContentIntelligenceFromSignal(opportunity);

  return connectOpportunitySchema.parse({
    opportunityId: opportunity.candidateId,
    title: opportunity.sourceTitle,
    primaryPainPoint: opportunity.primaryPainPoint ?? opportunity.reason,
    teacherLanguage: opportunity.teacherLanguage ?? [],
    audienceSegment: opportunity.audienceSegment ?? null,
    funnelStage: opportunity.funnelStage ?? null,
    commercialPotential: opportunity.commercialPotential ?? opportunity.expectedOutcomeTier,
    trustRisk: opportunity.trustRisk ?? "low",
    recommendedAngle: opportunity.recommendedAngle ?? opportunity.reason,
    recommendedHookDirection: opportunity.recommendedHookDirection ?? opportunity.reason,
    recommendedFormat: ci.recommendedFormat || opportunity.recommendedFormat || "text",
    recommendedPlatforms: opportunity.recommendedPlatforms ?? [opportunity.platform],
    whyNow: opportunity.whyNow ?? opportunity.reason,
    proofPoints: opportunity.proofPoints ?? [opportunity.reason],
    trustNotes: opportunity.trustNotes ?? [],
    sourceSignalIds: opportunity.sourceSignalIds ?? [opportunity.signalId],
  });
}

export function buildBridgeOpportunitiesResponse(
  latestExport: ZazaConnectExportPayload | null,
): BridgeOpportunitiesResponse {
  const strongContentCandidates = latestExport?.strongContentCandidates ?? [];
  const opportunities = strongContentCandidates.map((opportunity) =>
    toConnectOpportunity(bridgeOpportunitySchema.parse(opportunity)),
  );

  return bridgeOpportunitiesResponseSchema.parse({
    success: true,
    exportId: latestExport?.exportId ?? null,
    generatedAt: latestExport?.generatedAt ?? null,
    opportunities,
    strongContentCandidates,
    message: latestExport
      ? "Latest Zaza Connect opportunities loaded."
      : "No Zaza Connect export is available yet.",
  });
}
