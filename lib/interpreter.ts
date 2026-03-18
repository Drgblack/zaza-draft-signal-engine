import { CATEGORY_DEFAULTS, CATEGORY_RULES, EMOTIONAL_PATTERNS, SEVERITY_THREE_PATTERNS, SEVERITY_TWO_PATTERNS, SUBTYPE_RULES } from "@/lib/interpreter-rules";
import type {
  HookTemplate,
  InterpretationConfidence,
  PlatformPriority,
  SignalCategory,
  SignalInterpretationInput,
  SignalInterpretationResult,
  SignalRecord,
  SuggestedFormatPriority,
} from "@/types/signal";
import { HOOK_TEMPLATES } from "@/types/signal";

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeDisplayText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function trimTerminalPunctuation(value: string): string {
  return value.replace(/[?.!]+$/g, "").trim();
}

function collectSignalTextParts(input: SignalInterpretationInput): string[] {
  return [input.scenarioAngle, input.manualSummary, input.rawExcerpt, input.sourceTitle, input.sourceType, input.sourcePublisher].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
}

function buildSignalContext(input: SignalInterpretationInput) {
  const scenarioAngle = normalizeText(input.scenarioAngle);
  const title = normalizeText(input.sourceTitle);
  const rawExcerpt = normalizeText(input.rawExcerpt);
  const manualSummary = normalizeText(input.manualSummary);
  const sourceType = normalizeText(input.sourceType);
  const sourcePublisher = normalizeText(input.sourcePublisher);
  const scenarioDisplay = normalizeDisplayText(input.scenarioAngle);
  const combined = [scenarioAngle, manualSummary, rawExcerpt, title, sourceType, sourcePublisher].filter(Boolean).join(" ");

  return {
    scenarioAngle,
    scenarioDisplay,
    title,
    rawExcerpt,
    manualSummary,
    sourceType,
    sourcePublisher,
    combined,
  };
}

function includesPattern(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function scorePatternPriority(context: ReturnType<typeof buildSignalContext>, patterns: string[]): number {
  let score = 0;

  if (includesPattern(context.scenarioAngle, patterns)) {
    score += 3;
  }
  if (includesPattern(context.manualSummary, patterns)) {
    score += 2;
  }
  if (includesPattern(context.rawExcerpt, patterns)) {
    score += 1.5;
  }
  if (includesPattern(context.title, patterns)) {
    score += 1;
  }
  if (includesPattern(context.sourceType, patterns) || includesPattern(context.sourcePublisher, patterns)) {
    score += 0.5;
  }

  return score;
}

function scoreCategory(category: SignalCategory, context: ReturnType<typeof buildSignalContext>): number {
  return CATEGORY_RULES[category].reduce((score, rule) => {
    return score + scorePatternPriority(context, rule.patterns) * rule.weight;
  }, 0);
}

function determineCategory(context: ReturnType<typeof buildSignalContext>): {
  category: SignalCategory;
  scores: Record<SignalCategory, number>;
} {
  const scores = {
    Risk: scoreCategory("Risk", context),
    Stress: scoreCategory("Stress", context),
    Conflict: scoreCategory("Conflict", context),
    Confusion: scoreCategory("Confusion", context),
    Success: scoreCategory("Success", context),
  } satisfies Record<SignalCategory, number>;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]) as Array<[SignalCategory, number]>;
  const [topCategory, topScore] = sorted[0];

  if (topScore > 0) {
    return {
      category: topCategory,
      scores,
    };
  }

  if (context.sourceType.includes("support")) {
    return { category: "Confusion", scores };
  }

  if (context.sourceType.includes("community") || context.sourceType.includes("social")) {
    return { category: "Conflict", scores };
  }

  return {
    category: "Stress",
    scores,
  };
}

