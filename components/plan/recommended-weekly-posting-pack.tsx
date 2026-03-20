import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecommendedWeeklyPostingPack } from "@/lib/recommended-weekly-posting-pack";

export function RecommendedWeeklyPostingPackSection({
  pack,
}: {
  pack: RecommendedWeeklyPostingPack;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This week&apos;s best set</CardTitle>
        <CardDescription>
          A manual posting pack built from approval-ready items, evergreen reuse opportunities, weekly-plan balance, and prior outcomes. Nothing posts automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">{pack.summary}</div>
        {pack.items.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
            No posting pack is ready yet. Move more items into approval-ready or resurface more evergreen candidates first.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pack.items.map((item) => (
              <div key={item.id} className="rounded-2xl bg-white/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">{item.sourceTitle}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.recommendedPlatformLabel} · {item.contentSourceLabel}
                    </p>
                  </div>
                  <Link href={item.reviewHref} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Open in review
                  </Link>
                </div>

                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                    <p className="font-medium text-slate-900">Final draft</p>
                    <p className="mt-2 whitespace-pre-wrap">{item.finalDraft}</p>
                  </div>
                  <p>
                    <span className="font-medium text-slate-900">Asset:</span> {item.assetSummary}
                  </p>
                  {item.cta ? (
                    <p>
                      <span className="font-medium text-slate-900">CTA:</span> {item.cta}
                    </p>
                  ) : null}
                  {item.linkUrl ? (
                    <p>
                      <span className="font-medium text-slate-900">Link:</span>{" "}
                      <Link href={item.linkUrl} target="_blank" className="text-[color:var(--accent)] underline underline-offset-4">
                        {item.linkLabel ?? item.linkUrl}
                      </Link>
                    </p>
                  ) : null}
                  {item.timingSuggestion ? (
                    <p>
                      <span className="font-medium text-slate-900">Timing:</span> {item.timingSuggestion}
                    </p>
                  ) : null}
                </div>

                {item.rationale.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Rationale</p>
                    {item.rationale.map((reason) => (
                      <p key={reason} className="rounded-2xl bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                        {reason}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
