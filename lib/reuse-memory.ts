import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import {
  getOutcomeQualityLabel,
  getReuseRecommendationLabel,
  type OutcomeQuality,
  type PostingOutcome,
  type ReuseRecommendation,
} from "@/lib/outcome-memory";
import type { PatternBundleSummary } from "@/lib/pattern-bundles";
import { getPostingPlatformLabel, type PostingLogEntry, type PostingPlatform } from "@/lib/posting-memory";
import { getSourceProfile } from "@/lib/source-profiles";
import type { EditorialMode, SignalRecord } from "@/types/signal";

type ReuseMemoryTone = "positive" | "caution" | "neutral";

type ReuseFamilyDefinition = {
  label: string;
  keywords: string[];
};

const REUSE_MEMORY_KEYWORD_STOPWORDS = new Set([
  "that",
  "this",
  "with",
  "when",
  "what",
  "from",
  "into",
  "your",
  "they",
  "them",
  "then",
  "than",
  "their",
  "have",
  "were",
  "been",
  "does",
  "should",
  "would",
  "could",
  "about",
  "before",
  "after",
  "still",
  "very",
  "more",
  "most",
  "just",
  "need",
  "needs",
  "teacher",
  "teachers",
  "communication",
  "message",
  "messages",
  "writing",
  "write",
  "using",
  "used",
  "well",
]);

const REUSE_FAMILY_DEFINITIONS: ReuseFamilyDefinition[] = [
  {
    label: "Parent complaint / de-escalation",
    keywords: ["parent", "complaint", "de-escalat", "reply window", "after-hours", "delayed repl", "availability"],
  },
  {
    label: "Behaviour incident communication",
    keywords: ["behaviour", "behavior", "incident", "follow-up", "follow up", "disruption", "conduct"],
  },
  {
    label: "Neutral factual documentation",
    keywords: ["document", "documentation", "factual", "neutral", "objective", "record", "reporting"],
  },
  {
    label: "Progress concern / difficult feedback",
    keywords: ["progress", "concern", "evidence", "assessment", "intervention", "feedback", "data"],
  },
  {
    label: "Boundary-setting / expectation management",
    keywords: ["boundary", "availability", "response window", "expectation", "always-on", "after-hours", "tone"],
  },
  {
    label: "Planning reset / workload calm-down",
    keywords: ["planning", "weekly", "routine", "workload", "lesson", "structure", "reset"],
  },
];

export interface ReuseMemoryCase {
  postingLogId: string;
  signalId: string;
  signalTitle: string;
  platform: PostingPlatform;
  platformLabel: string;
  postedAt: string;
  postUrl: string | null;
  editorialMode: EditorialMode | null;
  editorialModeLabel: string | null;
  patternId: string | null;
  patternName: string | null;
  bundleIds: string[];
  bundleNames: string[];
  sourceKind: string;
  sourceKindLabel: string;
  signalCategory: SignalRecord["signalCategory"];
  signalSubtype: string | null;
  scenarioAngle: string | null;
  familyLabels: string[];
  keywordSet: string[];
  outcomeQuality: OutcomeQuality;
  outcomeQualityLabel: string;
  reuseRecommendation: ReuseRecommendation;
  reuseRecommendationLabel: string;
  note: string | null;
}

export interface ReuseMemoryHighlight {
  postingLogId: string;
  signalId: string;
  signalTitle: string;
  platform: PostingPlatform;
  platformLabel: string;
  postUrl: string | null;
  postedAt: string;
  tone: ReuseMemoryTone;
  text: string;
  matchedOn: string[];
  outcomeQuality: OutcomeQuality;
  outcomeQualityLabel: string;
  reuseRecommendation: ReuseRecommendation;
  reuseRecommendationLabel: string;
  note: string | null;
  score: number;
}

export interface ReuseMemorySummary {
  highlights: ReuseMemoryHighlight[];
  positiveCount: number;
  cautionCount: number;
  neutralCount: number;
}

export interface ReuseMemoryCombinationInsightRow {
  label: string;
  count: number;
}

