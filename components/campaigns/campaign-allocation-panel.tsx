import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCampaignLifecycleStageLabel } from "@/lib/campaign-lifecycle";
import type { CampaignAllocationState } from "@/lib/campaign-allocation";

function supportTone(level: CampaignAllocationState["recommendations"][number]["supportLevel"]) {
  switch (level) {
    case "increase":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "maintain":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "reduce":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "pause_temporarily":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function urgencyTone(level: CampaignAllocationState["recommendations"][number]["urgency"]) {
  switch (level) {
    case "high":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "medium":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "low":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function formatSupportLevel(value: string) {
  return value.replaceAll("_", " ");
}

export function CampaignAllocationPanel({
  state,
  compact = false,
}: {
  state: CampaignAllocationState;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Campaign Allocation</CardTitle>
            <Link href="/campaigns" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open campaigns
            </Link>
          </div>
          <CardDescription>{state.topSummary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.recommendations.slice(0, 3).map((recommendation) => (
            <Link
              key={recommendation.campaignId}
              href={recommendation.linkedWorkflow}
              className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={supportTone(recommendation.supportLevel)}>
                  {formatSupportLevel(recommendation.supportLevel)}
                </Badge>
                <Badge className={urgencyTone(recommendation.urgency)}>{recommendation.urgency}</Badge>
                {recommendation.lifecycleStage ? (
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {getCampaignLifecycleStageLabel(recommendation.lifecycleStage)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-3 font-medium text-slate-950">{recommendation.campaignName}</p>
              <p className="mt-2 text-sm text-slate-600">{recommendation.suggestedWeeklyShare}</p>
            </Link>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign Allocation Autopilot</CardTitle>
        <CardDescription>
          Advisory weekly allocation guidance for active campaigns. This keeps campaign support more disciplined without auto-changing strategy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
          {state.topSummary}
        </div>
        {state.recommendations.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
            No active campaign allocation guidance is stable enough right now.
          </div>
        ) : (
          state.recommendations.map((recommendation) => (
            <Link
              key={recommendation.campaignId}
              href={recommendation.linkedWorkflow}
              className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={supportTone(recommendation.supportLevel)}>
                  {formatSupportLevel(recommendation.supportLevel)}
                </Badge>
                <Badge className={urgencyTone(recommendation.urgency)}>{recommendation.urgency}</Badge>
                {recommendation.lifecycleStage ? (
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {getCampaignLifecycleStageLabel(recommendation.lifecycleStage)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-3 font-medium text-slate-950">{recommendation.campaignName}</p>
              <p className="mt-2 text-sm text-slate-700">{recommendation.allocationRecommendation}</p>
              <p className="mt-2 text-sm text-slate-600">{recommendation.reason}</p>
              {recommendation.recommendedContentFocus ? (
                <p className="mt-2 text-xs text-slate-500">{recommendation.recommendedContentFocus}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">Suggested share: {recommendation.suggestedWeeklyShare}</p>
              {recommendation.supportingSignals[0] ? (
                <p className="mt-2 text-xs text-slate-500">
                  {recommendation.supportingSignals.slice(0, 2).join(" · ")}
                </p>
              ) : null}
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
