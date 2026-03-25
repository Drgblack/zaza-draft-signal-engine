import Link from "next/link";

import { FactoryInputsBootstrapActions } from "@/components/video-factory/factory-inputs-bootstrap-actions";
import { VideoBriefBuilderConnected } from "@/components/video-factory/video-brief-builder-connected";
import { VideoFactoryReviewConnected } from "@/components/video-factory/video-factory-review-connected";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listContentOpportunityState } from "@/lib/content-opportunities";
import { resolveFactoryInputsRouteState } from "@/lib/factory-inputs-route-state";
import { getFounderProgressForOpportunity } from "@/lib/founder-progress";
import { listSignalsWithFallback } from "@/lib/signal-repository";

export const dynamic = "force-dynamic";

export default async function FactoryInputsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const state = await listContentOpportunityState();
  const { signals } = await listSignalsWithFallback({ limit: 1000 });
  const requestedOpportunityId = Array.isArray(searchParams?.opportunityId)
    ? searchParams?.opportunityId[0]
    : searchParams?.opportunityId;
  const requestedSignalId = Array.isArray(searchParams?.signalId)
    ? searchParams?.signalId[0]
    : searchParams?.signalId;
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
    requestedSignalId,
    requestedMode,
  });
  const noOpportunitiesInSystem = state.opportunities.length === 0;
  const reviewHref = "/review?view=ready_to_approve#approval-ready";
  const founderProgress = getFounderProgressForOpportunity(selectedOpportunity);
  const founderStatusLabel =
    founderProgress === "ready-to-build-brief"
      ? "Ready to build brief"
      : founderProgress === "ready-to-generate"
        ? "Ready to generate"
        : founderProgress === "ready-to-review-render"
          ? "Ready to review render"
          : "No approved opportunity";
  const founderTitle =
    approvedOpportunities.length === 0
      ? noOpportunitiesInSystem
        ? "Nothing is in the system yet."
        : "Nothing is approved for brief creation yet."
      : founderProgress === "ready-to-build-brief"
      ? "Create the next video brief."
      : founderProgress === "ready-to-generate"
        ? "Generate the first portrait render."
        : founderProgress === "ready-to-review-render"
          ? "Review the finished render."
          : "Nothing is ready for brief creation yet.";
  const founderCopy =
    approvedOpportunities.length === 0
      ? noOpportunitiesInSystem
        ? "There are currently 0 opportunities in the system. You can create a test opportunity instantly or open Review and approve a real one."
        : "There are currently 0 approved opportunities ready for brief creation. You can create a test opportunity instantly or open Review and approve a real one."
      : founderProgress === "ready-to-build-brief"
      ? "One approved opportunity is ready. Choose the angle, choose the hook, tighten the brief, and approve it so generation becomes available."
      : founderProgress === "ready-to-generate"
        ? "The brief is already approved. The next step is to generate the first video in the existing ZazaReel review flow."
        : founderProgress === "ready-to-review-render"
          ? "The render is back. Review it in ZazaReel, then approve it, regenerate it, or go back to the brief if the message still needs work."
          : signals.some((signal) => signal.status === "Interpreted")
            ? "There are currently 0 approved opportunities ready for brief creation. The next step is to open Review and approve one interpreted candidate."
            : "There are currently 0 approved opportunities ready for brief creation. The next step is to open Review and approve one opportunity once the signal is ready.";
  const primaryActionLabel =
    approvedOpportunities.length === 0
      ? null
      : founderProgress === "ready-to-build-brief"
      ? selectedOpportunity?.selectedVideoBrief
        ? "Continue brief"
        : "Start brief"
      : founderProgress === "ready-to-generate" || founderProgress === "ready-to-review-render"
        ? "Open ZazaReel"
        : "Open Review to approve one opportunity";
  const primaryActionHref =
    approvedOpportunities.length === 0
      ? reviewHref
      : founderProgress === "ready-to-build-brief" && selectedOpportunity
      ? `/factory-inputs?opportunityId=${encodeURIComponent(selectedOpportunity.opportunityId)}&mode=builder#brief-builder`
      : founderProgress === "ready-to-generate" || founderProgress === "ready-to-review-render"
        ? `/factory-inputs?opportunityId=${encodeURIComponent(selectedOpportunity?.opportunityId ?? "")}#review`
        : reviewHref;
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
                <Badge className="bg-white text-slate-700 ring-slate-200">
                  {founderStatusLabel}
                </Badge>
              </div>
              <CardTitle>{founderTitle}</CardTitle>
              <CardDescription className="max-w-3xl">{founderCopy}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {approvedOpportunities.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  {primaryActionLabel ? (
                    <Link href={primaryActionHref} className={buttonVariants({})}>
                      {primaryActionLabel}
                    </Link>
                  ) : null}
                  {founderProgress === "ready-to-build-brief" ||
                  founderProgress === "ready-to-generate" ||
                  founderProgress === "ready-to-review-render" ? (
                    <Link
                      href={reviewHref}
                      className={buttonVariants({ variant: "secondary" })}
                    >
                    Open Review
                  </Link>
                ) : null}
              </div>
              ) : null}
              {approvedOpportunities.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-3">
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
                    {(requestedOpportunityId || requestedSignalId) &&
                    !requestedApprovedOpportunity ? (
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
                </div>
              ) : null}
            </CardContent>
          </Card>

          {approvedOpportunities.length === 0 ? (
            <Card className="bg-white/92">
              <CardHeader>
                <CardTitle>No opportunity is ready yet</CardTitle>
                <CardDescription>
                  You can either create a founder-safe test opportunity right now or open Review and approve a real one.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-3xl border border-dashed border-black/10 bg-white/75 px-4 py-8">
                  <p className="text-base font-semibold text-slate-950">
                    {noOpportunitiesInSystem
                      ? "There are currently 0 opportunities in the system."
                      : "There are currently 0 approved opportunities ready for brief creation."}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    You can either:
                  </p>
                  <ol className="mt-3 space-y-1 text-sm leading-6 text-slate-600">
                    <li>1. Create a test opportunity</li>
                    <li>2. Or go to Review and approve one</li>
                  </ol>
                </div>
                <FactoryInputsBootstrapActions
                  reviewHref={reviewHref}
                  reviewLabel="Open Review to approve one opportunity"
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white/92">
              <CardHeader>
                <CardTitle>Approved opportunities</CardTitle>
                <CardDescription>
                  This shows the approved opportunities already in state and the next founder-safe action for each one.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {approvedOpportunities.map((opportunity) => {
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
                })}
              </CardContent>
            </Card>
          )}

          <details className="rounded-3xl border border-black/8 bg-white/80 px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-800">
              Advanced tools
            </summary>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={reviewHref}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Open Review
              </Link>
              <Link
                href="/ingestion"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Open operator tools
              </Link>
            </div>
          </details>

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
          ) : null}
        </div>
      </div>
    </div>
  );
}