function determineSeverity(category: SignalCategory, context: ReturnType<typeof buildSignalContext>): 1 | 2 | 3 {
  if (includesPattern(context.scenarioAngle, SEVERITY_THREE_PATTERNS) || includesPattern(context.combined, SEVERITY_THREE_PATTERNS)) {
    return 3;
  }

  if (includesPattern(context.scenarioAngle, SEVERITY_TWO_PATTERNS) || includesPattern(context.combined, SEVERITY_TWO_PATTERNS)) {
    return category === "Risk" ? 3 : 2;
  }

  switch (category) {
    case "Risk":
    case "Conflict":
      return 2;
    case "Stress":
      return context.combined.includes("planning") || context.combined.includes("prep") ? 2 : 1;
    case "Confusion":
    case "Success":
    default:
      return 1;
  }
}

function determineSubtype(category: SignalCategory, context: ReturnType<typeof buildSignalContext>): string {
  const rule = SUBTYPE_RULES[category].find((candidate) => includesPattern(context.combined, candidate.patterns));
  return rule?.label ?? `${category} signal`;
}

function determineTeacherPainPoint(category: SignalCategory, subtype: string, context: ReturnType<typeof buildSignalContext>): string {
  if (context.scenarioDisplay) {
    const scenario = trimTerminalPunctuation(context.scenarioDisplay);

    if (category === "Risk") {
      return `Teachers need a safer way to handle scenarios like "${scenario}" without creating avoidable professional exposure.`;
    }

    if (category === "Stress") {
      return `Teachers are carrying the emotional labour of scenarios like "${scenario}" without enough structure or recovery time.`;
    }

    if (category === "Conflict") {
      return `Teachers need to navigate scenarios like "${scenario}" without sounding accusatory, defensive, or escalatory.`;
    }

    if (category === "Confusion") {
      return `Teachers need clearer language and structure for scenarios like "${scenario}" so uncertainty does not become avoidable friction.`;
    }

    return `Teachers want reusable communication patterns for scenarios like "${scenario}" rather than having to improvise every time.`;
  }

  if (category === "Risk") {
    return `Teachers are exposed to ${subtype.toLowerCase()} without much room to recover once the issue escalates.`;
  }

  if (category === "Stress") {
    return context.combined.includes("email")
      ? "Teachers are carrying communication load long after the school day ends."
      : "Teachers are absorbing invisible workload that erodes planning quality and emotional capacity.";
  }

  if (category === "Conflict") {
    return "Teachers are forced to manage relationship friction while still protecting classroom stability and trust.";
  }

  if (category === "Confusion") {
    return "Teachers lose time and confidence when expectations are unclear but still professionally consequential.";
  }

  return "Teachers need repeatable systems that make the work feel lighter, clearer, and more sustainable.";
}

function determineRelevance(category: SignalCategory, context: ReturnType<typeof buildSignalContext>) {
  if (category === "Risk" || category === "Stress" || category === "Conflict") {
    return "High" as const;
  }

  if (
    includesPattern(context.combined, ["teacher", "classroom", "lesson", "planning", "support", "parent", "admin", "district"])
  ) {
    return "High" as const;
  }

  return CATEGORY_DEFAULTS[category].relevance;
}

function determineGenericRisk(category: SignalCategory, severity: 1 | 2 | 3): string {
  if (category === "Stress") {
    return severity === 2
      ? "Sustained strain here raises burnout risk, decision fatigue, and weaker communication under pressure."
      : "The immediate risk is modest, but the pattern compounds into exhaustion if it becomes normal.";
  }

  if (category === "Conflict") {
    return severity === 3
      ? "If this conflict escalates, it can quickly become a reputational or disciplinary issue."
      : "Conflict of this kind can damage teacher trust, relationships, and confidence if it hardens.";
  }

  if (category === "Confusion") {
    return "Low direct risk, but unclear expectations create avoidable mistakes, hesitation, and professional friction.";
  }

  return "Low direct risk. The value here is editorial proof of what better systems make possible.";
}

