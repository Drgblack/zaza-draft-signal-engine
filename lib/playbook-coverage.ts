import type { AuditEventInput } from "@/lib/audit";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { getOutcomeQualityLabel, type PostingOutcome } from "@/lib/outcome-memory";
import type { PatternBundleSummary } from "@/lib/pattern-bundles";
import {
  getPostingPlatformLabel,
  type PostingLogEntry,
  type PostingPlatform,
} from "@/lib/posting-log";
import type { PlaybookCard, PlaybookCardFormValues } from "@/lib/playbook-card-definitions";
import { getSourceProfile } from "@/lib/source-profiles";
import type { EditorialMode, SignalRecord } from "@/types/signal";

type CoverageTemplate =
  | "platform_mode"
  | "source_mode"
  | "platform_family"
  | "source_family"
  | "source_category";

export type PlaybookCoverageStatus = "covered" | "weakly_covered" | "uncovered" | "low_signal";
export type PlaybookCoverageGapKind = "uncovered" | "weak_coverage" | "opportunity";
export type PlaybookCoverageGapFlag =
  | "uncovered_active"
  | "repeated_caution"
  | "strong_outcomes"
  | "weak_outcomes"
  | "needs_adaptation";

export interface PlaybookCoverageCardMatch {
  cardId: string;
  title: string;
  score: number;
}

export interface PlaybookCoverageAreaSummary {
  key: string;
  label: string;
  template: CoverageTemplate;
  status: PlaybookCoverageStatus;
  signalCount: number;
  strongOutcomeCount: number;
  acceptableOutcomeCount: number;
  weakOutcomeCount: number;
  adaptBeforeReuseCount: number;
  cautionCount: number;
  cardCount: number;
  matchedCards: PlaybookCoverageCardMatch[];
  sourceLabel: string | null;
  platform: PostingPlatform | null;
  platformLabel: string | null;
  editorialMode: EditorialMode | null;
  editorialModeLabel: string | null;
  familyLabels: string[];
  relatedPatternIds: string[];
  relatedBundleIds: string[];
  relatedTags: string[];
  signalIds: string[];
}

export interface PlaybookCoverageGap {
  key: string;
  label: string;
  status: PlaybookCoverageStatus;
  kind: PlaybookCoverageGapKind;
  flag: PlaybookCoverageGapFlag;
  compactSummary: string;
  whyFlagged: string;
  suggestedAction: string;
  signalCount: number;
  strongOutcomeCount: number;
  acceptableOutcomeCount: number;
  weakOutcomeCount: number;
  adaptBeforeReuseCount: number;
  cautionCount: number;
  cardCount: number;
  matchedCards: PlaybookCoverageCardMatch[];
  suggestedModes: EditorialMode[];
  relatedPatternIds: string[];
  relatedBundleIds: string[];
  relatedTags: string[];
  signalIds: string[];
  importanceScore: number;
}

export interface PlaybookCoverageSummary {
  areaCount: number;
  coveredCount: number;
  weaklyCoveredCount: number;
  uncoveredCount: number;
  lowSignalCount: number;
  areas: PlaybookCoverageAreaSummary[];
  gaps: PlaybookCoverageGap[];
  groupedGaps: {
    uncovered: PlaybookCoverageGap[];
    weakCoverage: PlaybookCoverageGap[];
    opportunity: PlaybookCoverageGap[];
  };
}

export interface PlaybookCoverageHint {
  gap: PlaybookCoverageGap;
  tone: "warning" | "neutral";
  text: string;
  actionHref: string;
}

type CoverageDescriptor = {
  key: string;
  label: string;
  template: CoverageTemplate;
  sourceLabel: string | null;
  platform: PostingPlatform | null;
  platformLabel: string | null;
  editorialMode: EditorialMode | null;
  editorialModeLabel: string | null;
  familyLabels: string[];
  relatedPatternIds: string[];
  relatedBundleIds: string[];
  relatedTags: string[];
};

