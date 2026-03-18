import { Badge } from "@/components/ui/badge";
import { CATEGORY_TONES } from "@/lib/constants";
import type { SignalCategory } from "@/types/signal";

export function CategoryBadge({ category }: { category: SignalCategory | null }) {
  if (!category) {
    return <Badge className="bg-slate-100 text-slate-500 ring-slate-200">Unclassified</Badge>;
  }

  return <Badge className={CATEGORY_TONES[category]}>{category}</Badge>;
}
