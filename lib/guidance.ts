import { getFeedbackAwareCopilotGuidance, type CopilotGuidance } from "@/lib/copilot";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { SignalFeedback } from "@/lib/feedback-definitions";
import type { PatternEffectivenessSummary } from "@/lib/patterns";
import type { PlaybookCoverageSummary } from "@/lib/playbook-coverage";
import type { PlaybookCard } from "@/lib/playbook-card-definitions";
import type { PatternBundleSummary } from "@/lib/pattern-bundles";
import type { SignalPattern } from "@/lib/pattern-definitions";
import type { ReuseMemoryCase, ReuseMemoryHighlight } from "@/lib/reuse-memory";
import type { SignalRecord } from "@/types/signal";

export type GuidanceContext = "detail" | "interpretation" | "generation" | "review";
export type GuidanceTone = "success" | "warning" | "neutral";

export interface UnifiedGuidanceNote {
  label: string;
  text: string;
  tone: GuidanceTone;
}

export interface UnifiedGuidanceReuseItem {
  text: string;
  tone: "positive" | "caution" | "neutral";
  matchedOn: string[];
}

export interface UnifiedGuidanceSupportLink {
  title: string;
  reason: string;
  href: string;
}

export interface UnifiedGuidance {
  context: GuidanceContext;
  primaryAction: string;
  primaryReason: string;
  readinessState: CopilotGuidance["readiness"];
  tone: CopilotGuidance["tone"];
  actionHref: string | null;
  actionLabel: string | null;
  supportingSignals: UnifiedGuidanceNote[];
  reuseMemory: {
    highlights: UnifiedGuidanceReuseItem[];
  } | null;
  relatedPlaybookCards: UnifiedGuidanceSupportLink[];
  relatedPatterns: UnifiedGuidanceSupportLink[];
  relatedBundles: UnifiedGuidanceSupportLink[];
  gapWarnings: Array<
    UnifiedGuidanceNote & {
      href: string;
      hrefLabel: string;
    }
  >;
  cautionNotes: string[];
}

type GuidanceContextConfig = {
  reuseLimit: number;
  supportingSignalLimit: number;
  showGapWarning: boolean;
};

const GUIDANCE_CONTEXT_CONFIG: Record<GuidanceContext, GuidanceContextConfig> = {
  detail: {
    reuseLimit: 2,
    supportingSignalLimit: 3,
    showGapWarning: true,
  },
  interpretation: {
    reuseLimit: 1,
    supportingSignalLimit: 2,
    showGapWarning: true,
  },
  generation: {
    reuseLimit: 2,
    supportingSignalLimit: 2,
    showGapWarning: true,
  },
  review: {
    reuseLimit: 1,
    supportingSignalLimit: 2,
    showGapWarning: true,
  },
};

function supportToneFromFeedbackTone(tone: "success" | "warning" | "neutral"): GuidanceTone {
  return tone;
}

function selectReuseHighlights(
  highlights: ReuseMemoryHighlight[],
  limit: number,
): UnifiedGuidanceReuseItem[] {
  const caution = highlights.filter((highlight) => highlight.tone === "caution");
  const positive = highlights.filter((highlight) => highlight.tone === "positive");
  const neutral = highlights.filter((highlight) => highlight.tone === "neutral");
  const ordered: ReuseMemoryHighlight[] = [];

  if (caution[0]) {
    ordered.push(caution[0]);
  }

  if (positive[0] && ordered.every((existing) => existing.postingLogId !== positive[0].postingLogId)) {
    ordered.push(positive[0]);
  }

  for (const highlight of [...positive.slice(1), ...neutral, ...caution.slice(1)]) {
    if (ordered.some((existing) => existing.postingLogId === highlight.postingLogId)) {
      continue;
    }

    ordered.push(highlight);

    if (ordered.length >= limit) {
      break;
    }
  }

  return ordered.slice(0, limit).map((highlight) => ({
    text: highlight.text,
    tone: highlight.tone,
    matchedOn: highlight.matchedOn.slice(0, 2),
  }));
}

function buildSupportingSignals(
  guidance: CopilotGuidance,
  limit: number,
): UnifiedGuidanceNote[] {
  const notes: UnifiedGuidanceNote[] = [];

  if (guidance.feedbackContext[0]) {
    notes.push({
      label: "Past feedback",
      text: guidance.feedbackContext[0].text,
      tone: supportToneFromFeedbackTone(guidance.feedbackContext[0].tone),
    });
  }

  if (guidance.suggestedEditorialMode) {
    notes.push({
      label: "Suggested mode",
      text: `${getEditorialModeDefinition(guidance.suggestedEditorialMode.mode).label}. ${guidance.suggestedEditorialMode.reason}`,
      tone: "neutral",
    });
  }

  if (guidance.patternSuggestions[0]?.effectivenessHint) {
    notes.push({
      label: "Pattern note",
      text: guidance.patternSuggestions[0].effectivenessHint,
      tone:
        guidance.patternSuggestions[0].effectivenessHint.toLowerCase().includes("refin") ||
        guidance.patternSuggestions[0].effectivenessHint.toLowerCase().includes("weak")
          ? "warning"
          : "neutral",
    });
  }

  return notes.slice(0, limit);
}

