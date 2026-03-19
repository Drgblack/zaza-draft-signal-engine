import Link from "next/link";
import { notFound } from "next/navigation";

import { FeedbackPanel } from "@/components/signals/feedback-panel";
import { GenerationWorkbench } from "@/components/signals/generation-workbench";
import { GuidancePanel } from "@/components/signals/guidance-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuditEvents, listAuditEvents } from "@/lib/audit";
import { getSignalWithFallback, listSignalsWithFallback } from "@/lib/airtable";
import { getCampaignStrategy } from "@/lib/campaigns";
import { suggestEditorialMode } from "@/lib/editorial-modes";
import { getFeedbackEntries, listFeedbackEntries } from "@/lib/feedback";
import { buildInitialGenerationFromSignal, toGenerationInputFromSignal } from "@/lib/generator";
import { assembleGuidanceForSignal } from "@/lib/guidance";
import { getBundlesForPattern, indexBundleSummariesByPatternId, listPatternBundles, type PatternBundleSummary } from "@/lib/pattern-bundles";
import { findSuggestedPatterns } from "@/lib/pattern-match";
import { listPatternFeedbackEntries } from "@/lib/pattern-feedback";
import { assessPatternCandidate } from "@/lib/pattern-discovery";
import type { PatternSummary } from "@/lib/pattern-definitions";
import {
  buildPatternEffectivenessSummaries,
  findRelatedPatterns,
  indexPatternEffectivenessSummaries,
  listPatterns,
  toPatternSummary,
} from "@/lib/patterns";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { getOperatorTuning } from "@/lib/tuning";
import { EDITORIAL_MODES, type EditorialMode } from "@/types/signal";

export const dynamic = "force-dynamic";

function getLastAppliedPatternSummary(
  auditEvents: Awaited<ReturnType<typeof getAuditEvents>>,
  allPatterns: Awaited<ReturnType<typeof listPatterns>>,
): PatternSummary | null {
  const latestApplied = [...auditEvents]
    .reverse()
    .find((event) => event.eventType === "PATTERN_APPLIED");

  if (!latestApplied) {
    return null;
  }

  const patternId = typeof latestApplied.metadata?.patternId === "string" ? latestApplied.metadata.patternId : null;
  if (patternId) {
    const matched = allPatterns.find((pattern) => pattern.id === patternId);
    if (matched) {
      return toPatternSummary(matched);
    }
  }

  const patternName = typeof latestApplied.metadata?.patternName === "string" ? latestApplied.metadata.patternName : null;
  if (!patternName) {
    return null;
  }

  return {
    id: patternId ?? latestApplied.id,
    name: patternName,
    description: "Previously applied on this signal.",
    patternType: "hybrid",
    lifecycleState: "active",
  };
}

