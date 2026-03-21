"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ReviewStateBadge } from "@/components/signals/review-state-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAutoRepairLabel, getLatestAutoRepairEntry } from "@/lib/auto-repair";
import { buildAssetBundleSummary, buildSignalAssetBundle } from "@/lib/assets";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { getOutcomeQualityLabel, getReuseRecommendationLabel } from "@/lib/outcome-memory";
import { buildPublishPrepBundleSummary, buildSignalPublishPrepBundle } from "@/lib/publish-prep";
import {
  matchesApprovalCandidateView,
  REVIEW_COMMAND_CENTER_VIEWS,
  type ReviewCommandCenterViewId,
} from "@/lib/review-command-center";
import { getQueueTriageLabel, type QueueTriageState } from "@/lib/queue-triage";
import { buildRepurposingBundleSummary, buildSignalRepurposingBundle } from "@/lib/repurposing";
import { getStrategicValueLabel } from "@/lib/strategic-outcome-memory";
import { formatDate } from "@/lib/utils";
import type { StaleQueueActionResponse } from "@/types/api";
import type { SignalRecord } from "@/types/signal";
import type { AutomationConfidenceLevel } from "@/lib/confidence";
import type { DistributionPriorityAssessment } from "@/lib/distribution-priority";
import type { ExecutionChainAssessment } from "@/lib/execution-chains";
import type { PreReviewRepairResult } from "@/lib/review-repair";
import type { CommercialRiskAssessment } from "@/lib/risk-guardrails";
import type { RevenueAmplifierMatch } from "@/lib/revenue-amplifier";
import type { StaleQueueOperatorAction } from "@/lib/stale-queue";

type Candidate = {
  signal: SignalRecord;
  guidance: {
    confidence: { confidenceLevel: "high" | "moderate" | "low" };
    cautionNotes: string[];
    primaryAction: string;
    relatedPlaybookCards: Array<{ title: string }>;
    relatedPatterns: Array<{ title: string }>;
  };
  assessment: {
    stage: "auto_interpret" | "auto_generate" | "auto_prepare_for_review" | null;
    summary: string;
    reasons: string[];
    strongestCaution: string | null;
    suggestedPlatformPriority?: string | null;
  };
  completeness: {
    completenessState: "complete" | "mostly_complete" | "incomplete";
    completenessScore: number;
    missingElements: string[];
  };
  fatigue: {
    warnings: Array<{ label: string; severity: "low" | "moderate"; summary: string }>;
  };
  hypothesis: {
    objective: string;
    whyItMayWork: string;
    keyLevers: string[];
  };
  expectedOutcome: {
    expectedOutcomeTier: "high" | "medium" | "low";
    expectedOutcomeReasons: string[];
    riskSignals: string[];
    positiveSignals: string[];
  };
  conversionIntent: {
    posture: "awareness_first" | "trust_first" | "soft_conversion" | "direct_conversion";
    whyChosen: string[];
    cautionNotes: string[];
  };
  conflicts: {
    conflicts: Array<{
      conflictType:
        | "cta_destination_mismatch"
        | "mode_funnel_mismatch"
        | "platform_tone_mismatch"
        | "hypothesis_package_mismatch"
        | "campaign_context_mismatch"
        | "expected_outcome_mismatch"
        | "destination_overreach"
        | "reddit_promo_conflict";
      severity: "low" | "medium" | "high";
      reason: string;
      suggestedFix?: string | null;
      platform?: "x" | "linkedin" | "reddit" | null;
    }>;
    topConflicts: Array<{
      conflictType:
        | "cta_destination_mismatch"
        | "mode_funnel_mismatch"
        | "platform_tone_mismatch"
        | "hypothesis_package_mismatch"
        | "campaign_context_mismatch"
        | "expected_outcome_mismatch"
        | "destination_overreach"
        | "reddit_promo_conflict";
      severity: "low" | "medium" | "high";
      reason: string;
      suggestedFix?: string | null;
      platform?: "x" | "linkedin" | "reddit" | null;
    }>;
    summary: string[];
    highestSeverity: "low" | "medium" | "high" | null;
    requiresJudgement: boolean;
  };
  packageAutofill: {
    mode: "applied" | "suggested" | "blocked";
    notes: Array<{ label: string; value: string }>;
    policy: {
      summary: string;
    };
  };
  automationConfidence: {
    level: AutomationConfidenceLevel;
    summary: string;
    reasons: string[];
    requiresOperatorJudgement: boolean;
  };
  distributionPriority: Pick<
    DistributionPriorityAssessment,
    | "primaryPlatform"
    | "primaryPlatformLabel"
    | "secondaryPlatforms"
    | "secondaryPlatformLabels"
    | "distributionStrategy"
    | "reason"
  >;
  commercialRisk: Pick<CommercialRiskAssessment, "risks" | "highestSeverity" | "decision" | "summary" | "topRisk">;
  revenueAmplifierMatch: RevenueAmplifierMatch | null;
  executionChain: Pick<ExecutionChainAssessment, "status" | "summary" | "chainType">;
  stale: {
    state: "fresh" | "aging" | "stale" | "stale_but_reusable" | "stale_needs_refresh";
    summary: string;
    actionSummary: string;
    reasons: Array<{ code: string; label: string; summary: string }>;
    operatorAction: StaleQueueOperatorAction | null;
    operatorActionNote: string | null;
    isSuppressedFromTopQueue: boolean;
  };
  preReviewRepair: Pick<PreReviewRepairResult, "decision" | "summary" | "repairs">;
  triage: {
    triageState: QueueTriageState;
    reason: string;
    supportingSignals: string[];
    suggestedNextAction: string;
    summary: string;
  };
  rankReasons: string[];
};