type AreaAccumulator = CoverageDescriptor & {
  signalIds: Set<string>;
  strongOutcomeCount: number;
  acceptableOutcomeCount: number;
  weakOutcomeCount: number;
  adaptBeforeReuseCount: number;
  cautionCount: number;
};

const PLAYBOOK_COVERAGE_STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "when",
  "what",
  "into",
  "their",
  "teacher",
  "teachers",
  "communication",
  "guidance",
  "playbook",
  "card",
  "cards",
]);

const COVERAGE_FAMILY_DEFINITIONS = [
  {
    label: "Parent complaint / de-escalation",
    keywords: ["parent complaint", "delayed repl", "after-hours", "reply window", "de-escalat"],
    minimumScore: 1,
  },
  {
    label: "Behaviour incident communication",
    keywords: ["behaviour", "behavior", "incident", "disruption", "conduct"],
    minimumScore: 2,
  },
  {
    label: "Neutral factual documentation",
    keywords: ["document", "documentation", "factual", "neutral", "objective", "record"],
    minimumScore: 2,
  },
  {
    label: "Progress concern / difficult feedback",
    keywords: ["progress", "concern", "evidence", "assessment", "intervention", "feedback", "data"],
    minimumScore: 2,
  },
  {
    label: "Boundary-setting / expectation management",
    keywords: ["boundary", "expectation", "always-on", "availability", "after-hours", "response window"],
    minimumScore: 2,
  },
  {
    label: "Planning reset / workload calm-down",
    keywords: ["planning", "weekly", "routine", "workload", "lesson", "structure", "reset"],
    minimumScore: 2,
  },
] as const;

function normalizeValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeKeyPart(value: string | null | undefined): string {
  const normalized = normalizeValue(value)?.toLowerCase() ?? "none";
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "none";
}

function normalizeTags(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeValue(value)?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 8);
}

function splitCompositeTag(value: string): string[] {
  return value
    .split(/[\/,]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 3);
}

function expandTags(values: string[]): string[] {
  return Array.from(
    new Set(values.flatMap((value) => [value, ...splitCompositeTag(value)])),
  );
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 4 && !PLAYBOOK_COVERAGE_STOPWORDS.has(token));
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function inferPlatformsFromSignal(signal: SignalRecord): PostingPlatform[] {
  const explicit = normalizeValue(signal.platformPostedTo)?.toLowerCase() ?? "";

  if (explicit.includes("linkedin")) {
    return ["linkedin"];
  }
  if (explicit.includes("reddit")) {
    return ["reddit"];
  }
  if (explicit.includes("x") || explicit.includes("twitter")) {
    return ["x"];
  }

  switch (signal.platformPriority) {
    case "X First":
      return ["x"];
    case "LinkedIn First":
      return ["linkedin"];
    case "Reddit First":
      return ["reddit"];
    default:
      return [];
  }
}

function getCoverageSourceLabel(signal: SignalRecord): string | null {
  const profile = getSourceProfile(signal);

  switch (profile.id) {
    case "reddit-teacher-discussion":
      return "Teacher Discussion";
    case "reddit-higher-ed-discussion":
      return "Higher-Ed Discussion";
    case "reddit-education-discussion":
      return "Education Discussion";
    case "forum-teacher-discussion":
      return "Teacher Discussion";
    case "feed-policy-news":
    case "formal-report":
      return "Policy Source";
    case "feed-teacher-news":
      return "Teacher News";
    case "query-teacher-risk":
      return "Teacher Risk Query";
    case "query-workload-stress":
      return "Workload Query";
    case "internal-operator-signal":
      return "Operator / Support";
    default:
      return profile.kindLabel;
  }
}

