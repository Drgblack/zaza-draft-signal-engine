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
import type { FactoryInputResponse } from "@/types/api";

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
  const [noteEdits, setNoteEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialState.opportunities.map((item) => [item.opportunityId, item.operatorNotes ?? ""]),
    ),
  );
  const [isPending, startTransition] = useTransition();
  const sections = useMemo(
    () => buildSections(state.opportunities),
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

  function runRequest(
    input:
      | { method: "POST"; body: { refresh: true } }
      | {
          method: "PATCH";
          body:
            | { action: "approve_for_production"; opportunityId: string }
            | { action: "dismiss"; opportunityId: string }
            | { action: "reopen"; opportunityId: string }
            | { action: "update_notes"; opportunityId: string; notes: string };
        },
  ) {
    startTransition(async () => {
      try {
        const response = await fetch("/api/factory-inputs", {
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
            {section.items.map((item) => (
              <div key={item.opportunityId} className="rounded-2xl bg-white/84 px-4 py-4">
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
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
