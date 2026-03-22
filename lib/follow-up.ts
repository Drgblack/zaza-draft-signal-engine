import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import type { ManualExperiment } from "@/lib/experiments";
import type { PostingOutcome } from "@/lib/outcomes";
import { getPostingPlatformLabel, type PostingLogEntry } from "@/lib/posting-memory";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { SignalRecord } from "@/types/signal";
import type { WeeklyPlan } from "@/lib/weekly-plan";

const FOLLOW_UP_STORE_PATH = path.join(process.cwd(), "data", "follow-up-tasks.json");

export const FOLLOW_UP_TASK_TYPES = [
  "rate_post_outcome",
  "complete_strategic_outcome",
  "complete_experiment_result",
  "review_weekly_pack_outcomes",
] as const;

export const FOLLOW_UP_ENTITY_TYPES = ["posting", "experiment", "weekly_pack"] as const;
export const FOLLOW_UP_STATUSES = ["open", "done", "dismissed"] as const;

export type FollowUpTaskType = (typeof FOLLOW_UP_TASK_TYPES)[number];
export type FollowUpEntityType = (typeof FOLLOW_UP_ENTITY_TYPES)[number];
export type FollowUpTaskStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const followUpTaskSchema = z.object({
  id: z.string().trim().min(1),
  taskType: z.enum(FOLLOW_UP_TASK_TYPES),
  linkedEntityType: z.enum(FOLLOW_UP_ENTITY_TYPES),
  linkedEntityId: z.string().trim().min(1),
  signalId: z.string().trim().min(1).nullable().default(null),
  platform: z.string().trim().nullable().default(null),
  title: z.string().trim().min(1),
  href: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  dueAt: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  status: z.enum(FOLLOW_UP_STATUSES).default("open"),
});

