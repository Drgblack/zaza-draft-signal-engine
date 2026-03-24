import { getFactoryBatchRepository } from "@/lib/factory-batch-repository";
import { getContentOpportunityRepository } from "@/lib/content-opportunity-repository";
import { getLearningRepository } from "@/lib/learning-repository";
import { buildFactoryProviderRunBenchmarkReport } from "@/lib/video-factory-provider-benchmarks";
import { getFactoryPublishOutcomeRepository } from "@/lib/factory-publish-outcome-repository";
import { getVideoFactoryRunQueueStateSummary } from "@/lib/video-factory-runner";
import { listFactoryRunsObservability } from "@/lib/video-factory-runs";

export interface PhaseEOperationsSnapshot {
  generatedAt: string;
  opportunities: {
    openCount: number;
    approvedCount: number;
    dismissedCount: number;
    totalCount: number;
  };
  batches: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    items: Awaited<
      ReturnType<ReturnType<typeof getFactoryBatchRepository>["listBatches"]>
    >;
  };
  queue: Awaited<ReturnType<typeof getVideoFactoryRunQueueStateSummary>>;
  runs: Awaited<ReturnType<typeof listFactoryRunsObservability>>;
  learning: {
    latestSnapshot: Awaited<
      ReturnType<ReturnType<typeof getLearningRepository>["getLatestSnapshot"]>
    >;
    snapshotCount: number;
  };
  providerBenchmarks: ReturnType<typeof buildFactoryProviderRunBenchmarkReport>;
  catalog: {
    mixTargetCount: number;
    autoApproveConfigCount: number;
  };
  publishOutcomes: {
    recordedCount: number;
  };
}

interface PhaseEOperationsDependencies {
  contentOpportunityRepository: ReturnType<typeof getContentOpportunityRepository>;
  learningRepository: ReturnType<typeof getLearningRepository>;
  batchRepository: ReturnType<typeof getFactoryBatchRepository>;
  publishOutcomeRepository: ReturnType<typeof getFactoryPublishOutcomeRepository>;
  getQueueStateSummary: typeof getVideoFactoryRunQueueStateSummary;
  listFactoryRunsObservability: typeof listFactoryRunsObservability;
}

const defaultDependencies: PhaseEOperationsDependencies = {
  contentOpportunityRepository: getContentOpportunityRepository(),
  learningRepository: getLearningRepository(),
  batchRepository: getFactoryBatchRepository(),
  publishOutcomeRepository: getFactoryPublishOutcomeRepository(),
  getQueueStateSummary: getVideoFactoryRunQueueStateSummary,
  listFactoryRunsObservability,
};

export async function buildPhaseEOperationsSnapshot(
  deps: Partial<PhaseEOperationsDependencies> = {},
): Promise<PhaseEOperationsSnapshot> {
  const dependencies = {
    ...defaultDependencies,
    ...deps,
  };

  const [state, queue, runs, latestSnapshot, snapshots, batches, mixTargets, autoApproveConfigs] =
    await Promise.all([
      dependencies.contentOpportunityRepository.getState(),
      dependencies.getQueueStateSummary(),
      dependencies.listFactoryRunsObservability(),
      dependencies.learningRepository.getLatestSnapshot(),
      dependencies.learningRepository.listSnapshots(),
      dependencies.batchRepository.listBatches(),
      dependencies.batchRepository.listMixTargets(),
      dependencies.batchRepository.listAutoApproveConfigs(),
    ]);

  const publishOutcomeCounts = await Promise.all(
    state.opportunities.map((opportunity) =>
      dependencies.publishOutcomeRepository.listByOpportunity(
        opportunity.opportunityId,
      ),
    ),
  );
  const providerBenchmarks = buildFactoryProviderRunBenchmarkReport({
    runs: runs.items,
  });

  return {
    generatedAt: new Date().toISOString(),
    opportunities: {
      openCount: state.openCount,
      approvedCount: state.approvedCount,
      dismissedCount: state.dismissedCount,
      totalCount: state.opportunities.length,
    },
    batches: {
      total: batches.length,
      queued: batches.filter((batch) => batch.status === "queued").length,
      running: batches.filter((batch) => batch.status === "running").length,
      completed: batches.filter((batch) => batch.status === "completed").length,
      failed: batches.filter(
        (batch) =>
          batch.status === "completed_with_failures" ||
          batch.summary.failed > 0 ||
          batch.resultsSummary.failed > 0,
      ).length,
      items: batches,
    },
    queue,
    runs,
    learning: {
      latestSnapshot,
      snapshotCount: snapshots.length,
    },
    providerBenchmarks,
    catalog: {
      mixTargetCount: mixTargets.length,
      autoApproveConfigCount: autoApproveConfigs.length,
    },
    publishOutcomes: {
      recordedCount: publishOutcomeCounts.reduce(
        (sum, outcomes) => sum + outcomes.length,
        0,
      ),
    },
  };
}