function determineRiskToTeacher(category: SignalCategory, severity: 1 | 2 | 3, subtype: string, context: ReturnType<typeof buildSignalContext>): string {
  if (context.scenarioDisplay) {
    const scenarioLead = trimTerminalPunctuation(context.scenarioDisplay);

    if (category === "Risk") {
      return `Handled badly, scenarios like "${scenarioLead}" can create complaints, escalation, or a damaging paper trail for the teacher.`;
    }

    if (category === "Stress") {
      return `Without a repeatable response pattern, scenarios like "${scenarioLead}" become another source of after-hours drafting pressure and decision fatigue.`;
    }

    if (category === "Conflict") {
      return `Scenarios like "${scenarioLead}" can harden parent or leadership conflict if the tone feels defensive, vague, or accusatory.`;
    }

    if (category === "Confusion") {
      return `Scenarios like "${scenarioLead}" create avoidable misunderstanding when the teacher has to respond without clear wording or structure.`;
    }

    return `Scenarios like "${scenarioLead}" are lower risk but useful for showing what calmer, clearer communication can look like.`;
  }

  return determineGenericRisk(category, severity);
}

function determineHookTemplate(category: SignalCategory, severity: 1 | 2 | 3, context: ReturnType<typeof buildSignalContext>): HookTemplate {
  if (category === "Risk" && severity === 3) {
    return "This could cost you your job";
  }

  if (
    context.scenarioAngle.includes("email") ||
    context.scenarioAngle.includes("reply") ||
    context.scenarioAngle.includes("respond") ||
    context.combined.includes("email") ||
    context.combined.includes("after-hours") ||
    context.combined.includes("messages")
  ) {
    return "This is what emails look like when you’re exhausted";
  }

  if (context.scenarioAngle.includes("without") || context.scenarioAngle.includes("how should")) {
    return category === "Conflict" ? "What this really shows" : "Quiet risk teachers miss";
  }

  if (context.combined.match(/\d/)) {
    return "Statistic with human cost";
  }

  if (category === "Success") {
    return "Before / after rewrite";
  }

  if (category === "Confusion" || (category === "Risk" && severity < 3)) {
    return "Quiet risk teachers miss";
  }

  if (category === "Conflict") {
    return "What this really shows";
  }

  return CATEGORY_DEFAULTS[category].hookTemplate;
}

function determinePlatformPriority(
  category: SignalCategory,
  severity: 1 | 2 | 3,
  context: ReturnType<typeof buildSignalContext>,
): PlatformPriority {
  if (context.scenarioAngle.includes("parent") || context.scenarioAngle.includes("email") || context.scenarioAngle.includes("leadership")) {
    return category === "Conflict" ? "LinkedIn First" : "LinkedIn First";
  }

  if (category === "Risk") {
    return severity === 3 ? "LinkedIn First" : "LinkedIn First";
  }

  if (category === "Conflict") {
    return "Reddit First";
  }

  if (context.sourceType.includes("community")) {
    return "Reddit First";
  }

  if (category === "Success" && (context.combined.includes("rewrite") || context.combined.includes("before") || context.combined.includes("after"))) {
    return "Multi-platform";
  }

  if (category === "Stress") {
    return "LinkedIn First";
  }

  return CATEGORY_DEFAULTS[category].platformPriority;
}

function determineFormatPriority(
  category: SignalCategory,
  severity: 1 | 2 | 3,
  hookTemplateUsed: HookTemplate,
  context: ReturnType<typeof buildSignalContext>,
): SuggestedFormatPriority {
  if (context.scenarioAngle.includes("how should") || context.scenarioAngle.includes("respond") || context.scenarioAngle.includes("documenting")) {
    return category === "Risk" ? "Text" : "Carousel";
  }

  if (hookTemplateUsed === "Before / after rewrite" || context.combined.includes("rewrite")) {
    return "Carousel";
  }

  if (hookTemplateUsed === "Statistic with human cost") {
    return "Image";
  }

  if (category === "Risk" && severity === 3) {
    return "Text";
  }

  if (category === "Conflict") {
    return "Carousel";
  }

  return CATEGORY_DEFAULTS[category].formatPriority;
}

