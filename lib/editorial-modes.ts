import type { EditorialMode, SignalRecord } from "@/types/signal";

export interface EditorialModeDefinition {
  id: EditorialMode;
  label: string;
  purpose: string;
  tone: string;
  framing: string;
  platformFit: string;
  avoid: string[];
  promptRules: string[];
}

export interface EditorialModeSuggestion {
  mode: EditorialMode;
  reason: string;
}

export const EDITORIAL_MODE_DEFINITIONS: Record<EditorialMode, EditorialModeDefinition> = {
  awareness: {
    id: "awareness",
    label: "Awareness",
    purpose: "Make the communication problem visible and legible without turning it into a hard warning or tactical how-to.",
    tone: "Clear, teacher-aware, observational, steady.",
    framing: "Surface the issue cleanly so the reader recognises it.",
    platformFit: "Works well when the operator wants a broad, readable opening angle.",
    avoid: ["empty abstraction", "overclaiming", "vague moralising"],
    promptRules: [
      "Lead by naming the communication pattern clearly.",
      "Keep the draft recognisable and grounded rather than alarmist.",
      "Do not drift into a full how-to list unless the scenario itself demands it.",
    ],
  },
  risk_warning: {
    id: "risk_warning",
    label: "Risk Warning",
    purpose: "Highlight professional or communication risk so the reader sees what could go wrong and why it matters.",
    tone: "Serious, protective, cautionary, calm.",
    framing: "Show the risk plainly, then anchor it in professional judgement.",
    platformFit: "Useful for high-stakes communication mistakes, documentation risk, and escalation risk.",
    avoid: ["melodrama", "panic language", "legal overclaiming"],
    promptRules: [
      "Name the professional risk directly without sounding sensational.",
      "Keep the warning bounded to the scenario and evidence provided.",
      "Avoid catastrophic language or claims the source does not support.",
    ],
  },
  helpful_tip: {
    id: "helpful_tip",
    label: "Helpful Tip",
    purpose: "Give a practical communication takeaway the reader can use immediately.",
    tone: "Useful, calm, direct, practical.",
    framing: "Turn the scenario into one clear takeaway or adjustment.",
    platformFit: "Strong for actionable scenarios where the operator wants a practical post rather than reflection.",
    avoid: ["generic advice", "detached reflection", "bloated lists"],
    promptRules: [
      "Make the draft feel usable rather than abstract.",
      "Stay tied to the actual teacher communication scenario.",
      "Prefer one concrete takeaway over broad generic advice.",
    ],
  },
  thought_leadership: {
    id: "thought_leadership",
    label: "Thought Leadership",
    purpose: "Turn the signal into a reflective professional perspective with clear relevance.",
    tone: "Calm, thoughtful, perspective-driven, credible.",
    framing: "Use the signal to say something broader and sharper about the work.",
    platformFit: "Often strongest on LinkedIn or founder-style commentary.",
    avoid: ["vagueness", "pompous tone", "teacher-detached commentary"],
    promptRules: [
      "Say something broader than the case, but still tied to it.",
      "Keep the voice grounded and teacher-relevant.",
      "Do not let the draft become airy, self-important, or generic.",
    ],
  },
  calm_insight: {
    id: "calm_insight",
    label: "Calm Insight",
    purpose: "Offer a steady reframing that reduces noise and helps the reader see the situation more clearly.",
    tone: "Measured, reassuring, clear, low-drama.",
    framing: "Reframe the issue so the reader sees the hidden pressure or mismatch more clearly.",
    platformFit: "Useful for stress, workload, and emotionally heavy signals where a softer voice improves trust.",
    avoid: ["sharp fear framing", "heated rhetoric", "overly tactical copy"],
    promptRules: [
      "Keep the draft emotionally intelligent and low-drama.",
      "Use clarity and perspective rather than force.",
      "Let the takeaway feel steady, not urgent for its own sake.",
    ],
  },
  this_could_happen_to_you: {
    id: "this_could_happen_to_you",
    label: "This Could Happen To You",
    purpose: "Make the risk feel personally relevant while staying grounded and professional.",
    tone: "Sharp, direct, cautionary, grounded.",
    framing: "Bring the scenario close to the reader without scare tactics.",
    platformFit: "Useful when personal-risk framing will increase attention without distorting the situation.",
    avoid: ["manipulative scare tactics", "sensationalism", "clickbait energy"],
    promptRules: [
      "Make the scenario feel close and plausible, not theatrical.",
      "Keep the risk grounded in everyday teacher communication reality.",
      "Do not use exaggerated fear language or lurid framing.",
    ],
  },
  professional_guidance: {
    id: "professional_guidance",
    label: "Professional Guidance",
    purpose: "Give structured professional direction for how to communicate, document, or respond well.",
    tone: "Clear, disciplined, practical, professional.",
    framing: "Position the draft as grounded guidance rather than personal reflection.",
    platformFit: "Strong for documentation, policy translation, difficult emails, and evidence-sensitive communication.",
    avoid: ["overly casual tone", "sweeping generalisations", "mushy reflection"],
    promptRules: [
      "Keep the draft disciplined and professionally useful.",
      "Stay anchored to wording, documentation, or communication judgement.",
      "Do not drift into vague inspiration or empty reassurance.",
    ],
  },
  reassurance_deescalation: {
    id: "reassurance_deescalation",
    label: "Reassurance / De-escalation",
    purpose: "Reduce tension and show a calmer, safer way to handle the communication moment.",
    tone: "Steady, calming, teacher-protective, non-defensive.",
    framing: "Acknowledge tension, then gently lower the temperature.",
    platformFit: "Useful for parent conflict, complaints, and tense follow-up situations.",
    avoid: ["defensive tone", "passive-aggressive wording", "performative softness"],
    promptRules: [
      "Keep the draft calm and tension-reducing.",
      "Protect the teacher without sounding defensive or evasive.",
      "Do not let reassurance become weak, vague, or overly apologetic.",
    ],
  },
};

