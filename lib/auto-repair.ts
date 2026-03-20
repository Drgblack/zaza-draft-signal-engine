import { z } from "zod";

import { suggestEditorialMode } from "@/lib/editorial-modes";
import type { AutoAdvanceAssessment, AutoAdvanceStage } from "@/lib/auto-advance";
import type { UnifiedGuidance } from "@/lib/guidance";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import { assessTransformability } from "@/lib/transformability";
import type { AutoRepairOutcome, AutoRepairType, EditorialMode, SignalRecord } from "@/types/signal";

const autoRepairTypeSchema = z.enum([
  "scenario_angle_reframe",
  "editorial_mode_shift",
  "pattern_fallback",
  "playbook_supported_reframe",
  "generation_retry",
]);

const autoRepairOutcomeSchema = z.enum([
  "repaired_promoted",
  "repaired_still_held",
  "not_repairable",
]);

export const autoRepairHistoryEntrySchema = z.object({
  id: z.string().trim().min(1),
  timestamp: z.string().trim().min(1),
  priorHoldStage: z.enum(["auto_interpret", "auto_generate", "auto_prepare_for_review"]),
  repairType: autoRepairTypeSchema,
  outcome: autoRepairOutcomeSchema,
  summary: z.string().trim().min(1),
  whyAttempted: z.string().trim().min(1),
  changedFields: z.array(z.string().trim().min(1)).min(1).max(8),
  changedTo: z.record(z.string(), z.string()).optional(),
  notes: z.array(z.string().trim().min(1)).max(4),
});

export const autoRepairHistorySchema = z.array(autoRepairHistoryEntrySchema).max(20);
export const borderlineSuggestedRepairActionSchema = z.object({
  key: z.enum([
    "scenario_angle_reframe",
    "editorial_mode_shift",
    "pattern_fallback",
    "playbook_supported_reframe",
    "generation_retry",
    "request_more_context",
  ]),
  label: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

export type AutoRepairHistoryEntry = z.infer<typeof autoRepairHistoryEntrySchema>;
export type BorderlineSuggestedRepairAction = z.infer<typeof borderlineSuggestedRepairActionSchema>;

export interface AutoRepairPlan {
  eligibility: "repairable" | "not_repairable";
  repairType: AutoRepairType | null;
  whyAttempted: string;
  changedFields: string[];
  updates: Partial<SignalRecord>;
  notes: string[];
  rerunInterpretation: boolean;
  rerunGeneration: boolean;
}

export interface BorderlineReviewModel {
  borderlineReason: string;
  bestCaseKeep: string;
  bestCaseReject: string;
  missingEvidence: string;
  suggestedRepairActions: BorderlineSuggestedRepairAction[];
}

function trimSentence(value: string | null | undefined): string {
  return value?.replace(/[?.!]+$/g, "").trim() ?? "";
}

function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
}

function normalizeTopic(signal: SignalRecord): string {
  const candidate =
    trimSentence(signal.signalSubtype) ||
    trimSentence(signal.teacherPainPoint) ||
    trimSentence(signal.contentAngle) ||
    trimSentence(signal.sourceTitle) ||
    "this situation";

  return candidate.toLowerCase();
}

function buildScenarioAngleReframe(signal: SignalRecord): string {
  const topic = normalizeTopic(signal);
  const combined = [
    signal.sourceTitle,
    signal.manualSummary,
    signal.rawExcerpt,
    signal.signalSubtype,
    signal.teacherPainPoint,
    signal.riskToTeacher,
    signal.contentAngle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (combined.includes("parent") || combined.includes("complaint") || combined.includes("family")) {
    return `How should a teacher respond to ${topic} without escalating tension or sounding defensive?`;
  }

  if (
    combined.includes("document") ||
    combined.includes("documentation") ||
    combined.includes("evidence") ||
    combined.includes("policy") ||
    combined.includes("progress")
  ) {
    return `How should a teacher document ${topic} clearly without sounding accusatory or vague?`;
  }

  if (
    combined.includes("planning") ||
    combined.includes("workload") ||
    combined.includes("overloaded") ||
    combined.includes("stress")
  ) {
    return `How should a teacher communicate about ${topic} in a way that lowers pressure instead of adding more drag?`;
  }

  if (combined.includes("risk") || combined.includes("incident") || combined.includes("behaviour")) {
    return `How should a teacher explain ${topic} clearly and professionally without creating avoidable risk?`;
  }

  return `How should a teacher communicate about ${topic} clearly, calmly, and professionally?`;
}

function inferRepairMode(signal: SignalRecord, guidance: UnifiedGuidance): EditorialMode | null {
  const supportText = [
    guidance.relatedPlaybookCards[0]?.title,
    guidance.relatedPlaybookCards[0]?.reason,
    guidance.relatedPatterns[0]?.title,
    guidance.relatedPatterns[0]?.reason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    supportText.includes("de-escal") ||
    supportText.includes("boundary") ||
    supportText.includes("parent tension") ||
    supportText.includes("rising")
  ) {
    return "reassurance_deescalation";
  }

  if (
    supportText.includes("document") ||
    supportText.includes("neutral") ||
    supportText.includes("policy") ||
    supportText.includes("professional guidance") ||
    supportText.includes("factual")
  ) {
    return "professional_guidance";
  }

  if (supportText.includes("risk")) {
    return "risk_warning";
  }

  if (supportText.includes("tip") || supportText.includes("practical")) {
    return "helpful_tip";
  }

  return suggestEditorialMode(signal).mode;
}

function buildChangedToMap(updates: Partial<SignalRecord>): Record<string, string> {
  const changedTo: Record<string, string> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string") {
      changedTo[key] = value;
      continue;
    }

    changedTo[key] = String(value);
  }

  return changedTo;
}