function buildFamilyLabels(signal: SignalRecord, bundleNames: string[]): string[] {
  const combined = [
    signal.sourceTitle,
    signal.manualSummary,
    signal.rawExcerpt,
    signal.scenarioAngle,
    signal.signalSubtype,
    signal.contentAngle,
    signal.teacherPainPoint,
    signal.signalCategory,
    ...bundleNames,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  const bestMatch = COVERAGE_FAMILY_DEFINITIONS.map((definition) => ({
    label: definition.label,
    score: definition.keywords.reduce(
      (sum, keyword) => sum + (combined.includes(keyword) ? 1 : 0),
      0,
    ),
    minimumScore: definition.minimumScore,
  }))
    .filter((definition) => definition.score >= definition.minimumScore)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))[0];

  return bestMatch ? [bestMatch.label] : [];
}

function buildCoverageDescriptorKey(input: {
  template: CoverageTemplate;
  platform: PostingPlatform | null;
  editorialMode: EditorialMode | null;
  sourceLabel: string | null;
  familyLabel: string | null;
  signalCategory: SignalRecord["signalCategory"];
}): string {
  return [
    input.template,
    `platform:${input.platform ?? "none"}`,
    `mode:${input.editorialMode ?? "none"}`,
    `source:${normalizeKeyPart(input.sourceLabel)}`,
    `family:${normalizeKeyPart(input.familyLabel)}`,
    `category:${normalizeKeyPart(input.signalCategory)}`,
  ].join("|");
}

function buildCoverageDescriptors(input: {
  signal: SignalRecord;
  platforms: PostingPlatform[];
  editorialMode: EditorialMode | null;
  relatedPatternIds?: string[];
  bundleSummaries?: PatternBundleSummary[];
}): CoverageDescriptor[] {
  const sourceLabel = getCoverageSourceLabel(input.signal);
  const editorialModeLabel = input.editorialMode
    ? getEditorialModeDefinition(input.editorialMode).label
    : null;
  const bundleSummaries = input.bundleSummaries ?? [];
  const bundleNames = bundleSummaries.map((bundle) => bundle.name);
  const familyLabels = buildFamilyLabels(input.signal, bundleNames);
  const familyLabel = familyLabels[0] ?? null;
  const categoryLabel = input.signal.signalCategory;
  const relatedPatternIds = Array.from(new Set(input.relatedPatternIds ?? [])).slice(0, 8);
  const relatedBundleIds = Array.from(new Set(bundleSummaries.map((bundle) => bundle.id))).slice(0, 8);
  const relatedTags = expandTags(
    normalizeTags([sourceLabel, categoryLabel, input.signal.signalSubtype, ...familyLabels]),
  ).slice(0, 8);
  const descriptors: CoverageDescriptor[] = [];

  for (const platform of Array.from(new Set(input.platforms))) {
    if (editorialModeLabel) {
      descriptors.push({
        key: buildCoverageDescriptorKey({
          template: "platform_mode",
          platform,
          editorialMode: input.editorialMode,
          sourceLabel,
          familyLabel,
          signalCategory: categoryLabel,
        }),
        label: `${getPostingPlatformLabel(platform)} + ${editorialModeLabel}`,
        template: "platform_mode",
        sourceLabel,
        platform,
        platformLabel: getPostingPlatformLabel(platform),
        editorialMode: input.editorialMode,
        editorialModeLabel,
        familyLabels,
        relatedPatternIds,
        relatedBundleIds,
        relatedTags,
      });
    }

    if (familyLabel) {
      descriptors.push({
        key: buildCoverageDescriptorKey({
          template: "platform_family",
          platform,
          editorialMode: input.editorialMode,
          sourceLabel,
          familyLabel,
          signalCategory: categoryLabel,
        }),
        label: `${getPostingPlatformLabel(platform)} + ${familyLabel}`,
        template: "platform_family",
        sourceLabel,
        platform,
        platformLabel: getPostingPlatformLabel(platform),
        editorialMode: input.editorialMode,
        editorialModeLabel,
        familyLabels,
        relatedPatternIds,
        relatedBundleIds,
        relatedTags,
      });
    }
  }

  if (sourceLabel && editorialModeLabel) {
    descriptors.push({
      key: buildCoverageDescriptorKey({
        template: "source_mode",
        platform: null,
        editorialMode: input.editorialMode,
        sourceLabel,
        familyLabel,
        signalCategory: categoryLabel,
      }),
      label: `${sourceLabel} + ${editorialModeLabel}`,
      template: "source_mode",
      sourceLabel,
      platform: null,
      platformLabel: null,
      editorialMode: input.editorialMode,
      editorialModeLabel,
      familyLabels,
      relatedPatternIds,
      relatedBundleIds,
      relatedTags,
    });
  }

  if (sourceLabel && familyLabel) {
    descriptors.push({
      key: buildCoverageDescriptorKey({
        template: "source_family",
        platform: null,
        editorialMode: input.editorialMode,
        sourceLabel,
        familyLabel,
        signalCategory: categoryLabel,
      }),
      label: `${sourceLabel} + ${familyLabel}`,
      template: "source_family",
      sourceLabel,
      platform: null,
      platformLabel: null,
      editorialMode: input.editorialMode,
      editorialModeLabel,
      familyLabels,
      relatedPatternIds,
      relatedBundleIds,
      relatedTags,
    });
  }

  if (descriptors.length === 0 && sourceLabel && categoryLabel) {
    descriptors.push({
      key: buildCoverageDescriptorKey({
        template: "source_category",
        platform: null,
        editorialMode: input.editorialMode,
        sourceLabel,
        familyLabel,
        signalCategory: categoryLabel,
      }),
      label: `${sourceLabel} + ${categoryLabel}`,
      template: "source_category",
      sourceLabel,
      platform: null,
      platformLabel: null,
      editorialMode: input.editorialMode,
      editorialModeLabel,
      familyLabels,
      relatedPatternIds,
      relatedBundleIds,
      relatedTags,
    });
  }

  return Array.from(new Map(descriptors.map((descriptor) => [descriptor.key, descriptor])).values());
}

