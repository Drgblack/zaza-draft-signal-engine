import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import { getCampaignStrategy } from "@/lib/campaigns";
import {
  getCurrentWeeklyPlan,
  getWeeklyPlanStore,
  weeklyPlanInputSchema,
  upsertWeeklyPlan,
  WEEKLY_PLAN_TEMPLATES,
} from "@/lib/weekly-plan";
import type { WeeklyPlanResponse } from "@/types/api";

export async function GET() {
  try {
    const strategy = await getCampaignStrategy();
    const plan = await getCurrentWeeklyPlan(strategy);
    const store = await getWeeklyPlanStore(strategy);

    return NextResponse.json<WeeklyPlanResponse>({
      success: true,
      plan,
      templates: WEEKLY_PLAN_TEMPLATES,
      recentPlans: store.plans.slice(0, 6),
    });
  } catch (error) {
    return NextResponse.json<WeeklyPlanResponse>(
      {
        success: false,
        plan: null,
        templates: WEEKLY_PLAN_TEMPLATES,
        error: error instanceof Error ? error.message : "Unable to load weekly plan.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = weeklyPlanInputSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<WeeklyPlanResponse>(
      {
        success: false,
        plan: null,
        templates: WEEKLY_PLAN_TEMPLATES,
        error: parsed.error.issues[0]?.message ?? "Invalid weekly plan payload.",
      },
      { status: 400 },
    );
  }

  try {
    const strategy = await getCampaignStrategy();
    const store = await getWeeklyPlanStore(strategy);
    const existing = store.plans.find((plan) => plan.weekStartDate === parsed.data.weekStartDate) ?? null;
    const plan = await upsertWeeklyPlan(strategy, parsed.data);

    await appendAuditEventsSafe([
      {
        signalId: `weekly-plan:${plan.weekStartDate}`,
        eventType: existing ? "WEEKLY_PLAN_UPDATED" : "WEEKLY_PLAN_CREATED",
        actor: "operator",
        summary: existing
          ? `Updated weekly plan for ${plan.weekStartDate}.`
          : `Created weekly plan for ${plan.weekStartDate}.`,
        metadata: {
          weekStartDate: plan.weekStartDate,
          campaignCount: plan.activeCampaignIds.length,
          platformCount: plan.targetPlatforms.length,
          goalCount: plan.goals.length,
        },
      },
    ]);

    return NextResponse.json<WeeklyPlanResponse>({
      success: true,
      plan,
      templates: WEEKLY_PLAN_TEMPLATES,
      recentPlans: [plan, ...store.plans.filter((item) => item.weekStartDate !== plan.weekStartDate)].slice(0, 6),
      message: existing ? "Weekly plan updated." : "Weekly plan created.",
    });
  } catch (error) {
    return NextResponse.json<WeeklyPlanResponse>(
      {
        success: false,
        plan: null,
        templates: WEEKLY_PLAN_TEMPLATES,
        error: error instanceof Error ? error.message : "Unable to save weekly plan.",
      },
      { status: 500 },
    );
  }
}