function buildPlaybookSupport(guidance: CopilotGuidance): UnifiedGuidanceSupportLink[] {
  const topCard = guidance.playbookCards[0];

  if (!topCard) {
    return [];
  }

  return [
    {
      title: topCard.card.title,
      reason: topCard.reason,
      href: `/playbook/${topCard.card.id}`,
    },
  ];
}

function buildPatternSupport(guidance: CopilotGuidance): UnifiedGuidanceSupportLink[] {
  const topPattern = guidance.patternSuggestions[0];

  if (!topPattern) {
    return [];
  }

  return [
    {
      title: topPattern.pattern.name,
      reason: topPattern.reason,
      href: `/patterns/${topPattern.pattern.id}`,
    },
  ];
}

function buildBundleSupport(guidance: CopilotGuidance): UnifiedGuidanceSupportLink[] {
  const topBundle = guidance.patternSuggestions[0]?.bundles[0];
  const topPattern = guidance.patternSuggestions[0];

  if (!topBundle || !topPattern) {
    return [];
  }

  return [
    {
      title: topBundle.name,
      reason: `Related through ${topPattern.pattern.name}.`,
      href: `/pattern-bundles/${topBundle.id}`,
    },
  ];
}

function buildGapWarnings(
  guidance: CopilotGuidance,
  showGapWarning: boolean,
): UnifiedGuidance["gapWarnings"] {
  if (!showGapWarning || !guidance.playbookCoverageHint) {
    return [];
  }

  return [
    {
      label: "Coverage gap",
      text: guidance.playbookCoverageHint.text,
      tone: guidance.playbookCoverageHint.tone,
      href: guidance.playbookCoverageHint.actionHref,
      hrefLabel: "Create playbook card",
    },
  ];
}

function buildCautionNotes(guidance: CopilotGuidance): string[] {
  const cautionNotes: string[] = [...guidance.blockers];

  const cautionReuse = guidance.reuseMemory.highlights.find((highlight) => highlight.tone === "caution");
  if (
    cautionReuse &&
    cautionNotes.every((note) => note.toLowerCase() !== cautionReuse.text.toLowerCase())
  ) {
    cautionNotes.push(cautionReuse.text);
  }

  return cautionNotes.slice(0, 2);
}

export function buildUnifiedGuidanceModel(input: {
  context?: GuidanceContext;
  guidance: CopilotGuidance;
}): UnifiedGuidance {
  const context = input.context ?? "detail";
  const config = GUIDANCE_CONTEXT_CONFIG[context];

  return {
    context,
    primaryAction: input.guidance.nextAction,
    primaryReason: input.guidance.reason,
    readinessState: input.guidance.readiness,
    tone: input.guidance.tone,
    actionHref: input.guidance.actionHref,
    actionLabel: input.guidance.actionHref ? "Open recommended step" : null,
    supportingSignals: buildSupportingSignals(input.guidance, config.supportingSignalLimit),
    reuseMemory:
      input.guidance.reuseMemory.highlights.length > 0
        ? {
            highlights: selectReuseHighlights(input.guidance.reuseMemory.highlights, config.reuseLimit),
          }
        : null,
    relatedPlaybookCards: buildPlaybookSupport(input.guidance),
    relatedPatterns: buildPatternSupport(input.guidance),
    relatedBundles: buildBundleSupport(input.guidance),
    gapWarnings: buildGapWarnings(input.guidance, config.showGapWarning),
    cautionNotes: buildCautionNotes(input.guidance),
  };
}

export function assembleGuidanceForSignal(input: {
  signal: SignalRecord;
  context?: GuidanceContext;
  allSignals: SignalRecord[];
  feedbackEntries: SignalFeedback[];
  patterns?: SignalPattern[];
  bundleSummariesByPatternId?: Record<string, PatternBundleSummary[]>;
  patternEffectivenessById?: Record<string, PatternEffectivenessSummary>;
  playbookCards?: PlaybookCard[];
  reuseMemoryCases?: ReuseMemoryCase[];
  playbookCoverageSummary?: PlaybookCoverageSummary;
}): UnifiedGuidance {
  const guidance = getFeedbackAwareCopilotGuidance(input.signal, {
    allSignals: input.allSignals,
    feedbackEntries: input.feedbackEntries,
    patterns: input.patterns,
    bundleSummariesByPatternId: input.bundleSummariesByPatternId,
    patternEffectivenessById: input.patternEffectivenessById,
    playbookCards: input.playbookCards,
    reuseMemoryCases: input.reuseMemoryCases,
    playbookCoverageSummary: input.playbookCoverageSummary,
  });

  return buildUnifiedGuidanceModel({
    context: input.context,
    guidance,
  });
}