export function parseAutoRepairHistory(value: string | null | undefined): AutoRepairHistoryEntry[] {
  if (!value) {
    return [];
  }

  try {
    return autoRepairHistorySchema.parse(JSON.parse(value));
  } catch {
    return [];
  }
}

export function stringifyAutoRepairHistory(entries: AutoRepairHistoryEntry[] | null | undefined): string | null {
  if (!entries || entries.length === 0) {
    return null;
  }

  return JSON.stringify(autoRepairHistorySchema.parse(entries));
}

export function appendAutoRepairHistory(
  signal: SignalRecord,
  entry: AutoRepairHistoryEntry,
): string | null {
  const existing = parseAutoRepairHistory(signal.autoRepairHistoryJson);
  return stringifyAutoRepairHistory([...existing, entry].slice(-20));
}

export function getLatestAutoRepairEntry(signal: Pick<SignalRecord, "autoRepairHistoryJson">): AutoRepairHistoryEntry | null {
  const entries = parseAutoRepairHistory(signal.autoRepairHistoryJson);
  return entries.at(-1) ?? null;
}

export function getAutoRepairLabel(entry: AutoRepairHistoryEntry): string {
  if (entry.outcome === "repaired_promoted") {
    return `Auto-repaired: ${entry.summary}`;
  }

  if (entry.outcome === "repaired_still_held") {
    return `Auto-repaired but still held: ${entry.summary}`;
  }

  return `Not repairable: ${entry.summary}`;
}

function summarizeKeepCase(signal: SignalRecord, guidance: UnifiedGuidance, assessment: AutoAdvanceAssessment): string {
  const reasons: string[] = [];

  if (signal.reviewPriority === "Urgent" || signal.reviewPriority === "High") {
    reasons.push(`${signal.reviewPriority} review priority`);
  }

  if (guidance.confidence.confidenceReasons[0]) {
    reasons.push(guidance.confidence.confidenceReasons[0]);
  }

  if (guidance.relatedPlaybookCards[0]) {
    reasons.push(`playbook support exists via ${guidance.relatedPlaybookCards[0].title}`);
  } else if (guidance.relatedPatterns[0]) {
    reasons.push(`pattern support exists via ${guidance.relatedPatterns[0].title}`);
  }

  if (assessment.draftQuality?.label === "Needs Review") {
    reasons.push("drafts look salvageable rather than broken");
  }

  return reasons[0]
    ? `Keep case: ${reasons.slice(0, 2).join(" and ")}.`
    : "Keep case: there is still enough signal here to justify operator judgement.";
}

function summarizeRejectCase(signal: SignalRecord, guidance: UnifiedGuidance, assessment: AutoAdvanceAssessment): string {
  const reasons: string[] = [];

  if (assessment.strongestCaution) {
    reasons.push(assessment.strongestCaution);
  }

  if (guidance.confidence.confidenceLevel === "low") {
    reasons.push("overall confidence is low");
  }

  if (assessment.draftQuality?.label === "Weak") {
    reasons.push("draft quality is weak");
  }

  if ((signal.sourceTrustScore ?? 100) <= 35) {
    reasons.push("source trust is thin");
  }

  return reasons[0]
    ? `Reject case: ${reasons.slice(0, 2).join(" and ")}.`
    : "Reject case: the current support is still too thin to move this forward safely.";
}

