import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { AuditEvent } from "@/lib/audit";
import type { SignalFeedback } from "@/lib/feedback-definitions";
import type { PatternFeedbackEntry } from "@/lib/pattern-feedback-definitions";
import { mockPatternSeed } from "@/lib/mock-data";
import {
  normalizePatternTags,
  normalizePatternText,
  patternSchema,
  type PatternLifecycleState,
  type PatternSummary,
  type PatternFormValues,
  type PatternType,
  type SignalPattern,
} from "@/lib/pattern-definitions";
import type { SignalRecord } from "@/types/signal";

const PATTERN_STORE_PATH = path.join(process.cwd(), "data", "signal-patterns.json");

const patternStoreSchema = z.record(z.string(), patternSchema);

export interface CreatePatternInput {
  name: string;
  description: string;
  patternType: PatternType;
  sourceContext?: string | null;
  exampleSignalId?: string | null;
  exampleSignalTitle?: string | null;
  exampleSignalSummary?: string | null;
  exampleScenarioAngle?: string | null;
  exampleOutput?: string | null;
  tags?: string[] | null;
  createdBy?: string | null;
}

export interface UpdatePatternInput {
  name?: string;
  description?: string;
  patternType?: PatternType;
  lifecycleState?: PatternLifecycleState;
  sourceContext?: string | null;
  exampleSignalId?: string | null;
  exampleSignalTitle?: string | null;
  exampleSignalSummary?: string | null;
  exampleScenarioAngle?: string | null;
  exampleOutput?: string | null;
  tags?: string[] | null;
}

export interface PatternEffectivenessSummary {
  patternId: string;
  name: string;
  description: string;
  lifecycleState: PatternLifecycleState;
  usedCount: number;
  effectiveCount: number;
  weakCount: number;
  needsRefinementCount: number;
  strongOutputCount: number;
  weakOutputCount: number;
  lastUsedAt: string | null;
  outcomeHint: string | null;
}

