import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCampaignLifecycleStageLabel,
  type CampaignLifecycleStage,
  type CampaignLifecycleState,
} from "@/lib/campaign-lifecycle";

function stageTone(stage: CampaignLifecycleStage) {
  switch (stage) {
    case "peak":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "ramping":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "early":
      return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "tapering":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "paused":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "not_started":
    default:
      return "bg-violet-50 text-violet-700 ring-violet-200";
  }
}

export function CampaignLifecyclePanel({
  state,
  compact = false,
}: {
  state: CampaignLifecycleState;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Campaign Lifecycle</CardTitle>
            <Link href="/campaigns" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open campaigns
            </Link>
          </div>
          <CardDescription>{state.topSummary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.recommendations.slice(0, 3).map((recommendation) => (
            <div key={recommendation.campaignId} className="rounded-2xl bg-white/84 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={stageTone(recommendation.lifecycleStage)}>
                  {getCampaignLifecycleStageLabel(recommendation.lifecycleStage)}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  next: {getCampaignLifecycleStageLabel(recommendation.recommendedNextStage)}
                </Badge>
              </div>
              <p className="mt-3 font-medium text-slate-950">{recommendation.campaignName}</p>
              <p className="mt-2 text-sm text-slate-600">{recommendation.recommendedContentFocus}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign Lifecycle</CardTitle>
        <CardDescription>
          Advisory campaign-stage guidance that keeps weekly support aligned to where each campaign is in its momentum curve.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-700">{state.topSummary}</div>
        {state.recommendations.map((recommendation) => (
          <Link
            key={recommendation.campaignId}
            href={recommendation.linkedWorkflow}
            className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={stageTone(recommendation.lifecycleStage)}>
                {getCampaignLifecycleStageLabel(recommendation.lifecycleStage)}
              </Badge>
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                next: {getCampaignLifecycleStageLabel(recommendation.recommendedNextStage)}
              </Badge>
            </div>
            <p className="mt-3 font-medium text-slate-950">{recommendation.campaignName}</p>
            <p className="mt-2 text-sm text-slate-700">{recommendation.reason}</p>
            <p className="mt-2 text-sm text-slate-600">{recommendation.recommendedContentFocus}</p>
            {recommendation.supportingSignals[0] ? (
              <p className="mt-2 text-xs text-slate-500">
                {recommendation.supportingSignals.slice(0, 2).join(" · ")}
              </p>
            ) : null}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
