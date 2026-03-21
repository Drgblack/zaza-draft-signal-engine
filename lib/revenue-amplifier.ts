import type { AttributionRecord } from "@/lib/attribution";
import type { GrowthMemoryState } from "@/lib/growth-memory";
import type { PostingPlatform } from "@/lib/posting-memory";
import type { RevenueSignal } from "@/lib/revenue-signals";
import type { WeeklyRecap } from "@/lib/weekly-recap";
import type { CtaGoal, EditorialMode, SignalRecord } from "@/types/signal";

export type RevenueAmplifierStrength = "high" | "medium" | "caution";

export interface RevenueAmplifierPattern {
  id: string;
  label: string;
  pattern: string;
  platform: PostingPlatform | null;
  editorialMode: EditorialMode | null;
  destination: string | null;
  ctaGoal: CtaGoal | null;
  audienceSegmentId: string | null;
  audienceLabel: string | null;
  revenueStrength: RevenueAmplifierStrength;
  recommendation: string;
  reason: string;
  supportingSignals: string[];
  linkedWorkflow: string;
}

export interface RevenueAmplifierMatch {
  label: string;
  revenueStrength: RevenueAmplifierStrength;
  recommendation: string;
  reason: string;
  supportingSignals: string[];
  linkedWorkflow: string;
}

export interface RevenueAmplifierState {
  generatedAt: string;
  amplifiedPatterns: RevenueAmplifierPattern[];
  cautionPatterns: RevenueAmplifierPattern[];
  recommendedReuse: string[];
  topSummary: string[];
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function buildSignalAudienceLabel(signal: SignalRecord | null | undefined) {
  return normalizeText(signal?.audienceSegmentId)?.replaceAll(/[-_]/g, " ");
}

function getSignalPrimaryPlatform(signal: SignalRecord): PostingPlatform {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }

  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "x";
}

function scoreRevenueSignal(signal: RevenueSignal) {
  let score =
    signal.type === "paid"
      ? 6
      : signal.type === "trial"
        ? 4.5
        : signal.type === "signup"
          ? 3
          : 1;

  if (signal.strength === "high") {
    score += 2.5;
  } else if (signal.strength === "medium") {
    score += 1;
  }

  if (signal.confidence === "high") {
    score += 1;
  } else if (signal.confidence === "low") {
    score -= 0.5;
  }

  return score;
}

function scoreAttributionRecord(record: AttributionRecord) {
  let score =
    record.outcomeType === "lead"
      ? 2.5
      : record.outcomeType === "signup"
        ? 2
        : record.outcomeType === "click"
          ? 1
          : 0.25;

  if (record.outcomeStrength === "strong") {
    score += 1;
  } else if (record.outcomeStrength === "weak") {
    score -= 0.25;
  }

  return score;
}

function buildComboLabel(input: {
  platform: PostingPlatform | null;
  editorialMode: EditorialMode | null;
  destination: string | null;
  ctaGoal: CtaGoal | null;
  audienceLabel: string | null;
}) {
  const parts = [
    input.platform === "x" ? "X" : input.platform === "linkedin" ? "LinkedIn" : input.platform === "reddit" ? "Reddit" : null,
    input.editorialMode?.replaceAll("_", " "),
    input.destination,
    input.ctaGoal,
    input.audienceLabel,
  ].filter((value): value is string => Boolean(normalizeText(value)));

  return parts.length > 0 ? parts.join(" + ") : "Revenue-backed content family";
}

function buildPatternName(input: {
  editorialMode: EditorialMode | null;
  ctaGoal: CtaGoal | null;
  destination: string | null;
}) {
  return [
    input.editorialMode?.replaceAll("_", " "),
    input.ctaGoal,
    input.destination,
  ]
    .filter((value): value is string => Boolean(normalizeText(value)))
    .join(" / ");
}

type AggregatedRow = {
  key: string;
  platform: PostingPlatform | null;
  editorialMode: EditorialMode | null;
  destination: string | null;
  ctaGoal: CtaGoal | null;
  audienceSegmentId: string | null;
  audienceLabel: string | null;
  revenueScore: number;
  attributionScore: number;
  sampleCount: number;
  highStrengthCount: number;
  weakSignalCount: number;
  supportingSignals: string[];
};

