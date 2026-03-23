import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listContentOpportunityState } from "@/lib/content-opportunities";
import { buildContentIntelligenceFromSignal } from "@/lib/strategic-intelligence-types";

const strategicOpportunityResponseSchema = z.object({
  id: z.string().trim().min(1),
  contentIntelligence: z.object({
    recommendedFormat: z.string().trim().min(1),
    hookCandidates: z.array(z.string().trim().min(1)),
    selectedHook: z.string().trim().nullable().optional(),
    performanceDrivers: z.record(z.string(), z.number()),
    intendedViewerEffect: z.string().trim().nullable().optional(),
    suggestedCta: z.string().trim().nullable().optional(),
    productionComplexity: z.enum(["low", "medium", "high"]).nullable().optional(),
    rationale: z.string().trim().nullable().optional(),
  }),
  growthIntelligence: z
    .object({
      executionPriority: z.number().optional(),
      strategicValue: z.number().optional(),
      riskLevel: z.enum(["low", "medium", "high"]).optional(),
      learningValue: z.number().optional(),
      campaignFit: z.number().optional(),
      channelFit: z.record(z.string(), z.number()).optional(),
      executionPath: z
        .enum(["video_factory", "campaigns", "connect", "hold", "review"])
        .optional(),
      expectedOutcome: z.string().trim().nullable().optional(),
      reasoning: z.string().trim().nullable().optional(),
    })
    .nullable(),
  executionPath: z
    .enum(["video_factory", "campaigns", "connect", "hold", "review"])
    .nullable(),
});

const strategicOpportunitiesApiResponseSchema = z.object({
  generatedAt: z.string().trim().min(1),
  totalCount: z.number().int().nonnegative(),
  returnedCount: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  opportunities: z.array(strategicOpportunityResponseSchema),
});

type StrategicOpportunitiesApiResponse = z.infer<
  typeof strategicOpportunitiesApiResponseSchema
>;

export const dynamic = "force-dynamic";

function parseLimit(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("limit");
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(25, Math.floor(parsed));
}

export async function GET(request: NextRequest) {
  try {
    const limit = parseLimit(request);
    const state = await listContentOpportunityState();
    const opportunities = state.opportunities.slice(0, limit).map((opportunity) => ({
      id: opportunity.opportunityId,
      // Content Intelligence is a read-only projection over persisted opportunity fields.
      contentIntelligence: buildContentIntelligenceFromSignal(opportunity),
      // Growth Intelligence is returned exactly as persisted; it must only consume CI outputs.
      growthIntelligence: opportunity.growthIntelligence ?? null,
      executionPath: opportunity.growthIntelligence?.executionPath ?? null,
    }));

    return NextResponse.json<StrategicOpportunitiesApiResponse>(
      strategicOpportunitiesApiResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        totalCount: state.opportunities.length,
        returnedCount: opportunities.length,
        limit,
        opportunities,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load strategic opportunities.",
      },
      { status: 500 },
    );
  }
}
