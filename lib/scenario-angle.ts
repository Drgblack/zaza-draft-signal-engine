import { z } from "zod";

import type { SignalInterpretationInput } from "@/types/signal";

export const SCENARIO_ANGLE_QUALITY_LEVELS = ["missing", "weak", "usable", "strong"] as const;

export type ScenarioAngleQuality = (typeof SCENARIO_ANGLE_QUALITY_LEVELS)[number];

export interface ScenarioAngleAssessment {
  quality: ScenarioAngleQuality;
  score: number;
  reason: string;
  suggestions: string[];
  overlapWithTitle: number;
}

export const scenarioAngleSuggestionSchema = z.object({
  angle: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
});

export const scenarioAngleSuggestionsSchema = z.object({
  suggestions: z.array(scenarioAngleSuggestionSchema).min(1).max(3),
  source: z.enum(["anthropic", "openai", "mock"]),
  message: z.string().trim().min(1),
});

export type ScenarioAngleSuggestion = z.infer<typeof scenarioAngleSuggestionSchema>;
export type ScenarioAngleSuggestionsResult = z.infer<typeof scenarioAngleSuggestionsSchema>;

const COMMUNICATION_KEYWORDS = [
  "email",
  "message",
  "reply",
  "respond",
  "say",
  "wording",
  "write",
  "document",
  "report",
  "explain",
  "follow up",
  "parent",
  "leadership",
  "complaint",
  "incident",
  "behaviour",
  "escalate",
  "de-escalate",
  "record",
  "tell",
  "conversation",
  "phone call",
  "meeting",
];

const STRONG_OPENERS = [
  "how should a teacher",
  "how can a teacher",
  "what should a teacher say",
  "how to respond",
  "how should a teacher respond",
  "how to document",
  "how should a teacher email",
  "how can a teacher email",
];

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function uniqueTokenSet(value: string): Set<string> {
  return new Set(tokenize(value));
}

