import Link from "next/link";

import { SignalsFilters } from "@/components/signals/signals-filters";
import { SignalsTable } from "@/components/signals/signals-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import { listFeedbackEntries } from "@/lib/feedback";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { filterSignals, sortSignals, type SignalsSortKey } from "@/lib/workflow";
import { SIGNAL_CATEGORIES, SIGNAL_STATUSES, type SignalCategory, type SignalStatus } from "@/types/signal";

export const dynamic = "force-dynamic";

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { signals, source, error } = await listSignalsWithFallback();
  const feedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const bundles = await listPatternBundles();
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    signals,
    feedbackEntries,
    patterns,
    indexBundleSummariesByPatternId(bundles),
  );

  const statusParam = getSingleValue(params.status);
  const categoryParam = getSingleValue(params.category);
  const sourceTypeParam = getSingleValue(params.sourceType);
  const sortParam = getSingleValue(params.sort);

  const status = SIGNAL_STATUSES.includes(statusParam as SignalStatus) ? (statusParam as SignalStatus) : undefined;
  const category = SIGNAL_CATEGORIES.includes(categoryParam as SignalCategory)
    ? (categoryParam as SignalCategory)
    : undefined;
  const sourceType = sourceTypeParam?.trim() ? sourceTypeParam.trim() : undefined;
  const sort = (
    ["createdDate-desc", "createdDate-asc", "sourceDate-desc", "sourceDate-asc"].includes(sortParam ?? "")
      ? sortParam
      : "createdDate-desc"
  ) as SignalsSortKey;

  const filteredSignals = sortSignals(filterSignals(signals, { status, category, sourceType }), sort);
  const sourceTypes = Array.from(
    new Set(signals.map((signal) => signal.sourceType).filter((value): value is string => Boolean(value))),
  ).sort((left, right) => left.localeCompare(right));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Signals</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            The working library for intake, interpretation, drafting, and publishing status. Filters stay intentionally light so the queue remains fast to scan, while source-aware cues help distinguish teacher discussion from generic sector coverage.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-0 text-sm text-slate-600">
          <Badge className={source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
            {source === "airtable" ? "Airtable" : "Mock mode"}
          </Badge>
          <span>Showing {filteredSignals.length} of {signals.length} records</span>
          {error ? (
            <span className="text-amber-700">
              {error}{" "}
              <Link href="/api/signals/health" target="_blank" className="underline underline-offset-4">
                View diagnostics
              </Link>
            </span>
          ) : (
            <span>{source === "airtable" ? "Live records from Airtable." : "Using mock records because Airtable is not configured."}</span>
          )}
        </CardContent>
      </Card>

      <SignalsFilters
        status={status}
        category={category}
        sourceType={sourceType}
        sort={sort}
        sourceTypes={sourceTypes}
      />

      <SignalsTable
        signals={filteredSignals}
        title="Signal Registry"
        description="Status, classification, draft readiness, and timing cues in one place."
        guidanceBySignalId={guidanceBySignalId}
      />
    </div>
  );
}
