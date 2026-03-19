import { TuningForm } from "@/components/settings/tuning-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TUNING_CONTROL_DEFINITIONS,
  TUNING_PRESETS,
  TUNING_PRESET_DESCRIPTIONS,
  TUNING_PRESET_LABELS,
  getOperatorTuning,
  getOperatorTuningRows,
  getOperatorTuningSummary,
  getTuningPresetSettings,
} from "@/lib/tuning";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tuning = await getOperatorTuning();
  const tuningRows = getOperatorTuningRows(tuning);
  const presetOptions = TUNING_PRESETS.map((preset) => ({
    value: preset,
    label: TUNING_PRESET_LABELS[preset],
    description: TUNING_PRESET_DESCRIPTIONS[preset],
    settings: getTuningPresetSettings(preset),
  }));
  const controls = (Object.keys(TUNING_CONTROL_DEFINITIONS) as Array<keyof typeof TUNING_CONTROL_DEFINITIONS>).map(
    (key) => ({
      key,
      label: TUNING_CONTROL_DEFINITIONS[key].label,
      description: TUNING_CONTROL_DEFINITIONS[key].description,
      options: TUNING_CONTROL_DEFINITIONS[key].options,
    }),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              Current mode: {tuning.preset === "custom" ? "Custom" : TUNING_PRESET_LABELS[tuning.preset]}
            </Badge>
          </div>
          <CardTitle className="text-3xl">Operator Tuning</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Small operator controls for how strict or permissive the system should feel. These settings shift bounded heuristics only. They do not expose formulas, replace judgement, or rewrite the workflow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm leading-6 text-slate-700">
            {getOperatorTuningSummary(tuning)}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tuningRows.map((row) => (
              <div key={row.key} className="rounded-2xl bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{row.valueLabel}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <TuningForm
        initialTuning={tuning}
        presets={presetOptions}
        controls={controls}
      />
    </div>
  );
}