function overlapRatio(left: string, right: string): number {
  const leftTokens = uniqueTokenSet(left);
  const rightTokens = uniqueTokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function countKeywordHits(value: string): number {
  return COMMUNICATION_KEYWORDS.filter((keyword) => value.includes(keyword)).length;
}

function buildSuggestions(overlapTooHigh: boolean, missingCommunicationFraming: boolean): string[] {
  const suggestions: string[] = [];

  if (overlapTooHigh) {
    suggestions.push("Rewrite this as a teacher communication problem rather than repeating the headline.");
  }

  if (missingCommunicationFraming) {
    suggestions.push("Try framing this as a parent email, complaint response, incident follow-up, or documentation challenge.");
  }

  suggestions.push("Name the communication tension: what the teacher needs to say, document, or respond to safely.");

  return suggestions.slice(0, 3);
}

export function assessScenarioAngle({
  scenarioAngle,
  sourceTitle,
}: {
  scenarioAngle: string | null | undefined;
  sourceTitle: string | null | undefined;
}): ScenarioAngleAssessment {
  const angle = normalizeText(scenarioAngle);
  const title = normalizeText(sourceTitle);

  if (!angle) {
    return {
      quality: "missing",
      score: 0,
      reason: "No scenario angle set yet.",
      suggestions: [
        "Describe the teacher communication situation rather than repeating the headline.",
        "Try framing this as a parent response, leadership note, complaint reply, or documentation task.",
      ],
      overlapWithTitle: 0,
    };
  }

  const wordCount = tokenize(angle).length;
  const keywordHits = countKeywordHits(angle);
  const overlapWithTitle = overlapRatio(angle, title);
  const hasStrongOpener = STRONG_OPENERS.some((opener) => angle.startsWith(opener));
  const mentionsTeacher = angle.includes("teacher");
  const mentionsCommunicationTension =
    angle.includes("without") ||
    angle.includes("safely") ||
    angle.includes("calm") ||
    angle.includes("professional") ||
    angle.includes("escalat");

  let score = 0;

  if (wordCount >= 8) {
    score += 2;
  }
  if (wordCount >= 12) {
    score += 1;
  }
  if (hasStrongOpener) {
    score += 4;
  }
  if (mentionsTeacher) {
    score += 2;
  }
  score += Math.min(keywordHits, 3);
  if (mentionsCommunicationTension) {
    score += 1;
  }
  if (overlapWithTitle >= 0.75) {
    score -= 4;
  } else if (overlapWithTitle >= 0.55) {
    score -= 2;
  }
  if (wordCount < 6) {
    score -= 2;
  }
  if (keywordHits === 0) {
    score -= 2;
  }

  const overlapTooHigh = overlapWithTitle >= 0.7;
  const missingCommunicationFraming = keywordHits === 0 && !hasStrongOpener;

  if (score >= 8) {
    return {
      quality: "strong",
      score,
      reason: "This angle clearly frames a teacher communication scenario with useful tension.",
      suggestions: [],
      overlapWithTitle,
    };
  }

  if (score >= 4) {
    return {
      quality: "usable",
      score,
      reason: overlapTooHigh
        ? "This is usable, but it still leans a bit close to the headline."
        : "This gives the interpretation layer a workable teacher communication scenario.",
      suggestions: buildSuggestions(overlapTooHigh, missingCommunicationFraming),
      overlapWithTitle,
    };
  }

  return {
    quality: "weak",
    score,
    reason: overlapTooHigh
      ? "This looks too close to the source title and does not yet feel like a teacher communication scenario."
      : "This angle is too generic or descriptive and needs clearer teacher communication framing.",
    suggestions: buildSuggestions(overlapTooHigh, true),
    overlapWithTitle,
  };
}

function trimSentence(value: string): string {
  return value.replace(/[?.!]+$/g, "").trim();
}

function pickScenarioStem(input: Pick<SignalInterpretationInput, "manualSummary" | "rawExcerpt" | "sourceTitle">): string {
  const best = input.manualSummary ?? input.rawExcerpt ?? input.sourceTitle;
  return trimSentence(best ?? "this signal");
}

export function getScenarioPriority(input: Pick<SignalInterpretationInput, "scenarioAngle" | "sourceTitle">): {
  preferredScenario: string | null;
  assessment: ScenarioAngleAssessment;
} {
  const assessment = assessScenarioAngle({
    scenarioAngle: input.scenarioAngle,
    sourceTitle: input.sourceTitle,
  });

  return {
    preferredScenario:
      assessment.quality === "strong" || assessment.quality === "usable"
        ? input.scenarioAngle?.trim() ?? null
        : null,
    assessment,
  };
}

export function buildMockScenarioAngleSuggestions(input: SignalInterpretationInput): ScenarioAngleSuggestionsResult {
  const base = pickScenarioStem(input);
  const lower = normalizeText([input.scenarioAngle, input.manualSummary, input.rawExcerpt, input.sourceTitle].filter(Boolean).join(" "));

  let suggestions: ScenarioAngleSuggestion[];

  if (lower.includes("parent") || lower.includes("complaint")) {
    suggestions = [
      {
        angle: "How should a teacher respond to a parent complaint without escalating tension or sounding defensive?",
        rationale: "Turns the signal into a clear parent-communication scenario with tone risk.",
      },
      {
        angle: "What is the safest way for a teacher to explain a difficult classroom event to parents in writing?",
        rationale: "Keeps the focus on explanation, tone, and professional protection.",
      },
      {
        angle: "How can a teacher follow up with parents after conflict without creating a damaging paper trail?",
        rationale: "Frames the signal as a repeatable communication-risk scenario.",
      },
    ];
  } else if (lower.includes("incident") || lower.includes("behaviour") || lower.includes("suspended") || lower.includes("torment")) {
    suggestions = [
      {
        angle: "How should a teacher email parents after a serious classroom incident without sounding accusatory?",
        rationale: "Creates a direct parent-email scenario from the incident signal.",
      },
      {
        angle: "How can a teacher document repeated student behaviour for leadership in a calm, professional way?",
        rationale: "Shifts the signal into a useful documentation scenario.",
      },
      {
        angle: "What is the safest way to record a difficult classroom event when leadership may need formal follow-up?",
        rationale: "Makes the escalation and record-keeping tension explicit.",
      },
    ];
  } else if (lower.includes("policy") || lower.includes("leadership") || lower.includes("report")) {
    suggestions = [
      {
        angle: "How should a teacher explain a new policy to parents without inviting unnecessary conflict?",
        rationale: "Turns policy news into a parent-facing wording problem.",
      },
      {
        angle: "How can a teacher document concerns for leadership clearly without sounding emotional or vague?",
        rationale: "Creates a professional documentation scenario.",
      },
      {
        angle: "What should a teacher say when leadership needs a written summary of a difficult situation?",
        rationale: "Grounds the signal in a usable reporting scenario.",
      },
    ];
  } else {
    suggestions = [
      {
        angle: `How should a teacher respond in writing when ${base.toLowerCase()} creates pressure or misunderstanding?`,
        rationale: "Reframes the source as a communication-response scenario.",
      },
      {
        angle: `What is the safest way for a teacher to document or explain ${base.toLowerCase()}?`,
        rationale: "Moves the signal toward documentation and wording risk.",
      },
      {
        angle: `How can a teacher communicate about ${base.toLowerCase()} without escalating tension?`,
        rationale: "Adds teacher-facing communication tension without drifting from the source.",
      },
    ];
  }

  return scenarioAngleSuggestionsSchema.parse({
    suggestions,
    source: "mock",
    message: "Mock scenario-angle suggestions generated from source cues.",
  });
}
