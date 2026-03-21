import { z } from "zod";

import { listSignalsWithFallback } from "@/lib/airtable";
import { evaluateAutonomyPolicy } from "@/lib/autonomy-policy";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import {
  rankApprovalCandidates,
  type ApprovalQueueCandidate,
} from "@/lib/approval-ranking";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { listExperiments, type ManualExperiment } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import type { PostingAssistantPackage } from "@/lib/posting-assistant";
import { POSTING_PLATFORMS, type PostingPlatform } from "@/lib/posting-memory";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPatterns } from "@/lib/patterns";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning, type OperatorTuning } from "@/lib/tuning";
import { buildWeeklyPlanState, getCurrentWeeklyPlan, type WeeklyPlan, type WeeklyPlanState } from "@/lib/weekly-plan";
import type { SignalDataSource, SignalRecord } from "@/types/signal";

export const SAFE_POSTING_ELIGIBILITY_STATES = [
  "eligible_safe_post",
  "manual_only",
  "blocked",
] as const;

export const SAFE_POSTING_EXECUTION_SOURCES = [
  "engine_safe_mode",
  "operator_manual",
] as const;

const SAFE_POSTING_EXECUTION_PATHS: Partial<Record<PostingPlatform, string>> = {
  linkedin: "internal_safe_mode_linkedin",
  x: "internal_safe_mode_x",
};

export type SafePostingEligibilityState =
  (typeof SAFE_POSTING_ELIGIBILITY_STATES)[number];
export type SafePostingExecutionSource =
  (typeof SAFE_POSTING_EXECUTION_SOURCES)[number];

export const safePostingEligibilityStateSchema = z.enum(
  SAFE_POSTING_ELIGIBILITY_STATES,
);
export const safePostingExecutionSourceSchema = z.enum(
  SAFE_POSTING_EXECUTION_SOURCES,
);

export const safePostingEligibilitySchema = z.object({
  packageId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  platform: z.enum(POSTING_PLATFORMS),
  postingEligibility: safePostingEligibilityStateSchema,
  blockReasons: z.array(z.string().trim().min(1)).default([]),
  supportedExecutionPath: z.string().trim().nullable().default(null),
  manualOnlyReason: z.string().trim().nullable().default(null),
  requiresConfirmation: z.boolean(),
  canPostNow: z.boolean(),
  summary: z.string().trim().min(1),
});

export const safePostingExecutionPayloadSchema = z.object({
  packageId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  platform: z.enum(POSTING_PLATFORMS),
  executionPath: z.string().trim().min(1),
  finalCaption: z.string().trim().min(1),
  destinationUrl: z.string().trim().nullable().default(null),
  selectedDestinationLabel: z.string().trim().nullable().default(null),
  selectedHook: z.string().trim().nullable().default(null),
  selectedCta: z.string().trim().nullable().default(null),
  selectedAssetType: z.string().trim().nullable().default(null),
  selectedAssetReference: z.string().trim().nullable().default(null),
  selectedAssetLabel: z.string().trim().nullable().default(null),
  timingSuggestion: z.string().trim().nullable().default(null),
  commentPrompt: z.string().trim().nullable().default(null),
  altText: z.string().trim().nullable().default(null),
});

export type SafePostingEligibilityAssessment = z.infer<
  typeof safePostingEligibilitySchema
>;
export type SafePostingExecutionPayload = z.infer<
  typeof safePostingExecutionPayloadSchema
>;

export interface SafePostingEvaluationData {
  source: SignalDataSource;
  signals: SignalRecord[];
  strategy: Awaited<ReturnType<typeof getCampaignStrategy>>;
  weeklyPlan: WeeklyPlan | null;
  weeklyPlanState: WeeklyPlanState | null;
  tuning: OperatorTuning;
  experiments: ManualExperiment[];
  approvalCandidateBySignalId: Map<string, ApprovalQueueCandidate>;
}

export interface SafePostingInsights {
  eligibleCount: number;
  manualOnlyCount: number;
  blockedCount: number;
  safePostedCount: number;
  manualPostedCount: number;
  failedCount: number;
  topBlockReasons: Array<{ label: string; count: number }>;
}

function isActiveExperimentLinked(
  signalId: string,
  experiments: ManualExperiment[],
): boolean {
  return experiments.some(
    (experiment) =>
      experiment.status === "active" &&
      experiment.variants.some((variant) =>
        variant.linkedSignalIds.includes(signalId),
      ),
  );
}

function isSafeModePostingEnabled(tuning: OperatorTuning) {
  return tuning.settings.safeModePosting === "enabled";
}

function requiresSafePostingConfirmation(tuning: OperatorTuning) {
  return tuning.settings.safeModePostingConfirmation === "required";
}

function buildSafePostingSummary(
  state: SafePostingEligibilityState,
  blockReasons: string[],
  manualOnlyReason: string | null,
) {
  if (state === "eligible_safe_post") {
    return "Eligible for strict safe-mode posting.";
  }

  if (state === "manual_only") {
    return manualOnlyReason ?? "This staged package remains manual-only.";
  }

  return blockReasons[0] ?? "This staged package is blocked from safe-mode posting.";
}