function determineContentAngle(
  category: SignalCategory,
  severity: 1 | 2 | 3,
  subtype: string,
  context: ReturnType<typeof buildSignalContext>,
): string {
  if (context.scenarioDisplay) {
    const scenario = trimTerminalPunctuation(context.scenarioDisplay);

    if (category === "Risk") {
      return `Translate the source into a teacher communication scenario about "${scenario}" and show how wording choices can either protect or expose the teacher.`;
    }

    if (category === "Stress") {
      return `Use the source to unpack the hidden strain inside "${scenario}" and show why teachers need calmer response structures, not more emotional labour.`;
    }

    if (category === "Conflict") {
      return `Frame this as a communication-risk scenario about "${scenario}", with emphasis on tone, escalation risk, and relationship protection.`;
    }

    if (category === "Confusion") {
      return `Turn the source into a practical scenario about "${scenario}" and expose the cost of unclear wording or expectations.`;
    }

    return `Use "${scenario}" as a practical before-and-after scenario that shows how stronger systems improve teacher communication.`;
  }

  if (category === "Risk") {
    return severity === 3
      ? `Treat this as a high-stakes warning: normal-looking communication can turn into ${subtype.toLowerCase()} fast.`
      : `Use this to show how ${subtype.toLowerCase()} starts quietly before it becomes formal risk.`;
  }

  if (category === "Stress") {
    return context.combined.includes("email")
      ? "Show how everyday email and message habits reveal a deeper exhaustion pattern, not just workload."
      : "Frame this as hidden professional strain that looks manageable until it starts shaping every decision.";
  }

  if (category === "Conflict") {
    return "Translate the signal into a story about expectation mismatch, tone, and relationship cost rather than one isolated disagreement.";
  }

  if (category === "Confusion") {
    return "Use this to expose the cost of unclear systems and show why teachers pay for ambiguity with time and confidence.";
  }

  return `Use ${subtype.toLowerCase()} as proof that better systems change the emotional experience of teaching, not just output.`;
}

function determineInterpretationConfidence(
  scores: Record<SignalCategory, number>,
  category: SignalCategory,
  context: ReturnType<typeof buildSignalContext>,
): InterpretationConfidence {
  const topScore = scores[category];
  const runnerUp = Object.entries(scores)
    .filter(([key]) => key !== category)
    .sort((a, b) => b[1] - a[1])[0]?.[1] ?? 0;
  const margin = topScore - runnerUp;

  if (topScore >= 5 && margin >= 2) {
    return "High";
  }

  if (topScore >= 2 || context.title.length > 20) {
    return "Medium";
  }

  return "Low";
}

function buildInterpretationNotes(
  category: SignalCategory,
  severity: 1 | 2 | 3,
  subtype: string,
  context: ReturnType<typeof buildSignalContext>,
): string {
  const reason =
    context.scenarioDisplay
      ? `the operator-framed scenario points toward ${subtype.toLowerCase()} rather than just a generic news headline`
      : category === "Risk"
        ? `${subtype.toLowerCase()} language suggests consequences beyond routine frustration`
        : category === "Stress"
          ? "the language points to invisible strain rather than a one-off annoyance"
          : category === "Conflict"
            ? "the signal centers on misaligned expectations and relationship tension"
            : category === "Confusion"
              ? "the source implies unclear expectations rather than active hostility"
              : "the signal reflects a positive systems outcome worth codifying";

  const sourceHint = context.sourceType ? ` Source type: ${context.sourceType}.` : "";
  const scenarioHint = context.scenarioDisplay ? ` Scenario angle: ${context.scenarioDisplay}.` : "";
  return `Classified as ${category} with severity ${severity} because ${reason}.${sourceHint}${scenarioHint}`;
}

