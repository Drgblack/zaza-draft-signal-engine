import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { listSignalsWithFallback } from "@/lib/airtable";
import { appendAuditEventsSafe } from "@/lib/audit";
import { buildManagedIngestionSources } from "@/lib/ingestion/source-performance";
import { listIngestionSources, updateIngestionSource } from "@/lib/ingestion/sources";
import type { IngestionSourceDefinition, IngestionSourceKind, ManagedIngestionSource } from "@/lib/ingestion/types";
import { listPostingLogEntries, type PostingLogEntry } from "@/lib/posting-log";
import { listPostingOutcomes, type PostingOutcome } from "@/lib/outcomes";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { SignalDataSource, SignalRecord } from "@/types/signal";

const SOURCE_PROPOSAL_STORE_PATH = path.join(process.cwd(), "data", "source-change-proposals.json");
const sourceChangeValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const SOURCE_CHANGE_PROPOSAL_TYPES = [
  "pause_source",
  "resume_source",
  "reduce_max_items",
  "increase_max_items",
  "rewrite_query",
  "reduce_source_family_cap",
  "increase_source_family_cap",
] as const;

export const SOURCE_CHANGE_PROPOSAL_STATUSES = ["open", "approved", "dismissed"] as const;
export const SOURCE_CHANGE_PROPOSAL_CONFIDENCE = ["high", "moderate", "low"] as const;
export const SOURCE_FAMILY_KEYS = ["feed", "reddit", "query"] as const;

export type SourceChangeProposalType = (typeof SOURCE_CHANGE_PROPOSAL_TYPES)[number];
export type SourceChangeProposalStatus = (typeof SOURCE_CHANGE_PROPOSAL_STATUSES)[number];
export type SourceChangeProposalConfidence = (typeof SOURCE_CHANGE_PROPOSAL_CONFIDENCE)[number];
export type SourceFamilyKey = (typeof SOURCE_FAMILY_KEYS)[number];

