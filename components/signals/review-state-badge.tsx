"use client";

import { Badge } from "@/components/ui/badge";
import { getReviewStateBadgeClasses } from "@/lib/review-command-center";

export function ReviewStateBadge({
  tone,
  children,
}: {
  tone:
    | "high_confidence"
    | "medium_confidence"
    | "low_confidence"
    | "complete"
    | "mostly_complete"
    | "partial"
    | "high_value"
    | "medium_value"
    | "low_value"
    | "fatigue_low"
    | "fatigue_moderate"
    | "ready"
    | "needs_edit"
    | "skip"
    | "posted"
    | "experiment"
    | "autofill"
    | "aging"
    | "stale"
    | "stale_reusable"
    | "neutral";
  children: React.ReactNode;
}) {
  return <Badge className={getReviewStateBadgeClasses(tone)}>{children}</Badge>;
}
