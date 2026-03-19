import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditTrail } from "@/components/signals/audit-trail";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { getAuditEvents, listAuditEvents } from "@/lib/audit";
import {
  BUNDLE_COVERAGE_STRENGTH_LABELS,
  buildBundleCoverageSummary,
} from "@/lib/bundle-coverage";
import { listFeedbackEntries } from "@/lib/feedback";
import { getPatternBundle, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatternFeedbackEntries } from "@/lib/pattern-feedback";
import { listPatterns } from "@/lib/patterns";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PatternBundleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getPatternBundle(id);

  if (!bundle) {
    notFound();
  }

  const allPatterns = await listPatterns({ includeRetired: true });
  const { signals } = await listSignalsWithFallback({ limit: 1000 });
  const auditEvents = await getAuditEvents(`bundle:${bundle.id}`);
  const allAuditEvents = await listAuditEvents();
  const feedbackEntries = await listFeedbackEntries();
  const patternFeedbackEntries = await listPatternFeedbackEntries();
  const patternById = new Map(allPatterns.map((pattern) => [pattern.id, pattern]));
  const includedPatterns = bundle.patternIds
    .map((patternId) => patternById.get(patternId))
    .filter((pattern): pattern is NonNullable<typeof pattern> => Boolean(pattern));
  const allBundles = await listPatternBundles();
  const bundleCoverage = buildBundleCoverageSummary({
    signals,
    bundles: allBundles,
    patterns: allPatterns,
    auditEvents: allAuditEvents,
    feedbackEntries,
    patternFeedbackEntries,
  }).bundles.find((assessment) => assessment.bundleId === bundle.id) ?? null;
  const siblingBundles = allBundles.filter((candidate) => candidate.id !== bundle.id).slice(0, 3);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Pattern bundle</Badge>
            <Badge className="bg-white text-slate-600 ring-slate-200">{formatDateTime(bundle.createdAt)}</Badge>
            {bundleCoverage ? (
              <Badge
                className={
                  bundleCoverage.coverageStrength === "strong_coverage"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : bundleCoverage.coverageStrength === "partial_coverage"
                      ? "bg-sky-50 text-sky-700 ring-sky-200"
                      : bundleCoverage.coverageStrength === "thin_bundle"
                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                        : "bg-slate-100 text-slate-700 ring-slate-200"
                }
              >
                {BUNDLE_COVERAGE_STRENGTH_LABELS[bundleCoverage.coverageStrength]}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="text-3xl">{bundle.name}</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">{bundle.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 pt-0 text-sm text-slate-600">
          <span>Created by {bundle.createdBy}</span>
          <Link href="/pattern-bundles" className="text-[color:var(--accent)] underline underline-offset-4">
            Back to bundles
          </Link>
          <Link href="/patterns" className="text-[color:var(--accent)] underline underline-offset-4">
            Open pattern library
          </Link>
          <Link href={`/playbook?bundleId=${bundle.id}`} className="text-[color:var(--accent)] underline underline-offset-4">
            Create playbook card
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Included Patterns</CardTitle>
            <CardDescription>
              Bundle membership is manual. Retired patterns can stay here for reference, but they do not become active again automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {includedPatterns.length === 0 ? (
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
                No patterns are assigned to this bundle yet.
              </div>
            ) : (
              includedPatterns.map((pattern) => (
                <div key={pattern.id} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-950">{pattern.name}</p>
                    <Badge className={pattern.lifecycleState === "retired" ? "bg-slate-100 text-slate-600 ring-slate-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}>
                      {pattern.lifecycleState === "retired" ? "Retired" : "Active"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{pattern.description}</p>
                  <Link href={`/patterns/${pattern.id}`} className="mt-3 inline-block text-sm text-[color:var(--accent)] underline underline-offset-4">
                    Open pattern
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Bundle Snapshot</CardTitle>
              <CardDescription>Simple organisational context only. Bundles do not apply whole kits automatically.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Patterns</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{includedPatterns.length}</p>
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Active patterns</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {includedPatterns.filter((pattern) => pattern.lifecycleState === "active").length}
                </p>
              </div>
              {bundleCoverage ? (
                <div className="rounded-2xl bg-white/80 px-4 py-4 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Bundle health note</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{bundleCoverage.note}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {bundleCoverage.familyLabel ?? "Unclassified family"} · {bundleCoverage.relatedSignalCount} related signals · {bundleCoverage.gapCandidateCount} gap candidates.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {siblingBundles.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Other Bundles</CardTitle>
                <CardDescription>Quick navigation across the broader playbook kits.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {siblingBundles.map((candidate) => (
                  <div key={candidate.id} className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="font-medium text-slate-950">{candidate.name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{candidate.description}</p>
                    <Link href={`/pattern-bundles/${candidate.id}`} className="mt-3 inline-block text-sm text-[color:var(--accent)] underline underline-offset-4">
                      Open bundle
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <AuditTrail events={auditEvents} />
    </div>
  );
}
