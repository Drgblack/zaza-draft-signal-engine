import { VideoFactoryReviewConnected } from "@/components/video-factory/video-factory-review-connected";
import { Card, CardContent } from "@/components/ui/card";
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
  const selectedOpportunity =
    state.opportunities.find((item) => item.opportunityId === requestedOpportunityId) ??
    state.opportunities.find((item) => item.selectedVideoBrief) ??
    null;

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#F0EFFF]">
      {selectedOpportunity?.selectedVideoBrief ? (
        <VideoFactoryReviewConnected initialOpportunity={selectedOpportunity} />
      ) : (
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-8">
          <Card className="w-full max-w-xl border-black/6 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            <CardContent className="py-10 text-center">
              <p className="text-xl font-semibold text-slate-950">No brief ready for production</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Approve a content opportunity in the signal queue to begin.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
