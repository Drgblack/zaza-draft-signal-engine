export const REVIEW_COMMAND_CENTER_VIEW_IDS = [
  "all",
  "ready_to_approve",
  "stale",
  "needs_judgement",
  "missing_outcomes",
  "experiment_linked",
  "fatigued",
  "campaign_critical",
  "evergreen_candidates",
  "auto_repaired",
] as const;

export type ReviewCommandCenterViewId = (typeof REVIEW_COMMAND_CENTER_VIEW_IDS)[number];

export type ReviewCommandCenterViewDefinition = {
  id: ReviewCommandCenterViewId;
  label: string;
  summary: string;
  sectionId: string;
};

export const REVIEW_COMMAND_CENTER_VIEWS: ReviewCommandCenterViewDefinition[] = [
  {
    id: "all",
    label: "All review work",
    summary: "Full command center with all active review lanes.",
    sectionId: "approval-ready",
  },
  {
    id: "ready_to_approve",
    label: "Ready to approve",
    summary: "Near-finished candidates with light friction left.",
    sectionId: "approval-ready",
  },
  {
    id: "stale",
    label: "Stale queue",
    summary: "Aging or stale candidates that now need a refresh, downgrade, or later resurfacing call.",
    sectionId: "approval-ready",
  },
  {
    id: "needs_judgement",
    label: "Needs judgement",
    summary: "Held, borderline, or conflict-heavy items that still need an operator call.",
    sectionId: "borderline-workbench",
  },
  {
    id: "missing_outcomes",
    label: "Missing outcomes",
    summary: "Strong ideas that still need clearer expected-outcome support.",
    sectionId: "approval-ready",
  },
  {
    id: "experiment_linked",
    label: "Experiment-linked",
    summary: "Candidates already attached to active learning loops.",
    sectionId: "approval-ready",
  },
  {
    id: "fatigued",
    label: "Fatigued",
    summary: "Items with cadence or CTA fatigue warnings.",
    sectionId: "approval-ready",
  },
  {
    id: "campaign_critical",
    label: "Campaign-critical",
    summary: "Candidates helping active campaign pressure or weekly mix.",
    sectionId: "approval-ready",
  },
  {
    id: "evergreen_candidates",
    label: "Evergreen candidates",
    summary: "Reusable winners worth resurfacing into the current plan.",
    sectionId: "evergreen-resurfacing",
  },
  {
    id: "auto_repaired",
    label: "Auto-repaired",
    summary: "Near-miss candidates improved by bounded repair logic.",
    sectionId: "approval-ready",
  },
];

export function normalizeReviewCommandCenterView(
  value: string | null | undefined,
): ReviewCommandCenterViewId {
  return REVIEW_COMMAND_CENTER_VIEWS.some((entry) => entry.id === value)
    ? (value as ReviewCommandCenterViewId)
    : "all";
}

export function matchesApprovalCandidateView(
  candidate: {
    completeness: { completenessState: "complete" | "mostly_complete" | "incomplete" };
    fatigue: { warnings: Array<unknown> };
    expectedOutcome: { expectedOutcomeTier: "high" | "medium" | "low"; riskSignals: string[] };
    stale?: { state: "fresh" | "aging" | "stale" | "stale_but_reusable" | "stale_needs_refresh" } | null;
    automationConfidence?: { level: "high" | "medium" | "low"; requiresOperatorJudgement: boolean } | null;
    conflicts?: {
      conflicts: Array<unknown>;
      requiresJudgement: boolean;
      highestSeverity: "low" | "medium" | "high" | null;
    } | null;
    rankReasons: string[];
  },
  view: ReviewCommandCenterViewId,
  options?: {
    experimentCount?: number;
    hasRepair?: boolean;
  },
): boolean {
  const experimentCount = options?.experimentCount ?? 0;
  const hasRepair = options?.hasRepair ?? false;

  switch (view) {
    case "all":
      return true;
    case "ready_to_approve":
      return (
        candidate.completeness.completenessState !== "incomplete" &&
        candidate.fatigue.warnings.length === 0 &&
        candidate.expectedOutcome.expectedOutcomeTier !== "low" &&
        (candidate.stale?.state ?? "fresh") === "fresh"
      );
    case "stale":
      return (candidate.stale?.state ?? "fresh") !== "fresh";
    case "needs_judgement":
      return (candidate.conflicts?.requiresJudgement ?? false) || (candidate.automationConfidence?.requiresOperatorJudgement ?? false);
    case "missing_outcomes":
      return (
        candidate.expectedOutcome.expectedOutcomeTier === "low" ||
        candidate.expectedOutcome.riskSignals.some((value) => value.toLowerCase().includes("evidence"))
      );
    case "experiment_linked":
      return experimentCount > 0;
    case "fatigued":
      return candidate.fatigue.warnings.length > 0;
    case "campaign_critical":
      return candidate.rankReasons.some((value) => value.toLowerCase().includes("campaign"));
    case "auto_repaired":
      return hasRepair;
    default:
      return true;
  }
}