function toAmplifiedPattern(
  row: AggregatedRow,
  strength: RevenueAmplifierStrength,
  growthMemory?: GrowthMemoryState | null,
): RevenueAmplifierPattern {
  const label = buildComboLabel(row);
  const pattern = buildPatternName(row);
  const supportingSignals: string[] = [];

  uniquePush(
    supportingSignals,
    `${row.sampleCount} revenue-linked signal${row.sampleCount === 1 ? "" : "s"} with ${row.highStrengthCount} high-strength outcome${row.highStrengthCount === 1 ? "" : "s"}.`,
  );
  uniquePush(
    supportingSignals,
    row.attributionScore > 0 ? `Attribution support score ${row.attributionScore.toFixed(1)}.` : null,
  );
  uniquePush(
    supportingSignals,
    growthMemory?.topNotes[0],
  );

  const recommendation =
    strength === "caution"
      ? `Reduce reuse of ${label.toLowerCase()} until the commercial signal improves.`
      : `Revenue pattern: ${strength === "high" ? "High-performing" : "Working"} — reuse ${label.toLowerCase()} more deliberately.`;
  const reason =
    strength === "caution"
      ? `${label} is underperforming relative to stronger commercial combinations and should not be over-amplified.`
      : `${label} is repeatedly tied to stronger commercial outcomes and is still worth reusing.`;

  return {
    id: `${strength}:${row.key}`,
    label,
    pattern: pattern || label,
    platform: row.platform,
    editorialMode: row.editorialMode,
    destination: row.destination,
    ctaGoal: row.ctaGoal,
    audienceSegmentId: row.audienceSegmentId,
    audienceLabel: row.audienceLabel,
    revenueStrength: strength,
    recommendation,
    reason,
    supportingSignals: supportingSignals.slice(0, 4),
    linkedWorkflow: "/plan",
  };
}

export function buildRevenueAmplifierState(input: {
  signals: SignalRecord[];
  revenueSignals: RevenueSignal[];
  attributionRecords?: AttributionRecord[];
  growthMemory?: GrowthMemoryState | null;
  weeklyRecap?: WeeklyRecap | null;
  now?: Date;
}): RevenueAmplifierState {
  const now = input.now ?? new Date();
  const signalsById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const rows = new Map<string, AggregatedRow>();

  for (const revenueSignal of input.revenueSignals) {
    const signal = signalsById.get(revenueSignal.signalId);
    const platform = revenueSignal.platform ?? (signal ? getSignalPrimaryPlatform(signal) : null);
    const editorialMode = signal?.editorialMode ?? revenueSignal.editorialMode ?? null;
    const destination = revenueSignal.destination ?? null;
    const ctaGoal = signal?.ctaGoal ?? null;
    const audienceSegmentId = signal?.audienceSegmentId ?? null;
    const audienceLabel = buildSignalAudienceLabel(signal);
    const key = [
      platform ?? "unknown",
      editorialMode ?? "unknown",
      normalizeText(destination)?.toLowerCase() ?? "none",
      ctaGoal ?? "none",
      audienceSegmentId ?? "none",
    ].join("|");

    const current = rows.get(key) ?? {
      key,
      platform,
      editorialMode,
      destination,
      ctaGoal,
      audienceSegmentId,
      audienceLabel: audienceLabel ?? null,
      revenueScore: 0,
      attributionScore: 0,
      sampleCount: 0,
      highStrengthCount: 0,
      weakSignalCount: 0,
      supportingSignals: [],
    };
    current.revenueScore += scoreRevenueSignal(revenueSignal);
    current.sampleCount += 1;
    if (revenueSignal.strength === "high") {
      current.highStrengthCount += 1;
    }
    if (revenueSignal.strength === "low") {
      current.weakSignalCount += 1;
    }
    if (revenueSignal.notes) {
      uniquePush(current.supportingSignals, revenueSignal.notes);
    }
    rows.set(key, current);
  }

  for (const record of input.attributionRecords ?? []) {
    const signal = signalsById.get(record.signalId);
    const key = [
      record.platform,
      signal?.editorialMode ?? record.editorialMode ?? "unknown",
      normalizeText(record.destination)?.toLowerCase() ?? "none",
      signal?.ctaGoal ?? "none",
      signal?.audienceSegmentId ?? "none",
    ].join("|");
    const current = rows.get(key);
    if (!current) {
      continue;
    }

    current.attributionScore += scoreAttributionRecord(record);
    if (record.notes) {
      uniquePush(current.supportingSignals, record.notes);
    }
  }

  const aggregatedRows = [...rows.values()].sort(
    (left, right) =>
      right.revenueScore + right.attributionScore - (left.revenueScore + left.attributionScore) ||
      right.highStrengthCount - left.highStrengthCount ||
      right.sampleCount - left.sampleCount,
  );

  const amplifiedPatterns = aggregatedRows
    .filter(
      (row) =>
        row.sampleCount >= 2 &&
        row.revenueScore + row.attributionScore >= 9 &&
        row.highStrengthCount >= 1,
    )
    .slice(0, 4)
    .map((row) =>
      toAmplifiedPattern(
        row,
        row.revenueScore + row.attributionScore >= 13 ? "high" : "medium",
        input.growthMemory,
      ),
    );

  const cautionPatterns = aggregatedRows
    .filter(
      (row) =>
        row.sampleCount >= 2 &&
        (row.weakSignalCount >= row.sampleCount / 2 ||
          row.revenueScore + row.attributionScore <= 3 ||
          (row.platform === "reddit" &&
            (row.ctaGoal === "Sign up" || row.ctaGoal === "Try product"))),
    )
    .slice(0, 3)
    .map((row) => toAmplifiedPattern(row, "caution", input.growthMemory));

  const recommendedReuse: string[] = [];
  for (const pattern of amplifiedPatterns) {
    uniquePush(recommendedReuse, pattern.recommendation);
  }
  uniquePush(recommendedReuse, input.weeklyRecap?.commercialHighlights[0]);
  uniquePush(recommendedReuse, input.growthMemory?.commercialMemory.summary);

  const topSummary: string[] = [];
  uniquePush(
    topSummary,
    amplifiedPatterns[0]
      ? `Revenue pattern: ${amplifiedPatterns[0].revenueStrength === "high" ? "High-performing" : "Working"} — ${amplifiedPatterns[0].label}.`
      : null,
  );
  uniquePush(topSummary, amplifiedPatterns[0]?.reason);
  uniquePush(topSummary, cautionPatterns[0]?.recommendation);
  uniquePush(topSummary, input.weeklyRecap?.commercialHighlights[0]);

  return {
    generatedAt: now.toISOString(),
    amplifiedPatterns,
    cautionPatterns,
    recommendedReuse: recommendedReuse.slice(0, 4),
    topSummary: topSummary.slice(0, 4),
  };
}

