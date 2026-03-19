import Link from "next/link";

import type { SignalBundleCoverageHint } from "@/lib/bundle-coverage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PatternCoverageAssessment } from "@/lib/pattern-coverage";

export function PatternCoveragePanel({
  assessment,
  actionHref,
  bundleHint,
}: {
  assessment: PatternCoverageAssessment;
  actionHref?: string | null;
  bundleHint?: SignalBundleCoverageHint | null;
}) {
  if (!assessment.gapCandidate || !assessment.gapReason) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Pattern coverage gap</Badge>
          {assessment.gapType ? (
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{assessment.gapType}</Badge>
          ) : null}
        </div>
        <CardTitle>No existing pattern covers this well</CardTitle>
        <CardDescription>
          This is a bounded visibility hint. It suggests a missing reusable playbook, not an automatic pattern decision.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-700">
        <p>{assessment.gapReason}</p>
        {assessment.gapTypeDescription ? <p className="text-slate-500">{assessment.gapTypeDescription}</p> : null}
        {bundleHint?.note ? (
          <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Kit-level note</p>
            <p className="mt-2 leading-6">{bundleHint.note}</p>
            {bundleHint.relatedBundleId ? (
              <Link
                href={`/pattern-bundles/${bundleHint.relatedBundleId}`}
                className="mt-3 inline-block text-[color:var(--accent)] underline underline-offset-4"
              >
                Open related bundle
              </Link>
            ) : (
              <Link
                href="/insights#bundle-coverage-missing-kits"
                className="mt-3 inline-block text-[color:var(--accent)] underline underline-offset-4"
              >
                Review bundle coverage
              </Link>
            )}
          </div>
        ) : null}
        {actionHref ? (
          <Link href={actionHref} className="text-[color:var(--accent)] underline underline-offset-4">
            Create pattern from this
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
