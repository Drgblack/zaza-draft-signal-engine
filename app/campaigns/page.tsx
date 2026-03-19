import { CampaignStrategyManager } from "@/components/campaigns/campaign-strategy-manager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CTA_GOAL_DESCRIPTIONS, FUNNEL_STAGE_DESCRIPTIONS, getCampaignStrategy } from "@/lib/campaigns";
import { CTA_GOALS, FUNNEL_STAGES } from "@/types/signal";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const strategy = await getCampaignStrategy();
  const activeCampaigns = strategy.campaigns.filter((campaign) => campaign.status === "active");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              {activeCampaigns.length} active campaign{activeCampaigns.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Campaign Strategy</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Lightweight strategic context for the signal engine. Campaigns, pillars, audiences, funnel stages, and CTA goals guide content generation and approval ranking without blocking work when context is still thin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Campaigns</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{strategy.campaigns.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Pillars</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{strategy.pillars.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Audience Segments</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{strategy.audienceSegments.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Funnel Stages</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{FUNNEL_STAGES.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Funnel Reference</CardTitle>
            <CardDescription>Bounded funnel labels used by the strategy layer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {FUNNEL_STAGES.map((stage) => (
              <div key={stage} className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">{stage}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{FUNNEL_STAGE_DESCRIPTIONS[stage]}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CTA Goals</CardTitle>
            <CardDescription>Simple CTA intent options used when context is assigned or overridden.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {CTA_GOALS.map((goal) => (
              <div key={goal} className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="font-medium text-slate-950">{goal}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{CTA_GOAL_DESCRIPTIONS[goal]}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <CampaignStrategyManager initialStrategy={strategy} />
    </div>
  );
}
