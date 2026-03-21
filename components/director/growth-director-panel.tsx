import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GrowthDirectorSummary } from "@/lib/growth-director";

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const className =
    priority === "high"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : priority === "medium"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-slate-100 text-slate-700 ring-slate-200";

  return <Badge className={className}>{priority}</Badge>;
}

function RecommendationList({
  title,
  description,
  items,
  emptyCopy,
}: {
  title: string;
  description: string;
  items: GrowthDirectorSummary["topPriorities"];
  emptyCopy: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
            {emptyCopy}
          </div>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white"
            >
              <div className="flex flex-wrap items-center gap-2">
                <PriorityBadge priority={item.priority} />
              </div>
              <p className="mt-3 font-medium text-slate-950">{item.label}</p>
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
  );
}

export function GrowthDirectorPanel({
  director,
  compact = false,
}: {
  director: GrowthDirectorSummary;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>AI Growth Director</CardTitle>
            <Link href="/director" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open director
            </Link>
          </div>
          <CardDescription>
            Top-level strategic direction built from the current queue, outcomes, planning state, distribution readiness, and growth memory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-[color:var(--panel-strong)] px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current focus</p>
            <p className="mt-2 font-medium text-slate-950">{director.currentFocus.label}</p>
            <p className="mt-2 text-sm text-slate-600">{director.currentFocus.reason}</p>
          </div>
          {director.recommendedActions.slice(0, 3).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
            >
              <div className="flex flex-wrap items-center gap-2">
                <PriorityBadge priority={item.priority} />
              </div>
              <p className="mt-3 font-medium text-slate-950">{item.label}</p>
              <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
            </Link>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Focus</CardTitle>
          <CardDescription>
            The single most useful focus area right now, based on the current state of planning, queue quality, outcomes, and execution readiness.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href={director.currentFocus.href} className="block rounded-2xl bg-[color:var(--panel-strong)] px-4 py-4 transition hover:bg-white">
            <p className="font-medium text-slate-950">{director.currentFocus.label}</p>
            <p className="mt-2 text-sm text-slate-600">{director.currentFocus.reason}</p>
          </Link>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/84 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Planning</p>
              <p className="mt-2 text-sm text-slate-700">{director.planningSummary}</p>
            </div>
            <div className="rounded-2xl bg-white/84 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Content</p>
              <p className="mt-2 text-sm text-slate-700">{director.contentSummary}</p>
            </div>
            <div className="rounded-2xl bg-white/84 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Distribution</p>
              <p className="mt-2 text-sm text-slate-700">{director.distributionSummary}</p>
            </div>
            <div className="rounded-2xl bg-white/84 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Revenue</p>
              <p className="mt-2 text-sm text-slate-700">{director.revenueSummary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <RecommendationList
          title="Top Priorities"
          description="The main areas that deserve attention first this week."
          items={director.topPriorities}
          emptyCopy="No top priority is strong enough to surface yet."
        />
        <RecommendationList
          title="Top Bottlenecks"
          description="The clearest things slowing growth, learning, or execution right now."
          items={director.topBottlenecks}
          emptyCopy="No bottleneck is strong enough to call out right now."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <RecommendationList
          title="Strongest Opportunities"
          description="What the system thinks is most worth doing more of or carrying forward."
          items={director.strongestOpportunities}
          emptyCopy="No opportunity is stable enough to summarize yet."
        />
        <RecommendationList
          title="Next 3 Actions"
          description="If you only do a few things next, start here."
          items={director.recommendedActions}
          emptyCopy="No recommended action is stable enough yet."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supporting Signals</CardTitle>
          <CardDescription>
            Short evidence lines showing what the Growth Director is currently leaning on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {director.supportingSignals.map((item) => (
            <div key={item} className="rounded-2xl bg-white/84 px-4 py-4 text-sm text-slate-600">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