const followUpStoreSchema = z.object({
  tasks: z.array(followUpTaskSchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export const followUpActionRequestSchema = z.object({
  taskId: z.string().trim().min(1),
  status: z.enum(["done", "dismissed"]),
});

export type FollowUpTask = z.infer<typeof followUpTaskSchema>;
let inMemoryFollowUpStore = buildEmptyStore();

function toIso(value: number | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function addHours(value: string, hours: number): string {
  const base = parseIso(value);
  return toIso((base ?? Date.now()) + hours * 60 * 60 * 1000);
}

function addDays(value: string, days: number): string {
  return addHours(value, days * 24);
}

function sortTasks(tasks: FollowUpTask[]): FollowUpTask[] {
  const statusRank: Record<FollowUpTaskStatus, number> = {
    open: 0,
    done: 1,
    dismissed: 2,
  };

  return [...tasks].sort(
    (left, right) =>
      statusRank[left.status] - statusRank[right.status] ||
      new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime() ||
      left.title.localeCompare(right.title),
  );
}

function buildEmptyStore() {
  return followUpStoreSchema.parse({
    tasks: [],
    updatedAt: null,
  });
}

async function readPersistedStore() {
  try {
    const raw = await readFile(FOLLOW_UP_STORE_PATH, "utf8");
    const store = followUpStoreSchema.parse(JSON.parse(raw));
    inMemoryFollowUpStore = store;
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryFollowUpStore;
    }

    throw error;
  }
}

async function writeStore(store: z.infer<typeof followUpStoreSchema>) {
  const parsed = followUpStoreSchema.parse(store);
  inMemoryFollowUpStore = parsed;

  try {
    await mkdir(path.dirname(FOLLOW_UP_STORE_PATH), { recursive: true });
    await writeFile(FOLLOW_UP_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("follow-up", error);
      return;
    }

    throw error;
  }
}

function normalizeTask(task: FollowUpTask): FollowUpTask {
  return followUpTaskSchema.parse(task);
}

function formatWeekLabel(weekStartDate: string): string {
  return `week of ${weekStartDate}`;
}

function daysOverdue(task: FollowUpTask, now: Date): number {
  const due = parseIso(task.dueAt);
  if (due === null) {
    return 0;
  }

  const diff = now.getTime() - due;
  return diff > 0 ? Math.floor(diff / (24 * 60 * 60 * 1000)) : 0;
}

function buildPostingTask(entry: PostingLogEntry, signal: SignalRecord | null, type: "outcome" | "strategic"): FollowUpTask {
  const postedAt = entry.postedAt;
  const platformLabel = getPostingPlatformLabel(entry.platform);
  const taskType = type === "outcome" ? "rate_post_outcome" : "complete_strategic_outcome";
  const dueAt = type === "outcome" ? addHours(postedAt, 24) : addDays(postedAt, 3);
  const title =
    type === "outcome"
      ? `${platformLabel} post still needs outcome rating`
      : `${platformLabel} post still needs strategic outcome`;

  return normalizeTask({
    id: `follow-up:${taskType}:${entry.id}`,
    taskType,
    linkedEntityType: "posting",
    linkedEntityId: entry.id,
    signalId: entry.signalId,
    platform: entry.platform,
    title,
    href: `/signals/${entry.signalId}#posting-log-${entry.id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt,
    reason:
      type === "outcome"
        ? `${platformLabel} post from ${signal?.sourceTitle ?? "this signal"} is old enough for an early qualitative outcome rating.`
        : `${platformLabel} post from ${signal?.sourceTitle ?? "this signal"} still needs manual strategic outcome data.`,
    status: "open",
  });
}

function collectVariantPostingIds(variant: ManualExperiment["variants"][number], postingEntries: PostingLogEntry[]): string[] {
  const signalLinkedPostingIds = postingEntries
    .filter((entry) => variant.linkedSignalIds.includes(entry.signalId))
    .map((entry) => entry.id);

  return Array.from(new Set([...variant.linkedPostingIds, ...signalLinkedPostingIds]));
}

function buildExperimentCoverage(
  experiment: ManualExperiment,
  postingEntries: PostingLogEntry[],
  postingOutcomes: PostingOutcome[],
  strategicOutcomes: StrategicOutcome[],
) {
  const postingOutcomeIds = new Set(postingOutcomes.map((outcome) => outcome.postingLogId));
  const strategicOutcomeIds = new Set(strategicOutcomes.map((outcome) => outcome.postingLogId));

  const variants = experiment.variants.map((variant) => {
    const postingIds = collectVariantPostingIds(variant, postingEntries);
    const hasAnyPosting = postingIds.length > 0;
    const hasResult = postingIds.some(
      (postingId) => postingOutcomeIds.has(postingId) || strategicOutcomeIds.has(postingId),
    );
    const latestPostedAt = postingEntries
      .filter((entry) => postingIds.includes(entry.id))
      .map((entry) => parseIso(entry.postedAt))
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0] ?? null;

    return {
      variantId: variant.variantId,
      variantLabel: variant.variantLabel,
      postingIds,
      hasAnyPosting,
      hasResult,
      latestPostedAt,
    };
  });

  const completeVariantCount = variants.filter((variant) => variant.hasResult).length;
  const missingVariants = variants.filter((variant) => variant.hasAnyPosting && !variant.hasResult);
  const latestPostedAt = variants
    .map((variant) => variant.latestPostedAt)
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)[0] ?? null;

  return {
    variants,
    completeVariantCount,
    missingVariants,
    latestPostedAt,
  };
}

function buildExperimentTask(
  experiment: ManualExperiment,
  coverage: ReturnType<typeof buildExperimentCoverage>,
): FollowUpTask | null {
  if (experiment.status === "completed" || coverage.completeVariantCount === 0 || coverage.missingVariants.length === 0) {
    return null;
  }

  const reason =
    coverage.missingVariants.length === 1
      ? `Experiment "${experiment.name}" needs one more result for ${coverage.missingVariants[0].variantLabel}.`
      : `Experiment "${experiment.name}" still needs results for ${coverage.missingVariants.length} variants.`;

  return normalizeTask({
    id: `follow-up:experiment:${experiment.experimentId}`,
    taskType: "complete_experiment_result",
    linkedEntityType: "experiment",
    linkedEntityId: experiment.experimentId,
    signalId: experiment.variants.flatMap((variant) => variant.linkedSignalIds)[0] ?? null,
    platform: null,
    title: `${experiment.name} still needs outcome coverage`,
    href: "/experiments",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt: coverage.latestPostedAt ? toIso(coverage.latestPostedAt + 24 * 60 * 60 * 1000) : experiment.updatedAt,
    reason,
    status: "open",
  });
}

function buildWeeklyPackTask(
  plan: WeeklyPlan,
  postingEntries: PostingLogEntry[],
  strategicOutcomes: StrategicOutcome[],
  now: Date,
): FollowUpTask | null {
  const weekStart = parseIso(`${plan.weekStartDate}T00:00:00.000Z`);
  if (weekStart === null) {
    return null;
  }

  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  if (now.getTime() < weekEnd) {
    return null;
  }

  const entriesInWeek = postingEntries.filter((entry) => {
    const postedAt = parseIso(entry.postedAt);
    return postedAt !== null && postedAt >= weekStart && postedAt < weekEnd;
  });
  if (entriesInWeek.length === 0) {
    return null;
  }

  const strategicIds = new Set(strategicOutcomes.map((outcome) => outcome.postingLogId));
  const coveredCount = entriesInWeek.filter((entry) => strategicIds.has(entry.id)).length;
  if (coveredCount >= entriesInWeek.length) {
    return null;
  }

  return normalizeTask({
    id: `follow-up:weekly-pack:${plan.weekStartDate}`,
    taskType: "review_weekly_pack_outcomes",
    linkedEntityType: "weekly_pack",
    linkedEntityId: plan.weekStartDate,
    signalId: null,
    platform: null,
    title: `Weekly pack ${formatWeekLabel(plan.weekStartDate)} needs outcome review`,
    href: "/plan",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueAt: toIso(weekEnd + 3 * 24 * 60 * 60 * 1000),
    reason:
      coveredCount === 0
        ? `Weekly pack for ${formatWeekLabel(plan.weekStartDate)} has no strategic outcome coverage yet.`
        : `Weekly pack for ${formatWeekLabel(plan.weekStartDate)} still needs strategic feedback on ${entriesInWeek.length - coveredCount} of ${entriesInWeek.length} posts.`,
    status: "open",
  });
}

function isTaskSatisfied(
  task: FollowUpTask,
  input: {
    postingOutcomes: PostingOutcome[];
    strategicOutcomes: StrategicOutcome[];
    experiments: ManualExperiment[];
    postingEntries: PostingLogEntry[];
    weeklyPlans: WeeklyPlan[];
  },
): boolean {
  if (task.taskType === "rate_post_outcome") {
    return input.postingOutcomes.some((outcome) => outcome.postingLogId === task.linkedEntityId);
  }

  if (task.taskType === "complete_strategic_outcome") {
    return input.strategicOutcomes.some((outcome) => outcome.postingLogId === task.linkedEntityId);
  }

  if (task.taskType === "complete_experiment_result") {
    const experiment = input.experiments.find((item) => item.experimentId === task.linkedEntityId);
    if (!experiment) {
      return true;
    }

    const coverage = buildExperimentCoverage(
      experiment,
      input.postingEntries,
      input.postingOutcomes,
      input.strategicOutcomes,
    );
    return experiment.status === "completed" || coverage.missingVariants.length === 0;
  }

  const plan = input.weeklyPlans.find((item) => item.weekStartDate === task.linkedEntityId);
  if (!plan) {
    return true;
  }

  return !buildWeeklyPackTask(plan, input.postingEntries, input.strategicOutcomes, new Date());
}

function buildGeneratedTasks(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  experiments: ManualExperiment[];
  weeklyPlans: WeeklyPlan[];
  now: Date;
}): FollowUpTask[] {
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const postingOutcomeIds = new Set(input.postingOutcomes.map((outcome) => outcome.postingLogId));
  const strategicOutcomeIds = new Set(input.strategicOutcomes.map((outcome) => outcome.postingLogId));
  const tasks: FollowUpTask[] = [];

  for (const entry of input.postingEntries) {
    const postedAt = parseIso(entry.postedAt);
    if (postedAt === null) {
      continue;
    }

    if (!postingOutcomeIds.has(entry.id) && input.now.getTime() >= postedAt + 24 * 60 * 60 * 1000) {
      tasks.push(buildPostingTask(entry, signalById.get(entry.signalId) ?? null, "outcome"));
    }

    if (!strategicOutcomeIds.has(entry.id) && input.now.getTime() >= postedAt + 3 * 24 * 60 * 60 * 1000) {
      tasks.push(buildPostingTask(entry, signalById.get(entry.signalId) ?? null, "strategic"));
    }
  }

  for (const experiment of input.experiments) {
    const task = buildExperimentTask(
      experiment,
      buildExperimentCoverage(
        experiment,
        input.postingEntries,
        input.postingOutcomes,
        input.strategicOutcomes,
      ),
    );
    if (task) {
      tasks.push(task);
    }
  }

  for (const plan of input.weeklyPlans) {
    const task = buildWeeklyPackTask(plan, input.postingEntries, input.strategicOutcomes, input.now);
    if (task) {
      tasks.push(task);
    }
  }

  return sortTasks(
    Array.from(new Map(tasks.map((task) => [task.id, task])).values()),
  );
}

export async function listFollowUpTasks(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  experiments?: ManualExperiment[];
  weeklyPlans?: WeeklyPlan[];
  now?: Date;
}): Promise<FollowUpTask[]> {
  const now = input.now ?? new Date();
  const experiments = input.experiments ?? [];
  const weeklyPlans = input.weeklyPlans ?? [];
  const persisted = await readPersistedStore();
  const generated = buildGeneratedTasks({
    signals: input.signals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    strategicOutcomes: input.strategicOutcomes,
    experiments,
    weeklyPlans,
    now,
  });
  const persistedById = new Map(persisted.tasks.map((task) => [task.id, task]));
  const generatedById = new Map(generated.map((task) => [task.id, task]));
  const nextTasks: FollowUpTask[] = [];
  const createdTasks: FollowUpTask[] = [];
  const completedTasks: FollowUpTask[] = [];

  for (const task of generated) {
    const persistedTask = persistedById.get(task.id);
    if (!persistedTask) {
      nextTasks.push(task);
      createdTasks.push(task);
      continue;
    }

    const satisfied = isTaskSatisfied(task, {
      postingEntries: input.postingEntries,
      postingOutcomes: input.postingOutcomes,
      strategicOutcomes: input.strategicOutcomes,
      experiments,
      weeklyPlans,
    });
    const status: FollowUpTaskStatus = satisfied
      ? "done"
      : persistedTask.status === "dismissed"
        ? "dismissed"
        : persistedTask.status === "done"
          ? "done"
          : "open";
    const merged = normalizeTask({
      ...task,
      createdAt: persistedTask.createdAt,
      updatedAt: status === persistedTask.status ? persistedTask.updatedAt : now.toISOString(),
      status,
    });

    if (persistedTask.status !== "done" && status === "done") {
      completedTasks.push(merged);
    }

    nextTasks.push(merged);
  }

  for (const task of persisted.tasks) {
    if (generatedById.has(task.id)) {
      continue;
    }

    const satisfied = isTaskSatisfied(task, {
      postingEntries: input.postingEntries,
      postingOutcomes: input.postingOutcomes,
      strategicOutcomes: input.strategicOutcomes,
      experiments,
      weeklyPlans,
    });
    if (satisfied) {
      const completed = normalizeTask({
        ...task,
        status: "done",
        updatedAt: task.status === "done" ? task.updatedAt : now.toISOString(),
      });
      if (task.status !== "done") {
        completedTasks.push(completed);
      }
      nextTasks.push(completed);
      continue;
    }

    if (task.status !== "open") {
      nextTasks.push(task);
    }
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
      eventType: "FOLLOW_UP_TASK_CREATED" as const,
      actor: "system" as const,
      summary: `Created follow-up task: ${task.title}.`,
      metadata: {
        taskId: task.id,
        taskType: task.taskType,
        linkedEntityType: task.linkedEntityType,
        linkedEntityId: task.linkedEntityId,
      },
    })),
    ...completedTasks.map((task) => ({
      signalId: task.signalId ?? `${task.linkedEntityType}:${task.linkedEntityId}`,
      eventType: "FOLLOW_UP_TASK_COMPLETED" as const,
      actor: "system" as const,
      summary: `Auto-completed follow-up task: ${task.title}.`,
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

export async function updateFollowUpTaskStatus(taskId: string, status: Extract<FollowUpTaskStatus, "done" | "dismissed">): Promise<FollowUpTask> {
  const persisted = await readPersistedStore();
  const task = persisted.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Follow-up task not found.");
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
      eventType: status === "done" ? "FOLLOW_UP_TASK_COMPLETED" : "FOLLOW_UP_TASK_DISMISSED",
      actor: "operator",
      summary: `${status === "done" ? "Completed" : "Dismissed"} follow-up task: ${nextTask.title}.`,
      metadata: {
        taskId: nextTask.id,
        taskType: nextTask.taskType,
        linkedEntityType: nextTask.linkedEntityType,
        linkedEntityId: nextTask.linkedEntityId,
      },
    },
  ]);

  return nextTask;
}

export function getFollowUpTaskTypeLabel(taskType: FollowUpTaskType): string {
  switch (taskType) {
    case "rate_post_outcome":
      return "Rate outcome";
    case "complete_strategic_outcome":
      return "Strategic outcome";
    case "complete_experiment_result":
      return "Experiment result";
    case "review_weekly_pack_outcomes":
    default:
      return "Weekly pack review";
  }
}

export function getFollowUpTaskDueLabel(task: FollowUpTask, now = new Date()): string {
  const overdueDays = daysOverdue(task, now);
  if (overdueDays > 0) {
    return overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`;
  }

  return `Due ${task.dueAt.slice(0, 10)}`;
}
