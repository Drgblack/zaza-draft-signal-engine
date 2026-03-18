import Link from "next/link";

import { deriveDisplayEngagementScore } from "@/lib/airtable";
import { CategoryBadge } from "@/components/signals/category-badge";
import { SeverityBadge } from "@/components/signals/severity-badge";
import { StatusBadge } from "@/components/signals/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber, formatDate, formatDateTime } from "@/lib/utils";
import type { SignalRecord } from "@/types/signal";

export function SignalsTable({
  signals,
  title = "Signals",
  description = "Current signal queue",
}: {
  signals: SignalRecord[];
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-hidden px-0 pb-0">
        {signals.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-slate-500">No signals available yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead className="border-y border-black/6 bg-white/60 text-xs uppercase tracking-[0.18em] text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Signal</th>
                  <th className="px-4 py-4 font-medium">Status</th>
                  <th className="px-4 py-4 font-medium">Category</th>
                  <th className="px-4 py-4 font-medium">Severity</th>
                  <th className="px-4 py-4 font-medium">Hook</th>
                  <th className="px-4 py-4 font-medium">Platform</th>
                  <th className="px-4 py-4 font-medium">Engagement</th>
                  <th className="px-4 py-4 font-medium">Timing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/6 text-sm text-slate-700">
                {signals.map((signal) => (
                  <tr key={signal.recordId} className="bg-white/45 transition hover:bg-white/80">
                    <td className="px-6 py-4 align-top">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-950">{signal.sourceTitle}</p>
                        <p className="max-w-md text-sm text-slate-500">
                          {signal.manualSummary ?? signal.rawExcerpt ?? "No summary added yet."}
                        </p>
                        {signal.sourceUrl ? (
                          <Link href={signal.sourceUrl} target="_blank" className="text-xs text-[color:var(--accent)]">
                            Open source
                          </Link>
                        ) : null}
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
                    <td className="px-4 py-4 align-top text-slate-500">
                      <div>{signal.scheduledDate ? `Scheduled ${formatDateTime(signal.scheduledDate)}` : `Created ${formatDate(signal.createdDate)}`}</div>
                      {signal.postedDate ? <div className="mt-1">Posted {formatDateTime(signal.postedDate)}</div> : null}
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