function scoreCardAgainstArea(card: PlaybookCard, area: CoverageDescriptor): PlaybookCoverageCardMatch | null {
  if (card.status === "retired") {
    return null;
  }

  let score = 0;
  const areaTags = expandTags(area.relatedTags);
  const cardTags = expandTags(normalizeTags(card.relatedTags));
  const sharedTags = intersect(areaTags, cardTags);
  const sharedPatternIds = intersect(area.relatedPatternIds, card.relatedPatternIds);
  const sharedBundleIds = intersect(area.relatedBundleIds, card.relatedBundleIds);
  const areaTokens = tokenize(area.label);
  const cardTokens = tokenize(`${card.title} ${card.summary} ${card.situation}`);
  const sharedTokens = intersect(areaTokens, cardTokens);

  if (area.editorialMode && card.suggestedModes.includes(area.editorialMode)) {
    score += 3;
  }

  if (sharedTags.length > 0) {
    score += sharedTags.length >= 2 ? 4 : 3;
  }

  if (sharedPatternIds.length > 0) {
    score += 3;
  }

  if (sharedBundleIds.length > 0) {
    score += 3;
  }

  if (sharedTokens.length >= 2) {
    score += 2;
  } else if (sharedTokens.length === 1) {
    score += 1;
  }

  if (score < 5) {
    return null;
  }

  return {
    cardId: card.id,
    title: card.title,
    score,
  };
}

function sortCardMatches(matches: PlaybookCoverageCardMatch[]): PlaybookCoverageCardMatch[] {
  return [...matches].sort(
    (left, right) => right.score - left.score || left.title.localeCompare(right.title),
  );
}

