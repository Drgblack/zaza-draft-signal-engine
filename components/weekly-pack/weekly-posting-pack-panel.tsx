"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WeeklyPostingPack } from "@/lib/weekly-posting-pack";
import type { WeeklyPostingPackActionResponse } from "@/types/api";
import type { PostingAssistantActionResponse } from "@/types/api";

function statusClasses(status: WeeklyPostingPack["items"][number]["status"]) {
  if (status === "posted") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "approved") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function confidenceClasses(level: WeeklyPostingPack["items"][number]["confidenceLevel"]) {
  if (level === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (level === "low") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function expectedOutcomeClasses(tier: WeeklyPostingPack["items"][number]["expectedOutcomeTier"]) {
  if (tier === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (tier === "low") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function sourceClasses(source: WeeklyPostingPack["items"][number]["source"]) {
  return source === "evergreen"
    ? "bg-violet-50 text-violet-700 ring-violet-200"
    : "bg-slate-100 text-slate-700 ring-slate-200";
}

export function WeeklyPostingPackPanel({
  pack,
  stagedKeys = [],
}: {
  pack: WeeklyPostingPack;
  stagedKeys?: string[];
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const stagedKeySet = new Set(stagedKeys);

  function updateItem(item: WeeklyPostingPack["items"][number], action: "approve" | "remove") {
    startTransition(async () => {
      try {
        const response = await fetch("/api/weekly-posting-pack", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            weekStartDate: pack.weekStartDate,
            itemId: item.itemId,
            signalId: item.signalId,
            action,
          }),
        });
        const data = (await response.json().catch(() => null)) as WeeklyPostingPackActionResponse | null;

        if (!response.ok || !data?.success) {
          throw new Error(data?.error ?? "Unable to update weekly posting pack item.");
        }

        setFeedback(data.message);
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to update weekly posting pack item.");
      }
    });
  }

  function stageItem(item: WeeklyPostingPack["items"][number]) {
    startTransition(async () => {
      try {
        const response = await fetch("/api/posting-assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "stage_package",
            signalId: item.signalId,
            platform: item.platform,
            readinessReason: item.whySelected,
          }),
        });
        const data = (await response.json().catch(() => null)) as PostingAssistantActionResponse | null;

        if (!response.ok || !data?.success) {
          throw new Error(data?.error ?? "Unable to stage weekly pack item for posting.");
        }

        setFeedback(data.message);
        router.refresh();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Unable to stage weekly pack item.");
      }
    });
  }

  if (pack.items.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
        No balanced weekly posting pack is stable enough to recommend yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {feedback ? (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">{feedback}</div>
      ) : null}
      {pack.items.map((item) => (
        <div key={item.itemId} className="rounded-2xl bg-white/80 px-4 py-4">
          {stagedKeySet.has(`${item.signalId}:${item.platform}`) ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="bg-sky-50 text-sky-700 ring-sky-200">Staged for posting</Badge>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusClasses(item.status)}>{item.statusLabel}</Badge>
            <Badge className={sourceClasses(item.source)}>
              {item.source === "evergreen" ? "Evergreen" : "Fresh"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.platformLabel}</Badge>
            {item.distributionPriority ? (
              <Badge className={item.distributionPriority.distributionStrategy === "multi" ? "bg-sky-50 text-sky-700 ring-sky-200" : item.distributionPriority.distributionStrategy === "experimental" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                {item.distributionPriority.distributionStrategy === "multi"
                  ? "Multi-platform"
                  : item.distributionPriority.distributionStrategy === "experimental"
                    ? "Experimental distribution"
                    : "Single-platform"}
              </Badge>
            ) : null}
            {item.editorialModeLabel ? (
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.editorialModeLabel}</Badge>
            ) : null}
            {item.founderVoiceMode === "founder_voice_on" ? (
              <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Founder voice</Badge>
            ) : null}
            <Badge className={confidenceClasses(item.confidenceLevel)}>
              {item.confidenceLevel} confidence
            </Badge>
            <Badge className={expectedOutcomeClasses(item.expectedOutcomeTier)}>
              {item.expectedOutcomeTier} expected value
            </Badge>
          </div>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-slate-950">{item.sourceTitle}</p>
              <p className="mt-2 text-sm text-slate-600">{item.whySelected}</p>
            </div>
            {item.isCampaignCritical ? (
              <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Campaign-critical</Badge>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Funnel</p>
              <p className="mt-2 text-sm text-slate-700">{item.funnelStageLabel ?? "Not set"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Campaign</p>
              <p className="mt-2 text-sm text-slate-700">{item.campaignContext ?? "No campaign context"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Destination</p>
              <p className="mt-2 text-sm text-slate-700">{item.destinationLabel ?? "No destination locked yet"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Readiness</p>
              <p className="mt-2 text-sm text-slate-700">{item.publishPrepReadiness}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Distribution</p>
              <p className="mt-2 text-sm text-slate-700">
                {item.distributionPriority
                  ? `${item.distributionPriority.primaryPlatformLabel} · ${item.distributionPriority.distributionStrategy === "multi" ? "Multi-platform" : item.distributionPriority.distributionStrategy === "experimental" ? "Experimental" : "Single-platform"}`
                  : "No priority set"}
              </p>
            </div>
          </div>

          {item.distributionPriority ? (
            <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Distribution priority</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.distributionPriority.reason}</p>
              {item.distributionPriority.secondaryPlatformLabels.length > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Secondary routes: {item.distributionPriority.secondaryPlatformLabels.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {item.sequenceContext ? (
            <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-sky-50 text-sky-700 ring-sky-200">Part of sequence</Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  Step {item.sequenceContext.stepNumber} of {item.sequenceContext.totalSteps}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.sequenceContext.roleLabel}</Badge>
              </div>
              <p className="mt-3 font-medium text-slate-900">{item.sequenceContext.narrativeLabel}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.sequenceContext.rationale}</p>
              <p className="mt-2 text-xs text-slate-500">{item.sequenceContext.sequenceReason}</p>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Strongest value signal</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.strongestValueSignal}</p>
            </div>
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Key caution</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {item.keyCaution ?? "No major caution is dominating this recommendation."}
              </p>
            </div>
          </div>

          {item.includedBecause.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.includedBecause.map((reason) => (
                <Badge key={reason} className="bg-slate-100 text-slate-700 ring-slate-200">
                  {reason}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={item.href}>
              <Button size="sm" variant="secondary">Open final review</Button>
            </Link>
            {item.status !== "posted" ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={isPending || item.status === "approved"}
                onClick={() => updateItem(item, "approve")}
              >
                {item.status === "approved" ? "Approved" : "Approve item"}
              </Button>
            ) : null}
            {item.status === "open" ? (
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => updateItem(item, "remove")}>
                Remove from pack
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => stageItem(item)}>
              {stagedKeySet.has(`${item.signalId}:${item.platform}`) ? "Update staged package" : "Stage for posting"}
            </Button>
          </div>
        </div>
      ))}

      {pack.alternates.length > 0 ? (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Next alternates</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pack.alternates.slice(0, 3).map((item) => (
              <Badge key={item.itemId} className="bg-white text-slate-700 ring-slate-200">
                {item.platformLabel} - {item.sourceTitle}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
