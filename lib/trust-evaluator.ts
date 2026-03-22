import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import type { HookSet, HookVariant } from "@/lib/hook-engine";
import { inspectHookTrust } from "@/lib/hook-engine";
import type { MessageAngle } from "@/lib/message-angles";
import { inspectMessageAngleTrust } from "@/lib/message-angles";
import { evaluatePhaseBTrust } from "@/lib/phase-b-trust";
import type { VideoBrief } from "@/lib/video-briefs";
import { inspectVideoBriefTrust } from "@/lib/video-briefs";

export const trustAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  status: z.enum(["safe", "caution", "blocked"]),
  reasons: z.array(z.string().trim().min(1)),
  adjusted: z.boolean(),
});

export type TrustAssessment = z.infer<typeof trustAssessmentSchema>;

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function uniqueReasons(reasons: Array<string | null | undefined>): string[] {
  const nextReasons: string[] = [];

  for (const reason of reasons) {
    const normalized = normalizeText(reason);
    if (!normalized || nextReasons.includes(normalized)) {
      continue;
    }

    nextReasons.push(normalized);
  }

  return nextReasons;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function evaluateTrust(input: {
  penalty: number;
  reasons?: Array<string | null | undefined>;
  adjusted?: boolean;
  cautionAt?: number;
  blockedAt?: number;
}): TrustAssessment {
  const penalty = Math.max(0, Math.round(input.penalty));
  const adjusted = Boolean(input.adjusted);
  const cautionAt = input.cautionAt ?? 16;
  const blockedAt = input.blockedAt ?? 32;
  const score = clampScore(100 - penalty * 2 - (adjusted ? 8 : 0));
  const reasons = uniqueReasons(input.reasons ?? []);
  const status =
    penalty >= blockedAt
      ? "blocked"
      : penalty >= cautionAt || adjusted
        ? "caution"
        : "safe";

  return trustAssessmentSchema.parse({
    score,
    status,
    reasons,
    adjusted,
  });
}

function buildOpportunityTrustText(opportunity: ContentOpportunity): string {
  return [
    opportunity.title,
    opportunity.primaryPainPoint,
    ...opportunity.teacherLanguage,
    opportunity.recommendedAngle,
    opportunity.whyNow,
    opportunity.riskSummary ?? "",
    opportunity.memoryContext.audienceCue ?? "",
    opportunity.memoryContext.caution ?? "",
    ...opportunity.supportingSignals,
  ].join(" ");
}

export function evaluateOpportunityTrust(
  opportunity: ContentOpportunity,
): TrustAssessment {
  const trustCheck = evaluatePhaseBTrust(buildOpportunityTrustText(opportunity));
  let penalty = trustCheck.penalty;
  const reasons = [...trustCheck.reasons];
  let adjusted = false;

  if (opportunity.teacherLanguage.length === 0) {
    penalty += 12;
    reasons.push("teacher-language-missing");
    adjusted = true;
  }

  if (!normalizeText(opportunity.primaryPainPoint)) {
    penalty += 12;
    reasons.push("pain-point-missing");
    adjusted = true;
  }

  if (opportunity.trustRisk === "medium") {
    penalty += 8;
    reasons.push("opportunity-medium-trust-risk");
    adjusted = true;
  }

  if (opportunity.trustRisk === "high") {
    penalty += 20;
    reasons.push("opportunity-high-trust-risk");
    adjusted = true;
  }

  return evaluateTrust({
    penalty,
    reasons,
    adjusted,
  });
}

export function evaluateAngleTrust(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
): TrustAssessment {
  const diagnostics = inspectMessageAngleTrust(opportunity, angle);
  let penalty = diagnostics.penalty;
  const reasons = [...diagnostics.reasons];
  let adjusted = diagnostics.isLowQuality;

  if (diagnostics.isLowQuality) {
    reasons.push("angle-low-quality");
  }

  if (angle.trustRisk === "medium") {
    penalty += 4;
    reasons.push("angle-medium-trust-risk");
    adjusted = true;
  }

  if (angle.trustRisk === "high") {
    penalty += 8;
    reasons.push("angle-high-trust-risk");
    adjusted = true;
  }

  return evaluateTrust({
    penalty,
    reasons,
    adjusted,
    blockedAt: 24,
  });
}

export function evaluateHookTrust(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hook: HookVariant,
): TrustAssessment {
  const diagnostics = inspectHookTrust(opportunity, angle, hook);
  let penalty = diagnostics.penalty;
  const reasons = [...diagnostics.reasons];
  let adjusted = false;

  if (angle.trustRisk === "medium") {
    penalty += 4;
    reasons.push("angle-medium-trust-risk");
    adjusted = true;
  }

  if (angle.trustRisk === "high") {
    penalty += 8;
    reasons.push("angle-high-trust-risk");
    adjusted = true;
  }

  return evaluateTrust({
    penalty,
    reasons,
    adjusted,
    blockedAt: 24,
  });
}

export function evaluateVideoBriefTrust(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
  brief: VideoBrief,
): TrustAssessment {
  const diagnostics = inspectVideoBriefTrust(opportunity, angle, hookSet, brief);
  let penalty = diagnostics.penalty;
  const reasons = [...diagnostics.reasons];
  let adjusted = diagnostics.wasSanitized || diagnostics.usedFallback;

  if (diagnostics.anchorOverlap < 6) {
    penalty += 8;
    reasons.push("brief-anchor-thin");
    adjusted = true;
  }

  if (diagnostics.wasSanitized) {
    reasons.push("video-brief-sanitized");
  }

  if (diagnostics.usedFallback) {
    reasons.push("video-brief-used-fallback");
  }

  return evaluateTrust({
    penalty,
    reasons,
    adjusted,
  });
}