export function getReviewStateBadgeClasses(
  state:
    | "high_confidence"
    | "medium_confidence"
    | "low_confidence"
    | "complete"
    | "mostly_complete"
    | "partial"
    | "high_value"
    | "medium_value"
    | "low_value"
    | "fatigue_low"
    | "fatigue_moderate"
    | "ready"
    | "needs_edit"
    | "skip"
    | "posted"
    | "experiment"
    | "autofill"
    | "aging"
    | "stale"
    | "stale_reusable"
    | "neutral",
): string {
  switch (state) {
    case "high_confidence":
    case "high_value":
    case "complete":
    case "ready":
    case "posted":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "medium_confidence":
    case "mostly_complete":
    case "medium_value":
    case "experiment":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "low_confidence":
    case "low_value":
    case "partial":
    case "fatigue_moderate":
    case "needs_edit":
    case "aging":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "stale_reusable":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "stale":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "skip":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "fatigue_low":
    case "autofill":
    case "neutral":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

type DraftDiffFragment = {
  text: string;
  changed: boolean;
};

export type DraftDiffSummary = {
  changed: boolean;
  changedWordCount: number;
  beforeFragments: DraftDiffFragment[];
  afterFragments: DraftDiffFragment[];
  beforeChangedText: string;
  afterChangedText: string;
};

function tokenizeDraft(value: string): string[] {
  return value.match(/\s+|[^\s]+/g) ?? [];
}

function countWordTokens(tokens: string[]): number {
  return tokens.filter((token) => token.trim().length > 0).length;
}

function toFragments(prefix: string[], changed: string[], suffix: string[]): DraftDiffFragment[] {
  return [
    ...(prefix.length > 0 ? [{ text: prefix.join(""), changed: false }] : []),
    ...(changed.length > 0 ? [{ text: changed.join(""), changed: true }] : []),
    ...(suffix.length > 0 ? [{ text: suffix.join(""), changed: false }] : []),
  ];
}

export function buildDraftDiffSummary(before: string, after: string): DraftDiffSummary {
  const beforeTokens = tokenizeDraft(before);
  const afterTokens = tokenizeDraft(after);

  if (beforeTokens.join("") === afterTokens.join("")) {
    return {
      changed: false,
      changedWordCount: 0,
      beforeFragments: [{ text: before, changed: false }],
      afterFragments: [{ text: after, changed: false }],
      beforeChangedText: "",
      afterChangedText: "",
    };
  }

  let prefixLength = 0;
  while (
    prefixLength < beforeTokens.length &&
    prefixLength < afterTokens.length &&
    beforeTokens[prefixLength] === afterTokens[prefixLength]
  ) {
    prefixLength += 1;
  }

  let beforeSuffixIndex = beforeTokens.length - 1;
  let afterSuffixIndex = afterTokens.length - 1;
  while (
    beforeSuffixIndex >= prefixLength &&
    afterSuffixIndex >= prefixLength &&
    beforeTokens[beforeSuffixIndex] === afterTokens[afterSuffixIndex]
  ) {
    beforeSuffixIndex -= 1;
    afterSuffixIndex -= 1;
  }

  const prefixBefore = beforeTokens.slice(0, prefixLength);
  const prefixAfter = afterTokens.slice(0, prefixLength);
  const changedBefore = beforeTokens.slice(prefixLength, beforeSuffixIndex + 1);
  const changedAfter = afterTokens.slice(prefixLength, afterSuffixIndex + 1);
  const suffixBefore = beforeTokens.slice(beforeSuffixIndex + 1);
  const suffixAfter = afterTokens.slice(afterSuffixIndex + 1);

  return {
    changed: true,
    changedWordCount: countWordTokens(changedBefore) + countWordTokens(changedAfter),
    beforeFragments: toFragments(prefixBefore, changedBefore, suffixBefore),
    afterFragments: toFragments(prefixAfter, changedAfter, suffixAfter),
    beforeChangedText: changedBefore.join("").trim(),
    afterChangedText: changedAfter.join("").trim(),
  };
}
