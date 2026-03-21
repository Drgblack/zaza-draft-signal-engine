import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommercialOpportunityRadarState } from "@/lib/opportunity-radar";

function confidenceTone(level: "high" | "medium" | "low") {
  if (level === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (level === "medium") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function urgencyTone(level: "high" | "medium" | "low") {
  if (level === "high") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (level === "medium") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function categoryLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function OpportunityRadarPanel({
  state,
  compact = false,
}: {
  state: CommercialOpportunityRadarState;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Commercial Opportunity Radar</CardTitle>
            <Link href="/director#commercial-opportunity-radar" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open radar
            </Link>
          </div>
          <CardDescription>
            A short read on what looks commercially promising next, without forecasting or auto-changing the plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-[color:var(--panel-strong)] px-4 py-4 text-sm text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
            {state.topSummary}
          </div>
          {state.opportunities.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No commercial opportunity is strong enough to surface right now.
            </div>
          ) : (
            state.opportunities.slice(0, 3).map((item) => (
              <Link
                key={item.opportunityId}
                href={item.linkedWorkflow}
                className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={urgencyTone(item.urgency)}>{item.urgency}</Badge>
                  <Badge className={confidenceTone(item.confidence)}>{item.confidence} confidence</Badge>
                </div>
                <p className="mt-3 font-medium text-slate-950">{item.title}</p>
                <p className="mt-2 text-sm text-slate-600">{item.opportunity}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div id="commercial-opportunity-radar" className="scroll-mt-24">
      <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-slate-900 text-white ring-slate-900/10">Commercial radar</Badge>
        </div>
        <CardTitle>Commercial Opportunity Radar</CardTitle>
        <CardDescription>
          A bounded forward-looking read on emerging commercial paths that look promising next. This is evidence-based and workflow-linked, not forecasting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-[color:var(--panel-strong)] px-4 py-4 text-sm leading-6 text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          {state.topSummary}
        </div>
        {state.opportunities.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
            No commercial opportunity is strong enough to surface right now.
          </div>
        ) : (
          state.opportunities.map((item) => (
            <Link
              key={item.opportunityId}
              href={item.linkedWorkflow}
              className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={urgencyTone(item.urgency)}>{item.urgency}</Badge>
                <Badge className={confidenceTone(item.confidence)}>{item.confidence} confidence</Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  {categoryLabel(item.category)}
                </Badge>
              </div>
              <p className="mt-3 font-medium text-slate-950">{item.title}</p>
              <p className="mt-2 text-sm text-slate-700">{item.opportunity}</p>
              <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
              {item.supportingSignals[0] ? (
                <p className="mt-2 text-xs text-slate-500">
                  {item.supportingSignals.slice(0, 2).join(" · ")}
                </p>
              ) : null}
            </Link>
          ))
        )}
      </CardContent>
      </Card>
    </div>
  );
}
