import Link from "next/link";

import { ExperimentManager } from "@/components/experiments/experiment-manager";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/signal-repository";
import { buildExperimentInsights, listExperiments } from "@/lib/experiments";
import { listPostingOutcomes } from "@/lib/outcomes";
import { getPostingPlatformLabel, listPostingLogEntries } from "@/lib/posting-log";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getWeeklyPlanStore } from "@/lib/weekly-plan";
import { getCampaignStrategy } from "@/lib/campaigns";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function ExperimentsPage() {
  const strategy = await getCampaignStrategy();
  const [{ signals, source, error }, postingEntries, postingOutcomes, strategicOutcomes, experiments, weeklyPlanStore] =
    await Promise.all([
      listSignalsWithFallback({ limit: 1000 }),
      listPostingLogEntries(),
      listPostingOutcomes(),
      listStrategicOutcomes(),
      listExperiments(),
      getWeeklyPlanStore(strategy),
    ]);

  const insights = buildExperimentInsights({
    experiments,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const signalOptions = signals
    .map((signal) => ({
      id: signal.recordId,
      title: signal.sourceTitle,
    }))
    .sort((left, right) => left.title.localeCompare(right.title))
    .slice(0, 120);
  const postingOptions = postingEntries.map((entry) => ({
    id: entry.id,
    signalId: entry.signalId,
    label: `${getPostingPlatformLabel(entry.platform)} · ${entry.finalPostedText.slice(0, 56)}${entry.finalPostedText.length > 56 ? "..." : ""}`,
  }));
  const weekOptions = weeklyPlanStore.plans.map((plan) => ({
    weekStartDate: plan.weekStartDate,
    label: `${formatDate(plan.weekStartDate)} week · ${plan.theme ?? "No theme"}`,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Manual plus autopilot-built</Badge>
          </div>
          <CardTitle className="text-3xl">Experiments</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Deliberate operator-run comparisons, plus bounded autopilot-built one-variable tests that still require operator confirmation and never auto-post.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 pt-0">
          <Link href="/review" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open review queue
          </Link>
          <Link href="/insights" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open insights
          </Link>
          <Link href="/plan" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open weekly plan
          </Link>
          {error ? <p className="text-sm text-amber-700">{error}</p> : null}
        </CardContent>
      </Card>

      <ExperimentManager
        initialExperiments={experiments}
        initialInsights={insights}
        signalOptions={signalOptions}
        postingOptions={postingOptions}
        weekOptions={weekOptions}
      />
    </div>
  );
}

