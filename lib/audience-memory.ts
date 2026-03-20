import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AttributionRecord } from "@/lib/attribution";
import { appendAuditEventsSafe } from "@/lib/audit";
import type { AudienceSegment, CampaignStrategy } from "@/lib/campaigns";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { PostingLogEntry, PostingPlatform } from "@/lib/posting-memory";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import type { RevenueSignal } from "@/lib/revenue-signals";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { CtaGoal, EditorialMode, SignalRecord } from "@/types/signal";
import { z } from "zod";

const AUDIENCE_MEMORY_STORE_PATH = path.join(process.cwd(), "data", "audience-memory.json");

interface MetricRow {
  id: string;
  label: string;
  score: number;
  count: number;
}

export interface AudienceMemorySegment {
  segmentId: string;
  segmentName: string;
  description: string;
  strongestModes: MetricRow[];
  strongestPlatforms: MetricRow[];
  strongestDestinations: MetricRow[];
  weakCombinations: string[];
  preferredCtaStyles: string[];
  toneCautions: string[];
  supportingOutcomeSignals: string[];
  summary: string[];
}

export interface AudienceMemoryState {
  generatedAt: string;
  segmentCount: number;
  segments: AudienceMemorySegment[];
  topNotes: string[];
}

export interface AudienceSignalGuidance {
  positiveSignals: string[];
  riskSignals: string[];
  expectedOutcomeDelta: number;
  summary: string[];
}

export interface AudienceMemoryInsights {
  segmentRows: Array<{ label: string; count: number; note: string }>;
  topModeRows: Array<{ label: string; count: number }>;
  topPlatformRows: Array<{ label: string; count: number }>;
  topDestinationRows: Array<{ label: string; count: number }>;
  topNotes: string[];
}

const audienceMetricSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  score: z.number(),
  count: z.number().int().min(0),
});

const audienceMemorySegmentSchema = z.object({
  segmentId: z.string().trim().min(1),
  segmentName: z.string().trim().min(1),
  description: z.string().trim().min(1),
  strongestModes: z.array(audienceMetricSchema),
  strongestPlatforms: z.array(audienceMetricSchema),
  strongestDestinations: z.array(audienceMetricSchema),
  weakCombinations: z.array(z.string().trim().min(1)),
  preferredCtaStyles: z.array(z.string().trim().min(1)),
  toneCautions: z.array(z.string().trim().min(1)),
  supportingOutcomeSignals: z.array(z.string().trim().min(1)),
  summary: z.array(z.string().trim().min(1)),
});

const audienceMemoryStateSchema = z.object({
  generatedAt: z.string().trim().min(1),
  segmentCount: z.number().int().min(0),
  segments: z.array(audienceMemorySegmentSchema),
  topNotes: z.array(z.string().trim().min(1)),
});

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function getCtaStyleLabel(ctaGoal: CtaGoal | null | undefined): string | null {
  if (!ctaGoal) {
    return null;
  }

  if (ctaGoal === "Awareness" || ctaGoal === "Share / engage") {
    return "Softer CTA";
  }

  if (ctaGoal === "Sign up" || ctaGoal === "Try product") {
    return "Direct CTA";
  }

  return ctaGoal;
}

function scoreStrategicOutcome(outcome: StrategicOutcome | undefined) {
  if (!outcome) {
    return 0;
  }

  let score = 0;
  if (outcome.strategicValue === "high") {
    score += 3;
  } else if (outcome.strategicValue === "medium") {
    score += 1.5;
  } else if (outcome.strategicValue === "low") {
    score -= 2;
  }

  score += Math.min(2, (outcome.leadsOrSignups ?? 0) + (outcome.trialsOrConversions ?? 0));
  if ((outcome.clicks ?? 0) >= 10) {
    score += 1;
  }
  return score;
}

function scoreAttributionRecord(record: AttributionRecord | undefined) {
  if (!record) {
    return 0;
  }

  let score = 0;
  if (record.outcomeType === "lead" || record.outcomeType === "signup") {
    score += 2;
  } else if (record.outcomeType === "click") {
    score += 1;
  }

  if (record.outcomeStrength === "strong") {
    score += 2;
  } else if (record.outcomeStrength === "medium") {
    score += 1;
  }

  return score;
}

