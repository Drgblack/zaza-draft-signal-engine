import { Badge } from "@/components/ui/badge";
import { SEVERITY_TONES } from "@/lib/constants";
import type { SeverityScore } from "@/types/signal";

export function SeverityBadge({ severity }: { severity: SeverityScore | null }) {
  if (!severity) {
    return <Badge className="bg-slate-100 text-slate-500 ring-slate-200">Unset</Badge>;
  }

  return <Badge className={SEVERITY_TONES[severity]}>Severity {severity}</Badge>;
}
