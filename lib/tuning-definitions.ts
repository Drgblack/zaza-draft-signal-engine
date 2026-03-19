import { z } from "zod";

export const TUNING_PRESETS = ["conservative", "balanced", "exploratory"] as const;
export const STORED_TUNING_PRESETS = ["conservative", "balanced", "exploratory", "custom"] as const;

export const SOURCE_STRICTNESS_VALUES = ["conservative", "balanced", "exploratory"] as const;
export const SCORING_STRICTNESS_VALUES = ["strict", "balanced", "permissive"] as const;
export const CONFIDENCE_STRICTNESS_VALUES = ["cautious", "balanced", "trusting"] as const;
export const COPILOT_CONSERVATISM_VALUES = ["conservative", "balanced", "action_oriented"] as const;
export const TRANSFORMABILITY_RESCUE_VALUES = ["low", "medium", "high"] as const;
export const PATTERN_SUGGESTION_STRICTNESS_VALUES = ["sparse", "balanced", "helpful"] as const;

export type TuningPreset = (typeof TUNING_PRESETS)[number];
export type StoredTuningPreset = (typeof STORED_TUNING_PRESETS)[number];
export type SourceStrictness = (typeof SOURCE_STRICTNESS_VALUES)[number];
export type ScoringStrictness = (typeof SCORING_STRICTNESS_VALUES)[number];
export type ConfidenceStrictness = (typeof CONFIDENCE_STRICTNESS_VALUES)[number];
export type CopilotConservatism = (typeof COPILOT_CONSERVATISM_VALUES)[number];
export type TransformabilityRescueStrength = (typeof TRANSFORMABILITY_RESCUE_VALUES)[number];
export type PatternSuggestionStrictness = (typeof PATTERN_SUGGESTION_STRICTNESS_VALUES)[number];

export const operatorTuningSettingsSchema = z.object({
  sourceStrictness: z.enum(SOURCE_STRICTNESS_VALUES),
  scoringStrictness: z.enum(SCORING_STRICTNESS_VALUES),
  confidenceStrictness: z.enum(CONFIDENCE_STRICTNESS_VALUES),
  copilotConservatism: z.enum(COPILOT_CONSERVATISM_VALUES),
  transformabilityRescueStrength: z.enum(TRANSFORMABILITY_RESCUE_VALUES),
  patternSuggestionStrictness: z.enum(PATTERN_SUGGESTION_STRICTNESS_VALUES),
});

export const operatorTuningSchema = z.object({
  preset: z.enum(STORED_TUNING_PRESETS),
  settings: operatorTuningSettingsSchema,
  updatedAt: z.string().trim().min(1),
});

export type OperatorTuningSettings = z.infer<typeof operatorTuningSettingsSchema>;
export type OperatorTuning = z.infer<typeof operatorTuningSchema>;

type TuningOptionDefinition<Value extends string> = {
  value: Value;
  label: string;
  description: string;
};

type TuningControlDefinition<Value extends string> = {
  label: string;
  description: string;
  options: TuningOptionDefinition<Value>[];
};

export const TUNING_PRESET_LABELS: Record<TuningPreset, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  exploratory: "Exploratory",
};

export const TUNING_PRESET_DESCRIPTIONS: Record<TuningPreset, string> = {
  conservative: "Filters weak signals harder and asks for stronger support before moving forward.",
  balanced: "Keeps the current bounded behavior with moderate caution and moderate exploration.",
  exploratory: "Stays more open to weak-but-promising signals while keeping operator review in the loop.",
};

export const TUNING_PRESET_DEFAULTS: Record<TuningPreset, OperatorTuningSettings> = {
  conservative: {
    sourceStrictness: "conservative",
    scoringStrictness: "strict",
    confidenceStrictness: "cautious",
    copilotConservatism: "conservative",
    transformabilityRescueStrength: "low",
    patternSuggestionStrictness: "sparse",
  },
  balanced: {
    sourceStrictness: "balanced",
    scoringStrictness: "balanced",
    confidenceStrictness: "balanced",
    copilotConservatism: "balanced",
    transformabilityRescueStrength: "medium",
    patternSuggestionStrictness: "balanced",
  },
  exploratory: {
    sourceStrictness: "exploratory",
    scoringStrictness: "permissive",
    confidenceStrictness: "trusting",
    copilotConservatism: "action_oriented",
    transformabilityRescueStrength: "high",
    patternSuggestionStrictness: "helpful",
  },
};

