import { NextResponse } from "next/server";

import { listSignalsWithFallback } from "@/lib/airtable";
import { appendAuditEventsSafe } from "@/lib/audit";
import { getCampaignStrategy } from "@/lib/campaigns";
import {
  assignExperimentVariant,
  buildExperimentInsights,
  closeExperiment,
  createExperiment,
  experimentActionRequestSchema,
  getExperimentStatusLabel,
  listExperiments,
} from "@/lib/experiments";
import { listFollowUpTasks } from "@/lib/follow-up";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getWeeklyPlanStore } from "@/lib/weekly-plan";
import type { ExperimentResponse } from "@/types/api";

async function buildResponse(
  experiment: Awaited<ReturnType<typeof createExperiment>> | Awaited<ReturnType<typeof assignExperimentVariant>> | null,
  message: string,
  persisted = true,
) {
  const [signalsResult, experiments, postingEntries, postingOutcomes, strategicOutcomes, strategy] = await Promise.all([
    listSignalsWithFallback({ limit: 1000 }),
    listExperiments(),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
    getCampaignStrategy(),
  ]);
  const weeklyPlanStore = await getWeeklyPlanStore(strategy);
  await listFollowUpTasks({
    signals: signalsResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    weeklyPlans: weeklyPlanStore.plans,
  });

  return {
    success: true,
    persisted,
    experiment,
    experiments,
    insights: buildExperimentInsights({
      experiments,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
    }),
    message,
  } satisfies ExperimentResponse;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = experimentActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    const [experiments, postingEntries, postingOutcomes, strategicOutcomes] = await Promise.all([
      listExperiments(),
      listPostingLogEntries(),
      listPostingOutcomes(),
      listStrategicOutcomes(),
    ]);

    return NextResponse.json<ExperimentResponse>(
      {
        success: false,
        persisted: false,
        experiment: null,
        experiments,
        insights: buildExperimentInsights({
          experiments,
          postingEntries,
          postingOutcomes,
          strategicOutcomes,
        }),
        message: "Experiment update failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid experiment payload.",
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "create") {
      const experiment = await createExperiment(parsed.data.data);
      await appendAuditEventsSafe([
        {
          signalId: `experiment:${experiment.experimentId}`,
          eventType: "EXPERIMENT_CREATED",
          actor: "operator",
          summary: `Created experiment ${experiment.name}.`,
          metadata: {
            status: experiment.status,
            hypothesis: experiment.hypothesis,
            variantCount: experiment.variants.length,
          },
        },
      ]);

      return NextResponse.json<ExperimentResponse>(
        await buildResponse(experiment, `Created ${getExperimentStatusLabel(experiment.status).toLowerCase()} experiment.`),
      );
    }

    if (parsed.data.action === "assign_variant") {
      const experiment = await assignExperimentVariant(parsed.data.data);
      await appendAuditEventsSafe([
        {
          signalId: `experiment:${experiment.experimentId}`,
          eventType: "EXPERIMENT_VARIANT_ASSIGNED",
          actor: "operator",
          summary: `Assigned ${parsed.data.data.variantLabel} inside ${experiment.name}.`,
          metadata: {
            variantLabel: parsed.data.data.variantLabel,
            signalId: parsed.data.data.signalId ?? null,
            postingId: parsed.data.data.postingId ?? null,
            weekStartDate: parsed.data.data.weekStartDate ?? null,
          },
        },
      ]);

      return NextResponse.json<ExperimentResponse>(
        await buildResponse(experiment, "Experiment variant updated."),
      );
    }

    const experiment = await closeExperiment(parsed.data.data.experimentId);
    await appendAuditEventsSafe([
      {
        signalId: `experiment:${experiment.experimentId}`,
        eventType: "EXPERIMENT_CLOSED",
        actor: "operator",
        summary: `Closed experiment ${experiment.name}.`,
        metadata: {
          closedAt: experiment.closedAt,
          variantCount: experiment.variants.length,
        },
      },
    ]);

    return NextResponse.json<ExperimentResponse>(
      await buildResponse(experiment, "Experiment closed."),
    );
  } catch (error) {
    const [experiments, postingEntries, postingOutcomes, strategicOutcomes] = await Promise.all([
      listExperiments(),
      listPostingLogEntries(),
      listPostingOutcomes(),
      listStrategicOutcomes(),
    ]);

    return NextResponse.json<ExperimentResponse>(
      {
        success: false,
        persisted: false,
        experiment: null,
        experiments,
        insights: buildExperimentInsights({
          experiments,
          postingEntries,
          postingOutcomes,
          strategicOutcomes,
        }),
        message: "Experiment update failed.",
        error: error instanceof Error ? error.message : "Unable to update experiment.",
      },
      { status: 500 },
    );
  }
}
