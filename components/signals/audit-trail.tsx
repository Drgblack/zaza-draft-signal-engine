import type { AuditEvent } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function actorClasses(actor: AuditEvent["actor"]) {
  return actor === "operator"
    ? "bg-sky-50 text-sky-700 ring-sky-200"
    : "bg-slate-100 text-slate-700 ring-slate-200";
}

export function AuditTrail({
  events,
}: {
  events: AuditEvent[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Trail</CardTitle>
        <CardDescription>Append-only timeline of system recommendations, operator actions, and pipeline progression.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
            No audit history recorded for this signal yet.
          </div>
        ) : (
          <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
            {events.map((event) => (
              <div key={event.id} className="rounded-2xl bg-white/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${actorClasses(event.actor)}`}>
                      {event.actor}
                    </span>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{event.eventType}</span>
                  </div>
                  <p className="text-xs text-slate-400">{new Date(event.timestamp).toLocaleString()}</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{event.summary}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
