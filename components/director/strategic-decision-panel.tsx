import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StrategicDecisionState } from "@/lib/strategic-decisions";

function categoryLabel(value: string) {
  return value.replaceAll("_", " ");
}

function priorityTone(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }
  if (priority === "medium") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function StrategicDecisionPanel({
  state,
  compact = false,
}: {
  state: StrategicDecisionState;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Strategic Decisions</CardTitle>
            <Link href="/director" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open director
            </Link>
          </div>
          <CardDescription>
            Short, bounded strategic calls grounded in current planning, queue, source, outreach, and revenue memory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.proposals.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No strategic decision is strong enough to surface right now.
            </div>
          ) : (
            state.proposals.slice(0, 3).map((proposal) => (
              <Link
                key={proposal.proposalId}
                href={proposal.linkedWorkflow}
                className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={priorityTone(proposal.priority)}>{proposal.priority}</Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {categoryLabel(proposal.category)}
                  </Badge>
                </div>
                <p className="mt-3 font-medium text-slate-950">{proposal.title}</p>
                <p className="mt-2 text-sm text-slate-600">{proposal.recommendation}</p>
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
        <CardTitle>Strategic Decision Proposals</CardTitle>
        <CardDescription>
          Top bounded strategic calls for this week. These stay explicit, grounded, and operator-owned.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.proposals.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
            No strategic decision is strong enough to surface right now.
          </div>
        ) : (
          state.proposals.map((proposal) => (
            <Link
              key={proposal.proposalId}
              href={proposal.linkedWorkflow}
              className="block rounded-2xl bg-white/84 px-4 py-4 transition hover:bg-white"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={priorityTone(proposal.priority)}>{proposal.priority}</Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  {categoryLabel(proposal.category)}
                </Badge>
              </div>
              <p className="mt-3 font-medium text-slate-950">{proposal.title}</p>
              <p className="mt-2 text-sm text-slate-700">{proposal.recommendation}</p>
              <p className="mt-2 text-sm text-slate-600">{proposal.reason}</p>
              <p className="mt-2 text-xs text-slate-500">Expected benefit: {proposal.expectedBenefit}</p>
              {proposal.supportingSignals[0] ? (
                <p className="mt-2 text-xs text-slate-500">
                  {proposal.supportingSignals.slice(0, 2).join(" · ")}
                </p>
              ) : null}
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