function sortPatterns(patterns: SignalPattern[]): SignalPattern[] {
  return [...patterns].sort((left, right) => {
    if (left.lifecycleState !== right.lifecycleState) {
      return left.lifecycleState === "active" ? -1 : 1;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function isPatternActive(pattern: SignalPattern): boolean {
  return pattern.lifecycleState !== "retired";
}

export function getPatternAuditSubjectId(patternId: string): string {
  return `pattern:${patternId}`;
}

export function isPatternAuditSubjectId(subjectId: string): boolean {
  return subjectId.startsWith("pattern:");
}

function buildSeedPatternStore(): Record<string, SignalPattern> {
  const store: Record<string, SignalPattern> = {};

  for (const pattern of mockPatternSeed) {
    const parsed = patternSchema.parse(pattern);
    store[parsed.id] = parsed;
  }

  return store;
}

function mergePatternStores(
  baseStore: Record<string, SignalPattern>,
  persistedStore: Record<string, SignalPattern>,
): Record<string, SignalPattern> {
  return {
    ...baseStore,
    ...persistedStore,
  };
}

async function readPersistedPatternStore(): Promise<Record<string, SignalPattern>> {
  try {
    const raw = await readFile(PATTERN_STORE_PATH, "utf8");
    return patternStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function readPatternStore(): Promise<Record<string, SignalPattern>> {
  return mergePatternStores(buildSeedPatternStore(), await readPersistedPatternStore());
}

async function writePatternStore(store: Record<string, SignalPattern>): Promise<void> {
  await mkdir(path.dirname(PATTERN_STORE_PATH), { recursive: true });
  await writeFile(PATTERN_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildTagValue(value: string | null | undefined): string | null {
  const normalized = normalizePatternText(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function truncate(value: string | null | undefined, maxLength: number): string | null {
  const normalized = normalizePatternText(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function getPatternExampleOutput(signal: SignalRecord): string | null {
  return (
    normalizePatternText(signal.linkedInDraft) ??
    normalizePatternText(signal.redditDraft) ??
    normalizePatternText(signal.xDraft) ??
    normalizePatternText(signal.finalCaptionUsed) ??
    null
  );
}

export function buildPatternSourceContext(signal: SignalRecord): string | null {
  const parts = [
    normalizePatternText(signal.sourceType),
    normalizePatternText(signal.sourcePublisher),
    normalizePatternText(signal.ingestionSource),
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function buildPatternTagsFromSignal(signal: SignalRecord): string[] {
  return normalizePatternTags(
    [
      buildTagValue(signal.signalCategory),
      buildTagValue(signal.sourceType),
      buildTagValue(signal.sourcePublisher),
      buildTagValue(signal.teacherVoiceSource),
      buildTagValue(signal.platformPriority),
      buildTagValue(signal.suggestedFormatPriority),
      signal.scenarioAngle ? "scenario-led" : null,
      getPatternExampleOutput(signal) ? "output-ready" : null,
    ].filter((value): value is string => Boolean(value)),
  );
}

export function buildPatternDraftFromSignal(signal: SignalRecord): PatternFormValues {
  const exampleOutput = getPatternExampleOutput(signal);
  const description =
    truncate(signal.contentAngle, 220) ??
    truncate(signal.teacherPainPoint, 220) ??
    truncate(signal.manualSummary, 220) ??
    truncate(signal.rawExcerpt, 220) ??
    "Reusable operator pattern captured from a successful signal.";

  return {
    name:
      truncate(
        `${signal.signalCategory ?? "Signal"} pattern: ${signal.sourceTitle}`,
        80,
      ) ?? signal.sourceTitle,
    description,
    patternType:
      signal.scenarioAngle && exampleOutput
        ? "hybrid"
        : signal.scenarioAngle
          ? "scenario"
          : exampleOutput
            ? "output"
            : "signal",
    sourceContext: buildPatternSourceContext(signal) ?? "",
    exampleSignalId: signal.recordId,
    exampleSignalTitle: signal.sourceTitle,
    exampleSignalSummary:
      truncate(signal.manualSummary, 320) ??
      truncate(signal.rawExcerpt, 320) ??
      truncate(signal.contentAngle, 320) ??
      "",
    exampleScenarioAngle: signal.scenarioAngle ?? "",
    exampleOutput: exampleOutput ?? "",
    tags: buildPatternTagsFromSignal(signal),
  };
}

function buildPattern(input: CreatePatternInput): SignalPattern {
  return patternSchema.parse({
    id: crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description.trim(),
    patternType: input.patternType,
    lifecycleState: "active",
    sourceContext: normalizePatternText(input.sourceContext),
    exampleSignalId: normalizePatternText(input.exampleSignalId),
    exampleSignalTitle: normalizePatternText(input.exampleSignalTitle),
    exampleSignalSummary: normalizePatternText(input.exampleSignalSummary),
    exampleScenarioAngle: normalizePatternText(input.exampleScenarioAngle),
    exampleOutput: normalizePatternText(input.exampleOutput),
    tags: normalizePatternTags(input.tags),
    createdAt: new Date().toISOString(),
    createdBy: normalizePatternText(input.createdBy) ?? "operator",
  });
}

export async function listPatterns(options?: {
  includeRetired?: boolean;
  lifecycleState?: PatternLifecycleState | "all";
}): Promise<SignalPattern[]> {
  const store = await readPatternStore();
  const lifecycleState = options?.lifecycleState ?? (options?.includeRetired ? "all" : "active");

  return sortPatterns(
    Object.values(store).filter((pattern) => {
      if (lifecycleState === "all") {
        return true;
      }

      if (lifecycleState === "retired") {
        return pattern.lifecycleState === "retired";
      }

      return isPatternActive(pattern);
    }),
  );
}

export async function getPattern(patternId: string): Promise<SignalPattern | null> {
  const store = await readPatternStore();
  return store[patternId] ?? null;
}

export function toPatternSummary(pattern: SignalPattern | null | undefined): PatternSummary | null {
  if (!pattern) {
    return null;
  }

  return {
    id: pattern.id,
    name: pattern.name,
    description: pattern.description,
    patternType: pattern.patternType,
    lifecycleState: pattern.lifecycleState,
  };
}

export function buildPatternEffectivenessSummaries(
  patterns: SignalPattern[],
  auditEvents: AuditEvent[],
  patternFeedbackEntries: PatternFeedbackEntry[],
  signalFeedbackEntries: SignalFeedback[],
): PatternEffectivenessSummary[] {
  const usageEvents = auditEvents.filter(
    (event) =>
      event.eventType === "PATTERN_APPLIED" &&
      !isPatternAuditSubjectId(event.signalId) &&
      typeof event.metadata?.patternId === "string",
  );

  const signalIdsByPattern = new Map<string, Set<string>>();
  const lastUsedAtByPattern = new Map<string, string>();

  for (const event of usageEvents) {
    const patternId = event.metadata?.patternId;
    if (typeof patternId !== "string") {
      continue;
    }

    const signalIds = signalIdsByPattern.get(patternId) ?? new Set<string>();
    signalIds.add(event.signalId);
    signalIdsByPattern.set(patternId, signalIds);

    const currentLastUsedAt = lastUsedAtByPattern.get(patternId);
    if (!currentLastUsedAt || new Date(event.timestamp).getTime() > new Date(currentLastUsedAt).getTime()) {
      lastUsedAtByPattern.set(patternId, event.timestamp);
    }
  }

  const patternFeedbackByPattern = new Map<string, PatternFeedbackEntry[]>();
  for (const entry of patternFeedbackEntries) {
    patternFeedbackByPattern.set(entry.patternId, [...(patternFeedbackByPattern.get(entry.patternId) ?? []), entry]);
  }

  return patterns
    .map((pattern) => {
      const feedback = patternFeedbackByPattern.get(pattern.id) ?? [];
      const usedSignalIds = signalIdsByPattern.get(pattern.id) ?? new Set<string>();
      const outputFeedback = signalFeedbackEntries.filter(
        (entry) => usedSignalIds.has(entry.signalId) && entry.category === "output",
      );
      const strongOutputCount = outputFeedback.filter((entry) => entry.value === "strong_output").length;
      const weakOutputCount = outputFeedback.filter(
        (entry) => entry.value === "weak_output" || entry.value === "needs_revision",
      ).length;
      const effectiveCount = feedback.filter((entry) => entry.value === "effective_pattern").length;
      const weakCount = feedback.filter((entry) => entry.value === "weak_pattern").length;
      const needsRefinementCount = feedback.filter((entry) => entry.value === "needs_refinement").length;

      let outcomeHint: string | null = null;
      if (strongOutputCount > 0 && strongOutputCount >= weakOutputCount) {
        outcomeHint = "Often leads to strong outputs.";
      } else if (needsRefinementCount > 0 || weakCount > 0 || weakOutputCount > strongOutputCount) {
        outcomeHint = "Often needs refinement.";
      }

      return {
        patternId: pattern.id,
        name: pattern.name,
        description: pattern.description,
        lifecycleState: pattern.lifecycleState,
        usedCount: usageEvents.filter((event) => event.metadata?.patternId === pattern.id).length,
        effectiveCount,
        weakCount,
        needsRefinementCount,
        strongOutputCount,
        weakOutputCount,
        lastUsedAt: lastUsedAtByPattern.get(pattern.id) ?? null,
        outcomeHint,
      };
    })
    .sort(
      (left, right) =>
        right.usedCount - left.usedCount ||
        right.effectiveCount - left.effectiveCount ||
        left.weakCount - right.weakCount ||
        left.name.localeCompare(right.name),
    );
}

export function getPatternEffectivenessSummary(
  patternId: string,
  summaries: PatternEffectivenessSummary[],
): PatternEffectivenessSummary | null {
  return summaries.find((summary) => summary.patternId === patternId) ?? null;
}

export function indexPatternEffectivenessSummaries(
  summaries: PatternEffectivenessSummary[],
): Record<string, PatternEffectivenessSummary> {
  return Object.fromEntries(summaries.map((summary) => [summary.patternId, summary]));
}

export function getPatternSuggestionContext(summary: PatternEffectivenessSummary | null): string | null {
  if (!summary) {
    return null;
  }

  if (summary.effectiveCount > 0 && summary.effectiveCount >= summary.weakCount + summary.needsRefinementCount) {
    return "This pattern has been marked effective previously.";
  }

  if (summary.needsRefinementCount > 0 && summary.needsRefinementCount >= summary.effectiveCount) {
    return "This pattern often needs refinement.";
  }

  if (summary.weakCount > 0 && summary.weakCount >= summary.effectiveCount) {
    return "This pattern has been marked weak previously.";
  }

  return null;
}

export async function appendPattern(input: CreatePatternInput): Promise<SignalPattern> {
  const pattern = buildPattern(input);
  const store = await readPersistedPatternStore();
  store[pattern.id] = pattern;
  await writePatternStore(store);
  return pattern;
}

export async function updatePattern(patternId: string, input: UpdatePatternInput): Promise<SignalPattern | null> {
  const store = await readPatternStore();
  const existing = store[patternId];

  if (!existing) {
    return null;
  }

  const updated = patternSchema.parse({
    ...existing,
    name: input.name?.trim() ?? existing.name,
    description: input.description?.trim() ?? existing.description,
    patternType: input.patternType ?? existing.patternType,
    lifecycleState: input.lifecycleState ?? existing.lifecycleState,
    sourceContext:
      input.sourceContext !== undefined ? normalizePatternText(input.sourceContext) : existing.sourceContext,
    exampleSignalId:
      input.exampleSignalId !== undefined ? normalizePatternText(input.exampleSignalId) : existing.exampleSignalId,
    exampleSignalTitle:
      input.exampleSignalTitle !== undefined ? normalizePatternText(input.exampleSignalTitle) : existing.exampleSignalTitle,
    exampleSignalSummary:
      input.exampleSignalSummary !== undefined
        ? normalizePatternText(input.exampleSignalSummary)
        : existing.exampleSignalSummary,
    exampleScenarioAngle:
      input.exampleScenarioAngle !== undefined
        ? normalizePatternText(input.exampleScenarioAngle)
        : existing.exampleScenarioAngle,
    exampleOutput:
      input.exampleOutput !== undefined ? normalizePatternText(input.exampleOutput) : existing.exampleOutput,
    tags: input.tags !== undefined ? normalizePatternTags(input.tags) : existing.tags,
  });

  const persistedStore = await readPersistedPatternStore();
  persistedStore[patternId] = updated;
  await writePatternStore(persistedStore);
  return updated;
}

function scorePatternRelation(signal: SignalRecord, pattern: SignalPattern): number {
  if (!isPatternActive(pattern)) {
    return 0;
  }

  if (pattern.exampleSignalId === signal.recordId) {
    return 0;
  }

  const signalTags = new Set(buildPatternTagsFromSignal(signal));
  const signalSourceContext = buildPatternSourceContext(signal);
  let score = 0;

  if (signalSourceContext && pattern.sourceContext && pattern.sourceContext === signalSourceContext) {
    score += 4;
  }

  for (const tag of pattern.tags) {
    if (signalTags.has(tag)) {
      score += 2;
    }
  }

  if (pattern.patternType === "scenario" || pattern.patternType === "hybrid") {
    score += 1;
  }

  if (pattern.exampleScenarioAngle && signal.scenarioAngle) {
    score += 1;
  }

  return score;
}

export function findRelatedPatterns(
  signal: SignalRecord,
  patterns: SignalPattern[],
  options?: { limit?: number },
): SignalPattern[] {
  const limit = options?.limit ?? 3;

  return patterns
    .filter((pattern) => isPatternActive(pattern))
    .map((pattern) => ({
      pattern,
      score: scorePatternRelation(signal, pattern),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.pattern.createdAt).getTime() - new Date(left.pattern.createdAt).getTime();
    })
    .slice(0, limit)
    .map((entry) => entry.pattern);
}
