import type { EvergreenSummary } from "@/lib/evergreen";
import type { ExperimentProposalInsights } from "@/lib/experiment-proposals";
import type { NarrativeSequenceInsights } from "@/lib/narrative-sequences";
import type { PlaybookCoverageGap, PlaybookCoverageSummary } from "@/lib/playbook-coverage";
import type { SourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import type { AudienceMemoryState } from "@/lib/audience-memory";
import type { RevenueSignalInsights } from "@/lib/revenue-signals";
import {
  getRecommendationFamilyForOptimisation,
  getRecommendationWeight,
  type RecommendationTuningState,
} from "@/lib/recommendation-tuning";
import type { WeeklyRecap, WeeklyRecapItem, WeeklyRecapItemType } from "@/lib/weekly-recap";
import type { WeeklyPostingPack } from "@/lib/weekly-posting-pack";

export const FLYWHEEL_OPTIMISATION_CATEGORIES = [
  "do_more_of",
  "do_less_of",
  "pause",
  "reuse",
  "test_next",
  "rebalance",
  "repair_upstream",
] as const;

export const FLYWHEEL_OPTIMISATION_TARGET_TYPES = [
  "source",
  "pattern",
  "bundle",
  "editorial_mode",
  "platform",
  "destination",
  "cta_style",
  "asset_type",
  "weekly_mix",
  "sequence_type",
  "experiment",
] as const;

export const FLYWHEEL_OPTIMISATION_PRIORITIES = ["high", "medium", "low"] as const;

export type FlywheelOptimisationCategory = (typeof FLYWHEEL_OPTIMISATION_CATEGORIES)[number];
export type FlywheelOptimisationTargetType = (typeof FLYWHEEL_OPTIMISATION_TARGET_TYPES)[number];
export type FlywheelOptimisationPriority = (typeof FLYWHEEL_OPTIMISATION_PRIORITIES)[number];

export interface FlywheelOptimisationProposal {
  proposalId: string;
  category: FlywheelOptimisationCategory;
  targetType: FlywheelOptimisationTargetType;
  targetId: string | null;
  targetLabel: string;
  reason: string;
  supportingSignals: string[];
  suggestedAction: string;
  priority: FlywheelOptimisationPriority;
  href: string;
}

export interface FlywheelOptimisationState {
  generatedAt: string;
  summary: string[];
  proposalCount: number;
  highPriorityCount: number;
  highestPriorityProposal: FlywheelOptimisationProposal | null;
  topProposals: FlywheelOptimisationProposal[];
  grouped: Record<FlywheelOptimisationCategory, FlywheelOptimisationProposal[]>;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function priorityWeight(priority: FlywheelOptimisationPriority): number {
  switch (priority) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function emptyGrouped(): Record<FlywheelOptimisationCategory, FlywheelOptimisationProposal[]> {
  return {
    do_more_of: [],
    do_less_of: [],
    pause: [],
    reuse: [],
    test_next: [],
    rebalance: [],
    repair_upstream: [],
  };
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

export function getFlywheelOptimisationCategoryLabel(category: FlywheelOptimisationCategory): string {
  switch (category) {
    case "do_more_of":
      return "Do More";
    case "do_less_of":
      return "Do Less";
    case "pause":
      return "Pause";
    case "reuse":
      return "Reuse";
    case "test_next":
      return "Test Next";
    case "rebalance":
      return "Rebalance";
    case "repair_upstream":
    default:
      return "Repair Upstream";
  }
}

export function getFlywheelOptimisationTargetTypeLabel(targetType: FlywheelOptimisationTargetType): string {
  switch (targetType) {
    case "editorial_mode":
      return "Editorial mode";
    case "cta_style":
      return "CTA style";
    case "asset_type":
      return "Asset type";
    case "weekly_mix":
      return "Weekly mix";
    case "sequence_type":
      return "Sequence";
    default:
      return targetType.replaceAll("_", " ");
  }
}

function mapWeeklyItemTypeToTargetType(type: WeeklyRecapItemType): FlywheelOptimisationTargetType {
  switch (type) {
    case "mode":
      return "editorial_mode";
    case "platform":
      return "platform";
    case "pattern":
      return "pattern";
    case "bundle":
      return "bundle";
    case "destination":
      return "destination";
    case "source":
      return "source";
    case "experiment":
    default:
      return "experiment";
  }
}

function buildRecapSupportingSignals(item: WeeklyRecapItem): string[] {
  const signals: string[] = [];
  uniquePush(signals, `${item.judgedPostCount} judged post${item.judgedPostCount === 1 ? "" : "s"}`);
  uniquePush(signals, `weekly score ${item.score}`);
  uniquePush(signals, item.reason);
  return signals.slice(0, 3);
}

function buildWinnerSuggestedAction(item: WeeklyRecapItem): string {
  switch (item.type) {
    case "platform":
      return `Give ${item.label} another high-quality slot in the next weekly pack.`;
    case "mode":
      return `Bias the next weekly plan toward ${item.label} when the signal matches.`;
    case "destination":
      return `Pair more trust-aligned posts with ${item.label}.`;
    case "source":
      return `Feed more review candidates from ${item.label} while the quality signal stays stable.`;
    case "bundle":
    case "pattern":
      return `Reuse ${item.label} in the next fresh generation pass.`;
    case "experiment":
    default:
      return `Carry ${item.label} into the next bounded experiment or review cycle.`;
  }
}

function buildPauseSuggestedAction(item: WeeklyRecapItem): string {
  switch (item.type) {
    case "destination":
      return `Reduce or pause ${item.label} until the destination signal recovers.`;
    case "source":
      return `Trim this source family until stronger strategic value returns.`;
    case "platform":
      return `Reduce near-term volume on ${item.label} and re-check next week.`;
    case "mode":
      return `Use ${item.label} more selectively next week.`;
    case "pattern":
    case "bundle":
      return `Pause this structure for now and route attention to stronger winners.`;
    case "experiment":
    default:
      return `Pause this learning path until the evidence improves.`;
  }
}

function buildCoverageGapHref(gap: PlaybookCoverageGap): string {
  if (gap.relatedBundleIds[0]) {
    return `/pattern-bundles/${gap.relatedBundleIds[0]}`;
  }

  if (gap.relatedPatternIds[0]) {
    return `/patterns/${gap.relatedPatternIds[0]}`;
  }

  return "/insights";
}

function buildCoverageGapTargetType(gap: PlaybookCoverageGap): FlywheelOptimisationTargetType {
  if (gap.relatedBundleIds[0]) {
    return "bundle";
  }

  if (gap.relatedPatternIds[0]) {
    return "pattern";
  }

  return "weekly_mix";
}

function createProposal(input: Omit<FlywheelOptimisationProposal, "proposalId">): FlywheelOptimisationProposal {
  const proposalId = `flywheel-${slugify(`${input.category}-${input.targetType}-${input.targetLabel}`)}`;
  return {
    ...input,
    proposalId,
    supportingSignals: input.supportingSignals.slice(0, 4),
  };
}

function mergeProposal(existing: FlywheelOptimisationProposal, next: FlywheelOptimisationProposal): FlywheelOptimisationProposal {
  const supportingSignals = [...existing.supportingSignals];
  for (const signal of next.supportingSignals) {
    uniquePush(supportingSignals, signal);
  }

  return priorityWeight(next.priority) > priorityWeight(existing.priority)
    ? {
        ...next,
        supportingSignals: supportingSignals.slice(0, 4),
      }
    : {
        ...existing,
        supportingSignals: supportingSignals.slice(0, 4),
      };
}

function sortProposals(
  proposals: FlywheelOptimisationProposal[],
  tuning?: RecommendationTuningState | null,
): FlywheelOptimisationProposal[] {
  return [...proposals].sort(
    (left, right) =>
      priorityWeight(right.priority) +
        (getRecommendationWeight(
          tuning,
          getRecommendationFamilyForOptimisation({
            category: right.category,
            targetType: right.targetType,
            targetLabel: right.targetLabel,
          }),
        ) - 1) -
        (priorityWeight(left.priority) +
          (getRecommendationWeight(
            tuning,
            getRecommendationFamilyForOptimisation({
              category: left.category,
              targetType: left.targetType,
              targetLabel: left.targetLabel,
            }),
          ) - 1)) ||
      left.targetLabel.localeCompare(right.targetLabel) ||
      left.category.localeCompare(right.category),
  );
}

function pushProposal(
  map: Map<string, FlywheelOptimisationProposal>,
  proposal: FlywheelOptimisationProposal | null,
) {
  if (!proposal) {
    return;
  }

  const key = `${proposal.category}:${proposal.targetType}:${proposal.targetLabel.toLowerCase()}`;
  const existing = map.get(key);
  map.set(key, existing ? mergeProposal(existing, proposal) : proposal);
}

function buildRecapProposals(
  proposals: Map<string, FlywheelOptimisationProposal>,
  recap: WeeklyRecap,
) {
  for (const item of recap.winners.slice(0, 2)) {
    pushProposal(
      proposals,
      createProposal({
        category: "do_more_of",
        targetType: mapWeeklyItemTypeToTargetType(item.type),
        targetId: item.id,
        targetLabel: item.label,
        reason: item.reason,
        supportingSignals: buildRecapSupportingSignals(item),
        suggestedAction: buildWinnerSuggestedAction(item),
        priority: item.score >= 8 ? "high" : "medium",
        href: item.href ?? "/recap",
      }),
    );
  }

  for (const item of recap.reuseCandidates.slice(0, 2)) {
    pushProposal(
      proposals,
      createProposal({
        category: "reuse",
        targetType: mapWeeklyItemTypeToTargetType(item.type),
        targetId: item.id,
        targetLabel: item.label,
        reason: item.reason,
        supportingSignals: buildRecapSupportingSignals(item),
        suggestedAction: `Reuse ${item.label} in next week's planning and review suggestions.`,
        priority: item.score >= 6 ? "high" : "medium",
        href: item.href ?? "/recap",
      }),
    );
  }

  for (const item of recap.pauseCandidates.slice(0, 2)) {
    pushProposal(
      proposals,
      createProposal({
        category: "pause",
        targetType: mapWeeklyItemTypeToTargetType(item.type),
        targetId: item.id,
        targetLabel: item.label,
        reason: item.reason,
        supportingSignals: buildRecapSupportingSignals(item),
        suggestedAction: buildPauseSuggestedAction(item),
        priority: item.score <= -6 ? "high" : "medium",
        href: item.href ?? "/recap",
      }),
    );
  }

  for (const item of recap.underperformers.slice(0, 2)) {
    pushProposal(
      proposals,
      createProposal({
        category: "do_less_of",
        targetType: mapWeeklyItemTypeToTargetType(item.type),
        targetId: item.id,
        targetLabel: item.label,
        reason: item.reason,
        supportingSignals: buildRecapSupportingSignals(item),
        suggestedAction: `Reduce near-term volume or ranking pressure for ${item.label}.`,
        priority: item.score <= -5 ? "high" : "medium",
        href: item.href ?? "/recap",
      }),
    );
  }
}

function buildSourceProposalCategory(
  proposalType: SourceAutopilotV2State["proposals"][number]["proposalType"],
): FlywheelOptimisationCategory {
  switch (proposalType) {
    case "pause_source":
      return "pause";
    case "resume_source":
    case "increase_max_items":
      return "do_more_of";
    case "reduce_max_items":
    case "reduce_source_family_cap":
      return "do_less_of";
    case "rewrite_query":
    case "increase_source_family_cap":
    default:
      return "repair_upstream";
  }
}

function buildSourceAutopilotProposals(
  proposals: Map<string, FlywheelOptimisationProposal>,
  sourceAutopilotState: SourceAutopilotV2State | null | undefined,
) {
  const openSourceProposals = (sourceAutopilotState?.proposals ?? [])
    .filter((proposal) => proposal.status === "open")
    .slice(0, 3);

  for (const sourceProposal of openSourceProposals) {
    pushProposal(
      proposals,
      createProposal({
        category: buildSourceProposalCategory(sourceProposal.proposalType),
        targetType: "source",
        targetId: sourceProposal.sourceId,
        targetLabel: sourceProposal.scopeLabel,
        reason: sourceProposal.reason,
        supportingSignals: sourceProposal.supportingSignals,
        suggestedAction: sourceProposal.changeSummary,
        priority:
          sourceProposal.proposalType === "pause_source" || sourceProposal.proposalType === "rewrite_query"
            ? "high"
            : sourceProposal.confidenceLevel === "high"
              ? "medium"
              : "low",
        href: sourceProposal.sourceId ? `/ingestion#source-${sourceProposal.sourceId}` : "/ingestion",
      }),
    );
  }
}

function buildCoverageGapProposals(
  proposals: Map<string, FlywheelOptimisationProposal>,
  coverageSummary: PlaybookCoverageSummary | null | undefined,
) {
  const orderedGaps = [
    ...(coverageSummary?.groupedGaps.uncovered ?? []),
    ...(coverageSummary?.groupedGaps.weakCoverage ?? []),
    ...(coverageSummary?.groupedGaps.opportunity ?? []),
  ]
    .sort((left, right) => right.importanceScore - left.importanceScore || left.label.localeCompare(right.label))
    .slice(0, 3);

  for (const gap of orderedGaps) {
    pushProposal(
      proposals,
      createProposal({
        category: gap.kind === "opportunity" ? "reuse" : "repair_upstream",
        targetType: buildCoverageGapTargetType(gap),
        targetId: gap.relatedBundleIds[0] ?? gap.relatedPatternIds[0] ?? gap.key,
        targetLabel: gap.label,
        reason: gap.whyFlagged,
        supportingSignals: [
          gap.compactSummary,
          `${gap.signalCount} linked signal${gap.signalCount === 1 ? "" : "s"}`,
          `${gap.cardCount} playbook card${gap.cardCount === 1 ? "" : "s"}`,
        ],
        suggestedAction: gap.suggestedAction,
        priority: gap.importanceScore >= 5 ? "high" : "medium",
        href: buildCoverageGapHref(gap),
      }),
    );
  }
}

function buildExperimentProposals(
  proposals: Map<string, FlywheelOptimisationProposal>,
  experimentProposalInsights: ExperimentProposalInsights | null | undefined,
) {
  for (const proposal of experimentProposalInsights?.openProposals.slice(0, 2) ?? []) {
    pushProposal(
      proposals,
      createProposal({
        category: "test_next",
        targetType: "experiment",
        targetId: proposal.proposalId,
        targetLabel: proposal.sourceTitle,
        reason: proposal.whyProposed,
        supportingSignals: [
          proposal.expectedLearningGoal,
          `${proposal.candidateVariants.length} bounded variant${proposal.candidateVariants.length === 1 ? "" : "s"}`,
          proposal.comparisonTarget ?? "No prior comparison target recorded yet.",
        ],
        suggestedAction: `Run ${proposal.experimentType.replaceAll("_", " ")} next and review the result in experiments.`,
        priority: "medium",
        href: proposal.reviewHref,
      }),
    );
  }
}

function buildWeeklyMixProposals(
  proposals: Map<string, FlywheelOptimisationProposal>,
  weeklyPostingPack: WeeklyPostingPack | null | undefined,
  evergreenSummary: EvergreenSummary | null | undefined,
  narrativeSequenceInsights: NarrativeSequenceInsights | null | undefined,
) {
  if (
    weeklyPostingPack &&
    weeklyPostingPack.items.length > 0 &&
    weeklyPostingPack.includedEvergreenCount === 0 &&
    (evergreenSummary?.candidates.length ?? 0) > 0
  ) {
    pushProposal(
      proposals,
      createProposal({
        category: "rebalance",
        targetType: "weekly_mix",
        targetId: "fresh-vs-evergreen",
        targetLabel: "Fresh vs evergreen mix",
        reason: "The current weekly pack is all fresh even though reusable evergreen winners are available.",
        supportingSignals: [
          `${weeklyPostingPack.items.length} pack item${weeklyPostingPack.items.length === 1 ? "" : "s"}`,
          `${evergreenSummary?.candidates.length ?? 0} evergreen candidate${(evergreenSummary?.candidates.length ?? 0) === 1 ? "" : "s"} available`,
          weeklyPostingPack.coverageSummary.summary,
        ],
        suggestedAction: "Reserve one slot for evergreen resurfacing in the next weekly pack.",
        priority: "medium",
        href: "/weekly-pack",
      }),
    );
  }

  if (weeklyPostingPack?.coverageSummary.underrepresented[0]) {
    pushProposal(
      proposals,
      createProposal({
        category: "rebalance",
        targetType: "weekly_mix",
        targetId: "underrepresented-lanes",
        targetLabel: "Weekly plan coverage gaps",
        reason: weeklyPostingPack.coverageSummary.underrepresented.join(" · "),
        supportingSignals: weeklyPostingPack.coverageSummary.notes.slice(0, 3),
        suggestedAction: "Use the weekly pack alternates to fill the underrepresented lane next.",
        priority: "medium",
        href: "/weekly-pack",
      }),
    );
  }

  if (weeklyPostingPack?.sequences[0]) {
    const sequence = weeklyPostingPack.sequences[0];
    pushProposal(
      proposals,
      createProposal({
        category: "do_more_of",
        targetType: "sequence_type",
        targetId: sequence.sequenceId,
        targetLabel: sequence.narrativeLabel,
        reason: sequence.sequenceReason,
        supportingSignals: [
          `${sequence.orderedSteps.length} sequenced step${sequence.orderedSteps.length === 1 ? "" : "s"}`,
          sequence.sequenceGoal,
          sequence.suggestedCadenceNotes,
        ],
        suggestedAction: "Keep this cross-platform arc intact instead of treating the posts as isolated items.",
        priority: "medium",
        href: "/weekly-pack",
      }),
    );
  } else if ((weeklyPostingPack?.items.length ?? 0) >= 3 && (narrativeSequenceInsights?.sequenceCount ?? 0) === 0) {
    pushProposal(
      proposals,
      createProposal({
        category: "test_next",
        targetType: "sequence_type",
        targetId: "cross-platform-arc",
        targetLabel: "2-step cross-platform arc",
        reason: "The weekly pack spans multiple platforms but no bounded narrative arc is being packaged yet.",
        supportingSignals: [
          `${weeklyPostingPack?.platformMix.length ?? 0} platforms already represented`,
          weeklyPostingPack?.coverageSummary.summary ?? "Weekly mix is ready for a small arc test.",
        ],
        suggestedAction: "Test a simple awareness-to-trust sequence in next week's pack.",
        priority: "low",
        href: "/weekly-pack",
      }),
    );
  }
}

function buildRevenueProposals(
  proposals: Map<string, FlywheelOptimisationProposal>,
  revenueInsights: RevenueSignalInsights | null | undefined,
) {
  if (revenueInsights?.topPatternRows[0]) {
    const row = revenueInsights.topPatternRows[0];
    pushProposal(
      proposals,
      createProposal({
        category: "do_more_of",
        targetType: "pattern",
        targetId: row.key,
        targetLabel: row.label,
        reason: `${row.label} is currently the strongest revenue-linked pattern or mode.`,
        supportingSignals: [
          `${row.count} revenue-linked signal${row.count === 1 ? "" : "s"}`,
          `${row.highStrengthCount} high-strength revenue outcome${row.highStrengthCount === 1 ? "" : "s"}`,
        ],
        suggestedAction: `Bias next week's ranking and planning slightly toward ${row.label} when the context matches.`,
        priority: row.highStrengthCount >= 2 ? "high" : "medium",
        href: "/insights",
      }),
    );
  }

  if (revenueInsights?.topDestinationRows[0]) {
    const row = revenueInsights.topDestinationRows[0];
    pushProposal(
      proposals,
      createProposal({
        category: "reuse",
        targetType: "destination",
        targetId: row.key,
        targetLabel: row.label,
        reason: `${row.label} is the destination most often tied to revenue signals.`,
        supportingSignals: [
          `${row.count} revenue-linked signal${row.count === 1 ? "" : "s"}`,
          `${row.highStrengthCount} high-strength revenue outcome${row.highStrengthCount === 1 ? "" : "s"}`,
        ],
        suggestedAction: `Reuse ${row.label} in trust or conversion-stage posts where the fit is already strong.`,
        priority: row.highStrengthCount >= 2 ? "high" : "medium",
        href: "/insights",
      }),
    );
  }
}

function buildAudienceProposals(
  proposals: Map<string, FlywheelOptimisationProposal>,
  audienceMemory: AudienceMemoryState | null | undefined,
) {
  const leadingSegment = audienceMemory?.segments[0];
  if (!leadingSegment) {
    return;
  }

  if (leadingSegment.strongestModes[0]) {
    pushProposal(
      proposals,
      createProposal({
        category: "do_more_of",
        targetType: "editorial_mode",
        targetId: leadingSegment.strongestModes[0].id,
        targetLabel: `${leadingSegment.strongestModes[0].label} for ${leadingSegment.segmentName}`,
        reason: leadingSegment.summary[0] ?? `${leadingSegment.segmentName} is responding best to this mode.`,
        supportingSignals: [
          leadingSegment.supportingOutcomeSignals[0] ?? `${leadingSegment.segmentName} has repeat audience support.`,
          `Top platform: ${leadingSegment.strongestPlatforms[0]?.label ?? "mixed"}`,
        ],
        suggestedAction: `Keep ${leadingSegment.segmentName} visible in planning with more ${leadingSegment.strongestModes[0].label.toLowerCase()} coverage.`,
        priority: "medium",
        href: "/plan",
      }),
    );
  }

  if (leadingSegment.toneCautions[0]) {
    pushProposal(
      proposals,
      createProposal({
        category: "do_less_of",
        targetType: "editorial_mode",
        targetId: null,
        targetLabel: `Audience caution for ${leadingSegment.segmentName}`,
        reason: leadingSegment.toneCautions[0],
        supportingSignals: leadingSegment.weakCombinations.slice(0, 2),
        suggestedAction: `Reduce sharper framing for ${leadingSegment.segmentName} and bias toward calmer, lower-pressure structure.`,
        priority: "medium",
        href: "/insights",
      }),
    );
  }
}

function buildSummary(state: {
  proposalCount: number;
  highestPriorityProposal: FlywheelOptimisationProposal | null;
  grouped: Record<FlywheelOptimisationCategory, FlywheelOptimisationProposal[]>;
}): string[] {
  const lines: string[] = [];
  uniquePush(lines, `${state.proposalCount} bounded optimisation proposal${state.proposalCount === 1 ? "" : "s"} are active right now.`);

  if (state.highestPriorityProposal) {
    uniquePush(
      lines,
      `Highest priority: ${state.highestPriorityProposal.targetLabel} (${getFlywheelOptimisationCategoryLabel(state.highestPriorityProposal.category).toLowerCase()}).`,
    );
  }

  const categoryWithMostItems = Object.entries(state.grouped)
    .map(([category, proposals]) => ({ category: category as FlywheelOptimisationCategory, count: proposals.length }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category))[0];

  if (categoryWithMostItems?.count > 0) {
    uniquePush(
      lines,
      `${getFlywheelOptimisationCategoryLabel(categoryWithMostItems.category)} is the strongest current optimisation lane.`,
    );
  }

  return lines.slice(0, 3);
}

export function buildFlywheelOptimisation(input: {
  weeklyRecap: WeeklyRecap;
  sourceAutopilotState?: SourceAutopilotV2State | null;
  playbookCoverageSummary?: PlaybookCoverageSummary | null;
  weeklyPostingPack?: WeeklyPostingPack | null;
  evergreenSummary?: EvergreenSummary | null;
  experimentProposalInsights?: ExperimentProposalInsights | null;
  narrativeSequenceInsights?: NarrativeSequenceInsights | null;
  revenueInsights?: RevenueSignalInsights | null;
  audienceMemory?: AudienceMemoryState | null;
  recommendationTuning?: RecommendationTuningState | null;
  now?: Date;
}): FlywheelOptimisationState {
  const proposalMap = new Map<string, FlywheelOptimisationProposal>();

  buildRecapProposals(proposalMap, input.weeklyRecap);
  buildSourceAutopilotProposals(proposalMap, input.sourceAutopilotState);
  buildCoverageGapProposals(proposalMap, input.playbookCoverageSummary);
  buildExperimentProposals(proposalMap, input.experimentProposalInsights);
  buildWeeklyMixProposals(
    proposalMap,
    input.weeklyPostingPack,
    input.evergreenSummary,
    input.narrativeSequenceInsights,
  );
  buildRevenueProposals(proposalMap, input.revenueInsights);
  buildAudienceProposals(proposalMap, input.audienceMemory);

  const proposals = sortProposals(Array.from(proposalMap.values()), input.recommendationTuning).slice(0, 14);
  const grouped = emptyGrouped();
  for (const proposal of proposals) {
    grouped[proposal.category].push(proposal);
  }

  const highestPriorityProposal = proposals[0] ?? null;
  const highPriorityCount = proposals.filter((proposal) => proposal.priority === "high").length;

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    summary: buildSummary({
      proposalCount: proposals.length,
      highestPriorityProposal,
      grouped,
    }),
    proposalCount: proposals.length,
    highPriorityCount,
    highestPriorityProposal,
    topProposals: proposals.slice(0, 5),
    grouped,
  };
}
