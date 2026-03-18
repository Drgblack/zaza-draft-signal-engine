import type {
  HookTemplate,
  PlatformPriority,
  RelevanceToZazaDraft,
  SignalCategory,
  SuggestedFormatPriority,
} from "@/types/signal";

export interface PatternRule {
  label: string;
  patterns: string[];
  weight: number;
}

export const CATEGORY_RULES: Record<SignalCategory, PatternRule[]> = {
  Risk: [
    {
      label: "job-risk escalation",
      patterns: ["dismissal", "fired", "terminated", "termination", "disciplinary", "hearing", "tribunal", "investigation"],
      weight: 5,
    },
    {
      label: "formal complaint pressure",
      patterns: ["formal complaint", "complaint", "grievance", "legal", "lawsuit", "hr", "suspension", "warning"],
      weight: 4,
    },
    {
      label: "policy and safeguarding exposure",
      patterns: ["safeguarding", "policy violation", "misconduct", "recorded", "reported", "union"],
      weight: 4,
    },
  ],
  Stress: [
    {
      label: "burnout load",
      patterns: ["burnout", "overwhelm", "overwhelmed", "exhausted", "drained", "fatigue", "leaving profession", "quitting"],
      weight: 4,
    },
    {
      label: "always-on pressure",
      patterns: ["after-hours", "always on", "emails", "email", "messages", "admin burden", "too much admin", "emotional labor"],
      weight: 3,
    },
    {
      label: "planning strain",
      patterns: ["lesson plan", "planning", "prep", "cognitive load", "checked out", "workload"],
      weight: 2,
    },
  ],
  Conflict: [
    {
      label: "parent tension",
      patterns: ["parent dispute", "parent complaint", "parent expectations", "angry parent", "pushback", "backlash"],
      weight: 4,
    },
    {
      label: "relationship breakdown",
      patterns: ["disagreement", "argument", "misunderstanding", "tension", "confrontation", "hostile"],
      weight: 3,
    },
    {
      label: "leadership friction",
      patterns: ["admin", "leadership", "district", "manager", "principal"],
      weight: 2,
    },
  ],
  Confusion: [
    {
      label: "unclear expectations",
      patterns: ["unclear", "confusing", "confusion", "uncertain", "uncertainty", "vague", "mixed messages", "inconsistent"],
      weight: 4,
    },
    {
      label: "process ambiguity",
      patterns: ["don't know", "no idea", "onboarding", "first week", "structure", "expectations", "process", "how to"],
      weight: 3,
    },
  ],
  Success: [
    {
      label: "positive recognition",
      patterns: ["success", "celebrating", "recognition", "award", "improved", "win", "confidence", "breakthrough"],
      weight: 4,
    },
    {
      label: "workflow relief",
      patterns: ["smoother", "reusable", "routine", "easier", "better system", "relief", "worked", "positive"],
      weight: 3,
    },
  ],
};

export const SEVERITY_THREE_PATTERNS = [
  "dismissal",
  "fired",
  "terminated",
  "disciplinary",
  "hearing",
  "tribunal",
  "investigation",
  "legal",
  "lawsuit",
  "safeguarding",
  "misconduct",
  "suspension",
];

export const SEVERITY_TWO_PATTERNS = [
  "complaint",
  "grievance",
  "burnout",
  "overwhelmed",
  "exhausted",
  "leaving profession",
  "after-hours",
  "always on",
  "pushback",
  "angry",
  "hostile",
  "emotional labor",
  "admin burden",
];

export const SUBTYPE_RULES: Record<SignalCategory, Array<{ label: string; patterns: string[] }>> = {
  Risk: [
    { label: "Disciplinary risk", patterns: ["disciplinary", "hearing", "warning", "suspension"] },
    { label: "Complaint escalation", patterns: ["complaint", "grievance", "tribunal", "investigation"] },
    { label: "Safeguarding exposure", patterns: ["safeguarding", "policy violation", "misconduct"] },
    { label: "Reputational threat", patterns: ["reported", "recorded", "public", "backlash"] },
  ],
  Stress: [
    { label: "Burnout load", patterns: ["burnout", "exhausted", "drained", "fatigue"] },
    { label: "Admin overload", patterns: ["admin burden", "paperwork", "emails", "messages"] },
    { label: "Planning fatigue", patterns: ["lesson plan", "planning", "prep"] },
    { label: "Always-on expectations", patterns: ["after-hours", "always on", "immediate answers"] },
  ],
  Conflict: [
    { label: "Parent tension", patterns: ["parent", "family", "complaint", "expectations"] },
    { label: "Leadership friction", patterns: ["admin", "principal", "district", "manager"] },
    { label: "Communication breakdown", patterns: ["misunderstanding", "argument", "hostile", "pushback"] },
  ],
  Confusion: [
    { label: "Expectation mismatch", patterns: ["unclear", "expectations", "mixed messages", "inconsistent"] },
    { label: "Workflow uncertainty", patterns: ["process", "structure", "onboarding", "first week", "how to"] },
  ],
  Success: [
    { label: "Workflow improvement", patterns: ["smoother", "reusable", "routine", "better system"] },
    { label: "Recognition signal", patterns: ["recognition", "award", "celebrating", "win"] },
  ],
};

export const EMOTIONAL_PATTERNS: Record<SignalCategory, string> = {
  Risk: "Anxiety under professional threat",
  Stress: "Exhaustion and sustained strain",
  Conflict: "Tension and emotional defensiveness",
  Confusion: "Uncertainty and hesitation",
  Success: "Relief and regained confidence",
};

export const CATEGORY_DEFAULTS: Record<
  SignalCategory,
  {
    relevance: RelevanceToZazaDraft;
    platformPriority: PlatformPriority;
    formatPriority: SuggestedFormatPriority;
    hookTemplate: HookTemplate;
    contentAngle: string;
  }
> = {
  Risk: {
    relevance: "High",
    platformPriority: "LinkedIn First",
    formatPriority: "Text",
    hookTemplate: "This could cost you your job",
    contentAngle: "Frame the signal as a professional-risk pattern hidden inside routine school communication.",
  },
  Stress: {
    relevance: "High",
    platformPriority: "LinkedIn First",
    formatPriority: "Text",
    hookTemplate: "This sounds fine… but it isn’t",
    contentAngle: "Expose the invisible workload underneath the signal and translate it into human cost.",
  },
  Conflict: {
    relevance: "High",
    platformPriority: "Reddit First",
    formatPriority: "Carousel",
    hookTemplate: "What this really shows",
    contentAngle: "Use the signal to show how misaligned expectations turn ordinary communication into friction.",
  },
  Confusion: {
    relevance: "Medium",
    platformPriority: "Reddit First",
    formatPriority: "Text",
    hookTemplate: "Quiet risk teachers miss",
    contentAngle: "Treat the signal as a clarity failure that creates avoidable professional drag.",
  },
  Success: {
    relevance: "Medium",
    platformPriority: "LinkedIn First",
    formatPriority: "Carousel",
    hookTemplate: "Before / after rewrite",
    contentAngle: "Position the signal as proof that better systems reduce emotional load, not just effort.",
  },
};