function scoreRevenueSignal(signal: RevenueSignal | undefined) {
  if (!signal) {
    return 0;
  }

  let score =
    signal.type === "paid"
      ? 4
      : signal.type === "trial"
        ? 3
        : signal.type === "signup"
          ? 2
          : 0;

  if (signal.strength === "high") {
    score += 2;
  } else if (signal.strength === "medium") {
    score += 1;
  }

  if (signal.confidence === "high") {
    score += 1;
  }

  return score;
}

function incrementMetric(map: Map<string, MetricRow>, id: string | null, label: string | null, score: number) {
  if (!id || !label) {
    return;
  }

  const current = map.get(id) ?? {
    id,
    label,
    score: 0,
    count: 0,
  };
  current.score += score;
  current.count += 1;
  map.set(id, current);
}

function sortedPositiveRows(map: Map<string, MetricRow>) {
  return [...map.values()]
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 3);
}

function sortedNegativeRows(map: Map<string, MetricRow>) {
  return [...map.values()]
    .filter((row) => row.score < 0)
    .sort((left, right) => left.score - right.score || right.count - left.count || left.label.localeCompare(right.label));
}

function buildToneCautions(modeRows: MetricRow[], ctaRows: MetricRow[]) {
  const cautions: string[] = [];

  for (const row of modeRows.slice(0, 2)) {
    if (row.id === "risk_warning" || row.id === "this_could_happen_to_you") {
      cautions.push(`${row.label} is underperforming for this segment.`);
    } else {
      cautions.push(`${row.label} needs more care with this segment.`);
    }
  }

  if (ctaRows.find((row) => row.id === "direct_cta")) {
    cautions.push("Direct CTA pressure is underperforming for this segment.");
  }

  return cautions.slice(0, 3);
}

function buildSupportSignals(segment: AudienceSegment, positiveModes: MetricRow[], positivePlatforms: MetricRow[], positiveDestinations: MetricRow[]) {
  const signals: string[] = [];
  if (positiveModes[0]) {
    signals.push(`${segment.name} responds best to ${positiveModes[0].label}.`);
  }
  if (positivePlatforms[0]) {
    signals.push(`${positivePlatforms[0].label} is the strongest current platform fit.`);
  }
  if (positiveDestinations[0]) {
    signals.push(`${positiveDestinations[0].label} is the strongest current destination.`);
  }
  return signals.slice(0, 3);
}

function buildWeakCombinationNotes(
  weakModes: MetricRow[],
  weakPlatforms: MetricRow[],
  weakDestinations: MetricRow[],
) {
  const notes: string[] = [];
  if (weakModes[0] && weakPlatforms[0]) {
    notes.push(`${weakModes[0].label} on ${weakPlatforms[0].label} is underperforming.`);
  }
  if (weakDestinations[0]) {
    notes.push(`${weakDestinations[0].label} is a weaker destination fit right now.`);
  }
  return notes.slice(0, 2);
}

function buildSummary(
  segment: AudienceSegment,
  positiveModes: MetricRow[],
  positivePlatforms: MetricRow[],
  positiveDestinations: MetricRow[],
  weakCombinationNotes: string[],
) {
  const summary: string[] = [];
  if (positiveModes[0] && positivePlatforms[0]) {
    summary.push(`${segment.name} responds better to ${positiveModes[0].label} on ${positivePlatforms[0].label}.`);
  }
  if (positiveDestinations[0]) {
    summary.push(`${positiveDestinations[0].label} is the strongest destination path for ${segment.name}.`);
  }
  if (weakCombinationNotes[0]) {
    summary.push(weakCombinationNotes[0]);
  }
  return summary.slice(0, 3);
}

