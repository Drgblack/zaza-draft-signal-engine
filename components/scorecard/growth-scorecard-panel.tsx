import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GrowthScorecardSummary } from "@/lib/growth-scorecard";

function trendBadgeClasses(trend: "improving" | "flat" | "declining") {
  if (trend === "improving") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (trend === "declining") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function healthBadgeClasses(health: GrowthScorecardSummary["overallHealth"]) {
  if (health === "strong") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (health === "watch") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function GrowthScorecardPanel({
  scorecard,
  compact = false,
}: {
  scorecard: GrowthScorecardSummary;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Growth Scorecard</CardTitle>
            <Link href="/scorecard" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open scorecard
            </Link>
          </div>
          <CardDescription>
            Compact growth health snapshot for {scorecard.weekLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={healthBadgeClasses(scorecard.overallHealth)}>
                {scorecard.overallHealth === "strong" ? "Strong" : scorecard.overallHealth === "watch" ? "Watch" : "Steady"}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-slate-700">{scorecard.overallSummary}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {scorecard.metrics.slice(0, 4).map((metric) => (
              <Link key={metric.key} href={metric.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{metric.label}</p>
                  <Badge className={trendBadgeClasses(metric.trend)}>{metric.trend}</Badge>
                </div>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p>
                <p className="mt-1 text-sm text-slate-600">{metric.detail}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Growth Health</CardTitle>
          <CardDescription>
            One compact answer to how the system is doing commercially and operationally this week.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={healthBadgeClasses(scorecard.overallHealth)}>
              {scorecard.overallHealth === "strong" ? "Strong health" : scorecard.overallHealth === "watch" ? "Needs attention" : "Steady health"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{scorecard.weekLabel}</Badge>
          </div>
          <p className="max-w-4xl text-sm leading-6 text-slate-700">{scorecard.overallSummary}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {scorecard.metrics.map((metric) => (
          <Link key={metric.key} href={metric.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{metric.label}</p>
              <Badge className={trendBadgeClasses(metric.trend)}>{metric.trend}</Badge>
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p>
            <p className="mt-1 text-sm text-slate-600">{metric.detail}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Health Concerns</CardTitle>
            <CardDescription>
              The few things most likely to slow growth or weaken learning right now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scorecard.topConcerns.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                No top concern is strong enough to surface right now.
              </div>
            ) : (
              scorecard.topConcerns.map((item) => (
                <Link key={item.id} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <p className="font-medium text-slate-950">{item.label}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Positives</CardTitle>
            <CardDescription>
              The strongest signs that the flywheel is learning and moving in the right direction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scorecard.topPositives.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                No positive signal is stable enough to summarize yet.
              </div>
            ) : (
              scorecard.topPositives.map((item) => (
                <Link key={item.id} href={item.href} className="block rounded-2xl bg-white/80 px-4 py-4 transition hover:bg-white">
                  <p className="font-medium text-slate-950">{item.label}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
