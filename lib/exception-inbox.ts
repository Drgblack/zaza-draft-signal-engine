import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { OperatorTask, OperatorTaskQuickAction } from "@/lib/operator-tasks";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";
import type { WeeklyExecutionFlow } from "@/lib/weekly-execution";

const EXCEPTION_INBOX_STORE_PATH = path.join(process.cwd(), "data", "exception-inbox.json");

export const EXCEPTION_ISSUE_TYPES = [
  "needs_judgement",
  "blocked_by_policy",
  "conflict_detected",
  "missing_outcome",
  "incomplete_package",
  "experiment_unresolved",
  "duplicate_unresolved",
] as const;

export const EXCEPTION_PRIORITIES = ["high", "medium", "low"] as const;

export type ExceptionIssueType = (typeof EXCEPTION_ISSUE_TYPES)[number];
export type ExceptionPriority = (typeof EXCEPTION_PRIORITIES)[number];

export interface ExceptionInboxItem {
  id: string;
  issueType: ExceptionIssueType;
  priority: ExceptionPriority;
  signalId: string | null;
  title: string;
  sourceTitle: string | null;
  href: string;
  whyItMatters: string;
  recommendedAction: string;
  actionLabel: string;
  taskId: string | null;
  quickAction: OperatorTaskQuickAction | null;
  supportingSignals: string[];
}

export interface ExceptionInboxGroup {
  issueType: ExceptionIssueType;
  label: string;
  count: number;
  items: ExceptionInboxItem[];
}

export interface ExceptionInboxState {
  generatedAt: string;
  openCount: number;
  topItems: ExceptionInboxItem[];
  groups: ExceptionInboxGroup[];
  topSummary: string[];
}

const exceptionInboxItemSchema = z.object({
  id: z.string().trim().min(1),
  issueType: z.enum(EXCEPTION_ISSUE_TYPES),
  priority: z.enum(EXCEPTION_PRIORITIES),
  signalId: z.string().trim().min(1).nullable().default(null),
  title: z.string().trim().min(1),
  sourceTitle: z.string().trim().nullable().default(null),
  href: z.string().trim().min(1),
  whyItMatters: z.string().trim().min(1),
  recommendedAction: z.string().trim().min(1),
  actionLabel: z.string().trim().min(1),
  taskId: z.string().trim().min(1).nullable().default(null),
  quickAction: z.any().nullable().default(null),
  supportingSignals: z.array(z.string().trim().min(1)).max(6).default([]),
});

const exceptionInboxStateSchema = z.object({
  generatedAt: z.string().trim().min(1),
  openCount: z.number().int().min(0),
  topItems: z.array(exceptionInboxItemSchema).max(6),
  groups: z.array(
    z.object({
      issueType: z.enum(EXCEPTION_ISSUE_TYPES),
      label: z.string().trim().min(1),
      count: z.number().int().min(0),
      items: z.array(exceptionInboxItemSchema).max(100),
    }),
  ),
  topSummary: z.array(z.string().trim().min(1)).max(6).default([]),
});

const exceptionSnapshotSchema = z.object({
  id: z.string().trim().min(1),
  signalId: z.string().trim().min(1).nullable().default(null),
  title: z.string().trim().min(1),
  issueType: z.enum(EXCEPTION_ISSUE_TYPES),
});

const exceptionInboxStoreSchema = z.object({
  dismissedIds: z.array(z.string().trim().min(1)).default([]),
  lastOpenItems: z.array(exceptionSnapshotSchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export const exceptionInboxActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("dismiss"),
    exceptionId: z.string().trim().min(1),
    taskId: z.string().trim().min(1).nullable().optional(),
  }),
  z.object({
    action: z.literal("resolve"),
    exceptionId: z.string().trim().min(1),
    taskId: z.string().trim().min(1).nullable().optional(),
  }),
  z.object({
    action: z.literal("resolve_duplicate"),
    exceptionId: z.string().trim().min(1),
    taskId: z.string().trim().min(1).nullable().optional(),
    quickAction: z.object({
      type: z.literal("confirm_duplicate_cluster"),
      label: z.string().trim().min(1),
      cluster: z.object({
        clusterId: z.string().trim().min(1),
        signalIds: z.array(z.string().trim().min(1)).min(2),
        canonicalSignalId: z.string().trim().min(1),
        similarityType: z.string().trim().min(1),
        clusterConfidence: z.string().trim().min(1),
        clusterReason: z.string().trim().min(1),
      }),
    }),
  }),
]);

