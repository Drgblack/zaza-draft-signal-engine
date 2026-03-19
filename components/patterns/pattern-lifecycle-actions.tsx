"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PatternLifecycleState } from "@/lib/pattern-definitions";
import type { PatternResponse } from "@/types/api";

function stateClasses(state: PatternLifecycleState): string {
  return state === "retired"
    ? "bg-slate-100 text-slate-600 ring-slate-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export function PatternLifecycleActions({
  patternId,
  patternName,
  lifecycleState,
}: {
  patternId: string;
  patternName: string;
  lifecycleState: PatternLifecycleState;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const nextState: PatternLifecycleState = lifecycleState === "retired" ? "active" : "retired";

  async function handleUpdate() {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/patterns/${patternId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lifecycleState: nextState,
        }),
      });
      const data = (await response.json()) as PatternResponse;

      if (!response.ok || !data.success || !data.pattern) {
        throw new Error(data.error ?? "Unable to update pattern lifecycle.");
      }

      setFeedback(
        nextState === "retired"
          ? `${patternName} is now retired and will stay out of normal suggestions and generation selection.`
          : `${patternName} is active again and can reappear in normal suggestions and generation selection.`,
      );
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to update pattern lifecycle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={stateClasses(lifecycleState)}>
            {lifecycleState === "retired" ? "Retired" : "Active"}
          </Badge>
        </div>
        <CardTitle>Pattern Lifecycle</CardTitle>
        <CardDescription>
          Retired patterns stay in the library for reference but are excluded from normal suggestions and generation use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" variant={nextState === "retired" ? "secondary" : "primary"} onClick={handleUpdate} disabled={saving}>
          {saving ? "Saving..." : nextState === "retired" ? "Retire pattern" : "Reactivate pattern"}
        </Button>
        {feedback ? <p className="text-sm text-slate-600">{feedback}</p> : null}
      </CardContent>
    </Card>
  );
}
