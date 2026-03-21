import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExecutiveBriefing } from "@/lib/executive-briefing";

function BriefingList({
  title,
  description,
  items,
  emptyCopy,
}: {
  title: string;
  description: string;
  items: ExecutiveBriefing["topOpportunities"];
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
              href={item.linkedWorkflow}
              className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
            >
              <p className="font-medium text-slate-950">{item.headline}</p>
              <p className="mt-2 text-sm text-slate-700">{item.reason}</p>
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

export function ExecutiveBriefingPanel({
  briefing,
  compact = false,
}: {
  briefing: ExecutiveBriefing;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Executive Briefing</CardTitle>
            <Link href="/director#executive-briefing" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open briefing
            </Link>
          </div>
          <CardDescription>
            Founder-level synthesis of what matters now, what is improving, and what should happen next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-[color:var(--panel-strong)] px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Headline</p>
            <p className="mt-2 font-medium text-slate-950">{briefing.headline}</p>
            <p className="mt-2 text-sm text-slate-600">{briefing.currentSituation}</p>
          </div>
          {briefing.recommendedActions.slice(0, 3).map((item) => (
            <Link
              key={item.id}
              href={item.linkedWorkflow}
              className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
            >
              <p className="font-medium text-slate-950">{item.headline}</p>
              <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
            </Link>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div id="executive-briefing" className="space-y-6 scroll-mt-24">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-slate-900 text-white ring-slate-900/10">Founder briefing</Badge>
          </div>
          <CardTitle>Executive Briefing</CardTitle>
          <CardDescription>
            A short founder-level synthesis of what matters this week, where growth is coming from, where risk is rising, and what to do next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl bg-[color:var(--panel-strong)] px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current situation</p>
            <p className="mt-2 text-xl font-semibold text-slate-950">{briefing.headline}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{briefing.currentSituation}</p>
            <p className="mt-2 text-sm text-slate-600">{briefing.thisWeekFocus}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/84 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Growth signal</p>
              <p className="mt-2 text-sm text-slate-700">{briefing.growthSignalSummary}</p>
            </div>
            <div className="rounded-2xl bg-white/84 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Content signal</p>
              <p className="mt-2 text-sm text-slate-700">{briefing.contentSignalSummary}</p>
            </div>
            <div className="rounded-2xl bg-white/84 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Execution signal</p>
              <p className="mt-2 text-sm text-slate-700">{briefing.executionSignalSummary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <BriefingList
          title="Top Opportunities"
          description="Where the founder should feel confident leaning in right now."
          items={briefing.topOpportunities}
          emptyCopy="No opportunity is strong enough to summarize right now."
        />
        <BriefingList
          title="Top Risks"
          description="The few things most likely to slow growth, learning, or execution."
          items={briefing.topRisks}
          emptyCopy="No risk is strong enough to summarize right now."
        />
      </div>

      <BriefingList
        title="Recommended Actions"
        description="The short founder-level action stack for the next block of work."
        items={briefing.recommendedActions}
        emptyCopy="No action is strong enough to surface right now."
      />
    </div>
  );
}