function summarizeMissingEvidence(signal: SignalRecord, guidance: UnifiedGuidance, assessment: AutoAdvanceAssessment): string {
  const missing: string[] = [];

  if (!signal.scenarioAngle) {
    missing.push("a clearer Scenario Angle");
  }

  if (guidance.relatedPlaybookCards.length === 0) {
    missing.push("stronger playbook support");
  }

  if (guidance.relatedPatterns.length === 0) {
    missing.push("a reliable pattern match");
  }

  if ((signal.sourceTrustScore ?? 100) <= 35) {
    missing.push("stronger source context");
  }

  if (assessment.draftQuality?.label === "Weak") {
    missing.push("a cleaner draft package");
  }

  return missing[0]
    ? `Missing evidence: ${missing.slice(0, 3).join(", ")}.`
    : "Missing evidence: the operator still needs a stronger case either to trust or to discard this record.";
}

function buildSuggestedRepairActions(signal: SignalRecord, guidance: UnifiedGuidance, assessment: AutoAdvanceAssessment): BorderlineSuggestedRepairAction[] {
  const actions: BorderlineSuggestedRepairAction[] = [];
  const plan = assessAutoRepairPlan(signal, guidance, assessment);

  if (plan.eligibility === "repairable" && plan.repairType) {
    actions.push(
      borderlineSuggestedRepairActionSchema.parse({
        key: plan.repairType,
        label:
          plan.repairType === "scenario_angle_reframe"
            ? "Apply framing repair"
            : plan.repairType === "editorial_mode_shift"
              ? "Shift editorial mode"
              : plan.repairType === "pattern_fallback"
                ? "Apply pattern-supported repair"
                : plan.repairType === "playbook_supported_reframe"
                  ? "Apply playbook-supported repair"
                  : "Retry draft package",
        summary: plan.notes[0] ?? plan.whyAttempted,
      }),
    );
  }

  if (!signal.rawExcerpt && !signal.manualSummary) {
    actions.push(
      borderlineSuggestedRepairActionSchema.parse({
        key: "request_more_context",
        label: "Request more context",
        summary: "The source context is thin enough that a little more detail could change the decision.",
      }),
    );
  } else if (actions.length === 0) {
    actions.push(
      borderlineSuggestedRepairActionSchema.parse({
        key: "request_more_context",
        label: "Request more context",
        summary: "If the current evidence still feels thin, ask for one more concrete source detail before deciding.",
      }),
    );
  }

  return actions.slice(0, 3);
}

export function buildBorderlineReviewModel(
  signal: SignalRecord,
  guidance: UnifiedGuidance,
  assessment: AutoAdvanceAssessment,
): BorderlineReviewModel | null {
  if (assessment.decision !== "hold") {
    return null;
  }

  return {
    borderlineReason: assessment.summary,
    bestCaseKeep: summarizeKeepCase(signal, guidance, assessment),
    bestCaseReject: summarizeRejectCase(signal, guidance, assessment),
    missingEvidence: summarizeMissingEvidence(signal, guidance, assessment),
    suggestedRepairActions: buildSuggestedRepairActions(signal, guidance, assessment),
  };
}