function classifyArea(input: {
  signalCount: number;
  strongOutcomeCount: number;
  acceptableOutcomeCount: number;
  weakOutcomeCount: number;
  adaptBeforeReuseCount: number;
  cautionCount: number;
  cardCount: number;
}): PlaybookCoverageStatus {
  const totalOutcomeCount =
    input.strongOutcomeCount + input.acceptableOutcomeCount + input.weakOutcomeCount;
  const weakDominates =
    totalOutcomeCount >= 2 &&
    input.weakOutcomeCount >= Math.max(2, input.strongOutcomeCount + input.acceptableOutcomeCount);
  const needsAdaptation = input.adaptBeforeReuseCount >= 2;
  const enoughEvidence =
    input.signalCount >= 2 || totalOutcomeCount >= 2 || input.cautionCount >= 2;

  if (!enoughEvidence) {
    return "low_signal";
  }

  if (input.cardCount === 0) {
    return "uncovered";
  }

  if (weakDominates || needsAdaptation || (input.cautionCount >= 2 && input.strongOutcomeCount === 0)) {
    return "weakly_covered";
  }

  return "covered";
}

function buildGapKind(area: PlaybookCoverageAreaSummary): {
  kind: PlaybookCoverageGapKind;
  flag: PlaybookCoverageGapFlag;
} | null {
  if (area.status === "weakly_covered") {
    return {
      kind: "weak_coverage",
      flag:
        area.adaptBeforeReuseCount >= area.weakOutcomeCount
          ? "needs_adaptation"
          : "weak_outcomes",
    };
  }

  if (area.status !== "uncovered") {
    return null;
  }

  if (area.cautionCount >= 2) {
    return {
      kind: "uncovered",
      flag: "repeated_caution",
    };
  }

  if (area.strongOutcomeCount >= 1) {
    return {
      kind: "opportunity",
      flag: "strong_outcomes",
    };
  }

  if (area.signalCount >= 2) {
    return {
      kind: "uncovered",
      flag: "uncovered_active",
    };
  }

  return null;
}

function buildCompactSummary(
  area: PlaybookCoverageAreaSummary,
  kind: PlaybookCoverageGapKind,
  flag: PlaybookCoverageGapFlag,
): string {
  if (kind === "opportunity") {
    return `${area.label} has strong outcomes but no playbook card yet.`;
  }

  if (kind === "weak_coverage") {
    return `${area.label} is covered by a playbook card, but weak outcomes or adaptation warnings still dominate.`;
  }

  if (flag === "repeated_caution") {
    return `${area.label} frequently requires adaptation or lands weakly, but no playbook card exists yet.`;
  }

  return `${area.label} has recurring signals but no playbook card yet.`;
}

function buildWhyFlagged(
  area: PlaybookCoverageAreaSummary,
  kind: PlaybookCoverageGapKind,
  flag: PlaybookCoverageGapFlag,
): string {
  const parts = [`${area.signalCount} signals`];

  if (area.strongOutcomeCount > 0) {
    parts.push(`${area.strongOutcomeCount} ${getOutcomeQualityLabel("strong").toLowerCase()} outcomes`);
  }
  if (area.acceptableOutcomeCount > 0) {
    parts.push(
      `${area.acceptableOutcomeCount} ${getOutcomeQualityLabel("acceptable").toLowerCase()} outcomes`,
    );
  }
  if (area.weakOutcomeCount > 0) {
    parts.push(`${area.weakOutcomeCount} ${getOutcomeQualityLabel("weak").toLowerCase()} outcomes`);
  }
  if (area.adaptBeforeReuseCount > 0) {
    parts.push(`${area.adaptBeforeReuseCount} adapt-before-reuse warnings`);
  }
  if (area.cautionCount > 0 && flag === "repeated_caution") {
    parts.push(`${area.cautionCount} cautionary reuse-memory cases`);
  }
  if (kind !== "weak_coverage") {
    parts.push("0 matching playbook cards");
  } else {
    parts.push(`${area.cardCount} matching playbook card${area.cardCount === 1 ? "" : "s"}`);
  }

  return parts.join(" · ");
}