export const TUNING_CONTROL_DEFINITIONS: {
  sourceStrictness: TuningControlDefinition<SourceStrictness>;
  scoringStrictness: TuningControlDefinition<ScoringStrictness>;
  confidenceStrictness: TuningControlDefinition<ConfidenceStrictness>;
  copilotConservatism: TuningControlDefinition<CopilotConservatism>;
  transformabilityRescueStrength: TuningControlDefinition<TransformabilityRescueStrength>;
  patternSuggestionStrictness: TuningControlDefinition<PatternSuggestionStrictness>;
} = {
  sourceStrictness: {
    label: "Source strictness",
    description: "Controls how aggressively weak sources and thin context are filtered.",
    options: [
      { value: "conservative", label: "Conservative", description: "Penalize weak source context more heavily." },
      { value: "balanced", label: "Balanced", description: "Keep source filtering close to the default behavior." },
      { value: "exploratory", label: "Exploratory", description: "Stay more open to noisy but promising sources." },
    ],
  },
  scoringStrictness: {
    label: "Scoring strictness",
    description: "Controls how easily records move from scoring into further editorial work.",
    options: [
      { value: "strict", label: "Strict", description: "Require stronger scoring alignment before a record passes." },
      { value: "balanced", label: "Balanced", description: "Keep score-to-workflow thresholds near the current default." },
      { value: "permissive", label: "Permissive", description: "Let more borderline records stay alive for review." },
    ],
  },
  confidenceStrictness: {
    label: "Confidence strictness",
    description: "Controls how hard it is for the system to call guidance high confidence.",
    options: [
      { value: "cautious", label: "Cautious", description: "Reserve high confidence for better-supported cases only." },
      { value: "balanced", label: "Balanced", description: "Keep confidence thresholds close to the current default." },
      { value: "trusting", label: "Trusting", description: "Allow high confidence on mixed-but-supported cases more often." },
    ],
  },
  copilotConservatism: {
    label: "Co-pilot conservatism",
    description: "Controls whether the co-pilot leans toward caution or action on borderline cases.",
    options: [
      { value: "conservative", label: "Conservative", description: "Prefer caution and explicit review before acting." },
      { value: "balanced", label: "Balanced", description: "Keep co-pilot next-action posture near the current default." },
      { value: "action_oriented", label: "Action-oriented", description: "Encourage forward movement when support looks workable." },
    ],
  },
  transformabilityRescueStrength: {
    label: "Transformability rescue",
    description: "Controls how much strong framing can lift an indirect or weak raw source.",
    options: [
      { value: "low", label: "Low", description: "Make indirect sources earn more support before they recover." },
      { value: "medium", label: "Medium", description: "Keep rescue strength near the current default." },
      { value: "high", label: "High", description: "Let a strong Scenario Angle rescue indirect sources more often." },
    ],
  },
  patternSuggestionStrictness: {
    label: "Pattern suggestion strictness",
    description: "Controls how readily pattern and playbook support is surfaced.",
    options: [
      { value: "sparse", label: "Sparse", description: "Show only stronger pattern matches." },
      { value: "balanced", label: "Balanced", description: "Keep suggestion thresholds near the current default." },
      { value: "helpful", label: "Helpful", description: "Surface weaker-but-still-usable support more readily." },
    ],
  },
};

function cloneSettings(settings: OperatorTuningSettings): OperatorTuningSettings {
  return {
    ...settings,
  };
}

export function buildOperatorTuningState(
  preset: StoredTuningPreset,
  settings: OperatorTuningSettings,
  updatedAt = new Date().toISOString(),
): OperatorTuning {
  return operatorTuningSchema.parse({
    preset,
    settings,
    updatedAt,
  });
}

export function getTuningPresetSettings(preset: TuningPreset): OperatorTuningSettings {
  return cloneSettings(TUNING_PRESET_DEFAULTS[preset]);
}

export function getDefaultOperatorTuning(): OperatorTuning {
  return buildOperatorTuningState("balanced", getTuningPresetSettings("balanced"));
}

export function resolveOperatorTuningPreset(settings: OperatorTuningSettings): StoredTuningPreset {
  const nextKey = JSON.stringify(settings);

  for (const preset of TUNING_PRESETS) {
    if (JSON.stringify(TUNING_PRESET_DEFAULTS[preset]) === nextKey) {
      return preset;
    }
  }

  return "custom";
}

export function resolveOperatorTuningSettings(
  tuning?: OperatorTuning | OperatorTuningSettings | null,
): OperatorTuningSettings {
  if (!tuning) {
    return getDefaultOperatorTuning().settings;
  }

  if ("settings" in tuning) {
    return tuning.settings;
  }

  return tuning;
}

export function getStoredTuningPresetLabel(preset: StoredTuningPreset): string {
  return preset === "custom" ? "Custom" : TUNING_PRESET_LABELS[preset];
}

export function getControlOptionLabel<
  Key extends keyof typeof TUNING_CONTROL_DEFINITIONS,
>(key: Key, value: (typeof TUNING_CONTROL_DEFINITIONS)[Key]["options"][number]["value"]): string {
  return (
    TUNING_CONTROL_DEFINITIONS[key].options.find((option) => option.value === value)?.label ??
    String(value)
  );
}

