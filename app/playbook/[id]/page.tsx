import Link from "next/link";
import { notFound } from "next/navigation";

import { PlaybookCardFormCard } from "@/components/playbook/playbook-card-form-card";
import { AuditTrail } from "@/components/signals/audit-trail";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuditEvents } from "@/lib/audit";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { getPatternBundle, listPatternBundles } from "@/lib/pattern-bundles";
import { getPlaybookCard } from "@/lib/playbook-cards";
import { getPattern, listPatterns } from "@/lib/patterns";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function statusClasses(status: "active" | "retired"): string {
  return status === "retired"
    ? "bg-slate-100 text-slate-600 ring-slate-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export default async function PlaybookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await getPlaybookCard(id);

  if (!card) {
    notFound();
  }

  const patterns = await listPatterns({ includeRetired: true });
  const bundles = await listPatternBundles();
  const relatedPatterns = (await Promise.all(card.relatedPatternIds.map((patternId) => getPattern(patternId)))).filter(
    (pattern): pattern is NonNullable<typeof pattern> => Boolean(pattern),
  );
  const relatedBundles = (await Promise.all(card.relatedBundleIds.map((bundleId) => getPatternBundle(bundleId)))).filter(
    (bundle): bundle is NonNullable<typeof bundle> => Boolean(bundle),
  );
  const auditEvents = await getAuditEvents(`playbook:${card.id}`);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={statusClasses(card.status)}>{card.status === "retired" ? "Retired" : "Active"}</Badge>
            <Badge className="bg-white text-slate-600 ring-slate-200">{formatDateTime(card.createdAt)}</Badge>
            <Link href="/playbook" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Back to playbook
            </Link>
          </div>
          <CardTitle className="text-3xl">{card.title}</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">{card.summary}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 pt-0 text-sm text-slate-600">
          <span>Created by {card.createdBy}</span>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Card Guidance</CardTitle>
            <CardDescription>Compact operator guidance for this recurring situation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl bg-slate-50/90 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Situation</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{card.situation}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">What works</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{card.whatWorks}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">What to avoid</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{card.whatToAvoid}</p>
            </div>
            {card.suggestedModes.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Suggested editorial modes</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {card.suggestedModes.map((mode) => (
                    <Badge key={mode} className="bg-sky-50 text-sky-700 ring-sky-200">
                      {getEditorialModeDefinition(mode).label}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {card.relatedTags.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Family tags</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {card.relatedTags.map((tag) => (
                    <Badge key={tag} className="bg-white text-slate-600 ring-slate-200">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Related Library Links</CardTitle>
              <CardDescription>Patterns and bundles this card is meant to complement, not replace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {relatedPatterns.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Patterns</p>
                  {relatedPatterns.map((pattern) => (
                    <div key={pattern.id} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{pattern.name}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{pattern.description}</p>
                      <Link href={`/patterns/${pattern.id}`} className="mt-3 inline-block text-sm text-[color:var(--accent)] underline underline-offset-4">
                        Open pattern
                      </Link>
                    </div>
                  ))}
                </div>
              ) : null}
              {relatedBundles.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Bundles</p>
                  {relatedBundles.map((bundle) => (
                    <div key={bundle.id} className="rounded-2xl bg-white/80 px-4 py-4">
                      <p className="font-medium text-slate-950">{bundle.name}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{bundle.description}</p>
                      <Link href={`/pattern-bundles/${bundle.id}`} className="mt-3 inline-block text-sm text-[color:var(--accent)] underline underline-offset-4">
                        Open bundle
                      </Link>
                    </div>
                  ))}
                </div>
              ) : null}
              {relatedPatterns.length === 0 && relatedBundles.length === 0 ? (
                <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-500">
                  This card currently stands alone without linked patterns or bundles.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <PlaybookCardFormCard
            mode="edit"
            title="Edit playbook card"
            description="Keep cards compact. They should stay practical and operator-facing, not turn into a long handbook."
            initialValues={{
              title: card.title,
              summary: card.summary,
              situation: card.situation,
              whatWorks: card.whatWorks,
              whatToAvoid: card.whatToAvoid,
              suggestedModes: card.suggestedModes,
              relatedPatternIds: card.relatedPatternIds,
              relatedBundleIds: card.relatedBundleIds,
              relatedTags: card.relatedTags,
              status: card.status,
            }}
            availablePatterns={patterns}
            availableBundles={bundles}
            card={card}
          />
        </div>
      </div>

      <AuditTrail events={auditEvents} />
    </div>
  );
}
