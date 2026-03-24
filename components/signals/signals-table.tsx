import Link from "next/link";

import { CopilotHint } from "@/components/signals/copilot-guidance";
import { buttonVariants } from "@/components/ui/button";
import { deriveDisplayEngagementScore } from "@/lib/signal-repository";
import { getCopilotGuidance, type CopilotGuidance } from "@/lib/copilot";
import { CategoryBadge } from "@/components/signals/category-badge";
import { SourceContextBadge } from "@/components/signals/source-context-badge";
import { SeverityBadge } from "@/components/signals/severity-badge";
import { StatusBadge } from "@/components/signals/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber, formatDate, formatDateTime } from "@/lib/utils";
import { hasInterpretation } from "@/lib/workflow";
import type { SignalRecord } from "@/types/signal";

function summarizeSignal(signal: SignalRecord) {
  const source = signal.manualSummary ?? signal.rawExcerpt ?? "No summary added yet.";
  return source.length > 150 ? `${source.slice(0, 147).trimEnd()}...` : source;
}

export function SignalsTable({
  signals,
  title = "Signals",
  description = "Current signal queue",
  guidanceBySignalId,
}: {
  signals: SignalRecord[];
  title?: string;
  description?: string;
  guidanceBySignalId?: Record<string, CopilotGuidance>;
}) {
  return (
    <Card className="border-black/6 bg-white/76 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-500">{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-hidden px-0 pb-0">
        {signals.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-slate-500">No signals available yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead className="border-y border-black/6 bg-white/70 text-[11px] tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Signal</th>
                  <th className="px-4 py-3.5 font-semibold">Status</th>
                  <th className="px-4 py-3.5 font-semibold">Category</th>
                  <th className="px-4 py-3.5 font-semibold">Severity</th>
                  <th className="px-4 py-3.5 font-semibold">Hook</th>
                  <th className="px-4 py-3.5 font-semibold">Platform</th>
                  <th className="px-4 py-3.5 font-semibold">Engagement</th>
                  <th className="px-4 py-3.5 font-semibold">Timing</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/6 text-sm text-slate-700">
                {signals.map((signal) => (
                  <tr key={signal.recordId} className="bg-white/34 transition hover:bg-white/70">
                    <td className="px-6 py-4 align-top">
                      <div className="space-y-2">
                        <Link href={`/signals/${signal.recordId}`} className="text-base font-semibold text-slate-950 hover:text-[color:var(--accent)]">
                          {signal.sourceTitle}
                        </Link>
                        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
                          <SourceContextBadge signal={signal} />
                          {signal.sourceUrl ? (
                            <Link href={signal.sourceUrl} target="_blank" className="font-medium text-[color:var(--accent)]">
                              Open source
                            </Link>
                          ) : null}
                        </div>
                        <p className="max-w-lg text-[13px] leading-6 text-slate-600">
                          {summarizeSignal(signal)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {signal.keepRejectRecommendation ?? "Unscored"} · {signal.reviewPriority ?? "Priority not set"} ·{" "}
                          {signal.qualityGateResult ?? "Quality gate not set"}
                        </p>
                        {signal.whySelected || signal.whyRejected ? (
                          <p className="max-w-lg text-xs leading-5 text-slate-400">{signal.whySelected ?? signal.whyRejected}</p>
                        ) : null}
                        <CopilotHint guidance={guidanceBySignalId?.[signal.recordId] ?? getCopilotGuidance(signal)} />
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <StatusBadge status={signal.status} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <CategoryBadge category={signal.signalCategory} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <SeverityBadge severity={signal.severityScore} />
                    </td>
                    <td className="px-4 py-4 align-top text-slate-600">
                      {signal.hookTemplateUsed ?? "Not chosen"}
                    </td>
                    <td className="px-4 py-4 align-top text-slate-600">
                      {signal.platformPriority ?? "TBD"}
                    </td>
                    <td className="px-4 py-4 align-top text-slate-600">
                      {compactNumber(deriveDisplayEngagementScore(signal))}
                    </td>
                    <td className="px-4 py-4 align-top text-xs leading-5 text-slate-500">
                      <div>{signal.scheduledDate ? `Scheduled ${formatDateTime(signal.scheduledDate)}` : `Created ${formatDate(signal.createdDate)}`}</div>
                      {signal.postedDate ? <div className="mt-1">Posted {formatDateTime(signal.postedDate)}</div> : null}
                    </td>
                    <td className="px-6 py-4 align-top text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        <Link
                          href={`/signals/${signal.recordId}`}
                          className={buttonVariants({ variant: "secondary", size: "sm", className: "whitespace-nowrap" })}
                        >
                          Open
                        </Link>
                        <Link
                          href={`/signals/${signal.recordId}/interpret`}
                          className="text-xs font-medium text-[color:var(--accent)]"
                        >
                          {signal.status === "Interpreted" ? "Review" : "Interpret"}
                        </Link>
                        {hasInterpretation(signal) ? (
                          <Link
                            href={`/signals/${signal.recordId}/generate`}
                            className="text-xs font-medium text-[color:var(--accent)]"
                          >
                            Generate
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500">Needs interpretation</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

