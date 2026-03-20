import { getPostingPlatformLabel, type PostingLogEntry, type PostingPlatform } from "@/lib/posting-log";
import type { PostingOutcome } from "@/lib/outcomes";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { SignalRecord } from "@/types/signal";

export interface RevisionGuidanceInsight {
  platform: PostingPlatform;
  headline: string;
  positive: string | null;
  caution: string | null;
  evidenceCount: number;
}

export interface RevisionGuidanceSummary {
  insightsByPlatform: Record<PostingPlatform, RevisionGuidanceInsight>;
}

type CtaStyle = "soft" | "direct" | "none";
type HookStyle = "question" | "contrast" | "direct";
type ToneStyle = "calm" | "advisory" | "assertive";

interface ComparablePost {
  platform: PostingPlatform;
  relevance: number;
  performance: number;
  ctaStyle: CtaStyle;
  hookStyle: HookStyle;
  toneStyle: ToneStyle;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

const DIRECT_CTA_TERMS = ["comment", "reply", "share", "save", "join", "follow", "visit", "click", "read", "watch", "try", "dm", "message"];
const SOFT_CTA_TERMS = ["if helpful", "if useful", "if relevant", "if you want", "when you are ready"];
const ASSERTIVE_TERMS = ["must", "never", "always", "urgent", "immediately", "clearly", "obviously", "definitely"];
const ADVISORY_TERMS = ["how to", "what to say", "use this", "wording", "here is", "here's", "try this"];

function normalizeText(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9\s?]/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function overlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function getLeadSegment(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return "";
  }

  return firstLine.split(/(?<=[.!?])\s+/)[0]?.trim() ?? firstLine;
}

function getClosingSegment(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines.at(-1) ?? "";
  if (!lastLine) {
    return "";
  }

  const sentences = lastLine.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (sentences.at(-1) ?? lastLine).trim();
}

