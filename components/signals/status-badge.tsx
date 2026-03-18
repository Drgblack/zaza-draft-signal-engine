import { Badge } from "@/components/ui/badge";
import { STATUS_TONES } from "@/lib/constants";
import type { SignalStatus } from "@/types/signal";

export function StatusBadge({ status }: { status: SignalStatus }) {
  return <Badge className={STATUS_TONES[status]}>{status}</Badge>;
}
