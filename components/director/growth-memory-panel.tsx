import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GrowthMemoryState } from "@/lib/growth-memory";

function MemoryBlock({
  title,
  headline,
  summary,
  supportingSignals,
}: {
  title: string;
  headline: string;
  summary: string;
  supportingSignals: string[];
}) {
  return (
    <div className="rounded-2xl bg-white/84 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-2 font-medium text-slate-950">{headline}</p>
      <p className="mt-2 text-sm text-slate-700">{summary}</p>
      {supportingSignals[0] ? (
        <p className="mt-2 text-xs text-slate-500">{supportingSignals.slice(0, 2).join(" · ")}</p>
      ) : null}
    </div>
  );
}

export function GrowthMemoryPanel({
  memory,
  compact = false,
}: {
  memory: GrowthMemoryState;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Growth Memory</CardTitle>
          <CardDescription>
            Consolidated memory of what is working, what is reusable, and what to avoid.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-[color:var(--panel-strong)] px-4 py-4 text-sm leading-6 text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
            {memory.topNotes[0] ?? memory.commercialMemory.summary}
          </div>
          {memory.currentBestCombos.slice(0, 2).map((combo) => (
            <Link
              key={combo.id}
              href={combo.href}
              className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
            >
              <p className="font-medium text-slate-950">{combo.label}</p>
              <p className="mt-2 text-sm text-slate-600">{combo.reason}</p>
            </Link>
          ))}
          {memory.currentWeakCombos[0] ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-700">
              Watch: {memory.currentWeakCombos[0].label}. {memory.currentWeakCombos[0].reason}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-slate-900 text-white ring-slate-900/10">Growth memory</Badge>
        </div>
        <CardTitle>Growth Memory Consolidation</CardTitle>
        <CardDescription>
          A compact synthesis of commercial, audience, reuse, relationship, campaign, and caution memory for system-wide reference.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-[color:var(--panel-strong)] px-4 py-4 text-sm leading-6 text-slate-700 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          {memory.commercialMemory.currentPosture}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MemoryBlock
            title="Commercial memory"
            headline={memory.commercialMemory.headline}
            summary={memory.commercialMemory.summary}
            supportingSignals={memory.commercialMemory.supportingSignals}
          />
          <MemoryBlock
            title="Audience memory"
            headline={memory.audienceMemorySummary.headline}
            summary={memory.audienceMemorySummary.summary}
            supportingSignals={memory.audienceMemorySummary.supportingSignals}
          />
          <MemoryBlock
            title="Reuse memory"
            headline={memory.reuseMemorySummary.headline}
            summary={memory.reuseMemorySummary.summary}
            supportingSignals={memory.reuseMemorySummary.supportingSignals}
          />
          <MemoryBlock
            title="Relationship memory"
            headline={memory.relationshipMemorySummary.headline}
            summary={memory.relationshipMemorySummary.summary}
            supportingSignals={memory.relationshipMemorySummary.supportingSignals}
          />
          <MemoryBlock
            title="Campaign memory"
            headline={memory.campaignMemorySummary.headline}
            summary={memory.campaignMemorySummary.summary}
            supportingSignals={memory.campaignMemorySummary.supportingSignals}
          />
          <MemoryBlock
            title="Caution memory"
            headline={memory.cautionMemorySummary.headline}
            summary={memory.cautionMemorySummary.summary}
            supportingSignals={memory.cautionMemorySummary.supportingSignals}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Strongest current combos</p>
            {memory.currentBestCombos.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                No best-combo memory is strong enough to surface right now.
              </div>
            ) : (
              memory.currentBestCombos.map((combo) => (
                <Link
                  key={combo.id}
                  href={combo.href}
                  className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
                >
                  <p className="font-medium text-slate-950">{combo.label}</p>
                  <p className="mt-2 text-sm text-slate-700">{combo.reason}</p>
                </Link>
              ))
            )}
          </div>
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Weak or cautionary combos</p>
            {memory.currentWeakCombos.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                No weak combination is strong enough to elevate right now.
              </div>
            ) : (
              memory.currentWeakCombos.map((combo) => (
                <Link
                  key={combo.id}
                  href={combo.href}
                  className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
                >
                  <p className="font-medium text-slate-950">{combo.label}</p>
                  <p className="mt-2 text-sm text-slate-700">{combo.reason}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
