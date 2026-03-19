import Link from "next/link";

import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { PatternSuggestionList } from "@/components/patterns/pattern-suggestion-list";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CopilotGuidance } from "@/lib/copilot";
import type { SignalPattern } from "@/lib/pattern-definitions";

function toneClasses(tone: CopilotGuidance["tone"]) {
  switch (tone) {
    case "success":
      return "bg-emerald-50 text-emerald-700";
    case "warning":
      return "bg-amber-50 text-amber-700";
    case "neutral":
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function feedbackToneClasses(tone: "success" | "warning" | "neutral") {
  switch (tone) {
    case "success":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "warning":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "neutral":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

export function CopilotGuidanceCard({
  signalId,
  guidance,
  suggestedPatterns,
}: {
  signalId: string;
  guidance: CopilotGuidance;
  suggestedPatterns: SignalPattern[];
}) {
  const suggestionMap = new Map(suggestedPatterns.map((pattern) => [pattern.id, pattern]));
  const hydratedSuggestions = guidance.patternSuggestions
    .map((suggestion) => {
      const pattern = suggestionMap.get(suggestion.pattern.id);
      if (!pattern) {
        return null;
      }

      return {
        pattern,
        score: suggestion.score,
        reason: suggestion.reason,
        effectivenessHint: suggestion.effectivenessHint,
        matchedOn: [],
        bundleSummaries: suggestion.bundles,
      };
    })
    .filter((suggestion): suggestion is NonNullable<typeof suggestion> => suggestion !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Co-Pilot Guidance</CardTitle>
        <CardDescription>Compact operator guidance for what to do next with this record.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`inline-flex rounded-2xl px-3 py-2 text-sm font-medium ${toneClasses(guidance.tone)}`}>
          {guidance.nextAction}
        </div>
        <p className="text-sm leading-6 text-slate-600">{guidance.reason}</p>
        {guidance.blockers.length > 0 ? (
          <div className="rounded-2xl bg-white/75 px-4 py-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Blockers</p>
            <div className="mt-2 space-y-2">
              {guidance.blockers.map((blocker) => (
                <p key={blocker}>{blocker}</p>
              ))}
            </div>
          </div>
        ) : null}
        {guidance.feedbackContext.length > 0 ? (
          <div className="rounded-2xl bg-white/75 px-4 py-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">What we&apos;ve seen before</p>
            <div className="mt-3 space-y-3">
              {guidance.feedbackContext.map((item) => (
                <div key={item.text} className="flex gap-3">
                  <span className={`inline-flex h-fit rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${feedbackToneClasses(item.tone)}`}>
                    past feedback
                  </span>
                  <p className="leading-6">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {guidance.suggestedEditorialMode ? (
          <div className="rounded-2xl bg-white/75 px-4 py-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Suggested editorial mode</p>
            <p className="mt-2 leading-6">
              {getEditorialModeDefinition(guidance.suggestedEditorialMode.mode).label}
            </p>
            <p className="mt-2 leading-6 text-slate-500">{guidance.suggestedEditorialMode.reason}</p>
            <Link
              href={`/signals/${signalId}/generate?mode=${guidance.suggestedEditorialMode.mode}`}
              className="mt-3 inline-block text-[color:var(--accent)] underline underline-offset-4"
            >
              Use in generation
            </Link>
          </div>
        ) : null}
        <PatternSuggestionList
          signalId={signalId}
          title="Related patterns"
          description="Saved patterns that may help with framing or generation for this signal."
          suggestions={hydratedSuggestions}
          emptyCopy="No relevant saved patterns surfaced for this record."
          location="copilot"
          applyHrefBuilder={(patternId) => `/signals/${signalId}/generate?pattern=${patternId}&suggested=1`}
        />
        <div className="flex flex-wrap gap-2">
          {guidance.actionHref ? (
            <Link href={guidance.actionHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open recommended step
            </Link>
          ) : null}
          <Link href="/review" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Open review queue
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function CopilotHint({
  guidance,
}: {
  guidance: CopilotGuidance;
}) {
  return (
    <div className="space-y-1">
      <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses(guidance.tone)}`}>
        {guidance.shortLabel}
      </div>
      <p className="max-w-md text-xs leading-5 text-slate-500">{guidance.reason}</p>
      {guidance.feedbackContext[0] ? (
        <p className="max-w-md text-xs leading-5 text-slate-400">{guidance.feedbackContext[0].text}</p>
      ) : null}
      {guidance.patternSuggestions[0] ? (
        <p className="max-w-md text-xs leading-5 text-slate-400">
          Suggested pattern: {guidance.patternSuggestions[0].pattern.name}. {guidance.patternSuggestions[0].reason}
        </p>
      ) : null}
      {guidance.patternSuggestions[0]?.bundles[0] ? (
        <p className="max-w-md text-xs leading-5 text-slate-400">
          Related bundle: {guidance.patternSuggestions[0].bundles[0].name}.
        </p>
      ) : null}
      {guidance.suggestedEditorialMode ? (
        <p className="max-w-md text-xs leading-5 text-slate-400">
          Suggested mode: {getEditorialModeDefinition(guidance.suggestedEditorialMode.mode).label}. {guidance.suggestedEditorialMode.reason}
        </p>
      ) : null}
      {guidance.patternSuggestions[0]?.effectivenessHint ? (
        <p className="max-w-md text-xs leading-5 text-slate-400">{guidance.patternSuggestions[0].effectivenessHint}</p>
      ) : null}
    </div>
  );
}
