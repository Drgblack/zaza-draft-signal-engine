"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FounderOverrideState } from "@/lib/founder-overrides";
import type { FounderOverrideResponse } from "@/types/api";

const TYPE_OPTIONS = [
  { value: "temporary_rule", label: "Temporary rule" },
  { value: "priority_shift", label: "Priority shift" },
  { value: "strategic_direction", label: "Strategic direction" },
] as const;

const TARGET_OPTIONS = [
  { value: "platform_priority", label: "Platform priority" },
  { value: "experiment_pacing", label: "Experiment pacing" },
  { value: "messaging_focus", label: "Messaging focus" },
  { value: "conversion_pressure", label: "Conversion pressure" },
  { value: "distribution_strategy", label: "Distribution strategy" },
  { value: "campaign_focus", label: "Campaign focus" },
  { value: "planning_focus", label: "Planning focus" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

const DURATION_OPTIONS = [
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
  { value: "336", label: "14 days" },
] as const;

export function FounderOverrideManager({
  initialState,
}: {
  initialState: FounderOverrideState;
}) {
  const router = useRouter();
  const [overrideType, setOverrideType] = useState<string>("priority_shift");
  const [targetArea, setTargetArea] = useState<string>("platform_priority");
  const [priority, setPriority] = useState<string>("high");
  const [durationHours, setDurationHours] = useState<string>("168");
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function createOverride() {
    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          overrideType,
          targetArea,
          instruction,
          durationHours: Number(durationHours),
          priority,
        }),
      });
      const data = (await response.json().catch(() => null)) as FounderOverrideResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? "Unable to create founder override.");
      }

      setInstruction("");
      setFeedback(data.message ?? "Founder override created.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to create founder override.");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeOverride(overrideId: string) {
    setRemovingId(overrideId);
    setFeedback(null);

    try {
      const response = await fetch("/api/overrides", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ overrideId }),
      });
      const data = (await response.json().catch(() => null)) as FounderOverrideResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? "Unable to remove founder override.");
      }

      setFeedback(data.message ?? "Founder override removed.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to remove founder override.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create Override</CardTitle>
          <CardDescription>
            Use short, temporary instructions to steer the system without creating a full rule engine. Overrides always expire and stay visible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="override-type">Override type</Label>
              <Select id="override-type" value={overrideType} onChange={(event) => setOverrideType(event.target.value)}>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="override-target">Target area</Label>
              <Select id="override-target" value={targetArea} onChange={(event) => setTargetArea(event.target.value)}>
                {TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="override-priority">Priority</Label>
              <Select id="override-priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="override-duration">Duration</Label>
              <Select id="override-duration" value={durationHours} onChange={(event) => setDurationHours(event.target.value)}>
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="override-instruction">Instruction</Label>
            <Textarea
              id="override-instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Prioritise LinkedIn this week. Reduce experiments. Focus on teacher protection messaging."
              className="min-h-[140px]"
            />
          </div>
          <Button onClick={createOverride} disabled={submitting || instruction.trim().length < 6}>
            {submitting ? "Applying override..." : "Apply founder override"}
          </Button>
          {feedback ? (
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
              {feedback}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Overrides</CardTitle>
          <CardDescription>
            Only operator-visible overrides are active. They can steer system emphasis, but they do not bypass policy or safety guardrails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {initialState.activeOverrides.length === 0 ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
              No founder overrides are active right now.
            </div>
          ) : (
            initialState.activeOverrides.map((override) => (
              <div key={override.overrideId} className="rounded-2xl bg-white/84 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {override.targetArea.replaceAll("_", " ")}
                  </Badge>
                  <Badge className={override.priority === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : override.priority === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                    {override.priority}
                  </Badge>
                  <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{override.duration}</Badge>
                </div>
                <p className="mt-3 font-medium text-slate-950">{override.instruction}</p>
                <p className="mt-2 text-sm text-slate-600">
                  Applied {new Date(override.createdAt).toLocaleString("en-GB")} · expires {new Date(override.expiresAt).toLocaleString("en-GB")}
                </p>
                <Button
                  variant="ghost"
                  className="mt-3"
                  onClick={() => removeOverride(override.overrideId)}
                  disabled={removingId === override.overrideId}
                >
                  {removingId === override.overrideId ? "Removing..." : "Remove override"}
                </Button>
              </div>
            ))
          )}

          {initialState.recentExpiredOverrides.length > 0 ? (
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Recently expired</p>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                {initialState.recentExpiredOverrides.slice(0, 3).map((override) => (
                  <p key={override.overrideId}>
                    {override.instruction} expired on {new Date(override.expiresAt).toLocaleString("en-GB")}.
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
