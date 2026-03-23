const scheduledVideoFactoryRuns = new Set<string>();

type VideoFactoryRunExecutor = (input: {
  opportunityId: string;
}) => Promise<unknown>;

export async function runVideoFactoryRunnerNow(input: {
  opportunityId: string;
}) {
  const { runQueuedContentOpportunityVideoGeneration } = await import(
    "@/lib/content-opportunities"
  );
  return runQueuedContentOpportunityVideoGeneration({
    opportunityId: input.opportunityId,
  });
}

export function createVideoFactoryRunScheduler(
  executor: VideoFactoryRunExecutor = runVideoFactoryRunnerNow,
) {
  return function scheduleVideoFactoryRun(input: {
    opportunityId: string;
  }) {
    const runKey = input.opportunityId.trim();
    if (!runKey || scheduledVideoFactoryRuns.has(runKey)) {
      return false;
    }

    scheduledVideoFactoryRuns.add(runKey);
    queueMicrotask(() => {
      void executor({
        opportunityId: runKey,
      })
        .catch(() => null)
        .finally(() => {
          scheduledVideoFactoryRuns.delete(runKey);
        });
    });

    return true;
  };
}

export const scheduleVideoFactoryRun = createVideoFactoryRunScheduler();
