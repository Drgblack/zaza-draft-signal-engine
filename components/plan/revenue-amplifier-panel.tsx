import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RevenueAmplifierState } from "@/lib/revenue-amplifier";

export function RevenueAmplifierPanel({
  state,
  compact = false,
}: {
  state: RevenueAmplifierState;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{compact ? "Revenue Amplifier" : "Revenue Signal Amplifier"}</CardTitle>
            <CardDescription>
              Reuse the strongest current revenue-backed patterns more deliberately without collapsing the whole system into one repeated move.
            </CardDescription>
          </div>
          <Link href="/insights" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
            Open insights
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current signal</p>
          <p className="mt-2 text-sm text-slate-700">
            {state.topSummary[0] ?? "No revenue-linked pattern is stable enough to amplify yet."}
          </p>
          {state.topSummary[1] ? <p className="mt-2 text-sm text-slate-600">{state.topSummary[1]}</p> : null}
        </div>

        <div className={compact ? "space-y-3" : "grid gap-3 md:grid-cols-2"}>
          {(compact ? state.amplifiedPatterns.slice(0, 2) : state.amplifiedPatterns.slice(0, 4)).map((pattern) => (
            <div key={pattern.id} className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={pattern.revenueStrength === "high" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-sky-200"}>
                  Revenue pattern: {pattern.revenueStrength === "high" ? "High-performing" : "Working"}
                </Badge>
                {pattern.platform ? (
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {pattern.platform === "x" ? "X" : pattern.platform === "linkedin" ? "LinkedIn" : "Reddit"}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-3 font-medium text-slate-950">{pattern.label}</p>
              <p className="mt-2 text-sm text-slate-600">{pattern.reason}</p>
              <p className="mt-2 text-sm text-slate-700">{pattern.recommendation}</p>
            </div>
          ))}
        </div>

        {state.cautionPatterns[0] ? (
          <div className="rounded-2xl bg-amber-50/80 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Use with caution</Badge>
            </div>
            <p className="mt-3 font-medium text-slate-950">{state.cautionPatterns[0].label}</p>
            <p className="mt-2 text-sm text-slate-600">{state.cautionPatterns[0].reason}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
