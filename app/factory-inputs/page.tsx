import { VideoBriefBuilderConnected } from "@/components/video-factory/video-brief-builder-connected";
import { VideoFactoryReviewConnected } from "@/components/video-factory/video-factory-review-connected";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listContentOpportunityState } from "@/lib/content-opportunities";

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
  const approvedOpportunities = state.opportunities.filter(
    (item) => item.status === "approved_for_production",
  );
  const selectedOpportunity =
    state.opportunities.find((item) => item.opportunityId === requestedOpportunityId) ??
    approvedOpportunities.find(
      (item) =>
        item.founderSelectionStatus !== "approved",
    ) ??
    approvedOpportunities.find((item) => item.selectedVideoBrief) ??
    approvedOpportunities[0] ??
    null;
  const showBuilder =
    Boolean(selectedOpportunity) &&
    selectedOpportunity?.status === "approved_for_production" &&
    (requestedMode === "builder" ||
      selectedOpportunity.founderSelectionStatus !== "approved" ||
      !selectedOpportunity.selectedVideoBrief);
  const reviewStep =
    selectedOpportunity?.generationState?.assetReview?.status === "pending_review" ||
    selectedOpportunity?.generationState?.assetReview?.status === "accepted" ||
    selectedOpportunity?.generationState?.assetReview?.status === "rejected"
      ? 7
      : 6;

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#F0EFFF]">
      {selectedOpportunity && showBuilder ? (
        <VideoBriefBuilderConnected
          initialOpportunity={selectedOpportunity}
          approvedOpportunities={approvedOpportunities}
        />
      ) : selectedOpportunity?.selectedVideoBrief ? (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
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
                  {reviewStep === 6 ? "Your brief is approved. Generation is available now." : "Review the final video."}
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
        </div>
      ) : (
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-8">
          <Card className="w-full max-w-xl border-black/6 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            <CardContent className="py-10 text-center">
              <p className="text-xl font-semibold text-slate-950">No brief ready for production</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Approve an opportunity in Review first.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
