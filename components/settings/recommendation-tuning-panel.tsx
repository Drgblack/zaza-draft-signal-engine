import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getRecommendationFamilyLabel,
  type RecommendationTuningState,
} from "@/lib/recommendation-tuning";

function weightTone(weight: number) {
  if (weight > 1) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if (weight < 1) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function RecommendationTuningPanel({
  state,
  compact = false,
}: {
  state: RecommendationTuningState | null;
  compact?: boolean;
}) {
  if (!state) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recommendation tuning</CardTitle>
          <CardDescription>
            No recommendation-tuning snapshot has been computed yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recommendation tuning</CardTitle>
          <CardDescription>
            Small bounded weighting shifts based on recent outcomes and operator follow-through.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.topNotes.map((note) => (
            <div key={note} className="rounded-2xl bg-white/84 px-4 py-4 text-sm text-slate-700">
              {note}
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommendation tuning</CardTitle>
        <CardDescription>
          The engine nudges recommendation families up or down in small, inspectable steps. These are bounded weighting shifts, not model training or hidden rule changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.topNotes[0] ? (
          <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
            {state.topNotes[0]}
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {state.entries.map((entry) => (
            <div key={entry.recommendationFamily} className="rounded-2xl bg-white/84 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={weightTone(entry.currentWeight)}>
                  {entry.currentWeight > 1
                    ? "Elevated"
                    : entry.currentWeight < 1
                      ? "Reduced"
                      : "Baseline"}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  {entry.currentWeight.toFixed(2)}x
                </Badge>
              </div>
              <p className="mt-3 font-medium text-slate-950">
                {getRecommendationFamilyLabel(entry.recommendationFamily)}
              </p>
              <p className="mt-2 text-sm text-slate-700">{entry.adjustmentReason}</p>
              <p className="mt-2 text-xs text-slate-500">
                Evidence: {entry.evidenceCount} · Last adjusted {new Date(entry.lastAdjustedAt).toLocaleDateString("en-GB")}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
