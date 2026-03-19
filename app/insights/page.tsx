import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSignalsWithFallback } from "@/lib/airtable";
import { appendAuditEventsSafe, listAuditEvents } from "@/lib/audit";
import { BUNDLE_COVERAGE_STRENGTH_LABELS, type BundleCoverageStrength } from "@/lib/bundle-coverage";
import { buildCampaignCadenceSummary, buildCampaignDistributionInsights, getCampaignStrategy } from "@/lib/campaigns";
import { listFeedbackEntries } from "@/lib/feedback";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPatternBundleUsageRows, listPatternBundles } from "@/lib/pattern-bundles";
import { buildPatternHealthAssessments, buildPatternHealthSummary } from "@/lib/pattern-health";
import { PATTERN_TYPE_LABELS } from "@/lib/pattern-definitions";
import { listPatternFeedbackEntries } from "@/lib/pattern-feedback";
import { buildPatternEffectivenessSummaries, listPatterns } from "@/lib/patterns";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { buildWeeklyPlanInsights, getCurrentWeeklyPlan, getWeeklyPlanStore } from "@/lib/weekly-plan";
import { buildSignalInsights, INSIGHT_WINDOWS, type InsightObservation, type InsightWindow } from "@/lib/insights";

export const dynamic = "force-dynamic";

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function toneClasses(tone: InsightObservation["tone"]): string {
  if (tone === "success") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (tone === "warning") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function bundleCoverageClasses(strength: BundleCoverageStrength): string {
  if (strength === "strong_coverage") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (strength === "partial_coverage") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (strength === "thin_bundle") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function playbookGapClasses(kind: "uncovered" | "weak_coverage" | "opportunity"): string {
  if (kind === "weak_coverage") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (kind === "opportunity") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function confidenceClasses(level: "high" | "moderate" | "low"): string {
  if (level === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (level === "low") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function WindowLink({
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

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl bg-white/80 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyState({
  copy,
}: {
  copy: string;
}) {
  return <div className="rounded-2xl bg-white/75 px-4 py-5 text-sm text-slate-500">{copy}</div>;
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const windowParam = getSingleValue(params.window);
  const window = INSIGHT_WINDOWS.includes(windowParam as InsightWindow) ? (windowParam as InsightWindow) : "all";

  const { signals, source, error } = await listSignalsWithFallback({ limit: 1000 });
  const auditEvents = await listAuditEvents();
  const feedbackEntries = await listFeedbackEntries();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const strategicOutcomes = await listStrategicOutcomes();
  const patterns = await listPatterns();
  const allPatterns = await listPatterns({ includeRetired: true });
  const bundles = await listPatternBundles();
  const playbookCards = await listPlaybookCards({ status: "all" });
  const patternFeedbackEntries = await listPatternFeedbackEntries();
  const tuning = await getOperatorTuning();
  const strategy = await getCampaignStrategy();
  const currentWeeklyPlan = await getCurrentWeeklyPlan(strategy);
  const weeklyPlanStore = await getWeeklyPlanStore(strategy);
  const patternEffectivenessSummaries = buildPatternEffectivenessSummaries(
    allPatterns,
    auditEvents,
    patternFeedbackEntries,
    feedbackEntries,
  );
  const patternHealthSummary = buildPatternHealthSummary(
    buildPatternHealthAssessments(allPatterns, auditEvents, patternFeedbackEntries, feedbackEntries),
  );
  const bundleUsageRows = buildPatternBundleUsageRows(
    bundles,
    allPatterns,
    Object.fromEntries(patternEffectivenessSummaries.map((summary) => [summary.patternId, summary.usedCount])),
  );
  const topActiveBundle = [...bundleUsageRows].sort(
    (left, right) => right.activePatternCount - left.activePatternCount || left.name.localeCompare(right.name),
  )[0];
  const insights = buildSignalInsights(signals, auditEvents, feedbackEntries, {
    window,
    patterns,
    allPatterns,
    bundles,
    playbookCards,
    patternFeedbackEntries,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    tuning,
  });
  const campaignInsights = buildCampaignDistributionInsights(signals, strategy, postingEntries);
  const campaignCadence = buildCampaignCadenceSummary(signals, strategy, postingEntries);
  const weeklyPlanInsights = buildWeeklyPlanInsights(
    weeklyPlanStore.plans,
    strategy,
    signals,
    postingEntries,
    strategicOutcomes,
  );
  await appendAuditEventsSafe(
    insights.playbook.topCoverageGaps.map((gap) => ({
      signalId: `playbook-gap:${gap.key}`,
      eventType: "PLAYBOOK_GAP_DETECTED",
      actor: "system",
      summary: `Playbook coverage gap detected: ${gap.summary}`,
      metadata: {
        gapKind: gap.kind,
        flag: gap.flag,
        coverageArea: gap.label,
        signalCount: gap.signalCount,
        strongOutcomeCount: gap.strongOutcomeCount,
        weakOutcomeCount: gap.weakOutcomeCount,
        cautionCount: gap.cautionCount,
        cardCount: gap.cardCount,
      },
    })),
  );
  const scoredStage = insights.pipeline.stages.find((stage) => stage.key === "scored");
  const interpretedStage = insights.pipeline.stages.find((stage) => stage.key === "interpreted");
  const generatedStage = insights.pipeline.stages.find((stage) => stage.key === "generated");
  const filteredStage = insights.pipeline.stages.find((stage) => stage.key === "filteredOut");
  const topSourceKind = insights.sourceKinds[0];
  const topSource = insights.topSources[0];
  const topOverrideStage = insights.operator.overrideStageRows[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{insights.windowLabel}</Badge>
          </div>
          <CardTitle className="text-3xl">Insights</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            A compact operating summary derived from current record state and the audit trail. It stays descriptive on purpose: the goal is to show what is moving, what is stalling, and where operator judgement is stepping in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap gap-2">
            <WindowLink href="/insights" label="All time" active={window === "all"} />
            <WindowLink href="/insights?window=7d" label="Last 7 days" active={window === "7d"} />
            <WindowLink href="/insights?window=30d" label="Last 30 days" active={window === "30d"} />
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span>{insights.totalSignals} records in view</span>
            <span>{insights.dateRangeLabel}</span>
            {error ? <span className="text-amber-700">{error}</span> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Operator Tuning</CardTitle>
          <CardDescription>
            Results in this view reflect the active operator mode and its bounded behavior shifts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{insights.tuning.presetLabel}</Badge>
            <span className="text-sm text-slate-500">{insights.tuning.summary}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.tuning.rows.map((row) => (
              <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{row.valueLabel}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Campaign Strategy</CardTitle>
            <CardDescription>
              Current strategic context that is shaping content assignment and approval ranking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Active campaigns"
                value={String(campaignCadence.activeCampaignCount)}
                detail={campaignCadence.activeCampaignNames[0] ? campaignCadence.activeCampaignNames.join(" · ") : "No active campaigns yet."}
              />
              <MetricCard
                label="Pillars"
                value={String(strategy.pillars.length)}
                detail="Strategic themes available for assignment and balancing."
              />
              <MetricCard
                label="Audiences"
                value={String(strategy.audienceSegments.length)}
                detail="Audience segments available for light targeting."
              />
              <MetricCard
                label="Recent mix window"
                value={`${campaignCadence.recentWindowDays}d`}
                detail={`${campaignCadence.recentSignalsCount} recent generated, reviewed, approved, scheduled, or posted records in the cadence window.`}
              />
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {campaignCadence.underrepresentedFunnels.length > 0 || campaignCadence.underrepresentedPillars.length > 0
                ? `Current strategic gaps: ${campaignCadence.underrepresentedFunnels.slice(0, 2).join(", ") || "No funnel gap"}${campaignCadence.underrepresentedFunnels.length > 0 && campaignCadence.underrepresentedPillars.length > 0 ? " funnel content and " : ""}${campaignCadence.underrepresentedPillars.slice(0, 2).join(", ") || "no pillar gap"} pillar coverage are underrepresented in recent output.`
                : "Recent output looks reasonably balanced across the current strategy layer."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Distribution</CardTitle>
            <CardDescription>
              How current records distribute across campaigns, pillars, and funnel stages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By campaign</p>
              <div className="mt-3 space-y-3">
                {campaignInsights.byCampaign.length === 0 ? (
                  <EmptyState copy="No campaign-linked records are available yet." />
                ) : (
                  campaignInsights.byCampaign.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By pillar</p>
                <div className="mt-3 space-y-3">
                  {campaignInsights.byPillar.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By funnel stage</p>
                <div className="mt-3 space-y-3">
                  {campaignInsights.byFunnelStage.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Plan Alignment</CardTitle>
            <CardDescription>
              Current-week intent versus what the system is actually preparing and posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Week"
                value={weeklyPlanInsights.currentState?.weekLabel ?? currentWeeklyPlan.weekStartDate}
                detail={weeklyPlanInsights.currentPlan?.theme ?? "No weekly theme set."}
              />
              <MetricCard
                label="Goals"
                value={String(weeklyPlanInsights.currentPlan?.goals.length ?? 0)}
                detail={weeklyPlanInsights.currentPlan?.goals[0] ?? "No weekly goals saved."}
              />
              <MetricCard
                label="Plan gaps"
                value={String(weeklyPlanInsights.currentState?.gaps.length ?? 0)}
                detail={weeklyPlanInsights.currentState?.summaries[0] ?? "Current output looks broadly aligned."}
              />
              <MetricCard
                label="Stored weeks"
                value={String(weeklyPlanStore.plans.length)}
                detail="Light planning history for weekly comparison."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Platforms vs target</p>
                <div className="mt-3 space-y-3">
                  {weeklyPlanInsights.currentState?.platformRows.map((row) => (
                    <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.actualCount}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">Target: {row.target > 1 ? "Focus" : row.target === 1 ? "Light" : "Off"}</p>
                    </div>
                  )) ?? <EmptyState copy="No weekly plan state is available yet." />}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Funnels vs target</p>
                <div className="mt-3 space-y-3">
                  {weeklyPlanInsights.currentState?.funnelRows.map((row) => (
                    <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.actualCount}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">Target: {row.target > 1 ? "Focus" : row.target === 1 ? "Light" : "Off"}</p>
                    </div>
                  )) ?? <EmptyState copy="No weekly plan state is available yet." />}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Modes vs target</p>
                <div className="mt-3 space-y-3">
                  {weeklyPlanInsights.currentState?.modeRows
                    .filter((row) => row.target > 0 || row.actualCount > 0)
                    .slice(0, 6)
                    .map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-600">{row.label}</span>
                          <span className="text-lg font-semibold text-slate-950">{row.actualCount}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">Target: {row.target > 1 ? "Focus" : row.target === 1 ? "Light" : "Off"}</p>
                      </div>
                    )) ?? <EmptyState copy="No weekly mode data is available yet." />}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Plan gaps</p>
                <div className="mt-3 space-y-3">
                  {(weeklyPlanInsights.currentState?.gaps.length ? weeklyPlanInsights.currentState.gaps : weeklyPlanInsights.currentState?.summaries ?? []).slice(0, 5).map((note) => (
                    <div key={note} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                      {note}
                    </div>
                  ))}
                  {!weeklyPlanInsights.currentState ? <EmptyState copy="No weekly plan state is available yet." /> : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Plan Effectiveness</CardTitle>
            <CardDescription>
              Lightweight comparison of recent planned weeks against strategic-value outcomes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {weeklyPlanInsights.effectivenessRows.length === 0 ? (
              <EmptyState copy="No weekly plan history is stable enough to compare yet." />
            ) : (
              weeklyPlanInsights.effectivenessRows.slice(0, 5).map((row) => (
                <div key={row.weekLabel} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.weekLabel}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.theme ?? "No theme"}</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">High strategic value</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{row.highValueCount}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Leads</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{row.leadTotal}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top platform</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{row.topPlatformLabel ?? "None yet"}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>At A Glance</CardTitle>
          <CardDescription>Core volume and progression across the current window.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Signals in scope"
            value={String(insights.totalSignals)}
            detail={topSourceKind ? `${topSourceKind.label} is the largest source family in this view.` : "No source family dominates this window yet."}
          />
          <MetricCard
            label="Reached interpretation"
            value={String(interpretedStage?.count ?? 0)}
            detail={scoredStage ? `${formatPercent(interpretedStage?.share ?? 0)} of all records in scope.` : "No scored records yet."}
          />
          <MetricCard
            label="Reached generation"
            value={String(generatedStage?.count ?? 0)}
            detail={`${formatPercent(insights.scenarioAngles.strongOrUsableGenerationRate)} generation rate for usable or strong framing.`}
          />
          <MetricCard
            label="Operator overrides"
            value={String(insights.operator.overrides)}
            detail={topOverrideStage ? `${topOverrideStage.label} is the most common override stage.` : "No audited overrides in this window."}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Editorial Confidence</CardTitle>
            <CardDescription>
              A lightweight view of how much trust the current guidance appears to deserve based on structured support, not objective correctness.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {insights.editorialConfidence.rows.map((row) => (
                <div key={row.level} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label} confidence</p>
                    <Badge className={confidenceClasses(row.level)}>{row.label}</Badge>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">{row.count}</p>
                  <p className="mt-1 text-sm text-slate-500">Records in the current window.</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.editorialConfidence.lowCount > 0
                ? `${insights.editorialConfidence.lowCount} records currently need heavier human judgement because framing, support memory, or coverage is still thin.`
                : "No records in this window are currently surfacing as low-confidence guidance cases."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Low-Confidence Clusters</CardTitle>
            <CardDescription>
              Where uncertainty is concentrating most often right now, by source kind, family, and recurring uncertainty flag.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Source kinds</p>
              <div className="mt-3 space-y-3">
                {insights.editorialConfidence.lowConfidenceSourceKinds.length === 0 ? (
                  <EmptyState copy="No low-confidence source-kind cluster is stable enough to surface yet." />
                ) : (
                  insights.editorialConfidence.lowConfidenceSourceKinds.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Families</p>
              <div className="mt-3 space-y-3">
                {insights.editorialConfidence.lowConfidenceFamilies.length === 0 ? (
                  <EmptyState copy="No low-confidence family cluster is stable enough to surface yet." />
                ) : (
                  insights.editorialConfidence.lowConfidenceFamilies.map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Top uncertainty flags</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {insights.editorialConfidence.topUncertaintyFlags.length === 0 ? (
                  <EmptyState copy="No uncertainty flags are stable enough to summarize yet." />
                ) : (
                  insights.editorialConfidence.topUncertaintyFlags.map((row) => (
                    <Badge key={row.code} className="bg-slate-100 text-slate-700 ring-slate-200">
                      {row.label}: {row.count}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Source Mix Insights</CardTitle>
            <CardDescription>
              Which source families are producing volume, interpretation-ready records, and generation-ready records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {topSourceKind ? (
              <div className="rounded-2xl bg-white/80 p-4 text-sm leading-6 text-slate-700">
                {topSourceKind.label} contributed {topSourceKind.total} records; {topSourceKind.interpreted} reached interpretation; {topSourceKind.generated} reached generation.
                {topSource ? ` The strongest individual contributor in this window is ${topSource.label}.` : ""}
              </div>
            ) : (
              <EmptyState copy="No source mix insight is available until records exist in the selected window." />
            )}

            {insights.sourceKinds.length === 0 ? (
              <EmptyState copy="No source families are present in this window." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    <tr>
                      <th className="pb-3 pr-4 font-medium">Source kind</th>
                      <th className="pb-3 pr-4 font-medium">Total</th>
                      <th className="pb-3 pr-4 font-medium">Interpreted</th>
                      <th className="pb-3 pr-4 font-medium">Generated</th>
                      <th className="pb-3 pr-4 font-medium">Filtered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.sourceKinds.map((row) => (
                      <tr key={row.key} className="border-t border-black/6">
                        <td className="py-3 pr-4 font-medium text-slate-900">{row.label}</td>
                        <td className="py-3 pr-4 text-slate-600">{row.total}</td>
                        <td className="py-3 pr-4 text-slate-600">
                          {row.interpreted} <span className="text-slate-400">({formatPercent(row.interpretationRate)})</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {row.generated} <span className="text-slate-400">({formatPercent(row.generationRate)})</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {row.filteredOut} <span className="text-slate-400">({formatPercent(row.filteredRate)})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Specific Sources</CardTitle>
            <CardDescription>Compact watchlists for the strongest and weakest current contributors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Strongest current contributors</p>
              <div className="mt-3 space-y-3">
                {insights.topSources.length === 0 ? (
                  <EmptyState copy="No specific source contributors are available yet." />
                ) : (
                  insights.topSources.map((row) => (
                    <div key={`top-${row.key}`} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{row.label}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {row.total} total; {row.interpreted} interpreted; {row.generated} generated.
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Watchlist</p>
              <div className="mt-3 space-y-3">
                {insights.watchSources.length === 0 ? (
                  <EmptyState copy="No weak-source watchlist is available yet." />
                ) : (
                  insights.watchSources.map((row) => (
                    <div key={`watch-${row.key}`} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{row.label}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {row.filteredOut} filtered out; {row.generated} generated; {row.total} total.
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scenario Angle Insights</CardTitle>
            <CardDescription>
              Framing quality is measured with the existing Scenario Angle rules, not a separate scoring model.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Blocked by framing"
                value={String(insights.scenarioAngles.blockedSignals)}
                detail="Current records where co-pilot guidance is asking for stronger scenario framing."
              />
              <MetricCard
                label="Usable/strong to generation"
                value={formatPercent(insights.scenarioAngles.strongOrUsableGenerationRate)}
                detail="Generation rate for records with workable framing."
              />
              <MetricCard
                label="Weak/missing to generation"
                value={formatPercent(insights.scenarioAngles.weakOrMissingGenerationRate)}
                detail="Generation rate when framing is still weak or absent."
              />
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Quality</th>
                    <th className="pb-3 pr-4 font-medium">Total</th>
                    <th className="pb-3 pr-4 font-medium">Interpreted</th>
                    <th className="pb-3 pr-4 font-medium">Generated</th>
                    <th className="pb-3 pr-4 font-medium">Blocked now</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.scenarioAngles.rows.map((row) => (
                    <tr key={row.quality} className="border-t border-black/6">
                      <td className="py-3 pr-4 font-medium text-slate-900">{row.label}</td>
                      <td className="py-3 pr-4 text-slate-600">{row.total}</td>
                      <td className="py-3 pr-4 text-slate-600">
                        {row.interpreted} <span className="text-slate-400">({formatPercent(row.interpretationRate)})</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {row.generated} <span className="text-slate-400">({formatPercent(row.generationRate)})</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{row.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline Stage Insights</CardTitle>
            <CardDescription>Simple stage counts using the current workflow definitions and saved record state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {insights.pipeline.stages.map((stage) => (
                <MetricCard
                  key={stage.key}
                  label={stage.label}
                  value={String(stage.count)}
                  detail={stage.key === "ingested" ? "Current records in the selected window." : `${formatPercent(stage.share)} of records in scope.`}
                />
              ))}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {scoredStage?.count ?? 0} records have been scored. {generatedStage?.count ?? 0} have reached generation, and {filteredStage?.count ?? 0} have been filtered out.
              {insights.pipeline.reviewRecommended > 0
                ? ` ${insights.pipeline.reviewRecommended} still carry a review recommendation or human-review flag.`
                : " No records are currently marked for human review."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Operator Override Insights</CardTitle>
            <CardDescription>
              Derived only from the bounded audit events already recorded for manual actions and override comparisons.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <MetricCard
                label="Manual actions"
                value={String(insights.operator.manualActions)}
                detail={`${insights.operator.auditEvents} audit events attached to records in this window.`}
              />
              <MetricCard
                label="Followed current guidance"
                value={String(insights.operator.followedGuidance)}
                detail={
                  insights.operator.trackedGuidanceActions > 0
                    ? `${formatPercent(1 - insights.operator.overrideRate)} of tracked guidance-comparison actions.`
                    : "No tracked operator actions with guidance comparison yet."
                }
              />
              <MetricCard
                label="Overrides"
                value={String(insights.operator.overrides)}
                detail={`${insights.operator.overrideSignals} records with at least one audited override.`}
              />
              <MetricCard
                label="Override rate"
                value={formatPercent(insights.operator.overrideRate)}
                detail="Based on interpretation, generation, and workflow actions that currently emit override comparisons."
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Manual intervention by stage</p>
                <div className="mt-3 space-y-3">
                  {insights.operator.stageRows.length === 0 ? (
                    <EmptyState copy="No operator actions are audited in this window yet." />
                  ) : (
                    insights.operator.stageRows.map((row) => (
                      <div key={row.key} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Override concentration</p>
                <div className="mt-3 space-y-3">
                  {insights.operator.overrideStageRows.length === 0 ? (
                    <EmptyState copy="No override concentration is visible in this window." />
                  ) : (
                    insights.operator.overrideStageRows.map((row) => (
                      <div key={row.key} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Practical Observations</CardTitle>
            <CardDescription>Rule-based notes derived from the current metrics. No model-generated commentary is used here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.observations.length === 0 ? (
              <EmptyState copy="No practical observations are stable enough to show yet." />
            ) : (
              insights.observations.map((observation, index) => (
                <div key={`${observation.text}-${index}`} className="flex gap-3 rounded-2xl bg-white/80 p-4">
                  <Badge className={toneClasses(observation.tone)}>{observation.tone}</Badge>
                  <p className="text-sm leading-6 text-slate-700">{observation.text}</p>
                </div>
              ))
            )}

            <div className="rounded-2xl bg-slate-100 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current limitations</p>
              <div className="mt-3 space-y-2">
                {insights.limitations.map((item) => (
                  <p key={item} className="text-sm leading-6 text-slate-600">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div id="bundle-coverage-missing-kits" className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Bundle Coverage &amp; Missing Kits</CardTitle>
            <CardDescription>
              Strategic visibility into which communication families already have robust kits, which bundles look thin, and which recurring families still need a kit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Strong coverage"
                value={String(insights.bundleCoverage.strongCoverageCount)}
                detail="Bundles that look active and stable for their family."
              />
              <MetricCard
                label="Partial coverage"
                value={String(insights.bundleCoverage.partialCoverageCount)}
                detail="Bundles that help, but still leave related signals partially or fully uncovered."
              />
              <MetricCard
                label="Thin bundles"
                value={String(insights.bundleCoverage.thinBundleCount)}
                detail="Existing kits that likely need one stronger supporting pattern."
              />
              <MetricCard
                label="Missing kits"
                value={String(insights.bundleCoverage.missingKitCandidates.length)}
                detail="Recurring uncovered families with no meaningful current kit."
              />
            </div>

            {insights.bundleCoverage.bundles.length === 0 ? (
              <EmptyState copy="No bundles exist yet, so there is no bundle-level coverage picture to summarize." />
            ) : (
              <div className="space-y-3">
                {insights.bundleCoverage.bundles.map((bundle) => (
                  <div key={bundle.bundleId} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{bundle.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {bundle.familyLabel ?? "Unclassified family"}
                        </p>
                      </div>
                      <Badge className={bundleCoverageClasses(bundle.coverageStrength)}>
                        {BUNDLE_COVERAGE_STRENGTH_LABELS[bundle.coverageStrength]}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{bundle.note}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      {bundle.activePatternCount} active pattern{bundle.activePatternCount === 1 ? "" : "s"}, {bundle.retiredPatternCount} retired, {bundle.gapCandidateCount} related gap candidate{bundle.gapCandidateCount === 1 ? "" : "s"}.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                      <Link href={`/pattern-bundles/${bundle.bundleId}`} className="text-[color:var(--accent)] underline underline-offset-4">
                        Open bundle
                      </Link>
                      <span className="text-slate-600">{bundle.suggestedAction}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Missing Kit Candidates</CardTitle>
            <CardDescription>
              Recurring uncovered families that look reusable enough to justify a new bundle or a stronger bundle expansion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.bundleCoverage.missingKitCandidates.length === 0 ? (
              <EmptyState copy="No recurring missing-kit family is stable enough to surface right now." />
            ) : (
              insights.bundleCoverage.missingKitCandidates.map((candidate) => (
                <div key={candidate.familyLabel} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{candidate.familyLabel}</p>
                    <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
                      {candidate.count} signals
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{candidate.familyDescription}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{candidate.reason}</p>
                  {candidate.relatedBundleNames.length > 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      Related bundles: {candidate.relatedBundleNames.join(", ")}.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <span className="text-slate-700">{candidate.suggestedAction}</span>
                    {candidate.exampleSignalIds[0] ? (
                      <Link href={`/signals/${candidate.exampleSignalIds[0]}`} className="text-[color:var(--accent)] underline underline-offset-4">
                        Open example signal
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Playbook Coverage Gaps</CardTitle>
            <CardDescription>
              High-signal areas where operators are still improvising, adapting too often, or seeing clear opportunities without a saved card.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Coverage areas"
                value={String(insights.playbook.coverageAreaCount)}
                detail={`${insights.playbook.coveredAreaCount} covered and ${insights.playbook.lowSignalAreaCount} still low-signal.`}
              />
              <MetricCard
                label="Uncovered"
                value={String(insights.playbook.uncoveredAreaCount)}
                detail="Areas with enough activity but no relevant playbook card."
              />
              <MetricCard
                label="Weak coverage"
                value={String(insights.playbook.weaklyCoveredAreaCount)}
                detail={
                  insights.playbook.weakCoverageGaps[0]
                    ? "Areas where current card guidance is not holding up cleanly."
                    : "No weakly covered area is stable enough to call out yet."
                }
              />
              <MetricCard
                label="Opportunities"
                value={String(insights.playbook.opportunityGaps.length)}
                detail="Areas with strong outcomes but no saved playbook guidance yet."
              />
            </div>

            {insights.playbook.topCoverageGaps.length === 0 ? (
              <EmptyState copy="No stable playbook coverage gaps are visible in this window yet." />
            ) : (
              <div className="space-y-4">
                {[
                  {
                    title: "Uncovered",
                    rows: insights.playbook.uncoveredGaps,
                    emptyCopy: "No uncovered playbook gaps are stable enough to surface.",
                  },
                  {
                    title: "Weak Coverage",
                    rows: insights.playbook.weakCoverageGaps,
                    emptyCopy: "No weakly covered area is stable enough to surface.",
                  },
                  {
                    title: "Opportunity",
                    rows: insights.playbook.opportunityGaps,
                    emptyCopy: "No strong no-card opportunity is visible right now.",
                  },
                ].map((group) => (
                  <div key={group.title} className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{group.title}</p>
                    {group.rows.length === 0 ? (
                      <EmptyState copy={group.emptyCopy} />
                    ) : (
                      group.rows.map((gap) => (
                        <div key={gap.key} className="rounded-2xl bg-white/80 px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="font-medium text-slate-950">{gap.label}</p>
                            <Badge className={playbookGapClasses(gap.kind)}>
                              {gap.kind === "weak_coverage"
                                ? "Weak coverage"
                                : gap.kind === "opportunity"
                                  ? "Opportunity"
                                  : "Uncovered"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{gap.summary}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-500">{gap.whyFlagged}</p>
                          <p className="mt-3 text-sm text-slate-700">{gap.suggestedAction}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                            <Link
                              href={`/playbook?gapKey=${encodeURIComponent(gap.key)}`}
                              className="text-[color:var(--accent)] underline underline-offset-4"
                            >
                              Create playbook card
                            </Link>
                            {gap.signalIds[0] ? (
                              <Link
                                href={`/signals/${gap.signalIds[0]}`}
                                className="text-[color:var(--accent)] underline underline-offset-4"
                              >
                                Open example signal
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Playbook Cards</CardTitle>
            <CardDescription>
              Compact operator guidance cards derived manually from recurring editorial judgement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Cards"
                value={String(insights.playbook.cardCount)}
                detail={`${insights.playbook.activeCount} active and ${insights.playbook.retiredCount} retired.`}
              />
              <MetricCard
                label="Referenced cards"
                value={String(insights.playbook.referencedCount)}
                detail="Cards that surfaced at least once as relevant guidance in this window."
              />
              <MetricCard
                label="Top card"
                value={insights.playbook.topCards[0]?.title ?? "None yet"}
                detail={
                  insights.playbook.topCards[0]
                    ? `${insights.playbook.topCards[0].count} relevant matches in this window.`
                    : "No card has surfaced often enough to call out yet."
                }
              />
              <MetricCard
                label="Families without cards"
                value={String(insights.playbook.uncoveredFamiliesWithoutCard.length)}
                detail="Recurring family labels still not represented in active cards."
              />
            </div>

            {insights.playbook.topCards.length === 0 ? (
              <EmptyState copy="No playbook cards are being surfaced for current signals yet." />
            ) : (
              <div className="space-y-3">
                {insights.playbook.topCards.map((card) => (
                  <div key={card.cardId} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">{card.title}</p>
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{card.count} matches</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                      <Link href={`/playbook/${card.cardId}`} className="text-[color:var(--accent)] underline underline-offset-4">
                        Open playbook card
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {insights.playbook.topCards[0]
                  ? `${insights.playbook.topCards[0].title} is currently the most frequently surfaced playbook card in this window.`
                  : "No playbook card is surfacing often enough to call out yet."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {insights.playbook.topCoverageGaps[0]
                  ? insights.playbook.topCoverageGaps[0].summary
                  : "No playbook coverage gap is clearly dominant right now."}
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                {insights.playbook.activeCount > 0
                  ? `${insights.playbook.activeCount} active card${insights.playbook.activeCount === 1 ? "" : "s"} are currently available as operator guidance.`
                  : "There are no active playbook cards available yet."}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Feedback Summary</CardTitle>
            <CardDescription>
              Explicit operator labels captured on records, framing, recommendations, outputs, and sources.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Feedback entries"
                value={String(insights.feedback.totalEntries)}
                detail="Append-only operator feedback labels in the current window."
              />
              <MetricCard
                label="Useful signals"
                value={String(insights.feedback.categories.find((category) => category.category === "signal")?.rows.find((row) => row.value === "useful_signal")?.count ?? 0)}
                detail="Signals explicitly marked useful by the operator."
              />
              <MetricCard
                label="Strong outputs"
                value={String(insights.feedback.categories.find((category) => category.category === "output")?.rows.find((row) => row.value === "strong_output")?.count ?? 0)}
                detail="Interpretation or generation outputs marked strong."
              />
            </div>

            <div className="space-y-4">
              {insights.feedback.categories.map((category) => (
                <div key={category.category} className="rounded-2xl bg-white/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{category.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{category.total} total</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {category.rows.map((row) => (
                      <div key={row.value} className="rounded-2xl bg-slate-50/80 px-4 py-3">
                        <p className="text-sm text-slate-600">{row.label}</p>
                        <p className="mt-2 text-xl font-semibold text-slate-950">{row.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source Feedback</CardTitle>
            <CardDescription>
              Passive source-tuning support only. These labels help manual source control without changing ingestion automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.feedback.sourceRows.length === 0 ? (
              <EmptyState copy="No source-level feedback has been recorded in this window yet." />
            ) : (
              insights.feedback.sourceRows.map((row) => (
                <div key={row.label} className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="font-medium text-slate-950">{row.label}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {row.highQuality} marked high quality; {row.noisy} marked noisy; {row.total} source labels total.
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pattern Bundles</CardTitle>
            <CardDescription>
              Manual kit coverage across the active playbook. Bundles organise related patterns; they do not apply automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Bundle count"
              value={String(bundles.length)}
              detail="Total saved bundle families."
            />
            <MetricCard
              label="Most-used bundle"
              value={bundleUsageRows[0]?.name ?? "None yet"}
              detail={
                bundleUsageRows[0]
                  ? `${bundleUsageRows[0].usedCount} total pattern applications across the bundle.`
                  : "No bundle usage is visible yet."
              }
            />
            <MetricCard
              label="Most active patterns"
              value={topActiveBundle?.name ?? "None yet"}
              detail={
                topActiveBundle
                  ? `${topActiveBundle.activePatternCount} active patterns in that bundle.`
                  : "No bundle membership is visible yet."
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bundle Notes</CardTitle>
            <CardDescription>Small bundle-level observations only. No ranking or automatic grouping exists here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bundleUsageRows.length === 0 ? (
              <EmptyState copy="No pattern bundles exist yet." />
            ) : (
              bundleUsageRows.slice(0, 3).map((bundle) => (
                <div key={bundle.bundleId} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  {bundle.name} contains {bundle.totalPatterns} patterns, {bundle.activePatternCount} active, and has been used {bundle.usedCount} times through its member patterns.
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Editorial Modes</CardTitle>
            <CardDescription>
              Intent-profile usage across saved drafts. Modes shape framing, but they do not replace Scenario Angle or pattern guidance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Mode-tagged drafts"
                value={String(insights.editorialModes.usedCount)}
                detail="Signals in this window with a saved editorial mode."
              />
              <MetricCard
                label="Top mode"
                value={insights.editorialModes.topModeLabel ?? "None yet"}
                detail={
                  insights.editorialModes.topModeLabel
                    ? `${insights.editorialModes.topModeCount} saved drafts used that mode.`
                    : "No saved drafts carry editorial mode metadata yet."
                }
              />
              <MetricCard
                label="Strong outputs"
                value={String(insights.editorialModes.rows.reduce((sum, row) => sum + row.strongOutputCount, 0))}
                detail="Saved mode-tagged signals with strong output feedback."
              />
              <MetricCard
                label="Rarely used modes"
                value={String(insights.editorialModes.underusedLabels.length)}
                detail={
                  insights.editorialModes.underusedLabels.length > 0
                    ? insights.editorialModes.underusedLabels.join(", ")
                    : "No obvious underused modes in this window."
                }
              />
            </div>

            <div className="space-y-3">
              {insights.editorialModes.rows.map((row) => (
                <div key={row.mode} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.usedCount} uses</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {row.strongOutputCount} strong-output signals have been saved with this mode in the current window.
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Editorial Mode Notes</CardTitle>
            <CardDescription>
              Light visibility only. This does not optimise, rank, or auto-select modes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.editorialModes.topModeLabel
                ? `${insights.editorialModes.topModeLabel} is currently the most-used editorial mode in this window.`
                : "No saved draft in this window has editorial mode metadata yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.editorialModes.rows.some((row) => row.strongOutputCount > 0)
                ? `${[...insights.editorialModes.rows].sort((left, right) => right.strongOutputCount - left.strongOutputCount || left.label.localeCompare(right.label))[0]?.label} currently has the clearest strong-output pairing.`
                : "No editorial mode has strong-output feedback attached in this window yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.editorialModes.underusedLabels.length > 0
                ? `${insights.editorialModes.underusedLabels.join(", ")} are currently underused, so they may be worth testing on the next suitable signal.`
                : "No editorial mode is underused enough to call out in this window."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pattern Lifecycle</CardTitle>
            <CardDescription>
              Current library health across active, retired, review-needed, and overlap-prone patterns.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Active patterns"
              value={String(patternHealthSummary.activeCount)}
              detail="Available for normal suggestions and generation."
            />
            <MetricCard
              label="Retired patterns"
              value={String(patternHealthSummary.retiredCount)}
              detail="Kept for reference only."
            />
            <MetricCard
              label="Needs review"
              value={String(patternHealthSummary.needsReviewCount)}
              detail="Active patterns with lifecycle or overlap hints."
            />
            <MetricCard
              label="Weak/refinement signals"
              value={String(patternHealthSummary.repeatedWeakOrRefinementCount)}
              detail="Patterns with repeated weak or refinement feedback."
            />
            <MetricCard
              label="Overlap hints"
              value={String(patternHealthSummary.possibleOverlapCount)}
              detail="Patterns that may need consolidation review."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pattern Lifecycle Notes</CardTitle>
            <CardDescription>
              Manual curation guidance only. Lifecycle hints do not retire or merge anything automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {patternHealthSummary.retiredCount > 0
                ? `${patternHealthSummary.retiredCount} patterns are currently retired and excluded from normal suggestions and generation.`
                : "No patterns are retired right now."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {patternHealthSummary.needsReviewCount > 0
                ? `${patternHealthSummary.needsReviewCount} active patterns currently show enough lifecycle friction to justify review.`
                : "No active pattern is currently noisy enough to surface as review-needed."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {patternHealthSummary.possibleOverlapCount > 0
                ? `${patternHealthSummary.possibleOverlapCount} patterns currently carry overlap hints, so the library may have consolidation opportunities.`
                : "No stable overlap hints are visible right now."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Final Review</CardTitle>
            <CardDescription>
              Lightweight last-mile review visibility for generated drafts before manual posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Review started"
                value={String(insights.finalReview.startedCount)}
                detail="Signals with a saved final-review state."
              />
              <MetricCard
                label="Review completed"
                value={String(insights.finalReview.completedCount)}
                detail="Signals where every generated platform is now ready or skipped."
              />
              <MetricCard
                label="Best ready rate"
                value={insights.finalReview.highestReadyPlatformLabel ?? "None yet"}
                detail={
                  insights.finalReview.highestReadyPlatformLabel
                    ? "Current platform most often marked ready."
                    : "No platform has been marked ready yet."
                }
              />
              <MetricCard
                label="Most skipped"
                value={
                  [...insights.finalReview.platformRows].sort((left, right) => right.skipCount - left.skipCount || left.label.localeCompare(right.label))[0]?.label ?? "None yet"
                }
                detail="Platform most often skipped in final review."
              />
            </div>

            <div className="space-y-3">
              {insights.finalReview.platformRows.map((row) => (
                <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.readyCount} ready</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {row.needsEditCount} need edit; {row.skipCount} skipped.
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Final Review Notes</CardTitle>
            <CardDescription>
              Final review remains a manual judgement layer. It supports readiness decisions but does not post content automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.finalReview.highestReadyPlatformLabel
                ? `${insights.finalReview.highestReadyPlatformLabel} is currently the platform most often marked ready during final review.`
                : "No platform is being marked ready often enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.finalReview.startedCount > 0
                ? `${insights.finalReview.startedCount} signals in this window already have final review underway.`
                : "No signal in this window has started final review yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.finalReview.completedCount > 0
                ? `${insights.finalReview.completedCount} signals have fully resolved final platform decisions in this window.`
                : "No signal has fully completed final review decisions in this window yet."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Posting Memory</CardTitle>
            <CardDescription>
              Manual publishing history logged after external posting. This does not connect to social APIs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Posts logged"
                value={String(insights.posting.totalPostsLogged)}
                detail="Manual external publishing entries recorded in this window."
              />
              <MetricCard
                label="Signals posted"
                value={String(insights.posting.signalsPostedCount)}
                detail="Signals with at least one logged published post."
              />
              <MetricCard
                label="Top platform"
                value={insights.posting.topPlatformLabel ?? "None yet"}
                detail={
                  insights.posting.topPlatformLabel
                    ? "Platform most often logged as posted."
                    : "No platform posting history recorded yet."
                }
              />
              <MetricCard
                label="Top posted mode"
                value={insights.posting.topEditorialModeLabel ?? "None yet"}
                detail="Editorial mode most often represented in posting memory."
              />
            </div>

            <div className="space-y-3">
              {insights.posting.platformRows.map((row) => (
                <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count} posts</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Posting Memory Notes</CardTitle>
            <CardDescription>
              This layer preserves what was actually posted. It stays separate from final review and does not automate publishing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.posting.topPatternName
                ? `${insights.posting.topPatternName} is currently the pattern most often associated with logged posts in this window.`
                : "No posted output in this window is tied to a saved pattern strongly enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.posting.topSourceKindLabel
                ? `${insights.posting.topSourceKindLabel} is currently the source family most often reaching actual posting.`
                : "No source family stands out in posting memory yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.posting.topEditorialModeLabel
                ? `${insights.posting.topEditorialModeLabel} is the editorial mode showing up most often in logged published posts.`
                : "No editorial mode has enough posting-memory history to surface yet."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Asset Mix</CardTitle>
            <CardDescription>
              Lightweight visibility into how approval-ready content is currently packaging visual support.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {insights.assets.rows.map((row) => (
                <MetricCard
                  key={row.type}
                  label={row.label}
                  value={String(row.count)}
                  detail={row.strongCount > 0 ? `${row.strongCount} strong posted outcomes.` : "No strong posted outcomes recorded yet."}
                />
              ))}
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.assets.topUsedLabel
                ? `${insights.assets.topUsedLabel} is the most-used asset posture in the current window.`
                : "No asset usage pattern is stable enough to surface yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.assets.topStrongLabel
                ? `${insights.assets.topStrongLabel} assets are currently most often tied to strong posted outcomes.`
                : "There is not enough posted outcome history yet to call out one asset type as strongest."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Repurposing Mix</CardTitle>
            <CardDescription>
              How often one signal is being expanded into additional bounded platform variants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Bundles"
                value={String(insights.repurposing.totalBundles)}
                detail="Signals carrying a saved repurposing bundle."
              />
              <MetricCard
                label="Outputs"
                value={String(insights.repurposing.totalOutputs)}
                detail="Total bounded repurposed variants in scope."
              />
              <MetricCard
                label="Top platform"
                value={insights.repurposing.topPlatformLabel ?? "None yet"}
                detail="Most common platform across repurposed outputs."
              />
              <MetricCard
                label="Top strong"
                value={insights.repurposing.topStrongPlatformLabel ?? "None yet"}
                detail="Platform most often associated with strong posted outcomes where selection history exists."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By platform</p>
                <div className="mt-3 space-y-3">
                  {insights.repurposing.platformRows.length === 0 ? (
                    <EmptyState copy="No repurposing bundles are stable enough to summarize yet." />
                  ) : (
                    insights.repurposing.platformRows.map((row) => (
                      <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.count}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {row.strongCount > 0 ? `${row.strongCount} strong posted outcomes.` : "No strong posted outcomes recorded yet."}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By format</p>
                <div className="mt-3 space-y-3">
                  {insights.repurposing.formatRows.length === 0 ? (
                    <EmptyState copy="No repurposed formats are visible yet." />
                  ) : (
                    insights.repurposing.formatRows.map((row) => (
                      <div key={row.formatType} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publish Prep Usage</CardTitle>
            <CardDescription>
              Lightweight visibility into the last-mile posting packages being prepared for manual publishing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Packages"
                value={String(insights.publishPrep.totalPackages)}
                detail="Saved publish-prep packages in the current window."
              />
              <MetricCard
                label="Top platform"
                value={insights.publishPrep.topPlatformLabel ?? "None yet"}
                detail="Platform most often receiving a posting package."
              />
              <MetricCard
                label="Top hook style"
                value={insights.publishPrep.topHookStyleLabel ?? "None yet"}
                detail="Most common selected hook posture across packages."
              />
              <MetricCard
                label="Top CTA style"
                value={insights.publishPrep.topCtaStyleLabel ?? "None yet"}
                detail="Most common selected CTA posture across packages."
              />
              <MetricCard
                label="Top destination"
                value={insights.publishPrep.topDestinationLabel ?? "None yet"}
                detail={
                  insights.publishPrep.topHighValueDestinationLabel
                    ? `${insights.publishPrep.topHighValueDestinationLabel} currently has the strongest high-value outcome linkage.`
                    : "No destination-outcome pattern is stable enough yet."
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By platform</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.platformRows.length === 0 ? (
                    <EmptyState copy="No publish-prep packages are visible yet." />
                  ) : (
                    insights.publishPrep.platformRows.map((row) => (
                      <div key={row.platform} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Site destinations</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.destinationRows.length === 0 ? (
                    <EmptyState copy="No site-link destination usage is stable enough to summarize yet." />
                  ) : (
                    insights.publishPrep.destinationRows.slice(0, 5).map((row) => (
                      <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-600">{row.label}</span>
                          <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">{row.highValueCount} high-value strategic outcomes linked.</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Hook styles</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.hookStyleRows.length === 0 ? (
                    <EmptyState copy="No selected publish hooks are stable enough to summarize yet." />
                  ) : (
                    insights.publishPrep.hookStyleRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">CTA styles</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.ctaStyleRows.length === 0 ? (
                    <EmptyState copy="No selected CTA patterns are visible yet." />
                  ) : (
                    insights.publishPrep.ctaStyleRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">CTA goal to destination</p>
                <div className="mt-3 space-y-3">
                  {insights.publishPrep.ctaGoalDestinationRows.length === 0 ? (
                    <EmptyState copy="No CTA-to-destination pairing is stable enough to summarize yet." />
                  ) : (
                    insights.publishPrep.ctaGoalDestinationRows.slice(0, 5).map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                        <span className="text-sm text-slate-600">{row.label}</span>
                        <span className="text-lg font-semibold text-slate-950">{row.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome Quality</CardTitle>
            <CardDescription>
              Operator judgement about whether posted outputs felt strong, reusable, or disappointing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Outcomes recorded"
                value={String(insights.outcomes.recordedCount)}
                detail="Posted items with a saved qualitative outcome judgement."
              />
              {insights.outcomes.qualityRows.map((row) => (
                <MetricCard
                  key={row.quality}
                  label={row.label}
                  value={String(row.count)}
                  detail={`Posts marked ${row.label.toLowerCase()}.`}
                />
              ))}
            </div>

            <div className="space-y-3">
              {insights.outcomes.platformRows.map((row) => (
                <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.strongCount} strong</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {row.acceptableCount} acceptable; {row.weakCount} weak.
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Strategic Outcomes</CardTitle>
            <CardDescription>
              Manual business-facing outcomes tied back to platform, framing, mode, source, asset posture, and campaign context.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Recorded"
                value={String(insights.strategicOutcomes.recordedCount)}
                detail="Posted items with saved strategic outcome data."
              />
              <MetricCard
                label="Top high-value platform"
                value={insights.strategicOutcomes.topHighValuePlatformLabel ?? "None yet"}
                detail="Platform with the strongest high-value strategic outcomes."
              />
              <MetricCard
                label="Top lead platform"
                value={insights.strategicOutcomes.topLeadPlatformLabel ?? "None yet"}
                detail="Platform currently driving the most leads or signups."
              />
              <MetricCard
                label="Top mode"
                value={insights.strategicOutcomes.topModeLabel ?? "None yet"}
                detail="Editorial mode most often linked to high strategic value."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {insights.strategicOutcomes.valueRows.map((row) => (
                <div key={row.value} className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{row.count}</p>
                  <p className="mt-1 text-sm text-slate-500">Strategic value marked {row.label.toLowerCase()}.</p>
                </div>
              ))}
            </div>

            {insights.strategicOutcomes.summaries.length > 0 ? (
              <div className="space-y-3">
                {insights.strategicOutcomes.summaries.map((summary) => (
                  <div key={summary} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                    {summary}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">By platform</p>
                <div className="mt-3 space-y-3">
                  {insights.strategicOutcomes.platformRows.length === 0 ? (
                    <EmptyState copy="No strategic outcomes are available yet." />
                  ) : (
                    insights.strategicOutcomes.platformRows.map((row) => (
                      <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.total}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {row.highCount} high-value · {row.clickTotal} clicks · {row.leadTotal} leads or conversions
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Modes and patterns</p>
                <div className="mt-3 space-y-3">
                  {insights.strategicOutcomes.editorialModeRows.slice(0, 3).map((row) => (
                    <div key={`mode-${row.label}`} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{row.label}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        {row.highCount} high-value · {row.clickTotal} clicks · {row.leadTotal} leads
                      </p>
                    </div>
                  ))}
                  {insights.strategicOutcomes.patternRows.slice(0, 2).map((row) => (
                    <div key={`pattern-${row.label}`} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{row.label}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        Pattern-linked outcomes: {row.highCount} high-value · {row.leadTotal} leads
                      </p>
                    </div>
                  ))}
                  {insights.strategicOutcomes.editorialModeRows.length === 0 && insights.strategicOutcomes.patternRows.length === 0 ? (
                    <EmptyState copy="No stable mode or pattern outcome signals are available yet." />
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Source, asset, and strategy</p>
                <div className="mt-3 space-y-3">
                  {[
                    insights.strategicOutcomes.sourceKindRows[0]
                      ? `Source kind: ${insights.strategicOutcomes.sourceKindRows[0].label} · ${insights.strategicOutcomes.sourceKindRows[0].highCount} high-value`
                      : null,
                    insights.strategicOutcomes.assetRows[0]
                      ? `Asset type: ${insights.strategicOutcomes.assetRows[0].label} · ${insights.strategicOutcomes.assetRows[0].highCount} high-value`
                      : null,
                    insights.strategicOutcomes.funnelRows[0]
                      ? `Funnel: ${insights.strategicOutcomes.funnelRows[0].label} · ${insights.strategicOutcomes.funnelRows[0].leadTotal} leads`
                      : null,
                    insights.strategicOutcomes.campaignRows[0]
                      ? `Campaign: ${insights.strategicOutcomes.campaignRows[0].label} · ${insights.strategicOutcomes.campaignRows[0].highCount} high-value`
                      : null,
                    insights.strategicOutcomes.bundleRows[0]
                      ? `Bundle: ${insights.strategicOutcomes.bundleRows[0].label} · ${insights.strategicOutcomes.bundleRows[0].highCount} high-value`
                      : null,
                  ]
                    .filter(Boolean)
                    .map((line) => (
                      <div key={line} className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                        {line}
                      </div>
                    ))}
                  {insights.strategicOutcomes.sourceKindRows.length === 0 &&
                  insights.strategicOutcomes.assetRows.length === 0 &&
                  insights.strategicOutcomes.funnelRows.length === 0 &&
                  insights.strategicOutcomes.campaignRows.length === 0 &&
                  insights.strategicOutcomes.bundleRows.length === 0 ? (
                    <EmptyState copy="No source, asset, bundle, or campaign-level strategic pattern is stable enough to surface yet." />
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome Quality Notes</CardTitle>
            <CardDescription>
              This layer is qualitative only. It records operator judgement after posting rather than platform metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topStrongPlatformLabel
                ? `${insights.outcomes.topStrongPlatformLabel} is currently the platform most often marked strong after posting.`
                : "No platform has enough strong outcome judgements to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topReuseModeLabel
                ? `${insights.outcomes.topReuseModeLabel} is the editorial mode most often marked as worth reusing.`
                : "No editorial mode has enough reuse recommendations to surface yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topStrongPatternName
                ? `${insights.outcomes.topStrongPatternName} is currently the pattern most often associated with strong posted outcomes.`
                : "No saved pattern is linked to strong posted outcomes often enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topStrongSourceKindLabel
                ? `${insights.outcomes.topStrongSourceKindLabel} is the source family most often tied to strong outcomes right now.`
                : "No source family stands out strongly in outcome quality yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.outcomes.topDoNotRepeatModeLabel
                ? `${insights.outcomes.topDoNotRepeatModeLabel} is the mode most often marked do not repeat in this window.`
                : "No editorial mode is collecting enough do-not-repeat judgments to surface yet."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Reuse Memory</CardTitle>
            <CardDescription>
              Prior judged outcomes that now act as bounded editorial memory for reuse and caution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Judged cases"
                value={String(insights.reuseMemory.totalCases)}
                detail="Posted items with qualitative outcomes available for reuse memory."
              />
              <MetricCard
                label="Reusable"
                value={String(insights.reuseMemory.reusableCount)}
                detail="Cases marked strong or worth reusing."
              />
              <MetricCard
                label="Caution"
                value={String(insights.reuseMemory.cautionCount)}
                detail="Cases marked weak or do not repeat."
              />
              <MetricCard
                label="Top reusable combo"
                value={insights.reuseMemory.topReusableCombinationLabel ?? "None yet"}
                detail="Most common reusable combination in current judged history."
              />
            </div>

            <div className="space-y-3">
              {insights.reuseMemory.platformRows.map((row) => (
                <div key={row.platform} className="rounded-2xl bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{row.label}</p>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.reusableCount} reusable</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{row.cautionCount} cautionary outcomes.</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reuse Memory Notes</CardTitle>
            <CardDescription>
              This layer is advisory only. It helps the operator remember what worked before without auto-reusing anything.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.reuseMemory.topReusableCombinationLabel
                ? `${insights.reuseMemory.topReusableCombinationLabel} is currently the strongest reusable combination in judged history.`
                : "No reusable combination is stable enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.reuseMemory.topDoNotRepeatCombinationLabel
                ? `${insights.reuseMemory.topDoNotRepeatCombinationLabel} is the combination most often marked do not repeat.`
                : "No combination is collecting enough do-not-repeat memory to surface yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.reuseMemory.strongestPlatformLabel
                ? `${insights.reuseMemory.strongestPlatformLabel} is currently the platform where reuse memory is strongest.`
                : "No platform has enough positive reuse-memory history to stand out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.reuseMemory.weakestPlatformLabel
                ? `${insights.reuseMemory.weakestPlatformLabel} is currently the platform with the most cautionary reuse memory.`
                : "No platform has enough cautionary reuse-memory history to surface yet."}
            </div>
            {insights.reuseMemory.reusableRows.length > 0 ? (
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
                <p className="font-medium text-slate-900">Top reusable combinations</p>
                <div className="mt-3 space-y-2">
                  {insights.reuseMemory.reusableRows.map((row) => (
                    <p key={row.label}>{row.label}: {row.count}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pattern Coverage</CardTitle>
            <CardDescription>
              Where the current pattern library covers incoming signals well, only partially, or not at all.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Covered"
                value={formatPercent(insights.patternCoverage.coveredRate)}
                detail={`${insights.patternCoverage.coveredCount} records with a strong existing pattern match.`}
              />
              <MetricCard
                label="Partially covered"
                value={formatPercent(insights.patternCoverage.partiallyCoveredRate)}
                detail={`${insights.patternCoverage.partiallyCoveredCount} records with only indirect or weak coverage.`}
              />
              <MetricCard
                label="Uncovered"
                value={formatPercent(insights.patternCoverage.uncoveredRate)}
                detail={`${insights.patternCoverage.uncoveredCount} records with no meaningful existing pattern coverage.`}
              />
              <MetricCard
                label="Gap candidates"
                value={String(insights.patternCoverage.gapCandidateCount)}
                detail={`${insights.patternCoverage.uncoveredGapCandidateCount} uncovered and ${insights.patternCoverage.recurringPartialGapCount} recurring partial gaps.`}
              />
            </div>

            {insights.patternCoverage.topGapTypes.length === 0 ? (
              <EmptyState copy="No stable coverage gaps are visible in this window yet." />
            ) : (
              <div className="space-y-3">
                {insights.patternCoverage.topGapTypes.map((gap) => (
                  <div key={gap.label} className="rounded-2xl bg-white/80 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">{gap.label}</p>
                      <Badge className="bg-amber-50 text-amber-700 ring-amber-200">{gap.count} signals</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{gap.description}</p>
                    <p className="mt-3 text-sm text-slate-700">{gap.suggestedAction}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coverage Gap Notes</CardTitle>
            <CardDescription>
              Small operator-facing guidance about where the library looks thin enough to justify a new reusable pattern.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternCoverage.topGapTypes[0]
                ? `${insights.patternCoverage.topGapTypes[0].label} is the strongest current gap type. Consider creating one reusable pattern before broadening the library further.`
                : "No recurring coverage gap is strong enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternCoverage.uncoveredCount > 0
                ? `${insights.patternCoverage.uncoveredCount} records in this window have no meaningful pattern support at all.`
                : "Every record in this window has at least some pattern support."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternCoverage.recurringPartialGapCount > 0
                ? `${insights.patternCoverage.recurringPartialGapCount} records are only partially covered in recurring situations, which usually signals a missing middle-ground pattern.`
                : "No recurring partial-coverage gap is currently stable enough to surface."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pattern Discovery</CardTitle>
            <CardDescription>
              Lightweight candidate tracking for records that may be worth saving as reusable patterns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Candidate-worthy"
                value={String(insights.patternDiscovery.candidateCount)}
                detail="Records currently surfacing as yes or maybe pattern candidates."
              />
              <MetricCard
                label="Strong candidates"
                value={String(insights.patternDiscovery.strongCandidateCount)}
                detail="Higher-confidence candidates worth reviewing first."
              />
              <MetricCard
                label="Saved as patterns"
                value={String(insights.patternDiscovery.savedCount)}
                detail="Candidate-worthy records already represented in the pattern library."
              />
              <MetricCard
                label="Still unsaved"
                value={String(insights.patternDiscovery.unsavedCount)}
                detail={
                  insights.patternDiscovery.topShapeLabel
                    ? `${insights.patternDiscovery.topShapeLabel} is the most common candidate shape.`
                    : "No stable candidate shape yet."
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Suggestion interactions"
                value={String(insights.patternSuggestions.interactionCount)}
                detail="Explicit uses of a suggested pattern action recorded in the audit trail."
              />
              <MetricCard
                label="Suggested applies"
                value={String(insights.patternSuggestions.appliedCount)}
                detail="Generation runs where the applied pattern came from a recorded suggestion."
              />
              <MetricCard
                label="Top suggested pattern"
                value={insights.patternSuggestions.topPatterns[0]?.name ?? "None yet"}
                detail={
                  insights.patternSuggestions.topPatterns[0]
                    ? `${insights.patternSuggestions.topPatterns[0]?.count} suggestion interactions in this window.`
                    : "No explicit suggestion interactions yet."
                }
              />
            </div>

            {insights.patternDiscovery.recentCandidates.length === 0 ? (
              <EmptyState copy="No unsaved pattern candidates are stable enough to surface in this window yet." />
            ) : (
              <div className="space-y-3">
                {insights.patternDiscovery.recentCandidates.map((candidate) => (
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

        <Card>
          <CardHeader>
            <CardTitle>Pattern Discovery Notes</CardTitle>
            <CardDescription>
              Compact observations about how candidate-worthy records are currently taking shape.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternDiscovery.topShapeLabel
                ? `${insights.patternDiscovery.topShapeLabel} is the most common pattern candidate shape in this window.`
                : "No recurring pattern candidate shape is stable enough to call out yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternDiscovery.savedCount > 0
                ? `${insights.patternDiscovery.savedCount} candidate-worthy records have already made it into the pattern library.`
                : "No candidate-worthy records in this window have been saved as patterns yet."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternDiscovery.unsavedCount > 0
                ? `${insights.patternDiscovery.unsavedCount} candidate-worthy records still need an operator decision before they become reusable patterns.`
                : "There is no current backlog of unsaved pattern candidates in this window."}
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
              {insights.patternSuggestions.topPatterns[0]
                ? `${insights.patternSuggestions.topPatterns[0].name} is the most frequently used pattern suggestion in this window.`
                : "No explicit pattern suggestion interactions have been recorded in this window yet."}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