function getSignalContextTokens(signal: SignalRecord): string[] {
  return tokenize(
    [
      signal.teacherPainPoint,
      signal.signalSubtype,
      signal.contentAngle,
      signal.scenarioAngle,
      signal.sourceTitle,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function getSignalDraft(signal: SignalRecord, platform: PostingPlatform): string {
  switch (platform) {
    case "x":
      return signal.finalXDraft ?? signal.xDraft ?? "";
    case "linkedin":
      return signal.finalLinkedInDraft ?? signal.linkedInDraft ?? "";
    case "reddit":
    default:
      return signal.finalRedditDraft ?? signal.redditDraft ?? "";
  }
}

function classifyCtaStyle(text: string): CtaStyle {
  const closing = normalizeText(getClosingSegment(text));
  if (!closing) {
    return "none";
  }

  if (SOFT_CTA_TERMS.some((term) => closing.includes(term))) {
    return "soft";
  }

  if (DIRECT_CTA_TERMS.some((term) => closing.startsWith(term) || closing.includes(`${term} `))) {
    return "direct";
  }

  return "none";
}

function classifyHookStyle(text: string): HookStyle {
  const lead = getLeadSegment(text);
  const normalized = normalizeText(lead);
  if (lead.includes("?")) {
    return "question";
  }

  if (/\bbut\b|\bnot\b|\binstead\b|\breally\b/.test(normalized)) {
    return "contrast";
  }

  return "direct";
}

function classifyToneStyle(text: string): ToneStyle {
  const normalized = normalizeText(text);
  if (ASSERTIVE_TERMS.some((term) => normalized.includes(term)) || text.includes("!")) {
    return "assertive";
  }

  if (ADVISORY_TERMS.some((term) => normalized.includes(term))) {
    return "advisory";
  }

  return "calm";
}

function toOutcomeScore(outcome: PostingOutcome | undefined): number {
  if (!outcome) {
    return 0;
  }

  const qualityScore =
    outcome.outcomeQuality === "strong" ? 2 : outcome.outcomeQuality === "acceptable" ? 1 : -2;
  const reuseScore =
    outcome.reuseRecommendation === "reuse_this_approach"
      ? 1
      : outcome.reuseRecommendation === "adapt_before_reuse"
        ? 0
        : -1;

  return qualityScore + reuseScore;
}

function toStrategicScore(outcome: StrategicOutcome | undefined): number {
  if (!outcome) {
    return 0;
  }

  return outcome.strategicValue === "high"
    ? 2
    : outcome.strategicValue === "medium"
      ? 1
      : outcome.strategicValue === "low"
        ? -1
        : 0;
}

function describeFeature(dimension: "cta" | "hook" | "tone", value: string): string {
  if (dimension === "cta") {
    return value === "soft" ? "the CTA stayed softer and lower-pressure" : "the CTA turned more direct";
  }

  if (dimension === "hook") {
    return value === "question"
      ? "the hook opened with a question"
      : value === "contrast"
        ? "the hook opened with a contrast or reframing"
        : "the hook opened with a direct statement";
  }

  return value === "calm"
    ? "the platform tone stayed calm and professional"
    : value === "advisory"
      ? "the platform tone sounded more advisory and wording-led"
      : "the platform tone sounded sharper and more forceful";
}

function buildComparablePosts(input: {
  signal: SignalRecord;
  allSignals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  platform: PostingPlatform;
}): ComparablePost[] {
  const signalById = new Map(input.allSignals.map((signal) => [signal.recordId, signal]));
  const outcomesByPostingLogId = new Map(input.postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicByPostingLogId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const currentContextTokens = getSignalContextTokens(input.signal);

  return input.postingEntries
    .filter((entry) => entry.platform === input.platform)
    .filter((entry) => entry.signalId !== input.signal.recordId)
    .map((entry) => {
      const relatedSignal = signalById.get(entry.signalId);
      if (!relatedSignal) {
        return null;
      }

      const contextOverlap = overlapScore(currentContextTokens, getSignalContextTokens(relatedSignal));
      const modeBoost =
        input.signal.editorialMode && relatedSignal.editorialMode === input.signal.editorialMode ? 0.6 : 0;
      const relevance = contextOverlap + modeBoost;
      const performance =
        toOutcomeScore(outcomesByPostingLogId.get(entry.id)) + toStrategicScore(strategicByPostingLogId.get(entry.id));

      if (relevance < 0.2 || performance === 0) {
        return null;
      }

      return {
        platform: entry.platform,
        relevance,
        performance,
        ctaStyle: classifyCtaStyle(entry.selectedCtaText ?? entry.finalPostedText),
        hookStyle: classifyHookStyle(entry.selectedHookText ?? entry.finalPostedText),
        toneStyle: classifyToneStyle(entry.finalPostedText),
      } satisfies ComparablePost;
    })
    .filter((entry): entry is ComparablePost => Boolean(entry));
}

function findBestAndWorstFeature<T extends string>(
  posts: ComparablePost[],
  selector: (post: ComparablePost) => T,
): {
  best: { value: T; average: number; count: number } | null;
  worst: { value: T; average: number; count: number } | null;
} {
  const grouped = new Map<T, { weightedPerformance: number; relevance: number; count: number }>();

  for (const post of posts) {
    const key = selector(post);
    const existing = grouped.get(key) ?? { weightedPerformance: 0, relevance: 0, count: 0 };
    existing.weightedPerformance += post.performance * Math.max(post.relevance, 0.2);
    existing.relevance += Math.max(post.relevance, 0.2);
    existing.count += 1;
    grouped.set(key, existing);
  }

  const ranked = Array.from(grouped.entries())
    .map(([value, stats]) => ({
      value,
      average: stats.relevance === 0 ? 0 : stats.weightedPerformance / stats.relevance,
      count: stats.count,
    }))
    .sort((left, right) => right.average - left.average || right.count - left.count);

  return {
    best: ranked[0] ?? null,
    worst: ranked.at(-1) ?? null,
  };
}

export function buildRevisionGuidance(input: {
  signal: SignalRecord;
  allSignals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
}): RevisionGuidanceSummary {
  const insightsByPlatform = Object.fromEntries(
    (["x", "linkedin", "reddit"] as const).map((platform) => {
      const comparablePosts = buildComparablePosts({
        ...input,
        platform,
      });
      const currentDraft = getSignalDraft(input.signal, platform);
      const currentCtaStyle = classifyCtaStyle(currentDraft);
      const currentHookStyle = classifyHookStyle(currentDraft);
      const currentToneStyle = classifyToneStyle(currentDraft);
      const ctaComparison = findBestAndWorstFeature(comparablePosts, (post) => post.ctaStyle);
      const hookComparison = findBestAndWorstFeature(comparablePosts, (post) => post.hookStyle);
      const toneComparison = findBestAndWorstFeature(comparablePosts, (post) => post.toneStyle);

      let positive: string | null = null;
      let caution: string | null = null;

      if (
        ctaComparison.best &&
        ctaComparison.best.count >= 1 &&
        ctaComparison.best.average >= 1 &&
        ctaComparison.best.value !== currentCtaStyle
      ) {
        positive = `${describeFeature("cta", ctaComparison.best.value)} on ${getPostingPlatformLabel(platform)}.`;
      } else if (
        hookComparison.best &&
        hookComparison.best.count >= 1 &&
        hookComparison.best.average >= 1 &&
        hookComparison.best.value !== currentHookStyle
      ) {
        positive = `${describeFeature("hook", hookComparison.best.value)} on ${getPostingPlatformLabel(platform)}.`;
      } else if (
        toneComparison.best &&
        toneComparison.best.count >= 1 &&
        toneComparison.best.average >= 1 &&
        toneComparison.best.value !== currentToneStyle
      ) {
        positive = `${describeFeature("tone", toneComparison.best.value)} on ${getPostingPlatformLabel(platform)}.`;
      }

      if (
        ctaComparison.worst &&
        ctaComparison.worst.count >= 1 &&
        ctaComparison.worst.average <= -1 &&
        ctaComparison.worst.value === currentCtaStyle
      ) {
        caution = `${describeFeature("cta", ctaComparison.worst.value)} on ${getPostingPlatformLabel(platform)}.`;
      } else if (
        hookComparison.worst &&
        hookComparison.worst.count >= 1 &&
        hookComparison.worst.average <= -1 &&
        hookComparison.worst.value === currentHookStyle
      ) {
        caution = `${describeFeature("hook", hookComparison.worst.value)} on ${getPostingPlatformLabel(platform)}.`;
      } else if (
        toneComparison.worst &&
        toneComparison.worst.count >= 1 &&
        toneComparison.worst.average <= -1 &&
        toneComparison.worst.value === currentToneStyle
      ) {
        caution = `${describeFeature("tone", toneComparison.worst.value)} on ${getPostingPlatformLabel(platform)}.`;
      }

      return [
        platform,
        {
          platform,
          headline: `${getPostingPlatformLabel(platform)} revision guidance`,
          positive,
          caution,
          evidenceCount: comparablePosts.length,
        } satisfies RevisionGuidanceInsight,
      ];
    }),
  ) as Record<PostingPlatform, RevisionGuidanceInsight>;

  return {
    insightsByPlatform,
  };
}