export interface ReuseMemoryPlatformInsightRow {
  platform: PostingPlatform;
  label: string;
  reusableCount: number;
  cautionCount: number;
}

export interface ReuseMemoryInsightsSummary {
  totalCases: number;
  reusableCount: number;
  cautionCount: number;
  topReusableCombinationLabel: string | null;
  topDoNotRepeatCombinationLabel: string | null;
  strongestPlatformLabel: string | null;
  weakestPlatformLabel: string | null;
  reusableRows: ReuseMemoryCombinationInsightRow[];
  cautionRows: ReuseMemoryCombinationInsightRow[];
  platformRows: ReuseMemoryPlatformInsightRow[];
}

type MatchContext = {
  signal: SignalRecord;
  editorialMode: EditorialMode | null;
  platform: PostingPlatform | null;
  patternId: string | null;
  bundleSummaries: PatternBundleSummary[];
};

function buildCombinedText(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 4 && !REUSE_MEMORY_KEYWORD_STOPWORDS.has(token));
}

function toKeywordSet(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(tokenize(buildCombinedText(values)))).slice(0, 18);
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

export function detectReuseMemoryFamilyLabels(
  values: Array<string | null | undefined>,
  bundleNames: string[] = [],
): string[] {
  const combined = buildCombinedText([...values, ...bundleNames]);

  return REUSE_FAMILY_DEFINITIONS.filter((definition) =>
    definition.keywords.some((keyword) => combined.includes(keyword)),
  ).map((definition) => definition.label);
}

function combinationLabel(reuseCase: ReuseMemoryCase): string {
  if (reuseCase.patternName && reuseCase.editorialModeLabel) {
    return `${reuseCase.patternName} + ${reuseCase.editorialModeLabel}`;
  }

  if (reuseCase.bundleNames[0] && reuseCase.editorialModeLabel) {
    return `${reuseCase.bundleNames[0]} + ${reuseCase.editorialModeLabel}`;
  }

  if (reuseCase.editorialModeLabel) {
    return `${reuseCase.editorialModeLabel} on ${reuseCase.platformLabel}`;
  }

  if (reuseCase.patternName) {
    return `${reuseCase.patternName} on ${reuseCase.platformLabel}`;
  }

  return `${reuseCase.sourceKindLabel} on ${reuseCase.platformLabel}`;
}

function toneForCase(reuseCase: ReuseMemoryCase): ReuseMemoryTone {
  if (
    reuseCase.outcomeQuality === "weak" ||
    reuseCase.reuseRecommendation === "do_not_repeat"
  ) {
    return "caution";
  }

  if (
    reuseCase.outcomeQuality === "strong" ||
    reuseCase.reuseRecommendation === "reuse_this_approach"
  ) {
    return "positive";
  }

  return "neutral";
}

