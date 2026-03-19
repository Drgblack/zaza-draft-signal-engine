"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SignalPattern } from "@/lib/pattern-definitions";
import type { PatternBundleResponse } from "@/types/api";

export function PatternBundleFormCard({
  patterns,
}: {
  patterns: SignalPattern[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPatternIds, setSelectedPatternIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const activePatterns = useMemo(
    () => patterns.filter((pattern) => pattern.lifecycleState === "active"),
    [patterns],
  );

  function togglePattern(patternId: string) {
    setSelectedPatternIds((current) =>
      current.includes(patternId)
        ? current.filter((id) => id !== patternId)
        : [...current, patternId],
    );
  }

  async function handleSubmit() {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/pattern-bundles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          patternIds: selectedPatternIds,
        }),
      });

      const data = (await response.json()) as PatternBundleResponse;

      if (!response.ok || !data.success || !data.bundle) {
        throw new Error(data.error ?? "Unable to save pattern bundle.");
      }

      setName("");
      setDescription("");
      setSelectedPatternIds([]);
      setFeedback(`Bundle saved: ${data.bundle.name}.`);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to save pattern bundle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create bundle</CardTitle>
        <CardDescription>
          Create a small manual kit of related patterns. Bundles organise the playbook; they do not apply whole groups automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="bundle-name">Bundle name</Label>
            <Input id="bundle-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Parent Complaint Kit" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bundle-description">Description</Label>
            <Textarea
              id="bundle-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-24"
              placeholder="Patterns for de-escalating, clarifying, and documenting difficult parent communication."
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Include patterns</p>
          <div className="grid gap-3 md:grid-cols-2">
            {activePatterns.map((pattern) => {
              const selected = selectedPatternIds.includes(pattern.id);

              return (
                <button
                  key={pattern.id}
                  type="button"
                  onClick={() => togglePattern(pattern.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-slate-900 bg-slate-950 text-white"
                      : "border-black/8 bg-white/80 text-slate-700 hover:bg-white"
                  }`}
                >
                  <p className="font-medium">{pattern.name}</p>
                  <p className={`mt-2 text-sm leading-6 ${selected ? "text-slate-200" : "text-slate-500"}`}>
                    {pattern.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Create bundle"}
          </Button>
          {feedback ? <p className="text-sm text-slate-600">{feedback}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
