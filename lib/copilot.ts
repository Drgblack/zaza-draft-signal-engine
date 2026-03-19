import { suggestEditorialMode } from "@/lib/editorial-modes";
import { buildFeedbackContextForSignal, type FeedbackContextNote } from "@/lib/feedback-insights";
import type { SignalFeedback } from "@/lib/feedback-definitions";
import type { PatternBundleSummary } from "@/lib/pattern-bundles";
import { findSuggestedPatterns } from "@/lib/pattern-match";
import type { PatternSummary, SignalPattern } from "@/lib/pattern-definitions";
import { type PatternEffectivenessSummary, toPatternSummary } from "@/lib/patterns";
import type { PlaybookCard, PlaybookCardMatch } from "@/lib/playbook-card-definitions";
import { findRelatedPlaybookCards } from "@/lib/playbook-cards";
import {
  getPlaybookCoverageHint,
  type PlaybookCoverageHint,
  type PlaybookCoverageSummary,
} from "@/lib/playbook-coverage";
import { buildReuseMemorySummary, type ReuseMemoryCase, type ReuseMemorySummary } from "@/lib/reuse-memory";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import { getSourceProfile } from "@/lib/source-profiles";
import {
  getCopilotConservatismConfig,
  type OperatorTuningSettings,
} from "@/lib/tuning";
import { assessTransformability } from "@/lib/transformability";
import { hasGeneration, hasInterpretation, hasScoring, isFilteredOutSignal } from "@/lib/workflow";
import type { EditorialMode, SignalRecord } from "@/types/signal";

export type CopilotGuidanceTone = "success" | "warning" | "neutral";
export type CopilotGuidanceReadiness = "ready" | "blocked" | "review" | "done" | "parked";
export type CopilotActionKey =
  | "score"
  | "shape_scenario"
  | "interpret"
  | "generate"
  | "review"
  | "schedule"
  | "post"
  | "none";

export interface CopilotGuidance {
  actionKey: CopilotActionKey;
  nextAction: string;
  shortLabel: string;
  reason: string;
  blockers: string[];
  readiness: CopilotGuidanceReadiness;
  tone: CopilotGuidanceTone;
  actionHref: string | null;
  feedbackContext: FeedbackContextNote[];
  patternSuggestions: Array<{
    pattern: PatternSummary;
    reason: string;
    effectivenessHint: string | null;
    score: number;
    bundles: PatternBundleSummary[];
  }>;
  playbookCards: PlaybookCardMatch[];
  suggestedEditorialMode: {
    mode: EditorialMode;
    reason: string;
  } | null;
  reuseMemory: ReuseMemorySummary;
  playbookCoverageHint: PlaybookCoverageHint | null;
}

function buildSignalHref(signal: SignalRecord, suffix?: string): string {
  return suffix ? `/signals/${signal.recordId}/${suffix}` : `/signals/${signal.recordId}`;
}

function highPotential(signal: SignalRecord): boolean {
  return (
    signal.keepRejectRecommendation === "Keep" &&
    signal.qualityGateResult === "Pass" &&
    (signal.reviewPriority === "High" || signal.reviewPriority === "Urgent")
  );
}

function emptyPatternSuggestions(): CopilotGuidance["patternSuggestions"] {
  return [];
}

function emptyPlaybookCards(): PlaybookCardMatch[] {
  return [];
}

function emptyReuseMemory(): ReuseMemorySummary {
  return {
    highlights: [],
    positiveCount: 0,
    cautionCount: 0,
    neutralCount: 0,
  };
}

function emptyPlaybookCoverageHint(): PlaybookCoverageHint | null {
  return null;
}

function buildSuggestedEditorialMode(signal: SignalRecord): CopilotGuidance["suggestedEditorialMode"] {
  const suggestion = suggestEditorialMode(signal);

  return {
    mode: suggestion.mode,
    reason: suggestion.reason,
  };
}

