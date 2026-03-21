import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FounderOverrideState } from "@/lib/founder-overrides";

function tone(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }
  if (priority === "medium") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function FounderOverrideSummary({
  state,
  compact = false,
}: {
  state: FounderOverrideState;
  compact?: boolean;
}) {
  return (
    <div id="founder-overrides">
      <Card>
        <CardHeader>
          <CardTitle>{compact ? "Founder Overrides" : "Founder Override Layer"}</CardTitle>
          <CardDescription>
            Temporary founder direction stays visible, expires automatically, and nudges planning, strategy, generation, and distribution without bypassing safety guardrails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              {state.activeOverrides.length} active
            </Badge>
            {state.activeOverrides.slice(0, compact ? 2 : 4).map((override) => (
              <Badge key={override.overrideId} className={tone(override.priority)}>
                {override.targetArea.replaceAll("_", " ")}
              </Badge>
            ))}
          </div>
          <div className="space-y-2">
            {state.topNotes.slice(0, compact ? 2 : 4).map((note) => (
              <p key={note} className="text-sm leading-6 text-slate-700">
                {note}
              </p>
            ))}
          </div>
          <Link
            href="/overrides"
            className="inline-flex text-sm font-medium text-[color:var(--accent)] underline underline-offset-4"
          >
            Open founder overrides
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
