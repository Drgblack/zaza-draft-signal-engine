import { WeeklyPlanManager } from "@/components/plan/weekly-plan-manager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCampaignStrategy } from "@/lib/campaigns";
import { getCurrentWeeklyPlan, getWeeklyPlanStore, WEEKLY_PLAN_TEMPLATES } from "@/lib/weekly-plan";

export const dynamic = "force-dynamic";

export default async function WeeklyPlanPage() {
  const strategy = await getCampaignStrategy();
  const plan = await getCurrentWeeklyPlan(strategy);
  const store = await getWeeklyPlanStore(strategy);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Planning layer</Badge>
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{plan.weekStartDate}</Badge>
          </div>
          <CardTitle className="text-3xl">Weekly Plan</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Lightweight weekly intent for balancing fresh signals, evergreen content, campaigns, funnel coverage, platforms, and editorial modes. This guides ranking and review without turning the product into a scheduler.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Templates</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{WEEKLY_PLAN_TEMPLATES.length}</p>
            <p className="mt-1 text-sm text-slate-500">Quick starting points for common planning modes.</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Active campaigns</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{plan.activeCampaignIds.length}</p>
            <p className="mt-1 text-sm text-slate-500">Campaigns currently emphasized this week.</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Target platforms</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{plan.targetPlatforms.length}</p>
            <p className="mt-1 text-sm text-slate-500">Platforms the queue should keep visible this week.</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Stored weeks</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{store.plans.length}</p>
            <p className="mt-1 text-sm text-slate-500">Simple planning history for light comparison.</p>
          </div>
        </CardContent>
      </Card>

      <WeeklyPlanManager
        initialPlan={plan}
        recentPlans={store.plans.slice(0, 6)}
        templates={WEEKLY_PLAN_TEMPLATES}
        strategy={strategy}
      />
    </div>
  );
}