function buildSuggestedAction(
  kind: PlaybookCoverageGapKind,
  flag: PlaybookCoverageGapFlag,
  area: PlaybookCoverageAreaSummary,
): string {
  if (kind === "opportunity") {
    return `Create a playbook card for ${area.label} while the strong outcome pattern is still clear.`;
  }

  if (kind === "weak_coverage") {
    return `Tighten the existing guidance for ${area.label}, especially what works and what to avoid.`;
  }

  if (flag === "repeated_caution") {
    return `Create a caution-led playbook card for ${area.label} so operators do not keep improvising around the same risk.`;
  }

  return `Create a focused playbook card for ${area.label} so this recurring situation has reusable guidance.`;
}

function buildImportanceScore(
  area: PlaybookCoverageAreaSummary,
  kind: PlaybookCoverageGapKind,
  flag: PlaybookCoverageGapFlag,
): number {
  let score = area.signalCount * 3;
  score += area.strongOutcomeCount * 5;
  score += area.acceptableOutcomeCount * 2;
  score += area.weakOutcomeCount * 4;
  score += area.adaptBeforeReuseCount * 3;
  score += area.cautionCount * 4;

  if (kind === "weak_coverage") {
    score += 2;
  }
  if (flag === "repeated_caution") {
    score += 3;
  }

  return score;
}

function toGroupedGaps(gaps: PlaybookCoverageGap[]): PlaybookCoverageSummary["groupedGaps"] {
  return {
    uncovered: gaps.filter((gap) => gap.kind === "uncovered"),
    weakCoverage: gaps.filter((gap) => gap.kind === "weak_coverage"),
    opportunity: gaps.filter((gap) => gap.kind === "opportunity"),
  };
}

