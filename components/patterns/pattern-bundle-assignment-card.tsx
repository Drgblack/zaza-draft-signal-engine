"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { PatternBundle } from "@/lib/pattern-bundles";
import type { SignalPattern } from "@/lib/pattern-definitions";
import type { PatternBundleResponse } from "@/types/api";

export function PatternBundleAssignmentCard({
  pattern,
  allBundles,
  assignedBundles,
}: {
  pattern: SignalPattern;
  allBundles: PatternBundle[];
  assignedBundles: PatternBundle[];
}) {
  const router = useRouter();
  const [selectedBundleId, setSelectedBundleId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const availableBundles = allBundles.filter((bundle) => !bundle.patternIds.includes(pattern.id));

  async function updateMembership(bundleId: string, action: "assign" | "remove") {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/patterns/${pattern.id}/bundles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bundleId,
          action,
        }),
      });
      const data = (await response.json()) as PatternBundleResponse;

      if (!response.ok || !data.success || !data.bundle) {
        throw new Error(data.error ?? "Unable to update bundle membership.");
      }

      setFeedback(
        action === "assign"
          ? `Assigned to ${data.bundle.name}.`
          : `Removed from ${data.bundle.name}.`,
      );
      setSelectedBundleId("");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to update bundle membership.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bundle membership</CardTitle>
        <CardDescription>
          Assign this pattern to one or more manual kits. Bundles organise related approaches, but they do not override pattern lifecycle state.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignedBundles.length > 0 ? (
          <div className="space-y-3">
            {assignedBundles.map((bundle) => (
              <div key={bundle.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-4">
                <div>
                    <p className="font-medium text-slate-950">{bundle.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{bundle.description}</p>
                    <Link href={`/pattern-bundles/${bundle.id}`} className="mt-2 inline-block text-sm text-[color:var(--accent)] underline underline-offset-4">
                      Open bundle
                    </Link>
                  </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => updateMembership(bundle.id, "remove")} disabled={saving}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            This pattern is not part of any bundle yet.
          </div>
        )}

        {availableBundles.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedBundleId} onChange={(event) => setSelectedBundleId(event.target.value)}>
              <option value="">Select bundle</option>
              {availableBundles.map((bundle) => (
                <option key={bundle.id} value={bundle.id}>
                  {bundle.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (selectedBundleId) {
                  void updateMembership(selectedBundleId, "assign");
                }
              }}
              disabled={!selectedBundleId || saving}
            >
              Assign to bundle
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
            This pattern is already included in every available bundle.
          </div>
        )}

        {feedback ? <p className="text-sm text-slate-600">{feedback}</p> : null}
      </CardContent>
    </Card>
  );
}