function scorePatternMatch(signal: SignalRecord, pattern: RevenueAmplifierPattern) {
  let score = 0;
  const primaryPlatform = getSignalPrimaryPlatform(signal);

  if (pattern.platform === primaryPlatform) {
    score += 3;
  }
  if (pattern.editorialMode && signal.editorialMode === pattern.editorialMode) {
    score += 2;
  }
  if (pattern.ctaGoal && signal.ctaGoal === pattern.ctaGoal) {
    score += 2;
  }
  if (pattern.audienceSegmentId && signal.audienceSegmentId === pattern.audienceSegmentId) {
    score += 2;
  }
  if (
    pattern.destination &&
    (normalizeText(signal.bestHookSignalCombination)?.toLowerCase().includes(pattern.destination.toLowerCase()) ||
      normalizeText(signal.finalCaptionUsed)?.toLowerCase().includes(pattern.destination.toLowerCase()))
  ) {
    score += 1;
  }
  if (signal.funnelStage === "Trust" && pattern.label.toLowerCase().includes("linkedin")) {
    score += 1;
  }

  return score;
}

export function matchRevenueAmplifierToSignal(
  signal: SignalRecord,
  state: RevenueAmplifierState | null | undefined,
): RevenueAmplifierMatch | null {
  if (!state) {
    return null;
  }

  const matches = state.amplifiedPatterns
    .map((pattern) => ({
      pattern,
      score: scorePatternMatch(signal, pattern),
    }))
    .filter((row) => row.score >= 3)
    .sort((left, right) => right.score - left.score || left.pattern.label.localeCompare(right.pattern.label));

  const best = matches[0]?.pattern;
  if (!best) {
    return null;
  }

  return {
    label: best.label,
    revenueStrength: best.revenueStrength,
    recommendation: best.recommendation,
    reason: best.reason,
    supportingSignals: best.supportingSignals,
    linkedWorkflow: best.linkedWorkflow,
  };
}
