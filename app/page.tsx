import Link from "next/link";
import { ArrowRight, Clock3, Inbox } from "lucide-react";

import { OverviewCards } from "@/components/signals/overview-cards";
import { SignalsTable } from "@/components/signals/signals-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_DISPLAY_ORDER } from "@/lib/constants";
import { listSignalsWithFallback } from "@/lib/airtable";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { signals, source, error } = await listSignalsWithFallback();
  const statusCounts = STATUS_DISPLAY_ORDER.map((status) => ({
    status,
    count: signals.filter((signal) => signal.status === status).length,
  })).filter((item) => item.count > 0);

  const recentSignals = signals.slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Dashboard</p>
            <CardTitle className="max-w-3xl text-3xl leading-tight sm:text-4xl">
              Quiet structure for signal intake, classification, and draft preparation.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base leading-7">
              V1 stays intentionally tight: one signal in, light interpretation, placeholder draft outputs, then review and scheduling visibility.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 pt-2">
            <Link href="/signals/new" className={buttonVariants({})}>
              Intake a signal
            </Link>
            <Link href="/review" className={buttonVariants({ variant: "secondary" })}>
              Open review queue
            </Link>
            <p className="text-sm text-slate-500">
              Data source: <span className="font-medium text-slate-700">{source === "airtable" ? "Airtable" : "Mock fallback"}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Queue Shape</CardTitle>
            <CardDescription>Status distribution across the internal workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusCounts.map((item) => (
              <div key={item.status} className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
                <span className="text-sm text-slate-600">{item.status}</span>
                <span className="text-lg font-semibold text-slate-950">{item.count}</span>
              </div>
            ))}
            {error ? <p className="text-sm text-amber-700">{error}</p> : null}
          </CardContent>
        </Card>
      </section>

      <OverviewCards
        totalSignals={signals.length}
        needsInterpretation={signals.filter((signal) => signal.status === "New" || signal.status === "Interpreted").length}
        inReview={signals.filter((signal) => ["Reviewed", "Approved"].includes(signal.status)).length}
        scheduledOrPosted={signals.filter((signal) => ["Scheduled", "Posted"].includes(signal.status)).length}
      />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SignalsTable
          signals={recentSignals}
          title="Recent Signals"
          description="Latest signal records surfaced through mock or Airtable-backed data."
        />

        <Card>
          <CardHeader>
            <CardTitle>Operator Actions</CardTitle>
            <CardDescription>Deliberately simple pathways for this scaffold run.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {[
              {
                href: "/signals/new",
                title: "Manual intake",
                copy: "Capture a signal with a clean submission form and basic classification.",
                icon: Inbox,
              },
              {
                href: "/signals",
                title: "Signal library",
                copy: "Scan current records with status, category, severity, hook, and timing.",
                icon: ArrowRight,
              },
              {
                href: "/review",
                title: "Review shell",
                copy: "See what is already reviewed, approved, or scheduled for later work.",
                icon: Clock3,
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-3xl border border-black/6 bg-white/82 p-5 transition hover:bg-white"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-slate-950">{item.title}</p>
                      <p className="text-sm leading-6 text-slate-600">{item.copy}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
