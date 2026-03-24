import { toSignalEnvelope } from "@/lib/signal-envelope";
import type { SignalEnvelope, SignalRecord, SignalStatus } from "@/types/signal";

export const WORKFLOW_STATES = [
  "NEW",
  "SCORED",
  "INTERPRETED",
  "GENERATED",
  "REVIEW_READY",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export interface WorkflowTransitionValidation {
  valid: boolean;
  from: WorkflowState;
  to: WorkflowState;
  reason?: string;
}

type SignalWorkflowSource = SignalRecord | SignalEnvelope;

const WORKFLOW_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  NEW: ["SCORED", "REJECTED", "ARCHIVED"],
  SCORED: ["NEW", "INTERPRETED", "REJECTED", "ARCHIVED"],
  INTERPRETED: ["SCORED", "GENERATED", "REJECTED", "ARCHIVED"],
  GENERATED: ["INTERPRETED", "REVIEW_READY", "APPROVED", "REJECTED", "ARCHIVED"],
  REVIEW_READY: ["GENERATED", "APPROVED", "REJECTED", "ARCHIVED"],
  APPROVED: ["GENERATED", "REVIEW_READY", "SCHEDULED", "PUBLISHED", "REJECTED", "ARCHIVED"],
  SCHEDULED: ["APPROVED", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  REJECTED: ["NEW", "SCORED", "INTERPRETED", "ARCHIVED"],
  ARCHIVED: [],
};

export function isFilteredOutSignal(signal: SignalWorkflowSource): boolean {
  const envelope = toSignalEnvelope(signal);
  return (
    envelope.meta.status === "Rejected" ||
    envelope.score.keepRejectRecommendation === "Reject" ||
    envelope.score.qualityGateResult === "Fail"
  );
}

export function hasScoring(signal: SignalWorkflowSource): boolean {
  const envelope = toSignalEnvelope(signal);
  return Boolean(
    envelope.score.signalRelevanceScore !== null &&
      envelope.score.signalNoveltyScore !== null &&
      envelope.score.signalUrgencyScore !== null &&
      envelope.score.brandFitScore !== null &&
      envelope.score.sourceTrustScore !== null &&
      envelope.score.keepRejectRecommendation &&
      envelope.score.qualityGateResult &&
      envelope.score.reviewPriority &&
      envelope.score.needsHumanReview !== null,
  );
}

export function hasInterpretation(signal: SignalWorkflowSource): boolean {
  const envelope = toSignalEnvelope(signal);
  return Boolean(
    envelope.interpretation.signalCategory &&
      envelope.interpretation.severityScore &&
      envelope.interpretation.signalSubtype &&
      envelope.interpretation.emotionalPattern &&
      envelope.interpretation.teacherPainPoint &&
      envelope.interpretation.relevanceToZazaDraft &&
      envelope.interpretation.riskToTeacher &&
      envelope.interpretation.interpretationNotes &&
      envelope.interpretation.hookTemplateUsed &&
      envelope.interpretation.contentAngle &&
      envelope.interpretation.platformPriority &&
      envelope.interpretation.suggestedFormatPriority,
  );
}

export function hasGeneration(signal: SignalWorkflowSource): boolean {
  const envelope = toSignalEnvelope(signal);
  return Boolean(
    envelope.draft.xDraft &&
      envelope.draft.linkedInDraft &&
      envelope.draft.redditDraft &&
      envelope.draft.imagePrompt &&
      envelope.draft.videoScript &&
      envelope.draft.ctaOrClosingLine,
  );
}

export function hasReviewableDraftPackage(signal: SignalWorkflowSource): boolean {
  const envelope = toSignalEnvelope(signal);

  if (hasGeneration(signal)) {
    return true;
  }

  const hasCoreTextDrafts = Boolean(envelope.draft.xDraft && envelope.draft.linkedInDraft && envelope.draft.redditDraft);
  const hasSupportingCreative = Boolean(envelope.draft.imagePrompt || envelope.draft.videoScript);
  const isLegacyReviewState = envelope.meta.status === "Draft Generated" || envelope.meta.status === "Reviewed";

  return hasCoreTextDrafts && hasSupportingCreative && isLegacyReviewState;
}

export function mapSignalStatusToWorkflowState(status: SignalStatus): WorkflowState {
  switch (status) {
    case "Interpreted":
      return "INTERPRETED";
    case "Draft Generated":
      return "GENERATED";
    case "Reviewed":
      return "REVIEW_READY";
    case "Approved":
      return "APPROVED";
    case "Scheduled":
      return "SCHEDULED";
    case "Posted":
      return "PUBLISHED";
    case "Archived":
      return "ARCHIVED";
    case "Rejected":
      return "REJECTED";
    case "New":
    default:
      return "NEW";
  }
}

export function resolveWorkflowState(signal: SignalWorkflowSource): WorkflowState {
  const envelope = toSignalEnvelope(signal);
  const explicitState = mapSignalStatusToWorkflowState(envelope.meta.status);

  if (explicitState !== "NEW") {
    return explicitState;
  }

  if (isFilteredOutSignal(envelope)) {
    return "REJECTED";
  }

  if (hasReviewableDraftPackage(envelope)) {
    return "GENERATED";
  }

  if (hasInterpretation(envelope)) {
    return "INTERPRETED";
  }

  if (hasScoring(envelope)) {
    return "SCORED";
  }

  return "NEW";
}

export function canTransitionWorkflowState(from: WorkflowState, to: WorkflowState): boolean {
  return from === to || WORKFLOW_TRANSITIONS[from].includes(to);
}

export function validateWorkflowTransition(
  signalOrState: SignalWorkflowSource | WorkflowState,
  to: WorkflowState,
): WorkflowTransitionValidation {
  const from = typeof signalOrState === "string" ? signalOrState : resolveWorkflowState(signalOrState);

  if (canTransitionWorkflowState(from, to)) {
    return {
      valid: true,
      from,
      to,
    };
  }

  return {
    valid: false,
    from,
    to,
    reason: `Cannot transition workflow from ${from} to ${to}.`,
  };
}

export function assertValidWorkflowTransition(
  signalOrState: SignalWorkflowSource | WorkflowState,
  to: WorkflowState,
): void {
  const validation = validateWorkflowTransition(signalOrState, to);

  if (!validation.valid) {
    throw new Error(validation.reason ?? `Cannot transition workflow from ${validation.from} to ${validation.to}.`);
  }
}