export function buildAudienceMemoryState(input: {
  strategy: CampaignStrategy;
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
}): AudienceMemoryState {
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const strategicByPostingId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const attributionByPostingId = new Map((input.attributionRecords ?? []).map((record) => [record.postingId, record]));
  const revenueByPostingId = new Map((input.revenueSignals ?? []).map((record) => [record.postingId, record]));

  const segments = input.strategy.audienceSegments
    .map((segment) => {
      const modeScores = new Map<string, MetricRow>();
      const platformScores = new Map<string, MetricRow>();
      const destinationScores = new Map<string, MetricRow>();
      const ctaScores = new Map<string, MetricRow>();

      for (const entry of input.postingEntries) {
        const signal = signalById.get(entry.signalId);
        if (!signal || signal.audienceSegmentId !== segment.id) {
          continue;
        }

        const score =
          scoreStrategicOutcome(strategicByPostingId.get(entry.id)) +
          scoreAttributionRecord(attributionByPostingId.get(entry.id)) +
          scoreRevenueSignal(revenueByPostingId.get(entry.id));

        if (score === 0) {
          continue;
        }

        if (signal.editorialMode) {
          incrementMetric(modeScores, signal.editorialMode, getEditorialModeDefinition(signal.editorialMode).label, score);
        }

        incrementMetric(platformScores, entry.platform, getPostingPlatformLabel(entry.platform), score);

        const destinationId = entry.selectedSiteLinkId ?? normalizeText(entry.destinationUrl) ?? normalizeText(entry.destinationLabel);
        const destinationLabel = normalizeText(entry.destinationLabel) ?? normalizeText(entry.destinationUrl) ?? null;
        incrementMetric(destinationScores, destinationId, destinationLabel, score);

        const ctaStyleId =
          signal.ctaGoal === "Sign up" || signal.ctaGoal === "Try product"
            ? "direct_cta"
            : signal.ctaGoal
              ? "soft_cta"
              : null;
        const ctaStyleLabel = getCtaStyleLabel(signal.ctaGoal);
        incrementMetric(ctaScores, ctaStyleId, ctaStyleLabel, score);
      }

      const positiveModes = sortedPositiveRows(modeScores);
      const positivePlatforms = sortedPositiveRows(platformScores);
      const positiveDestinations = sortedPositiveRows(destinationScores);
      const weakModes = sortedNegativeRows(modeScores);
      const weakPlatforms = sortedNegativeRows(platformScores);
      const weakDestinations = sortedNegativeRows(destinationScores);
      const weakCtas = sortedNegativeRows(ctaScores);
      const weakCombinationNotes = buildWeakCombinationNotes(weakModes, weakPlatforms, weakDestinations);

      return {
        segmentId: segment.id,
        segmentName: segment.name,
        description: segment.description,
        strongestModes: positiveModes,
        strongestPlatforms: positivePlatforms,
        strongestDestinations: positiveDestinations,
        weakCombinations: weakCombinationNotes,
        preferredCtaStyles: sortedPositiveRows(ctaScores).map((row) => row.label),
        toneCautions: buildToneCautions(weakModes, weakCtas),
        supportingOutcomeSignals: buildSupportSignals(segment, positiveModes, positivePlatforms, positiveDestinations),
        summary: buildSummary(segment, positiveModes, positivePlatforms, positiveDestinations, weakCombinationNotes),
      } satisfies AudienceMemorySegment;
    })
    .filter((segment) => segment.summary.length > 0 || segment.toneCautions.length > 0);

  const topNotes = segments
    .flatMap((segment) => segment.summary.map((summary) => ({ summary, strength: segment.strongestModes[0]?.score ?? 0 })))
    .sort((left, right) => right.strength - left.strength || left.summary.localeCompare(right.summary))
    .slice(0, 4)
    .map((item) => item.summary);

  return audienceMemoryStateSchema.parse({
    generatedAt: new Date().toISOString(),
    segmentCount: segments.length,
    segments,
    topNotes,
  });
}

