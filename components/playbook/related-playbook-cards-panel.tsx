import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PLAYBOOK_CARD_STATUS_LABELS,
  type PlaybookCardMatch,
  type PlaybookCardStatus,
} from "@/lib/playbook-card-definitions";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";

function statusClasses(status: PlaybookCardStatus): string {
  return status === "retired"
    ? "bg-slate-100 text-slate-600 ring-slate-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export function RelatedPlaybookCardsPanel({
  title,
  description,
  matches,
  emptyCopy,
}: {
  title: string;
  description: string;
  matches: PlaybookCardMatch[];
  emptyCopy: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {matches.length === 0 ? (
          <div className="rounded-2xl bg-white/75 px-4 py-5 text-sm text-slate-500">{emptyCopy}</div>
        ) : (
          matches.map((match) => (
            <div key={match.card.id} className="rounded-2xl bg-white/80 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusClasses(match.card.status)}>
                  {PLAYBOOK_CARD_STATUS_LABELS[match.card.status]}
                </Badge>
                {match.card.suggestedModes[0] ? (
                  <Badge className="bg-sky-50 text-sky-700 ring-sky-200">
                    {getEditorialModeDefinition(match.card.suggestedModes[0]).label}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-3 font-medium text-slate-950">{match.card.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{match.card.summary}</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{match.reason}</p>
              {match.card.relatedTags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {match.card.relatedTags.slice(0, 3).map((tag) => (
                    <Badge key={tag} className="bg-white text-slate-600 ring-slate-200">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <Link href={`/playbook/${match.card.id}`} className="text-[color:var(--accent)] underline underline-offset-4">
                  Open playbook card
                </Link>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