function buildCombinedSignalText(signal: SignalRecord): string {
  return [
    signal.sourceTitle,
    signal.manualSummary,
    signal.rawExcerpt,
    signal.scenarioAngle,
    signal.signalSubtype,
    signal.teacherPainPoint,
    signal.contentAngle,
    signal.riskToTeacher,
    signal.interpretationNotes,
    signal.signalCategory,
    signal.hookTemplateUsed,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

export function getEditorialModeDefinition(mode: EditorialMode): EditorialModeDefinition {
  return EDITORIAL_MODE_DEFINITIONS[mode];
}

export function suggestEditorialMode(signal: SignalRecord): EditorialModeSuggestion {
  if (signal.editorialMode) {
    return {
      mode: signal.editorialMode,
      reason: `This signal already has ${getEditorialModeDefinition(signal.editorialMode).label} saved on the record.`,
    };
  }

  const combined = buildCombinedSignalText(signal);

  if (
    signal.signalCategory === "Risk" ||
    combined.includes("professional risk") ||
    combined.includes("could cost") ||
    combined.includes("formal complaint") ||
    combined.includes("disciplinary")
  ) {
    return {
      mode: "risk_warning",
      reason: "The signal centres professional risk, so a calm warning frame is likely the clearest fit.",
    };
  }

  if (
    combined.includes("parent") &&
    (combined.includes("complaint") || combined.includes("after-hours") || combined.includes("tension") || combined.includes("escalat"))
  ) {
    return {
      mode: "reassurance_deescalation",
      reason: "This looks like a tense parent-communication scenario where de-escalation matters more than force.",
    };
  }

  if (
    combined.includes("document") ||
    combined.includes("documentation") ||
    combined.includes("policy") ||
    combined.includes("procedure") ||
    combined.includes("evidence") ||
    combined.includes("progress concern")
  ) {
    return {
      mode: "professional_guidance",
      reason: "The signal points toward wording, documentation, or evidence-sensitive communication, which fits professional guidance best.",
    };
  }

  if (
    combined.includes("tip") ||
    combined.includes("how should") ||
    combined.includes("how to") ||
    signal.signalCategory === "Confusion"
  ) {
    return {
      mode: "helpful_tip",
      reason: "The signal looks most useful when turned into one practical communication takeaway.",
    };
  }

  if (
    combined.includes("planning") ||
    combined.includes("workload") ||
    combined.includes("overloaded") ||
    signal.signalCategory === "Stress"
  ) {
    return {
      mode: "calm_insight",
      reason: "The signal carries pressure and workload energy, so a calmer insight frame should land better than a sharper warning.",
    };
  }

  if (
    signal.signalCategory === "Success" ||
    combined.includes("what this really shows") ||
    combined.includes("founder")
  ) {
    return {
      mode: "thought_leadership",
      reason: "This looks like a stronger fit for reflective professional perspective than tactical instruction.",
    };
  }

  if (
    combined.includes("this could happen") ||
    combined.includes("could happen to you") ||
    combined.includes("quiet risk")
  ) {
    return {
      mode: "this_could_happen_to_you",
      reason: "The current hook direction is already personal-risk oriented, so this mode should sharpen that intent without sensationalism.",
    };
  }

  return {
    mode: "awareness",
    reason: "A broad awareness frame is the safest default when the signal is useful but does not clearly demand a sharper intent profile.",
  };
}