function toCopilotPatternSuggestions(
  signal: SignalRecord,
  patterns: SignalPattern[] | undefined,
  bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>,
  patternEffectivenessById?: Record<string, PatternEffectivenessSummary>,
  tuning?: OperatorTuningSettings,
): CopilotGuidance["patternSuggestions"] {
  if (!patterns || patterns.length === 0) {
    return emptyPatternSuggestions();
  }

  return findSuggestedPatterns(signal, patterns, {
    limit: 3,
    bundleSummariesByPatternId,
    effectivenessById: patternEffectivenessById,
    tuning,
  }).map((suggestion) => ({
    pattern: toPatternSummary(suggestion.pattern)!,
    reason: suggestion.reason,
    effectivenessHint: suggestion.effectivenessHint,
    score: suggestion.score,
    bundles: suggestion.bundleSummaries,
  }));
}

function toCopilotPlaybookCards(input: {
  signal: SignalRecord;
  cards?: PlaybookCard[];
  editorialMode?: EditorialMode | null;
  patternSuggestions: CopilotGuidance["patternSuggestions"];
}): PlaybookCardMatch[] {
  if (!input.cards || input.cards.length === 0) {
    return emptyPlaybookCards();
  }

  return findRelatedPlaybookCards({
    signal: input.signal,
    cards: input.cards,
    editorialMode: input.editorialMode,
    patternIds: input.patternSuggestions.map((suggestion) => suggestion.pattern.id),
    bundleIds: input.patternSuggestions.flatMap((suggestion) => suggestion.bundles.map((bundle) => bundle.id)),
    familyLabels: [
      input.signal.signalCategory?.toLowerCase() ?? "",
      input.signal.signalSubtype?.toLowerCase() ?? "",
    ].filter(Boolean),
    limit: 2,
  });
}

