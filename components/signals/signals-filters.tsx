import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SIGNAL_CATEGORIES, SIGNAL_STATUSES, type SignalCategory, type SignalStatus } from "@/types/signal";
import type { SignalsSortKey } from "@/lib/workflow";

export function SignalsFilters({
  status,
  category,
  sourceType,
  sort,
  sourceTypes,
}: {
  status?: SignalStatus;
  category?: SignalCategory;
  sourceType?: string;
  sort: SignalsSortKey;
  sourceTypes: string[];
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <form className="grid gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto_auto]">
          <div className="grid gap-2">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={status ?? ""}>
              <option value="">All statuses</option>
              {SIGNAL_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select id="category" name="category" defaultValue={category ?? ""}>
              <option value="">All categories</option>
              {SIGNAL_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sourceType">Source Type</Label>
            <Select id="sourceType" name="sourceType" defaultValue={sourceType ?? ""}>
              <option value="">All source types</option>
              {sourceTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sort">Sort</Label>
            <Select id="sort" name="sort" defaultValue={sort}>
              <option value="createdDate-desc">Newest created first</option>
              <option value="createdDate-asc">Oldest created first</option>
              <option value="sourceDate-desc">Newest source date first</option>
              <option value="sourceDate-asc">Oldest source date first</option>
            </Select>
          </div>
          <input type="hidden" name="_" value="signals" />
          <div className="flex items-end">
            <Button type="submit" className="w-full lg:w-auto">
              Apply
            </Button>
          </div>
          <div className="flex items-end">
            <Link href="/signals" className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-900/5">
              Reset
            </Link>
          </div>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          Keep the queue narrow: filter for the current decision, then reset back to the full registry.
        </p>
      </CardContent>
    </Card>
  );
}
