import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  buildExperimentProposalInsights,
  confirmExperimentProposal,
  experimentProposalActionRequestSchema,
  listExperimentProposals,
  updateExperimentProposalStatus,
} from "@/lib/experiment-proposals";
import { buildExperimentInsights, listExperiments } from "@/lib/experiments";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import type { ExperimentProposalResponse } from "@/types/api";

async function buildResponse(
  proposal: Awaited<ReturnType<typeof updateExperimentProposalStatus>> | null,
  experiment: Awaited<ReturnType<typeof confirmExperimentProposal>>["experiment"] | null,
  message: string,
  persisted = true,
) {
  const [proposals, experiments, postingEntries, postingOutcomes, strategicOutcomes] = await Promise.all([
    listExperimentProposals(),
    listExperiments(),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
  ]);

  return {
    success: true,
    persisted,
    proposal,
    proposals,
    proposalInsights: buildExperimentProposalInsights(proposals),
    experiment,
    experiments,
    insights: buildExperimentInsights({
      experiments,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
    }),
    message,
  } satisfies ExperimentProposalResponse;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = experimentProposalActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    const [proposals, experiments, postingEntries, postingOutcomes, strategicOutcomes] = await Promise.all([
      listExperimentProposals(),
      listExperiments(),
      listPostingLogEntries(),
      listPostingOutcomes(),
      listStrategicOutcomes(),
    ]);

    return NextResponse.json<ExperimentProposalResponse>(
      {
        success: false,
        persisted: false,
        proposal: null,
        proposals,
        proposalInsights: buildExperimentProposalInsights(proposals),
        experiment: null,
        experiments,
        insights: buildExperimentInsights({
          experiments,
          postingEntries,
          postingOutcomes,
          strategicOutcomes,
        }),
        message: "Experiment proposal update failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid experiment proposal payload.",
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "confirm_proposal") {
      const { proposal, experiment } = await confirmExperimentProposal(parsed.data.proposal);
      await appendAuditEventsSafe([
        {
          signalId: proposal.signalId,
          eventType: "EXPERIMENT_PROPOSAL_CONFIRMED",
          actor: "operator",
          summary: `Confirmed ${proposal.experimentType.replaceAll("_", " ")} for ${proposal.sourceTitle}.`,
          metadata: {
            proposalId: proposal.proposalId,
            experimentId: experiment.experimentId,
            experimentType: proposal.experimentType,
            comparisonTarget: proposal.comparisonTarget,
          },
        },
        {
          signalId: `experiment:${experiment.experimentId}`,
          eventType: "EXPERIMENT_CREATED",
          actor: "system",
          summary: `Created system-proposed experiment ${experiment.name}.`,
          metadata: {
            proposalId: proposal.proposalId,
            experimentType: proposal.experimentType,
            learningGoal: proposal.expectedLearningGoal,
            variantCount: experiment.variants.length,
          },
        },
      ]);

      return NextResponse.json<ExperimentProposalResponse>(
        await buildResponse(proposal, experiment, "Experiment proposal confirmed."),
      );
    }

    const status = parsed.data.action === "dismiss_proposal" ? "dismissed" : "postponed";
    const proposal = await updateExperimentProposalStatus({
      proposal: parsed.data.proposal,
      status,
    });
    if (status === "dismissed") {
      await appendAuditEventsSafe([
        {
          signalId: proposal.signalId,
          eventType: "EXPERIMENT_PROPOSAL_DISMISSED",
          actor: "operator",
          summary: `Dismissed ${proposal.experimentType.replaceAll("_", " ")} proposal for ${proposal.sourceTitle}.`,
          metadata: {
            proposalId: proposal.proposalId,
            experimentType: proposal.experimentType,
            comparisonTarget: proposal.comparisonTarget,
          },
        },
      ]);
    }

    return NextResponse.json<ExperimentProposalResponse>(
      await buildResponse(
        proposal,
        null,
        status === "dismissed" ? "Experiment proposal dismissed." : "Experiment proposal postponed.",
      ),
    );
  } catch (error) {
    const [proposals, experiments, postingEntries, postingOutcomes, strategicOutcomes] = await Promise.all([
      listExperimentProposals(),
      listExperiments(),
      listPostingLogEntries(),
      listPostingOutcomes(),
      listStrategicOutcomes(),
    ]);

    return NextResponse.json<ExperimentProposalResponse>(
      {
        success: false,
        persisted: false,
        proposal: null,
        proposals,
        proposalInsights: buildExperimentProposalInsights(proposals),
        experiment: null,
        experiments,
        insights: buildExperimentInsights({
          experiments,
          postingEntries,
          postingOutcomes,
          strategicOutcomes,
        }),
        message: "Experiment proposal update failed.",
        error: error instanceof Error ? error.message : "Unable to update experiment proposal.",
      },
      { status: 500 },
    );
  }
}
