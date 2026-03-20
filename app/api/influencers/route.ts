import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  addInfluencer,
  buildInfluencerGraphState,
  influencerGraphActionRequestSchema,
  recordInfluencerInteraction,
} from "@/lib/influencer-graph";
import type { InfluencerGraphActionResponse } from "@/types/api";

export async function GET() {
  const state = await buildInfluencerGraphState();

  return NextResponse.json<InfluencerGraphActionResponse>({
    success: true,
    influencer: null,
    interaction: null,
    rows: state.rows,
    summary: state.summary,
    message: "Influencer graph loaded.",
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = influencerGraphActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<InfluencerGraphActionResponse>(
      {
        success: false,
        influencer: null,
        interaction: null,
        rows: [],
        summary: null,
        message: "Influencer graph action could not be completed.",
        error: parsed.error.issues[0]?.message ?? "Invalid influencer graph payload.",
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "add_influencer") {
      const influencer = await addInfluencer({
        name: parsed.data.name,
        platform: parsed.data.platform,
        handle: parsed.data.handle ?? null,
        tags: parsed.data.tags ?? [],
        notes: parsed.data.notes ?? null,
      });
      const state = await buildInfluencerGraphState();

      await appendAuditEventsSafe([
        {
          signalId: `influencer:${influencer.influencerId}`,
          eventType: "INFLUENCER_ADDED",
          actor: "operator",
          summary: `Added influencer memory for ${influencer.name}.`,
          metadata: {
            platform: influencer.platform,
            relationshipStage: influencer.relationshipStage,
          },
        },
      ]);

      return NextResponse.json<InfluencerGraphActionResponse>({
        success: true,
        influencer,
        interaction: null,
        rows: state.rows,
        summary: state.summary,
        message: "Influencer added to relationship memory.",
      });
    }

    const result = await recordInfluencerInteraction({
      influencerId: parsed.data.influencerId,
      interactionType: parsed.data.interactionType,
      message: parsed.data.message ?? null,
      context: parsed.data.context ?? null,
      signalId: parsed.data.signalId ?? null,
      timestamp: parsed.data.timestamp ?? null,
    });
    const state = await buildInfluencerGraphState();

    await appendAuditEventsSafe([
      {
        signalId: result.interaction.signalId ?? `influencer:${result.influencer.influencerId}`,
        eventType: "INTERACTION_RECORDED",
        actor: "operator",
        summary: `Recorded ${result.interaction.interactionType.replaceAll("_", " ")} for ${result.influencer.name}.`,
        metadata: {
          influencerId: result.influencer.influencerId,
          interactionType: result.interaction.interactionType,
          relationshipStage: result.influencer.relationshipStage,
        },
      },
    ]);

    return NextResponse.json<InfluencerGraphActionResponse>({
      success: true,
      influencer: result.influencer,
      interaction: result.interaction,
      rows: state.rows,
      summary: state.summary,
      message: "Influencer interaction recorded.",
    });
  } catch (error) {
    return NextResponse.json<InfluencerGraphActionResponse>(
      {
        success: false,
        influencer: null,
        interaction: null,
        rows: [],
        summary: null,
        message: "Influencer graph action could not be completed.",
        error: error instanceof Error ? error.message : "Unknown influencer graph failure.",
      },
      { status: 500 },
    );
  }
}