export function assessAutoRepairPlan(
  signal: SignalRecord,
  guidance: UnifiedGuidance,
  assessment: AutoAdvanceAssessment,
): AutoRepairPlan {
  const stage = assessment.stage;

  if (
    assessment.decision !== "hold" ||
    !stage ||
    signal.status === "Rejected" ||
    signal.status === "Archived" ||
    signal.status === "Posted"
  ) {
    return {
      eligibility: "not_repairable",
      repairType: null,
      whyAttempted: "This record is not in a repairable held state.",
      changedFields: [],
      updates: {},
      notes: [],
      rerunInterpretation: false,
      rerunGeneration: false,
    };
  }

  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: signal.scenarioAngle,
    sourceTitle: signal.sourceTitle,
  });
  const transformability = assessTransformability(signal);
  const suggestedMode = inferRepairMode(signal, guidance);
  const currentMode = signal.editorialMode;
  const cautionaryReuse = guidance.reuseMemory?.highlights.some((highlight) => highlight.tone === "caution") ?? false;
  const hasSupport = guidance.relatedPatterns.length > 0 || guidance.relatedPlaybookCards.length > 0;
  const veryWeakSourceFit =
    (signal.sourceTrustScore ?? 100) <= 35 &&
    transformability.label !== "High transformability";
  const noUsefulRepairPath =
    scenarioAssessment.quality !== "missing" &&
    scenarioAssessment.quality !== "weak" &&
    (!suggestedMode || suggestedMode === currentMode) &&
    !(stage === "auto_prepare_for_review" && assessment.draftQuality?.label === "Weak");

  if (
    veryWeakSourceFit ||
    (guidance.confidence.confidenceLevel === "low" && !hasSupport && scenarioAssessment.quality !== "weak" && scenarioAssessment.quality !== "missing") ||
    (cautionaryReuse && !hasSupport && scenarioAssessment.quality === "strong") ||
    noUsefulRepairPath
  ) {
    return {
      eligibility: "not_repairable",
      repairType: null,
      whyAttempted: "The hold reason looks fundamentally weak rather than fixable in one bounded pass.",
      changedFields: [],
      updates: {},
      notes: [],
      rerunInterpretation: false,
      rerunGeneration: false,
    };
  }

  const updates: Partial<SignalRecord> = {};
  const changedFields: string[] = [];
  const notes: string[] = [];
  let repairType: AutoRepairType;
  let whyAttempted: string;

  const canShiftMode = Boolean(suggestedMode && suggestedMode !== currentMode);

  if (scenarioAssessment.quality === "missing" || scenarioAssessment.quality === "weak") {
    const scenarioAngle = buildScenarioAngleReframe(signal);
    updates.scenarioAngle = scenarioAngle;
    changedFields.push("scenarioAngle");
    notes.push("Stronger Scenario Angle added.");
    if (canShiftMode && suggestedMode) {
      updates.editorialMode = suggestedMode;
      changedFields.push("editorialMode");
      notes.push(`Shifted to ${toSentenceCase(suggestedMode.replaceAll("_", " "))} mode.`);
    }
    repairType = "scenario_angle_reframe";
    whyAttempted = "The hold reason looked fixable through clearer framing.";
  } else if (canShiftMode && guidance.relatedPatterns[0]) {
    updates.editorialMode = suggestedMode ?? null;
    changedFields.push("editorialMode");
    notes.push(`Used pattern support from ${guidance.relatedPatterns[0].title}.`);
    repairType = "pattern_fallback";
    whyAttempted = "A stronger saved pattern suggested a better mode for this case.";
  } else if (canShiftMode && guidance.relatedPlaybookCards[0]) {
    updates.editorialMode = suggestedMode ?? null;
    changedFields.push("editorialMode");
    notes.push(`Used playbook support from ${guidance.relatedPlaybookCards[0].title}.`);
    repairType = "playbook_supported_reframe";
    whyAttempted = "A relevant playbook card suggested a safer framing for this case.";
  } else if (canShiftMode && suggestedMode) {
    updates.editorialMode = suggestedMode;
    changedFields.push("editorialMode");
    notes.push(`Switched to ${toSentenceCase(suggestedMode.replaceAll("_", " "))} mode.`);
    repairType = "editorial_mode_shift";
    whyAttempted = "The current editorial mode looked mismatched for the held case.";
  } else {
    repairType = "generation_retry";
    changedFields.push("xDraft", "linkedInDraft", "redditDraft");
    notes.push("Regenerated once with the existing framing and support.");
    whyAttempted = "The framing looked usable, but the draft package still needed one bounded retry.";
  }

  return {
    eligibility: "repairable",
    repairType,
    whyAttempted,
    changedFields,
    updates,
    notes,
    rerunInterpretation:
      stage === "auto_interpret" ||
      Boolean(updates.scenarioAngle),
    rerunGeneration:
      stage !== "auto_interpret",
  };
}

export function buildAutoRepairHistoryEntry(input: {
  stage: AutoAdvanceStage;
  plan: AutoRepairPlan;
  outcome: AutoRepairOutcome;
  summary: string;
}): AutoRepairHistoryEntry {
  const repairType = input.plan.repairType ?? "generation_retry";

  return autoRepairHistoryEntrySchema.parse({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    priorHoldStage: input.stage,
    repairType,
    outcome: input.outcome,
    summary: input.summary,
    whyAttempted: input.plan.whyAttempted,
    changedFields: input.plan.changedFields,
    changedTo: buildChangedToMap(input.plan.updates),
    notes: input.plan.notes,
  });
}
