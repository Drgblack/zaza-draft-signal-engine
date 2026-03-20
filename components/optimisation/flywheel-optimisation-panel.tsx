import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FLYWHEEL_OPTIMISATION_CATEGORIES,
  getFlywheelOptimisationCategoryLabel,
  getFlywheelOptimisationTargetTypeLabel,
  type FlywheelOptimisationState,
} from "@/lib/flywheel-optimisation";

function priorityClasses(priority: "high" | "medium" | "low") {
  switch (priority) {
    case "high":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "medium":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "low":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function ProposalList({
  title,
  description,
  proposals,
  emptyCopy,
}: {
  title: string;
  description: string;
  proposals: FlywheelOptimisationState["topProposals"];
  emptyCopy: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {proposals.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">{emptyCopy}</div>
        ) : (
          proposals.map((proposal) => (
            <div key={proposal.proposalId} className="rounded-2xl bg-white/80 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={priorityClasses(proposal.priority)}>{proposal.priority}</Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  {getFlywheelOptimisationTargetTypeLabel(proposal.targetType)}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-slate-950">{proposal.targetLabel}</p>
                <Link href={proposal.href} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                  Open
                </Link>
              </div>
              <p className="mt-2 text-sm text-slate-600">{proposal.reason}</p>
              <div className="mt-3 rounded-2xl bg-slate-50/80 px-3 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">Suggested action</p>
                <p className="mt-1">{proposal.suggestedAction}</p>
              </div>
              {proposal.supportingSignals.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {proposal.supportingSignals.map((signal) => (
                    <Badge key={`${proposal.proposalId}:${signal}`} className="bg-white/90 text-slate-700 ring-slate-200">
                      {signal}
                    </Badge>
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

export function FlywheelOptimisationPanel({
  optimisation,
  compact = false,
}: {
  optimisation: FlywheelOptimisationState;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Content Flywheel Optimisation</CardTitle>
            <Link href="/optimisation" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open optimisation
            </Link>
          </div>
          <CardDescription>
            Advisory next actions. Insights tell you what happened; optimisation tells you what to do next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Open proposals</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{optimisation.proposalCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">High priority</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{optimisation.highPriorityCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Highest priority</p>
              <p className="mt-2 text-sm font-medium text-slate-950">
                {optimisation.highestPriorityProposal?.targetLabel ?? "No stable proposal yet"}
              </p>
            </div>
          </div>

          {optimisation.summary.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {optimisation.summary.map((line) => (
                <div key={line} className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  {line}
                </div>
              ))}
            </div>
          ) : null}

          {optimisation.topProposals.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No bounded optimisation call is strong enough yet.
            </div>
          ) : (
            optimisation.topProposals.slice(0, 4).map((proposal) => (
              <div key={proposal.proposalId} className="rounded-2xl bg-white/80 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={priorityClasses(proposal.priority)}>{proposal.priority}</Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {getFlywheelOptimisationCategoryLabel(proposal.category)}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-slate-950">{proposal.targetLabel}</p>
                  <Link href={proposal.href} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                    Act on this
                  </Link>
                </div>
                <p className="mt-2 text-sm text-slate-600">{proposal.suggestedAction}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{optimisation.proposalCount} proposals</Badge>
            <Badge className="bg-amber-50 text-amber-700 ring-amber-200">{optimisation.highPriorityCount} high priority</Badge>
          </div>
          <CardTitle>Content Flywheel Self-Optimisation</CardTitle>
          <CardDescription>
            Bounded operator-visible next actions across sources, patterns, bundles, destinations, sequencing, and weekly mix. This is advisory only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {optimisation.summary.map((line) => (
              <div key={line} className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {line}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {FLYWHEEL_OPTIMISATION_CATEGORIES.map((category) => (
          <ProposalList
            key={category}
            title={getFlywheelOptimisationCategoryLabel(category)}
            description={`Bounded ${getFlywheelOptimisationCategoryLabel(category).toLowerCase()} calls surfaced from current flywheel evidence.`}
            proposals={optimisation.grouped[category]}
            emptyCopy={`No ${getFlywheelOptimisationCategoryLabel(category).toLowerCase()} call is strong enough yet.`}
          />
        ))}
      </div>
    </div>
  );
}
