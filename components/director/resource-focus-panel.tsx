import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResourceFocusState } from "@/lib/resource-focus";

function tone(level: "high" | "medium" | "low") {
  if (level === "high") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }
  if (level === "medium") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export function ResourceFocusPanel({
  state,
  compact = false,
}: {
  state: ResourceFocusState;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Resource Focus</CardTitle>
          <CardDescription>
            If operator time is limited, start here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.focusStack.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No clear focus stack is stable enough right now.
            </div>
          ) : (
            state.focusStack.map((item) => (
              <Link
                key={`${item.focusArea}:${item.recommendation}`}
                href={item.linkedWorkflow}
                className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={tone(item.urgency)}>{item.urgency}</Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.estimatedEffortBand}</Badge>
                </div>
                <p className="mt-3 font-medium text-slate-950">{item.recommendation}</p>
                <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource Focus Engine</CardTitle>
        <CardDescription>
          Short attention-allocation guidance for the next 30 to 60 minutes. This stays bounded, practical, and workflow-linked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.topSummary[0] ? (
          <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
            {state.topSummary[0]}
          </div>
        ) : null}
        {state.focusStack.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
            No clear focus stack is stable enough right now.
          </div>
        ) : (
          state.focusStack.map((item) => (
            <Link
              key={`${item.focusArea}:${item.recommendation}`}
              href={item.linkedWorkflow}
              className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={tone(item.urgency)}>{item.urgency}</Badge>
                <Badge className={tone(item.leverage)}>{item.leverage} leverage</Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{item.estimatedEffortBand}</Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{label(item.focusArea)}</Badge>
              </div>
              <p className="mt-3 font-medium text-slate-950">{item.recommendation}</p>
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
