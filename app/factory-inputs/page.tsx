import Link from "next/link";

import { VideoBriefBuilderConnected } from "@/components/video-factory/video-brief-builder-connected";
import { VideoFactoryReviewConnected } from "@/components/video-factory/video-factory-review-connected";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listContentOpportunityState } from "@/lib/content-opportunities";
import { resolveFactoryInputsRouteState } from "@/lib/factory-inputs-route-state";

export const dynamic = "force-dynamic";

export default async function FactoryInputsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const state = await listContentOpportunityState();
  const requestedOpportunityId = Array.isArray(searchParams?.opportunityId)
    ? searchParams?.opportunityId[0]
    : searchParams?.opportunityId;
  const requestedMode = Array.isArray(searchParams?.mode)
    ? searchParams?.mode[0]
    : searchParams?.mode;
  const {
    approvedOpportunities,
    requestedApprovedOpportunity,
    selectedOpportunity,
    selectedOpportunityFound,
    routeState,
  } = resolveFactoryInputsRouteState({
    opportunities: state.opportunities,
    requestedOpportunityId,
    requestedMode,
  });
  const reviewStep =
    selectedOpportunity?.generationState?.assetReview?.status === "pending_review" ||
    selectedOpportunity?.generationState?.assetReview?.status === "accepted" ||
    selectedOpportunity?.generationState?.assetReview?.status === "rejected"
      ? 7
      : 6;

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#F0EFFF]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <Card className="bg-white/92">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  ZazaReel
                </Badge>
                <Badge className="bg-[#E9E7FF] text-[#5448B3] ring-[#D8D3FF]">
                  {routeState}
                </Badge>
              </div>
              <CardTitle>
                {routeState === "builder"
                  ? "Brief creation is available."
                  : routeState === "review"
                    ? "The approved brief is ready for generation or final review."
                    : "No brief is ready for production yet."}
              </CardTitle>
              <CardDescription className="max-w-3xl">
                {routeState === "builder"
                  ? "An approved opportunity is in state and the builder is the active founder step."
                  : routeState === "review"
                    ? "A selectedVideoBrief is already approved, so the downstream ZazaReel review flow is the active screen."
                    : "There are currently 0 approved opportunities ready for brief creation."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-black/6 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Approved opportunities
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {approvedOpportunities.length}
                </p>
              </div>
              <div className="rounded-2xl border border-black/6 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Selected opportunity found
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {selectedOpportunityFound ? "Yes" : "No"}
                </p>
                {requestedOpportunityId && !requestedApprovedOpportunity ? (
                  <p className="mt-1 text-sm text-slate-500">
                    The requested opportunity is not currently approved for production.
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-black/6 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Founder status
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {selectedOpportunity?.founderSelectionStatus ?? "n/a"}
                </p>
                {selectedOpportunity?.selectedVideoBrief ? (
                  <p className="mt-1 text-sm text-slate-500">
                    A brief is already saved on the selected opportunity.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/92">
            <CardHeader>
              <CardTitle>Approved opportunities</CardTitle>
              <CardDescription>
                This shows whether approved opportunities are actually present in state and
                gives the next founder-safe action for each one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvedOpportunities.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-black/10 bg-white/75 px-4 py-8">
                  <p className="text-base font-semibold text-slate-950">
                    There are currently 0 approved opportunities ready for brief creation.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Approve an opportunity in Review first, then return here to start the brief.
                  </p>
                  <div className="mt-4">
                    <Link
                      href="/review"
                      className={buttonVariants({ size: "sm" })}
                    >
                      Open Review
                    </Link>
                  </div>
                </div>
              ) : (
                approvedOpportunities.map((opportunity) => {
                  const isSelected =
                    selectedOpportunity?.opportunityId === opportunity.opportunityId;
                  const actionLabel =
                    opportunity.founderSelectionStatus === "approved" &&
                    opportunity.selectedVideoBrief
                      ? "Open brief"
                      : "Start brief";
                  const href =
                    actionLabel === "Open brief"
                      ? `/factory-inputs?opportunityId=${encodeURIComponent(
                          opportunity.opportunityId,
                        )}`
                      : `/factory-inputs?opportunityId=${encodeURIComponent(
                          opportunity.opportunityId,
                        )}&mode=builder#brief-builder`;

                  return (
                    <div
                      key={opportunity.opportunityId}
                      className={
                        isSelected
                          ? "rounded-3xl border-2 border-[#6B62D9] bg-[#F4F2FF] px-4 py-4"
                          : "rounded-3xl border border-black/8 bg-white px-4 py-4"
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                          {opportunity.founderSelectionStatus}
                        </Badge>
                        {isSelected ? (
                          <Badge className="bg-[#E0DBFF] text-[#4F46B5] ring-[#D1CAFF]">
                            Selected
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-3 text-base font-semibold text-slate-950">
                        {opportunity.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {opportunity.primaryPainPoint}
                      </p>
                      <div className="mt-4">
                        <Link href={href} className={buttonVariants({ size: "sm" })}>
                          {actionLabel}
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {routeState === "builder" && selectedOpportunity ? (
            <VideoBriefBuilderConnected initialOpportunity={selectedOpportunity} />
          ) : routeState === "review" && selectedOpportunity?.selectedVideoBrief ? (
            <div className="space-y-6">
              <Card className="bg-white/92">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                      ZazaReel
                    </Badge>
                    <Badge className="bg-[#E9E7FF] text-[#5448B3] ring-[#D8D3FF]">
                      Step {reviewStep} of 7
                    </Badge>
                  </div>
                  <CardTitle>
                    {reviewStep === 6
                      ? "Your brief is approved. Generation is available now."
                      : "Review the final video."}
                  </CardTitle>
                  <CardDescription className="max-w-3xl">
                    {reviewStep === 6
                      ? "You have already chosen the angle, hook, and brief. The next action is to generate the first portrait render in the existing ZazaReel review flow below."
                      : "The render is back. Review the final video below, then approve it, regenerate it, or edit the brief if the message needs to change."}
                  </CardDescription>
                </CardHeader>
              </Card>
              <VideoFactoryReviewConnected initialOpportunity={selectedOpportunity} />
            </div>
          ) : (
            <div className="flex min-h-[20rem] items-center justify-center px-4 py-2">
              <Card className="w-full max-w-xl border-black/6 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                <CardContent className="py-10 text-center">
                  <p className="text-xl font-semibold text-slate-950">
                    No brief ready for production
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    There are currently 0 approved opportunities ready for brief creation.
                  </p>
                  <div className="mt-4">
                    <Link href="/review" className={buttonVariants({ size: "sm" })}>
                      Open Review
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
