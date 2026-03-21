import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FunnelEngineState } from "@/lib/funnel-engine";

function adjustmentTone(adjustment: FunnelEngineState["recommendedNextMix"][number]["recommendedAdjustment"]) {
  switch (adjustment) {
    case "increase":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "reduce":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "maintain":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function adjustmentLabel(adjustment: FunnelEngineState["recommendedNextMix"][number]["recommendedAdjustment"]) {
  switch (adjustment) {
    case "increase":
      return "Increase";
    case "reduce":
      return "Reduce";
    case "maintain":
    default:
      return "Maintain";
  }
}

export function FunnelEnginePanel({
  state,
  compact = false,
}: {
  state: FunnelEngineState;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Adaptive Funnel</CardTitle>
            <Link href="/plan" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open plan
            </Link>
          </div>
          <CardDescription>{state.recommendedShift}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.recommendedNextMix.slice(0, 4).map((row) => (
            <div key={row.stage} className="rounded-2xl bg-white/84 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={adjustmentTone(row.recommendedAdjustment)}>
                  {adjustmentLabel(row.recommendedAdjustment)}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.label}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-700">
                {row.currentCount} in pack · {Math.round(row.currentShare * 100)}% share
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adaptive Funnel Engine</CardTitle>
        <CardDescription>
          Advisory funnel-balance guidance that keeps awareness, trust, consideration, and conversion pressure from drifting too far out of sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
          <p>{state.currentFunnelBalance}</p>
          <p className="mt-2 font-medium text-slate-900">{state.recommendedShift}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {state.recommendedNextMix.map((row) => (
            <div key={row.stage} className="rounded-2xl bg-white/84 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={adjustmentTone(row.recommendedAdjustment)}>
                  {adjustmentLabel(row.recommendedAdjustment)}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.label}</Badge>
              </div>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{row.currentCount}</p>
              <p className="mt-1 text-sm text-slate-600">
                {Math.round(row.currentShare * 100)}% of current weekly pack
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Queue: {row.queueCount} · Revenue: {row.revenueSignalCount} · Attribution: {row.attributionCount}
              </p>
              <p className="mt-2 text-xs text-slate-500">{row.reason}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
