"use client";

import Link from "next/link";

import type { PlaybookPackMatch } from "@/lib/playbook-packs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PlaybookPackSuggestions({
  title,
  description,
  matches,
  emptyCopy = "No reusable playbook pack matches surfaced yet.",
  onUse,
}: {
  title: string;
  description: string;
  matches: PlaybookPackMatch[];
  emptyCopy?: string;
  onUse?: (match: PlaybookPackMatch) => void;
}) {
  return (
    <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{title}</p>
          <p className="mt-1">{description}</p>
        </div>
        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{matches.length} surfaced</Badge>
      </div>

      {matches.length === 0 ? (
        <p className="mt-4">{emptyCopy}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {matches.map((match) => (
            <div key={match.pack.packId} className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{match.pack.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{match.pack.summary}</p>
                </div>
                <Badge className="bg-sky-50 text-sky-700 ring-sky-200">score {match.score}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className="bg-white/90 text-slate-700 ring-slate-200">{match.pack.platform === "x" ? "X" : match.pack.platform === "linkedin" ? "LinkedIn" : "Reddit"}</Badge>
                {match.pack.mode ? <Badge className="bg-white/90 text-slate-700 ring-slate-200">{match.pack.mode}</Badge> : null}
                <Badge className="bg-white/90 text-slate-700 ring-slate-200">{match.pack.ctaStyle}</Badge>
                <Badge className="bg-white/90 text-slate-700 ring-slate-200">{match.pack.destinationType}</Badge>
              </div>
              <p className="mt-3">{match.reason}</p>
              <p className="mt-2 text-slate-500">{match.pack.whyItWorks}</p>
              {match.pack.exampleReferences.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  {match.pack.exampleReferences.map((reference) => (
                    <Link key={`${match.pack.packId}:${reference.href}`} href={reference.href} className="text-[color:var(--accent)] underline underline-offset-4">
                      {reference.label}
                    </Link>
                  ))}
                </div>
              ) : null}
              {onUse ? (
                <div className="mt-4">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onUse(match)}>
                    Use pack hint
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
