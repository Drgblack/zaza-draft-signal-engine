import { Activity, CalendarClock, CircleCheck, Layers3 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { compactNumber } from "@/lib/utils";

export function OverviewCards({
  totalSignals,
  needsInterpretation,
  inReview,
  scheduledOrPosted,
}: {
  totalSignals: number;
  needsInterpretation: number;
  inReview: number;
  scheduledOrPosted: number;
}) {
  const cards = [
    {
      label: "Total Signals",
      value: compactNumber(totalSignals),
      icon: Layers3,
      accent: "bg-slate-100 text-slate-700",
    },
    {
      label: "Needs Interpretation",
      value: compactNumber(needsInterpretation),
      icon: Activity,
      accent: "bg-amber-50 text-amber-700",
    },
    {
      label: "In Review",
      value: compactNumber(inReview),
      icon: CircleCheck,
      accent: "bg-violet-50 text-violet-700",
    },
    {
      label: "Scheduled / Posted",
      value: compactNumber(scheduledOrPosted),
      icon: CalendarClock,
      accent: "bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
              <div>
                <p className="text-sm font-medium text-slate-600">{card.label}</p>
                <CardTitle className="mt-2 text-3xl">{card.value}</CardTitle>
              </div>
              <div className={`rounded-2xl p-3 ${card.accent}`}>
                <Icon className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 text-sm leading-6 text-slate-600">
              Quick queue pulse for operator scan speed. No hidden weighting or auto-action here.
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