export function getOperatorTuningRows(tuning: OperatorTuning): Array<{
  key: keyof OperatorTuningSettings;
  label: string;
  valueLabel: string;
}> {
  return (Object.keys(TUNING_CONTROL_DEFINITIONS) as Array<keyof OperatorTuningSettings>).map((key) => ({
    key,
    label: TUNING_CONTROL_DEFINITIONS[key].label,
    valueLabel: getControlOptionLabel(key, tuning.settings[key]),
  }));
}

export function getOperatorTuningSummary(tuning: OperatorTuning): string {
  const presetLabel = getStoredTuningPresetLabel(tuning.preset);
  const rescueLabel = getControlOptionLabel(
    "transformabilityRescueStrength",
    tuning.settings.transformabilityRescueStrength,
  );

  return `${presetLabel} mode. Transformability rescue is ${rescueLabel.toLowerCase()}.`;
}

export function getSourceStrictnessConfig(tuning?: OperatorTuning | OperatorTuningSettings | null) {
  const settings = resolveOperatorTuningSettings(tuning);

  switch (settings.sourceStrictness) {
    case "conservative":
      return {
        lowContextPenalty: 24,
        missingContextPenalty: 20,
        redditWithoutCommunicationPenalty: 10,
        anonymousPenalty: 12,
      };
    case "exploratory":
      return {
        lowContextPenalty: 10,
        missingContextPenalty: 8,
        redditWithoutCommunicationPenalty: 4,
        anonymousPenalty: 5,
      };
    case "balanced":
    default:
      return {
        lowContextPenalty: 18,
        missingContextPenalty: 15,
        redditWithoutCommunicationPenalty: 8,
        anonymousPenalty: 8,
      };
  }
}

export function getScoringDecisionConfig(tuning?: OperatorTuning | OperatorTuningSettings | null) {
  const settings = resolveOperatorTuningSettings(tuning);

  switch (settings.scoringStrictness) {
    case "strict":
      return {
        rejectWeightedFloor: 42,
        weakFitFloor: 40,
        weakTrustFloor: 35,
        highSimilarityFloor: 90,
        keepWeightedFloor: 72,
        keepFieldFloor: 65,
        keepTrustFloor: 50,
        keepSimilarityCeiling: 80,
      };
    case "permissive":
      return {
        rejectWeightedFloor: 34,
        weakFitFloor: 30,
        weakTrustFloor: 25,
        highSimilarityFloor: 94,
        keepWeightedFloor: 64,
        keepFieldFloor: 55,
        keepTrustFloor: 40,
        keepSimilarityCeiling: 88,
      };
    case "balanced":
    default:
      return {
        rejectWeightedFloor: 38,
        weakFitFloor: 35,
        weakTrustFloor: 30,
        highSimilarityFloor: 92,
        keepWeightedFloor: 68,
        keepFieldFloor: 60,
        keepTrustFloor: 45,
        keepSimilarityCeiling: 85,
      };
  }
}

export function getConfidenceThresholdConfig(tuning?: OperatorTuning | OperatorTuningSettings | null) {
  const settings = resolveOperatorTuningSettings(tuning);

  switch (settings.confidenceStrictness) {
    case "cautious":
      return {
        highSupportFloor: 7,
        highMaxCaution: 1,
        lowCautionFloor: 4,
      };
    case "trusting":
      return {
        highSupportFloor: 5,
        highMaxCaution: 3,
        lowCautionFloor: 6,
      };
    case "balanced":
    default:
      return {
        highSupportFloor: 6,
        highMaxCaution: 2,
        lowCautionFloor: 5,
      };
  }
}

export function getCopilotConservatismConfig(tuning?: OperatorTuning | OperatorTuningSettings | null) {
  const settings = resolveOperatorTuningSettings(tuning);

  return {
    conservatism: settings.copilotConservatism,
    actionOriented: settings.copilotConservatism === "action_oriented",
    conservative: settings.copilotConservatism === "conservative",
  };
}

export function getTransformabilityRescueConfig(tuning?: OperatorTuning | OperatorTuningSettings | null) {
  const settings = resolveOperatorTuningSettings(tuning);

  switch (settings.transformabilityRescueStrength) {
    case "low":
      return {
        strongScenarioBonus: 26,
        usableScenarioBonus: 16,
        weakScenarioBonus: 4,
      };
    case "high":
      return {
        strongScenarioBonus: 40,
        usableScenarioBonus: 28,
        weakScenarioBonus: 8,
      };
    case "medium":
    default:
      return {
        strongScenarioBonus: 34,
        usableScenarioBonus: 22,
        weakScenarioBonus: 6,
      };
  }
}

export function getPatternSuggestionConfig(tuning?: OperatorTuning | OperatorTuningSettings | null) {
  const settings = resolveOperatorTuningSettings(tuning);

  switch (settings.patternSuggestionStrictness) {
    case "sparse":
      return {
        minimumScore: 6,
      };
    case "helpful":
      return {
        minimumScore: 3,
      };
    case "balanced":
    default:
      return {
        minimumScore: 4,
      };
  }
}