export const sourceChangeProposalSchema = z.object({
  proposalId: z.string().trim().min(1),
  proposalType: z.enum(SOURCE_CHANGE_PROPOSAL_TYPES),
  status: z.enum(SOURCE_CHANGE_PROPOSAL_STATUSES),
  scopeLabel: z.string().trim().min(1),
  sourceId: z.string().trim().min(1).nullable(),
  sourceName: z.string().trim().min(1).nullable(),
  sourceKind: z.enum(["rss", "atom", "json", "reddit", "query"]).nullable(),
  sourceFamily: z.enum(SOURCE_FAMILY_KEYS).nullable(),
  title: z.string().trim().min(1),
  changeSummary: z.string().trim().min(1),
  currentValue: sourceChangeValueSchema,
  proposedValue: sourceChangeValueSchema,
  reason: z.string().trim().min(1),
  supportingSignals: z.array(z.string().trim().min(1)).max(6),
  confidenceLevel: z.enum(SOURCE_CHANGE_PROPOSAL_CONFIDENCE),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

export const sourceChangeProposalActionSchema = z.object({
  proposalId: z.string().trim().min(1),
  action: z.enum(["approve", "dismiss"]),
});

export const sourceChangeProposalSummarySchema = z.object({
  openCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  dismissedCount: z.number().int().nonnegative(),
  openPauseCount: z.number().int().nonnegative(),
  openQueryRewriteCount: z.number().int().nonnegative(),
  approvedPauseCount: z.number().int().nonnegative(),
  approvedResumeCount: z.number().int().nonnegative(),
  approvedQueryRewriteCount: z.number().int().nonnegative(),
  disabledSourceCount: z.number().int().nonnegative(),
});

const sourceChangeProposalStoreSchema = z.array(sourceChangeProposalSchema);

export type SourceChangeProposal = z.infer<typeof sourceChangeProposalSchema>;
export type SourceChangeProposalAction = z.infer<typeof sourceChangeProposalActionSchema>;
export type SourceChangeProposalSummary = z.infer<typeof sourceChangeProposalSummarySchema>;

let inMemorySourceProposalStore: SourceChangeProposal[] = [];

export interface SourceAutopilotV2State {
  source: SignalDataSource;
  sources: ManagedIngestionSource[];
  proposals: SourceChangeProposal[];
  recentChanges: SourceChangeProposal[];
  proposalSummary: SourceChangeProposalSummary;
  message?: string;
  error?: string;
}

interface SourceDraftMetrics {
  source: ManagedIngestionSource;
  sourceFamily: SourceFamilyKey;
  duplicateRate: number;
  reviewLoadRate: number;
  highStrategicCount: number;
  lowStrategicCount: number;
  leadsTotal: number;
  clicksTotal: number;
  reusePositiveCount: number;
  doNotRepeatCount: number;
}

function toSourceFamily(kind: IngestionSourceKind): SourceFamilyKey {
  if (kind === "reddit") {
    return "reddit";
  }

  if (kind === "query") {
    return "query";
  }

  return "feed";
}

function safeRate(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function proposalTypeLabel(type: SourceChangeProposalType): string {
  switch (type) {
    case "pause_source":
      return "Pause source";
    case "resume_source":
      return "Resume source";
    case "reduce_max_items":
      return "Reduce max items";
    case "increase_max_items":
      return "Increase max items";
    case "rewrite_query":
      return "Rewrite query";
    case "reduce_source_family_cap":
      return "Reduce family cap";
    case "increase_source_family_cap":
      return "Increase family cap";
    default:
      return "Source change";
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function buildProposalId(parts: Array<string | number | boolean | null>): string {
  const hash = createHash("sha1")
    .update(parts.map((part) => String(part ?? "null")).join("|"))
    .digest("hex")
    .slice(0, 12);
  return `source-proposal-${hash}`;
}

function buildProposalSignalId(proposal: Pick<SourceChangeProposal, "sourceId" | "sourceFamily" | "proposalType">): string {
  if (proposal.sourceId) {
    return `source-config:${proposal.sourceId}`;
  }

  return `source-family:${proposal.sourceFamily ?? "unknown"}:${proposal.proposalType}`;
}

function buildSupportingSignals(metrics: SourceDraftMetrics): string[] {
  const rows = [
    `${metrics.source.performance.totalSignals} signals in view`,
    `${formatPercent(metrics.source.performance.approvalRate)} approval-ready`,
    `${formatPercent(metrics.source.performance.rejectionRate)} rejected`,
    `${formatPercent(metrics.source.performance.usefulnessRate)} useful`,
  ];

  if (metrics.duplicateRate > 0) {
    rows.push(`${formatPercent(metrics.duplicateRate)} duplicate-linked`);
  }

  if (metrics.source.performance.averageOutcomeScore !== null) {
    rows.push(`average outcome ${metrics.source.performance.averageOutcomeScore.toFixed(1)}`);
  }

  if (metrics.highStrategicCount > 0 || metrics.lowStrategicCount > 0) {
    rows.push(`${metrics.highStrategicCount} high-value / ${metrics.lowStrategicCount} low-value strategic outcomes`);
  }

  if (metrics.reusePositiveCount > 0 || metrics.doNotRepeatCount > 0) {
    rows.push(`${metrics.reusePositiveCount} reuse / ${metrics.doNotRepeatCount} do-not-repeat judgements`);
  }

  return rows.slice(0, 6);
}

function estimateConfidence(metrics: SourceDraftMetrics): SourceChangeProposalConfidence {
  const evidencePoints =
    (metrics.source.performance.totalSignals >= 8 ? 1 : 0) +
    (metrics.highStrategicCount + metrics.lowStrategicCount >= 3 ? 1 : 0) +
    (metrics.source.performance.strongOutcomeSignals + metrics.source.performance.weakOutcomeSignals >= 3 ? 1 : 0);

  if (evidencePoints >= 3) {
    return "high";
  }

  if (evidencePoints >= 2) {
    return "moderate";
  }

  return "low";
}

function extractSignalWords(source: IngestionSourceDefinition): string[] {
  const raw = [source.topic, source.name, source.query ?? ""]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);

  return Array.from(new Set(raw));
}

function buildQueryRewriteDraft(source: ManagedIngestionSource, metrics: SourceDraftMetrics): string | null {
  const current = source.query?.trim();
  if (!current) {
    return null;
  }

  const words = extractSignalWords(source);
  const currentLower = current.toLowerCase();
  const additions: string[] = [];
  const has = (value: string) => currentLower.includes(value.toLowerCase());

  if ((words.some((word) => ["complaint", "communication", "incident", "investigation", "behaviour", "behavior", "email"].includes(word))) &&
    !has("teacher communication")) {
    additions.push("\"teacher communication\"");
  }

  if ((words.some((word) => ["documentation", "report", "evidence", "behaviour", "behavior"].includes(word))) &&
    !has("documentation")) {
    additions.push("documentation");
  }

  if ((words.some((word) => ["stress", "burnout", "workload", "regret"].includes(word))) &&
    !has("teacher workload")) {
    additions.push("\"teacher workload\"");
  }

  if (!has("parent") && words.some((word) => ["complaint", "communication", "incident", "email", "report", "behaviour", "behavior"].includes(word))) {
    additions.push("\"parent email\"");
  }

  if (!has("school")) {
    additions.push("school");
  }

  if (metrics.duplicateRate >= 0.25 && !has("teacher")) {
    additions.push("teacher");
  }

  const deduped = additions.filter((value, index) => additions.indexOf(value) === index);
  if (deduped.length === 0) {
    return null;
  }

  return `${current} ${deduped.slice(0, 3).join(" ")}`.trim();
}

function buildDraftMetrics(
  managedSources: ManagedIngestionSource[],
  signals: SignalRecord[],
  postingEntries: PostingLogEntry[],
  postingOutcomes: PostingOutcome[],
  strategicOutcomes: StrategicOutcome[],
): SourceDraftMetrics[] {
  const postingEntriesBySignalId = postingEntries.reduce<Record<string, PostingLogEntry[]>>((index, entry) => {
    index[entry.signalId] = [...(index[entry.signalId] ?? []), entry];
    return index;
  }, {});
  const postingOutcomesByPostingId = new Map(postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicOutcomesByPostingId = new Map(strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));

  return managedSources.map((source) => {
    const matchingSignals = signals.filter(
      (signal) => normalizeText(signal.ingestionSource ?? "") === normalizeText(source.ingestionLabel),
    );
    let highStrategicCount = 0;
    let lowStrategicCount = 0;
    let leadsTotal = 0;
    let clicksTotal = 0;
    let reusePositiveCount = 0;
    let doNotRepeatCount = 0;

    for (const signal of matchingSignals) {
      for (const entry of postingEntriesBySignalId[signal.recordId] ?? []) {
        const outcome = postingOutcomesByPostingId.get(entry.id);
        const strategic = strategicOutcomesByPostingId.get(entry.id);

        if (outcome?.reuseRecommendation === "reuse_this_approach") {
          reusePositiveCount += 1;
        }

        if (outcome?.reuseRecommendation === "do_not_repeat") {
          doNotRepeatCount += 1;
        }

        if (strategic?.strategicValue === "high") {
          highStrategicCount += 1;
        } else if (strategic?.strategicValue === "low") {
          lowStrategicCount += 1;
        }

        leadsTotal += strategic?.leadsOrSignups ?? 0;
        clicksTotal += strategic?.clicks ?? 0;
      }
    }

    return {
      source,
      sourceFamily: toSourceFamily(source.kind),
      duplicateRate: safeRate(
        matchingSignals.filter((signal) => Boolean(signal.duplicateClusterId)).length,
        matchingSignals.length,
      ),
      reviewLoadRate: safeRate(source.performance.reviewSignals, source.performance.totalSignals),
      highStrategicCount,
      lowStrategicCount,
      leadsTotal,
      clicksTotal,
      reusePositiveCount,
      doNotRepeatCount,
    };
  });
}

function buildChangeSummary(
  type: SourceChangeProposalType,
  currentValue: string | number | boolean | null,
  proposedValue: string | number | boolean | null,
): string {
  switch (type) {
    case "pause_source":
      return "Enabled -> Paused";
    case "resume_source":
      return "Paused -> Enabled";
    case "reduce_max_items":
    case "increase_max_items":
      return `${currentValue} items/run -> ${proposedValue} items/run`;
    case "rewrite_query":
      return `Rewrite query: ${String(currentValue)} -> ${String(proposedValue)}`;
    case "reduce_source_family_cap":
    case "increase_source_family_cap":
      return `${currentValue} family cap -> ${proposedValue} family cap`;
    default:
      return `${String(currentValue)} -> ${String(proposedValue)}`;
  }
}

function createDraftProposal(input: {
  metrics: SourceDraftMetrics;
  proposalType: SourceChangeProposalType;
  currentValue: string | number | boolean | null;
  proposedValue: string | number | boolean | null;
  reason: string;
}): SourceChangeProposal {
  const now = new Date().toISOString();
  const { metrics, proposalType, currentValue, proposedValue, reason } = input;
  const proposalId = buildProposalId([
    metrics.source.id,
    proposalType,
    currentValue,
    proposedValue,
  ]);

  return sourceChangeProposalSchema.parse({
    proposalId,
    proposalType,
    status: "open",
    scopeLabel: metrics.source.name,
    sourceId: metrics.source.id,
    sourceName: metrics.source.name,
    sourceKind: metrics.source.kind,
    sourceFamily: metrics.sourceFamily,
    title: proposalTypeLabel(proposalType),
    changeSummary: buildChangeSummary(proposalType, currentValue, proposedValue),
    currentValue,
    proposedValue,
    reason,
    supportingSignals: buildSupportingSignals(metrics),
    confidenceLevel: estimateConfidence(metrics),
    createdAt: now,
    updatedAt: now,
  });
}

function draftSourceChangeProposals(metricsRows: SourceDraftMetrics[]): SourceChangeProposal[] {
  const proposals: SourceChangeProposal[] = [];

  for (const metrics of metricsRows) {
    const source = metrics.source;
    const performance = source.performance;
    const severeWeakness =
      source.enabled &&
      performance.totalSignals >= 6 &&
      performance.rejectionRate >= 0.55 &&
      performance.usefulnessRate <= 0.38 &&
      (performance.averageOutcomeScore === null || performance.averageOutcomeScore <= 0.2) &&
      (metrics.lowStrategicCount >= 1 || metrics.doNotRepeatCount >= 1 || metrics.duplicateRate >= 0.25);

    const needsVolumeReduction =
      source.enabled &&
      !severeWeakness &&
      performance.totalSignals >= 5 &&
      source.maxItemsPerRun > 2 &&
      (
        performance.rejectionRate >= 0.42 ||
        performance.usefulnessRate <= 0.45 ||
        (performance.averageOutcomeScore !== null && performance.averageOutcomeScore <= 0.4) ||
        metrics.duplicateRate >= 0.2 ||
        metrics.doNotRepeatCount >= 2
      );

    const canScaleUp =
      source.enabled &&
      performance.totalSignals >= 3 &&
      source.maxItemsPerRun < 14 &&
      performance.approvalRate >= 0.34 &&
      performance.usefulnessRate >= 0.68 &&
      (
        (performance.averageOutcomeScore !== null && performance.averageOutcomeScore >= 1.4) ||
        metrics.highStrategicCount >= 2 ||
        metrics.reusePositiveCount >= 2
      );

    const queryRewriteDraft =
      source.kind === "query" &&
      source.enabled &&
      performance.totalSignals >= 4 &&
      (
        performance.approvalRate < 0.25 ||
        performance.rejectionRate >= 0.4 ||
        metrics.duplicateRate >= 0.2 ||
        metrics.doNotRepeatCount > metrics.reusePositiveCount ||
        metrics.reviewLoadRate >= 0.45
      )
        ? buildQueryRewriteDraft(source, metrics)
        : null;

    const canResume =
      !source.enabled &&
      performance.totalSignals >= 3 &&
      performance.approvalRate >= 0.34 &&
      (
        (performance.averageOutcomeScore !== null && performance.averageOutcomeScore >= 1.2) ||
        metrics.highStrategicCount >= 2 ||
        metrics.reusePositiveCount >= 2
      );

    if (severeWeakness) {
      proposals.push(
        createDraftProposal({
          metrics,
          proposalType: "pause_source",
          currentValue: source.enabled,
          proposedValue: false,
          reason:
            `${source.name} is creating repeated queue noise with weak downstream evidence. The safer move is to pause it until quality recovers.`,
        }),
      );
    } else if (needsVolumeReduction) {
      proposals.push(
        createDraftProposal({
          metrics,
          proposalType: "reduce_max_items",
          currentValue: source.maxItemsPerRun,
          proposedValue: Math.max(2, Math.min(source.maxItemsPerRun - 1, Math.ceil(source.maxItemsPerRun * 0.5))),
          reason:
            `${source.name} is still worth monitoring, but current volume is too high relative to approvals and useful outcomes. Lowering the cap should cut review friction without removing the source entirely.`,
        }),
      );
    } else if (canScaleUp) {
      proposals.push(
        createDraftProposal({
          metrics,
          proposalType: "increase_max_items",
          currentValue: source.maxItemsPerRun,
          proposedValue: Math.min(14, source.maxItemsPerRun + (source.maxItemsPerRun >= 10 ? 2 : 3)),
          reason:
            `${source.name} is producing a high share of useful, reusable, or strategically valuable records. Increasing the cap should give the queue a bit more of the same quality.`,
        }),
      );
    }

    if (queryRewriteDraft && queryRewriteDraft !== source.query) {
      proposals.push(
        createDraftProposal({
          metrics,
          proposalType: "rewrite_query",
          currentValue: source.query ?? null,
          proposedValue: queryRewriteDraft,
          reason:
            `${source.name} looks too broad for current queue quality. A tighter query should bias toward teacher communication, evidence, or workload terms instead of broad-volume matches.`,
        }),
      );
    }

    if (canResume) {
      proposals.push(
        createDraftProposal({
          metrics,
          proposalType: "resume_source",
          currentValue: source.enabled,
          proposedValue: true,
          reason:
            `${source.name} still has credible positive history in stored outcomes. It looks strong enough to re-enable for a bounded test run.`,
        }),
      );
    }
  }

  const deduped = new Map<string, SourceChangeProposal>();
  for (const proposal of proposals) {
    deduped.set(proposal.proposalId, proposal);
  }

  return [...deduped.values()].sort((left, right) => {
    const statusWeight = left.proposalType === "pause_source" ? 0 : left.proposalType === "rewrite_query" ? 1 : 2;
    const nextWeight = right.proposalType === "pause_source" ? 0 : right.proposalType === "rewrite_query" ? 1 : 2;
    return statusWeight - nextWeight || left.scopeLabel.localeCompare(right.scopeLabel);
  });
}

async function readProposalStore(): Promise<SourceChangeProposal[]> {
  try {
    const raw = await readFile(SOURCE_PROPOSAL_STORE_PATH, "utf8");
    const store = sourceChangeProposalStoreSchema.parse(JSON.parse(raw));
    inMemorySourceProposalStore = store;
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemorySourceProposalStore;
    }

    throw error;
  }
}

async function writeProposalStore(proposals: SourceChangeProposal[]): Promise<void> {
  const parsed = sourceChangeProposalStoreSchema.parse(proposals);
  inMemorySourceProposalStore = parsed;

  try {
    await mkdir(path.dirname(SOURCE_PROPOSAL_STORE_PATH), { recursive: true });
    await writeFile(SOURCE_PROPOSAL_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("source-autopilot-v2", error);
      return;
    }

    throw error;
  }
}

function countByStatus(
  proposals: SourceChangeProposal[],
  status: SourceChangeProposalStatus,
  type?: SourceChangeProposalType,
): number {
  return proposals.filter((proposal) => proposal.status === status && (type ? proposal.proposalType === type : true)).length;
}

function buildProposalSummary(
  currentProposals: SourceChangeProposal[],
  storedProposals: SourceChangeProposal[],
  sources: ManagedIngestionSource[],
): SourceChangeProposalSummary {
  return sourceChangeProposalSummarySchema.parse({
    openCount: countByStatus(currentProposals, "open"),
    approvedCount: countByStatus(storedProposals, "approved"),
    dismissedCount: countByStatus(storedProposals, "dismissed"),
    openPauseCount: countByStatus(currentProposals, "open", "pause_source"),
    openQueryRewriteCount: countByStatus(currentProposals, "open", "rewrite_query"),
    approvedPauseCount: countByStatus(storedProposals, "approved", "pause_source"),
    approvedResumeCount: countByStatus(storedProposals, "approved", "resume_source"),
    approvedQueryRewriteCount: countByStatus(storedProposals, "approved", "rewrite_query"),
    disabledSourceCount: sources.filter((source) => !source.enabled).length,
  });
}

async function syncProposalStore(currentProposals: SourceChangeProposal[]): Promise<{
  proposals: SourceChangeProposal[];
  allRecords: SourceChangeProposal[];
}> {
  const stored = await readProposalStore();
  const storedById = new Map(stored.map((proposal) => [proposal.proposalId, proposal]));
  const nextRecords = [...stored];
  const auditEvents: Array<{
    signalId: string;
    eventType: "SOURCE_CHANGE_PROPOSED";
    actor: "system";
    summary: string;
    metadata: Record<string, string | number | boolean | null>;
  }> = [];
  const seenIds = new Set(stored.map((proposal) => proposal.proposalId));

  const syncedCurrent = currentProposals.map((proposal) => {
    const existing = storedById.get(proposal.proposalId);
    if (!existing) {
      const created = sourceChangeProposalSchema.parse({
        ...proposal,
        status: "open",
      });
      nextRecords.push(created);
      auditEvents.push({
        signalId: buildProposalSignalId(created),
        eventType: "SOURCE_CHANGE_PROPOSED" as const,
        actor: "system" as const,
        summary: `${created.title} proposed for ${created.scopeLabel}.`,
        metadata: {
          proposalId: created.proposalId,
          proposalType: created.proposalType,
          sourceId: created.sourceId,
          sourceFamily: created.sourceFamily,
        },
      });
      return created;
    }

    return sourceChangeProposalSchema.parse({
      ...existing,
      ...proposal,
      status: existing.status,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    });
  });

  const syncedCurrentById = new Map(syncedCurrent.map((proposal) => [proposal.proposalId, proposal]));
  const merged = nextRecords.map((record) => syncedCurrentById.get(record.proposalId) ?? record);

  const hasNewRecord = syncedCurrent.some((proposal) => !seenIds.has(proposal.proposalId));
  const hasCurrentUpdates = merged.some((record) => {
    const storedRecord = storedById.get(record.proposalId);
    return storedRecord &&
      syncedCurrentById.has(record.proposalId) &&
      JSON.stringify(storedRecord) !== JSON.stringify(record);
  });

  if (hasNewRecord || hasCurrentUpdates) {
    await writeProposalStore(merged);
  }

  if (auditEvents.length > 0) {
    await appendAuditEventsSafe(auditEvents);
  }

  return {
    proposals: syncedCurrent,
    allRecords: merged,
  };
}

function mergeProposalSummariesIntoSources(
  sources: ManagedIngestionSource[],
  proposals: SourceChangeProposal[],
): ManagedIngestionSource[] {
  return sources.map((source) => ({
    ...source,
    recommendations: proposals
      .filter((proposal) => proposal.sourceId === source.id && proposal.status === "open")
      .slice(0, 3)
      .map((proposal) => ({
        action:
          proposal.proposalType === "pause_source"
            ? "pause_source"
            : proposal.proposalType === "rewrite_query"
              ? "refine_query"
              : "reduce_source_weight",
        summary: proposal.title,
        rationale: proposal.reason,
      })),
  }));
}

export async function buildSourceAutopilotV2State(input: {
  source: SignalDataSource;
  sourceRegistry: IngestionSourceDefinition[];
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  message?: string;
  error?: string;
}): Promise<SourceAutopilotV2State> {
  const managedSources = buildManagedIngestionSources(
    input.sourceRegistry,
    input.signals,
    input.postingEntries,
    input.postingOutcomes,
    input.strategicOutcomes,
  );
  const metrics = buildDraftMetrics(
    managedSources,
    input.signals,
    input.postingEntries,
    input.postingOutcomes,
    input.strategicOutcomes,
  );
  const draftProposals = draftSourceChangeProposals(metrics);
  const synced = await syncProposalStore(draftProposals);
  const recentChanges = synced.allRecords
    .filter((proposal) => proposal.status !== "open")
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 6);
  const sources = mergeProposalSummariesIntoSources(managedSources, synced.proposals);

  return {
    source: input.source,
    sources,
    proposals: synced.proposals,
    recentChanges,
    proposalSummary: buildProposalSummary(synced.proposals, synced.allRecords, sources),
    message: input.message,
    error: input.error,
  };
}

export async function getSourceAutopilotV2State(): Promise<SourceAutopilotV2State> {
  const [sourceRegistry, signalResult, postingEntries, postingOutcomes, strategicOutcomes] = await Promise.all([
    listIngestionSources(),
    listSignalsWithFallback({ limit: 500 }),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
  ]);

  return buildSourceAutopilotV2State({
    source: signalResult.source,
    sourceRegistry,
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    message: signalResult.message,
    error: signalResult.error,
  });
}

async function updateStoredProposalStatus(
  proposalId: string,
  status: SourceChangeProposalStatus,
): Promise<SourceChangeProposal | null> {
  const stored = await readProposalStore();
  const proposal = stored.find((item) => item.proposalId === proposalId) ?? null;
  if (!proposal) {
    return null;
  }

  const updated = sourceChangeProposalSchema.parse({
    ...proposal,
    status,
    updatedAt: new Date().toISOString(),
  });
  await writeProposalStore(stored.map((item) => (item.proposalId === proposalId ? updated : item)));
  return updated;
}

async function applyProposalChange(proposal: SourceChangeProposal): Promise<void> {
  if (!proposal.sourceId) {
    throw new Error("Family-level source proposals are not yet actionable in this run.");
  }

  switch (proposal.proposalType) {
    case "pause_source":
    case "resume_source":
      await updateIngestionSource(proposal.sourceId, { enabled: Boolean(proposal.proposedValue) });
      return;
    case "reduce_max_items":
    case "increase_max_items":
      await updateIngestionSource(proposal.sourceId, { maxItemsPerRun: Number(proposal.proposedValue) });
      return;
    case "rewrite_query":
      if (typeof proposal.proposedValue !== "string") {
        throw new Error("Query rewrite proposal is missing the proposed query text.");
      }
      await updateIngestionSource(proposal.sourceId, { query: proposal.proposedValue });
      return;
    case "reduce_source_family_cap":
    case "increase_source_family_cap":
      throw new Error("Family-cap proposals are defined but not yet actionable in this run.");
    default:
      throw new Error("Unsupported source proposal type.");
  }
}

export async function applySourceChangeProposalAction(
  action: SourceChangeProposalAction,
): Promise<{
  proposal: SourceChangeProposal | null;
  state: SourceAutopilotV2State;
}> {
  const currentState = await getSourceAutopilotV2State();
  const proposal = currentState.proposals.find((item) => item.proposalId === action.proposalId) ??
    currentState.recentChanges.find((item) => item.proposalId === action.proposalId) ??
    null;

  if (!proposal) {
    throw new Error("Unknown source change proposal.");
  }

  if (action.action === "approve") {
    await applyProposalChange(proposal);
  }

  const updatedProposal = await updateStoredProposalStatus(
    proposal.proposalId,
    action.action === "approve" ? "approved" : "dismissed",
  );

  if (!updatedProposal) {
    throw new Error("Unable to update source proposal state.");
  }

  await appendAuditEventsSafe([
    {
      signalId: buildProposalSignalId(updatedProposal),
      eventType: action.action === "approve" ? "SOURCE_CHANGE_APPROVED" : "SOURCE_CHANGE_DISMISSED",
      actor: "operator",
      summary:
        action.action === "approve"
          ? `${updatedProposal.title} approved for ${updatedProposal.scopeLabel}.`
          : `${updatedProposal.title} dismissed for ${updatedProposal.scopeLabel}.`,
      metadata: {
        proposalId: updatedProposal.proposalId,
        proposalType: updatedProposal.proposalType,
        sourceId: updatedProposal.sourceId,
        sourceFamily: updatedProposal.sourceFamily,
      },
    },
  ]);

  return {
    proposal: updatedProposal,
    state: await getSourceAutopilotV2State(),
  };
}
