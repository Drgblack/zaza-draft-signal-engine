import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { UnifiedGuidance } from "@/lib/guidance";

function toneClasses(tone: UnifiedGuidance["tone"]) {
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

function reuseToneClasses(tone: "positive" | "caution" | "neutral") {
  switch (tone) {
    case "positive":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "caution":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "neutral":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function readinessLabel(readinessState: UnifiedGuidance["readinessState"]) {
  switch (readinessState) {
    case "ready":
      return "Ready";
    case "blocked":
      return "Needs attention";
    case "review":
      return "Use judgement";
    case "done":
      return "Done";
    case "parked":
      return "Parked";
    default:
      return "Use judgement";
  }
}

export function GuidancePanel({
  guidance,
  title = "Guidance",
  description = "One compact view of the strongest next-step guidance for this record.",
  variant = "full",
}: {
  guidance: UnifiedGuidance;
  title?: string;
  description?: string;
  variant?: "full" | "compact";
}) {
  const supportItems = [
    ...guidance.relatedPlaybookCards.map((item) => ({ ...item, label: "Playbook" })),
    ...guidance.relatedPatterns.map((item) => ({ ...item, label: "Pattern" })),
    ...guidance.relatedBundles.map((item) => ({ ...item, label: "Bundle" })),
  ].slice(0, variant === "compact" ? 2 : 3);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClasses(guidance.tone)}`}>
            {readinessLabel(guidance.readinessState)}
          </span>
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Main recommendation</p>
          <p className="text-base font-medium text-slate-950">{guidance.primaryAction}</p>
          <p className="text-sm leading-6 text-slate-600">{guidance.primaryReason}</p>
          {guidance.actionHref && guidance.actionLabel ? (
            <Link href={guidance.actionHref} className="inline-block text-sm text-[color:var(--accent)] underline underline-offset-4">
              {guidance.actionLabel}
            </Link>
          ) : null}
        </div>

        {guidance.supportingSignals.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Why</p>
            <div className="space-y-3">
              {guidance.supportingSignals.map((item) => (
                <div key={`${item.label}-${item.text}`} className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {guidance.reuseMemory?.highlights.length ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">What worked before</p>
            <div className="space-y-3">
              {guidance.reuseMemory.highlights.map((item) => (
                <div key={`${item.text}-${item.matchedOn.join("-")}`} className="rounded-2xl bg-white/80 px-4 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${reuseToneClasses(item.tone)}`}>
                    {item.tone === "positive" ? "Worked before" : item.tone === "caution" ? "Use caution" : "Past outcome"}
                  </span>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.text}</p>
                  {item.matchedOn.length > 0 ? (
                    <p className="mt-1 text-xs text-slate-500">Matched on {item.matchedOn.join(", ")}.</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {supportItems.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Relevant support</p>
            <div className="space-y-3">
              {supportItems.map((item) => (
                <div key={`${item.label}-${item.href}`} className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-sm font-medium text-slate-900">
                    {item.label}: {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
                  <Link href={item.href} className="mt-2 inline-block text-sm text-[color:var(--accent)] underline underline-offset-4">
                    Open {item.label.toLowerCase()}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {guidance.gapWarnings.length > 0 || guidance.cautionNotes.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Gap or caution</p>
            <div className="space-y-3">
              {guidance.gapWarnings.map((item) => (
                <div key={item.text} className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                  <Link href={item.href} className="mt-2 inline-block text-sm text-[color:var(--accent)] underline underline-offset-4">
                    {item.hrefLabel}
                  </Link>
                </div>
              ))}
              {guidance.cautionNotes.map((note) => (
                <div key={note} className="rounded-2xl bg-white/80 px-4 py-4">
                  <p className="text-sm leading-6 text-slate-600">{note}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
