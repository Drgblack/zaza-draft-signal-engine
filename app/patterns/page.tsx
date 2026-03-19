import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { listAuditEvents } from "@/lib/audit";
import { listFeedbackEntries } from "@/lib/feedback";
import { getBundlesForPattern, listPatternBundles } from "@/lib/pattern-bundles";
import { buildPatternHealthAssessments, buildPatternHealthSummary, indexPatternHealthAssessments } from "@/lib/pattern-health";
import { listPatternFeedbackEntries } from "@/lib/pattern-feedback";
import { buildPatternCandidateRecords, buildPatternDiscoverySummary } from "@/lib/pattern-discovery";
import { PATTERN_TYPE_LABELS, type PatternLifecycleState } from "@/lib/pattern-definitions";
import { buildPatternEffectivenessSummaries, listPatterns } from "@/lib/patterns";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-slate-950 px-3 py-2 text-sm font-medium text-white"
          : "rounded-full bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
      }
    >
      {label}
    </Link>
  );
}

function lifecycleBadgeClasses(state: PatternLifecycleState): string {
  return state === "retired"
    ? "bg-slate-100 text-slate-600 ring-slate-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export default async function PatternsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const stateParam = getSingleValue(params.state);
  const filterState = stateParam === "retired" || stateParam === "all" ? stateParam : "active";

  const allPatterns = await listPatterns({ includeRetired: true });
  const bundles = await listPatternBundles();
  const activePatterns = await listPatterns();
  const visiblePatterns =
    filterState === "all"
      ? allPatterns
      : allPatterns.filter((pattern) => pattern.lifecycleState === filterState);
  const { signals } = await listSignalsWithFallback({ limit: 1000 });
  const feedbackEntries = await listFeedbackEntries();
  const allAuditEvents = await listAuditEvents();
  const allPatternFeedbackEntries = await listPatternFeedbackEntries();
  const candidateRecords = buildPatternCandidateRecords(signals, feedbackEntries, activePatterns);
  const candidateSummary = buildPatternDiscoverySummary(candidateRecords);
  const healthAssessments = buildPatternHealthAssessments(
    allPatterns,
    allAuditEvents,
    allPatternFeedbackEntries,
    feedbackEntries,
  );
  const healthById = indexPatternHealthAssessments(healthAssessments);
  const healthSummary = buildPatternHealthSummary(healthAssessments);
  const effectivenessById = Object.fromEntries(
    buildPatternEffectivenessSummaries(allPatterns, allAuditEvents, allPatternFeedbackEntries, feedbackEntries).map(
      (summary) => [summary.patternId, summary],
    ),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Local library</Badge>
            <Badge className="bg-white text-slate-600 ring-slate-200">
              {healthSummary.activeCount} active · {healthSummary.retiredCount} retired
            </Badge>
            <Link href="/pattern-bundles" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open bundles
            </Link>
            <Link href="/playbook" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open playbook
            </Link>
          </div>
          <CardTitle className="text-3xl">Pattern Library</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            A manual playbook of signal, framing, and output patterns worth reusing. Retired patterns stay viewable for reference, but only active patterns participate in normal suggestions and generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 text-sm text-slate-600">
          <p>
            {allPatterns.length} saved patterns. {candidateSummary.unsavedCount} current candidate-worthy records have not been saved yet.
          </p>
          <div className="flex flex-wrap gap-2">
            <FilterLink href="/patterns" label="Active" active={filterState === "active"} />
            <FilterLink href="/patterns?state=retired" label="Retired" active={filterState === "retired"} />
            <FilterLink href="/patterns?state=all" label="All" active={filterState === "all"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pattern Health</CardTitle>
          <CardDescription>
            Lightweight lifecycle hints only. Nothing here retires, merges, or edits patterns automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Active</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{healthSummary.activeCount}</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Retired</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{healthSummary.retiredCount}</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Needs review</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{healthSummary.needsReviewCount}</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Overlap hints</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{healthSummary.possibleOverlapCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suggested Pattern Candidates</CardTitle>
          <CardDescription>
            A short list of stronger recent records that may be worth capturing as reusable patterns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Candidate-worthy</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{candidateSummary.candidateCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Already saved</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{candidateSummary.savedCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Most common shape</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {candidateSummary.topShapeLabel ?? "No stable candidate shape yet"}
              </p>
            </div>
          </div>

          {candidateSummary.recentCandidates.length === 0 ? (
            <div className="rounded-2xl bg-white/75 px-4 py-5 text-sm text-slate-500">
              No unsaved candidates are strong enough to surface right now.
            </div>
          ) : (
            <div className="space-y-3">
              {candidateSummary.recentCandidates.map((candidate) => (
                <div key={candidate.signalId} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={candidate.flag === "yes" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
                      {candidate.flag === "yes" ? "Strong candidate" : "Possible candidate"}
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                      {PATTERN_TYPE_LABELS[candidate.suggestedPatternType]}
                    </Badge>
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{candidate.sourceTitle}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{candidate.reason}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <Link href={`/signals/${candidate.signalId}`} className="text-[color:var(--accent)] underline underline-offset-4">
                      Open signal
                    </Link>
                    <Link href={`/signals/${candidate.signalId}#save-pattern`} className="text-[color:var(--accent)] underline underline-offset-4">
                      Save as pattern
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {visiblePatterns.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-8 text-sm text-slate-600">
            {filterState === "retired"
              ? "No retired patterns yet."
              : "No patterns saved yet. Open a signal record and use Save as pattern when you find reusable framing or outputs."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visiblePatterns.map((pattern) => {
            const health = healthById[pattern.id];
            const effectiveness = effectivenessById[pattern.id];
            const assignedBundles = getBundlesForPattern(pattern.id, bundles);

            return (
              <Card key={pattern.id} className={pattern.lifecycleState === "retired" ? "opacity-75" : ""}>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
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
                    {health?.overlapHints[0] ? (
                      <Badge className="bg-sky-50 text-sky-700 ring-sky-200">Overlap hint</Badge>
                    ) : null}
                  </div>
                  <CardTitle className="text-xl">{pattern.name}</CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">{pattern.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pattern.sourceContext ? (
                    <p className="text-sm text-slate-600">
                      <span className="font-medium text-slate-900">Source context:</span> {pattern.sourceContext}
                    </p>
                  ) : null}
                  {pattern.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {pattern.tags.map((tag) => (
                        <Badge key={tag} className="bg-white text-slate-600 ring-slate-200">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {assignedBundles.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {assignedBundles.map((bundle) => (
                        <Badge key={bundle.id} className="bg-sky-50 text-sky-700 ring-sky-200">
                          {bundle.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {pattern.exampleScenarioAngle ? (
                    <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Example Scenario Angle</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{pattern.exampleScenarioAngle}</p>
                    </div>
                  ) : null}
                  {health?.healthHints.length ? (
                    <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
                      {health.healthHints.map((hint) => (
                        <p key={hint.text} className="leading-6">
                          {hint.text}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {effectiveness ? (
                    <p className="text-sm text-slate-500">
                      Used {effectiveness.usedCount} times. {effectiveness.outcomeHint ?? "No stable outcome hint yet."}
                    </p>
                  ) : null}
                  <Link href={`/patterns/${pattern.id}`} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                    View pattern
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
