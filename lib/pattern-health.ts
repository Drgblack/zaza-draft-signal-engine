import type { AuditEvent } from "@/lib/audit";
import type { SignalFeedback } from "@/lib/feedback-definitions";
import type { PatternFeedbackEntry } from "@/lib/pattern-feedback-definitions";
import type { PatternLifecycleState, SignalPattern } from "@/lib/pattern-definitions";
import {
  buildPatternEffectivenessSummaries,
  isPatternActive,
  type PatternEffectivenessSummary,
} from "@/lib/patterns";

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

const COMMUNICATION_SITUATIONS = [
  {
    label: "parent tension",
    patterns: ["parent", "complaint", "boundary", "availability", "reply window", "after-hours"],
  },
  {
    label: "documentation",
    patterns: ["document", "documentation", "factual", "neutral", "objective", "record"],
  },
  {
    label: "incident explanation",
    patterns: ["incident", "follow-up", "follow up", "explain", "leadership"],
  },
  {
    label: "planning reset",
    patterns: ["planning", "routine", "structure", "weekly", "lesson plan"],
  },
] as const;

export interface PatternOverlapHint {
  patternId: string;
  name: string;
  lifecycleState: PatternLifecycleState;
  reason: string;
}

export interface PatternHealthHint {
  kind: "weak_feedback" | "needs_refinement" | "low_usage" | "weak_outputs" | "overlap";
  text: string;
}

export interface PatternHealthAssessment {
  patternId: string;
  lifecycleState: PatternLifecycleState;
  needsReview: boolean;
  repeatedWeakFeedback: boolean;
  repeatedRefinementFeedback: boolean;
  lowRecentUsage: boolean;
  weakOutputRisk: boolean;
  overlapHints: PatternOverlapHint[];
  healthHints: PatternHealthHint[];
  effectiveness: PatternEffectivenessSummary | null;
}

export interface PatternHealthSummary {
  activeCount: number;
  retiredCount: number;
  needsReviewCount: number;
  repeatedWeakOrRefinementCount: number;
  possibleOverlapCount: number;
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

function getSituationLabels(pattern: SignalPattern): string[] {
  const combined = [
    pattern.name,
    pattern.description,
    pattern.exampleScenarioAngle,
    pattern.exampleOutput,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return COMMUNICATION_SITUATIONS.filter((situation) =>
    situation.patterns.some((keyword) => combined.includes(keyword)),
  ).map((situation) => situation.label);
}

function getPatternTokens(pattern: SignalPattern): Set<string> {
  return new Set([
    ...tokenize(pattern.name),
    ...tokenize(pattern.description),
    ...tokenize(pattern.exampleScenarioAngle),
    ...tokenize(pattern.exampleSignalSummary),
    ...tokenize(pattern.exampleOutput),
    ...pattern.tags.map((tag) => tag.toLowerCase()),
  ]);
}

function overlapReason(input: {
  sharedSituations: string[];
  scenarioOverlap: string[];
  nameOverlap: string[];
  sharedTags: string[];
  candidate: SignalPattern;
}): string {
  if (input.sharedSituations[0]) {
    return `This pattern may overlap with "${input.candidate.name}" because both point at ${input.sharedSituations[0]}.`;
  }

  if (input.scenarioOverlap.length >= 2) {
    return `This pattern may overlap with "${input.candidate.name}" because the Scenario Angle language is very close.`;
  }

  if (input.sharedTags.length >= 2 || input.nameOverlap.length >= 2) {
    return `This pattern may overlap with "${input.candidate.name}". Consider reviewing for consolidation.`;
  }

  return `This pattern may overlap with "${input.candidate.name}".`;
}

function buildOverlapHints(
  pattern: SignalPattern,
  patterns: SignalPattern[],
  effectivenessById: Record<string, PatternEffectivenessSummary>,
): PatternOverlapHint[] {
  const currentTokens = getPatternTokens(pattern);
  const currentNameTokens = tokenize(pattern.name);
  const currentScenarioTokens = tokenize(pattern.exampleScenarioAngle ?? pattern.description);
  const currentSituations = getSituationLabels(pattern);

  return patterns
    .filter((candidate) => candidate.id !== pattern.id)
    .map((candidate) => {
      const candidateTokens = getPatternTokens(candidate);
      const scenarioOverlap = countOverlap(
        currentScenarioTokens,
        tokenize(candidate.exampleScenarioAngle ?? candidate.description),
      );
      const nameOverlap = countOverlap(currentNameTokens, tokenize(candidate.name));
      const sharedTags = pattern.tags.filter((tag) => candidate.tags.includes(tag));
      const sharedSituations = currentSituations.filter((label) => getSituationLabels(candidate).includes(label));
      let score = 0;

      if (sharedSituations.length > 0) {
        score += 3;
      }
      if (scenarioOverlap.length >= 2) {
        score += 3;
      }
      if (nameOverlap.length >= 1) {
        score += 2;
      }
      if (sharedTags.length >= 2) {
        score += 2;
      }
      if (countOverlap(currentTokens, candidateTokens).length >= 4) {
        score += 1;
      }

      if (score < 4) {
        return null;
      }

      const currentEffectiveness = effectivenessById[pattern.id];
      const candidateEffectiveness = effectivenessById[candidate.id];
      const candidateLooksStronger =
        (candidateEffectiveness?.effectiveCount ?? 0) > (currentEffectiveness?.effectiveCount ?? 0) ||
        (candidateEffectiveness?.usedCount ?? 0) > (currentEffectiveness?.usedCount ?? 0);

      return {
        patternId: candidate.id,
        name: candidate.name,
        lifecycleState: candidate.lifecycleState,
        score: candidateLooksStronger ? score + 1 : score,
        reason: overlapReason({
          sharedSituations,
          scenarioOverlap,
          nameOverlap,
          sharedTags,
          candidate,
        }),
      };
    })
    .filter((hint): hint is PatternOverlapHint & { score: number } => hint !== null)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, 2)
    .map((hint) => ({
      patternId: hint.patternId,
      name: hint.name,
      lifecycleState: hint.lifecycleState,
      reason: hint.reason,
    }));
}

function daysSince(value: string | null | undefined, now: Date): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.floor((now.getTime() - timestamp) / (24 * 60 * 60 * 1000));
}