function buildMatch(signal: SignalRecord, reuseCase: ReuseMemoryCase, context: MatchContext): {
  score: number;
  matchedOn: string[];
} | null {
  let score = 0;
  const matchedOn: string[] = [];
  const currentKeywords = toKeywordSet([
    signal.scenarioAngle,
    signal.contentAngle,
    signal.signalSubtype,
    signal.teacherPainPoint,
    signal.manualSummary,
    signal.rawExcerpt,
  ]);
  const currentFamilyLabels = detectReuseMemoryFamilyLabels(
    [
      signal.sourceTitle,
      signal.manualSummary,
      signal.rawExcerpt,
      signal.scenarioAngle,
      signal.signalSubtype,
      signal.contentAngle,
      signal.teacherPainPoint,
      signal.signalCategory,
    ],
    context.bundleSummaries.map((bundle) => bundle.name),
  );
  const currentSourceProfile = getSourceProfile(signal);
  const sharedKeywords = intersect(currentKeywords, reuseCase.keywordSet);
  const sharedFamilies = intersect(currentFamilyLabels, reuseCase.familyLabels);
  const sharedBundleNames = intersect(
    context.bundleSummaries.map((bundle) => bundle.name),
    reuseCase.bundleNames,
  );

  if (context.patternId && reuseCase.patternId === context.patternId) {
    score += 6;
    matchedOn.push("same saved pattern");
  }

  if (sharedBundleNames.length > 0) {
    score += 5;
    matchedOn.push(`shared bundle: ${sharedBundleNames[0]}`);
  }

  if (context.editorialMode && reuseCase.editorialMode === context.editorialMode) {
    score += 4;
    matchedOn.push("same editorial mode");
  }

  if (context.platform && reuseCase.platform === context.platform) {
    score += 3;
    matchedOn.push(`same ${reuseCase.platformLabel} platform`);
  }

  if (reuseCase.sourceKind === currentSourceProfile.sourceKind) {
    score += 2;
    matchedOn.push("same source family");
  }

  if (signal.signalCategory && reuseCase.signalCategory === signal.signalCategory) {
    score += 2;
    matchedOn.push(`same ${signal.signalCategory.toLowerCase()} category`);
  }

  if (sharedFamilies.length > 0) {
    score += 3;
    matchedOn.push(`same family: ${sharedFamilies[0]}`);
  }

  if (sharedKeywords.length >= 4) {
    score += 3;
    matchedOn.push("similar scenario wording");
  } else if (sharedKeywords.length >= 2) {
    score += 2;
    matchedOn.push("overlapping scenario wording");
  }

  if (score < 5) {
    return null;
  }

  return {
    score,
    matchedOn,
  };
}

function buildHighlightText(reuseCase: ReuseMemoryCase): string {
  const basePrefix = reuseCase.editorialModeLabel
    ? `A similar ${reuseCase.platformLabel} post using ${reuseCase.editorialModeLabel}`
    : `A similar ${reuseCase.platformLabel} post`;

  if (
    reuseCase.outcomeQuality === "strong" &&
    reuseCase.reuseRecommendation === "reuse_this_approach"
  ) {
    return `${basePrefix} was previously marked strong and reusable.`;
  }

  if (reuseCase.outcomeQuality === "strong") {
    return `${basePrefix} was previously marked strong.`;
  }

  if (reuseCase.reuseRecommendation === "reuse_this_approach") {
    return `${basePrefix} was previously marked worth reusing.`;
  }

  if (
    reuseCase.outcomeQuality === "weak" &&
    reuseCase.reuseRecommendation === "do_not_repeat"
  ) {
    return `${basePrefix} was previously marked weak and do not repeat.`;
  }

  if (reuseCase.outcomeQuality === "weak") {
    return `${basePrefix} was previously marked weak.`;
  }

  if (reuseCase.reuseRecommendation === "do_not_repeat") {
    return `${basePrefix} was previously marked do not repeat.`;
  }

  if (reuseCase.reuseRecommendation === "adapt_before_reuse") {
    return `${basePrefix} was previously acceptable, but marked adapt before reuse.`;
  }

  return `${basePrefix} has prior judged history worth checking before you reuse it directly.`;
}

function sortHighlights(left: ReuseMemoryHighlight, right: ReuseMemoryHighlight): number {
  return (
    right.score - left.score ||
    new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime() ||
    left.signalTitle.localeCompare(right.signalTitle)
  );
}

function takeBalancedHighlights(
  positive: ReuseMemoryHighlight[],
  caution: ReuseMemoryHighlight[],
  neutral: ReuseMemoryHighlight[],
  limit: number,
): ReuseMemoryHighlight[] {
  const ordered: ReuseMemoryHighlight[] = [];

  if (positive[0]) {
    ordered.push(positive[0]);
  }
  if (caution[0]) {
    ordered.push(caution[0]);
  }

  for (const item of [...positive.slice(1), ...neutral, ...caution.slice(1)].sort(sortHighlights)) {
    if (ordered.some((existing) => existing.postingLogId === item.postingLogId)) {
      continue;
    }

    ordered.push(item);

    if (ordered.length >= limit) {
      break;
    }
  }

  return ordered.slice(0, limit);
}

