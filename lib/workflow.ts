import { toSignalEnvelope } from "@/lib/signal-envelope";
import {
  hasReviewableDraftPackage,
  isFilteredOutSignal,
  resolveWorkflowState,
} from "@/lib/workflow-state-machine";
import type { SignalCategory, SignalEnvelope, SignalRecord, SignalStatus } from "@/types/signal";

export type SignalsSortKey = "createdDate-desc" | "createdDate-asc" | "sourceDate-desc" | "sourceDate-asc";

export interface SignalFilters {
  status?: SignalStatus;
  category?: SignalCategory;
  sourceType?: string;
  sort?: SignalsSortKey;
}

export interface AutomationReadinessSnapshot {
  label: "Not assessed" | "Partially assessed" | "Prepared for automation" | "Needs human review" | "Filtered out";
  tone: "neutral" | "warning" | "success";
  completedChecks: number;
  totalChecks: number;
}

type SignalWorkflowSource = SignalRecord | SignalEnvelope;

function parseDateValue(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export { hasGeneration, hasInterpretation, hasReviewableDraftPackage, hasScoring, isFilteredOutSignal } from "@/lib/workflow-state-machine";

export function filterSignals(signals: SignalRecord[], filters: SignalFilters): SignalRecord[] {
  return signals.filter((signal) => {
    if (filters.status && signal.status !== filters.status) {
      return false;
    }
    if (filters.category && signal.signalCategory !== filters.category) {
      return false;
    }
    if (filters.sourceType && signal.sourceType !== filters.sourceType) {
      return false;
    }
    return true;
  });
}

export function sortSignals(signals: SignalRecord[], sort: SignalsSortKey = "createdDate-desc"): SignalRecord[] {
  const sorted = [...signals];

  sorted.sort((left, right) => {
    switch (sort) {
      case "createdDate-asc":
        return parseDateValue(left.createdDate) - parseDateValue(right.createdDate);
      case "sourceDate-asc":
        return parseDateValue(left.sourceDate) - parseDateValue(right.sourceDate);
      case "sourceDate-desc":
        return parseDateValue(right.sourceDate) - parseDateValue(left.sourceDate);
      case "createdDate-desc":
      default:
        return parseDateValue(right.createdDate) - parseDateValue(left.createdDate);
    }
  });

  return sorted;
}

export function getWorkflowBuckets(signals: SignalRecord[]) {
  return {
    needsInterpretation: signals.filter((signal) => {
      if (isFilteredOutSignal(signal)) {
        return false;
      }

      const state = resolveWorkflowState(signal);
      return state === "NEW" || state === "SCORED" || signal.status === "New";
    }),
    readyForGeneration: signals.filter((signal) => !isFilteredOutSignal(signal) && resolveWorkflowState(signal) === "INTERPRETED"),
    readyForReview: signals.filter((signal) => {
      const state = resolveWorkflowState(signal);
      return hasReviewableDraftPackage(signal) && (state === "GENERATED" || state === "REVIEW_READY");
    }),
    readyToSchedule: signals.filter((signal) => resolveWorkflowState(signal) === "APPROVED"),
    scheduledAwaitingPosting: signals.filter((signal) => resolveWorkflowState(signal) === "SCHEDULED"),
    filteredOut: signals.filter((signal) => resolveWorkflowState(signal) === "REJECTED"),
  };
}

export function getScheduledSoonSignals(signals: SignalRecord[], daysAhead = 7): SignalRecord[] {
  const now = Date.now();
  const end = now + daysAhead * 24 * 60 * 60 * 1000;

  return signals.filter((signal) => {
    const scheduledAt = parseDateValue(signal.scheduledDate);
    return resolveWorkflowState(signal) === "SCHEDULED" && scheduledAt >= now && scheduledAt <= end;
  });
}

export function getAutomationReadinessSnapshot(signal: SignalWorkflowSource): AutomationReadinessSnapshot {
  const envelope = toSignalEnvelope(signal);
  const readinessChecks = [
    envelope.score.signalRelevanceScore,
    envelope.score.signalNoveltyScore,
    envelope.score.signalUrgencyScore,
    envelope.score.brandFitScore,
    envelope.score.sourceTrustScore,
    envelope.score.keepRejectRecommendation,
    envelope.score.qualityGateResult,
    envelope.score.reviewPriority,
  ];

  const completedChecks = readinessChecks.filter((value) => value !== null && value !== undefined).length;
  const totalChecks = readinessChecks.length;

  if (envelope.score.needsHumanReview) {
    return {
      label: "Needs human review",
      tone: "warning",
      completedChecks,
      totalChecks,
    };
  }

  if (envelope.score.qualityGateResult === "Fail" || envelope.score.keepRejectRecommendation === "Reject") {
    return {
      label: "Filtered out",
      tone: "neutral",
      completedChecks,
      totalChecks,
    };
  }

  if (completedChecks === 0) {
    return {
      label: "Not assessed",
      tone: "neutral",
      completedChecks,
      totalChecks,
    };
  }

  if (completedChecks === totalChecks) {
    return {
      label: "Prepared for automation",
      tone: "success",
      completedChecks,
      totalChecks,
    };
  }

  return {
    label: "Partially assessed",
    tone: "warning",
    completedChecks,
    totalChecks,
  };
}