export function buildPatternHealthAssessments(
  patterns: SignalPattern[],
  auditEvents: AuditEvent[],
  patternFeedbackEntries: PatternFeedbackEntry[],
  signalFeedbackEntries: SignalFeedback[],
  options?: {
    now?: Date;
  },
): PatternHealthAssessment[] {
  const now = options?.now ?? new Date();
  const effectivenessSummaries = buildPatternEffectivenessSummaries(
    patterns,
    auditEvents,
    patternFeedbackEntries,
    signalFeedbackEntries,
  );
  const effectivenessById = Object.fromEntries(
    effectivenessSummaries.map((summary) => [summary.patternId, summary]),
  );

  return patterns.map((pattern) => {
    const effectiveness = effectivenessById[pattern.id] ?? null;
    const repeatedWeakFeedback = (effectiveness?.weakCount ?? 0) >= 2;
    const repeatedRefinementFeedback = (effectiveness?.needsRefinementCount ?? 0) >= 2;
    const weakOutputRisk =
      (effectiveness?.usedCount ?? 0) >= 2 &&
      (effectiveness?.weakOutputCount ?? 0) > (effectiveness?.strongOutputCount ?? 0);
    const ageDays = daysSince(pattern.createdAt, now);
    const lastUsedDays = daysSince(effectiveness?.lastUsedAt ?? null, now);
    const lowRecentUsage =
      isPatternActive(pattern) &&
      (((effectiveness?.usedCount ?? 0) === 0 && (ageDays ?? 0) >= 21) ||
        ((effectiveness?.usedCount ?? 0) <= 1 && (lastUsedDays ?? 0) >= 45));
    const overlapHints = buildOverlapHints(pattern, patterns, effectivenessById);

    const healthHints: PatternHealthHint[] = [];
    if (repeatedWeakFeedback) {
      healthHints.push({
        kind: "weak_feedback",
        text: "This pattern has been marked weak repeatedly.",
      });
    }
    if (repeatedRefinementFeedback) {
      healthHints.push({
        kind: "needs_refinement",
        text: "This pattern often needs refinement.",
      });
    }
    if (lowRecentUsage) {
      healthHints.push({
        kind: "low_usage",
        text: "This pattern has low recent usage.",
      });
    }
    if (weakOutputRisk) {
      healthHints.push({
        kind: "weak_outputs",
        text: "This pattern is often used, but the resulting outputs are frequently weak.",
      });
    }
    if (overlapHints[0]) {
      healthHints.push({
        kind: "overlap",
        text: overlapHints[0].reason,
      });
    }

    return {
      patternId: pattern.id,
      lifecycleState: pattern.lifecycleState,
      needsReview:
        isPatternActive(pattern) &&
        (repeatedWeakFeedback || repeatedRefinementFeedback || lowRecentUsage || weakOutputRisk || overlapHints.length > 0),
      repeatedWeakFeedback,
      repeatedRefinementFeedback,
      lowRecentUsage,
      weakOutputRisk,
      overlapHints,
      healthHints: healthHints.slice(0, 3),
      effectiveness,
    };
  });
}

export function indexPatternHealthAssessments(
  assessments: PatternHealthAssessment[],
): Record<string, PatternHealthAssessment> {
  return Object.fromEntries(assessments.map((assessment) => [assessment.patternId, assessment]));
}

export function buildPatternHealthSummary(
  assessments: PatternHealthAssessment[],
): PatternHealthSummary {
  return {
    activeCount: assessments.filter((assessment) => assessment.lifecycleState === "active").length,
    retiredCount: assessments.filter((assessment) => assessment.lifecycleState === "retired").length,
    needsReviewCount: assessments.filter((assessment) => assessment.needsReview).length,
    repeatedWeakOrRefinementCount: assessments.filter(
      (assessment) => assessment.repeatedWeakFeedback || assessment.repeatedRefinementFeedback,
    ).length,
    possibleOverlapCount: assessments.filter((assessment) => assessment.overlapHints.length > 0).length,
  };
}