export type ExceptionInboxActionRequest = z.infer<typeof exceptionInboxActionRequestSchema>;

let inMemoryExceptionInboxStore: z.infer<typeof exceptionInboxStoreSchema> =
  exceptionInboxStoreSchema.parse({
    dismissedIds: [],
    lastOpenItems: [],
    updatedAt: null,
  });

function normalize(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalize(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function issueTypeLabel(issueType: ExceptionIssueType) {
  switch (issueType) {
    case "needs_judgement":
      return "Needs judgement";
    case "blocked_by_policy":
      return "Blocked by policy";
    case "conflict_detected":
      return "Conflict detected";
    case "missing_outcome":
      return "Missing outcome";
    case "incomplete_package":
      return "Incomplete package";
    case "experiment_unresolved":
      return "Experiment unresolved";
    case "duplicate_unresolved":
    default:
      return "Duplicate unresolved";
  }
}

function priorityWeight(priority: ExceptionPriority) {
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

function sortItems(items: ExceptionInboxItem[]) {
  return [...items].sort(
    (left, right) =>
      priorityWeight(left.priority) - priorityWeight(right.priority) ||
      left.title.localeCompare(right.title),
  );
}

function actionLabelForTask(task: OperatorTask, candidate: ApprovalQueueCandidate | null) {
  switch (task.taskType) {
    case "resolve_conflict":
      return candidate?.conflicts.topConflicts[0]?.conflictType === "cta_destination_mismatch"
        ? "Fix CTA"
        : "Resolve conflict";
    case "finish_incomplete_package":
      return candidate?.triage.triageState === "repairable" ? "Approve repair" : "Fix package";
    case "fill_missing_strategic_outcome":
      return "Mark outcome";
    case "confirm_duplicate_cluster":
      return "Resolve duplicate";
    case "resolve_borderline_case":
      return "Convert to experiment";
    case "complete_experiment_result":
      return "Review experiment";
    case "refresh_stale_candidate":
      return "Review reuse";
    case "approve_source_recommendation":
    default:
      return task.quickAction?.label ?? "Open item";
  }
}

function mapTaskIssueType(task: OperatorTask, candidate: ApprovalQueueCandidate | null): ExceptionIssueType {
  switch (task.taskType) {
    case "resolve_conflict":
      return "conflict_detected";
    case "fill_missing_strategic_outcome":
      return "missing_outcome";
    case "complete_experiment_result":
      return "experiment_unresolved";
    case "confirm_duplicate_cluster":
      return "duplicate_unresolved";
    case "finish_incomplete_package":
      if (
        candidate &&
        (candidate.packageAutofill.policy.decision === "block" ||
          candidate.preReviewRepair.policy.decision === "block")
      ) {
        return "blocked_by_policy";
      }
      return "incomplete_package";
    case "resolve_borderline_case":
    case "refresh_stale_candidate":
    case "approve_source_recommendation":
    default:
      return "needs_judgement";
  }
}

function buildTaskExceptionItem(
  task: OperatorTask,
  candidate: ApprovalQueueCandidate | null,
): ExceptionInboxItem {
  const issueType = mapTaskIssueType(task, candidate);
  const supportingSignals: string[] = [];

  if (candidate?.rankReasons[0]) {
    uniquePush(supportingSignals, candidate.rankReasons[0]);
  }
  if (candidate?.triage.supportingSignals[0]) {
    uniquePush(supportingSignals, candidate.triage.supportingSignals[0]);
  }
  if (task.reason) {
    uniquePush(supportingSignals, task.reason);
  }

  return exceptionInboxItemSchema.parse({
    id: `task:${task.id}`,
    issueType,
    priority: task.priority,
    signalId: task.signalId,
    title: task.title,
    sourceTitle: candidate?.signal.sourceTitle ?? null,
    href: task.href,
    whyItMatters: task.reason,
    recommendedAction:
      candidate?.triage.suggestedNextAction ??
      (issueType === "missing_outcome"
        ? "Record the missing outcome so ranking and recap stay commercially useful."
        : issueType === "duplicate_unresolved"
          ? "Confirm the duplicate cluster so the queue stops splitting attention."
          : issueType === "experiment_unresolved"
            ? "Resolve the experiment result so the learning loop can close."
            : "Open the item and apply the bounded next fix."),
    actionLabel: actionLabelForTask(task, candidate),
    taskId: task.id,
    quickAction: task.quickAction ?? null,
    supportingSignals: supportingSignals.slice(0, 4),
  });
}

function buildPolicyExceptionItems(
  candidates: ApprovalQueueCandidate[],
  executionFlow: WeeklyExecutionFlow | null | undefined,
  existingIds: Set<string>,
): ExceptionInboxItem[] {
  const items: ExceptionInboxItem[] = [];

  for (const candidate of candidates) {
    if (
      candidate.packageAutofill.policy.decision !== "block" &&
      candidate.preReviewRepair.policy.decision !== "block" &&
      !executionFlow?.executionItems.some(
        (item) => item.signalId === candidate.signal.recordId && item.status === "blocked",
      )
    ) {
      continue;
    }

    const id = `policy:${candidate.signal.recordId}`;
    if (existingIds.has(id) || existingIds.has(`task:operator:finish_incomplete_package:${candidate.signal.recordId}`)) {
      continue;
    }

    const reasons = [
      candidate.preReviewRepair.policy.reasons[0],
      candidate.packageAutofill.policy.reasons[0],
      executionFlow?.executionItems.find(
        (item) => item.signalId === candidate.signal.recordId && item.status === "blocked",
      )?.blockReasons[0],
    ].filter(Boolean) as string[];

    items.push(
      exceptionInboxItemSchema.parse({
        id,
        issueType: "blocked_by_policy",
        priority:
          candidate.signal.reviewPriority === "Urgent" || candidate.signal.reviewPriority === "High"
            ? "high"
            : candidate.rankScore >= 7
              ? "high"
              : candidate.rankScore >= 4
                ? "medium"
                : "low",
        signalId: candidate.signal.recordId,
        title: `Policy block: ${candidate.signal.sourceTitle}`,
        sourceTitle: candidate.signal.sourceTitle,
        href: `/signals/${candidate.signal.recordId}/review`,
        whyItMatters:
          reasons[0] ??
          "A bounded automation step was blocked, so this candidate still needs operator intervention.",
        recommendedAction:
          candidate.preReviewRepair.decision === "blocked"
            ? "Open review and approve the bounded repair manually if it still looks safe."
            : "Open review and unblock the package fields the policy could not safely advance.",
        actionLabel: candidate.preReviewRepair.decision === "blocked" ? "Approve repair" : "Open unblock",
        taskId: null,
        quickAction: null,
        supportingSignals: [candidate.rankReasons[0], candidate.triage.summary].filter(Boolean),
      }),
    );
  }

  return items;
}

function buildSummary(items: ExceptionInboxItem[]) {
  const summary: string[] = [];
  const byIssue = new Map<ExceptionIssueType, number>();

  for (const item of items) {
    byIssue.set(item.issueType, (byIssue.get(item.issueType) ?? 0) + 1);
  }

  const topIssue = [...byIssue.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topIssue) {
    uniquePush(
      summary,
      `${topIssue[1]} item${topIssue[1] === 1 ? "" : "s"} are currently concentrated in ${issueTypeLabel(topIssue[0]).toLowerCase()}.`,
    );
  }
  const policyCount = byIssue.get("blocked_by_policy") ?? 0;
  if (policyCount > 0) {
    uniquePush(summary, `Policy is blocking ${policyCount} item${policyCount === 1 ? "" : "s"} that still need manual attention.`);
  }
  const missingOutcomeCount = byIssue.get("missing_outcome") ?? 0;
  if (missingOutcomeCount > 0) {
    uniquePush(summary, `${missingOutcomeCount} posted item${missingOutcomeCount === 1 ? "" : "s"} still need outcome memory recorded.`);
  }

  return summary.slice(0, 4);
}

function groupItems(items: ExceptionInboxItem[]): ExceptionInboxGroup[] {
  return EXCEPTION_ISSUE_TYPES.map((issueType) => {
    const filtered = sortItems(items.filter((item) => item.issueType === issueType));
    return {
      issueType,
      label: issueTypeLabel(issueType),
      count: filtered.length,
      items: filtered,
    };
  }).filter((group) => group.count > 0);
}

async function readPersistedStore() {
  try {
    const raw = await readFile(EXCEPTION_INBOX_STORE_PATH, "utf8");
    const store = exceptionInboxStoreSchema.parse(JSON.parse(raw));
    inMemoryExceptionInboxStore = store;
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryExceptionInboxStore;
    }

    throw error;
  }
}

async function writePersistedStore(store: z.infer<typeof exceptionInboxStoreSchema>) {
  const parsed = exceptionInboxStoreSchema.parse(store);
  inMemoryExceptionInboxStore = parsed;

  try {
    await mkdir(path.dirname(EXCEPTION_INBOX_STORE_PATH), { recursive: true });
    await writeFile(EXCEPTION_INBOX_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("exception-inbox", error);
      return;
    }

    throw error;
  }
}

export async function syncExceptionInbox(input: {
  approvalCandidates: ApprovalQueueCandidate[];
  operatorTasks: OperatorTask[];
  executionFlow?: WeeklyExecutionFlow | null;
  now?: Date;
}): Promise<ExceptionInboxState> {
  const now = input.now ?? new Date();
  const candidateBySignalId = new Map(
    input.approvalCandidates.map((candidate) => [candidate.signal.recordId, candidate]),
  );
  const taskItems = input.operatorTasks
    .filter((task) => task.status === "open")
    .map((task) => buildTaskExceptionItem(task, task.signalId ? candidateBySignalId.get(task.signalId) ?? null : null));
  const existingIds = new Set(taskItems.map((item) => item.id));
  const rawItems = sortItems([
    ...taskItems,
    ...buildPolicyExceptionItems(input.approvalCandidates, input.executionFlow, existingIds),
  ]);
  const store = await readPersistedStore();
  const rawIds = new Set(rawItems.map((item) => item.id));
  const dismissedIds = store.dismissedIds.filter((id) => rawIds.has(id));
  const visibleItems = rawItems.filter((item) => !dismissedIds.includes(item.id));
  const previousIds = new Set(store.lastOpenItems.map((item) => item.id));
  const nextIds = new Set(visibleItems.map((item) => item.id));

  const auditEvents: AuditEventInput[] = [];

  for (const item of visibleItems) {
    if (previousIds.has(item.id)) {
      continue;
    }

    auditEvents.push({
      signalId: item.signalId ?? `exception:${item.id}`,
      eventType: "EXCEPTION_ITEM_CREATED",
      actor: "system",
      summary: `Created exception item: ${item.title}.`,
      metadata: {
        exceptionId: item.id,
        issueType: item.issueType,
        priority: item.priority,
      },
    });
  }

  for (const previousItem of store.lastOpenItems) {
    if (nextIds.has(previousItem.id)) {
      continue;
    }

    auditEvents.push({
      signalId: previousItem.signalId ?? `exception:${previousItem.id}`,
      eventType: "EXCEPTION_ITEM_RESOLVED",
      actor: "system",
      summary: `Resolved exception item: ${previousItem.title}.`,
      metadata: {
        exceptionId: previousItem.id,
        issueType: previousItem.issueType,
      },
    });
  }

  const nextState = exceptionInboxStateSchema.parse({
    generatedAt: now.toISOString(),
    openCount: visibleItems.length,
    topItems: visibleItems.slice(0, 6),
    groups: groupItems(visibleItems),
    topSummary: buildSummary(visibleItems),
  });

  await writePersistedStore({
    dismissedIds,
    lastOpenItems: visibleItems.map((item) => ({
      id: item.id,
      signalId: item.signalId,
      title: item.title,
      issueType: item.issueType,
    })),
    updatedAt: nextState.generatedAt,
  });

  if (auditEvents.length > 0) {
    await appendAuditEventsSafe(auditEvents);
  }

  return nextState;
}

export async function resolveExceptionInboxItem(input: {
  exceptionId: string;
  resolution: "dismissed" | "resolved";
  signalId?: string | null;
}) {
  const store = await readPersistedStore();
  const snapshot = store.lastOpenItems.find((item) => item.id === input.exceptionId) ?? null;
  const dismissedIds =
    input.resolution === "dismissed"
      ? Array.from(new Set([...store.dismissedIds, input.exceptionId]))
      : store.dismissedIds.filter((id) => id !== input.exceptionId);
  const nextStore = exceptionInboxStoreSchema.parse({
    ...store,
    dismissedIds,
    lastOpenItems: store.lastOpenItems.filter((item) => item.id !== input.exceptionId),
    updatedAt: new Date().toISOString(),
  });
  await writePersistedStore(nextStore);

  await appendAuditEventsSafe([
    {
      signalId: input.signalId ?? snapshot?.signalId ?? `exception:${input.exceptionId}`,
      eventType: "EXCEPTION_ITEM_RESOLVED",
      actor: "operator",
      summary: `${input.resolution === "dismissed" ? "Dismissed" : "Resolved"} exception item${snapshot ? `: ${snapshot.title}` : "."}`,
      metadata: {
        exceptionId: input.exceptionId,
        issueType: snapshot?.issueType ?? null,
        resolution: input.resolution,
      },
    },
  ]);

  return snapshot;
}