export function buildPlaybookCoverageSummary(input: {
  signals: SignalRecord[];
  playbookCards: PlaybookCard[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>;
}): PlaybookCoverageSummary {
  const activeCards = input.playbookCards.filter((card) => card.status === "active");
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const postingEntriesBySignalId = new Map<string, PostingLogEntry[]>();
  const postingEntryById = new Map(input.postingEntries.map((entry) => [entry.id, entry]));
  const accumulators = new Map<string, AreaAccumulator>();

  for (const entry of input.postingEntries) {
    postingEntriesBySignalId.set(entry.signalId, [
      ...(postingEntriesBySignalId.get(entry.signalId) ?? []),
      entry,
    ]);
  }

  function upsertArea(descriptor: CoverageDescriptor, signalId: string) {
    const existing = accumulators.get(descriptor.key) ?? {
      ...descriptor,
      signalIds: new Set<string>(),
      strongOutcomeCount: 0,
      acceptableOutcomeCount: 0,
      weakOutcomeCount: 0,
      adaptBeforeReuseCount: 0,
      cautionCount: 0,
    };

    existing.signalIds.add(signalId);
    accumulators.set(descriptor.key, existing);
  }

  for (const signal of input.signals) {
    const entries = postingEntriesBySignalId.get(signal.recordId) ?? [];
    const activityDescriptors =
      entries.length > 0
        ? entries.flatMap((entry) =>
            buildCoverageDescriptors({
              signal,
              platforms: [entry.platform],
              editorialMode: entry.editorialMode ?? signal.editorialMode,
              relatedPatternIds: entry.patternId ? [entry.patternId] : [],
              bundleSummaries: entry.patternId
                ? input.bundleSummariesByPatternId?.[entry.patternId] ?? []
                : [],
            }),
          )
        : buildCoverageDescriptors({
            signal,
            platforms: inferPlatformsFromSignal(signal),
            editorialMode: signal.editorialMode,
          });

    for (const descriptor of activityDescriptors) {
      upsertArea(descriptor, signal.recordId);
    }
  }

  for (const outcome of input.postingOutcomes) {
    const signal = signalById.get(outcome.signalId);
    const postingEntry = postingEntryById.get(outcome.postingLogId);

    if (!signal) {
      continue;
    }

    const descriptors = buildCoverageDescriptors({
      signal,
      platforms: [outcome.platform],
      editorialMode: postingEntry?.editorialMode ?? signal.editorialMode,
      relatedPatternIds: postingEntry?.patternId ? [postingEntry.patternId] : [],
      bundleSummaries: postingEntry?.patternId
        ? input.bundleSummariesByPatternId?.[postingEntry.patternId] ?? []
        : [],
    });

    for (const descriptor of descriptors) {
      upsertArea(descriptor, signal.recordId);
      const area = accumulators.get(descriptor.key);
      if (!area) {
        continue;
      }

      if (outcome.outcomeQuality === "strong") {
        area.strongOutcomeCount += 1;
      } else if (outcome.outcomeQuality === "acceptable") {
        area.acceptableOutcomeCount += 1;
      } else {
        area.weakOutcomeCount += 1;
      }

      if (outcome.reuseRecommendation === "adapt_before_reuse") {
        area.adaptBeforeReuseCount += 1;
      }

      if (
        outcome.reuseRecommendation === "do_not_repeat" ||
        outcome.outcomeQuality === "weak"
      ) {
        area.cautionCount += 1;
      }
    }
  }

  const areas = Array.from(accumulators.values())
    .map<PlaybookCoverageAreaSummary>((area) => {
      const matchedCards = sortCardMatches(
        activeCards
          .map((card) => scoreCardAgainstArea(card, area))
          .filter((match): match is PlaybookCoverageCardMatch => match !== null),
      ).slice(0, 3);
      const status = classifyArea({
        signalCount: area.signalIds.size,
        strongOutcomeCount: area.strongOutcomeCount,
        acceptableOutcomeCount: area.acceptableOutcomeCount,
        weakOutcomeCount: area.weakOutcomeCount,
        adaptBeforeReuseCount: area.adaptBeforeReuseCount,
        cautionCount: area.cautionCount,
        cardCount: matchedCards.length,
      });

      return {
        key: area.key,
        label: area.label,
        template: area.template,
        status,
        signalCount: area.signalIds.size,
        strongOutcomeCount: area.strongOutcomeCount,
        acceptableOutcomeCount: area.acceptableOutcomeCount,
        weakOutcomeCount: area.weakOutcomeCount,
        adaptBeforeReuseCount: area.adaptBeforeReuseCount,
        cautionCount: area.cautionCount,
        cardCount: matchedCards.length,
        matchedCards,
        sourceLabel: area.sourceLabel,
        platform: area.platform,
        platformLabel: area.platformLabel,
        editorialMode: area.editorialMode,
        editorialModeLabel: area.editorialModeLabel,
        familyLabels: area.familyLabels,
        relatedPatternIds: area.relatedPatternIds,
        relatedBundleIds: area.relatedBundleIds,
        relatedTags: area.relatedTags,
        signalIds: Array.from(area.signalIds),
      };
    })
    .sort(
      (left, right) =>
        right.signalCount - left.signalCount ||
        right.strongOutcomeCount - left.strongOutcomeCount ||
        right.cautionCount - left.cautionCount ||
        left.label.localeCompare(right.label),
    );

  const gaps = areas
    .map<PlaybookCoverageGap | null>((area) => {
      const gapKind = buildGapKind(area);
      if (!gapKind) {
        return null;
      }

      const suggestedModes = area.editorialMode ? [area.editorialMode] : [];
      const importanceScore = buildImportanceScore(area, gapKind.kind, gapKind.flag);

      return {
        key: area.key,
        label: area.label,
        status: area.status,
        kind: gapKind.kind,
        flag: gapKind.flag,
        compactSummary: buildCompactSummary(area, gapKind.kind, gapKind.flag),
        whyFlagged: buildWhyFlagged(area, gapKind.kind, gapKind.flag),
        suggestedAction: buildSuggestedAction(gapKind.kind, gapKind.flag, area),
        signalCount: area.signalCount,
        strongOutcomeCount: area.strongOutcomeCount,
        acceptableOutcomeCount: area.acceptableOutcomeCount,
        weakOutcomeCount: area.weakOutcomeCount,
        adaptBeforeReuseCount: area.adaptBeforeReuseCount,
        cautionCount: area.cautionCount,
        cardCount: area.cardCount,
        matchedCards: area.matchedCards,
        suggestedModes,
        relatedPatternIds: area.relatedPatternIds,
        relatedBundleIds: area.relatedBundleIds,
        relatedTags: area.relatedTags,
        signalIds: area.signalIds,
        importanceScore,
      };
    })
    .filter((gap): gap is PlaybookCoverageGap => gap !== null)
    .sort(
      (left, right) =>
        right.importanceScore - left.importanceScore ||
        right.signalCount - left.signalCount ||
        left.label.localeCompare(right.label),
    );

  return {
    areaCount: areas.length,
    coveredCount: areas.filter((area) => area.status === "covered").length,
    weaklyCoveredCount: areas.filter((area) => area.status === "weakly_covered").length,
    uncoveredCount: areas.filter((area) => area.status === "uncovered").length,
    lowSignalCount: areas.filter((area) => area.status === "low_signal").length,
    areas,
    gaps,
    groupedGaps: toGroupedGaps(gaps),
  };
}

export function buildPlaybookDraftFromCoverageGap(
  gap: PlaybookCoverageGap,
): PlaybookCardFormValues {
  return {
    title: gap.label.slice(0, 120),
    summary:
      gap.kind === "weak_coverage"
        ? `Sharper operator guidance for a weakly covered area: ${gap.label}.`
        : `Operator guidance for a recurring uncovered area: ${gap.label}.`,
    situation: gap.compactSummary,
    whatWorks: "",
    whatToAvoid: "",
    suggestedModes: gap.suggestedModes.slice(0, 4),
    relatedPatternIds: gap.relatedPatternIds.slice(0, 8),
    relatedBundleIds: gap.relatedBundleIds.slice(0, 8),
    relatedTags: gap.relatedTags.slice(0, 8),
    status: "active",
  };
}

export function buildPlaybookCoverageActionHref(gapKey: string): string {
  return `/playbook?gapKey=${encodeURIComponent(gapKey)}`;
}

export function getPlaybookCoverageHint(
  signalId: string,
  summary: PlaybookCoverageSummary,
): PlaybookCoverageHint | null {
  const gap = summary.gaps.find((candidate) => candidate.signalIds.includes(signalId));

  if (!gap) {
    return null;
  }

  if (gap.kind === "weak_coverage") {
    return {
      gap,
      tone: "warning",
      text: `This area is weakly covered in the playbook: ${gap.label}.`,
      actionHref: buildPlaybookCoverageActionHref(gap.key),
    };
  }

  return {
    gap,
    tone: gap.flag === "strong_outcomes" ? "neutral" : "warning",
    text:
      gap.flag === "strong_outcomes"
        ? `No playbook card exists yet for a high-value area: ${gap.label}.`
        : `No playbook card exists yet for this situation: ${gap.label}.`,
    actionHref: buildPlaybookCoverageActionHref(gap.key),
  };
}

export function buildPlaybookGapDetectedEvents(
  gaps: PlaybookCoverageGap[],
): AuditEventInput[] {
  return gaps.map((gap) => ({
    signalId: `playbook-gap:${gap.key}`,
    eventType: "PLAYBOOK_GAP_DETECTED",
    actor: "system",
    summary: `Playbook coverage gap detected: ${gap.compactSummary}`,
    metadata: {
      gapKind: gap.kind,
      flag: gap.flag,
      coverageArea: gap.label,
      signalCount: gap.signalCount,
      strongOutcomeCount: gap.strongOutcomeCount,
      weakOutcomeCount: gap.weakOutcomeCount,
      cautionCount: gap.cautionCount,
      cardCount: gap.cardCount,
    },
  }));
}
