import { rankApprovalCandidates, type ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { SignalRecord } from "@/types/signal";

export function sortSignalsByAutonomousPriority(signals: SignalRecord[]): SignalRecord[] {
  const priorityWeight: Record<NonNullable<SignalRecord["reviewPriority"]>, number> = {
    Urgent: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };

  return [...signals].sort(
    (left, right) =>
      (priorityWeight[right.reviewPriority ?? "Low"] ?? 0) - (priorityWeight[left.reviewPriority ?? "Low"] ?? 0) ||
      (right.signalUrgencyScore ?? 0) - (left.signalUrgencyScore ?? 0) ||
      new Date(right.createdDate).getTime() - new Date(left.createdDate).getTime() ||
      left.sourceTitle.localeCompare(right.sourceTitle),
  );
}

export interface RankApprovalReadySignalsInput {
  candidates: Parameters<typeof rankApprovalCandidates>[0];
  limit: number;
  context: Parameters<typeof rankApprovalCandidates>[2];
}

export function rankApprovalReadySignals(input: RankApprovalReadySignalsInput): ApprovalQueueCandidate[] {
  return rankApprovalCandidates(input.candidates, input.limit, input.context);
}
