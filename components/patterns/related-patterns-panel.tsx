"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PATTERN_TYPE_LABELS, type SignalPattern } from "@/lib/pattern-definitions";

export function RelatedPatternsPanel({
  title,
  description,
  emptyCopy,
  patterns,
  allowScenarioUse = false,
  onUseScenario,
}: {
  title: string;
  description: string;
  emptyCopy: string;
  patterns: SignalPattern[];
  allowScenarioUse?: boolean;
  onUseScenario?: (pattern: SignalPattern) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {patterns.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">{emptyCopy}</div>
        ) : (
          patterns.map((pattern) => (
            <div key={pattern.id} className="rounded-2xl bg-white/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-950">{pattern.name}</p>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  {PATTERN_TYPE_LABELS[pattern.patternType]}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{pattern.description}</p>
              {pattern.exampleScenarioAngle ? (
                <div className="mt-3 rounded-2xl bg-slate-50/90 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Example Scenario Angle</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{pattern.exampleScenarioAngle}</p>
                </div>
              ) : null}
              {pattern.exampleOutput ? (
                <div className="mt-3 rounded-2xl bg-slate-50/90 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Example output</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{pattern.exampleOutput}</p>
                </div>
              ) : null}
              {pattern.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {pattern.tags.map((tag) => (
                    <Badge key={tag} className="bg-white text-slate-600 ring-slate-200">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link href={`/patterns/${pattern.id}`} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                  View pattern
                </Link>
                {allowScenarioUse && onUseScenario && pattern.exampleScenarioAngle ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => onUseScenario(pattern)}>
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
