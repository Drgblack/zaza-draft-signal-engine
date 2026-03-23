import Link from "next/link";

import { FactoryInputsPanel } from "@/components/factory/factory-inputs-panel";
import { VideoFactoryReviewConnected } from "@/components/video-factory/video-factory-review-connected";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listContentOpportunityState } from "@/lib/content-opportunities";
import { formatDateTime } from "@/lib/utils";

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
  const readyNowCount = state.opportunities.filter(
    (item) => item.status === "open" && item.priority === "high" && item.trustRisk !== "high",
  ).length;
  const highRiskCount = state.opportunities.filter(
    (item) => item.status === "open" && item.trustRisk === "high",
  ).length;
  const highCommercialCount = state.opportunities.filter(
    (item) => item.status === "open" && item.commercialPotential === "high",
  ).length;

  return (
    <div className="space-y-6 bg-[#F0EFFF]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              Factory queue
            </Badge>
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">
              Snapshot {formatDateTime(state.generatedAt)}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Factory Inputs</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            A lighter-weight, decision-oriented queue for selecting high-potential content opportunities before they become full production work. This is intentionally narrower than raw signal review.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to digest
          </Link>
          <Link href="/review" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open raw review queue
          </Link>
          <Link href="/execution" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open execution flow
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white/84 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Open</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{state.openCount}</p>
          <p className="mt-1 text-sm text-slate-600">Opportunities still waiting for a production decision.</p>
        </div>
        <div className="rounded-2xl bg-white/84 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ready now</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{readyNowCount}</p>
          <p className="mt-1 text-sm text-slate-600">High-priority opportunities without high trust risk.</p>
        </div>
        <div className="rounded-2xl bg-white/84 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">High commercial potential</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{highCommercialCount}</p>
          <p className="mt-1 text-sm text-slate-600">Signals that look commercially promising enough to review first.</p>
        </div>
        <div className="rounded-2xl bg-white/84 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Trust-risk flagged</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{highRiskCount}</p>
          <p className="mt-1 text-sm text-slate-600">Never promoted as top ready-now items without clear flagging.</p>
        </div>
      </div>

      {state.topSummary.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-3">
          {state.topSummary.slice(0, 3).map((summary) => (
            <div
              key={summary}
              className="rounded-2xl bg-white/84 px-4 py-4 text-sm leading-6 text-slate-700"
            >
              {summary}
            </div>
          ))}
        </div>
      ) : null}

      {selectedOpportunity?.selectedVideoBrief ? (
        <Card>
          <CardHeader>
            <CardTitle>Video Factory Review</CardTitle>
            <CardDescription>
              Connected review flow for the currently selected brief, using the persisted
              factory state, attempt timeline, and review actions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VideoFactoryReviewConnected initialOpportunity={selectedOpportunity} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Production Opportunity Queue</CardTitle>
          <CardDescription>
            Compact cards for choosing what should move toward production next, with enough trust and commercial context to make a fast decision.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FactoryInputsPanel key={state.generatedAt} initialState={state} />
        </CardContent>
      </Card>
    </div>
  );
}
