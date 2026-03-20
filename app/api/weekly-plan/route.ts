import { z } from "zod";

import { NextResponse } from "next/server";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { listSignalsWithFallback } from "@/lib/airtable";
import { getCampaignStrategy } from "@/lib/campaigns";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { buildWeeklyPlanAutoDraft } from "@/lib/weekly-plan-autodraft";
import {
  getCurrentWeeklyPlan,
  getWeeklyPlanStore,
  weeklyPlanInputSchema,
  upsertWeeklyPlan,
  WEEKLY_PLAN_TEMPLATES,
} from "@/lib/weekly-plan";
import type { WeeklyPlanResponse } from "@/types/api";

const weeklyPlanActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("auto_draft"),
  }),
  z.object({
    action: z.literal("dismiss_draft"),
    weekStartDate: z.string().trim().min(1),
    proposalReasons: z.array(z.string().trim().min(1)).max(8).optional(),
  }),
]);

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
      draft: null,
    });
  } catch (error) {
    return NextResponse.json<WeeklyPlanResponse>(
      {
        success: false,
        plan: null,
        templates: WEEKLY_PLAN_TEMPLATES,
        draft: null,
        error: error instanceof Error ? error.message : "Unable to load weekly plan.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const actionParsed = weeklyPlanActionSchema.safeParse(payload);

  if (actionParsed.success) {
    try {
      const strategy = await getCampaignStrategy();

      if (actionParsed.data.action === "auto_draft") {
        const store = await getWeeklyPlanStore(strategy);
        const { signals } = await listSignalsWithFallback({ limit: 1000 });
        const postingEntries = await listPostingLogEntries();
        const postingOutcomes = await listPostingOutcomes();
        const strategicOutcomes = await listStrategicOutcomes();
        const bundles = await listPatternBundles();
        const weeklyRecap = buildWeeklyRecap({
          signals,
          postingEntries,
          postingOutcomes,
          strategicOutcomes,
          bundleSummariesByPatternId: indexBundleSummariesByPatternId(bundles),
        });
        const draft = buildWeeklyPlanAutoDraft({
          strategy,
          signals,
          postingEntries,
          postingOutcomes,
          strategicOutcomes,
          plans: store.plans,
          weeklyRecap,
        });

        await appendAuditEventsSafe([
          {
            signalId: `weekly-plan-draft:${draft.weekStartDate}`,
            eventType: "WEEKLY_PLAN_AUTO_DRAFTED",
            actor: "system",
            summary: `Generated an auto-draft for the week starting ${draft.weekStartDate}.`,
            metadata: {
              weekStartDate: draft.weekStartDate,
              campaignCount: draft.proposedActiveCampaignIds.length,
              platformCount: draft.proposedTargetPlatforms.length,
              reasonCount: draft.proposalReasons.length,
            },
          },
        ]);

        return NextResponse.json<WeeklyPlanResponse>({
          success: true,
          plan: store.plans[0] ?? null,
          templates: WEEKLY_PLAN_TEMPLATES,
          recentPlans: store.plans.slice(0, 6),
          draft,
          message: "Auto-draft generated for next week.",
        });
      }

      await appendAuditEventsSafe([
        {
          signalId: `weekly-plan-draft:${actionParsed.data.weekStartDate}`,
          eventType: "WEEKLY_PLAN_DRAFT_DISMISSED",
          actor: "operator",
          summary: `Dismissed the weekly plan draft for ${actionParsed.data.weekStartDate}.`,
          metadata: {
            weekStartDate: actionParsed.data.weekStartDate,
            reasonCount: actionParsed.data.proposalReasons?.length ?? 0,
          },
        },
      ]);

      const plan = await getCurrentWeeklyPlan(strategy);
      const store = await getWeeklyPlanStore(strategy);

      return NextResponse.json<WeeklyPlanResponse>({
        success: true,
        plan,
        templates: WEEKLY_PLAN_TEMPLATES,
        recentPlans: store.plans.slice(0, 6),
        draft: null,
        message: "Weekly plan draft dismissed.",
      });
    } catch (error) {
      return NextResponse.json<WeeklyPlanResponse>(
        {
          success: false,
          plan: null,
          templates: WEEKLY_PLAN_TEMPLATES,
          draft: null,
          error: error instanceof Error ? error.message : "Unable to process weekly plan draft action.",
        },
        { status: 500 },
      );
    }
  }

  const parsed = weeklyPlanInputSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<WeeklyPlanResponse>(
      {
        success: false,
        plan: null,
        templates: WEEKLY_PLAN_TEMPLATES,
        draft: null,
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
    const draftAccepted = plan.planSource === "auto_draft" && Boolean(plan.autoDraftAcceptedAt);

    const auditEvents: AuditEventInput[] = [
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
          planSource: plan.planSource,
        },
      },
    ];

    if (draftAccepted) {
      auditEvents.push({
        signalId: `weekly-plan:${plan.weekStartDate}`,
        eventType: "WEEKLY_PLAN_DRAFT_ACCEPTED",
        actor: "operator",
        summary: `Accepted the weekly plan auto-draft for ${plan.weekStartDate}.`,
        metadata: {
          weekStartDate: plan.weekStartDate,
          acceptedWithEdits: plan.autoDraftAcceptedWithEdits,
        },
      });
    }

    if (draftAccepted && plan.autoDraftAcceptedWithEdits) {
      auditEvents.push({
        signalId: `weekly-plan:${plan.weekStartDate}`,
        eventType: "WEEKLY_PLAN_DRAFT_EDITED",
        actor: "operator",
        summary: `Accepted the weekly plan draft with edits for ${plan.weekStartDate}.`,
        metadata: {
          weekStartDate: plan.weekStartDate,
        },
      });
    }

    await appendAuditEventsSafe(auditEvents);

    return NextResponse.json<WeeklyPlanResponse>({
      success: true,
      plan,
      templates: WEEKLY_PLAN_TEMPLATES,
      recentPlans: [plan, ...store.plans.filter((item) => item.weekStartDate !== plan.weekStartDate)].slice(0, 6),
      draft: null,
      message: draftAccepted
        ? plan.autoDraftAcceptedWithEdits
          ? "Weekly plan auto-draft accepted with edits."
          : "Weekly plan auto-draft accepted."
        : existing
          ? "Weekly plan updated."
          : "Weekly plan created.",
    });
  } catch (error) {
    return NextResponse.json<WeeklyPlanResponse>(
      {
        success: false,
        plan: null,
        templates: WEEKLY_PLAN_TEMPLATES,
        draft: null,
        error: error instanceof Error ? error.message : "Unable to save weekly plan.",
      },
      { status: 500 },
    );
  }
}