export function toInterpretationInput(signal: SignalRecord): SignalInterpretationInput {
  return {
    recordId: signal.recordId,
    sourceTitle: signal.sourceTitle,
    sourceType: signal.sourceType,
    sourcePublisher: signal.sourcePublisher,
    sourceDate: signal.sourceDate,
    sourceUrl: signal.sourceUrl,
    rawExcerpt: signal.rawExcerpt,
    manualSummary: signal.manualSummary,
    scenarioAngle: signal.scenarioAngle,
  };
}

export function buildInitialInterpretationFromSignal(signal: SignalRecord): SignalInterpretationResult | null {
  const hookTemplateUsed = signal.hookTemplateUsed && HOOK_TEMPLATES.includes(signal.hookTemplateUsed as HookTemplate)
    ? (signal.hookTemplateUsed as HookTemplate)
    : null;

  if (
    !signal.signalCategory ||
    !signal.severityScore ||
    !signal.signalSubtype ||
    !signal.emotionalPattern ||
    !signal.teacherPainPoint ||
    !signal.relevanceToZazaDraft ||
    !signal.riskToTeacher ||
    !signal.interpretationNotes ||
    !hookTemplateUsed ||
    !signal.contentAngle ||
    !signal.platformPriority ||
    !signal.suggestedFormatPriority
  ) {
    return null;
  }

  return {
    signalCategory: signal.signalCategory,
    severityScore: signal.severityScore,
    signalSubtype: signal.signalSubtype,
    emotionalPattern: signal.emotionalPattern,
    teacherPainPoint: signal.teacherPainPoint,
    relevanceToZazaDraft: signal.relevanceToZazaDraft,
    riskToTeacher: signal.riskToTeacher,
    interpretationNotes: signal.interpretationNotes,
    hookTemplateUsed,
    contentAngle: signal.contentAngle,
    platformPriority: signal.platformPriority,
    suggestedFormatPriority: signal.suggestedFormatPriority,
    interpretationConfidence: "Medium",
    interpretationSource: "manual",
    interpretedAt: signal.createdDate,
  };
}

export function interpretSignal(input: SignalInterpretationInput): SignalInterpretationResult {
  const context = buildSignalContext(input);
  const { category, scores } = determineCategory(context);
  const severityScore = determineSeverity(category, context);
  const signalSubtype = determineSubtype(category, context);
  const emotionalPattern = EMOTIONAL_PATTERNS[category];
  const teacherPainPoint = determineTeacherPainPoint(category, signalSubtype, context);
  const relevanceToZazaDraft = determineRelevance(category, context);
  const riskToTeacher = determineRiskToTeacher(category, severityScore, signalSubtype, context);
  const hookTemplateUsed = determineHookTemplate(category, severityScore, context);
  const platformPriority = determinePlatformPriority(category, severityScore, context);
  const suggestedFormatPriority = determineFormatPriority(category, severityScore, hookTemplateUsed, context);
  const contentAngle = determineContentAngle(category, severityScore, signalSubtype, context);
  const interpretationConfidence = determineInterpretationConfidence(scores, category, context);
  const interpretationNotes = buildInterpretationNotes(category, severityScore, signalSubtype, context);

  return {
    signalCategory: category,
    severityScore,
    signalSubtype,
    emotionalPattern,
    teacherPainPoint,
    relevanceToZazaDraft,
    riskToTeacher,
    interpretationNotes,
    hookTemplateUsed,
    contentAngle,
    platformPriority,
    suggestedFormatPriority,
    interpretationConfidence,
    interpretationSource: "rules",
    interpretedAt: new Date().toISOString(),
  };
}

export function summarizeSignalForWorkbench(input: SignalInterpretationInput): string[] {
  return collectSignalTextParts(input);
}