export function getCopilotGuidance(
  signal: SignalRecord,
  tuning?: OperatorTuningSettings,
): CopilotGuidance {
  const copilotTuning = getCopilotConservatismConfig(tuning);
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const transformability = assessTransformability(signal, tuning);
  const sourceProfile = getSourceProfile(signal);
  const scoringReady = hasScoring(signal);
  const interpretationReady = hasInterpretation(signal);
  const generationReady = hasGeneration(signal);
  const indirectSignal = transformability.isIndirectSource || sourceProfile.id === "feed-policy-news" || sourceProfile.id === "formal-report";

  if (signal.status === "Archived") {
    return {
      actionKey: "none",
      nextAction: "Archived - no further action",
      shortLabel: "Archived",
      reason: "This record has already been archived and does not need more editorial work.",
      blockers: [],
      readiness: "done",
      tone: "neutral",
      actionHref: buildSignalHref(signal),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (signal.status === "Posted") {
    return {
      actionKey: "none",
      nextAction: "Posted - logging complete",
      shortLabel: "Posted",
      reason: "This record is already marked as posted. Only follow-up review is left if you want to analyse performance later.",
      blockers: [],
      readiness: "done",
      tone: "neutral",
      actionHref: buildSignalHref(signal),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (isFilteredOutSignal(signal)) {
    return {
      actionKey: "none",
      nextAction: "Filtered out - no action recommended",
      shortLabel: "Filtered out",
      reason:
        signal.whyRejected ??
        "The current scoring and quality gate say this record is not worth further editorial effort right now.",
      blockers: [],
      readiness: "parked",
      tone: "neutral",
      actionHref: buildSignalHref(signal),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (signal.status === "Scheduled") {
    return {
      actionKey: "post",
      nextAction: "Ready to post or log posting",
      shortLabel: "Awaiting posting",
      reason: "This record is already scheduled. The next useful step is to log it as posted once it goes live.",
      blockers: [],
      readiness: "review",
      tone: "success",
      actionHref: buildSignalHref(signal),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (signal.status === "Approved") {
    return {
      actionKey: "schedule",
      nextAction: "Ready to schedule",
      shortLabel: "Ready to schedule",
      reason: "This record is approved and only needs a scheduled date before it moves into the posting queue.",
      blockers: [],
      readiness: "ready",
      tone: "success",
      actionHref: buildSignalHref(signal),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (generationReady) {
    return {
      actionKey: "review",
      nextAction: highPotential(signal) ? "High potential - review now" : "Ready for review",
      shortLabel: highPotential(signal) ? "Review now" : "Ready for review",
      reason: highPotential(signal)
        ? "Strong scoring and saved drafts make this a good immediate review candidate."
        : "Drafts already exist, so the next useful step is operator review and approval.",
      blockers: [],
      readiness: "review",
      tone: "success",
      actionHref: buildSignalHref(signal, "generate"),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (interpretationReady) {
    if (indirectSignal && (scenarioAssessment.quality === "missing" || scenarioAssessment.quality === "weak")) {
      if (copilotTuning.actionOriented) {
        return {
          actionKey: "generate",
          nextAction: "Borderline framing - generate cautiously",
          shortLabel: "Generate cautiously",
          reason:
            "Interpretation exists and current tuning is more action-oriented, so this can move into drafting, but the framing still needs a careful operator read.",
          blockers: ["Indirect source still has thin framing."],
          readiness: "review",
          tone: "warning",
          actionHref: buildSignalHref(signal, "generate"),
          feedbackContext: [],
          patternSuggestions: emptyPatternSuggestions(),
          playbookCards: emptyPlaybookCards(),
          suggestedEditorialMode: buildSuggestedEditorialMode(signal),
          reuseMemory: emptyReuseMemory(),
          playbookCoverageHint: emptyPlaybookCoverageHint(),
        };
      }

      return {
        actionKey: "shape_scenario",
        nextAction: copilotTuning.conservative
          ? "Tighten framing before generation"
          : "Generation may be generic - improve framing first",
        shortLabel: copilotTuning.conservative ? "Tighten framing" : "Improve framing",
        reason:
          copilotTuning.conservative
            ? "Interpretation exists, but current tuning is more cautious and this indirect source still needs stronger framing before draft generation."
            : "Interpretation exists, but this source is still indirect and the current scenario angle is too weak to shape strong scenario-led drafts.",
        blockers: ["Scenario Angle is missing or weak for an indirect source."],
        readiness: "blocked",
        tone: "warning",
        actionHref: buildSignalHref(signal, "interpret"),
        feedbackContext: [],
        patternSuggestions: emptyPatternSuggestions(),
        playbookCards: emptyPlaybookCards(),
        suggestedEditorialMode: buildSuggestedEditorialMode(signal),
        reuseMemory: emptyReuseMemory(),
        playbookCoverageHint: emptyPlaybookCoverageHint(),
      };
    }

    return {
      actionKey: "generate",
      nextAction: "Ready for generation",
      shortLabel: "Ready for generation",
      reason: "Interpretation is saved and the current framing looks strong enough to move into draft generation.",
      blockers: [],
      readiness: "ready",
      tone: "success",
      actionHref: buildSignalHref(signal, "generate"),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (!scoringReady) {
    return {
      actionKey: "score",
      nextAction: "Needs scoring first",
      shortLabel: "Needs scoring",
      reason: "This record has not been evaluated yet, so the queue cannot judge whether it is worth shaping or interpreting.",
      blockers: ["Scoring fields are still missing."],
      readiness: "blocked",
      tone: "warning",
      actionHref: buildSignalHref(signal),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (
    indirectSignal &&
    (scenarioAssessment.quality === "missing" || scenarioAssessment.quality === "weak") &&
    (signal.keepRejectRecommendation === "Keep" || signal.keepRejectRecommendation === "Review")
  ) {
    if (copilotTuning.actionOriented && signal.keepRejectRecommendation === "Keep") {
      return {
        actionKey: "interpret",
        nextAction: "Interpret, but strengthen the angle while you do it",
        shortLabel: "Interpret with care",
        reason:
          "The source is still indirect, but current tuning is more action-oriented and scoring is strong enough to keep moving if the operator sharpens framing during interpretation.",
        blockers: ["Indirect source still needs stronger scenario framing."],
        readiness: "review",
        tone: "warning",
        actionHref: buildSignalHref(signal, "interpret"),
        feedbackContext: [],
        patternSuggestions: emptyPatternSuggestions(),
        playbookCards: emptyPlaybookCards(),
        suggestedEditorialMode: buildSuggestedEditorialMode(signal),
        reuseMemory: emptyReuseMemory(),
        playbookCoverageHint: emptyPlaybookCoverageHint(),
      };
    }

    return {
      actionKey: "shape_scenario",
      nextAction: copilotTuning.conservative ? "Add a stronger Scenario Angle before interpreting" : "Needs stronger Scenario Angle",
      shortLabel: copilotTuning.conservative ? "Strengthen angle" : "Needs Scenario Angle",
      reason:
        copilotTuning.conservative
          ? "This source is relevant but indirect, and current tuning is more cautious, so stronger teacher communication framing should come before interpretation."
          : "This source is relevant but indirect. Add stronger teacher communication framing before interpretation so it becomes a usable Zaza-style scenario.",
      blockers: ["Indirect source needs stronger scenario framing."],
      readiness: "blocked",
      tone: "warning",
      actionHref: buildSignalHref(signal, "interpret"),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (signal.keepRejectRecommendation === "Keep" && signal.qualityGateResult === "Pass") {
    return {
      actionKey: "interpret",
      nextAction: "Ready for interpretation",
      shortLabel: "Ready to interpret",
      reason:
        scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable"
          ? "Scoring and framing are strong enough to move into interpretation."
          : "Scoring is strong enough to move into interpretation.",
      blockers: [],
      readiness: "ready",
      tone: "success",
      actionHref: buildSignalHref(signal, "interpret"),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  if (signal.keepRejectRecommendation === "Review" || signal.qualityGateResult === "Needs Review") {
    if (highPotential(signal) || signal.reviewPriority === "High" || signal.reviewPriority === "Urgent") {
      if (copilotTuning.conservative) {
        return {
          actionKey: "none",
          nextAction: "Borderline case - inspect before interpreting",
          shortLabel: "Inspect first",
          reason:
            "Queue priority is high, but current tuning is more cautious, so this borderline case should be checked manually before it moves into interpretation.",
          blockers: [],
          readiness: "review",
          tone: "warning",
          actionHref: buildSignalHref(signal),
          feedbackContext: [],
          patternSuggestions: emptyPatternSuggestions(),
          playbookCards: emptyPlaybookCards(),
          suggestedEditorialMode: buildSuggestedEditorialMode(signal),
          reuseMemory: emptyReuseMemory(),
          playbookCoverageHint: emptyPlaybookCoverageHint(),
        };
      }

      if (copilotTuning.actionOriented) {
        return {
          actionKey: "interpret",
          nextAction: "Borderline but worth interpreting now",
          shortLabel: "Interpret now",
          reason:
            scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable"
              ? "This record is still borderline, but stronger framing and queue priority make it worth interpreting now."
              : "This record is still borderline, but current tuning is more action-oriented and queue priority says it is worth interpreting now.",
          blockers: [],
          readiness: "ready",
          tone: "warning",
          actionHref: buildSignalHref(signal, "interpret"),
          feedbackContext: [],
          patternSuggestions: emptyPatternSuggestions(),
          playbookCards: emptyPlaybookCards(),
          suggestedEditorialMode: buildSuggestedEditorialMode(signal),
          reuseMemory: emptyReuseMemory(),
          playbookCoverageHint: emptyPlaybookCoverageHint(),
        };
      }

      return {
        actionKey: "interpret",
        nextAction: "High potential - review now",
        shortLabel: "High potential",
        reason:
          scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable"
            ? "The record is still borderline, but strong framing and queue priority make it worth operator attention now."
            : "The record is borderline, but queue priority says it is still worth operator attention now.",
        blockers: [],
        readiness: "review",
        tone: "warning",
        actionHref: buildSignalHref(signal, "interpret"),
        feedbackContext: [],
        patternSuggestions: emptyPatternSuggestions(),
        playbookCards: emptyPlaybookCards(),
        suggestedEditorialMode: buildSuggestedEditorialMode(signal),
        reuseMemory: emptyReuseMemory(),
        playbookCoverageHint: emptyPlaybookCoverageHint(),
      };
    }

    if (copilotTuning.actionOriented && (scenarioAssessment.quality === "strong" || scenarioAssessment.quality === "usable")) {
      return {
        actionKey: "interpret",
        nextAction: "Borderline, but workable if time allows",
        shortLabel: "Workable",
        reason:
          "The record is still borderline, but current framing looks usable enough to justify a lighter interpretation pass when capacity allows.",
        blockers: [],
        readiness: "review",
        tone: "neutral",
        actionHref: buildSignalHref(signal, "interpret"),
        feedbackContext: [],
        patternSuggestions: emptyPatternSuggestions(),
        playbookCards: emptyPlaybookCards(),
        suggestedEditorialMode: buildSuggestedEditorialMode(signal),
        reuseMemory: emptyReuseMemory(),
        playbookCoverageHint: emptyPlaybookCoverageHint(),
      };
    }

    return {
      actionKey: "none",
      nextAction: "Low value - leave in queue",
      shortLabel: "Leave in queue",
      reason:
        "This record is not filtered out, but current scoring suggests it is better to leave parked until stronger framing or stronger source evidence appears.",
      blockers: [],
      readiness: "parked",
      tone: "neutral",
      actionHref: buildSignalHref(signal),
      feedbackContext: [],
      patternSuggestions: emptyPatternSuggestions(),
      playbookCards: emptyPlaybookCards(),
      suggestedEditorialMode: buildSuggestedEditorialMode(signal),
      reuseMemory: emptyReuseMemory(),
      playbookCoverageHint: emptyPlaybookCoverageHint(),
    };
  }

  return {
    actionKey: "none",
    nextAction: "Review record state",
    shortLabel: "Needs review",
    reason: "This record does not fit a cleaner next-action rule yet, so it needs operator judgement.",
    blockers: [],
    readiness: "review",
    tone: "warning",
    actionHref: buildSignalHref(signal),
    feedbackContext: [],
    patternSuggestions: emptyPatternSuggestions(),
    playbookCards: emptyPlaybookCards(),
    suggestedEditorialMode: buildSuggestedEditorialMode(signal),
    reuseMemory: emptyReuseMemory(),
    playbookCoverageHint: emptyPlaybookCoverageHint(),
  };
}

export function getFeedbackAwareCopilotGuidance(
  signal: SignalRecord,
  options: {
    allSignals: SignalRecord[];
    feedbackEntries: SignalFeedback[];
    patterns?: SignalPattern[];
    bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>;
    patternEffectivenessById?: Record<string, PatternEffectivenessSummary>;
    playbookCards?: PlaybookCard[];
    reuseMemoryCases?: ReuseMemoryCase[];
    playbookCoverageSummary?: PlaybookCoverageSummary;
    tuning?: OperatorTuningSettings;
  },
): CopilotGuidance {
  const guidance = getCopilotGuidance(signal, options.tuning);
  const feedbackContext = buildFeedbackContextForSignal({
    signal,
    allSignals: options.allSignals,
    feedbackEntries: options.feedbackEntries,
    currentAction: guidance.actionKey,
  });
  const patternSuggestions = toCopilotPatternSuggestions(
    signal,
    options.patterns,
    options.bundleSummariesByPatternId,
    options.patternEffectivenessById,
    options.tuning,
  );
  const reuseMemory = buildReuseMemorySummary({
    signal,
    cases: options.reuseMemoryCases ?? [],
    editorialMode: signal.editorialMode ?? guidance.suggestedEditorialMode?.mode ?? null,
  });
  const playbookCards = toCopilotPlaybookCards({
    signal,
    cards: options.playbookCards,
    editorialMode: signal.editorialMode ?? guidance.suggestedEditorialMode?.mode ?? null,
    patternSuggestions,
  });
  const playbookCoverageHint = options.playbookCoverageSummary
    ? getPlaybookCoverageHint(signal.recordId, options.playbookCoverageSummary)
    : null;

  return {
    ...guidance,
    feedbackContext,
    patternSuggestions,
    playbookCards,
    reuseMemory,
    playbookCoverageHint,
  };
}

export function buildFeedbackAwareCopilotGuidanceMap(
  signals: SignalRecord[],
  feedbackEntries: SignalFeedback[],
  patterns?: SignalPattern[],
  bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>,
  patternEffectivenessById?: Record<string, PatternEffectivenessSummary>,
  playbookCards?: PlaybookCard[],
  reuseMemoryCases?: ReuseMemoryCase[],
  playbookCoverageSummary?: PlaybookCoverageSummary,
  tuning?: OperatorTuningSettings,
): Record<string, CopilotGuidance> {
  return Object.fromEntries(
    signals.map((signal) => [
      signal.recordId,
      getFeedbackAwareCopilotGuidance(signal, {
        allSignals: signals,
        feedbackEntries,
        patterns,
        bundleSummariesByPatternId,
        patternEffectivenessById,
        playbookCards,
        reuseMemoryCases,
        playbookCoverageSummary,
        tuning,
      }),
    ]),
  );
}
