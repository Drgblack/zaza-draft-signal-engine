import { Badge } from "@/components/ui/badge";
import { getSourceProfile } from "@/lib/source-profiles";
import type { SignalRecord } from "@/types/signal";

function kindClasses(kind: ReturnType<typeof getSourceProfile>["sourceKind"]) {
  switch (kind) {
    case "reddit":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "forum":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "internal":
      return "bg-violet-50 text-violet-700 ring-violet-200";
    case "report":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "feed":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "other":
    default:
      return "bg-stone-100 text-stone-700 ring-stone-200";
  }
}

export function SourceContextBadge({ signal, showContext = true }: { signal: SignalRecord; showContext?: boolean }) {
  const profile = getSourceProfile(signal);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className={kindClasses(profile.sourceKind)}>{profile.kindLabel}</Badge>
      {showContext ? <span className="text-xs text-slate-500">{profile.contextLabel}</span> : null}
    </div>
  );
}
