import { jsonError, jsonSuccess, parseJsonBody } from "@/lib/api-route";
import { getContentOpportunityRepository } from "@/lib/content-opportunity-repository";
import { getFactoryPublishOutcomeRepository } from "@/lib/factory-publish-outcome-repository";
import {
  factoryInputPublishOutcomeRequestSchema,
  type FactoryInputPublishOutcomeResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

const contentOpportunityRepository = getContentOpportunityRepository();
const publishOutcomeRepository = getFactoryPublishOutcomeRepository();

async function findAcceptedFactoryContext(opportunityId: string) {
  const state = await contentOpportunityRepository.getState();
  const opportunity = state.opportunities.find(
    (item) => item.opportunityId === opportunityId,
  );
  const generationState = opportunity?.generationState ?? null;

  if (
    !opportunity ||
    !generationState?.renderedAsset ||
    !generationState.assetReview ||
    generationState.assetReview.status !== "accepted"
  ) {
    return null;
  }

  const videoBriefId =
    opportunity.selectedVideoBrief?.id ??
    generationState.renderJob?.compiledProductionPlan?.videoBriefId ??
    generationState.factoryLifecycle?.videoBriefId ??
    null;
  const renderJobId = generationState.renderJob?.id ?? null;

  if (!videoBriefId || !renderJobId) {
    return null;
  }

  return {
    opportunity,
    videoBriefId,
    factoryJobId: generationState.factoryLifecycle?.factoryJobId ?? null,
    renderJobId,
    renderedAssetId: generationState.renderedAsset.id,
    assetReviewId: generationState.assetReview.id,
  };
}

export async function GET(request: Request) {
  const opportunityId =
    new URL(request.url).searchParams.get("opportunityId")?.trim() ?? "";

  if (!opportunityId) {
    return jsonError<FactoryInputPublishOutcomeResponse>(
      {
        success: false,
        opportunityId: null,
        publishOutcome: null,
        error: "Missing opportunityId query param.",
      },
      400,
    );
  }

  try {
    const acceptedContext = await findAcceptedFactoryContext(opportunityId);

    if (!acceptedContext) {
      return jsonSuccess<FactoryInputPublishOutcomeResponse>({
        success: true,
        opportunityId,
        publishOutcome: null,
        message: "No accepted rendered asset is currently linked to this opportunity.",
      });
    }

    const publishOutcome = await publishOutcomeRepository.getByRenderedAssetId(
      acceptedContext.renderedAssetId,
    );

    return jsonSuccess<FactoryInputPublishOutcomeResponse>({
      success: true,
      opportunityId,
      publishOutcome,
      message: publishOutcome
        ? "Publish outcome loaded."
        : "No publish outcome has been recorded for the accepted asset yet.",
    });
  } catch (error) {
    return jsonError<FactoryInputPublishOutcomeResponse>(
      {
        success: false,
        opportunityId,
        publishOutcome: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load factory publish outcome.",
      },
      500,
    );
  }
}

export async function PATCH(request: Request) {
  const parsed = await parseJsonBody(
    request,
    factoryInputPublishOutcomeRequestSchema,
  );

  if (!parsed.success) {
    return jsonError<FactoryInputPublishOutcomeResponse>(
      {
        success: false,
        opportunityId: null,
        publishOutcome: null,
        error: parsed.error.issues[0]?.message ?? "Invalid publish outcome payload.",
      },
      400,
    );
  }

  try {
    const acceptedContext = await findAcceptedFactoryContext(
      parsed.data.opportunityId,
    );

    if (!acceptedContext) {
      return jsonError<FactoryInputPublishOutcomeResponse>(
        {
          success: false,
          opportunityId: parsed.data.opportunityId,
          publishOutcome: null,
          error: "Only accepted rendered assets can record factory publish outcomes.",
        },
        409,
      );
    }

    const publishOutcome = await publishOutcomeRepository.save({
      opportunityId: acceptedContext.opportunity.opportunityId,
      videoBriefId: acceptedContext.videoBriefId,
      factoryJobId: acceptedContext.factoryJobId,
      renderJobId: acceptedContext.renderJobId,
      renderedAssetId: acceptedContext.renderedAssetId,
      assetReviewId: acceptedContext.assetReviewId,
      published: parsed.data.published,
      platform: parsed.data.platform ?? null,
      publishDate: parsed.data.publishDate ?? null,
      publishedUrl: parsed.data.publishedUrl ?? null,
      impressions: parsed.data.impressions ?? null,
      clicks: parsed.data.clicks ?? null,
      signups: parsed.data.signups ?? null,
      notes: parsed.data.notes ?? null,
      attributionSource: parsed.data.attributionSource ?? null,
    });

    return jsonSuccess<FactoryInputPublishOutcomeResponse>({
      success: true,
      opportunityId: acceptedContext.opportunity.opportunityId,
      publishOutcome,
      message: "Publish outcome saved for the accepted asset.",
    });
  } catch (error) {
    return jsonError<FactoryInputPublishOutcomeResponse>(
      {
        success: false,
        opportunityId: parsed.data.opportunityId,
        publishOutcome: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to save factory publish outcome.",
      },
      500,
    );
  }
}
