import Link from "next/link";

import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import type { AutoAdvanceAssessment } from "@/lib/auto-advance";
import { buildAssetBundleSummary, buildSignalAssetBundle, getAssetPrimaryImage, getAssetPrimaryVideo } from "@/lib/assets";
import type { CampaignCadenceSummary, CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import { getEditorialConfidenceLabel } from "@/lib/editorial-confidence";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { UnifiedGuidance } from "@/lib/guidance";
import { buildRepurposingBundleSummary, buildSignalRepurposingBundle } from "@/lib/repurposing";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SignalRecord } from "@/types/signal";

function confidenceClasses(level: UnifiedGuidance["confidence"]["confidenceLevel"]) {
  if (level === "high") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (level === "low") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function stageLabel(stage: AutoAdvanceAssessment["stage"]): string {
  switch (stage) {
    case "auto_interpret":
      return "Held before interpretation";
    case "auto_generate":
      return "Held before generation";
    case "auto_prepare_for_review":
      return "Held before approval queue";
    default:
      return "Held";
  }
}

function HoldCard({
  signal,
  guidance,
  assessment,
  strategy,
}: {
  signal: SignalRecord;
  guidance: UnifiedGuidance;
  assessment: AutoAdvanceAssessment;
  strategy: CampaignStrategy;
}) {
  const context = getSignalContentContextSummary(signal, strategy);

  return (
    <div className="rounded-2xl bg-white/80 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
              {stageLabel(assessment.stage)}
            </span>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${confidenceClasses(guidance.confidence.confidenceLevel)}`}>
              {getEditorialConfidenceLabel(guidance.confidence.confidenceLevel)} confidence
            </span>
          </div>
          <div>
            <Link href={`/signals/${signal.recordId}`} className="text-lg font-semibold text-slate-950 hover:text-[color:var(--accent)]">
              {signal.sourceTitle}
            </Link>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{assessment.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-slate-500">
            {assessment.reasons.map((reason) => (
              <span key={reason} className="rounded-full bg-slate-100 px-3 py-1">
                {reason}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/signals/${signal.recordId}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open record
            </Link>
            <Link
              href={
                assessment.stage === "auto_interpret"
                  ? `/signals/${signal.recordId}/interpret`
                  : assessment.stage === "auto_generate"
                    ? `/signals/${signal.recordId}/generate`
                    : `/signals/${signal.recordId}/review`
              }
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Open next step
            </Link>
          </div>
        </div>
        <div className="min-w-64 rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600">
          <p>{signal.platformPriority ?? "Platform not set"}</p>
          <p className="mt-2">{signal.editorialMode ? getEditorialModeDefinition(signal.editorialMode).label : "Editorial mode not set"}</p>
          <p className="mt-2">{context.pillarName ?? "Pillar not set"}</p>
          <p className="mt-2">{context.funnelStage ?? "Funnel not set"}</p>
          <p className="mt-2">{assessment.strongestCaution ?? guidance.cautionNotes[0] ?? "No additional caution surfaced"}</p>
        </div>
      </div>
    </div>
  );
}

export function ApprovalQueueSection({
  candidates,
  strategy,
  cadence,
}: {
  candidates: ApprovalQueueCandidate[];
  strategy: CampaignStrategy;
  cadence: CampaignCadenceSummary;
}) {
  return (
    <div id="approval-ready">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <span>Approval-Ready Queue</span>
            <span className="text-sm font-medium text-slate-500">{candidates.length}</span>
          </CardTitle>
          <CardDescription>
            Near-finished candidates prepared by the autonomous runner. These are the items that should feel closest to copy, light edit, and manual posting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {candidates.length === 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">
              No approval-ready candidates surfaced yet. Run the autonomous queue or review the held cases below.
            </div>
          ) : (
            candidates.map((candidate, index) => {
              const context = getSignalContentContextSummary(candidate.signal, strategy);
              const assetBundle = buildSignalAssetBundle(candidate.signal);
              const assetSummary = buildAssetBundleSummary(assetBundle);
              const primaryImage = getAssetPrimaryImage(assetBundle, candidate.signal.selectedImageAssetId);
              const primaryVideo = getAssetPrimaryVideo(assetBundle, candidate.signal.selectedVideoConceptId);
              const repurposingBundle = buildSignalRepurposingBundle(candidate.signal);
              const repurposingSummary = buildRepurposingBundleSummary(repurposingBundle);

              return (
                <div key={candidate.signal.recordId} className="rounded-2xl bg-white/80 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">#{index + 1}</span>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${confidenceClasses(candidate.guidance.confidence.confidenceLevel)}`}>
                        {getEditorialConfidenceLabel(candidate.guidance.confidence.confidenceLevel)} confidence
                      </span>
                      {candidate.assessment.draftQuality ? (
                        <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                          Draft quality {candidate.assessment.draftQuality.label}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <Link href={`/signals/${candidate.signal.recordId}`} className="text-lg font-semibold text-slate-950 hover:text-[color:var(--accent)]">
                        {candidate.signal.sourceTitle}
                      </Link>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{candidate.assessment.summary}</p>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <p><span className="font-medium text-slate-900">Recommendation:</span> {candidate.guidance.primaryAction}</p>
                      <p><span className="font-medium text-slate-900">Scenario Angle:</span> {candidate.signal.scenarioAngle ?? "Not set"}</p>
                      <p><span className="font-medium text-slate-900">Source context:</span> {candidate.signal.sourcePublisher ?? candidate.signal.sourceType ?? "Not set"}</p>
                      <p><span className="font-medium text-slate-900">Suggested platform:</span> {candidate.assessment.suggestedPlatformPriority ?? candidate.signal.platformPriority ?? "Not set"}</p>
                      <p><span className="font-medium text-slate-900">Campaign:</span> {context.campaignName ?? "Not set"}</p>
                      <p><span className="font-medium text-slate-900">Pillar:</span> {context.pillarName ?? "Not set"}</p>
                      <p><span className="font-medium text-slate-900">Audience:</span> {context.audienceSegmentName ?? "Not set"}</p>
                      <p><span className="font-medium text-slate-900">Funnel / CTA:</span> {context.funnelStage ?? "Not set"} · {context.ctaGoal ?? "Not set"}</p>
                      <p><span className="font-medium text-slate-900">Primary asset:</span> {assetSummary?.primaryLabel ?? "Not set"}</p>
                      <p><span className="font-medium text-slate-900">Asset concepts:</span> {assetSummary?.summary ?? "Not generated yet"}</p>
                      <p><span className="font-medium text-slate-900">Repurposing:</span> {repurposingSummary ? `${repurposingSummary.count} variants` : "Not generated yet"}</p>
                      <p><span className="font-medium text-slate-900">Repurposing primary:</span> {repurposingSummary?.primaryPlatformLabel ?? "Not set"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm text-slate-500">
                      {candidate.rankReasons.map((reason) => (
                        <span key={reason} className="rounded-full bg-slate-100 px-3 py-1">
                          {reason}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/signals/${candidate.signal.recordId}/review`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        Open final review
                      </Link>
                      <Link href={`/signals/${candidate.signal.recordId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        Open record
                      </Link>
                    </div>
                  </div>
                  <div className="min-w-72 space-y-3 rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600">
                    <div>
                      <p className="font-medium text-slate-900">Why it ranked high</p>
                      <p className="mt-2">{candidate.rankReasons.join(" · ") || "Strong support surfaced."}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Strategy balance</p>
                      <p className="mt-2">
                        {context.pillarName && cadence.underrepresentedPillars.includes(context.pillarName)
                          ? `${context.pillarName} is currently underrepresented in recent output.`
                          : context.funnelStage && cadence.underrepresentedFunnels.includes(context.funnelStage)
                            ? `${context.funnelStage} content is currently thin in the recent mix.`
                            : "This item fits the current strategy mix without creating a strong repetition signal."}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Playbook / pattern support</p>
                      <p className="mt-2">
                        {candidate.guidance.relatedPlaybookCards[0]?.title ?? candidate.guidance.relatedPatterns[0]?.title ?? "No direct playbook or pattern surfaced"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Strongest caution</p>
                      <p className="mt-2">{candidate.assessment.strongestCaution ?? candidate.guidance.cautionNotes[0] ?? "No major caution surfaced"}</p>
                    </div>
                    {candidate.assessment.assetSuggestion ? (
                      <div>
                        <p className="font-medium text-slate-900">{candidate.assessment.assetSuggestion.label}</p>
                        <p className="mt-2">{candidate.assessment.assetSuggestion.summary}</p>
                      </div>
                    ) : null}
                    {assetBundle ? (
                      <div>
                        <p className="font-medium text-slate-900">Asset bundle</p>
                        <p className="mt-2">{assetSummary?.summary}</p>
                        <p className="mt-2 text-slate-500">
                          Image: {primaryImage?.conceptTitle ?? "None"} · Video: {primaryVideo?.conceptTitle ?? "None"}
                        </p>
                        <p className="mt-2 text-slate-500">
                          Image concepts: {assetBundle.imageAssets.slice(0, 2).map((asset) => asset.conceptTitle).join(" · ") || "None"}
                        </p>
                        <p className="mt-2 text-slate-500">
                          Video concepts: {assetBundle.videoConcepts.slice(0, 2).map((concept) => concept.conceptTitle).join(" · ") || "None"}
                        </p>
                      </div>
                    ) : null}
                    {repurposingBundle ? (
                      <div>
                        <p className="font-medium text-slate-900">Repurposing bundle</p>
                        <p className="mt-2">
                          Repurposed into {repurposingSummary?.count ?? repurposingBundle.outputs.length} variants.
                        </p>
                        <p className="mt-2 text-slate-500">
                          Preview: {repurposingSummary?.previewLabels.join(" · ") || "No preview labels"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AutoHeldSection({
  items,
  strategy,
}: {
  items: Array<{
    signal: SignalRecord;
    guidance: UnifiedGuidance;
    assessment: AutoAdvanceAssessment;
  }>;
  strategy: CampaignStrategy;
}) {
  return (
    <div id="auto-held">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <span>Auto-Held Cases</span>
            <span className="text-sm font-medium text-slate-500">{items.length}</span>
          </CardTitle>
          <CardDescription>
            Cases the autonomous layer deliberately kept out of the approval-ready queue because support, framing, or draft quality still looks too thin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">
              No active auto-held cases surfaced in the current queue.
            </div>
          ) : (
            items.map((item) => (
              <HoldCard
                key={item.signal.recordId}
                signal={item.signal}
                guidance={item.guidance}
                assessment={item.assessment}
                strategy={strategy}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
