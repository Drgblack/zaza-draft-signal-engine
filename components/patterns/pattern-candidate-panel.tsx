import Link from "next/link";

import type { PatternCandidateAssessment } from "@/lib/pattern-discovery";
import { PATTERN_TYPE_LABELS } from "@/lib/pattern-definitions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function toneClasses(assessment: PatternCandidateAssessment): string {
  if (assessment.alreadyCaptured) {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (assessment.flag === "yes") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (assessment.flag === "maybe") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function headline(assessment: PatternCandidateAssessment): string {
  if (assessment.alreadyCaptured) {
    return "Pattern candidate already captured";
  }

  if (assessment.flag === "yes") {
    return "Pattern candidate: This looks reusable.";
  }

  if (assessment.flag === "maybe") {
    return "Pattern candidate: Possibly reusable.";
  }

  return "Pattern candidate";
}

export function PatternCandidatePanel({
  assessment,
  actionHref,
  actionLabel,
  title = "Pattern Candidate",
  description = "Bounded discovery assist only. Suggestions stay visible and optional.",
}: {
  assessment: PatternCandidateAssessment;
  actionHref?: string | null;
  actionLabel?: string;
  title?: string;
  description?: string;
}) {
  if (assessment.flag === "no" && !assessment.alreadyCaptured) {
    return null;
  }

  const primaryLinkedPattern = assessment.linkedPatterns[0] ?? null;
  const href =
    actionHref ??
    (assessment.alreadyCaptured && primaryLinkedPattern ? `/patterns/${primaryLinkedPattern.id}` : null);
  const ctaLabel =
    actionLabel ??
    (assessment.alreadyCaptured ? "Open saved pattern" : "Save as pattern");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={toneClasses(assessment)}>{headline(assessment)}</Badge>
          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
            {PATTERN_TYPE_LABELS[assessment.suggestedPatternType]}
          </Badge>
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Why</p>
          <p className="mt-2 leading-6">{assessment.reason}</p>
          {assessment.shapeLabel ? (
            <p className="mt-2 text-sm text-slate-500">Pattern shape: {assessment.shapeLabel}.</p>
          ) : null}
          {assessment.commonSituationLabel ? (
            <p className="mt-1 text-sm text-slate-500">Situation: {assessment.commonSituationLabel}.</p>
          ) : null}
        </div>

        {assessment.alreadyCaptured && primaryLinkedPattern ? (
          <div className="rounded-2xl bg-slate-50/90 px-4 py-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">{primaryLinkedPattern.name}</p>
            <p className="mt-2 leading-6">{primaryLinkedPattern.description}</p>
          </div>
        ) : null}

        {href ? (
          <Link href={href} className="text-sm text-[color:var(--accent)] underline underline-offset-4">
            {ctaLabel}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
