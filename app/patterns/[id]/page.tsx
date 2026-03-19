import Link from "next/link";
import { notFound } from "next/navigation";

import { PatternFeedbackPanel } from "@/components/patterns/pattern-feedback-panel";
import { PatternFormCard } from "@/components/patterns/pattern-form-card";
import { PatternBundleAssignmentCard } from "@/components/patterns/pattern-bundle-assignment-card";
import { PatternLifecycleActions } from "@/components/patterns/pattern-lifecycle-actions";
import { AuditTrail } from "@/components/signals/audit-trail";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuditEvents, listAuditEvents } from "@/lib/audit";
import { listFeedbackEntries } from "@/lib/feedback";
import { getBundlesForPattern, listPatternBundles } from "@/lib/pattern-bundles";
import { buildPatternHealthAssessments, indexPatternHealthAssessments } from "@/lib/pattern-health";
import { getPatternFeedbackEntries, listPatternFeedbackEntries } from "@/lib/pattern-feedback";
import { PATTERN_TYPE_LABELS } from "@/lib/pattern-definitions";
import {
  buildPatternEffectivenessSummaries,
  getPattern,
  getPatternAuditSubjectId,
  listPatterns,
} from "@/lib/patterns";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function lifecycleBadgeClasses(state: "active" | "retired"): string {
  return state === "retired"
    ? "bg-slate-100 text-slate-600 ring-slate-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export default async function PatternDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pattern = await getPattern(id);

  if (!pattern) {
    notFound();
  }

  const allPatterns = await listPatterns({ includeRetired: true });
  const allBundles = await listPatternBundles();
  const assignedBundles = getBundlesForPattern(pattern.id, allBundles);
  const patternFeedbackEntries = await getPatternFeedbackEntries(pattern.id);
  const allPatternFeedbackEntries = await listPatternFeedbackEntries();
  const allSignalFeedbackEntries = await listFeedbackEntries();
  const allAuditEvents = await listAuditEvents();
  const patternAuditEvents = await getAuditEvents(getPatternAuditSubjectId(pattern.id));
  const effectivenessById = Object.fromEntries(
    buildPatternEffectivenessSummaries(allPatterns, allAuditEvents, allPatternFeedbackEntries, allSignalFeedbackEntries).map(
      (summary) => [summary.patternId, summary],
    ),
  );
  const health = indexPatternHealthAssessments(
    buildPatternHealthAssessments(allPatterns, allAuditEvents, allPatternFeedbackEntries, allSignalFeedbackEntries),
  )[pattern.id];
  const effectiveness = effectivenessById[pattern.id] ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={lifecycleBadgeClasses(pattern.lifecycleState)}>
              {pattern.lifecycleState === "retired" ? "Retired" : "Active"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              {PATTERN_TYPE_LABELS[pattern.patternType]}
            </Badge>
            <Badge className="bg-white text-slate-600 ring-slate-200">{formatDateTime(pattern.createdAt)}</Badge>
            {health?.needsReview ? (
              <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Needs review</Badge>
            ) : null}
          </div>
          <CardTitle className="text-3xl">{pattern.name}</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">{pattern.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 pt-0 text-sm text-slate-600">
          <span>Created by {pattern.createdBy}</span>
          <Link href="/patterns" className="text-[color:var(--accent)] underline underline-offset-4">
            Back to library
          </Link>
          <Link href={`/playbook?patternId=${pattern.id}`} className="text-[color:var(--accent)] underline underline-offset-4">
            Create playbook card
          </Link>
          {pattern.exampleSignalId ? (
            <Link href={`/signals/${pattern.exampleSignalId}`} className="text-[color:var(--accent)] underline underline-offset-4">
              Open source signal
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pattern Details</CardTitle>
            <CardDescription>The reusable ingredients this pattern is meant to preserve.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {pattern.sourceContext ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Source context</p>
                <p className="text-sm leading-6 text-slate-700">{pattern.sourceContext}</p>
              </div>
            ) : null}

            {pattern.exampleSignalTitle || pattern.exampleSignalSummary ? (
              <div className="rounded-2xl bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Example signal</p>
                {pattern.exampleSignalTitle ? <p className="mt-2 text-sm font-medium text-slate-900">{pattern.exampleSignalTitle}</p> : null}
                {pattern.exampleSignalSummary ? <p className="mt-2 text-sm leading-6 text-slate-600">{pattern.exampleSignalSummary}</p> : null}
              </div>
            ) : null}

            {pattern.exampleScenarioAngle ? (
              <div className="rounded-2xl bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Example Scenario Angle</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{pattern.exampleScenarioAngle}</p>
              </div>
            ) : null}

            {pattern.exampleOutput ? (
              <div className="rounded-2xl bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Example output</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{pattern.exampleOutput}</p>
              </div>
            ) : null}

            {pattern.tags.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tags</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pattern.tags.map((tag) => (
                    <Badge key={tag} className="bg-white text-slate-600 ring-slate-200">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <PatternLifecycleActions
            patternId={pattern.id}
            patternName={pattern.name}
            lifecycleState={pattern.lifecycleState}
          />

          <PatternBundleAssignmentCard
            pattern={pattern}
            allBundles={allBundles}
            assignedBundles={assignedBundles}
          />

          <Card>
            <CardHeader>
              <CardTitle>Pattern Health</CardTitle>
              <CardDescription>Compact review hints derived from usage, pattern feedback, and simple overlap checks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {health?.healthHints.length ? (
                health.healthHints.map((hint) => (
                  <div key={hint.text} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {hint.text}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
                  No lifecycle or overlap hints are strong enough to call out right now.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pattern Effectiveness</CardTitle>
              <CardDescription>Simple usage and evaluation counts for this pattern.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Used in signals</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{effectiveness?.usedCount ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Marked effective</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{effectiveness?.effectiveCount ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Needs refinement</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{effectiveness?.needsRefinementCount ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Marked weak</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{effectiveness?.weakCount ?? 0}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Outcome hints</p>
                <p className="mt-2">
                  Strong outputs on used signals: {effectiveness?.strongOutputCount ?? 0} · Weak or revision-needed outputs: {effectiveness?.weakOutputCount ?? 0}
                </p>
                <p className="mt-2">{effectiveness?.outcomeHint ?? "No stable outcome hint yet."}</p>
                {effectiveness?.lastUsedAt ? <p className="mt-2 text-slate-500">Last used: {formatDateTime(effectiveness.lastUsedAt)}</p> : null}
              </div>
            </CardContent>
          </Card>

          {health?.overlapHints.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Overlap Hints</CardTitle>
                <CardDescription>
                  These are consolidation hints only. Nothing is merged or retired automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {health.overlapHints.map((hint) => (
                  <div key={hint.patternId} className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-sm leading-6 text-slate-700">{hint.reason}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      <Badge className={hint.lifecycleState === "retired" ? "bg-slate-100 text-slate-600 ring-slate-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}>
                        {hint.lifecycleState === "retired" ? "Retired" : "Active"}
                      </Badge>
                      <Link href={`/patterns/${hint.patternId}`} className="text-[color:var(--accent)] underline underline-offset-4">
                        Open {hint.name}
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <PatternFeedbackPanel patternId={pattern.id} initialEntries={patternFeedbackEntries} />

          <PatternFormCard
            mode="edit"
            patternId={pattern.id}
            title="Edit pattern"
            description="Keep edits lightweight. The goal is to preserve the reusable core, not to document every detail of the source record."
            initialValues={{
              name: pattern.name,
              description: pattern.description,
              patternType: pattern.patternType,
              sourceContext: pattern.sourceContext ?? "",
              exampleSignalId: pattern.exampleSignalId ?? "",
              exampleSignalTitle: pattern.exampleSignalTitle ?? "",
              exampleSignalSummary: pattern.exampleSignalSummary ?? "",
              exampleScenarioAngle: pattern.exampleScenarioAngle ?? "",
              exampleOutput: pattern.exampleOutput ?? "",
              tags: pattern.tags,
            }}
          />
        </div>
      </div>

      <AuditTrail events={patternAuditEvents} />
    </div>
  );
}