export function buildReuseMemoryCases(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>;
}): ReuseMemoryCase[] {
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const outcomeByPostingLogId = new Map(
    input.postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]),
  );

  const cases: Array<ReuseMemoryCase | null> = input.postingEntries.map((entry) => {
      const signal = signalById.get(entry.signalId);
      const outcome = outcomeByPostingLogId.get(entry.id);

      if (!signal || !outcome) {
        return null;
      }

      const bundleSummaries = entry.patternId
        ? input.bundleSummariesByPatternId?.[entry.patternId] ?? []
        : [];
      const sourceProfile = getSourceProfile(signal);
      const editorialModeLabel = entry.editorialMode
        ? getEditorialModeDefinition(entry.editorialMode).label
        : null;

      return {
        postingLogId: entry.id,
        signalId: signal.recordId,
        signalTitle: signal.sourceTitle,
        platform: entry.platform,
        platformLabel: getPostingPlatformLabel(entry.platform),
        postedAt: entry.postedAt,
        postUrl: entry.postUrl ?? null,
        editorialMode: entry.editorialMode ?? null,
        editorialModeLabel,
        patternId: entry.patternId ?? null,
        patternName: entry.patternName ?? null,
        bundleIds: bundleSummaries.map((bundle) => bundle.id),
        bundleNames: bundleSummaries.map((bundle) => bundle.name),
        sourceKind: sourceProfile.sourceKind,
        sourceKindLabel: sourceProfile.kindLabel,
        signalCategory: signal.signalCategory,
        signalSubtype: signal.signalSubtype ?? null,
        scenarioAngle: entry.scenarioAngle ?? signal.scenarioAngle ?? null,
        familyLabels: detectReuseMemoryFamilyLabels(
          [
            signal.sourceTitle,
            signal.manualSummary,
            signal.rawExcerpt,
            entry.scenarioAngle ?? signal.scenarioAngle,
            signal.signalSubtype,
            signal.contentAngle,
            signal.teacherPainPoint,
            signal.signalCategory,
            entry.patternName,
          ],
          bundleSummaries.map((bundle) => bundle.name),
        ),
        keywordSet: toKeywordSet([
          signal.sourceTitle,
          signal.manualSummary,
          signal.rawExcerpt,
          entry.scenarioAngle ?? signal.scenarioAngle,
          signal.signalSubtype,
          signal.contentAngle,
          signal.teacherPainPoint,
          entry.patternName,
          bundleSummaries.map((bundle) => bundle.name).join(" "),
        ]),
        outcomeQuality: outcome.outcomeQuality,
        outcomeQualityLabel: getOutcomeQualityLabel(outcome.outcomeQuality),
        reuseRecommendation: outcome.reuseRecommendation,
        reuseRecommendationLabel: getReuseRecommendationLabel(outcome.reuseRecommendation),
        note: outcome.note ?? null,
      } satisfies ReuseMemoryCase;
    });

  return cases
    .filter((reuseCase): reuseCase is ReuseMemoryCase => reuseCase !== null)
    .sort(
      (left, right) =>
        new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime() ||
        left.signalTitle.localeCompare(right.signalTitle),
    );
}

