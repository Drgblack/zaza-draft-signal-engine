import Link from "next/link";
import { notFound } from "next/navigation";

import { FeedbackPanel } from "@/components/signals/feedback-panel";
import { GuidancePanel } from "@/components/signals/guidance-panel";
import { InterpretationWorkbench } from "@/components/signals/interpretation-workbench";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSignalWithFallback, listSignalsWithFallback } from "@/lib/airtable";
import { listAuditEvents } from "@/lib/audit";
import { getFeedbackEntries, listFeedbackEntries } from "@/lib/feedback";
import { assembleGuidanceForSignal } from "@/lib/guidance";
import { buildInitialInterpretationFromSignal } from "@/lib/interpreter";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { findSuggestedPatterns } from "@/lib/pattern-match";
import { listPatternFeedbackEntries } from "@/lib/pattern-feedback";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import {
  buildPatternEffectivenessSummaries,
  findRelatedPatterns,
  indexPatternEffectivenessSummaries,
  listPatterns,
} from "@/lib/patterns";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { getOperatorTuning } from "@/lib/tuning";

export const dynamic = "force-dynamic";

export default async function InterpretSignalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getSignalWithFallback(id);

  if (!result.signal) {
    notFound();
  }

  const initialInterpretation = buildInitialInterpretationFromSignal(result.signal);
  const feedbackEntries = await getFeedbackEntries(result.signal.recordId);
  const allSignalFeedbackEntries = await listFeedbackEntries();
  const { signals: allSignals } = await listSignalsWithFallback({ limit: 1000 });
  const patterns = await listPatterns();
  const playbookCards = await listPlaybookCards();
  const bundles = await listPatternBundles();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const allAuditEvents = await listAuditEvents();
  const allPatternFeedbackEntries = await listPatternFeedbackEntries();
  const tuning = await getOperatorTuning();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const patternEffectivenessById = indexPatternEffectivenessSummaries(
    buildPatternEffectivenessSummaries(patterns, allAuditEvents, allPatternFeedbackEntries, allSignalFeedbackEntries),
  );
  const relatedPatterns = findRelatedPatterns(result.signal, patterns, { limit: 3 });
  const suggestedPatterns = findSuggestedPatterns(result.signal, patterns, {
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
  const guidance = assembleGuidanceForSignal({
    signal: result.signal,
    context: "interpretation",
    allSignals,
    feedbackEntries: allSignalFeedbackEntries,
    patterns,
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
          <CardTitle className="text-3xl">Interpret Signal</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            This is the V1 editorial judgement layer: classify the signal, surface the professional risk, and choose the right hook and packaging direction before moving into draft generation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-sm text-slate-600">
          <p className="max-w-3xl leading-6">
            For indirect news or policy signals, add a scenario angle to help the interpretation layer translate the source into a usable teacher communication situation.
          </p>
          <p className="max-w-3xl leading-6">
            A good angle describes what the teacher needs to say, document, explain, or respond to. If the source is indirect, you can use the bounded suggestion assist and then refine the wording manually.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/signals/${result.signal.recordId}`} className="text-[color:var(--accent)] underline underline-offset-4">
              Back to record
            </Link>
            <Link href="/signals" className="text-[color:var(--accent)] underline underline-offset-4">
              Back to signals
            </Link>
          </div>
        </CardContent>
      </Card>

      <GuidancePanel
        guidance={guidance}
        variant="compact"
        title="Interpretation guidance"
        description="Compact framing guidance pulled from co-pilot, reuse memory, playbook support, and any meaningful coverage gap."
      />

      <InterpretationWorkbench
        signal={result.signal}
        initialInterpretation={initialInterpretation}
        source={result.source}
        relatedPatterns={relatedPatterns}
        suggestedPatterns={suggestedPatterns}
      />

      <FeedbackPanel
        signalId={result.signal.recordId}
        initialEntries={feedbackEntries}
        categories={["output"]}
        title="Interpretation Feedback"
        description="Quickly mark whether the interpretation output felt strong, weak, or still in need of revision."
      />
    </div>
  );
}
