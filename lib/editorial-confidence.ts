import type { CopilotGuidance } from "@/lib/copilot";
import { assessScenarioAngle } from "@/lib/scenario-angle";
import { getSourceProfile } from "@/lib/source-profiles";
import { getConfidenceThresholdConfig, type OperatorTuningSettings } from "@/lib/tuning";
import { assessTransformability } from "@/lib/transformability";
import { hasScoring } from "@/lib/workflow";
import type { SignalRecord } from "@/types/signal";

export const EDITORIAL_CONFIDENCE_LEVELS = ["high", "moderate", "low"] as const;

export type EditorialConfidenceLevel = (typeof EDITORIAL_CONFIDENCE_LEVELS)[number];
export type EditorialUncertaintyFlagCode =
  | "weak_framing"
  | "no_playbook_support"
  | "weak_pattern_match"
  | "uncertain_source_fit"
  | "novel_case"
  | "cautionary_reuse_memory"
  | "indirect_signal_requires_judgement";

export interface EditorialUncertaintyFlag {
  code: EditorialUncertaintyFlagCode;
  label: string;
}

export interface EditorialConfidenceAssessment {
  confidenceLevel: EditorialConfidenceLevel;
  confidenceReasons: string[];
  uncertaintyFlags: EditorialUncertaintyFlag[];
  cautionReason: string | null;
  summary: string;
}

type WeightedReason = {
  text: string;
  weight: number;
};

type WeightedFlag = EditorialUncertaintyFlag & {
  weight: number;
};

function pushUniqueReason(target: WeightedReason[], next: WeightedReason) {
  if (target.some((reason) => reason.text === next.text)) {
    return;
  }

  target.push(next);
}

function pushUniqueFlag(target: WeightedFlag[], next: WeightedFlag) {
  if (target.some((flag) => flag.code === next.code)) {
    return;
  }

  target.push(next);
}

function joinReasons(reasons: string[]): string {
  if (reasons.length === 0) {
    return "current support is mixed";
  }

  if (reasons.length === 1) {
    return reasons[0];
  }

  return `${reasons[0]} and ${reasons[1]}`;
}

export function getEditorialConfidenceLabel(level: EditorialConfidenceLevel): string {
  switch (level) {
    case "high":
      return "High";
    case "low":
      return "Low";
    case "moderate":
    default:
      return "Moderate";
  }
}

