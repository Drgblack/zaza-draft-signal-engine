import type { SignalCategory, SignalRecord, SignalStatus } from "@/types/signal";

export type SignalsSortKey = "createdDate-desc" | "createdDate-asc" | "sourceDate-desc" | "sourceDate-asc";

export interface SignalFilters {
  status?: SignalStatus;
  category?: SignalCategory;
  sourceType?: string;
  sort?: SignalsSortKey;
}

export interface AutomationReadinessSnapshot {
  label: "Not assessed" | "Partially assessed" | "Prepared for automation" | "Needs human review";
  tone: "neutral" | "warning" | "success";
  completedChecks: number;
  totalChecks: number;
}

function parseDateValue(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasInterpretation(signal: SignalRecord): boolean {
  return Boolean(
    signal.signalCategory &&
      signal.severityScore &&
      signal.signalSubtype &&
      signal.emotionalPattern &&
      signal.teacherPainPoint &&
      signal.relevanceToZazaDraft &&
      signal.riskToTeacher &&
      signal.interpretationNotes &&
      signal.hookTemplateUsed &&
      signal.contentAngle &&
      signal.platformPriority &&
      signal.suggestedFormatPriority,
  );
}

export function hasGeneration(signal: SignalRecord): boolean {
  return Boolean(
    signal.xDraft &&
      signal.linkedInDraft &&
      signal.redditDraft &&
      signal.imagePrompt &&
      signal.videoScript &&
      signal.ctaOrClosingLine,
  );
}

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
    needsInterpretation: signals.filter((signal) => !hasInterpretation(signal) || signal.status === "New"),
    readyForGeneration: signals.filter((signal) => hasInterpretation(signal) && !hasGeneration(signal)),
    readyForReview: signals.filter((signal) => hasGeneration(signal) && ["Draft Generated", "Reviewed"].includes(signal.status)),
    readyToSchedule: signals.filter((signal) => signal.status === "Approved"),
    scheduledAwaitingPosting: signals.filter((signal) => signal.status === "Scheduled"),
  };
}

export function getScheduledSoonSignals(signals: SignalRecord[], daysAhead = 7): SignalRecord[] {
  const now = Date.now();
  const end = now + daysAhead * 24 * 60 * 60 * 1000;

  return signals.filter((signal) => {
    const scheduledAt = parseDateValue(signal.scheduledDate);
    return signal.status === "Scheduled" && scheduledAt >= now && scheduledAt <= end;
  });
}

export function getAutomationReadinessSnapshot(signal: SignalRecord): AutomationReadinessSnapshot {
  const readinessChecks = [
    signal.signalRelevanceScore,
    signal.signalNoveltyScore,
    signal.signalUrgencyScore,
    signal.brandFitScore,
    signal.sourceTrustScore,
    signal.keepRejectRecommendation,
    signal.qualityGateResult,
    signal.reviewPriority,
  ];

  const completedChecks = readinessChecks.filter((value) => value !== null && value !== undefined).length;
  const totalChecks = readinessChecks.length;

  if (signal.needsHumanReview) {
    return {
      label: "Needs human review",
      tone: "warning",
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
