import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  createAudienceSegment,
  createCampaign,
  createContentPillar,
  getCampaignStrategy,
  updateAudienceSegment,
  updateCampaign,
  updateContentPillar,
} from "@/lib/campaigns";
import {
  campaignManagementRequestSchema,
  createAudienceSegmentRequestSchema,
  createCampaignRequestSchema,
  createContentPillarRequestSchema,
  type CampaignManagementResponse,
  type CampaignStrategyResponse,
  updateAudienceSegmentRequestSchema,
  updateCampaignRequestSchema,
  updateContentPillarRequestSchema,
} from "@/types/api";

export async function GET() {
  try {
    const strategy = await getCampaignStrategy();

    return NextResponse.json<CampaignStrategyResponse>({
      success: true,
      strategy,
    });
  } catch (error) {
    return NextResponse.json<CampaignStrategyResponse>(
      {
        success: false,
        strategy: null,
        error: error instanceof Error ? error.message : "Unable to load campaign strategy.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = campaignManagementRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<CampaignManagementResponse>(
      {
        success: false,
        strategy: null,
        error: parsed.error.issues[0]?.message ?? "Invalid campaign request.",
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.kind === "campaign") {
      if (parsed.data.action === "create") {
        const { strategy, campaign } = await createCampaign(createCampaignRequestSchema.parse(parsed.data.data));
        await appendAuditEventsSafe([
          {
            signalId: `campaign:${campaign.id}`,
            eventType: "CAMPAIGN_CREATED",
            actor: "operator",
            summary: `Created campaign ${campaign.name}.`,
            metadata: {
              campaignId: campaign.id,
              status: campaign.status,
            },
          },
        ]);

        return NextResponse.json<CampaignManagementResponse>({
          success: true,
          strategy,
          campaign,
          message: "Campaign created.",
        });
      }

      const update = updateCampaignRequestSchema.parse(parsed.data.data);
      const { strategy, campaign } = await updateCampaign(update.id, update);
      if (!campaign) {
        return NextResponse.json<CampaignManagementResponse>(
          {
            success: false,
            strategy,
            campaign: null,
            error: "Campaign not found.",
          },
          { status: 404 },
        );
      }
      await appendAuditEventsSafe([
        {
          signalId: `campaign:${campaign.id}`,
          eventType: "CAMPAIGN_UPDATED",
          actor: "operator",
          summary: `Updated campaign ${campaign.name}.`,
          metadata: {
            campaignId: campaign.id,
            status: campaign.status,
          },
        },
      ]);

      return NextResponse.json<CampaignManagementResponse>({
        success: true,
        strategy,
        campaign,
        message: "Campaign updated.",
      });
    }

    if (parsed.data.kind === "pillar") {
      if (parsed.data.action === "create") {
        const { strategy, pillar } = await createContentPillar(createContentPillarRequestSchema.parse(parsed.data.data));
        return NextResponse.json<CampaignManagementResponse>({
          success: true,
          strategy,
          pillar,
          message: "Pillar created.",
        });
      }

      const update = updateContentPillarRequestSchema.parse(parsed.data.data);
      const { strategy, pillar } = await updateContentPillar(update.id, update);
      if (!pillar) {
        return NextResponse.json<CampaignManagementResponse>(
          {
            success: false,
            strategy,
            pillar: null,
            error: "Pillar not found.",
          },
          { status: 404 },
        );
      }

      return NextResponse.json<CampaignManagementResponse>({
        success: true,
        strategy,
        pillar,
        message: "Pillar updated.",
      });
    }

    if (parsed.data.action === "create") {
      const { strategy, audienceSegment } = await createAudienceSegment(
        createAudienceSegmentRequestSchema.parse(parsed.data.data),
      );
      return NextResponse.json<CampaignManagementResponse>({
        success: true,
        strategy,
        audienceSegment,
        message: "Audience segment created.",
      });
    }

    const update = updateAudienceSegmentRequestSchema.parse(parsed.data.data);
    const { strategy, audienceSegment } = await updateAudienceSegment(update.id, update);
    if (!audienceSegment) {
      return NextResponse.json<CampaignManagementResponse>(
        {
          success: false,
          strategy,
          audienceSegment: null,
          error: "Audience segment not found.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json<CampaignManagementResponse>({
      success: true,
      strategy,
      audienceSegment,
      message: "Audience segment updated.",
    });
  } catch (error) {
    return NextResponse.json<CampaignManagementResponse>(
      {
        success: false,
        strategy: null,
        error: error instanceof Error ? error.message : "Unable to update campaign strategy.",
      },
      { status: 500 },
    );
  }
}