function toSimulatedPostUrl(
  platform: PostingPlatform,
  signalId: string,
  packageId: string,
) {
  const shortId = packageId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toLowerCase();

  switch (platform) {
    case "linkedin":
      return `https://www.linkedin.com/feed/update/urn:li:activity:${shortId}${signalId.slice(0, 4)}/`;
    case "x":
      return `https://x.com/zazadraft/status/${shortId}${signalId.slice(0, 4)}`;
    case "reddit":
    default:
      return `https://www.reddit.com/r/Teachers/comments/${shortId}/zaza_safe_mode_post/`;
  }
}

function shouldSimulateFailure(payload: SafePostingExecutionPayload) {
  const combined = [
    payload.sourceTitle,
    payload.finalCaption,
    payload.selectedDestinationLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return combined.includes("safe-post-fail") || combined.includes("simulate failure");
}

export async function loadSafePostingEvaluationData(): Promise<SafePostingEvaluationData> {
  const [{ signals, source }, feedbackEntries, patterns, playbookCards, bundles, postingEntries, postingOutcomes, strategicOutcomes, duplicateClusters, experiments, strategy, tuning] =
    await Promise.all([
      listSignalsWithFallback({ limit: 1000 }),
      listFeedbackEntries(),
      listPatterns(),
      listPlaybookCards(),
      listPatternBundles(),
      listPostingLogEntries(),
      listPostingOutcomes(),
      listStrategicOutcomes(),
      listDuplicateClusters(),
      listExperiments(),
      getCampaignStrategy(),
      getOperatorTuning(),
    ]);

  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const cadence = buildCampaignCadenceSummary(signals, strategy, postingEntries);
  const weeklyPlanState = buildWeeklyPlanState(
    weeklyPlan,
    strategy,
    signals,
    postingEntries,
  );
  const confirmedClustersByCanonicalSignalId =
    indexConfirmedClusterByCanonicalSignalId(duplicateClusters);
  const visibleSignals = filterSignalsForActiveReviewQueue(signals, duplicateClusters);
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    signals,
    feedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    undefined,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning.settings,
  );
  const rankedCandidates = rankApprovalCandidates(
    signals
      .filter((signal) =>
        visibleSignals.some((item) => item.recordId === signal.recordId),
      )
      .map((signal) => {
        const guidance = buildUnifiedGuidanceModel({
          signal,
          guidance: guidanceBySignalId[signal.recordId],
          context: "review",
          tuning: tuning.settings,
        });

        return {
          signal,
          guidance,
          assessment: assessAutonomousSignal(signal, guidance),
        };
      }),
    Math.max(visibleSignals.length, 1),
    {
      strategy,
      cadence,
      weeklyPlan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
    },
  );

  return {
    source,
    signals,
    strategy,
    weeklyPlan,
    weeklyPlanState,
    tuning,
    experiments,
    approvalCandidateBySignalId: new Map(
      rankedCandidates.map((candidate) => [candidate.signal.recordId, candidate]),
    ),
  };
}

export function buildSafePostingEligibilityMap(input: {
  packages: PostingAssistantPackage[];
  candidateBySignalId: Map<string, ApprovalQueueCandidate>;
  tuning: OperatorTuning;
  experiments: ManualExperiment[];
}) {
  const entries = input.packages.map((pkg) => {
    const candidate = input.candidateBySignalId.get(pkg.signalId) ?? null;
    const supportedExecutionPath = SAFE_POSTING_EXECUTION_PATHS[pkg.platform] ?? null;
    const safeModeEnabled = isSafeModePostingEnabled(input.tuning);
    const confirmationRequired = requiresSafePostingConfirmation(input.tuning);
    const policy = evaluateAutonomyPolicy({
      actionType: "safe_post",
      confidenceLevel: candidate?.automationConfidence.level ?? "low",
      completenessState:
        candidate?.completeness.completenessState === "complete" ? "complete" : "incomplete",
      hasUnresolvedConflicts: (candidate?.conflicts.conflicts.length ?? 0) > 0,
      experimentLinked: isActiveExperimentLinked(pkg.signalId, input.experiments),
      workflowState: pkg.status,
      safeModePostingEnabled: safeModeEnabled,
      supportedExecutionPath,
      reviewContextKnown: Boolean(candidate),
    });

    const postingEligibility: SafePostingEligibilityState =
      policy.decision === "allow"
        ? "eligible_safe_post"
        : policy.decision === "suggest_only"
          ? "manual_only"
          : "blocked";
    const highRiskBlocked = candidate?.commercialRisk.decision === "block";
    const mediumRiskManual = candidate?.commercialRisk.decision === "suggest_fix";
    const normalizedEligibility: SafePostingEligibilityState = highRiskBlocked
      ? "blocked"
      : mediumRiskManual && postingEligibility === "eligible_safe_post"
        ? "manual_only"
        : postingEligibility;
    const blockReasons =
      normalizedEligibility === "blocked"
        ? highRiskBlocked
          ? [
              candidate?.commercialRisk.topRisk?.reason ??
                candidate?.commercialRisk.summary,
            ]
          : policy.reasons
        : [];
    const manualOnlyReason =
      normalizedEligibility === "manual_only"
        ? mediumRiskManual
          ? candidate?.commercialRisk.topRisk?.suggestedFix ??
            candidate?.commercialRisk.summary
          : policy.reasons[0] ?? `${pkg.platform === "reddit" ? "Reddit" : "This platform"} remains manual-only in strict safe mode.`
        : null;

    return [
      pkg.packageId,
      safePostingEligibilitySchema.parse({
        packageId: pkg.packageId,
        signalId: pkg.signalId,
        platform: pkg.platform,
        postingEligibility: normalizedEligibility,
        blockReasons,
        supportedExecutionPath,
        manualOnlyReason,
        requiresConfirmation: confirmationRequired,
        canPostNow: normalizedEligibility === "eligible_safe_post",
        summary: buildSafePostingSummary(
          normalizedEligibility,
          blockReasons,
          manualOnlyReason,
        ),
      }),
    ] as const;
  });

  return Object.fromEntries(entries) as Record<
    string,
    SafePostingEligibilityAssessment
  >;
}

