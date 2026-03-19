import {
  buildPatternTagsFromSignal,
  buildPatternSourceContext,
  getPatternSuggestionContext,
  isPatternActive,
  type PatternEffectivenessSummary,
} from "@/lib/patterns";
import type { PatternBundleSummary } from "@/lib/pattern-bundles";
import type { SignalPattern } from "@/lib/pattern-definitions";
import type { SignalRecord } from "@/types/signal";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "being",
  "between",
  "from",
  "have",
  "into",
  "just",
  "more",
  "over",
  "really",
  "that",
  "this",
  "their",
  "there",
  "they",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
]);

const GENERIC_SIGNAL_TAGS = new Set(["scenario-led", "output-ready"]);

const COMMUNICATION_SITUATIONS = [
  {
    label: "parent tension",
    patterns: ["parent", "complaint", "after-hours", "reply window", "delayed replies", "boundary", "availability"],
  },
  {
    label: "behaviour documentation",
    patterns: ["behaviour", "behavior", "document", "documentation", "incident report", "factual reporting"],
  },
  {
    label: "incident communication",
    patterns: ["incident", "explain", "escalat", "de-escalat", "leadership", "classroom incident"],
  },
  {
    label: "planning reset",
    patterns: ["planning", "lesson plan", "weekly structure", "routine", "reusable", "planning rhythm"],
  },
  {
    label: "teacher onboarding",
    patterns: ["first-week", "first week", "onboarding", "new users", "getting started"],
  },
  {
    label: "neutral reporting",
    patterns: ["neutral", "factual", "objective", "professional", "calm clarity"],
  },
] as const;

export interface PatternMatchHeuristic {
  label: string;
  weight: number;
}

export interface PatternMatchSuggestion {
  pattern: SignalPattern;
  score: number;
  reason: string;
  effectivenessHint: string | null;
  matchedOn: PatternMatchHeuristic[];
  bundleSummaries: PatternBundleSummary[];
}

function tokenize(value: string | null | undefined): Set<string> {
  if (!value) {
    return new Set<string>();
  }

  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9-]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  );
}

function countOverlap(left: Set<string>, right: Set<string>): string[] {
  const overlap: string[] = [];

  for (const token of left) {
    if (right.has(token)) {
      overlap.push(token);
    }
  }

  return overlap;
}

function getSignalTokens(signal: SignalRecord): Set<string> {
  return new Set(
    [
      ...tokenize(signal.sourceTitle),
      ...tokenize(signal.manualSummary),
      ...tokenize(signal.rawExcerpt),
      ...tokenize(signal.scenarioAngle),
      ...tokenize(signal.signalSubtype),
      ...tokenize(signal.contentAngle),
      ...tokenize(signal.hookTemplateUsed),
    ],
  );
}

function getPatternTokens(pattern: SignalPattern): Set<string> {
  return new Set(
    [
      ...tokenize(pattern.name),
      ...tokenize(pattern.description),
      ...tokenize(pattern.exampleScenarioAngle),
      ...tokenize(pattern.exampleOutput),
      ...tokenize(pattern.exampleSignalSummary),
      ...pattern.tags.map((tag) => tag.toLowerCase()),
    ],
  );
}

function getSituationLabels(value: string): string[] {
  const combined = value.toLowerCase();
  const labels: string[] = [];

  for (const situation of COMMUNICATION_SITUATIONS) {
    if (situation.patterns.some((pattern) => combined.includes(pattern))) {
      labels.push(situation.label);
    }
  }

  return labels;
}

function buildPrimaryReason(input: {
  sharedSituations: string[];
  scenarioOverlap: string[];
  tagOverlap: string[];
  sharedContext: boolean;
  signal: SignalRecord;
  pattern: SignalPattern;
}): string {
  if (input.sharedSituations[0]) {
    return `This signal involves ${input.sharedSituations[0]} similar to this saved pattern.`;
  }

  if (input.scenarioOverlap.length >= 2) {
    return "The current Scenario Angle overlaps with this saved pattern.";
  }

  if (input.sharedContext) {
    return "This pattern comes from a similar source context and communication setup.";
  }

  if (input.tagOverlap.length > 0) {
    return "Shared tags and interpretation fields suggest this pattern may help here.";
  }

  if (input.signal.signalCategory && input.pattern.description.toLowerCase().includes(input.signal.signalCategory.toLowerCase())) {
    return "The saved pattern describes a similar communication situation.";
  }

  return "This pattern looks relevant to the current signal and framing.";
}

