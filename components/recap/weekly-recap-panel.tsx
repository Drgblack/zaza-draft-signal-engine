import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildWeeklyRecapReferenceLine,
  getWeeklyRecapItemTypeLabel,
  type WeeklyRecap,
  type WeeklyRecapItem,
} from "@/lib/weekly-recap";

function ItemList({
  title,
  description,
  items,
  emptyCopy,
}: {
  title: string;
  description: string;
  items: WeeklyRecapItem[];
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
          <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">{emptyCopy}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl bg-white/80 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{getWeeklyRecapItemTypeLabel(item.type)}</Badge>
                <Badge className={item.score >= 0 ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
                  Score {item.score}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-slate-950">{item.label}</p>
                {item.href ? (
                  <Link href={item.href} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                    Open
                  </Link>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-slate-600">{buildWeeklyRecapReferenceLine(item)}</p>
              {item.references.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.references.map((reference) => (
                    <Link
                      key={`${item.id}:${reference.href}`}
                      href={reference.href}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                    >
                      {reference.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function WeeklyRecapPanel({
  recap,
  compact = false,
}: {
  recap: WeeklyRecap;
  compact?: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{recap.weekLabel}</Badge>
            <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{recap.weekStartDate}</Badge>
          </div>
          <CardTitle>{compact ? "Weekly Winner Recap" : "Weekly Winner Recap"}</CardTitle>
          <CardDescription>
            Compact synthesis of what won, what underperformed, and what should influence the next planning cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Judged posts</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{recap.supportingMetrics.judgedPostCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">High-value outcomes</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{recap.supportingMetrics.highValueCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Leads</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{recap.supportingMetrics.leadTotal}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Missing outcomes</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {recap.supportingMetrics.postsMissingQualitativeOutcome + recap.supportingMetrics.postsMissingStrategicOutcome}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {recap.summary.map((line) => (
              <div key={line} className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {line}
              </div>
            ))}
          </div>

          {recap.commercialHighlights.length > 0 ? (
            <div className="rounded-2xl bg-emerald-50/80 px-4 py-4 text-sm text-emerald-950">
              <p className="font-medium">Commercial attribution</p>
              <div className="mt-2 space-y-1">
                {recap.commercialHighlights.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          ) : null}

          {compact ? null : recap.gapNotes.length > 0 ? (
            <div className="rounded-2xl bg-amber-50/80 px-4 py-4 text-sm text-amber-950">
              <p className="font-medium">Evidence gaps</p>
              <div className="mt-2 space-y-1">
                {recap.gapNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <ItemList
          title="Winners"
          description="Signals with the clearest positive weekly evidence."
          items={recap.winners}
          emptyCopy="No weekly winner is stable enough yet."
        />
        <ItemList
          title="Underperformed"
          description="Areas where outcomes were repeatedly weak, low-value, or marked do not repeat."
          items={recap.underperformers}
          emptyCopy="No underperformer is clear enough yet."
        />
        <ItemList
          title="Reuse Next Week"
          description="What looks most worth extending, resurfacing, or turning into evergreen reuse."
          items={recap.reuseCandidates}
          emptyCopy="No reuse candidate is strong enough yet."
        />
        <ItemList
          title="Pause Or Reduce"
          description="Advisory cautions for what should likely be reduced or paused next week."
          items={recap.pauseCandidates}
          emptyCopy="No pause candidate is strong enough yet."
        />
      </div>

      {compact ? null : (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <ItemList
            title="Experiment Learnings"
            description="Bounded weekly experiment evidence only when linked posts actually landed in the recap window."
            items={recap.experimentLearnings}
            emptyCopy="No experiment has enough linked weekly evidence yet."
          />
          <Card>
            <CardHeader>
              <CardTitle>Gap Notes</CardTitle>
              <CardDescription>What still limits confidence in the recap.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recap.gapNotes.length === 0 ? (
                <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">No major recap gap needs calling out.</div>
              ) : (
                recap.gapNotes.map((note) => (
                  <div key={note} className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-700">
                    {note}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
