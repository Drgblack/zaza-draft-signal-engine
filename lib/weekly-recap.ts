import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { getExperimentTypeLabel, type ManualExperiment } from "@/lib/experiments";
import { type PostingOutcome } from "@/lib/outcome-memory";
import { getPostingPlatformLabel, type PostingLogEntry, type PostingPlatform } from "@/lib/posting-memory";
import { buildRevenueSignalInsights, buildRevenueSignalsFromInputs } from "@/lib/revenue-signals";
import { buildAttributionInsights, buildAttributionRecordsFromInputs } from "@/lib/attribution";
import { type PatternBundleSummary } from "@/lib/pattern-bundles";
import { getSourceProfile, type SourceProfileKind } from "@/lib/source-profiles";
import { getStrategicValueLabel, type StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { EditorialMode, SignalRecord } from "@/types/signal";

export type WeeklyRecapItemType =
  | "platform"
  | "mode"
  | "pattern"
  | "destination"
  | "source"
  | "bundle"
  | "experiment";

export interface WeeklyRecapReference {
  label: string;
  href: string;
}

export interface WeeklyRecapItem {
  id: string;
  label: string;
  type: WeeklyRecapItemType;
  reason: string;
  href: string | null;
  references: WeeklyRecapReference[];
  score: number;
  postCount: number;
  judgedPostCount: number;
  platform: PostingPlatform | null;
  editorialMode: EditorialMode | null;
  patternId: string | null;
  bundleId: string | null;
  destinationKey: string | null;
  sourceKind: SourceProfileKind | null;
  experimentId: string | null;
}

export interface WeeklyRecapSupportingMetrics {
  postCount: number;
  judgedPostCount: number;
  postsMissingQualitativeOutcome: number;
  postsMissingStrategicOutcome: number;
  strongQualityCount: number;
  weakQualityCount: number;
  highValueCount: number;
  lowValueCount: number;
  leadTotal: number;
  clickTotal: number;
  activePlatformCount: number;
  experimentCount: number;
}

export interface WeeklyRecap {
  weekStartDate: string;
  weekEndDate: string;
  weekLabel: string;
  summary: string[];
  commercialHighlights: string[];
  winners: WeeklyRecapItem[];
  underperformers: WeeklyRecapItem[];
  reuseCandidates: WeeklyRecapItem[];
  pauseCandidates: WeeklyRecapItem[];
  experimentLearnings: WeeklyRecapItem[];
  gapNotes: string[];
  supportingMetrics: WeeklyRecapSupportingMetrics;
}

interface WeeklyRecapPostObservation {
  entry: PostingLogEntry;
  signal: SignalRecord;
  outcome: PostingOutcome | null;
  strategicOutcome: StrategicOutcome | null;
  bundleSummaries: PatternBundleSummary[];
  destinationLabel: string | null;
  destinationKey: string | null;
  sourceKind: SourceProfileKind;
  sourceKindLabel: string;
  score: number;
}

interface WeeklyRecapStat {
  id: string;
  label: string;
  type: WeeklyRecapItemType;
  href: string | null;
  references: WeeklyRecapReference[];
  score: number;
  postCount: number;
  judgedPostCount: number;
  strongQualityCount: number;
  acceptableQualityCount: number;
  weakQualityCount: number;
  reuseCount: number;
  adaptCount: number;
  doNotRepeatCount: number;
  highValueCount: number;
  mediumValueCount: number;
  lowValueCount: number;
  leadTotal: number;
  clickTotal: number;
  platform: PostingPlatform | null;
  editorialMode: EditorialMode | null;
  patternId: string | null;
  bundleId: string | null;
  destinationKey: string | null;
  sourceKind: SourceProfileKind | null;
  experimentId: string | null;
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function formatWeekStart(date: Date): string {
  return startOfWeek(date).toISOString().slice(0, 10);
}

function formatWeekEnd(weekStartDate: string): string {
  const end = new Date(`${weekStartDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStartDate: string): string {
  const start = new Date(`${weekStartDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const formatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function isDateInWeek(value: string | null | undefined, weekStartDate: string): boolean {
  if (!value) {
    return false;
  }

  const start = new Date(`${weekStartDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp < end.getTime();
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function simplifyDestinationLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    const pathLabel = url.pathname === "/" ? url.hostname.replace(/^www\./, "") : url.pathname;
    return pathLabel.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return normalized.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  }
}

function getPostScore(outcome: PostingOutcome | null, strategicOutcome: StrategicOutcome | null): number {
  let score = 0;

  if (outcome?.outcomeQuality === "strong") {
    score += 3;
  } else if (outcome?.outcomeQuality === "acceptable") {
    score += 1;
  } else if (outcome?.outcomeQuality === "weak") {
    score -= 3;
  }

  if (outcome?.reuseRecommendation === "reuse_this_approach") {
    score += 3;
  } else if (outcome?.reuseRecommendation === "adapt_before_reuse") {
    score += 1;
  } else if (outcome?.reuseRecommendation === "do_not_repeat") {
    score -= 4;
  }

  if (strategicOutcome?.strategicValue === "high") {
    score += 5;
  } else if (strategicOutcome?.strategicValue === "medium") {
    score += 2;
  } else if (strategicOutcome?.strategicValue === "low") {
    score -= 5;
  }

  const leadLikeTotal = (strategicOutcome?.leadsOrSignups ?? 0) + (strategicOutcome?.trialsOrConversions ?? 0);
  score += Math.min(3, leadLikeTotal * 2);
  score += (strategicOutcome?.clicks ?? 0) >= 40 ? 1 : 0;

  return score;
}

function pushReference(target: WeeklyRecapReference[], reference: WeeklyRecapReference) {
  if (target.some((item) => item.href === reference.href)) {
    return;
  }

  target.push(reference);
}

function updateStat(
  map: Map<string, WeeklyRecapStat>,
  key: string,
  base: Omit<WeeklyRecapStat, "score" | "postCount" | "judgedPostCount" | "strongQualityCount" | "acceptableQualityCount" | "weakQualityCount" | "reuseCount" | "adaptCount" | "doNotRepeatCount" | "highValueCount" | "mediumValueCount" | "lowValueCount" | "leadTotal" | "clickTotal" | "references">,
  observation: WeeklyRecapPostObservation,
) {
  const existing = map.get(key);
  const next: WeeklyRecapStat = existing ?? {
    ...base,
    references: [],
    score: 0,
    postCount: 0,
    judgedPostCount: 0,
    strongQualityCount: 0,
    acceptableQualityCount: 0,
    weakQualityCount: 0,
    reuseCount: 0,
    adaptCount: 0,
    doNotRepeatCount: 0,
    highValueCount: 0,
    mediumValueCount: 0,
    lowValueCount: 0,
    leadTotal: 0,
    clickTotal: 0,
  };

  next.score += observation.score;
  next.postCount += 1;
  next.judgedPostCount += observation.outcome || observation.strategicOutcome ? 1 : 0;
  next.leadTotal += (observation.strategicOutcome?.leadsOrSignups ?? 0) + (observation.strategicOutcome?.trialsOrConversions ?? 0);
  next.clickTotal += observation.strategicOutcome?.clicks ?? 0;

  if (observation.outcome?.outcomeQuality === "strong") {
    next.strongQualityCount += 1;
  } else if (observation.outcome?.outcomeQuality === "acceptable") {
    next.acceptableQualityCount += 1;
  } else if (observation.outcome?.outcomeQuality === "weak") {
    next.weakQualityCount += 1;
  }

  if (observation.outcome?.reuseRecommendation === "reuse_this_approach") {
    next.reuseCount += 1;
  } else if (observation.outcome?.reuseRecommendation === "adapt_before_reuse") {
    next.adaptCount += 1;
  } else if (observation.outcome?.reuseRecommendation === "do_not_repeat") {
    next.doNotRepeatCount += 1;
  }

  if (observation.strategicOutcome?.strategicValue === "high") {
    next.highValueCount += 1;
  } else if (observation.strategicOutcome?.strategicValue === "medium") {
    next.mediumValueCount += 1;
  } else if (observation.strategicOutcome?.strategicValue === "low") {
    next.lowValueCount += 1;
  }

  pushReference(next.references, {
    label: observation.signal.sourceTitle,
    href: `/signals/${observation.signal.recordId}`,
  });

  map.set(key, next);
}

function buildPositiveReason(stat: WeeklyRecapStat): string {
  const parts = [`${pluralize(stat.judgedPostCount, "judged post")} fed this signal`];

  if (stat.highValueCount > 0) {
    parts.push(`${pluralize(stat.highValueCount, "high-value outcome")}`);
  } else if (stat.strongQualityCount > 0) {
    parts.push(`${pluralize(stat.strongQualityCount, "strong qualitative rating")}`);
  }

  if (stat.leadTotal > 0) {
    parts.push(`${pluralize(stat.leadTotal, "lead")}`);
  }

  if (stat.reuseCount > 0) {
    parts.push(`${pluralize(stat.reuseCount, "reuse recommendation")}`);
  }

  if (stat.weakQualityCount === 0 && stat.doNotRepeatCount === 0 && stat.lowValueCount === 0) {
    parts.push("no weak or pause signal");
  }

  return parts.join(" · ");
}

function buildNegativeReason(stat: WeeklyRecapStat): string {
  const parts = [`${pluralize(stat.judgedPostCount, "judged post")} landed here this week`];

  if (stat.doNotRepeatCount > 0) {
    parts.push(`${pluralize(stat.doNotRepeatCount, "do-not-repeat call")}`);
  }

  if (stat.weakQualityCount > 0) {
    parts.push(`${pluralize(stat.weakQualityCount, "weak qualitative rating")}`);
  }

  if (stat.lowValueCount > 0) {
    parts.push(`${pluralize(stat.lowValueCount, "low strategic outcome")}`);
  }

  if (stat.leadTotal === 0 && stat.highValueCount === 0) {
    parts.push("no strong commercial signal");
  }

  return parts.join(" · ");
}

function toRecapItem(stat: WeeklyRecapStat, reason: string): WeeklyRecapItem {
  return {
    id: stat.id,
    label: stat.label,
    type: stat.type,
    reason,
    href: stat.href,
    references: stat.references.slice(0, 2),
    score: stat.score,
    postCount: stat.postCount,
    judgedPostCount: stat.judgedPostCount,
    platform: stat.platform,
    editorialMode: stat.editorialMode,
    patternId: stat.patternId,
    bundleId: stat.bundleId,
    destinationKey: stat.destinationKey,
    sourceKind: stat.sourceKind,
    experimentId: stat.experimentId,
  };
}

function comparePositive(left: WeeklyRecapStat, right: WeeklyRecapStat): number {
  return (
    right.score - left.score ||
    right.highValueCount - left.highValueCount ||
    right.reuseCount - left.reuseCount ||
    right.strongQualityCount - left.strongQualityCount ||
    right.leadTotal - left.leadTotal ||
    left.label.localeCompare(right.label)
  );
}

function compareNegative(left: WeeklyRecapStat, right: WeeklyRecapStat): number {
  return (
    right.doNotRepeatCount - left.doNotRepeatCount ||
    right.weakQualityCount - left.weakQualityCount ||
    right.lowValueCount - left.lowValueCount ||
    left.score - right.score ||
    left.label.localeCompare(right.label)
  );
}

function buildPostObservations(input: {
  weekStartDate: string;
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>;
}): WeeklyRecapPostObservation[] {
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const outcomeByPostingId = new Map(input.postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicByPostingId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));

  return input.postingEntries
    .filter((entry) => isDateInWeek(entry.postedAt, input.weekStartDate))
    .map((entry) => {
      const signal = signalById.get(entry.signalId);
      if (!signal) {
        return null;
      }

      const outcome = outcomeByPostingId.get(entry.id) ?? null;
      const strategicOutcome = strategicByPostingId.get(entry.id) ?? null;
      const sourceProfile = getSourceProfile(signal);
      const bundleSummaries = entry.patternId ? input.bundleSummariesByPatternId?.[entry.patternId] ?? [] : [];
      const destinationLabel = simplifyDestinationLabel(entry.destinationLabel ?? entry.selectedSiteLinkId ?? entry.destinationUrl);

      return {
        entry,
        signal,
        outcome,
        strategicOutcome,
        bundleSummaries,
        destinationLabel,
        destinationKey: entry.selectedSiteLinkId ?? destinationLabel ?? entry.destinationUrl ?? null,
        sourceKind: sourceProfile.sourceKind,
        sourceKindLabel: sourceProfile.kindLabel,
        score: getPostScore(outcome, strategicOutcome),
      } satisfies WeeklyRecapPostObservation;
    })
    .filter((item): item is WeeklyRecapPostObservation => Boolean(item))
    .sort(
      (left, right) =>
        new Date(right.entry.postedAt).getTime() - new Date(left.entry.postedAt).getTime() ||
        right.entry.id.localeCompare(left.entry.id),
    );
}

function buildRecapStats(observations: WeeklyRecapPostObservation[]): WeeklyRecapStat[] {
  const stats = new Map<string, WeeklyRecapStat>();

  for (const observation of observations) {
    updateStat(
      stats,
      `platform:${observation.entry.platform}`,
      {
        id: `platform:${observation.entry.platform}`,
        label: getPostingPlatformLabel(observation.entry.platform),
        type: "platform",
        href: "/review",
        platform: observation.entry.platform,
        editorialMode: null,
        patternId: null,
        bundleId: null,
        destinationKey: null,
        sourceKind: null,
        experimentId: null,
      },
      observation,
    );

    if (observation.entry.editorialMode) {
      updateStat(
        stats,
        `mode:${observation.entry.editorialMode}:${observation.entry.platform}`,
        {
          id: `mode:${observation.entry.editorialMode}:${observation.entry.platform}`,
          label: `${getEditorialModeDefinition(observation.entry.editorialMode).label} on ${getPostingPlatformLabel(observation.entry.platform)}`,
          type: "mode",
          href: "/review",
          platform: observation.entry.platform,
          editorialMode: observation.entry.editorialMode,
          patternId: null,
          bundleId: null,
          destinationKey: null,
          sourceKind: null,
          experimentId: null,
        },
        observation,
      );
    }

    if (observation.entry.patternId && observation.entry.patternName) {
      updateStat(
        stats,
        `pattern:${observation.entry.patternId}`,
        {
          id: `pattern:${observation.entry.patternId}`,
          label: observation.entry.patternName,
          type: "pattern",
          href: `/patterns/${observation.entry.patternId}`,
          platform: null,
          editorialMode: observation.entry.editorialMode ?? null,
          patternId: observation.entry.patternId,
          bundleId: null,
          destinationKey: null,
          sourceKind: null,
          experimentId: null,
        },
        observation,
      );
    }

    for (const bundle of observation.bundleSummaries) {
      updateStat(
        stats,
        `bundle:${bundle.id}`,
        {
          id: `bundle:${bundle.id}`,
          label: bundle.name,
          type: "bundle",
          href: `/pattern-bundles/${bundle.id}`,
          platform: null,
          editorialMode: observation.entry.editorialMode ?? null,
          patternId: null,
          bundleId: bundle.id,
          destinationKey: null,
          sourceKind: null,
          experimentId: null,
        },
        observation,
      );
    }

    if (observation.destinationLabel && observation.destinationKey) {
      updateStat(
        stats,
        `destination:${observation.destinationKey}`,
        {
          id: `destination:${observation.destinationKey}`,
          label: observation.destinationLabel,
          type: "destination",
          href: "/insights",
          platform: observation.entry.platform,
          editorialMode: observation.entry.editorialMode ?? null,
          patternId: null,
          bundleId: null,
          destinationKey: observation.destinationKey,
          sourceKind: null,
          experimentId: null,
        },
        observation,
      );
    }

    updateStat(
      stats,
      `source:${observation.sourceKind}`,
      {
        id: `source:${observation.sourceKind}`,
        label: `${observation.sourceKindLabel} sources`,
        type: "source",
        href: "/ingestion",
        platform: null,
        editorialMode: observation.entry.editorialMode ?? null,
        patternId: null,
        bundleId: null,
        destinationKey: null,
        sourceKind: observation.sourceKind,
        experimentId: null,
      },
      observation,
    );
  }

  return Array.from(stats.values()).filter((stat) => stat.postCount > 0);
}

function buildExperimentLearningItems(input: {
  weekStartDate: string;
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  experiments: ManualExperiment[];
}): WeeklyRecapItem[] {
  const weekPostingEntries = input.postingEntries.filter((entry) => isDateInWeek(entry.postedAt, input.weekStartDate));
  const weekPostingIds = new Set(weekPostingEntries.map((entry) => entry.id));
  const weekSignalIds = new Set(weekPostingEntries.map((entry) => entry.signalId));
  const outcomeByPostingId = new Map(input.postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicByPostingId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));

  const items = input.experiments
    .map((experiment): WeeklyRecapItem | null => {
      const linkedPostingIds = new Set<string>();
      for (const variant of experiment.variants) {
        for (const postingId of variant.linkedPostingIds) {
          if (weekPostingIds.has(postingId)) {
            linkedPostingIds.add(postingId);
          }
        }
        if (variant.linkedSignalIds.some((signalId) => weekSignalIds.has(signalId))) {
          for (const entry of weekPostingEntries.filter((item) => variant.linkedSignalIds.includes(item.signalId))) {
            linkedPostingIds.add(entry.id);
          }
        }
        if (variant.linkedWeekStartDates.includes(input.weekStartDate)) {
          for (const entry of weekPostingEntries) {
            linkedPostingIds.add(entry.id);
          }
        }
      }

      if (linkedPostingIds.size === 0) {
        return null;
      }

      let highValueCount = 0;
      let lowValueCount = 0;
      let strongQualityCount = 0;
      let weakQualityCount = 0;
      let leadTotal = 0;

      for (const postingId of linkedPostingIds) {
        const outcome = outcomeByPostingId.get(postingId);
        const strategicOutcome = strategicByPostingId.get(postingId);

        if (outcome?.outcomeQuality === "strong") {
          strongQualityCount += 1;
        } else if (outcome?.outcomeQuality === "weak") {
          weakQualityCount += 1;
        }

        if (strategicOutcome?.strategicValue === "high") {
          highValueCount += 1;
        } else if (strategicOutcome?.strategicValue === "low") {
          lowValueCount += 1;
        }

        leadTotal += (strategicOutcome?.leadsOrSignups ?? 0) + (strategicOutcome?.trialsOrConversions ?? 0);
      }

      const parts = [`${pluralize(linkedPostingIds.size, "linked post")}`];
      if (highValueCount > 0) {
        parts.push(`${pluralize(highValueCount, "high-value outcome")}`);
      } else if (strongQualityCount > 0) {
        parts.push(`${pluralize(strongQualityCount, "strong qualitative rating")}`);
      }
      if (leadTotal > 0) {
        parts.push(`${pluralize(leadTotal, "lead")}`);
      }
      if (lowValueCount > 0 || weakQualityCount > 0) {
        parts.push(`${pluralize(lowValueCount + weakQualityCount, "caution signal")}`);
      }
      if (highValueCount === 0 && strongQualityCount === 0 && leadTotal === 0) {
        parts.push("no stable winner yet");
      }

      return {
        id: `experiment:${experiment.experimentId}`,
        label: experiment.experimentType ? `${experiment.name} · ${getExperimentTypeLabel(experiment.experimentType)}` : experiment.name,
        type: "experiment",
        reason: parts.join(" · "),
        href: "/experiments",
        references: [],
        score: highValueCount * 5 + strongQualityCount * 3 + leadTotal * 2 - lowValueCount * 4 - weakQualityCount * 3,
        postCount: linkedPostingIds.size,
        judgedPostCount: linkedPostingIds.size,
        platform: null,
        editorialMode: null,
        patternId: null,
        bundleId: null,
        destinationKey: null,
        sourceKind: null,
        experimentId: experiment.experimentId,
      } satisfies WeeklyRecapItem;
    })
    .filter((item): item is WeeklyRecapItem => item !== null)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, 3);

  return items;
}

function buildSummary(input: {
  weekLabel: string;
  metrics: WeeklyRecapSupportingMetrics;
  winners: WeeklyRecapItem[];
  pauseCandidates: WeeklyRecapItem[];
  reuseCandidates: WeeklyRecapItem[];
}): string[] {
  const summary: string[] = [];
  uniquePush(summary, `${pluralize(input.metrics.judgedPostCount, "judged post")} across ${pluralize(input.metrics.postCount, "logged post")} for ${input.weekLabel}.`);

  if (input.winners[0]) {
    uniquePush(summary, `Top winner: ${input.winners[0].label}.`);
  }

  if (input.reuseCandidates[0]) {
    uniquePush(summary, `Best reuse signal: ${input.reuseCandidates[0].label}.`);
  }

  if (input.pauseCandidates[0]) {
    uniquePush(summary, `Strongest pause caution: ${input.pauseCandidates[0].label}.`);
  }

  if (summary.length === 1 && input.metrics.judgedPostCount === 0) {
    uniquePush(summary, "Too little judged evidence is available yet for a stronger weekly call.");
  }

  return summary.slice(0, 3);
}

function buildGapNotes(input: {
  metrics: WeeklyRecapSupportingMetrics;
  observations: WeeklyRecapPostObservation[];
  winners: WeeklyRecapItem[];
  experimentLearnings: WeeklyRecapItem[];
}): string[] {
  const notes: string[] = [];

  if (input.metrics.postsMissingQualitativeOutcome > 0) {
    uniquePush(notes, `${pluralize(input.metrics.postsMissingQualitativeOutcome, "post")} still lack a qualitative outcome update.`);
  }

  if (input.metrics.postsMissingStrategicOutcome > 0) {
    uniquePush(notes, `${pluralize(input.metrics.postsMissingStrategicOutcome, "post")} still lack a strategic outcome update.`);
  }

  if (input.metrics.judgedPostCount < 2 && input.metrics.postCount > 0) {
    uniquePush(notes, "Weekly recap is based on thin judged evidence, so treat the calls as provisional.");
  }

  if (input.metrics.activePlatformCount <= 1 && input.metrics.postCount >= 2) {
    uniquePush(notes, "The weekly evidence is still concentrated on one platform, so cross-platform conclusions remain weak.");
  }

  if (input.experimentLearnings.length === 0 && input.metrics.postCount > 0) {
    uniquePush(notes, "No experiment collected enough linked weekly evidence to produce a clear recap note.");
  }

  if (input.winners.length === 0 && input.metrics.postCount > 0) {
    uniquePush(notes, "No winner is strong enough to surface cleanly yet from recorded outcomes.");
  }

  if (input.observations.length === 0) {
    uniquePush(notes, "No posted items landed in this recap window.");
  }

  return notes.slice(0, 5);
}

function buildCommercialHighlights(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
  weekStartDate: string;
}): string[] {
  const weekEntries = input.postingEntries.filter((entry) => isDateInWeek(entry.postedAt, input.weekStartDate));
  const weekPostingIds = new Set(weekEntries.map((entry) => entry.id));
  const weekStrategicOutcomes = input.strategicOutcomes.filter((outcome) => weekPostingIds.has(outcome.postingLogId));

  const highlights = buildAttributionInsights(
    buildAttributionRecordsFromInputs({
      signals: input.signals,
      postingEntries: weekEntries,
      strategicOutcomes: weekStrategicOutcomes,
    }),
  ).summaries;
  const revenueHighlights = buildRevenueSignalInsights(
    buildRevenueSignalsFromInputs({
      signals: input.signals,
      postingEntries: weekEntries,
      strategicOutcomes: weekStrategicOutcomes,
    }),
  ).summaries;

  return [...highlights, ...revenueHighlights].filter((value, index, array) => array.indexOf(value) === index).slice(0, 4);
}

export function resolveWeeklyRecapWeekStart(
  postingEntries: PostingLogEntry[],
  postingOutcomes: PostingOutcome[],
  strategicOutcomes: StrategicOutcome[],
  now = new Date(),
): string {
  const currentWeekStart = formatWeekStart(now);
  const previousWeek = new Date(`${currentWeekStart}T00:00:00Z`);
  previousWeek.setUTCDate(previousWeek.getUTCDate() - 7);
  const previousWeekStart = formatWeekStart(previousWeek);
  const outcomeByPostingId = new Map(postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicByPostingId = new Map(strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));

  const scoreWeek = (weekStartDate: string) => {
    const weekEntries = postingEntries.filter((entry) => isDateInWeek(entry.postedAt, weekStartDate));
    const judgedCount = weekEntries.filter((entry) => outcomeByPostingId.has(entry.id) || strategicByPostingId.has(entry.id)).length;

    return {
      weekStartDate,
      postCount: weekEntries.length,
      judgedCount,
    };
  };

  return [scoreWeek(currentWeekStart), scoreWeek(previousWeekStart)]
    .sort(
      (left, right) =>
        right.judgedCount - left.judgedCount ||
        right.postCount - left.postCount ||
        right.weekStartDate.localeCompare(left.weekStartDate),
    )[0]?.weekStartDate ?? currentWeekStart;
}

export function buildWeeklyRecap(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  experiments?: ManualExperiment[];
  bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>;
  weekStartDate?: string;
  now?: Date;
}): WeeklyRecap {
  const weekStartDate =
    input.weekStartDate ??
    resolveWeeklyRecapWeekStart(input.postingEntries, input.postingOutcomes, input.strategicOutcomes, input.now);
  const observations = buildPostObservations({
    weekStartDate,
    signals: input.signals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    strategicOutcomes: input.strategicOutcomes,
    bundleSummariesByPatternId: input.bundleSummariesByPatternId,
  });
  const stats = buildRecapStats(observations);
  const metrics: WeeklyRecapSupportingMetrics = {
    postCount: observations.length,
    judgedPostCount: observations.filter((observation) => observation.outcome || observation.strategicOutcome).length,
    postsMissingQualitativeOutcome: observations.filter((observation) => !observation.outcome).length,
    postsMissingStrategicOutcome: observations.filter((observation) => !observation.strategicOutcome).length,
    strongQualityCount: observations.filter((observation) => observation.outcome?.outcomeQuality === "strong").length,
    weakQualityCount: observations.filter((observation) => observation.outcome?.outcomeQuality === "weak").length,
    highValueCount: observations.filter((observation) => observation.strategicOutcome?.strategicValue === "high").length,
    lowValueCount: observations.filter((observation) => observation.strategicOutcome?.strategicValue === "low").length,
    leadTotal: observations.reduce((sum, observation) => sum + (observation.strategicOutcome?.leadsOrSignups ?? 0) + (observation.strategicOutcome?.trialsOrConversions ?? 0), 0),
    clickTotal: observations.reduce((sum, observation) => sum + (observation.strategicOutcome?.clicks ?? 0), 0),
    activePlatformCount: new Set(observations.map((observation) => observation.entry.platform)).size,
    experimentCount: input.experiments?.length ?? 0,
  };

  const winners = stats
    .filter((stat) => stat.judgedPostCount > 0)
    .filter((stat) => stat.score >= 5 || stat.highValueCount > 0 || stat.reuseCount > 0)
    .sort(comparePositive)
    .slice(0, 4)
    .map((stat) => toRecapItem(stat, buildPositiveReason(stat)));

  const underperformers = stats
    .filter((stat) => stat.judgedPostCount > 0)
    .filter((stat) => stat.score <= -2 || stat.doNotRepeatCount > 0 || stat.weakQualityCount > 0 || stat.lowValueCount > 0)
    .sort(compareNegative)
    .slice(0, 4)
    .map((stat) => toRecapItem(stat, buildNegativeReason(stat)));

  const reuseCandidates = stats
    .filter((stat) => stat.judgedPostCount > 0)
    .filter((stat) => stat.reuseCount > 0 || (stat.strongQualityCount >= 1 && stat.lowValueCount === 0 && stat.doNotRepeatCount === 0))
    .sort(comparePositive)
    .slice(0, 4)
    .map((stat) => toRecapItem(stat, buildPositiveReason(stat)));

  const pauseCandidates = stats
    .filter((stat) => stat.judgedPostCount > 0)
    .filter((stat) => stat.doNotRepeatCount > 0 || stat.weakQualityCount >= 1 || (stat.lowValueCount > 0 && stat.highValueCount === 0))
    .sort(compareNegative)
    .slice(0, 4)
    .map((stat) => toRecapItem(stat, buildNegativeReason(stat)));

  const experimentLearnings = buildExperimentLearningItems({
    weekStartDate,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    strategicOutcomes: input.strategicOutcomes,
    experiments: input.experiments ?? [],
  });
  const commercialHighlights = buildCommercialHighlights({
    signals: input.signals,
    postingEntries: input.postingEntries,
    strategicOutcomes: input.strategicOutcomes,
    weekStartDate,
  });

  return {
    weekStartDate,
    weekEndDate: formatWeekEnd(weekStartDate),
    weekLabel: formatWeekLabel(weekStartDate),
    summary: buildSummary({
      weekLabel: formatWeekLabel(weekStartDate),
      metrics,
      winners,
      pauseCandidates,
      reuseCandidates,
    }),
    commercialHighlights,
    winners,
    underperformers,
    reuseCandidates,
    pauseCandidates,
    experimentLearnings,
    gapNotes: buildGapNotes({
      metrics,
      observations,
      winners,
      experimentLearnings,
    }),
    supportingMetrics: metrics,
  };
}

export function buildWeeklyRecapReferenceLine(item: WeeklyRecapItem): string {
  if (item.type === "experiment") {
    return item.reason;
  }

  const parts = [item.reason];
  if (item.platform) {
    parts.push(getPostingPlatformLabel(item.platform));
  }
  if (item.editorialMode) {
    parts.push(getEditorialModeDefinition(item.editorialMode).label);
  }

  return parts.join(" · ");
}

export function getWeeklyRecapMetricLabel(metric: keyof WeeklyRecapSupportingMetrics): string {
  switch (metric) {
    case "judgedPostCount":
      return "Judged posts";
    case "highValueCount":
      return "High-value outcomes";
    case "leadTotal":
      return "Leads";
    case "clickTotal":
      return "Clicks";
    case "postsMissingQualitativeOutcome":
      return "Missing qualitative outcome";
    case "postsMissingStrategicOutcome":
      return "Missing strategic outcome";
    default:
      return metric;
  }
}

export function getWeeklyRecapItemTypeLabel(type: WeeklyRecapItemType): string {
  switch (type) {
    case "platform":
      return "Platform";
    case "mode":
      return "Mode";
    case "pattern":
      return "Pattern";
    case "destination":
      return "Destination";
    case "source":
      return "Source";
    case "bundle":
      return "Bundle";
    case "experiment":
    default:
      return "Experiment";
  }
}

export function getWeeklyRecapStrategicHint(outcome: StrategicOutcome): string {
  const parts = [getStrategicValueLabel(outcome.strategicValue)];
  if ((outcome.leadsOrSignups ?? 0) > 0) {
    parts.push(pluralize(outcome.leadsOrSignups ?? 0, "lead"));
  }
  if ((outcome.clicks ?? 0) > 0) {
    parts.push(pluralize(outcome.clicks ?? 0, "click"));
  }
  return parts.join(" · ");
}