function matchPattern(
  signal: SignalRecord,
  pattern: SignalPattern,
  bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>,
  effectivenessById?: Record<string, PatternEffectivenessSummary>,
): PatternMatchSuggestion | null {
  const matches: PatternMatchHeuristic[] = [];
  let score = 0;
  const signalSourceContext = buildPatternSourceContext(signal)?.toLowerCase() ?? null;
  const patternSourceContext = pattern.sourceContext?.toLowerCase() ?? null;
  const signalTags = buildPatternTagsFromSignal(signal).filter((tag) => !GENERIC_SIGNAL_TAGS.has(tag));
  const tagOverlap = pattern.tags.filter((tag) => signalTags.includes(tag.toLowerCase()) && !GENERIC_SIGNAL_TAGS.has(tag));
  const scenarioOverlap = countOverlap(
    tokenize(signal.scenarioAngle ?? signal.contentAngle ?? signal.manualSummary ?? signal.sourceTitle),
    tokenize(pattern.exampleScenarioAngle ?? pattern.description),
  );
  const generalOverlap = countOverlap(getSignalTokens(signal), getPatternTokens(pattern));
  const signalSituations = getSituationLabels(
    [signal.sourceTitle, signal.manualSummary, signal.rawExcerpt, signal.scenarioAngle, signal.contentAngle]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
  const patternSituations = getSituationLabels(
    [pattern.name, pattern.description, pattern.exampleScenarioAngle, pattern.exampleOutput]
      .filter((value): value is string => Boolean(value))
      .join(" "),
  );
  const sharedSituations = signalSituations.filter((label) => patternSituations.includes(label));
  const sharedContext = Boolean(signalSourceContext && patternSourceContext && signalSourceContext === patternSourceContext);

  if (sharedContext) {
    matches.push({
      label: "Shared source context",
      weight: 4,
    });
    score += 4;
  }

  if (sharedSituations.length > 0) {
    matches.push({
      label: `Shared communication situation: ${sharedSituations[0]}`,
      weight: 4,
    });
    score += 4;
  }

  if (tagOverlap.length > 0) {
    const tagWeight = Math.min(4, tagOverlap.length * 2);
    matches.push({
      label: `Shared tags: ${tagOverlap.slice(0, 3).join(", ")}`,
      weight: tagWeight,
    });
    score += tagWeight;
  }

  if (scenarioOverlap.length >= 2) {
    const overlapWeight = Math.min(4, scenarioOverlap.length);
    matches.push({
      label: `Scenario overlap: ${scenarioOverlap.slice(0, 3).join(", ")}`,
      weight: overlapWeight,
    });
    score += overlapWeight;
  }

  if (generalOverlap.length >= 3) {
    matches.push({
      label: `Keyword overlap: ${generalOverlap.slice(0, 4).join(", ")}`,
      weight: 2,
    });
    score += 2;
  }

  if (signal.signalCategory && pattern.description.toLowerCase().includes(signal.signalCategory.toLowerCase())) {
    matches.push({
      label: `Signal category appears in pattern description`,
      weight: 2,
    });
    score += 2;
  }

  if (signal.hookTemplateUsed && pattern.exampleOutput?.toLowerCase().includes(signal.hookTemplateUsed.toLowerCase().slice(0, 12))) {
    matches.push({
      label: "Output tone overlaps with the current hook direction",
      weight: 1,
    });
    score += 1;
  }

  if (score < 4) {
    return null;
  }

  return {
    pattern,
    score,
    reason: buildPrimaryReason({
      sharedSituations,
      scenarioOverlap,
      tagOverlap,
      sharedContext,
      signal,
      pattern,
    }),
    effectivenessHint: getPatternSuggestionContext(effectivenessById?.[pattern.id] ?? null),
    matchedOn: matches.sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label)),
    bundleSummaries: bundleSummariesByPatternId?.[pattern.id] ?? [],
  };
}

export function findSuggestedPatterns(
  signal: SignalRecord,
  patterns: SignalPattern[],
  options?: {
    limit?: number;
    effectivenessById?: Record<string, PatternEffectivenessSummary>;
    bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>;
  },
): PatternMatchSuggestion[] {
  const limit = options?.limit ?? 3;

  return patterns
    .filter((pattern) => isPatternActive(pattern))
    .map((pattern) =>
      matchPattern(
        signal,
        pattern,
        options?.bundleSummariesByPatternId,
        options?.effectivenessById,
      ),
    )
    .filter((suggestion): suggestion is PatternMatchSuggestion => suggestion !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.pattern.createdAt).getTime() - new Date(left.pattern.createdAt).getTime();
    })
    .slice(0, limit);
}
