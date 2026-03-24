import type { ContentOpportunity } from "@/lib/content-opportunities";
import {
  getLatestLearningSnapshotSync,
  type LearningPatternEffectivenessRow,
} from "@/lib/learning-loop";
import {
  getActiveProductionDefaults,
  listProductionDefaultVersions,
  type ProductionDefaults,
} from "@/lib/production-defaults";
import type { RenderProvider } from "@/lib/render-jobs";
import { buildFactoryProviderRunBenchmarkReport } from "@/lib/video-factory-provider-benchmarks";
import { buildFactoryRunsObservability } from "@/lib/video-factory-runs";
import type { VideoBrief } from "@/lib/video-briefs";

export interface VideoFactoryLearningPolicyDecision {
  preferredProvider: RenderProvider | null;
  defaultsSnapshot: ProductionDefaults;
  reasons: string[];
}

interface VideoFactoryLearningPolicyDependencies {
  getLatestLearningSnapshot: typeof getLatestLearningSnapshotSync;
  getActiveProductionDefaults: typeof getActiveProductionDefaults;
  listProductionDefaultVersions: typeof listProductionDefaultVersions;
}

const defaultDependencies: VideoFactoryLearningPolicyDependencies = {
  getLatestLearningSnapshot: getLatestLearningSnapshotSync,
  getActiveProductionDefaults,
  listProductionDefaultVersions,
};

function providerLearningScore(
  row: LearningPatternEffectivenessRow | null,
) {
  return row?.performanceScore ?? 0;
}

function matchProviderLearningRow(
  provider: string | null | undefined,
  deps: VideoFactoryLearningPolicyDependencies,
) {
  const normalized = provider?.trim();
  if (!normalized) {
    return null;
  }

  const latestSnapshot = deps.getLatestLearningSnapshot();
  return (
    latestSnapshot?.patternEffectiveness.provider.find(
      (row) => row.key === normalized,
    ) ?? null
  );
}

function choosePreferredProvider(input: {
  opportunities: ContentOpportunity[];
  brief: VideoBrief;
  deps: VideoFactoryLearningPolicyDependencies;
}) {
  const runs = buildFactoryRunsObservability({
    opportunities: input.opportunities,
  });
  const report = buildFactoryProviderRunBenchmarkReport({
    runs: runs.items,
  });
  const matchingGroups = report.comparisonGroups.filter(
    (group) =>
      group.format === input.brief.format &&
      group.runCount >= 3 &&
      group.approvalRate !== null,
  );

  const ranked = matchingGroups
    .map((group) => {
      const providerRow = matchProviderLearningRow(group.provider, input.deps);
      const learningScore = providerLearningScore(providerRow);
      const score =
        (group.approvalRate ?? 0) * 70 +
        Math.min(group.runCount, 10) * 1.5 +
        learningScore * 0.35 -
        (group.averageCostUsd ?? 0) * 4 -
        group.averageRetries * 4;

      return {
        provider: group.provider,
        score,
        approvalRate: group.approvalRate,
        learningScore,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.approvalRate ?? 0) - (left.approvalRate ?? 0) ||
        left.provider.localeCompare(right.provider),
    );

  return ranked[0] ?? null;
}

function chooseDefaultsSnapshot(input: {
  opportunities: ContentOpportunity[];
  brief: VideoBrief;
  deps: VideoFactoryLearningPolicyDependencies;
}) {
  const activeDefaults = input.deps.getActiveProductionDefaults();
  const versions = input.deps.listProductionDefaultVersions(
    activeDefaults.profileId,
  );
  const candidateVersions = new Set(versions.map((version) => version.version));
  const runs = buildFactoryRunsObservability({
    opportunities: input.opportunities,
  });
  const report = buildFactoryProviderRunBenchmarkReport({
    runs: runs.items,
  });
  const matchingGroups = report.comparisonGroups.filter(
    (group) =>
      group.format === input.brief.format &&
      group.defaultsVersion !== null &&
      candidateVersions.has(group.defaultsVersion) &&
      group.runCount >= 2 &&
      group.approvalRate !== null,
  );

  if (matchingGroups.length === 0) {
    return {
      defaultsSnapshot: activeDefaults,
      reason: null,
    };
  }

  const byVersion = new Map<
    number,
    {
      version: number;
      score: number;
      approvalRate: number;
    }
  >();

  for (const group of matchingGroups) {
    const version = group.defaultsVersion as number;
    const score =
      (group.approvalRate ?? 0) * 75 +
      Math.min(group.runCount, 10) * 1.5 -
      group.averageRetries * 4 -
      (group.averageCostUsd ?? 0) * 3;
    const existing = byVersion.get(version);
    if (!existing || score > existing.score) {
      byVersion.set(version, {
        version,
        score,
        approvalRate: group.approvalRate ?? 0,
      });
    }
  }

  const best = Array.from(byVersion.values()).sort(
    (left, right) =>
      right.score - left.score ||
      right.approvalRate - left.approvalRate ||
      right.version - left.version,
  )[0];

  if (!best || best.version === activeDefaults.version) {
    return {
      defaultsSnapshot: activeDefaults,
      reason: null,
    };
  }

  const selected =
    versions.find((version) => version.version === best.version) ?? activeDefaults;

  return {
    defaultsSnapshot: selected,
    reason: `Defaults v${selected.version} is outperforming the active defaults for ${input.brief.format}.`,
  };
}

export function resolveVideoFactoryLearningPolicy(input: {
  opportunities: ContentOpportunity[];
  brief: VideoBrief;
  requestedProvider?: RenderProvider | null;
  deps?: Partial<VideoFactoryLearningPolicyDependencies>;
}): VideoFactoryLearningPolicyDecision {
  const dependencies = {
    ...defaultDependencies,
    ...(input.deps ?? {}),
  };
  const providerRecommendation = choosePreferredProvider({
    opportunities: input.opportunities,
    brief: input.brief,
    deps: dependencies,
  });
  const defaultsRecommendation = chooseDefaultsSnapshot({
    opportunities: input.opportunities,
    brief: input.brief,
    deps: dependencies,
  });
  const reasons: string[] = [];

  if (
    providerRecommendation &&
    !input.requestedProvider &&
    providerRecommendation.provider !== "mock"
  ) {
    reasons.push(
      `${providerRecommendation.provider} is currently the strongest learned provider for ${input.brief.format}.`,
    );
  }

  if (defaultsRecommendation.reason) {
    reasons.push(defaultsRecommendation.reason);
  }

  return {
    preferredProvider:
      input.requestedProvider ??
      (providerRecommendation?.provider as RenderProvider | undefined) ??
      null,
    defaultsSnapshot: defaultsRecommendation.defaultsSnapshot,
    reasons,
  };
}