export function buildReuseMemorySummary(input: {
  signal: SignalRecord;
  cases: ReuseMemoryCase[];
  editorialMode?: EditorialMode | null;
  platform?: PostingPlatform | null;
  patternId?: string | null;
  bundleSummaries?: PatternBundleSummary[];
  limit?: number;
}): ReuseMemorySummary {
  const context: MatchContext = {
    signal: input.signal,
    editorialMode: input.editorialMode ?? null,
    platform: input.platform ?? null,
    patternId: input.patternId ?? null,
    bundleSummaries: input.bundleSummaries ?? [],
  };
  const matches = input.cases
    .map((reuseCase) => {
      const match = buildMatch(input.signal, reuseCase, context);
      if (!match) {
        return null;
      }

      return {
        postingLogId: reuseCase.postingLogId,
        signalId: reuseCase.signalId,
        signalTitle: reuseCase.signalTitle,
        platform: reuseCase.platform,
        platformLabel: reuseCase.platformLabel,
        postUrl: reuseCase.postUrl,
        postedAt: reuseCase.postedAt,
        tone: toneForCase(reuseCase),
        text: buildHighlightText(reuseCase),
        matchedOn: match.matchedOn,
        outcomeQuality: reuseCase.outcomeQuality,
        outcomeQualityLabel: reuseCase.outcomeQualityLabel,
        reuseRecommendation: reuseCase.reuseRecommendation,
        reuseRecommendationLabel: reuseCase.reuseRecommendationLabel,
        note: reuseCase.note,
        score: match.score,
      } satisfies ReuseMemoryHighlight;
    })
    .filter((highlight): highlight is ReuseMemoryHighlight => highlight !== null)
    .sort(sortHighlights);

  const positive = matches.filter((highlight) => highlight.tone === "positive");
  const caution = matches.filter((highlight) => highlight.tone === "caution");
  const neutral = matches.filter((highlight) => highlight.tone === "neutral");

  return {
    highlights: takeBalancedHighlights(positive, caution, neutral, input.limit ?? 3),
    positiveCount: positive.length,
    cautionCount: caution.length,
    neutralCount: neutral.length,
  };
}

export function buildReuseMemoryInsights(cases: ReuseMemoryCase[]): ReuseMemoryInsightsSummary {
  const reusableCases = cases.filter(
    (reuseCase) =>
      reuseCase.outcomeQuality === "strong" ||
      reuseCase.reuseRecommendation === "reuse_this_approach",
  );
  const cautionCases = cases.filter(
    (reuseCase) =>
      reuseCase.outcomeQuality === "weak" ||
      reuseCase.reuseRecommendation === "do_not_repeat",
  );
  const reusableCounts = new Map<string, number>();
  const cautionCounts = new Map<string, number>();
  const platformRows: ReuseMemoryPlatformInsightRow[] = [
    { platform: "x", label: "X", reusableCount: 0, cautionCount: 0 },
    { platform: "linkedin", label: "LinkedIn", reusableCount: 0, cautionCount: 0 },
    { platform: "reddit", label: "Reddit", reusableCount: 0, cautionCount: 0 },
  ];

  for (const reuseCase of reusableCases) {
    const label = combinationLabel(reuseCase);
    reusableCounts.set(label, (reusableCounts.get(label) ?? 0) + 1);
    const row = platformRows.find((platformRow) => platformRow.platform === reuseCase.platform);
    if (row) {
      row.reusableCount += 1;
    }
  }

  for (const reuseCase of cautionCases) {
    const label = combinationLabel(reuseCase);
    cautionCounts.set(label, (cautionCounts.get(label) ?? 0) + 1);
    const row = platformRows.find((platformRow) => platformRow.platform === reuseCase.platform);
    if (row) {
      row.cautionCount += 1;
    }
  }

  const reusableRows = Array.from(reusableCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 3);
  const cautionRows = Array.from(cautionCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 3);
  const strongestPlatform = [...platformRows]
    .filter((row) => row.reusableCount > 0)
    .sort((left, right) => right.reusableCount - left.reusableCount || left.label.localeCompare(right.label))[0];
  const weakestPlatform = [...platformRows]
    .filter((row) => row.cautionCount > 0)
    .sort((left, right) => right.cautionCount - left.cautionCount || left.label.localeCompare(right.label))[0];

  return {
    totalCases: cases.length,
    reusableCount: reusableCases.length,
    cautionCount: cautionCases.length,
    topReusableCombinationLabel: reusableRows[0]?.label ?? null,
    topDoNotRepeatCombinationLabel: cautionRows[0]?.label ?? null,
    strongestPlatformLabel: strongestPlatform?.label ?? null,
    weakestPlatformLabel: weakestPlatform?.label ?? null,
    reusableRows,
    cautionRows,
    platformRows,
  };
}