export default async function GenerateSignalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const result = await getSignalWithFallback(id);

  if (!result.signal) {
    notFound();
  }

  const generationInput = toGenerationInputFromSignal(result.signal);
  const initialGeneration = buildInitialGenerationFromSignal(result.signal);
  const feedbackEntries = await getFeedbackEntries(result.signal.recordId);
  const allSignalFeedbackEntries = await listFeedbackEntries();
  const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
  const allPatterns = await listPatterns();
  const allBundles = await listPatternBundles();
  const playbookCards = await listPlaybookCards();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(allBundles);
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const strategy = await getCampaignStrategy();
  const relatedPatterns = findRelatedPatterns(result.signal, allPatterns, { limit: 3 });
  const auditEvents = await getAuditEvents(result.signal.recordId);
  const allAuditEvents = await listAuditEvents();
  const allPatternFeedbackEntries = await listPatternFeedbackEntries();
  const tuning = await getOperatorTuning();
  const patternEffectivenessById = indexPatternEffectivenessSummaries(
    buildPatternEffectivenessSummaries(allPatterns, allAuditEvents, allPatternFeedbackEntries, allSignalFeedbackEntries),
  );
  const lastAppliedPattern = getLastAppliedPatternSummary(auditEvents, allPatterns);
  const patternCandidate = assessPatternCandidate(result.signal, {
    feedbackEntries,
    patterns: allPatterns,
  });
  const suggestedPatterns = findSuggestedPatterns(result.signal, allPatterns, {
    limit: 3,
    bundleSummariesByPatternId,
    effectivenessById: patternEffectivenessById,
    tuning: tuning.settings,
  });
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: allSignals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: allSignals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const patternParam = Array.isArray(resolvedSearchParams.pattern)
    ? resolvedSearchParams.pattern[0]
    : resolvedSearchParams.pattern;
  const suggestedParam = Array.isArray(resolvedSearchParams.suggested)
    ? resolvedSearchParams.suggested[0]
    : resolvedSearchParams.suggested;
  const modeParam = Array.isArray(resolvedSearchParams.mode)
    ? resolvedSearchParams.mode[0]
    : resolvedSearchParams.mode;
  const suggestedEditorialMode = suggestEditorialMode(result.signal);
  const initialSelectedEditorialMode: EditorialMode =
    modeParam && EDITORIAL_MODES.includes(modeParam as EditorialMode)
      ? (modeParam as EditorialMode)
      : result.signal.editorialMode ?? suggestedEditorialMode.mode;
  const initialSuggestedPatternId =
    patternParam && suggestedParam === "1" && allPatterns.some((pattern) => pattern.id === patternParam)
      ? patternParam
      : null;
  const initialSelectedPatternBundles: PatternBundleSummary[] =
    patternParam && allPatterns.some((pattern) => pattern.id === patternParam)
      ? getBundlesForPattern(patternParam, allBundles).map((bundle) => ({
          id: bundle.id,
          name: bundle.name,
          description: bundle.description,
        }))
        : [];
  const guidance = assembleGuidanceForSignal({
    signal: result.signal,
    context: "generation",
    allSignals,
    feedbackEntries: allSignalFeedbackEntries,
    patterns: allPatterns,
    bundleSummariesByPatternId,
    patternEffectivenessById,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning: tuning.settings,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <Badge className={result.source === "airtable" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
              {result.source === "airtable" ? "Airtable" : "Mock mode"}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Generate Drafts</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Turn one interpreted signal into fixed-format draft assets for X, LinkedIn, Reddit, image direction, and short-form video. Drafts should follow the current scenario angle first, the saved interpretation second, and the source evidence third. Everything stays editable and human-reviewed.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/signals/${result.signal.recordId}`} className="text-[color:var(--accent)] underline underline-offset-4">
              Back to record
            </Link>
            <Link href="/signals" className="text-[color:var(--accent)] underline underline-offset-4">
              Back to signals
            </Link>
            <Link href={`/signals/${result.signal.recordId}/interpret`} className="text-[color:var(--accent)] underline underline-offset-4">
              Return to interpretation
            </Link>
          </div>
        </CardContent>
      </Card>

      <GuidancePanel
        guidance={guidance}
        variant="compact"
        title="Generation guidance"
        description="Compact next-step guidance that aligns reuse memory, playbook support, pattern support, and any meaningful gap warning."
      />

      <GenerationWorkbench
        signal={result.signal}
        generationInput={generationInput}
        initialGeneration={initialGeneration}
        source={result.source}
        relatedPatterns={relatedPatterns}
        availablePatterns={allPatterns}
        lastAppliedPattern={lastAppliedPattern}
        patternCandidate={patternCandidate}
        patternSuggestions={suggestedPatterns}
        initialSelectedPatternId={patternParam && allPatterns.some((pattern) => pattern.id === patternParam) ? patternParam : ""}
        initialSuggestedPatternId={initialSuggestedPatternId}
        initialSelectedEditorialMode={initialSelectedEditorialMode}
        suggestedEditorialMode={suggestedEditorialMode}
        bundleSummariesByPatternId={bundleSummariesByPatternId}
        initialSelectedPatternBundles={initialSelectedPatternBundles}
        campaigns={strategy.campaigns}
        pillars={strategy.pillars}
        audienceSegments={strategy.audienceSegments}
      />

      <FeedbackPanel
        signalId={result.signal.recordId}
        initialEntries={feedbackEntries}
        categories={["output"]}
        title="Output Feedback"
        description="Record explicit judgement about the interpretation or draft output quality without changing the workflow automatically."
      />
    </div>
  );
}
