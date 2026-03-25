import assert from "node:assert/strict";
import test from "node:test";

import { resolveFactoryInputsRouteState } from "../lib/factory-inputs-route-state";
import type { ContentOpportunity } from "../lib/content-opportunities";

function buildOpportunity(
  overrides: Partial<ContentOpportunity> = {},
): ContentOpportunity {
  return {
    opportunityId: "opportunity-1",
    status: "approved_for_production",
    founderSelectionStatus: "pending",
    selectedVideoBrief: null,
    title: "Opportunity",
    primaryPainPoint: "Pain point",
    ...overrides,
  } as ContentOpportunity;
}

test("resolveFactoryInputsRouteState returns no-approved-opportunity when no approved items exist", () => {
  const resolution = resolveFactoryInputsRouteState({
    opportunities: [buildOpportunity({ status: "open" })],
  });

  assert.equal(resolution.routeState, "no-approved-opportunity");
  assert.equal(resolution.approvedOpportunities.length, 0);
  assert.equal(resolution.selectedOpportunity, null);
});

test("resolveFactoryInputsRouteState returns builder for approved opportunities without an approved brief", () => {
  const resolution = resolveFactoryInputsRouteState({
    opportunities: [buildOpportunity()],
  });

  assert.equal(resolution.routeState, "builder");
  assert.equal(resolution.approvedOpportunities.length, 1);
  assert.equal(resolution.selectedOpportunity?.opportunityId, "opportunity-1");
});

test("resolveFactoryInputsRouteState returns review for approved opportunities with an approved selectedVideoBrief", () => {
  const resolution = resolveFactoryInputsRouteState({
    opportunities: [
      buildOpportunity({
        founderSelectionStatus: "approved",
        selectedVideoBrief: { id: "brief-1" } as ContentOpportunity["selectedVideoBrief"],
      }),
    ],
  });

  assert.equal(resolution.routeState, "review");
  assert.equal(resolution.selectedOpportunity?.founderSelectionStatus, "approved");
});

test("resolveFactoryInputsRouteState ignores non-approved requested ids when approved opportunities exist", () => {
  const resolution = resolveFactoryInputsRouteState({
    opportunities: [
      buildOpportunity({
        opportunityId: "open-opportunity",
        status: "open",
      }),
      buildOpportunity({
        opportunityId: "approved-opportunity",
      }),
    ],
    requestedOpportunityId: "open-opportunity",
  });

  assert.equal(resolution.routeState, "builder");
  assert.equal(resolution.selectedOpportunity?.opportunityId, "approved-opportunity");
  assert.equal(resolution.selectedOpportunityFound, false);
});