export function prepareExecutionPayload(input: {
  pkg: PostingAssistantPackage;
  eligibility: SafePostingEligibilityAssessment;
}) {
  if (input.eligibility.postingEligibility !== "eligible_safe_post") {
    throw new Error(input.eligibility.summary);
  }

  return safePostingExecutionPayloadSchema.parse({
    packageId: input.pkg.packageId,
    signalId: input.pkg.signalId,
    sourceTitle: input.pkg.sourceTitle,
    platform: input.pkg.platform,
    executionPath: input.eligibility.supportedExecutionPath,
    finalCaption: input.pkg.finalCaption,
    destinationUrl: input.pkg.finalUtmUrl ?? input.pkg.selectedDestination?.url ?? null,
    selectedDestinationLabel: input.pkg.selectedDestination?.label ?? null,
    selectedHook: input.pkg.selectedHook,
    selectedCta: input.pkg.selectedCta,
    selectedAssetType: input.pkg.selectedAssetType,
    selectedAssetReference: input.pkg.selectedAssetReference,
    selectedAssetLabel: input.pkg.selectedAssetLabel,
    timingSuggestion: input.pkg.timingSuggestion,
    commentPrompt: input.pkg.commentPrompt,
    altText: input.pkg.altText,
  });
}

export async function executeSafePosting(input: {
  payload: SafePostingExecutionPayload;
}) {
  if (shouldSimulateFailure(input.payload)) {
    throw new Error(
      `Safe-mode execution failed on ${input.payload.platform}. Staged package was preserved for manual recovery.`,
    );
  }

  return {
    executionSource: "engine_safe_mode" as const,
    postedAt: new Date().toISOString(),
    postUrl: toSimulatedPostUrl(
      input.payload.platform,
      input.payload.signalId,
      input.payload.packageId,
    ),
    note: `Strict safe-mode post executed through ${input.payload.executionPath}.`,
  };
}

export function buildSafePostingInsights(input: {
  packages: PostingAssistantPackage[];
  eligibilityByPackageId: Record<string, SafePostingEligibilityAssessment>;
}) {
  const activePackages = input.packages.filter(
    (pkg) => pkg.status === "staged_for_posting",
  );
  const safePostedCount = input.packages.filter(
    (pkg) =>
      pkg.status === "posted" && pkg.executionSource === "engine_safe_mode",
  ).length;
  const manualPostedCount = input.packages.filter(
    (pkg) =>
      pkg.status === "posted" &&
      (pkg.executionSource === "operator_manual" || !pkg.executionSource),
  ).length;
  const failedCount = activePackages.filter((pkg) => Boolean(pkg.lastExecutionError))
    .length;
  const reasonCounts = new Map<string, number>();

  for (const pkg of activePackages) {
    const eligibility = input.eligibilityByPackageId[pkg.packageId];
    if (!eligibility) {
      continue;
    }

    for (const reason of eligibility.blockReasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  return {
    eligibleCount: activePackages.filter(
      (pkg) =>
        input.eligibilityByPackageId[pkg.packageId]?.postingEligibility ===
        "eligible_safe_post",
    ).length,
    manualOnlyCount: activePackages.filter(
      (pkg) =>
        input.eligibilityByPackageId[pkg.packageId]?.postingEligibility ===
        "manual_only",
    ).length,
    blockedCount: activePackages.filter(
      (pkg) =>
        input.eligibilityByPackageId[pkg.packageId]?.postingEligibility === "blocked",
    ).length,
    safePostedCount,
    manualPostedCount,
    failedCount,
    topBlockReasons: [...reasonCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      )
      .slice(0, 4),
  } satisfies SafePostingInsights;
}