type EvergreenCandidate = {
  id: string;
  signalId: string;
  signal: SignalRecord;
  reuseMode: "reuse_directly" | "adapt_before_reuse";
  reasons: string[];
  weeklyGapReasons: string[];
  surfacedPlatform: string | null;
  priorPostDate: string | null;
  priorOutcomeQuality: "strong" | "acceptable" | "weak";
  priorReuseRecommendation: "reuse_this_approach" | "adapt_before_reuse" | "do_not_repeat";
  strategicValue: "high" | "medium" | "low" | "unclear" | null;
  editorialModeLabel: string | null;
  funnelStage: string | null;
  sourceLineageLabel: string;
  campaignLabel: string | null;
  pillarLabel: string | null;
  destinationLabel: string | null;
  patternName: string | null;
  bundleNames: string[];
};

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function getConfidenceLabel(level: AutomationConfidenceLevel): string {
  return level === "high" ? "High" : level === "low" ? "Low" : "Medium";
}

function getAutofillHeading(mode: Candidate["packageAutofill"]["mode"]): string {
  if (mode === "suggested") {
    return "What could be auto-filled";
  }

  if (mode === "blocked") {
    return "Autofill status";
  }

  return "What was auto-filled";
}

function formatContextLabel(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.replaceAll(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function chipLabel(candidate: Candidate, experimentCount: number, hasRepair: boolean): string[] {
  const chips = new Set<string>();
  if (candidate.expectedOutcome.positiveSignals.some((value) => value.toLowerCase().includes("destination"))) chips.add("strong destination history");
  if (candidate.packageAutofill.mode === "applied" && candidate.packageAutofill.notes.length > 0) chips.add("package autofilled");
  if (candidate.packageAutofill.mode === "suggested" && candidate.packageAutofill.notes.length > 0) chips.add("autofill suggested");
  if (candidate.fatigue.warnings.some((warning) => warning.label.toLowerCase().includes("cta"))) chips.add("CTA fatigue");
  if (experimentCount > 0) chips.add("active experiment");
  if (candidate.expectedOutcome.riskSignals.some((value) => value.toLowerCase().includes("evidence"))) chips.add("low evidence");
  if (candidate.rankReasons.some((value) => value.toLowerCase().includes("campaign"))) chips.add("campaign critical");
  if (candidate.conversionIntent.posture === "trust_first") chips.add("trust posture");
  if (candidate.conversionIntent.posture === "soft_conversion") chips.add("soft conversion");
  if (candidate.conversionIntent.posture === "direct_conversion") chips.add("direct conversion");
  if (candidate.distributionPriority.distributionStrategy === "multi") chips.add("multi-platform");
  if (candidate.distributionPriority.distributionStrategy === "experimental") chips.add("distribution test");
  if (candidate.revenueAmplifierMatch) chips.add("revenue-backed");
  if (hasRepair) chips.add("auto-repaired");
  if (candidate.commercialRisk.decision === "block") chips.add("risk blocked");
  if (candidate.commercialRisk.decision === "suggest_fix") chips.add("risk fix suggested");
  return [...chips].slice(0, 5);
}

function commercialRiskTone(
  severity: Candidate["commercialRisk"]["highestSeverity"],
): "neutral" | "aging" | "stale" {
  if (severity === "high") {
    return "stale";
  }

  if (severity === "medium") {
    return "aging";
  }

  return "neutral";
}

function commercialRiskLabel(
  riskType: NonNullable<Candidate["commercialRisk"]["topRisk"]>["riskType"],
) {
  switch (riskType) {
    case "over_aggressive_cta":
      return "CTA too strong";
    case "weak_claim":
      return "Weak claim";
    case "repetitive_pattern":
      return "Repetitive pattern";
    case "brand_tone_drift":
      return "Brand drift";
    case "audience_mismatch":
      return "Audience mismatch";
    case "low_evidence_assertion":
      return "Low-evidence assertion";
    case "fatigue_risk":
    default:
      return "Fatigue risk";
  }
}

function conversionIntentLabel(posture: Candidate["conversionIntent"]["posture"]): string {
  switch (posture) {
    case "awareness_first":
      return "Awareness-first";
    case "trust_first":
      return "Trust-first";
    case "soft_conversion":
      return "Soft conversion";
    case "direct_conversion":
    default:
      return "Direct conversion";
  }
}

function distributionStrategyLabel(strategy: Candidate["distributionPriority"]["distributionStrategy"]): string {
  switch (strategy) {
    case "multi":
      return "Multi-platform";
    case "experimental":
      return "Experimental";
    case "single":
    default:
      return "Single-platform";
  }
}

function conflictTone(severity: "low" | "medium" | "high" | null): "neutral" | "aging" | "stale" {
  if (severity === "high") {
    return "stale";
  }

  if (severity === "medium") {
    return "aging";
  }

  return "neutral";
}

function conflictLabel(
  type: Candidate["conflicts"]["conflicts"][number]["conflictType"],
): string {
  switch (type) {
    case "cta_destination_mismatch":
      return "CTA / destination mismatch";
    case "mode_funnel_mismatch":
      return "Mode / funnel mismatch";
    case "platform_tone_mismatch":
      return "Platform / tone mismatch";
    case "hypothesis_package_mismatch":
      return "Hypothesis / package mismatch";
    case "campaign_context_mismatch":
      return "Campaign context mismatch";
    case "expected_outcome_mismatch":
      return "Expected outcome mismatch";
    case "destination_overreach":
      return "Destination overreach";
    case "reddit_promo_conflict":
    default:
      return "Reddit promo conflict";
  }
}

function staleTone(state: Candidate["stale"]["state"]): "aging" | "stale" | "stale_reusable" | "neutral" {
  if (state === "aging") {
    return "aging";
  }

  if (state === "stale_but_reusable") {
    return "stale_reusable";
  }

  if (state === "stale" || state === "stale_needs_refresh") {
    return "stale";
  }

  return "neutral";
}

function triageTone(
  state: Candidate["triage"]["triageState"],
): "high_value" | "autofill" | "aging" | "stale_reusable" | "stale" {
  switch (state) {
    case "approve_ready":
      return "high_value";
    case "repairable":
      return "autofill";
    case "needs_judgement":
      return "aging";
    case "stale_but_reusable":
      return "stale_reusable";
    case "suppress":
    default:
      return "stale";
  }
}

function shouldShowStaleActions(candidate: Candidate): boolean {
  return candidate.stale.state !== "fresh" || candidate.stale.operatorAction !== null;
}

function staleOperatorActionLabel(action: StaleQueueOperatorAction): string {
  switch (action) {
    case "keep_anyway":
      return "Keep anyway";
    case "refresh_requested":
      return "Refresh requested";
    case "move_to_evergreen_later":
      return "Evergreen later";
    case "suppress":
    default:
      return "Suppressed";
  }
}

export function ApprovalQueueSection({
  candidates,
  initialView = "all",
  experimentContextsBySignalId,
}: {
  candidates: Candidate[];
  strategy: unknown;
  cadence: unknown;
  weeklyPlan: unknown;
  weeklyPlanState: unknown;
  initialView?: ReviewCommandCenterViewId;
  experimentContextsBySignalId?: Record<string, Array<{ name: string; statusLabel: string; learningGoal: string | null; comparisonTarget: string | null; variantLabels: string[] }>>;
}) {
  const router = useRouter();
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [activeView, setActiveView] = useState<ReviewCommandCenterViewId>(initialView);
  const [staleFeedback, setStaleFeedback] = useState<string | null>(null);
  const [isPendingAction, startTransition] = useTransition();

  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((candidate) =>
        matchesApprovalCandidateView(candidate, activeView, {
              experimentCount: experimentContextsBySignalId?.[candidate.signal.recordId]?.length ?? 0,
              hasRepair: Boolean(getLatestAutoRepairEntry(candidate.signal)) || candidate.preReviewRepair.decision === "applied",
            }),
          ),
    [activeView, candidates, experimentContextsBySignalId],
  );

  const viewCounts = useMemo(
    () =>
      Object.fromEntries(
        REVIEW_COMMAND_CENTER_VIEWS.map((view) => [
          view.id,
          candidates.filter((candidate) =>
            matchesApprovalCandidateView(candidate, view.id, {
              experimentCount: experimentContextsBySignalId?.[candidate.signal.recordId]?.length ?? 0,
              hasRepair: Boolean(getLatestAutoRepairEntry(candidate.signal)) || candidate.preReviewRepair.decision === "applied",
            }),
          ).length,
        ]),
      ) as Record<ReviewCommandCenterViewId, number>,
    [candidates, experimentContextsBySignalId],
  );
  const triageCounts = useMemo(
    () =>
      Object.fromEntries(
        ["approve_ready", "repairable", "needs_judgement", "stale_but_reusable", "suppress"].map((state) => [
          state,
          candidates.filter((candidate) => candidate.triage.triageState === state).length,
        ]),
      ) as Record<QueueTriageState, number>,
    [candidates],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || filteredCandidates.length === 0) return;
      if (event.key === "?") {
        event.preventDefault();
        setShowShortcutHelp((current) => !current);
        return;
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, filteredCandidates.length - 1));
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }
      const active = filteredCandidates[activeIndex];
      if (!active) return;
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        setExpandedById((current) => ({ ...current, [active.signal.recordId]: !current[active.signal.recordId] }));
        return;
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        window.location.href = `/signals/${active.signal.recordId}/review`;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, filteredCandidates]);

  function handleStaleAction(signalId: string, action: StaleQueueOperatorAction) {
    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/stale-queue", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              signalId,
              action,
            }),
          });
          const data = (await response.json().catch(() => null)) as StaleQueueActionResponse | null;

          if (!response.ok || !data?.success) {
            throw new Error(data?.error ?? "Unable to update stale queue state.");
          }

          setStaleFeedback(data.message);
          if (action === "refresh_requested") {
            router.push(`/signals/${signalId}/review`);
            return;
          }

          router.refresh();
        } catch (error) {
          setStaleFeedback(error instanceof Error ? error.message : "Unable to update stale queue state.");
        }
      })();
    });
  }

  return (
    <div id="approval-ready">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <span>Approval-Ready Queue</span>
            <span className="text-sm font-medium text-slate-500">{filteredCandidates.length} shown</span>
          </CardTitle>
          <CardDescription>Compressed command lane for near-finished candidates. Expand detail only when you need support context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            {REVIEW_COMMAND_CENTER_VIEWS.filter((view) => ["all", "ready_to_approve", "needs_judgement", "stale", "missing_outcomes", "experiment_linked", "fatigued", "campaign_critical", "auto_repaired"].includes(view.id)).map((view) => (
              <button key={view.id} type="button" onClick={() => setActiveView(view.id)} className={`rounded-2xl border px-4 py-4 text-left transition ${activeView === view.id ? "border-[color:var(--accent)]/40 bg-white shadow-sm" : "border-black/5 bg-white/70 hover:bg-white"}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-950">{view.label}</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{viewCounts[view.id]}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{view.summary}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {(
              [
                "approve_ready",
                "repairable",
                "needs_judgement",
                "stale_but_reusable",
                "suppress",
              ] as QueueTriageState[]
            ).map((state) => (
              <div key={state} className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <ReviewStateBadge tone={triageTone(state)}>{getQueueTriageLabel(state)}</ReviewStateBadge>
                  <span className="text-sm font-semibold text-slate-950">{triageCounts[state]}</span>
                </div>
              </div>
            ))}
          </div>
          {staleFeedback ? (
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">{staleFeedback}</div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1">Shortcuts</span>
            <span>`j` next</span>
            <span>`k` previous</span>
            <span>`e` expand</span>
            <span>`o` open final review</span>
            <span>`?` help</span>
            <button type="button" onClick={() => setShowShortcutHelp((current) => !current)} className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 transition hover:bg-slate-200">{showShortcutHelp ? "Hide help" : "Show help"}</button>
          </div>
          {showShortcutHelp ? <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Queue shortcuts</p><p className="mt-2">`j` next candidate · `k` previous candidate · `e` expand or collapse detail · `o` open focused candidate in final review · `?` toggle help</p></div> : null}
          {filteredCandidates.length === 0 ? <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">No approval-ready candidates surfaced yet.</div> : filteredCandidates.map((candidate, index) => {
            const latestRepair = getLatestAutoRepairEntry(candidate.signal);
            const experimentContexts = experimentContextsBySignalId?.[candidate.signal.recordId] ?? [];
            const assetSummary = buildAssetBundleSummary(buildSignalAssetBundle(candidate.signal));
            const repurposingSummary = buildRepurposingBundleSummary(buildSignalRepurposingBundle(candidate.signal));
            const publishPrepSummary = buildPublishPrepBundleSummary(buildSignalPublishPrepBundle(candidate.signal));
            const expanded = expandedById[candidate.signal.recordId] ?? false;
            const hasRepair = Boolean(latestRepair) || candidate.preReviewRepair.decision === "applied";
            const chips = chipLabel(candidate, experimentContexts.length, hasRepair);

            return (
              <div key={candidate.signal.recordId} className={`rounded-2xl p-4 transition ${activeIndex === index ? "bg-white ring-2 ring-[color:var(--accent)]/30" : "bg-white/80"}`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">#{index + 1}</span>
                      <ReviewStateBadge tone={candidate.expectedOutcome.expectedOutcomeTier === "high" ? "high_value" : candidate.expectedOutcome.expectedOutcomeTier === "medium" ? "medium_value" : "low_value"}>{candidate.expectedOutcome.expectedOutcomeTier} expected value</ReviewStateBadge>
                      <ReviewStateBadge tone={candidate.automationConfidence.level === "high" ? "high_confidence" : candidate.automationConfidence.level === "low" ? "low_confidence" : "medium_confidence"}>
                        {getConfidenceLabel(candidate.automationConfidence.level)} confidence
                      </ReviewStateBadge>
                      <ReviewStateBadge tone={triageTone(candidate.triage.triageState)}>
                        {getQueueTriageLabel(candidate.triage.triageState)}
                      </ReviewStateBadge>
                      <ReviewStateBadge tone={candidate.completeness.completenessState === "complete" ? "complete" : candidate.completeness.completenessState === "mostly_complete" ? "mostly_complete" : "partial"}>{candidate.completeness.completenessState.replaceAll("_", " ")}</ReviewStateBadge>
                      <ReviewStateBadge tone={candidate.conversionIntent.posture === "direct_conversion" ? "high_value" : candidate.conversionIntent.posture === "soft_conversion" ? "medium_value" : "neutral"}>
                        {conversionIntentLabel(candidate.conversionIntent.posture)}
                      </ReviewStateBadge>
                      {candidate.fatigue.warnings[0] ? <ReviewStateBadge tone={candidate.fatigue.warnings[0].severity === "moderate" ? "fatigue_moderate" : "fatigue_low"}>fatigue</ReviewStateBadge> : null}
                      {candidate.stale.state !== "fresh" ? (
                        <ReviewStateBadge tone={staleTone(candidate.stale.state)}>
                          {candidate.stale.state === "stale_needs_refresh" ? "needs refresh" : candidate.stale.state.replaceAll("_", " ")}
                        </ReviewStateBadge>
                      ) : null}
                      {candidate.stale.operatorAction ? (
                        <ReviewStateBadge tone={candidate.stale.operatorAction === "move_to_evergreen_later" ? "stale_reusable" : candidate.stale.operatorAction === "keep_anyway" ? "neutral" : "stale"}>
                          {staleOperatorActionLabel(candidate.stale.operatorAction)}
                        </ReviewStateBadge>
                      ) : null}
                      {candidate.conflicts.highestSeverity ? (
                        <ReviewStateBadge tone={conflictTone(candidate.conflicts.highestSeverity)}>
                          {candidate.conflicts.highestSeverity === "high"
                            ? "high conflict"
                            : candidate.conflicts.highestSeverity === "medium"
                              ? "alignment caution"
                              : "alignment note"}
                        </ReviewStateBadge>
                      ) : null}
                      {candidate.commercialRisk.highestSeverity ? (
                        <ReviewStateBadge tone={commercialRiskTone(candidate.commercialRisk.highestSeverity)}>
                          {candidate.commercialRisk.highestSeverity === "high"
                            ? "risk blocked"
                            : candidate.commercialRisk.highestSeverity === "medium"
                              ? "risk fix suggested"
                              : "risk note"}
                        </ReviewStateBadge>
                      ) : null}
                    </div>
                    <div>
                      <Link href={`/signals/${candidate.signal.recordId}`} className="text-lg font-semibold text-slate-950 hover:text-[color:var(--accent)]">{candidate.signal.sourceTitle}</Link>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{candidate.assessment.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {chips.map((chip) => <span key={chip} className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{chip}</span>)}
                      {candidate.stale.state !== "fresh" ? (
                        <>
                          <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">{candidate.stale.summary}</span>
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">Action: {candidate.stale.actionSummary}</span>
                        </>
                      ) : null}
                      {candidate.conflicts.topConflicts.map((conflict) => (
                        <span
                          key={`${candidate.signal.recordId}-${conflict.conflictType}-${conflict.platform ?? "all"}`}
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            conflict.severity === "high"
                              ? "bg-rose-50 text-rose-700"
                              : conflict.severity === "medium"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {conflictLabel(conflict.conflictType)}
                        </span>
                      ))}
                      {candidate.commercialRisk.topRisk ? (
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            candidate.commercialRisk.highestSeverity === "high"
                              ? "bg-rose-50 text-rose-700"
                              : candidate.commercialRisk.highestSeverity === "medium"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {commercialRiskLabel(candidate.commercialRisk.topRisk.riskType)}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50/80 px-3 py-3 text-sm text-slate-600"><p className="font-medium text-slate-900">Why it matters</p><p className="mt-2">{candidate.expectedOutcome.expectedOutcomeReasons[0] ?? candidate.rankReasons[0] ?? "Strong support surfaced."}</p><p className="mt-2 text-slate-500">Conversion posture: {conversionIntentLabel(candidate.conversionIntent.posture)}.</p></div>
                      <div className="rounded-2xl bg-slate-50/80 px-3 py-3 text-sm text-slate-600"><p className="font-medium text-slate-900">What is missing</p><p className="mt-2">{candidate.commercialRisk.topRisk?.reason ?? candidate.conflicts.topConflicts[0]?.reason ?? candidate.triage.reason ?? (candidate.stale.state !== "fresh" && candidate.stale.reasons[0] ? candidate.stale.reasons[0].summary : candidate.preReviewRepair.decision === "applied" ? candidate.preReviewRepair.summary : candidate.completeness.missingElements.length > 0 ? candidate.completeness.missingElements.slice(0, 2).join(" · ") : "No major package gaps")}</p></div>
                      <div className="rounded-2xl bg-slate-50/80 px-3 py-3 text-sm text-slate-600"><p className="font-medium text-slate-900">{getAutofillHeading(candidate.packageAutofill.mode)}</p><p className="mt-2">{candidate.packageAutofill.mode === "blocked" ? candidate.packageAutofill.policy.summary : candidate.packageAutofill.notes.length > 0 ? candidate.packageAutofill.notes.slice(0, 2).map((note) => `${note.label}: ${note.value}`).join(" · ") : "No bounded autofill needed"}</p></div>
                      <div className="rounded-2xl bg-slate-950 px-3 py-3 text-sm text-slate-100"><p className="font-medium text-white">Action now</p><p className="mt-2">{candidate.commercialRisk.topRisk?.suggestedFix ?? (candidate.automationConfidence.level === "low" ? candidate.automationConfidence.summary : candidate.conflicts.topConflicts[0]?.suggestedFix ?? candidate.triage.suggestedNextAction ?? (candidate.stale.state !== "fresh" ? `${candidate.stale.actionSummary}. ${candidate.guidance.primaryAction}` : candidate.preReviewRepair.decision === "applied" ? candidate.preReviewRepair.summary : candidate.guidance.primaryAction))}</p></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/signals/${candidate.signal.recordId}/review`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Open final review</Link>
                      <Link href={`/signals/${candidate.signal.recordId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Open record</Link>
                      <button type="button" className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-200" onClick={() => setExpandedById((current) => ({ ...current, [candidate.signal.recordId]: !current[candidate.signal.recordId] }))}>{expanded ? "Collapse detail" : "Expand detail"}</button>
                      {shouldShowStaleActions(candidate) ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleStaleAction(candidate.signal.recordId, "refresh_requested")}
                            disabled={isPendingAction}
                          >
                            Refresh now
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleStaleAction(candidate.signal.recordId, "move_to_evergreen_later")}
                            disabled={isPendingAction}
                          >
                            Move to evergreen later
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleStaleAction(candidate.signal.recordId, "suppress")}
                            disabled={isPendingAction}
                          >
                            Suppress
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleStaleAction(candidate.signal.recordId, "keep_anyway")}
                            disabled={isPendingAction}
                          >
                            Keep anyway
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="w-full max-w-sm rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600 xl:w-80">
                    <p>{candidate.assessment.suggestedPlatformPriority ?? candidate.signal.platformPriority ?? "Platform not set"}</p>
                    <p className="mt-2">{candidate.signal.editorialMode ? getEditorialModeDefinition(candidate.signal.editorialMode).label : "Editorial mode not set"}</p>
                    <p className="mt-2">Conversion posture: {conversionIntentLabel(candidate.conversionIntent.posture)}</p>
                    <p className="mt-2">Distribution: {candidate.distributionPriority.primaryPlatformLabel} · {distributionStrategyLabel(candidate.distributionPriority.distributionStrategy)}</p>
                    {candidate.revenueAmplifierMatch ? (
                      <p className="mt-2 text-emerald-800">
                        Revenue pattern: {candidate.revenueAmplifierMatch.revenueStrength === "high" ? "High-performing" : "Working"} · {candidate.revenueAmplifierMatch.label}
                      </p>
                    ) : null}
                    <p className="mt-2">{formatContextLabel(candidate.signal.campaignId) ?? "No campaign"}</p>
                    <p className="mt-2">{formatContextLabel(candidate.signal.funnelStage) ?? "Funnel not set"} · {formatContextLabel(candidate.signal.ctaGoal) ?? "CTA not set"}</p>
                    <p className="mt-2">{candidate.commercialRisk.topRisk?.reason ?? candidate.triage.reason ?? candidate.automationConfidence.reasons[0] ?? candidate.conflicts.topConflicts[0]?.reason ?? (candidate.stale.state !== "fresh" ? candidate.stale.reasons[0]?.summary ?? candidate.assessment.strongestCaution ?? candidate.guidance.cautionNotes[0] ?? "No major caution surfaced" : candidate.assessment.strongestCaution ?? candidate.guidance.cautionNotes[0] ?? "No major caution surfaced")}</p>
                    {candidate.preReviewRepair.decision === "applied" ? <p className="mt-2 text-xs text-slate-500">{candidate.preReviewRepair.summary}</p> : null}
                    {candidate.executionChain.status === "completed" || candidate.executionChain.status === "available" ? <p className="mt-2 text-xs text-sky-700">{candidate.executionChain.summary}</p> : null}
                    {candidate.commercialRisk.topRisk ? <p className="mt-2 text-xs text-rose-700">Suggested fix: {candidate.commercialRisk.topRisk.suggestedFix}</p> : null}
                    {candidate.stale.operatorActionNote ? <p className="mt-2 text-xs text-slate-500">Note: {candidate.stale.operatorActionNote}</p> : null}
                  </div>
                </div>
                {expanded ? <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.95fr]"><div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Post hypothesis</p><p className="mt-2"><span className="font-medium text-slate-900">Objective:</span> {candidate.hypothesis.objective}</p><p className="mt-2"><span className="font-medium text-slate-900">Why it may work:</span> {candidate.hypothesis.whyItMayWork}</p><p className="mt-2 text-slate-500">Levers: {candidate.hypothesis.keyLevers.join(" · ")}</p></div><div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Expected outcome detail</p><p className="mt-2">{candidate.expectedOutcome.expectedOutcomeReasons.join(" · ")}</p>{candidate.expectedOutcome.riskSignals.length > 0 ? <p className="mt-2 text-slate-500">Risks: {candidate.expectedOutcome.riskSignals.join(" · ")}</p> : null}</div><div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Package and supports</p><p className="mt-2">Score {candidate.completeness.completenessScore} · {candidate.completeness.completenessState.replaceAll("_", " ")}</p><p className="mt-2 text-slate-500">Asset: {assetSummary?.summary ?? "Not generated yet"}</p><p className="mt-2 text-slate-500">Repurposing: {repurposingSummary ? `${repurposingSummary.count} variants` : "Not generated yet"}</p><p className="mt-2 text-slate-500">Publish prep: {publishPrepSummary ? `${publishPrepSummary.packageCount} packages ready` : "Not prepared yet"}</p></div><div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Strategy and fatigue</p><p className="mt-2">{candidate.rankReasons[0] ?? "No strong strategic rebalance note surfaced."}</p>{candidate.expectedOutcome.riskSignals[0] ? <p className="mt-2 text-slate-500">Caution: {candidate.expectedOutcome.riskSignals[0]}</p> : null}{candidate.fatigue.warnings.length > 0 ? <p className="mt-2 text-slate-500">Fatigue: {candidate.fatigue.warnings.map((warning) => warning.summary).join(" · ")}</p> : null}</div></div><div className="space-y-4"><div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Support detail</p>{experimentContexts.length > 0 ? <p className="mt-2">Experiments: {experimentContexts.map((experiment) => `${experiment.name} (${experiment.variantLabels.join(" · ")})`).join(" · ")}</p> : <p className="mt-2">No active experiment context attached.</p>}<p className="mt-2 text-slate-500">{candidate.guidance.relatedPlaybookCards[0]?.title ?? candidate.guidance.relatedPatterns[0]?.title ?? "No direct playbook or pattern surfaced."}</p>{candidate.preReviewRepair.decision === "applied" ? <p className="mt-2 text-slate-500">{candidate.preReviewRepair.summary}</p> : latestRepair ? <p className="mt-2 text-slate-500">{getAutoRepairLabel(latestRepair)}</p> : null}</div><div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Conversion posture</p><p className="mt-2">{conversionIntentLabel(candidate.conversionIntent.posture)}</p><p className="mt-2 text-slate-500">{candidate.conversionIntent.whyChosen[0] ?? "No extra conversion note surfaced."}</p>{candidate.conversionIntent.cautionNotes[0] ? <p className="mt-2 text-slate-500">Caution: {candidate.conversionIntent.cautionNotes[0]}</p> : null}</div><div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Distribution priority</p><p className="mt-2">{candidate.distributionPriority.primaryPlatformLabel} · {distributionStrategyLabel(candidate.distributionPriority.distributionStrategy)}</p><p className="mt-2 text-slate-500">{candidate.distributionPriority.reason}</p>{candidate.distributionPriority.secondaryPlatformLabels.length > 0 ? <p className="mt-2 text-slate-500">Secondary routes: {candidate.distributionPriority.secondaryPlatformLabels.join(" · ")}</p> : null}</div>{candidate.preReviewRepair.decision === "applied" ? <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Pre-review repair</p><div className="mt-3 space-y-3">{candidate.preReviewRepair.repairs.slice(0, 4).map((repair) => <div key={`${candidate.signal.recordId}-${repair.repairType}-${repair.after}`} className="rounded-2xl bg-white/80 px-3 py-3"><div className="flex flex-wrap items-center gap-2"><ReviewStateBadge tone="autofill">Auto-repaired</ReviewStateBadge><span className="text-sm font-medium text-slate-900">{repair.repairType.replaceAll("_", " ")}</span></div><p className="mt-2">{repair.reason}</p><p className="mt-2 text-slate-500">{repair.before} → {repair.after}</p></div>)}</div></div> : null}{candidate.commercialRisk.topRisk ? <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><div className="flex flex-wrap items-center gap-2"><ReviewStateBadge tone={commercialRiskTone(candidate.commercialRisk.highestSeverity)}>{candidate.commercialRisk.highestSeverity === "high" ? "High risk" : candidate.commercialRisk.highestSeverity === "medium" ? "Fix suggested" : "Risk note"}</ReviewStateBadge><span className="text-sm font-medium text-slate-900">{commercialRiskLabel(candidate.commercialRisk.topRisk.riskType)}</span></div><p className="mt-2">{candidate.commercialRisk.topRisk.reason}</p><p className="mt-2 text-slate-500">Suggested fix: {candidate.commercialRisk.topRisk.suggestedFix}</p></div> : null}{candidate.conflicts.topConflicts.length > 0 ? <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600"><p className="font-medium text-slate-900">Conflict detail</p><div className="mt-3 space-y-3">{candidate.conflicts.topConflicts.map((conflict) => <div key={`${candidate.signal.recordId}-detail-${conflict.conflictType}-${conflict.platform ?? "all"}`} className="rounded-2xl bg-white/80 px-3 py-3"><div className="flex flex-wrap items-center gap-2"><ReviewStateBadge tone={conflictTone(conflict.severity)}>{conflict.severity} conflict</ReviewStateBadge><span className="text-sm font-medium text-slate-900">{conflictLabel(conflict.conflictType)}</span></div><p className="mt-2">{conflict.reason}</p>{conflict.suggestedFix ? <p className="mt-2 text-slate-500">Suggested fix: {conflict.suggestedFix}</p> : null}</div>)}</div></div> : null}</div></div> : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export function EvergreenResurfacingSection({ candidates }: { candidates: EvergreenCandidate[] }) {
  return (
    <div id="evergreen-resurfacing">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4"><span>Evergreen Resurfacing</span><span className="text-sm font-medium text-slate-500">{candidates.length}</span></CardTitle>
          <CardDescription>Previously successful content families that can be reused or adapted to fill current weekly gaps without depending only on fresh signals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {candidates.length === 0 ? <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">No evergreen candidates are currently strong enough to surface.</div> : candidates.map((candidate) => (
            <div key={candidate.id} className="rounded-2xl bg-white/80 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">Evergreen</span>
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">{candidate.reuseMode === "reuse_directly" ? "Direct reuse" : "Adapt before reuse"}</span>
                  </div>
                  <div>
                    <Link href={`/signals/${candidate.signalId}`} className="text-lg font-semibold text-slate-950 hover:text-[color:var(--accent)]">{candidate.signal.sourceTitle}</Link>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{candidate.reasons[0] ?? "Evergreen winner surfaced for bounded reuse."}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-slate-500">{[...candidate.reasons, ...candidate.weeklyGapReasons].slice(0, 4).map((reason) => <span key={reason} className="rounded-full bg-slate-100 px-3 py-1">{reason}</span>)}</div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/signals/${candidate.signalId}/review?evergreenCandidateId=${encodeURIComponent(candidate.id)}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Open final review for reuse</Link>
                    <Link href={`/signals/${candidate.signalId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Open original record</Link>
                  </div>
                </div>
                <div className="grid gap-3 rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600 lg:w-[360px]">
                  <div><p className="font-medium text-slate-900">Prior platform</p><p className="mt-2">{candidate.surfacedPlatform ? candidate.surfacedPlatform.toUpperCase() === "X" ? "X" : candidate.surfacedPlatform : "Not set"}</p></div>
                  <div><p className="font-medium text-slate-900">Prior post date</p><p className="mt-2">{formatDate(candidate.priorPostDate)}</p></div>
                  <div><p className="font-medium text-slate-900">Outcome quality</p><p className="mt-2">{getOutcomeQualityLabel(candidate.priorOutcomeQuality)}</p></div>
                  <div><p className="font-medium text-slate-900">Reuse recommendation</p><p className="mt-2">{getReuseRecommendationLabel(candidate.priorReuseRecommendation)}</p></div>
                  <div><p className="font-medium text-slate-900">Strategic value</p><p className="mt-2">{candidate.strategicValue ? getStrategicValueLabel(candidate.strategicValue) : "Not recorded"}</p></div>
                  <div><p className="font-medium text-slate-900">Mode / funnel</p><p className="mt-2">{candidate.editorialModeLabel ?? "Not set"} · {candidate.funnelStage ?? "Not set"}</p></div>
                  <div><p className="font-medium text-slate-900">Lineage</p><p className="mt-2">{candidate.sourceLineageLabel}</p></div>
                  <div><p className="font-medium text-slate-900">Campaign / pillar</p><p className="mt-2">{candidate.campaignLabel ?? "No campaign"} · {candidate.pillarLabel ?? "No pillar"}</p></div>
                  <div><p className="font-medium text-slate-900">Destination</p><p className="mt-2">{candidate.destinationLabel ?? "Not set"}</p></div>
                  <div><p className="font-medium text-slate-900">Pattern / bundle</p><p className="mt-2">{candidate.patternName ?? "No pattern"}{candidate.bundleNames.length > 0 ? ` · ${candidate.bundleNames.join(" · ")}` : ""}</p></div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function EvergreenLaterSection({ candidates }: { candidates: Candidate[] }) {
  return (
    <div id="evergreen-later">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <span>Evergreen Later</span>
            <span className="text-sm font-medium text-slate-500">{candidates.length}</span>
          </CardTitle>
          <CardDescription>
            Current queue items the operator intentionally parked for later reuse. This is separate from posted-winner evergreen resurfacing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {candidates.length === 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">
              No current queue items are parked in the evergreen later lane.
            </div>
          ) : (
            candidates.map((candidate) => (
              <div key={candidate.signal.recordId} className="rounded-2xl bg-white/80 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReviewStateBadge tone="stale_reusable">evergreen later</ReviewStateBadge>
                      <ReviewStateBadge tone={staleTone(candidate.stale.state)}>
                        {candidate.stale.state.replaceAll("_", " ")}
                      </ReviewStateBadge>
                    </div>
                    <div>
                      <Link href={`/signals/${candidate.signal.recordId}`} className="text-lg font-semibold text-slate-950 hover:text-[color:var(--accent)]">
                        {candidate.signal.sourceTitle}
                      </Link>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        {candidate.stale.reasons[0]?.summary ?? "Reusable current-queue item parked for later resurfacing."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-slate-500">
                      {candidate.rankReasons.slice(0, 2).map((reason) => (
                        <span key={reason} className="rounded-full bg-slate-100 px-3 py-1">
                          {reason}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/signals/${candidate.signal.recordId}/review`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Open final review
                      </Link>
                      <Link href={`/signals/${candidate.signal.recordId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        Open record
                      </Link>
                    </div>
                  </div>
                  <div className="grid gap-3 rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600 lg:w-[360px]">
                    <div>
                      <p className="font-medium text-slate-900">Expected outcome</p>
                      <p className="mt-2">{candidate.expectedOutcome.expectedOutcomeTier} value</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Why keep the lineage</p>
                      <p className="mt-2">{candidate.expectedOutcome.positiveSignals[0] ?? "Reusable signals still exist even if timing drifted."}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Next move</p>
                      <p className="mt-2">{candidate.stale.actionSummary}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
