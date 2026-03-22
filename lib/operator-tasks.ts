import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates, type ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  type DuplicateCluster,
  DUPLICATE_CLUSTER_CONFIDENCE_LEVELS,
  DUPLICATE_CLUSTER_SIMILARITY_TYPES,
} from "@/lib/duplicate-clusters";
import type { ManualExperiment } from "@/lib/experiments";
import type { SignalFeedback } from "@/lib/feedback-definitions";
import {
  evaluateApprovalPackageCompleteness,
  type ApprovalPackageCompleteness,
} from "@/lib/completeness";
import { listFollowUpTasks, type FollowUpTask } from "@/lib/follow-up";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { getSourceAutopilotV2State, type SourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import type { PostingOutcome } from "@/lib/outcomes";
import type { PatternBundle } from "@/lib/pattern-bundles";
import { indexBundleSummariesByPatternId } from "@/lib/pattern-bundles";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import type { PlaybookCard } from "@/lib/playbook-card-definitions";
import type { SignalPattern } from "@/lib/pattern-definitions";
import type { PostingLogEntry } from "@/lib/posting-memory";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { OperatorTuningSettings } from "@/lib/tuning";
import type { SignalRecord } from "@/types/signal";
import type { WeeklyPlan, WeeklyPlanState } from "@/lib/weekly-plan";

const OPERATOR_TASK_STORE_PATH = path.join(process.cwd(), "data", "operator-tasks.json");

export const OPERATOR_TASK_TYPES = [
  "fill_missing_strategic_outcome",
  "resolve_borderline_case",
  "confirm_duplicate_cluster",
  "approve_source_recommendation",
  "finish_incomplete_package",
  "resolve_conflict",
  "complete_experiment_result",
  "refresh_stale_candidate",
] as const;

export const OPERATOR_TASK_ENTITY_TYPES = [
  "signal",
  "posting",
  "duplicate_cluster",
  "source_proposal",
  "experiment",
] as const;

export const OPERATOR_TASK_PRIORITIES = ["high", "medium", "low"] as const;
export const OPERATOR_TASK_STATUSES = ["open", "done", "dismissed"] as const;

export type OperatorTaskType = (typeof OPERATOR_TASK_TYPES)[number];
export type OperatorTaskLinkedEntityType = (typeof OPERATOR_TASK_ENTITY_TYPES)[number];
export type OperatorTaskPriority = (typeof OPERATOR_TASK_PRIORITIES)[number];
export type OperatorTaskStatus = (typeof OPERATOR_TASK_STATUSES)[number];

const duplicateClusterQuickActionSchema = z.object({
  type: z.literal("confirm_duplicate_cluster"),
  label: z.string().trim().min(1),
  cluster: z.object({
    clusterId: z.string().trim().min(1),
    signalIds: z.array(z.string().trim().min(1)).min(2),
    canonicalSignalId: z.string().trim().min(1),
    similarityType: z.enum(DUPLICATE_CLUSTER_SIMILARITY_TYPES),
    clusterConfidence: z.enum(DUPLICATE_CLUSTER_CONFIDENCE_LEVELS),
    clusterReason: z.string().trim().min(1),
  }),
});

const sourceProposalQuickActionSchema = z.object({
  type: z.literal("approve_source_recommendation"),
  label: z.string().trim().min(1),
  proposalId: z.string().trim().min(1),
});

export const operatorTaskQuickActionSchema = z.union([
  duplicateClusterQuickActionSchema,
  sourceProposalQuickActionSchema,
]);

export const operatorTaskSchema = z.object({
  id: z.string().trim().min(1),
  taskType: z.enum(OPERATOR_TASK_TYPES),
  linkedEntityType: z.enum(OPERATOR_TASK_ENTITY_TYPES),
  linkedEntityId: z.string().trim().min(1),
  signalId: z.string().trim().min(1).nullable().default(null),
  title: z.string().trim().min(1),
  href: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  dueAt: z.string().trim().nullable().default(null),
  priority: z.enum(OPERATOR_TASK_PRIORITIES),
  reason: z.string().trim().min(1),
  status: z.enum(OPERATOR_TASK_STATUSES).default("open"),
  quickAction: operatorTaskQuickActionSchema.nullable().optional(),
});

const operatorTaskStoreSchema = z.object({
  tasks: z.array(operatorTaskSchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export const operatorTaskActionRequestSchema = z.object({
  taskId: z.string().trim().min(1),
  status: z.enum(["done", "dismissed"]),
});

export type OperatorTaskQuickAction = z.infer<typeof operatorTaskQuickActionSchema>;
export type OperatorTask = z.infer<typeof operatorTaskSchema>;

let inMemoryOperatorTaskStore = buildEmptyStore();

export interface OperatorTaskSummary {
  openCount: number;
  highPriorityCount: number;
  doneCount: number;
  dismissedCount: number;
  byType: Array<{ taskType: OperatorTaskType; label: string; count: number }>;
  topBottlenecks: Array<{ label: string; count: number }>;
}

function normalizeTask(task: OperatorTask): OperatorTask {
  return operatorTaskSchema.parse(task);
}

function buildEmptyStore() {
  return operatorTaskStoreSchema.parse({
    tasks: [],
    updatedAt: null,
  });
}

async function readPersistedStore() {
  try {
    const raw = await readFile(OPERATOR_TASK_STORE_PATH, "utf8");
    const store = sanitizeOperatorTaskStore(JSON.parse(raw));
    inMemoryOperatorTaskStore = store;
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryOperatorTaskStore;
    }

    console.warn(
      "operator-tasks: persisted store could not be parsed, falling back to in-memory state.",
      error,
    );
    return inMemoryOperatorTaskStore;
  }
}

async function writeStore(store: z.infer<typeof operatorTaskStoreSchema>) {
  const parsed = sanitizeOperatorTaskStore(store);
  inMemoryOperatorTaskStore = parsed;

  try {
    await mkdir(path.dirname(OPERATOR_TASK_STORE_PATH), { recursive: true });
    await writeFile(OPERATOR_TASK_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("operator-tasks", error);
      return;
    }

    throw error;
  }
}

function sanitizeOperatorTaskStore(
  input: unknown,
): z.infer<typeof operatorTaskStoreSchema> {
  const parsed = operatorTaskStoreSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const fallbackInput =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const tasks = Array.isArray((fallbackInput as { tasks?: unknown }).tasks)
    ? (fallbackInput as { tasks?: unknown[] }).tasks ?? []
    : [];
  const updatedAt =
    typeof (fallbackInput as { updatedAt?: unknown }).updatedAt === "string"
      ? ((fallbackInput as { updatedAt?: string }).updatedAt ?? null)
      : null;

  const sanitizedTasks = tasks
    .map((task, index) => {
      const parsedTask = operatorTaskSchema.safeParse(task);
      if (!parsedTask.success) {
        console.warn(
          `operator-tasks: dropping invalid persisted task at index ${index}.`,
          parsedTask.error,
        );
        return null;
      }

      return parsedTask.data;
    })
    .filter((task): task is OperatorTask => Boolean(task));

  return operatorTaskStoreSchema.parse({
    tasks: sortTasks(sanitizedTasks),
    updatedAt,
  });
}

function toIso(value: number | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function addDays(value: Date, days: number): string {
  return toIso(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function priorityScore(priority: OperatorTaskPriority): number {
  switch (priority) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
    default:
      return 2;
  }
}

function sortTasks(tasks: OperatorTask[]): OperatorTask[] {
  const statusRank: Record<OperatorTaskStatus, number> = {
    open: 0,
    done: 1,
    dismissed: 2,
  };

  return [...tasks].sort(
    (left, right) =>
      statusRank[left.status] - statusRank[right.status] ||
      priorityScore(left.priority) - priorityScore(right.priority) ||
      (left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER) -
        (right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER) ||
      left.title.localeCompare(right.title),
  );
}

function isCampaignCritical(signal: SignalRecord | null, rankReasons?: string[]): boolean {
  if (!signal) {
    return false;
  }

  return Boolean(signal.campaignId) || (rankReasons ?? []).some((reason) => reason.toLowerCase().includes("campaign"));
}

function isHighPrioritySignal(signal: SignalRecord | null): boolean {
  return signal?.reviewPriority === "Urgent" || signal?.reviewPriority === "High";
}

function taskTypeLabel(taskType: OperatorTaskType): string {
  switch (taskType) {
    case "fill_missing_strategic_outcome":
      return "Missing strategic outcome";
    case "resolve_borderline_case":
      return "Borderline case";
    case "confirm_duplicate_cluster":
      return "Duplicate cluster";
    case "approve_source_recommendation":
      return "Source recommendation";
    case "finish_incomplete_package":
      return "Incomplete package";
    case "resolve_conflict":
      return "Conflict resolution";
    case "complete_experiment_result":
      return "Experiment result";
    case "refresh_stale_candidate":
    default:
      return "Stale refresh";
  }
}

export function getOperatorTaskTypeLabel(taskType: OperatorTaskType): string {
  return taskTypeLabel(taskType);
}

export function getOperatorTaskPriorityLabel(priority: OperatorTaskPriority): string {
  return priority === "high" ? "High priority" : priority === "medium" ? "Medium priority" : "Low priority";
}

function followUpTaskToOperatorTask(task: FollowUpTask, now: Date): OperatorTask | null {
  if (task.status !== "open") {
    return null;
  }

  const isOverdue = task.dueAt ? new Date(task.dueAt).getTime() < now.getTime() : false;

  if (task.taskType === "complete_strategic_outcome") {
    return normalizeTask({
      id: `operator:${task.id}`,
      taskType: "fill_missing_strategic_outcome",
      linkedEntityType: "posting",
      linkedEntityId: task.linkedEntityId,
      signalId: task.signalId,
      title: "Fill missing strategic outcome",
      href: task.href,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      dueAt: task.dueAt,
      priority: isOverdue ? "high" : "medium",
      reason: task.reason,
      status: "open",
      quickAction: null,
    });
  }

  if (task.taskType === "complete_experiment_result") {
    return normalizeTask({
      id: `operator:${task.id}`,
      taskType: "complete_experiment_result",
      linkedEntityType: "experiment",
      linkedEntityId: task.linkedEntityId,
      signalId: task.signalId,
      title: "Complete experiment result",
      href: task.href,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      dueAt: task.dueAt,
      priority: isOverdue ? "high" : "medium",
      reason: task.reason,
      status: "open",
      quickAction: null,
    });
  }

  return null;
}

function buildBorderlineHref(signalId: string, stage: ReturnType<typeof assessAutonomousSignal>["stage"]) {
  if (stage === "auto_interpret") {
    return `/signals/${signalId}/interpret`;
  }

  if (stage === "auto_generate") {
    return `/signals/${signalId}/generate`;
  }

  return `/signals/${signalId}/review`;
}

function buildSignalTaskId(taskType: Exclude<OperatorTaskType, "fill_missing_strategic_outcome" | "confirm_duplicate_cluster" | "approve_source_recommendation" | "complete_experiment_result">, signalId: string) {
  return `operator:${taskType}:${signalId}`;
}

function buildSignalTaskPriority(signal: SignalRecord, fallback: OperatorTaskPriority, rankReasons?: string[]): OperatorTaskPriority {
  if (isCampaignCritical(signal, rankReasons) || isHighPrioritySignal(signal)) {
    return "high";
  }

  return fallback;
}

function buildIncompletePackageTask(
  signal: SignalRecord,
  completeness: ApprovalPackageCompleteness,
  guidanceConfidenceLevel: "high" | "moderate" | "low",
): OperatorTask {
  return normalizeTask({
    id: buildSignalTaskId("finish_incomplete_package", signal.recordId),
    taskType: "finish_incomplete_package",
    linkedEntityType: "signal",
    linkedEntityId: signal.recordId,
    signalId: signal.recordId,
    title: "Finish incomplete package",
    href: `/signals/${signal.recordId}/review`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt: null,
    priority: buildSignalTaskPriority(signal, guidanceConfidenceLevel === "high" ? "high" : "medium"),
    reason:
      completeness.missingElements.length > 0
        ? `${signal.sourceTitle} is one packaging pass away from review-ready. Missing ${completeness.missingElements.slice(0, 2).join(" and ")}.`
        : `${signal.sourceTitle} still needs a fuller package before final review can move faster.`,
    status: "open",
    quickAction: null,
  });
}

function buildConflictTask(candidate: ApprovalQueueCandidate): OperatorTask {
  return normalizeTask({
    id: buildSignalTaskId("resolve_conflict", candidate.signal.recordId),
    taskType: "resolve_conflict",
    linkedEntityType: "signal",
    linkedEntityId: candidate.signal.recordId,
    signalId: candidate.signal.recordId,
    title: "Resolve package conflict",
    href: `/signals/${candidate.signal.recordId}/review`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt: null,
    priority: buildSignalTaskPriority(candidate.signal, "medium", candidate.rankReasons),
    reason:
      candidate.conflicts.topConflicts[0]?.reason ??
      `${candidate.signal.sourceTitle} has a package-alignment conflict that needs judgement before approval.`,
    status: "open",
    quickAction: null,
  });
}

function buildRefreshTask(candidate: ApprovalQueueCandidate, now: Date): OperatorTask {
  return normalizeTask({
    id: buildSignalTaskId("refresh_stale_candidate", candidate.signal.recordId),
    taskType: "refresh_stale_candidate",
    linkedEntityType: "signal",
    linkedEntityId: candidate.signal.recordId,
    signalId: candidate.signal.recordId,
    title: "Refresh stale candidate",
    href: `/signals/${candidate.signal.recordId}/review`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    dueAt: addDays(now, 2),
    priority: buildSignalTaskPriority(candidate.signal, "medium", candidate.rankReasons),
    reason:
      candidate.stale.suggestedRefreshNote ??
      candidate.stale.reasons[0]?.summary ??
      `${candidate.signal.sourceTitle} has aged enough that it needs a bounded refresh before it should sit near the top queue again.`,
    status: "open",
    quickAction: null,
  });
}

function buildRepairableTask(candidate: ApprovalQueueCandidate): OperatorTask {
  return normalizeTask({
    id: buildSignalTaskId("finish_incomplete_package", candidate.signal.recordId),
    taskType: "finish_incomplete_package",
    linkedEntityType: "signal",
    linkedEntityId: candidate.signal.recordId,
    signalId: candidate.signal.recordId,
    title: "Finish repairable package",
    href: `/signals/${candidate.signal.recordId}/review`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt: null,
    priority: buildSignalTaskPriority(candidate.signal, "medium", candidate.rankReasons),
    reason:
      candidate.triage.reason ??
      `${candidate.signal.sourceTitle} is close to approval-ready but still needs one bounded package fix.`,
    status: "open",
    quickAction: null,
  });
}

function buildBorderlineTask(
  signal: SignalRecord,
  assessment: ReturnType<typeof assessAutonomousSignal>,
): OperatorTask {
  return normalizeTask({
    id: buildSignalTaskId("resolve_borderline_case", signal.recordId),
    taskType: "resolve_borderline_case",
    linkedEntityType: "signal",
    linkedEntityId: signal.recordId,
    signalId: signal.recordId,
    title: "Resolve borderline case",
    href: buildBorderlineHref(signal.recordId, assessment.stage),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt: null,
    priority: buildSignalTaskPriority(signal, "medium"),
    reason: assessment.summary,
    status: "open",
    quickAction: null,
  });
}

function buildDuplicateClusterTask(
  cluster: DuplicateCluster,
  signalsById: Map<string, SignalRecord>,
  blockingSignalIds: Set<string>,
): OperatorTask {
  const linkedSignals = cluster.signalIds
    .map((signalId) => signalsById.get(signalId))
    .filter((signal): signal is SignalRecord => Boolean(signal));
  const primarySignal = signalsById.get(cluster.canonicalSignalId) ?? linkedSignals[0] ?? null;
  const priority: OperatorTaskPriority =
    cluster.signalIds.some((signalId) => blockingSignalIds.has(signalId)) || isHighPrioritySignal(primarySignal)
      ? "high"
      : "medium";

  return normalizeTask({
    id: `operator:confirm_duplicate_cluster:${cluster.clusterId}`,
    taskType: "confirm_duplicate_cluster",
    linkedEntityType: "duplicate_cluster",
    linkedEntityId: cluster.clusterId,
    signalId: primarySignal?.recordId ?? null,
    title: "Confirm duplicate cluster",
    href: "/review?view=needs_judgement#duplicate-clusters",
    createdAt: cluster.createdAt,
    updatedAt: cluster.updatedAt,
    dueAt: null,
    priority,
    reason:
      primarySignal
        ? `${primarySignal.sourceTitle} is still blocked by a suggested duplicate cluster with ${cluster.signalIds.length} related records.`
        : `A suggested duplicate cluster with ${cluster.signalIds.length} related records still needs confirmation.`,
    status: "open",
    quickAction: {
      type: "confirm_duplicate_cluster",
      label: "Confirm cluster",
      cluster: {
        clusterId: cluster.clusterId,
        signalIds: cluster.signalIds,
        canonicalSignalId: cluster.canonicalSignalId,
        similarityType: cluster.similarityType,
        clusterConfidence: cluster.clusterConfidence,
        clusterReason: cluster.clusterReason,
      },
    },
  });
}

function buildSourceProposalTask(
  proposal: SourceAutopilotV2State["proposals"][number],
): OperatorTask {
  return normalizeTask({
    id: `operator:approve_source_recommendation:${proposal.proposalId}`,
    taskType: "approve_source_recommendation",
    linkedEntityType: "source_proposal",
    linkedEntityId: proposal.proposalId,
    signalId: null,
    title: "Approve source recommendation",
    href: `/ingestion#source-${proposal.sourceId ?? proposal.proposalId}`,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    dueAt: null,
    priority: proposal.confidenceLevel === "high" ? "high" : "medium",
    reason: `${proposal.title} for ${proposal.scopeLabel}. ${proposal.reason}`,
    status: "open",
    quickAction: {
      type: "approve_source_recommendation",
      label: "Approve recommendation",
      proposalId: proposal.proposalId,
    },
  });
}

async function buildGeneratedTasks(input: {
  signals: SignalRecord[];
  feedbackEntries: SignalFeedback[];
  patterns: SignalPattern[];
  playbookCards: PlaybookCard[];
  bundles: PatternBundle[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  duplicateClusters: DuplicateCluster[];
  strategy: CampaignStrategy;
  cadence: CampaignCadenceSummary;
  weeklyPlan: WeeklyPlan | null;
  weeklyPlanState: WeeklyPlanState | null;
  tuning: OperatorTuningSettings;
  experiments?: ManualExperiment[];
  sourceAutopilotState: SourceAutopilotV2State;
  now: Date;
}): Promise<OperatorTask[]> {
  const experiments = input.experiments ?? [];
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(input.bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: input.signals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: input.signals,
    playbookCards: input.playbookCards,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    bundleSummariesByPatternId,
  });
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    input.signals,
    input.feedbackEntries,
    input.patterns,
    bundleSummariesByPatternId,
    undefined,
    input.playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    input.tuning,
  );
  const autonomousAssessments = input.signals.map((signal) => {
    const guidance = buildUnifiedGuidanceModel({
      signal,
      guidance: guidanceBySignalId[signal.recordId],
      context: "review",
      tuning: input.tuning,
    });
    return {
      signal,
      guidance,
      assessment: assessAutonomousSignal(signal, guidance),
    };
  });
  const approvalReadyCandidates = rankApprovalCandidates(
    autonomousAssessments.filter((item) => item.assessment.decision === "approval_ready"),
    50,
    {
      strategy: input.strategy,
      cadence: input.cadence,
      weeklyPlan: input.weeklyPlan,
      weeklyPlanState: input.weeklyPlanState,
      allSignals: input.signals,
      postingEntries: input.postingEntries,
      postingOutcomes: input.postingOutcomes,
      strategicOutcomes: input.strategicOutcomes,
      experiments,
    },
  );
  const followUpTasks = await listFollowUpTasks({
    signals: input.signals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    strategicOutcomes: input.strategicOutcomes,
    experiments,
    weeklyPlans: input.weeklyPlan ? [input.weeklyPlan] : [],
  });
  const tasks: OperatorTask[] = [];
  const signalTaskRanks = new Map<string, { rank: number; task: OperatorTask }>();
  const signalsById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const topApprovalSignalIds = new Set(
    approvalReadyCandidates.slice(0, 8).map((candidate) => candidate.signal.recordId),
  );

  const maybeSetSignalTask = (signalId: string, rank: number, task: OperatorTask) => {
    const existing = signalTaskRanks.get(signalId);
    if (!existing || rank < existing.rank) {
      signalTaskRanks.set(signalId, { rank, task });
    }
  };

  for (const followUpTask of followUpTasks) {
    const operatorTask = followUpTaskToOperatorTask(followUpTask, input.now);
    if (operatorTask) {
      tasks.push(operatorTask);
    }
  }

  for (const item of autonomousAssessments) {
    if (item.assessment.decision !== "hold") {
      continue;
    }

    maybeSetSignalTask(item.signal.recordId, 1, buildBorderlineTask(item.signal, item.assessment));
  }

  for (const candidate of approvalReadyCandidates) {
    if (candidate.triage.triageState === "suppress") {
      continue;
    }

    if (candidate.triage.triageState === "needs_judgement") {
      maybeSetSignalTask(candidate.signal.recordId, 2, buildConflictTask(candidate));
      continue;
    }

    if (
      candidate.triage.triageState === "repairable" &&
      candidate.preReviewRepair.decision !== "applied"
    ) {
      maybeSetSignalTask(candidate.signal.recordId, 3, buildRepairableTask(candidate));
      continue;
    }

    if (
      candidate.stale.state === "stale_needs_refresh" ||
      candidate.stale.operatorAction === "refresh_requested"
    ) {
      maybeSetSignalTask(candidate.signal.recordId, 4, buildRefreshTask(candidate, input.now));
    }
  }

  for (const item of autonomousAssessments) {
    if (!item.signal.xDraft || !item.signal.linkedInDraft || !item.signal.redditDraft) {
      continue;
    }

    const completeness = evaluateApprovalPackageCompleteness({
      signal: item.signal,
      guidanceConfidenceLevel: item.guidance.confidence.confidenceLevel,
    });
    if (completeness.completenessState === "incomplete") {
      maybeSetSignalTask(
        item.signal.recordId,
        3,
        buildIncompletePackageTask(item.signal, completeness, item.guidance.confidence.confidenceLevel),
      );
    }
  }

  for (const cluster of input.duplicateClusters.filter((item) => item.status === "suggested")) {
    tasks.push(buildDuplicateClusterTask(cluster, signalsById, topApprovalSignalIds));
  }

  for (const proposal of input.sourceAutopilotState.proposals.filter((item) => item.status === "open")) {
    tasks.push(buildSourceProposalTask(proposal));
  }

  tasks.push(...Array.from(signalTaskRanks.values()).map((entry) => entry.task));

  return sortTasks(
    Array.from(new Map(tasks.map((task) => [task.id, task])).values()),
  );
}

export async function listOperatorTasks(input: {
  signals: SignalRecord[];
  feedbackEntries: SignalFeedback[];
  patterns: SignalPattern[];
  playbookCards: PlaybookCard[];
  bundles: PatternBundle[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  duplicateClusters: DuplicateCluster[];
  strategy: CampaignStrategy;
  cadence: CampaignCadenceSummary;
  weeklyPlan: WeeklyPlan | null;
  weeklyPlanState: WeeklyPlanState | null;
  tuning: OperatorTuningSettings;
  experiments?: ManualExperiment[];
  sourceAutopilotState?: SourceAutopilotV2State;
  now?: Date;
}): Promise<OperatorTask[]> {
  const now = input.now ?? new Date();
  const sourceAutopilotState = input.sourceAutopilotState ?? (await getSourceAutopilotV2State());
  const persisted = await readPersistedStore();
  const generated = await buildGeneratedTasks({
    ...input,
    sourceAutopilotState,
    now,
  });
  const persistedById = new Map(persisted.tasks.map((task) => [task.id, task]));
  const generatedById = new Map(generated.map((task) => [task.id, task]));
  const nextTasks: OperatorTask[] = [];
  const createdTasks: OperatorTask[] = [];
  const autoClosedTasks: OperatorTask[] = [];

  for (const task of generated) {
    const persistedTask = persistedById.get(task.id);
    if (!persistedTask) {
      nextTasks.push(task);
      createdTasks.push(task);
      continue;
    }

    const status: OperatorTaskStatus =
      persistedTask.status === "dismissed"
        ? "dismissed"
        : "open";
    nextTasks.push(
      normalizeTask({
        ...task,
        createdAt: persistedTask.createdAt,
        updatedAt: status === persistedTask.status ? persistedTask.updatedAt : now.toISOString(),
        status,
      }),
    );
  }

  for (const task of persisted.tasks) {
    if (generatedById.has(task.id)) {
      continue;
    }

    const autoClosed = normalizeTask({
      ...task,
      status: "done",
      updatedAt: task.status === "done" ? task.updatedAt : now.toISOString(),
    });
    if (task.status !== "done") {
      autoClosedTasks.push(autoClosed);
    }
    nextTasks.push(autoClosed);
  }

  const sorted = sortTasks(
    Array.from(new Map(nextTasks.map((task) => [task.id, task])).values()),
  );

  if (JSON.stringify(sorted) !== JSON.stringify(sortTasks(persisted.tasks))) {
    await writeStore({
      tasks: sorted,
      updatedAt: now.toISOString(),
    });
  }

  const auditEvents: AuditEventInput[] = [
    ...createdTasks.map((task) => ({
      signalId: task.signalId ?? `${task.linkedEntityType}:${task.linkedEntityId}`,
      eventType: "OPERATOR_TASK_CREATED" as const,
      actor: "system" as const,
      summary: `Created operator task: ${task.title}.`,
      metadata: {
        taskId: task.id,
        taskType: task.taskType,
        priority: task.priority,
        linkedEntityType: task.linkedEntityType,
        linkedEntityId: task.linkedEntityId,
      },
    })),
    ...autoClosedTasks.map((task) => ({
      signalId: task.signalId ?? `${task.linkedEntityType}:${task.linkedEntityId}`,
      eventType: "OPERATOR_TASK_AUTO_CLOSED" as const,
      actor: "system" as const,
      summary: `Auto-closed operator task: ${task.title}.`,
      metadata: {
        taskId: task.id,
        taskType: task.taskType,
        linkedEntityType: task.linkedEntityType,
        linkedEntityId: task.linkedEntityId,
      },
    })),
  ];

  if (auditEvents.length > 0) {
    await appendAuditEventsSafe(auditEvents);
  }

  return sorted;
}

export async function updateOperatorTaskStatus(
  taskId: string,
  status: Extract<OperatorTaskStatus, "done" | "dismissed">,
): Promise<OperatorTask> {
  const persisted = await readPersistedStore();
  const task = persisted.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Operator task not found.");
  }

  const nextTask = normalizeTask({
    ...task,
    status,
    updatedAt: new Date().toISOString(),
  });
  const nextTasks = persisted.tasks.map((item) => (item.id === taskId ? nextTask : item));
  await writeStore({
    tasks: sortTasks(nextTasks),
    updatedAt: new Date().toISOString(),
  });

  await appendAuditEventsSafe([
    {
      signalId: nextTask.signalId ?? `${nextTask.linkedEntityType}:${nextTask.linkedEntityId}`,
      eventType: status === "done" ? "OPERATOR_TASK_COMPLETED" : "OPERATOR_TASK_DISMISSED",
      actor: "operator",
      summary: `${status === "done" ? "Completed" : "Dismissed"} operator task: ${nextTask.title}.`,
      metadata: {
        taskId: nextTask.id,
        taskType: nextTask.taskType,
        priority: nextTask.priority,
        linkedEntityType: nextTask.linkedEntityType,
        linkedEntityId: nextTask.linkedEntityId,
      },
    },
  ]);

  return nextTask;
}

export function buildOperatorTaskSummary(tasks: OperatorTask[]): OperatorTaskSummary {
  const openTasks = tasks.filter((task) => task.status === "open");
  const byTypeCounts = new Map<OperatorTaskType, number>();

  for (const task of openTasks) {
    byTypeCounts.set(task.taskType, (byTypeCounts.get(task.taskType) ?? 0) + 1);
  }

  const byType = [...byTypeCounts.entries()]
    .map(([taskType, count]) => ({
      taskType,
      label: taskTypeLabel(taskType),
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  return {
    openCount: openTasks.length,
    highPriorityCount: openTasks.filter((task) => task.priority === "high").length,
    doneCount: tasks.filter((task) => task.status === "done").length,
    dismissedCount: tasks.filter((task) => task.status === "dismissed").length,
    byType,
    topBottlenecks: byType.slice(0, 5).map((row) => ({
      label: row.label,
      count: row.count,
    })),
  };
}
