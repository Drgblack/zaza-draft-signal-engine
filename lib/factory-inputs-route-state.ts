import type { ContentOpportunity } from "@/lib/content-opportunities";

export type FactoryInputsRouteState =
  | "no-approved-opportunity"
  | "builder"
  | "review";

export interface FactoryInputsRouteResolution {
  approvedOpportunities: ContentOpportunity[];
  requestedApprovedOpportunity: ContentOpportunity | null;
  selectedOpportunity: ContentOpportunity | null;
  selectedOpportunityFound: boolean;
  routeState: FactoryInputsRouteState;
}

export function resolveFactoryInputsRouteState(input: {
  opportunities: ContentOpportunity[];
  requestedOpportunityId?: string | null;
  requestedMode?: string | null;
}): FactoryInputsRouteResolution {
  const approvedOpportunities = input.opportunities.filter(
    (item) => item.status === "approved_for_production",
  );
  const requestedApprovedOpportunity =
    input.requestedOpportunityId
      ? approvedOpportunities.find(
          (item) => item.opportunityId === input.requestedOpportunityId,
        ) ?? null
      : null;
  const selectedOpportunity =
    requestedApprovedOpportunity ??
    approvedOpportunities.find((item) => item.founderSelectionStatus !== "approved") ??
    approvedOpportunities.find(
      (item) =>
        item.founderSelectionStatus === "approved" && Boolean(item.selectedVideoBrief),
    ) ??
    approvedOpportunities[0] ??
    null;
  const routeState: FactoryInputsRouteState = !selectedOpportunity
    ? "no-approved-opportunity"
    : input.requestedMode === "builder" ||
        selectedOpportunity.founderSelectionStatus !== "approved" ||
        !selectedOpportunity.selectedVideoBrief
      ? "builder"
      : "review";

  return {
    approvedOpportunities,
    requestedApprovedOpportunity,
    selectedOpportunity,
    selectedOpportunityFound: input.requestedOpportunityId
      ? Boolean(requestedApprovedOpportunity)
      : Boolean(selectedOpportunity),
    routeState,
  };
}