export function deriveEditorialConfidence(input: {
  signal: SignalRecord;
  guidance: CopilotGuidance;
  tuning?: OperatorTuningSettings;
}): EditorialConfidenceAssessment {
  const scenarioAssessment = assessScenarioAngle({
    scenarioAngle: input.signal.scenarioAngle,
    sourceTitle: input.signal.sourceTitle,
  });
  const transformability = assessTransformability(input.signal, input.tuning);
  const confidenceThresholds = getConfidenceThresholdConfig(input.tuning);
  const sourceProfile = getSourceProfile(input.signal);
  const supportReasons: WeightedReason[] = [];
  const cautionReasons: WeightedReason[] = [];
  const uncertaintyFlags: WeightedFlag[] = [];

  if (input.signal.status === "Posted" || input.signal.status === "Archived") {
    const reasons = ["the workflow state is explicit and already complete"];

    return {
      confidenceLevel: "high",
      confidenceReasons: reasons,
      uncertaintyFlags: [],
      cautionReason: null,
      summary: `Confidence is high because ${joinReasons(reasons)}.`,
    };
  }

  if (input.signal.status === "Approved" || input.signal.status === "Scheduled") {
    const reasons = ["the workflow state is explicit and the next operational step is clear"];

    return {
      confidenceLevel: "high",
      confidenceReasons: reasons,
      uncertaintyFlags: [],
      cautionReason: null,
      summary: `Confidence is high because ${joinReasons(reasons)}.`,
    };
  }

  if (scenarioAssessment.quality === "strong") {
    pushUniqueReason(supportReasons, {
      text: "current framing is strong",
      weight: 3,
    });
  } else if (scenarioAssessment.quality === "usable") {
    pushUniqueReason(supportReasons, {
      text: "current framing is usable",
      weight: 2,
    });
  } else {
    pushUniqueReason(cautionReasons, {
      text: scenarioAssessment.quality === "missing" ? "current framing is missing" : "current framing is weak",
      weight: 3,
    });
    pushUniqueFlag(uncertaintyFlags, {
      code: "weak_framing",
      label: "Weak framing",
      weight: 3,
    });
  }

  if (input.guidance.playbookCards.length > 0) {
    pushUniqueReason(supportReasons, {
      text: "relevant playbook guidance exists",
      weight: 2,
    });
  } else {
    pushUniqueReason(cautionReasons, {
      text: "playbook support is limited",
      weight: 2,
    });
    pushUniqueFlag(uncertaintyFlags, {
      code: "no_playbook_support",
      label: "No playbook support",
      weight: 2,
    });
  }

  if (input.guidance.patternSuggestions[0]) {
    const patternHint = input.guidance.patternSuggestions[0].effectivenessHint?.toLowerCase() ?? "";
    const weakPatternHint = patternHint.includes("weak") || patternHint.includes("refin");

    if (weakPatternHint) {
      pushUniqueReason(cautionReasons, {
        text: "pattern support exists but still looks fragile",
        weight: 1,
      });
      pushUniqueFlag(uncertaintyFlags, {
        code: "weak_pattern_match",
        label: "Weak pattern match",
        weight: 1,
      });
    } else {
      pushUniqueReason(supportReasons, {
        text:
          input.guidance.patternSuggestions[0].bundles.length > 0
            ? "pattern and bundle support are aligned"
            : "relevant pattern support surfaced",
        weight: 2,
      });
    }
  } else {
    pushUniqueReason(cautionReasons, {
      text: "no strong pattern support surfaced",
      weight: 1,
    });
    pushUniqueFlag(uncertaintyFlags, {
      code: "weak_pattern_match",
      label: "Weak pattern match",
      weight: 1,
    });
  }

  if (input.guidance.reuseMemory.positiveCount > 0) {
    pushUniqueReason(supportReasons, {
      text: "similar judged outcomes have worked before",
      weight: input.guidance.reuseMemory.positiveCount > input.guidance.reuseMemory.cautionCount ? 2 : 1,
    });
  }

  if (
    input.guidance.reuseMemory.cautionCount > 0 &&
    input.guidance.reuseMemory.cautionCount >= input.guidance.reuseMemory.positiveCount
  ) {
    pushUniqueReason(cautionReasons, {
      text: "similar judged outcomes need caution",
      weight: 2,
    });
    pushUniqueFlag(uncertaintyFlags, {
      code: "cautionary_reuse_memory",
      label: "Cautionary reuse memory",
      weight: 2,
    });
  }

  if (hasScoring(input.signal)) {
    if (
      input.signal.keepRejectRecommendation === "Keep" &&
      input.signal.qualityGateResult === "Pass"
    ) {
      pushUniqueReason(supportReasons, {
        text: "scoring and source fit are aligned",
        weight: 1,
      });
    } else if (
      input.signal.keepRejectRecommendation === "Review" ||
      input.signal.qualityGateResult === "Needs Review"
    ) {
      pushUniqueReason(cautionReasons, {
        text: "the source still needs extra editorial judgement",
        weight: 1,
      });
      pushUniqueFlag(uncertaintyFlags, {
        code: "uncertain_source_fit",
        label: "Uncertain source fit",
        weight: 1,
      });
    }
  } else {
    pushUniqueReason(cautionReasons, {
      text: "scoring evidence is still incomplete",
      weight: 1,
    });
    pushUniqueFlag(uncertaintyFlags, {
      code: "uncertain_source_fit",
      label: "Uncertain source fit",
      weight: 1,
    });
  }

  if (transformability.isIndirectSource) {
    if (transformability.label === "High transformability") {
      pushUniqueReason(supportReasons, {
        text: "the current framing converts an indirect source into a usable case",
        weight: 1,
      });
    } else {
      pushUniqueReason(cautionReasons, {
        text: "this is an indirect signal that still needs judgement",
        weight: 2,
      });
      pushUniqueFlag(uncertaintyFlags, {
        code: "indirect_signal_requires_judgement",
        label: "Indirect signal requires judgement",
        weight: 2,
      });
    }
  }

  if (input.guidance.playbookCoverageHint) {
    const hintText = input.guidance.playbookCoverageHint.text.toLowerCase();

    if (hintText.includes("no playbook") || hintText.includes("lacks guidance")) {
      pushUniqueReason(cautionReasons, {
        text: "this case is still thinly covered in the playbook",
        weight: 2,
      });
      pushUniqueFlag(uncertaintyFlags, {
        code: "novel_case",
        label: "Novel or thinly covered case",
        weight: 2,
      });
    } else if (hintText.includes("weakly covered") || hintText.includes("weak")) {
      pushUniqueReason(cautionReasons, {
        text: "playbook coverage is still weak in this family",
        weight: 2,
      });
      pushUniqueFlag(uncertaintyFlags, {
        code: "novel_case",
        label: "Novel or thinly covered case",
        weight: 2,
      });
    }
  }

  if (
    ["feed", "report", "other"].includes(sourceProfile.sourceKind) &&
    scenarioAssessment.quality !== "strong" &&
    transformability.label !== "High transformability"
  ) {
    pushUniqueReason(cautionReasons, {
      text: "the source is indirect enough to need stronger judgement",
      weight: 1,
    });
    pushUniqueFlag(uncertaintyFlags, {
      code: "uncertain_source_fit",
      label: "Uncertain source fit",
      weight: 1,
    });
  }

  const supportScore = supportReasons.reduce((sum, reason) => sum + reason.weight, 0);
  const cautionScore = cautionReasons.reduce((sum, reason) => sum + reason.weight, 0);
  const majorFramingRisk = uncertaintyFlags.some((flag) => flag.code === "weak_framing");
  const majorSupportGap =
    uncertaintyFlags.some((flag) => flag.code === "no_playbook_support") &&
    uncertaintyFlags.some((flag) => flag.code === "weak_pattern_match");

  let confidenceLevel: EditorialConfidenceLevel = "moderate";

  if (
    supportScore >= confidenceThresholds.highSupportFloor &&
    cautionScore <= confidenceThresholds.highMaxCaution &&
    !majorFramingRisk
  ) {
    confidenceLevel = "high";
  } else if (
    cautionScore >= confidenceThresholds.lowCautionFloor ||
    majorFramingRisk ||
    (majorSupportGap && cautionScore >= Math.max(3, confidenceThresholds.lowCautionFloor - 1))
  ) {
    confidenceLevel = "low";
  }

  const sortedSupportReasons = [...supportReasons]
    .sort((left, right) => right.weight - left.weight || left.text.localeCompare(right.text))
    .map((reason) => reason.text);
  const sortedCautionReasons = [...cautionReasons]
    .sort((left, right) => right.weight - left.weight || left.text.localeCompare(right.text))
    .map((reason) => reason.text);
  const confidenceReasons =
    confidenceLevel === "high"
      ? sortedSupportReasons.slice(0, 2)
      : confidenceLevel === "low"
        ? sortedCautionReasons.slice(0, 2)
        : [sortedSupportReasons[0], sortedCautionReasons[0]].filter(Boolean).slice(0, 2);
  const sortedFlags = [...uncertaintyFlags]
    .sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label))
    .slice(0, 3)
    .map(({ code, label }) => ({ code, label }));
  const cautionReason = sortedCautionReasons[0] ?? null;

  return {
    confidenceLevel,
    confidenceReasons,
    uncertaintyFlags: sortedFlags,
    cautionReason,
    summary: `Confidence is ${confidenceLevel} because ${joinReasons(confidenceReasons)}.`,
  };
}
