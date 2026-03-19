"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PatternMatchSuggestion } from "@/lib/pattern-match";
import { PATTERN_TYPE_LABELS } from "@/lib/pattern-definitions";

async function recordSuggestionInteraction(input: {
  signalId: string;
  patternId: string;
  patternName: string;
  location: string;
  action: "apply_in_generation" | "use_angle";
}) {
  try {
    await fetch(`/api/signals/${input.signalId}/pattern-suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  } catch {
    // Audit should not block operator navigation or local edits.
  }
}

export function PatternSuggestionList({
  signalId,
  title,
  description,
  suggestions,
  emptyCopy,
  location,
  applyHrefBuilder,
  onApplyPattern,
  onUseScenario,
}: {
  signalId: string;
  title: string;
  description: string;
  suggestions: PatternMatchSuggestion[];
  emptyCopy: string;
  location: "copilot" | "interpretation" | "generation";
  applyHrefBuilder?: (patternId: string) => string;
  onApplyPattern?: (patternId: string) => void;
  onUseScenario?: (patternId: string) => void;
}) {
  const router = useRouter();

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {suggestions.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">{emptyCopy}</div>
        ) : (
          suggestions.map((suggestion) => (
            <div key={suggestion.pattern.id} className="rounded-2xl bg-white/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-950">{suggestion.pattern.name}</p>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  {PATTERN_TYPE_LABELS[suggestion.pattern.patternType]}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{suggestion.reason}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{suggestion.pattern.description}</p>
              {suggestion.bundleSummaries.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestion.bundleSummaries.map((bundle) => (
                    <Badge key={bundle.id} className="bg-sky-50 text-sky-700 ring-sky-200">
                      {bundle.name}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {suggestion.effectivenessHint ? (
                <p className="mt-2 text-sm leading-6 text-slate-500">{suggestion.effectivenessHint}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link href={`/patterns/${suggestion.pattern.id}`} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                  View pattern
                </Link>
                {(applyHrefBuilder || onApplyPattern) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await recordSuggestionInteraction({
                        signalId,
                        patternId: suggestion.pattern.id,
                        patternName: suggestion.pattern.name,
                        location,
                        action: "apply_in_generation",
                      });

                      if (onApplyPattern) {
                        onApplyPattern(suggestion.pattern.id);
                        return;
                      }

                      if (applyHrefBuilder) {
                        router.push(applyHrefBuilder(suggestion.pattern.id));
                      }
                    }}
                  >
                    Apply pattern in generation
                  </Button>
                ) : null}
                {onUseScenario && suggestion.pattern.exampleScenarioAngle ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await recordSuggestionInteraction({
                        signalId,
                        patternId: suggestion.pattern.id,
                        patternName: suggestion.pattern.name,
                        location,
                        action: "use_angle",
                      });
                      onUseScenario(suggestion.pattern.id);
                    }}
                  >
                    Use angle
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
