import { NextResponse } from "next/server";

import { listContentOpportunityState } from "@/lib/content-opportunities";
import type { FactoryInputRenderStatusResponse } from "@/types/api";

export const dynamic = "force-dynamic";

function buildDerivedStatus(
  generationState: NonNullable<
    FactoryInputRenderStatusResponse["generationState"]
  >,
): NonNullable<FactoryInputRenderStatusResponse["derivedStatus"]> {
  const briefApproved = Boolean(
    generationState.videoBriefApprovedAt && generationState.videoBriefApprovedBy,
  );
  const generationStarted = Boolean(generationState.generationRequest);
  const renderJobStatus = generationState.renderJob?.status ?? null;
  const renderCompleted = renderJobStatus === "completed";
  const assetReviewStatus = generationState.assetReview?.status ?? null;

  return {
    briefApproved,
    generationStarted,
    renderCompleted,
    assetPendingReview: assetReviewStatus === "pending_review",
    assetAccepted: assetReviewStatus === "accepted",
    assetRejected: assetReviewStatus === "rejected",
    renderJobStatus,
    lifecycleLabel:
      assetReviewStatus === "accepted"
        ? "accepted"
        : assetReviewStatus === "rejected"
          ? "rejected"
          : assetReviewStatus === "pending_review"
            ? "pending_review"
            : renderJobStatus === "failed"
              ? "failed"
              : renderJobStatus === "queued"
                ? "queued"
                : renderJobStatus === "submitted"
                  ? "submitted"
                  : renderJobStatus === "rendering"
                    ? "rendering"
            : renderCompleted
              ? "pending_review"
              : generationStarted
                ? "rendering"
                : briefApproved
                  ? "ready_to_generate"
                  : "awaiting_brief_approval",
  };
}

export async function GET(request: Request) {
  const opportunityId = new URL(request.url).searchParams.get("opportunityId")?.trim() ?? "";

  if (!opportunityId) {
    return NextResponse.json<FactoryInputRenderStatusResponse>(
      {
        success: false,
        opportunityId: null,
        generationState: null,
        derivedStatus: null,
        error: "Missing opportunityId query param.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await listContentOpportunityState();
    const opportunity = state.opportunities.find((item) => item.opportunityId === opportunityId);

    if (!opportunity) {
      return NextResponse.json<FactoryInputRenderStatusResponse>(
        {
          success: false,
          opportunityId,
          generationState: null,
          derivedStatus: null,
          error: "Content opportunity not found.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json<FactoryInputRenderStatusResponse>({
      success: true,
      opportunityId,
      generationState: opportunity.generationState,
      derivedStatus: opportunity.generationState
        ? buildDerivedStatus(opportunity.generationState)
        : {
            briefApproved: false,
            generationStarted: false,
            renderCompleted: false,
            assetPendingReview: false,
            assetAccepted: false,
            assetRejected: false,
            renderJobStatus: null,
            lifecycleLabel: "awaiting_brief_approval",
          },
      message: "Render status loaded.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputRenderStatusResponse>(
      {
        success: false,
        opportunityId,
        generationState: null,
        derivedStatus: null,
        error: error instanceof Error ? error.message : "Unable to load render status.",
      },
      { status: 500 },
    );
  }
}
