"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  ContentOpportunity,
  ContentOpportunityState,
} from "@/lib/content-opportunities";
import { isDebugEnabled } from "@/lib/debug";
import {
  applySelectedHookSelection,
  buildHookSet,
  inspectHookTrust,
  type HookSet,
  type HookVariant,
} from "@/lib/hook-engine";
import {
  buildMessageAngles,
  inspectMessageAngleTrust,
  type MessageAngle,
} from "@/lib/message-angles";
import {
  buildVideoBriefWithDiagnostics,
  inspectVideoBriefTrust,
} from "@/lib/video-briefs";
import { formatDateTime } from "@/lib/utils";
import type {
  FactoryInputProductionPackageResponse,
  FactoryInputResponse,
} from "@/types/api";

function priorityTone(priority: ContentOpportunity["priority"]) {
  if (priority === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (priority === "medium") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function statusTone(status: ContentOpportunity["status"]) {
  if (status === "approved_for_production") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "dismissed") {
    return "bg-slate-200 text-slate-700 ring-slate-300";
  }

  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function riskTone(risk: ContentOpportunity["trustRisk"]) {
  if (risk === "high") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (risk === "medium") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function typeTone(type: ContentOpportunity["opportunityType"]) {
  switch (type) {
    case "commercial_opportunity":
      return "bg-violet-50 text-violet-700 ring-violet-200";
    case "campaign_support_opportunity":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "audience_opportunity":
      return "bg-cyan-50 text-cyan-700 ring-cyan-200";
    case "evergreen_opportunity":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "pain_point_opportunity":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function statusLabel(status: ContentOpportunity["status"]) {
  switch (status) {
    case "approved_for_production":
      return "Approved";
    case "dismissed":
      return "Dismissed";
    case "open":
    default:
      return "Open";
  }
}

function typeLabel(type: ContentOpportunity["opportunityType"]) {
  switch (type) {
    case "campaign_support_opportunity":
      return "Campaign support";
    case "audience_opportunity":
      return "Audience";
    case "commercial_opportunity":
      return "Commercial";
    case "evergreen_opportunity":
      return "Evergreen";
    case "pain_point_opportunity":
    default:
      return "Pain point";
  }
}

function angleStyleTone(style: MessageAngle["style"]) {
  switch (style) {
    case "validation":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "reframe":
      return "bg-cyan-50 text-cyan-700 ring-cyan-200";
    case "practical-help":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "risk-awareness":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "calm-relief":
      return "bg-violet-50 text-violet-700 ring-violet-200";
    case "teacher-voice":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function angleStyleLabel(style: MessageAngle["style"]) {
  switch (style) {
    case "practical-help":
      return "Practical help";
    case "risk-awareness":
      return "Risk awareness";
    case "calm-relief":
      return "Calm relief";
    case "teacher-voice":
      return "Teacher voice";
    case "validation":
      return "Validation";
    case "reframe":
    default:
      return "Reframe";
  }
}

function hookTypeTone(type: HookVariant["type"]) {
  switch (type) {
    case "direct":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "empathetic":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "pattern-interrupt":
      return "bg-cyan-50 text-cyan-700 ring-cyan-200";
    case "teacher-confession":
      return "bg-violet-50 text-violet-700 ring-violet-200";
    case "calm-warning":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "practical":
    default:
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
}

function hookTypeLabel(type: HookVariant["type"]) {
  switch (type) {
    case "pattern-interrupt":
      return "Pattern interrupt";
    case "teacher-confession":
      return "Teacher confession";
    case "calm-warning":
      return "Calm warning";
    case "direct":
      return "Direct";
    case "empathetic":
      return "Empathetic";
    case "practical":
    default:
      return "Practical";
  }
}

function renderStatusTone(
  status: NonNullable<NonNullable<ContentOpportunity["generationState"]>["renderJob"]>["status"],
) {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "failed":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "rendering":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "submitted":
    case "queued":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function renderStatusLabel(
  status: NonNullable<NonNullable<ContentOpportunity["generationState"]>["renderJob"]>["status"],
) {
  switch (status) {
    case "queued":
      return "Queued";
    case "submitted":
      return "Submitted";
    case "rendering":
      return "Rendering";
    case "completed":
      return "Completed";
    case "failed":
    default:
      return "Failed";
  }
}

function assetReviewTone(
  status: NonNullable<NonNullable<ContentOpportunity["generationState"]>["assetReview"]>["status"],
) {
  switch (status) {
    case "accepted":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "discarded":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "rejected":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "pending_review":
    default:
      return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

function assetReviewLabel(
  status: NonNullable<NonNullable<ContentOpportunity["generationState"]>["assetReview"]>["status"],
) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "discarded":
      return "Discarded";
    case "rejected":
      return "Rejected";
    case "pending_review":
    default:
      return "Pending review";
  }
}

function runOutcomeLabel(outcome: string) {
  return outcome.replaceAll("_", " ");
}

function qualityCheckLabel(
  qualityCheck: NonNullable<
    NonNullable<ContentOpportunity["generationState"]>["latestQualityCheck"]
  > | null | undefined,
) {
  if (!qualityCheck) {
    return "Not run";
  }

  if (qualityCheck.passed) {
    return "Passed";
  }

  return `Failed with ${qualityCheck.failures.length} issue${qualityCheck.failures.length === 1 ? "" : "s"}`;
}

function canOpenAssetReference(url: string | null | undefined) {
  return Boolean(url && /^https?:\/\//.test(url));
}

function buildProductionPackageFilename(title: string) {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalized || "production-package"}.json`;
}

function trustReasonLabel(reason: string) {
  switch (reason) {
    case "blocked-language":
      return "hype phrasing";
    case "bro-marketing":
      return "marketing tone";
    case "generic-drift":
      return "generic drift";
    case "manipulative-urgency":
      return "urgency pressure";
    case "exaggerated-fear":
      return "fear-heavy tone";
    case "overpromising":
      return "overpromising";
    case "product-too-early":
      return "product too early";
    default:
      return reason.replaceAll("-", " ");
  }
}

function performanceSignalLabel(eventType: string) {
  switch (eventType) {
    case "brief_approved":
      return "brief";
    case "asset_generated":
      return "generated";
    case "asset_accepted":
      return "accepted";
    case "asset_rejected":
      return "rejected";
    case "asset_discarded":
      return "discarded";
    case "asset_regenerated":
      return "regenerated";
    default:
      return eventType.replaceAll("_", " ");
  }
}

function buildPerformanceSignalSummary(
  signals: NonNullable<ContentOpportunity["generationState"]>["performanceSignals"] | undefined,
) {
  if (!signals?.length) {
    return null;
  }

  const counts = signals.reduce<Record<string, number>>((current, signal) => {
    current[signal.eventType] = (current[signal.eventType] ?? 0) + 1;
    return current;
  }, {});

  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([eventType, count]) => `${performanceSignalLabel(eventType)} ${count}`)
    .join(" | ");
}

function intelligenceDriverEntries(opportunity: ContentOpportunity) {
  const drivers = opportunity.performanceDrivers;
  if (!drivers) {
    return [];
  }

  return [
    ["hookStrength", drivers.hookStrength],
    ["stakes", drivers.stakes],
    ["viewerConnection", drivers.viewerConnection],
    ["generalistAppeal", drivers.generalistAppeal],
    ["perspectiveShift", drivers.perspectiveShift],
    ["authenticityFit", drivers.authenticityFit],
    ["brandAlignment", drivers.brandAlignment],
    ["conversionPotential", drivers.conversionPotential],
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number");
}

function intelligenceLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

interface OpportunityDraftFlow {
  angles: MessageAngle[];
  hookSetsByAngleId: Record<string, HookSet>;
}

function buildOpportunityDraftFlow(
  opportunity: ContentOpportunity,
): OpportunityDraftFlow | null {
  try {
    const anglePairs = buildMessageAngles(opportunity)
      .map((angle) => {
        try {
          return {
            angle,
            hookSet: buildHookSet(opportunity, angle),
          };
        } catch {
          return null;
        }
      })
      .filter(
        (
          item,
        ): item is {
          angle: MessageAngle;
          hookSet: HookSet;
        } => item !== null,
      );

    if (anglePairs.length === 0) {
      return null;
    }

    return {
      angles: anglePairs.map((item) => item.angle),
      hookSetsByAngleId: Object.fromEntries(
        anglePairs.map((item) => [item.angle.id, item.hookSet]),
      ) as Record<string, HookSet>,
    };
  } catch {
    return null;
  }
}

function buildSelectedVideoBrief(
  opportunity: ContentOpportunity,
  angle: MessageAngle,
  hookSet: HookSet,
) {
  try {
    return buildVideoBriefWithDiagnostics(opportunity, angle, hookSet);
  } catch {
    return null;
  }
}

function buildSections(opportunities: ContentOpportunity[]) {
  const readyNow = opportunities.filter(
    (item) => item.status === "open" && item.priority === "high" && item.trustRisk !== "high",
  );
  const needsLightReview = opportunities.filter(
    (item) =>
      item.status === "open" &&
      (item.priority !== "high" || item.trustRisk === "high"),
  );
  const approved = opportunities.filter(
    (item) => item.status === "approved_for_production",
  );
  const dismissed = opportunities.filter((item) => item.status === "dismissed");

  return [
    {
      key: "ready",
      title: "Ready Now",
      description:
        "High-potential opportunities that are commercially strong and not carrying high trust risk.",
      items: readyNow,
    },
    {
      key: "review",
      title: "Needs Light Review",
      description:
        "Worth considering, but these still need judgement because they are medium priority or risk-flagged.",
      items: needsLightReview,
    },
    {
      key: "approved",
      title: "Approved For Production",
      description:
        "Already selected as inputs for the next content-production step.",
      items: approved,
    },
    {
      key: "dismissed",
      title: "Dismissed",
      description: "Kept for context so the queue stays inspectable and reversible.",
      items: dismissed,
    },
  ].filter((section) => section.items.length > 0);
}

export function FactoryInputsPanel({
  initialState,
}: {
  initialState: ContentOpportunityState;
}) {
  const [state, setState] = useState(initialState);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [packageFeedbackByOpportunityId, setPackageFeedbackByOpportunityId] = useState<
    Record<string, string>
  >({});
  const [expandedByOpportunityId, setExpandedByOpportunityId] = useState<
    Record<string, boolean>
  >({});
  const [noteEdits, setNoteEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialState.opportunities.map((item) => [item.opportunityId, item.operatorNotes ?? ""]),
    ),
  );
  const [isPending, startTransition] = useTransition();
  const debugEnabled = isDebugEnabled();
  const sections = useMemo(
    () => buildSections(state.opportunities),
    [state.opportunities],
  );
  const opportunityFlowsById = useMemo(
    () =>
      Object.fromEntries(
        state.opportunities.map((item) => [
          item.opportunityId,
          buildOpportunityDraftFlow(item),
        ]),
      ) as Record<string, OpportunityDraftFlow | null>,
    [state.opportunities],
  );

  function updateNotesCache(nextState: ContentOpportunityState) {
    setNoteEdits((current) => ({
      ...current,
      ...Object.fromEntries(
        nextState.opportunities.map((item) => [item.opportunityId, item.operatorNotes ?? current[item.opportunityId] ?? ""]),
      ),
    }));
  }

  function toggleExpanded(opportunityId: string) {
    setExpandedByOpportunityId((current) => ({
      ...current,
      [opportunityId]: !current[opportunityId],
    }));
  }

  function selectAngle(opportunityId: string, angleId: string) {
    runRequest({
      method: "PATCH",
      body: {
        action: "update_founder_selection",
        opportunityId,
        selectedAngleId: angleId,
        selectedHookId: null,
      },
    });
  }

  function selectHook(opportunityId: string, angleId: string, hookId: string) {
    runRequest({
      method: "PATCH",
      body: {
        action: "update_founder_selection",
        opportunityId,
        selectedAngleId: angleId,
        selectedHookId: hookId,
      },
    });
  }

  function exportProductionPackage(opportunityId: string) {
    startTransition(async () => {
      try {
        const response = await fetch("/api/factory-inputs/export-package", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ opportunityId }),
        });
        const data =
          (await response.json().catch(() => null)) as FactoryInputProductionPackageResponse | null;

        if (!response.ok || !data?.success || !data.productionPackage) {
          throw new Error(data?.error ?? "Unable to export production package.");
        }

        const productionPackage = data.productionPackage;
        const blob = new Blob([`${JSON.stringify(productionPackage, null, 2)}\n`], {
          type: "application/json",
        });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = buildProductionPackageFilename(productionPackage.title);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);

        setPackageFeedbackByOpportunityId((current) => ({
          ...current,
          [opportunityId]: `Production package exported: ${productionPackage.title}.`,
        }));
        setFeedback(
          data.message ?? `Production package exported: ${productionPackage.title}.`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to export production package.";
        setPackageFeedbackByOpportunityId((current) => ({
          ...current,
          [opportunityId]: message,
        }));
        setFeedback(message);
      }
    });
  }

  function runRequest(
    input:
      | { url?: "/api/factory-inputs"; method: "POST"; body: { refresh: true } }
      | {
          url?: "/api/factory-inputs";
          method: "PATCH";
          body:
            | { action: "approve_for_production"; opportunityId: string }
            | { action: "approve_video_brief_for_generation"; opportunityId: string }
            | { action: "dismiss"; opportunityId: string }
            | { action: "reopen"; opportunityId: string }
            | { action: "update_notes"; opportunityId: string; notes: string }
            | {
                action: "update_founder_selection";
                opportunityId: string;
                selectedAngleId: string | null;
                selectedHookId: string | null;
              };
        }
      | {
          url: "/api/factory-inputs/generate-video";
          method: "POST";
          body: {
            opportunityId: string;
            provider?: "mock";
          };
        }
      | {
          url: "/api/factory-inputs/render-review";
          method: "PATCH";
          body: {
            opportunityId: string;
            status: "accepted" | "rejected";
            reviewNotes?: string;
            rejectionReason?: string;
          };
        }
      | {
          url: "/api/factory-inputs/regenerate-video";
          method: "POST";
          body: {
            opportunityId: string;
            provider?: "mock";
          };
        }
      | {
          url: "/api/factory-inputs/discard-asset";
          method: "POST";
          body: {
            opportunityId: string;
          };
        },
  ) {
    startTransition(async () => {
      try {
        const response = await fetch(input.url ?? "/api/factory-inputs", {
          method: input.method,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input.body),
        });
        const data = (await response.json().catch(() => null)) as FactoryInputResponse | null;

        if (!response.ok || !data?.success || !data.state) {
          throw new Error(data?.error ?? "Unable to update factory inputs.");
        }

        setState(data.state);
        updateNotesCache(data.state);
        setFeedback(data.message ?? "Factory input queue updated.");
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "Unable to update factory inputs.",
        );
      }
    });
  }

  if (state.opportunities.length === 0) {
    return (
      <div className="space-y-4">
        {feedback ? (
          <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
            {feedback}
          </div>
        ) : null}
        <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
          No content opportunities are open yet. Refresh the queue after review candidates stabilize.
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() => runRequest({ method: "POST", body: { refresh: true } })}
        >
          {isPending ? "Refreshing..." : "Refresh queue"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
          {feedback}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() => runRequest({ method: "POST", body: { refresh: true } })}
        >
          {isPending ? "Refreshing..." : "Refresh queue"}
        </Button>
        <Link href="/review">
          <Button size="sm" variant="ghost">Open review queue</Button>
        </Link>
      </div>

      {sections.map((section) => (
        <section key={section.key} className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{section.title}</h3>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              {section.items.length}
            </Badge>
          </div>
          <p className="text-sm text-slate-600">{section.description}</p>

          <div className="space-y-3">
            {section.items.map((item) => {
              const flow = opportunityFlowsById[item.opportunityId];
              const isExpanded = expandedByOpportunityId[item.opportunityId] ?? false;
              const selectedAngle =
                flow?.angles.find(
                  (angle) => angle.id === item.selectedAngleId,
                ) ??
                flow?.angles.find((angle) => angle.isRecommended) ??
                flow?.angles[0] ??
                null;
              const selectedHookSetBase = selectedAngle
                ? flow?.hookSetsByAngleId[selectedAngle.id] ?? null
                : null;
              const selectedHookSet = selectedHookSetBase
                ? applySelectedHookSelection(
                    selectedHookSetBase,
                    item.selectedHookId ?? selectedHookSetBase.primaryHook.id,
                  )
                : null;
              const brief =
                selectedAngle && selectedHookSet
                  ? item.selectedVideoBrief &&
                    item.selectedAngleId === selectedAngle.id &&
                    item.selectedHookId === selectedHookSet.primaryHook.id
                    ? {
                        brief: item.selectedVideoBrief,
                        diagnostics: inspectVideoBriefTrust(
                          item,
                          selectedAngle,
                          selectedHookSet,
                          item.selectedVideoBrief,
                        ),
                      }
                    : buildSelectedVideoBrief(item, selectedAngle, selectedHookSet)
                  : null;
              const briefApprovedForGeneration =
                Boolean(item.generationState?.videoBriefApprovedAt) &&
                Boolean(item.generationState?.videoBriefApprovedBy) &&
                Boolean(item.selectedVideoBrief) &&
                item.selectedVideoBrief?.id === brief?.brief.id;
              const generationState = item.generationState;
              const generationRequest = generationState?.generationRequest ?? null;
              const renderJob = generationState?.renderJob ?? null;
              const renderedAsset = generationState?.renderedAsset ?? null;
              const assetReview = generationState?.assetReview ?? null;
              const performanceSignalSummary = buildPerformanceSignalSummary(
                generationState?.performanceSignals,
              );
              const latestRunEntry = generationState?.runLedger.at(-1) ?? null;
              const priorAttemptsCount = Math.max(
                (generationState?.runLedger.length ?? 0) - 1,
                0,
              );
              const packageFeedback = packageFeedbackByOpportunityId[item.opportunityId] ?? null;
              const renderStatus = renderJob?.status ?? null;
              const productionDefaultsSnapshot =
                renderJob?.productionDefaultsSnapshot ??
                renderJob?.compiledProductionPlan?.defaultsSnapshot ??
                null;
              const canGenerateVideo =
                briefApprovedForGeneration &&
                !generationRequest &&
                !renderJob &&
                !renderedAsset;
              const canRegenerateVideo =
                briefApprovedForGeneration &&
                Boolean(generationRequest || renderJob || renderedAsset);
              const canDiscardAsset =
                Boolean(renderedAsset) && assetReview?.status !== "discarded";
              const canExportPackage = briefApprovedForGeneration;
              const canReviewAsset =
                Boolean(renderedAsset) &&
                assetReview?.status === "pending_review";
              const primaryHookTrust =
                selectedAngle && selectedHookSet
                  ? inspectHookTrust(item, selectedAngle, selectedHookSet.primaryHook)
                  : null;

              return (
              <div
                key={item.opportunityId}
                id={`opportunity-${item.opportunityId}`}
                className="rounded-2xl bg-white/84 px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={priorityTone(item.priority)}>{item.priority}</Badge>
                  <Badge className={typeTone(item.opportunityType)}>
                    {typeLabel(item.opportunityType)}
                  </Badge>
                  <Badge className={riskTone(item.trustRisk)}>
                    Trust risk: {item.trustRisk}
                  </Badge>
                  <Badge className={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {item.recommendedFormat.replaceAll("_", " ")}
                  </Badge>
                  {item.recommendedPlatforms.map((platform) => (
                    <Badge
                      key={`${item.opportunityId}:${platform}`}
                      className="bg-slate-100 text-slate-700 ring-slate-200"
                    >
                      {platform}
                    </Badge>
                  ))}
                </div>

                <p className="mt-3 font-medium text-slate-950">{item.title}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                  {item.source.sourceTitle}
                </p>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      Recommended angle
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {item.recommendedAngle}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      Hook direction
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {item.recommendedHookDirection}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      Why now
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{item.whyNow}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      Suggested next step
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {item.suggestedNextStep}
                    </p>
                  </div>
                </div>

                {item.riskSummary ? (
                  <div className="mt-3 rounded-2xl bg-rose-50/80 px-4 py-3 text-sm leading-6 text-rose-700">
                    {item.riskSummary}
                  </div>
                ) : null}

                {item.supportingSignals.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.supportingSignals.map((signal) => (
                      <Badge
                        key={`${item.opportunityId}:${signal}`}
                        className="bg-slate-100 text-slate-700 ring-slate-200"
                      >
                        {signal}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {debugEnabled ? (
                  <details className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3">
                    <summary className="cursor-pointer text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      Intelligence debug
                    </summary>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl bg-white/90 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          Format
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {item.recommendedFormat.replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/90 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          Viewer effect
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {item.intendedViewerEffect ?? "Not set"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/90 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          CTA
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {item.suggestedCTA ?? "Not set"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/90 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                          Top 3 hooks
                        </p>
                        <div className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                          {(item.hookRanking ?? []).slice(0, 3).map((hook) => (
                            <p key={`${item.opportunityId}:${hook.hook}`}>
                              {hook.hook} <span className="text-slate-500">({hook.score})</span>
                            </p>
                          ))}
                          {(item.hookRanking ?? []).length === 0 ? <p>Not set</p> : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl bg-white/90 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        Performance scores
                      </p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {intelligenceDriverEntries(item).map(([label, value]) => (
                          <div
                            key={`${item.opportunityId}:${label}`}
                            className="rounded-2xl bg-slate-50/80 px-3 py-2"
                          >
                            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                              {intelligenceLabel(label)}
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
                          </div>
                        ))}
                        {intelligenceDriverEntries(item).length === 0 ? (
                          <p className="text-sm leading-6 text-slate-700">Not set</p>
                        ) : null}
                      </div>
                    </div>
                  </details>
                ) : null}

                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {item.memoryContext.revenuePattern ? (
                    <div className="rounded-2xl bg-white/90 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        Revenue pattern
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {item.memoryContext.revenuePattern}
                      </p>
                    </div>
                  ) : null}
                  {item.memoryContext.audienceCue ? (
                    <div className="rounded-2xl bg-white/90 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        Audience cue
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {item.memoryContext.audienceCue}
                      </p>
                    </div>
                  ) : null}
                  {item.memoryContext.caution ? (
                    <div className="rounded-2xl bg-white/90 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        Caution
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {item.memoryContext.caution}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 rounded-2xl bg-slate-50/80 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        Message flow
                      </p>
                      <p className="text-sm text-slate-600">
                        Review angles, choose the hook, and inspect the brief before approval.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleExpanded(item.opportunityId)}
                    >
                      {isExpanded ? "Collapse detail" : "Open message flow"}
                    </Button>
                  </div>

                  {isExpanded ? (
                    flow && selectedAngle && selectedHookSet ? (
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <div className="grid gap-3">
                          {flow.angles.map((angle) => {
                            const isSelected = angle.id === selectedAngle.id;
                            const angleTrust = inspectMessageAngleTrust(item, angle);

                            return (
                              <div
                                key={angle.id}
                                className={`rounded-2xl px-4 py-4 ${
                                  isSelected
                                    ? "border-2 border-[#6366f1] bg-[#EEF2FF]"
                                    : "border border-[#E5E7EB] bg-white/70"
                                }`}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge className={angleStyleTone(angle.style)}>
                                    {angleStyleLabel(angle.style)}
                                  </Badge>
                                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                    Score {angle.score}
                                  </Badge>
                                  {angle.isRecommended ? (
                                    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                                      Recommended
                                    </Badge>
                                  ) : null}
                                  {isSelected ? (
                                    <Badge className="border-2 border-[#6366f1] bg-[#EEF2FF] font-medium text-[#4338CA] ring-0">
                                      Selected
                                    </Badge>
                                  ) : null}
                                  {angleTrust.reasons.length > 0 ? (
                                    <Badge className="border border-[#EAB308] bg-[#FEF08A] font-medium text-[#713F12] ring-0">
                                      Trust caution
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="mt-3 text-sm font-medium text-slate-950">
                                  {angle.title}
                                </p>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  {angle.summary}
                                </p>
                                <p className="mt-3 text-sm leading-6 text-slate-700">
                                  {angle.teacherVoiceLine}
                                </p>
                                <p className="mt-2 text-xs leading-5 text-slate-500">
                                  {angle.whyThisAngle}
                                </p>
                                {angleTrust.reasons.length > 0 ? (
                                  <p className="mt-2 text-xs leading-5 text-amber-700">
                                    Kept conservative around {angleTrust.reasons.map(trustReasonLabel).join(", ")}.
                                  </p>
                                ) : null}
                                {!isSelected ? (
                                  <div className="mt-3">
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      disabled={isPending}
                                      onClick={() => selectAngle(item.opportunityId, angle.id)}
                                    >
                                      Select angle
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-2xl bg-white px-4 py-4 ring-1 ring-slate-200">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                              Selected hook
                            </p>
                            <p className="mt-3 text-base font-medium text-slate-950">
                              {selectedHookSet.primaryHook.text}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Badge className={hookTypeTone(selectedHookSet.primaryHook.type)}>
                                {hookTypeLabel(selectedHookSet.primaryHook.type)}
                              </Badge>
                              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                Score {selectedHookSet.primaryHook.score}
                              </Badge>
                              {primaryHookTrust && primaryHookTrust.reasons.length > 0 ? (
                                <Badge className="border border-[#EAB308] bg-[#FEF08A] font-medium text-[#713F12] ring-0">
                                  Trust caution
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {selectedHookSet.rationale}
                            </p>
                            {primaryHookTrust && primaryHookTrust.reasons.length > 0 ? (
                              <p className="mt-2 text-xs leading-5 text-amber-700">
                                Opening kept grounded around {primaryHookTrust.reasons.map(trustReasonLabel).join(", ")}.
                              </p>
                            ) : null}
                          </div>

                          <div className="rounded-2xl bg-white/80 px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                Hook options
                              </p>
                              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                {selectedHookSet.variants.length}
                              </Badge>
                            </div>
                            <div className="mt-3 grid gap-2">
                              {selectedHookSet.variants.map((variant) => {
                                const isSelected = variant.id === selectedHookSet.primaryHook.id;
                                const hookTrust = inspectHookTrust(item, selectedAngle, variant);

                                return (
                                  <div
                                    key={variant.id}
                                    className={`rounded-2xl px-3 py-3 ${
                                      isSelected
                                        ? "border-2 border-[#6366f1] bg-[#EEF2FF]"
                                        : "border border-[#E5E7EB] bg-slate-50/70"
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge className={hookTypeTone(variant.type)}>
                                        {hookTypeLabel(variant.type)}
                                      </Badge>
                                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                        Score {variant.score}
                                      </Badge>
                                      {isSelected ? (
                                        <Badge className="border-2 border-[#6366f1] bg-[#EEF2FF] font-medium text-[#4338CA] ring-0">
                                          Selected
                                        </Badge>
                                      ) : null}
                                      {hookTrust.reasons.length > 0 ? (
                                        <Badge className="border border-[#EAB308] bg-[#FEF08A] font-medium text-[#713F12] ring-0">
                                          Trust caution
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-slate-800">
                                      {variant.text}
                                    </p>
                                    {hookTrust.reasons.length > 0 ? (
                                      <p className="mt-2 text-xs leading-5 text-amber-700">
                                        Softened around {hookTrust.reasons.map(trustReasonLabel).join(", ")}.
                                      </p>
                                    ) : null}
                                    {!isSelected ? (
                                      <div className="mt-3">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={isPending}
                                          onClick={() =>
                                            selectHook(item.opportunityId, selectedAngle.id, variant.id)
                                          }
                                        >
                                          Select hook
                                        </Button>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {brief ? (
                            <div className="rounded-2xl border-l-4 border-l-[#6366f1] bg-[#F8F7FF] px-4 py-4 ring-1 ring-slate-200">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                  Video brief
                                </p>
                                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                  {brief.brief.format.replaceAll("-", " ")}
                                </Badge>
                                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                  {brief.brief.durationSec}s
                                </Badge>
                                {brief.diagnostics.wasSanitized ? (
                                  <Badge className="border border-[#EAB308] bg-[#FEF08A] font-medium text-[#713F12] ring-0">
                                    Trust adjusted
                                  </Badge>
                                ) : null}
                                {brief.diagnostics.usedFallback ? (
                                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                    Conservative fallback
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-3 text-sm font-medium text-slate-950">
                                {brief.brief.title}
                              </p>
                              {brief.diagnostics.wasSanitized ? (
                                <p className="mt-2 text-xs leading-5 text-amber-700">
                                  This brief was softened to stay teacher-safe and keep the product out of the opening.
                                </p>
                              ) : null}
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                <span className="font-medium text-slate-950">Hook:</span>{" "}
                                {brief.brief.hook}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                <span className="font-medium text-slate-950">Goal:</span>{" "}
                                {brief.brief.goal}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                <span className="font-medium text-slate-950">Tone:</span>{" "}
                                {brief.brief.tone}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                <span className="font-medium text-slate-950">
                                  Visual direction:
                                </span>{" "}
                                {brief.brief.visualDirection}
                              </p>

                              <div className="mt-3 grid gap-2">
                                {brief.brief.structure.map((beat) => (
                                  <div
                                    key={`${brief.brief.id}:${beat.order}`}
                                    className="rounded-2xl bg-slate-50/80 px-3 py-3"
                                  >
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                      Beat {beat.order}: {beat.purpose}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-slate-700">
                                      {beat.guidance}
                                    </p>
                                    {beat.suggestedOverlay ? (
                                      <p className="mt-2 text-xs leading-5 text-slate-500">
                                        Overlay: {beat.suggestedOverlay}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>

                              <div className="mt-3">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                  Overlay lines
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {brief.brief.overlayLines.map((line) => (
                                    <Badge
                                      key={`${brief.brief.id}:${line}`}
                                      className="bg-slate-100 text-slate-700 ring-slate-200"
                                    >
                                      {line}
                                    </Badge>
                                  ))}
                                </div>
                              </div>

                              <p className="mt-3 text-sm leading-6 text-slate-700">
                                <span className="font-medium text-slate-950">CTA:</span>{" "}
                                {brief.brief.cta}
                              </p>

                                <div className="mt-4 rounded-2xl bg-slate-50/80 px-3 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                      Generation gate
                                    </p>
                                  {briefApprovedForGeneration ? (
                                    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                                      Approved for generation
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                        Awaiting approval
                                      </Badge>
                                    )}
                                    {renderStatus ? (
                                      <Badge className={renderStatusTone(renderStatus)}>
                                        {renderStatusLabel(renderStatus)}
                                      </Badge>
                                    ) : null}
                                    {assetReview ? (
                                      <Badge className={assetReviewTone(assetReview.status)}>
                                        {assetReviewLabel(assetReview.status)}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="mt-2 text-sm leading-6 text-slate-600">
                                    {briefApprovedForGeneration
                                      ? `Approved by ${item.generationState?.videoBriefApprovedBy ?? "founder"} on ${formatDateTime(item.generationState?.videoBriefApprovedAt)}.`
                                      : item.status !== "approved_for_production"
                                        ? "Approve this opportunity for production first, then approve the brief for generation."
                                        : "Approve this brief explicitly before any generation step is shown."}
                                  </p>
                                  {renderJob?.submittedAt ? (
                                    <p className="mt-2 text-xs leading-5 text-slate-500">
                                      Render submitted on {formatDateTime(renderJob.submittedAt)}.
                                    </p>
                                  ) : null}
                                  {renderJob?.renderVersion || productionDefaultsSnapshot ? (
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      {renderJob?.renderVersion ? (
                                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                          {renderJob.renderVersion}
                                        </Badge>
                                      ) : null}
                                      {renderJob?.provider ? (
                                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                          Render {renderJob.provider}
                                        </Badge>
                                      ) : null}
                                      {productionDefaultsSnapshot ? (
                                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                          Voice {productionDefaultsSnapshot.voiceProvider}/{productionDefaultsSnapshot.voiceId}
                                        </Badge>
                                      ) : null}
                                      {productionDefaultsSnapshot ? (
                                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                          {productionDefaultsSnapshot.aspectRatio} {productionDefaultsSnapshot.resolution}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {latestRunEntry ? (
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                      <div className="rounded-2xl bg-white/80 px-3 py-3">
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                          Current attempt
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-slate-950">
                                          Attempt {latestRunEntry.attemptNumber}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl bg-white/80 px-3 py-3">
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                          Prior attempts
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-slate-950">
                                          {priorAttemptsCount}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl bg-white/80 px-3 py-3">
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                          Latest outcome
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-slate-950">
                                          {runOutcomeLabel(latestRunEntry.terminalOutcome)}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl bg-white/80 px-3 py-3">
                                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                          Last updated
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-slate-950">
                                          {formatDateTime(latestRunEntry.lastUpdatedAt)}
                                        </p>
                                      </div>
                                    </div>
                                  ) : null}
                                  {generationState?.latestQualityCheck ? (
                                    <p className="mt-2 text-xs leading-5 text-slate-500">
                                      QC: {qualityCheckLabel(generationState.latestQualityCheck)}
                                      {!generationState.latestQualityCheck.passed &&
                                      generationState.latestQualityCheck.failures[0]
                                        ? ` — ${generationState.latestQualityCheck.failures[0].message}`
                                        : ""}
                                    </p>
                                  ) : null}
                                  {performanceSignalSummary ? (
                                    <p className="mt-2 text-xs leading-5 text-slate-500">
                                      Signals: {performanceSignalSummary}.
                                    </p>
                                  ) : null}
                                  {renderedAsset ? (
                                    <div className="mt-3 rounded-2xl bg-white/80 px-3 py-3">
                                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                        Asset reference
                                      </p>
                                      <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-600">
                                        {renderedAsset.url}
                                      </p>
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                          {renderedAsset.assetType}
                                        </Badge>
                                        {renderedAsset.durationSec ? (
                                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                                            {renderedAsset.durationSec}s
                                          </Badge>
                                        ) : null}
                                        {canOpenAssetReference(renderedAsset.url) ? (
                                          <Link href={renderedAsset.url} target="_blank">
                                            <Button size="sm" variant="ghost">
                                              Open asset
                                            </Button>
                                          </Link>
                                        ) : null}
                                      </div>
                                      {assetReview?.reviewedAt ? (
                                        <p className="mt-2 text-xs leading-5 text-slate-500">
                                          Reviewed on {formatDateTime(assetReview.reviewedAt)}.
                                        </p>
                                      ) : null}
                                      {assetReview?.reviewNotes ? (
                                        <p className="mt-2 text-sm leading-6 text-slate-600">
                                          {assetReview.reviewNotes}
                                        </p>
                                      ) : null}
                                      {assetReview?.rejectionReason ? (
                                        <p className="mt-2 text-sm leading-6 text-rose-700">
                                          {assetReview.rejectionReason}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {!briefApprovedForGeneration ? (
                                      <Button
                                      size="sm"
                                      variant="secondary"
                                      disabled={
                                        isPending ||
                                        item.status !== "approved_for_production" ||
                                        !item.selectedAngleId ||
                                        !item.selectedHookId ||
                                        !item.selectedVideoBrief ||
                                        item.selectedVideoBrief.id !== brief.brief.id
                                      }
                                      onClick={() =>
                                        runRequest({
                                          method: "PATCH",
                                          body: {
                                            action: "approve_video_brief_for_generation",
                                            opportunityId: item.opportunityId,
                                          },
                                        })
                                      }
                                      >
                                        Approve brief
                                      </Button>
                                    ) : null}
                                    {canGenerateVideo ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={isPending}
                                        onClick={() =>
                                          runRequest({
                                            url: "/api/factory-inputs/generate-video",
                                            method: "POST",
                                            body: {
                                              opportunityId: item.opportunityId,
                                              provider: "mock",
                                            },
                                          })
                                        }
                                      >
                                        Generate video
                                      </Button>
                                    ) : null}
                                    {canRegenerateVideo ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={isPending}
                                        onClick={() =>
                                          runRequest({
                                            url: "/api/factory-inputs/regenerate-video",
                                            method: "POST",
                                            body: {
                                              opportunityId: item.opportunityId,
                                              provider: "mock",
                                            },
                                          })
                                        }
                                      >
                                        Regenerate
                                      </Button>
                                    ) : null}
                                    {canDiscardAsset ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={isPending}
                                        onClick={() =>
                                          runRequest({
                                            url: "/api/factory-inputs/discard-asset",
                                            method: "POST",
                                            body: {
                                              opportunityId: item.opportunityId,
                                            },
                                          })
                                        }
                                      >
                                        Discard
                                      </Button>
                                    ) : null}
                                    {item.selectedVideoBrief ? (
                                      <Link
                                        href={`/factory-inputs?opportunityId=${encodeURIComponent(item.opportunityId)}#review`}
                                      >
                                        <Button size="sm" variant="ghost">
                                          Open review flow
                                        </Button>
                                      </Link>
                                    ) : null}
                                    {canExportPackage ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={isPending}
                                        onClick={() => exportProductionPackage(item.opportunityId)}
                                      >
                                        Export package
                                      </Button>
                                    ) : null}
                                    {canReviewAsset ? (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={isPending}
                                        onClick={() =>
                                          runRequest({
                                            url: "/api/factory-inputs/render-review",
                                            method: "PATCH",
                                            body: {
                                              opportunityId: item.opportunityId,
                                              status: "accepted",
                                            },
                                          })
                                        }
                                      >
                                        Accept
                                      </Button>
                                    ) : null}
                                    {canReviewAsset ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={isPending}
                                        onClick={() =>
                                          runRequest({
                                            url: "/api/factory-inputs/render-review",
                                            method: "PATCH",
                                            body: {
                                              opportunityId: item.opportunityId,
                                              status: "rejected",
                                            },
                                          })
                                        }
                                      >
                                        Reject
                                      </Button>
                                    ) : null}
                                  </div>
                                  {packageFeedback ? (
                                    <p className="mt-2 text-xs leading-5 text-slate-500">
                                      {packageFeedback}
                                    </p>
                                  ) : null}
                                </div>

                              {brief.brief.productionNotes?.length ? (
                                <div className="mt-3">
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                    Production notes
                                  </p>
                                  <div className="mt-2 space-y-2">
                                    {brief.brief.productionNotes.map((note) => (
                                      <p
                                        key={`${brief.brief.id}:${note}`}
                                        className="text-sm leading-6 text-slate-600"
                                      >
                                        {note}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="rounded-2xl bg-amber-50/80 px-4 py-4 text-sm leading-6 text-amber-700">
                              This opportunity has a workable angle and hook flow, but the brief is not stable enough to show yet.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-600">
                        This opportunity does not have a stable angle flow yet. Refresh the queue after the source signal becomes clearer.
                      </div>
                    )
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    Operator notes
                  </p>
                  <Textarea
                    value={noteEdits[item.opportunityId] ?? ""}
                    onChange={(event) =>
                      setNoteEdits((current) => ({
                        ...current,
                        [item.opportunityId]: event.target.value,
                      }))
                    }
                    className="min-h-[88px]"
                    placeholder="Keep a short production note, objection note, or reason to hold."
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={item.source.href}>
                    <Button size="sm" variant="secondary">Open signal</Button>
                  </Link>
                  {item.status === "open" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isPending}
                      onClick={() =>
                        runRequest({
                          method: "PATCH",
                          body: {
                            action: "approve_for_production",
                            opportunityId: item.opportunityId,
                          },
                        })
                      }
                    >
                      Approve for production
                    </Button>
                  ) : null}
                  {item.status !== "dismissed" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() =>
                        runRequest({
                          method: "PATCH",
                          body: {
                            action: "dismiss",
                            opportunityId: item.opportunityId,
                          },
                        })
                      }
                    >
                      Dismiss
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() =>
                        runRequest({
                          method: "PATCH",
                          body: {
                            action: "reopen",
                            opportunityId: item.opportunityId,
                          },
                        })
                      }
                    >
                      Reopen
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      runRequest({
                        method: "PATCH",
                        body: {
                          action: "update_notes",
                          opportunityId: item.opportunityId,
                          notes: noteEdits[item.opportunityId] ?? "",
                        },
                      })
                    }
                  >
                    Save notes
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
