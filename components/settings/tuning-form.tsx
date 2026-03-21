"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type FormState = {
  sourceStrictness: string;
  scoringStrictness: string;
  confidenceStrictness: string;
  copilotConservatism: string;
  transformabilityRescueStrength: string;
  patternSuggestionStrictness: string;
  safeModePosting: string;
  safeModePostingConfirmation: string;
};

type TuningState = {
  preset: string;
  settings: FormState;
  updatedAt: string;
};

type PresetOption = {
  value: string;
  label: string;
  description: string;
  settings: FormState;
};

type ControlDefinition = {
  key: keyof FormState;
  label: string;
  description: string;
  options: Array<{
    value: string;
    label: string;
    description: string;
  }>;
};

function toneClasses(tone: "success" | "warning" | "error") {
  switch (tone) {
    case "success":
      return "bg-emerald-50 text-emerald-700";
    case "warning":
      return "bg-amber-50 text-amber-700";
    case "error":
    default:
      return "bg-rose-50 text-rose-700";
  }
}

function findMatchingPreset(settings: FormState, presets: PresetOption[]): string {
  const settingsKey = JSON.stringify(settings);
  const matched = presets.find((preset) => JSON.stringify(preset.settings) === settingsKey);
  return matched?.value ?? "custom";
}

export function TuningForm({
  initialTuning,
  presets,
  controls,
}: {
  initialTuning: TuningState;
  presets: PresetOption[];
  controls: ControlDefinition[];
}) {
  const [savedTuning, setSavedTuning] = useState<TuningState>(initialTuning);
  const [preset, setPreset] = useState<string>(initialTuning.preset);
  const [settings, setSettings] = useState<FormState>(initialTuning.settings);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  const matchingPreset = useMemo(() => findMatchingPreset(settings, presets), [presets, settings]);
  const isDirty =
    JSON.stringify(settings) !== JSON.stringify(savedTuning.settings) || preset !== savedTuning.preset;

  function updateSetting(key: keyof FormState, value: string) {
    setSettings((current) => {
      const next = {
        ...current,
        [key]: value,
      };
      setPreset(findMatchingPreset(next, presets));
      return next;
    });
  }

  function applyPreset(presetValue: string) {
    const matched = presets.find((presetOption) => presetOption.value === presetValue);
    if (!matched) {
      return;
    }

    setPreset(matched.value);
    setSettings(matched.settings);
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);

    try {
      const usingPreset =
        preset !== "custom" &&
        presets.some((presetOption) => presetOption.value === preset && JSON.stringify(presetOption.settings) === JSON.stringify(settings));
      const response = await fetch("/api/tuning", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(usingPreset ? { preset } : { settings }),
      });
      const data = (await response.json()) as {
        success: boolean;
        message?: string;
        error?: string;
        tuning?: TuningState | null;
      };

      if (!response.ok || !data.success || !data.tuning) {
        throw new Error(data.error ?? "Unable to update operator tuning.");
      }

      setPreset(data.tuning.preset);
      setSettings(data.tuning.settings);
      setSavedTuning(data.tuning);
      setFeedback({
        tone: "success",
        title: "Operator tuning updated",
        body: data.message ?? "Bounded tuning changes are now active.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Unable to update tuning",
        body: error instanceof Error ? error.message : "Operator tuning could not be updated.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/tuning", {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        success: boolean;
        message?: string;
        error?: string;
        tuning?: TuningState | null;
      };

      if (!response.ok || !data.success || !data.tuning) {
        throw new Error(data.error ?? "Unable to reset operator tuning.");
      }

      setPreset(data.tuning.preset);
      setSettings(data.tuning.settings);
      setSavedTuning(data.tuning);
      setFeedback({
        tone: "warning",
        title: "Reset to defaults",
        body: data.message ?? "Balanced defaults are active again.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Unable to reset tuning",
        body: error instanceof Error ? error.message : "Operator tuning could not be reset.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Preset</CardTitle>
          <CardDescription>
            Start from one safe operating mode, then override individual controls only when needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="tuning-preset">Operating mode</Label>
            <Select
              id="tuning-preset"
              value={matchingPreset}
              onChange={(event) => applyPreset(event.target.value)}
            >
              {presets.map((presetOption) => (
                <option key={presetOption.value} value={presetOption.value}>
                  {presetOption.label}
                </option>
              ))}
              <option value="custom" disabled>
                Custom
              </option>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {presets.map((presetOption) => (
              <button
                key={presetOption.value}
                type="button"
                onClick={() => applyPreset(presetOption.value)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  matchingPreset === presetOption.value
                    ? "border-slate-900 bg-slate-950 text-slate-50 shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
                    : "border-black/6 bg-white/88 text-slate-700 hover:bg-white"
                }`}
              >
                <p className="font-semibold">{presetOption.label}</p>
                <p className={`mt-2 text-sm leading-6 ${matchingPreset === presetOption.value ? "text-slate-100" : "text-slate-600"}`}>
                  {presetOption.description}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Controls</CardTitle>
          <CardDescription>
            Keep changes small. These controls shift heuristics in bounded ways rather than rewriting the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          {controls.map((control) => (
            <div key={control.key} className="grid gap-2 rounded-2xl border border-black/5 bg-white/84 p-4">
              <Label htmlFor={`tuning-${control.key}`}>{control.label}</Label>
              <Select
                id={`tuning-${control.key}`}
                value={settings[control.key]}
                onChange={(event) => updateSetting(control.key, event.target.value)}
              >
                {control.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <p className="text-sm leading-6 text-slate-600">{control.description}</p>
              <p className="text-xs leading-5 text-slate-500">
                {control.options.find((option) => option.value === settings[control.key])?.description}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? "Saving..." : "Save tuning"}
        </Button>
        <Button type="button" variant="secondary" onClick={handleReset} disabled={saving}>
          Reset to defaults
        </Button>
        <p className="text-sm text-slate-500">
          Current mode: {matchingPreset === "custom" ? "Custom" : presets.find((presetOption) => presetOption.value === matchingPreset)?.label}
        </p>
      </div>

      {feedback ? (
        <div className={`rounded-2xl px-4 py-3 text-sm ${toneClasses(feedback.tone)}`}>
          <p className="font-medium">{feedback.title}</p>
          <p className="mt-1">{feedback.body}</p>
        </div>
      ) : null}
    </div>
  );
}
