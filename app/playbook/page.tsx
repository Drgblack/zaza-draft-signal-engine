import Link from "next/link";

import { PlaybookCardFormCard } from "@/components/playbook/playbook-card-form-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSignalWithFallback, listSignalsWithFallback } from "@/lib/airtable";
import { buildPlaybookCoverageSummary, buildPlaybookDraftFromCoverageGap } from "@/lib/playbook-coverage";
import { listPostingOutcomes } from "@/lib/outcomes";
import { listPatternBundles } from "@/lib/pattern-bundles";
import { getPattern, listPatterns } from "@/lib/patterns";
import {
  PLAYBOOK_CARD_STATUS_LABELS,
  type PlaybookCardFormValues,
} from "@/lib/playbook-card-definitions";
import {
  buildPlaybookDraftFromBundle,
  buildPlaybookDraftFromPattern,
  buildPlaybookDraftFromSignal,
  listPlaybookCards,
} from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-slate-950 px-3 py-2 text-sm font-medium text-white"
          : "rounded-full bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
      }
    >
      {label}
    </Link>
  );
}

function statusClasses(status: "active" | "retired"): string {
  return status === "retired"
    ? "bg-slate-100 text-slate-600 ring-slate-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

const EMPTY_PLAYBOOK_FORM: PlaybookCardFormValues = {
  title: "",
  summary: "",
  situation: "",
  whatWorks: "",
  whatToAvoid: "",
  suggestedModes: [],
  relatedPatternIds: [],
  relatedBundleIds: [],
  relatedTags: [],
  status: "active",
};

export default async function PlaybookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const statusParam = getSingleValue(params.status);
  const signalId = getSingleValue(params.signalId);
  const gapKey = getSingleValue(params.gapKey);
  const patternId = getSingleValue(params.patternId);
  const bundleId = getSingleValue(params.bundleId);
  const filterStatus = statusParam === "retired" || statusParam === "all" ? statusParam : "active";

  const cards = await listPlaybookCards({ status: filterStatus });
  const allCards = filterStatus === "all" ? cards : await listPlaybookCards({ status: "all" });
  const patterns = await listPatterns({ includeRetired: true });
  const bundles = await listPatternBundles();
  const { signals } = await listSignalsWithFallback({ limit: 1000 });
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();

  let initialValues = EMPTY_PLAYBOOK_FORM;
  let prefillLabel: string | null = null;
  let sourceGap:
    | {
        key: string;
        label: string;
        kind: "uncovered" | "weak_coverage" | "opportunity";
        flag: string;
      }
    | null = null;

  if (gapKey) {
    const coverageSummary = buildPlaybookCoverageSummary({
      signals,
      playbookCards: allCards,
      postingEntries,
      postingOutcomes,
    });
    const gap = coverageSummary.gaps.find((candidate) => candidate.key === gapKey) ?? null;

    if (gap) {
      initialValues = buildPlaybookDraftFromCoverageGap(gap);
      prefillLabel = `coverage gap: ${gap.label}`;
      sourceGap = {
        key: gap.key,
        label: gap.label,
        kind: gap.kind,
        flag: gap.flag,
      };
    }
  } else if (signalId) {
    const signalResult = await getSignalWithFallback(signalId);
    if (signalResult.signal) {
      initialValues = buildPlaybookDraftFromSignal({
        signal: signalResult.signal,
        suggestedMode: signalResult.signal.editorialMode,
      });
      prefillLabel = `signal: ${signalResult.signal.sourceTitle}`;
    }
  } else if (patternId) {
    const pattern = await getPattern(patternId);
    if (pattern) {
      const relatedBundles = bundles
        .filter((bundle) => bundle.patternIds.includes(pattern.id))
        .map((bundle) => ({
          id: bundle.id,
          name: bundle.name,
          description: bundle.description,
        }));
      initialValues = buildPlaybookDraftFromPattern({
        pattern,
        bundleSummaries: relatedBundles,
      });
      prefillLabel = `pattern: ${pattern.name}`;
    }
  } else if (bundleId) {
    const bundle = bundles.find((candidate) => candidate.id === bundleId) ?? null;
    if (bundle) {
      initialValues = buildPlaybookDraftFromBundle({ bundle });
      prefillLabel = `bundle: ${bundle.name}`;
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Operator guidance</Badge>
            <Badge className="bg-white text-slate-600 ring-slate-200">
              {allCards.filter((card) => card.status === "active").length} active ·{" "}
              {allCards.filter((card) => card.status === "retired").length} retired
            </Badge>
            <Link href="/patterns" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open patterns
            </Link>
            <Link href="/pattern-bundles" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open bundles
            </Link>
          </div>
          <CardTitle className="text-3xl">Editorial Playbook</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Compact operator-facing guidance cards that distill what tends to work, what to avoid, and which patterns or bundles are worth remembering in recurring communication situations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 text-sm text-slate-600">
          <p>
            Playbook cards complement patterns and bundles. They stay compact, manual, and inspectable on purpose.
          </p>
          <div className="flex flex-wrap gap-2">
            <FilterLink href="/playbook" label="Active" active={filterStatus === "active"} />
            <FilterLink href="/playbook?status=retired" label="Retired" active={filterStatus === "retired"} />
            <FilterLink href="/playbook?status=all" label="All" active={filterStatus === "all"} />
          </div>
        </CardContent>
      </Card>

      <PlaybookCardFormCard
        mode="create"
        title="Create playbook card"
        description="Capture the small operator rules that are worth reusing later. Keep cards short, practical, and situation-specific."
        initialValues={initialValues}
        availablePatterns={patterns}
        availableBundles={bundles}
        prefillLabel={prefillLabel}
        sourceGap={sourceGap}
      />

      {cards.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-8 text-sm text-slate-600">
            {filterStatus === "retired"
              ? "No retired playbook cards yet."
              : "No playbook cards saved yet. Start with one recurring communication situation you keep seeing."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.id} className={card.status === "retired" ? "opacity-75" : ""}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusClasses(card.status)}>{PLAYBOOK_CARD_STATUS_LABELS[card.status]}</Badge>
                  <Badge className="bg-white text-slate-600 ring-slate-200">{formatDateTime(card.createdAt)}</Badge>
                </div>
                <CardTitle className="text-xl">{card.title}</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-600">{card.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Situation</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{card.situation}</p>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">What works</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{card.whatWorks}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">What to avoid</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{card.whatToAvoid}</p>
                  </div>
                </div>
                {card.relatedTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {card.relatedTags.map((tag) => (
                      <Badge key={tag} className="bg-white text-slate-600 ring-slate-200">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Link href={`/playbook/${card.id}`} className="text-[color:var(--accent)] underline underline-offset-4">
                    Open card
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
