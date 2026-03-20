import Link from "next/link";

import { WeeklyRecapPanel } from "@/components/recap/weekly-recap-panel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { syncAttributionMemory } from "@/lib/attribution";
import { appendAuditEventsSafe } from "@/lib/audit";
import { listExperiments } from "@/lib/experiments";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPostingLogEntries } from "@/lib/posting-log";
import { syncRevenueSignals } from "@/lib/revenue-signals";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WeeklyRecapPage() {
  const [signalsResult, postingEntries, postingOutcomes, strategicOutcomes, experiments, bundles] = await Promise.all([
    listSignalsWithFallback({ limit: 1000 }),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
    listExperiments(),
    listPatternBundles(),
  ]);
  const recap = buildWeeklyRecap({
    signals: signalsResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    experiments,
    bundleSummariesByPatternId: indexBundleSummariesByPatternId(bundles),
  });
  await syncAttributionMemory({
    signals: signalsResult.signals,
    postingEntries,
    strategicOutcomes,
  });
  await syncRevenueSignals({
    signals: signalsResult.signals,
    postingEntries,
    strategicOutcomes,
  });

  await appendAuditEventsSafe([
    {
      signalId: `weekly-recap:${recap.weekStartDate}`,
      eventType: "WEEKLY_RECAP_GENERATED",
      actor: "system",
      summary: `Generated weekly recap for ${recap.weekStartDate}.`,
      metadata: {
        weekStartDate: recap.weekStartDate,
        winnerCount: recap.winners.length,
        pauseCount: recap.pauseCandidates.length,
        judgedPosts: recap.supportingMetrics.judgedPostCount,
      },
    },
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={signalsResult.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {signalsResult.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Generated {formatDateTime(new Date().toISOString())}</Badge>
          </div>
          <CardTitle className="text-3xl">Weekly Winner Recap</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Compact weekly synthesis of what actually worked, what underperformed, what is worth reusing, and what should be reduced next week.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-0">
          <Link href="/digest" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open digest
          </Link>
          <Link href="/plan" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Use in weekly plan
          </Link>
          <Link href="/review" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open review
          </Link>
          <Link href="/insights" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open insights
          </Link>
        </CardContent>
      </Card>

      <WeeklyRecapPanel recap={recap} />
    </div>
  );
}