async function readPersistedAudienceMemory(): Promise<AudienceMemoryState | null> {
  try {
    const raw = await readFile(AUDIENCE_MEMORY_STORE_PATH, "utf8");
    return audienceMemoryStateSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeAudienceMemory(state: AudienceMemoryState): Promise<void> {
  await mkdir(path.dirname(AUDIENCE_MEMORY_STORE_PATH), { recursive: true });
  await writeFile(AUDIENCE_MEMORY_STORE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function syncAudienceMemory(input: {
  strategy: CampaignStrategy;
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
}) {
  const next = buildAudienceMemoryState(input);
  const previous = await readPersistedAudienceMemory();
  const nextFingerprint = JSON.stringify(next.segments.map((segment) => ({
    segmentId: segment.segmentId,
    strongestModes: segment.strongestModes,
    strongestPlatforms: segment.strongestPlatforms,
    strongestDestinations: segment.strongestDestinations,
    preferredCtaStyles: segment.preferredCtaStyles,
    toneCautions: segment.toneCautions,
  })));
  const previousFingerprint = previous
    ? JSON.stringify(previous.segments.map((segment) => ({
        segmentId: segment.segmentId,
        strongestModes: segment.strongestModes,
        strongestPlatforms: segment.strongestPlatforms,
        strongestDestinations: segment.strongestDestinations,
        preferredCtaStyles: segment.preferredCtaStyles,
        toneCautions: segment.toneCautions,
      })))
    : null;

  if (nextFingerprint !== previousFingerprint) {
    await writeAudienceMemory(next);
    await appendAuditEventsSafe(
      next.segments.slice(0, 4).map((segment) => ({
        signalId: `audience:${segment.segmentId}`,
        eventType: "AUDIENCE_MEMORY_UPDATED" as const,
        actor: "system" as const,
        summary: `Updated audience memory for ${segment.segmentName}.`,
        metadata: {
          strongestMode: segment.strongestModes[0]?.label ?? null,
          strongestPlatform: segment.strongestPlatforms[0]?.label ?? null,
          strongestDestination: segment.strongestDestinations[0]?.label ?? null,
        },
      })),
    );
  }

  return next;
}

export function getAudienceMemorySegment(
  state: AudienceMemoryState | null | undefined,
  audienceSegmentId: string | null | undefined,
) {
  if (!state || !audienceSegmentId) {
    return null;
  }

  return state.segments.find((segment) => segment.segmentId === audienceSegmentId) ?? null;
}

export function buildAudienceSignalGuidance(input: {
  state: AudienceMemoryState | null | undefined;
  signal: SignalRecord;
  primaryPlatform?: PostingPlatform | null;
  destinationLabel?: string | null;
}): AudienceSignalGuidance {
  const segment = getAudienceMemorySegment(input.state, input.signal.audienceSegmentId);
  if (!segment) {
    return {
      positiveSignals: [],
      riskSignals: [],
      expectedOutcomeDelta: 0,
      summary: [],
    };
  }

  const positiveSignals: string[] = [];
  const riskSignals: string[] = [];
  let expectedOutcomeDelta = 0;

  const topMode = segment.strongestModes[0];
  if (input.signal.editorialMode && topMode?.id === input.signal.editorialMode) {
    positiveSignals.push(`${segment.segmentName} has responded well to ${topMode.label}.`);
    expectedOutcomeDelta += 1;
  }

  const topPlatform = segment.strongestPlatforms[0];
  if (input.primaryPlatform && topPlatform?.id === input.primaryPlatform) {
    positiveSignals.push(`${topPlatform.label} is a strong platform fit for ${segment.segmentName}.`);
    expectedOutcomeDelta += 1;
  }

  const ctaStyle = getCtaStyleLabel(input.signal.ctaGoal);
  if (ctaStyle && segment.preferredCtaStyles.includes(ctaStyle)) {
    positiveSignals.push(`${ctaStyle} has been the better CTA style for this segment.`);
    expectedOutcomeDelta += 1;
  }

  if (
    input.signal.editorialMode &&
    segment.toneCautions.some((caution) =>
      caution.toLowerCase().includes(getEditorialModeDefinition(input.signal.editorialMode as EditorialMode).label.toLowerCase()),
    )
  ) {
    riskSignals.push(segment.toneCautions[0]!);
    expectedOutcomeDelta -= 1;
  }

  const destinationLabel = normalizeText(input.destinationLabel);
  if (
    destinationLabel &&
    segment.strongestDestinations.length > 0 &&
    !segment.strongestDestinations.some(
      (destination) => destination.label.toLowerCase() === destinationLabel,
    )
  ) {
    const weakDestination = segment.weakCombinations.find((note) =>
      note.toLowerCase().includes(destinationLabel),
    );
    if (weakDestination) {
      riskSignals.push(weakDestination);
      expectedOutcomeDelta -= 1;
    }
  }

  return {
    positiveSignals,
    riskSignals,
    expectedOutcomeDelta,
    summary: [...positiveSignals, ...riskSignals].slice(0, 3),
  };
}

export function buildAudienceMemoryInsights(state: AudienceMemoryState): AudienceMemoryInsights {
  return {
    segmentRows: state.segments.slice(0, 4).map((segment) => ({
      label: segment.segmentName,
      count: segment.strongestModes[0]?.count ?? 0,
      note: segment.summary[0] ?? segment.supportingOutcomeSignals[0] ?? "No clear audience pattern yet.",
    })),
    topModeRows: state.segments.flatMap((segment) => segment.strongestModes).slice(0, 6).map((row) => ({
      label: row.label,
      count: row.count,
    })),
    topPlatformRows: state.segments.flatMap((segment) => segment.strongestPlatforms).slice(0, 6).map((row) => ({
      label: row.label,
      count: row.count,
    })),
    topDestinationRows: state.segments.flatMap((segment) => segment.strongestDestinations).slice(0, 6).map((row) => ({
      label: row.label,
      count: row.count,
    })),
    topNotes: state.topNotes,
  };
}
