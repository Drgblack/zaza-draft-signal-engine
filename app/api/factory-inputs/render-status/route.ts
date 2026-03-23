import { NextResponse } from "next/server";

import { listContentOpportunityState } from "@/lib/content-opportunities";
import { resumeVideoFactoryRunQueue } from "@/lib/video-factory-runner";
import type { FactoryInputRenderStatusResponse } from "@/types/api";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function buildDerivedStatus(
  generationState: NonNullable<
    FactoryInputRenderStatusResponse["generationState"]
  >,
): NonNullable<FactoryInputRenderStatusResponse["derivedStatus"]> {
  const briefApproved = Boolean(
    generationState.videoBriefApprovedAt && generationState.videoBriefApprovedBy,
  );
  const factoryLifecycleStatus = generationState.factoryLifecycle?.status ?? null;
  const generationStarted = Boolean(
    generationState.factoryLifecycle ||
      generationState.generationRequest,
  );
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
    assetDiscarded: assetReviewStatus === "discarded",
    renderJobStatus,
    lifecycleLabel:
      assetReviewStatus === "accepted"
        ? "accepted"
        : assetReviewStatus === "rejected"
          ? "rejected"
          : assetReviewStatus === "discarded"
            ? "discarded"
          : factoryLifecycleStatus === "failed_permanent"
            ? "failed_permanent"
          : assetReviewStatus === "pending_review"
            ? "pending_review"
            : factoryLifecycleStatus === "retry_queued"
              ? "retry_queued"
            : factoryLifecycleStatus === "failed"
              ? "failed"
            : factoryLifecycleStatus === "queued"
              ? "queued"
            : factoryLifecycleStatus === "preparing" ||
                factoryLifecycleStatus === "generating_narration" ||
                factoryLifecycleStatus === "generating_visuals" ||
                factoryLifecycleStatus === "generating_captions" ||
                factoryLifecycleStatus === "composing"
              ? "rendering"
            : factoryLifecycleStatus === "generated" ||
                factoryLifecycleStatus === "review_pending"
              ? "pending_review"
            : factoryLifecycleStatus === "accepted"
              ? "accepted"
            : factoryLifecycleStatus === "rejected"
              ? "rejected"
            : factoryLifecycleStatus === "discarded"
              ? "discarded"
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
  const searchParams = new URL(request.url).searchParams;
  const opportunityId = searchParams.get("opportunityId")?.trim() ?? "";
  const jobId = searchParams.get("jobId")?.trim() ?? "";

  if (!opportunityId && !jobId) {
    return NextResponse.json<FactoryInputRenderStatusResponse>(
      {
        success: false,
        opportunityId: null,
        generationState: null,
        derivedStatus: null,
        error: "Missing opportunityId or jobId query param.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      },
    );
  }

  try {
    await resumeVideoFactoryRunQueue();
    const state = await listContentOpportunityState();
    const opportunity = state.opportunities.find((item) => {
      if (opportunityId && item.opportunityId === opportunityId) {
        return true;
      }

      if (!jobId) {
        return false;
      }

      return (
        item.generationState?.renderJob?.id === jobId ||
        item.generationState?.runLedger.some((entry) => entry.renderJobId === jobId)
      );
    });
    const resolvedOpportunityId = opportunity?.opportunityId ?? (opportunityId || null);

    if (!opportunity) {
      return NextResponse.json<FactoryInputRenderStatusResponse>(
        {
          success: false,
          opportunityId: resolvedOpportunityId,
          generationState: null,
          derivedStatus: null,
          error: jobId
            ? "Render job not found."
            : "Content opportunity not found.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    return NextResponse.json<FactoryInputRenderStatusResponse>({
      success: true,
      opportunityId: opportunity.opportunityId,
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
            assetDiscarded: false,
            renderJobStatus: null,
            lifecycleLabel: "awaiting_brief_approval",
          },
      message: "Render status loaded.",
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json<FactoryInputRenderStatusResponse>(
      {
        success: false,
        opportunityId: opportunityId || null,
        generationState: null,
        derivedStatus: null,
        error: error instanceof Error ? error.message : "Unable to load render status.",
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
