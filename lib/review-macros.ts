import { z } from "zod";

export const REVIEW_MACRO_IDS = [
  "approve_keep_package",
  "approve_soften_cta",
  "hold_for_destination_fix",
  "convert_to_experiment",
  "evergreen_later",
  "approve_with_safe_tone",
] as const;

export const reviewMacroIdSchema = z.enum(REVIEW_MACRO_IDS);

export type ReviewMacroId = (typeof REVIEW_MACRO_IDS)[number];

export type ReviewMacroAction =
  | { type: "set_status"; value: "ready" | "needs_edit" | "skip" }
  | { type: "preserve_package" }
  | { type: "modify_cta"; mode: "soften" }
  | { type: "modify_tone"; mode: "safer" }
  | { type: "append_note"; text: string }
  | { type: "route_to_experiment" }
  | { type: "mark_evergreen_later" };

export interface ReviewMacroDefinition {
  macroId: ReviewMacroId;
  label: string;
  description: string;
  actions: ReviewMacroAction[];
}

export interface AppliedReviewMacro {
  macroId: ReviewMacroId;
  platform: "x" | "linkedin" | "reddit";
  appliedAt: string;
}

function replaceLastNonEmptyLine(text: string, updater: (line: string) => string): string {
  const lines = text.split(/\r?\n/);
  const index = [...lines].reverse().findIndex((line) => line.trim().length > 0);
  if (index < 0) {
    return text;
  }

  const targetIndex = lines.length - index - 1;
  const nextLine = updater(lines[targetIndex].trim());
  if (!nextLine || nextLine === lines[targetIndex].trim()) {
    return text;
  }

  lines[targetIndex] = nextLine;
  return lines.join("\n");
}

export function softenToneText(text: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\balways\b/gi, "often"],
    [/\bnever\b/gi, "rarely"],
    [/\bclearly\b/gi, ""],
    [/\bobviously\b/gi, ""],
    [/\bdefinitely\b/gi, ""],
    [/\bguarantee\b/gi, "can support"],
    [/\beveryone\b/gi, "many teachers"],
    [/\bnobody\b/gi, "very few people"],
    [/\bmust\b/gi, "may need to"],
    [/\burgent\b/gi, "important"],
    [/\bimmediately\b/gi, "soon"],
  ];

  let nextText = text;
  for (const [pattern, replacement] of replacements) {
    nextText = nextText.replace(pattern, replacement);
  }

  nextText = nextText.replace(/!/g, ".").replace(/[ \t]{2,}/g, " ").replace(/\s+\./g, ".").trim();
  return nextText || text;
}

export function softenCtaText(text: string): string {
  return replaceLastNonEmptyLine(text, (line) => {
    let nextLine = line;
    nextLine = nextLine.replace(/\bbook a call\b/gi, "take a look");
    nextLine = nextLine.replace(/\bstart free\b/gi, "see if it helps");
    nextLine = nextLine.replace(/\bsign up\b/gi, "learn more");
    nextLine = nextLine.replace(/\bdm me\b/gi, "message me if helpful");
    nextLine = nextLine.replace(/\bmessage me\b/gi, "message me if helpful");
    nextLine = nextLine.replace(/\btry it now\b/gi, "take a look if useful");
    nextLine = nextLine.replace(/\bgrab\b/gi, "save");
    nextLine = nextLine.replace(/\bclick here\b/gi, "learn more here");
    return nextLine.trim() || line;
  });
}

export function appendReviewMacroNote(current: string, addition: string): string {
  const normalizedCurrent = current.trim();
  const normalizedAddition = addition.trim();

  if (!normalizedAddition) {
    return current;
  }

  if (!normalizedCurrent) {
    return normalizedAddition;
  }

  if (normalizedCurrent.includes(normalizedAddition)) {
    return normalizedCurrent;
  }

  return `${normalizedCurrent}\n\n${normalizedAddition}`;
}

export const REVIEW_MACROS: ReviewMacroDefinition[] = [
  {
    macroId: "approve_keep_package",
    label: "Approve and keep package",
    description: "Marks the focused draft ready without changing the current package.",
    actions: [
      { type: "preserve_package" },
      { type: "set_status", value: "ready" },
    ],
  },
  {
    macroId: "approve_soften_cta",
    label: "Approve but soften CTA",
    description: "Keeps the structure, reduces CTA pressure, then marks the draft ready.",
    actions: [
      { type: "modify_cta", mode: "soften" },
      { type: "set_status", value: "ready" },
    ],
  },
  {
    macroId: "hold_for_destination_fix",
    label: "Hold for destination fix",
    description: "Marks the draft needs edit so destination or package alignment can be repaired.",
    actions: [
      { type: "set_status", value: "needs_edit" },
      { type: "append_note", text: "Hold for destination fix." },
    ],
  },
  {
    macroId: "convert_to_experiment",
    label: "Convert to experiment",
    description: "Routes the candidate into experiment follow-up instead of forcing approval.",
    actions: [
      { type: "set_status", value: "needs_edit" },
      { type: "append_note", text: "Convert to experiment." },
      { type: "route_to_experiment" },
    ],
  },
  {
    macroId: "evergreen_later",
    label: "Evergreen later",
    description: "Skips this week for now and preserves the candidate as a later-use idea.",
    actions: [
      { type: "set_status", value: "skip" },
      { type: "append_note", text: "Evergreen later." },
      { type: "mark_evergreen_later" },
    ],
  },
  {
    macroId: "approve_with_safe_tone",
    label: "Approve with safer tone",
    description: "Softens absolute or promotional phrasing, then marks the draft ready.",
    actions: [
      { type: "modify_tone", mode: "safer" },
      { type: "set_status", value: "ready" },
    ],
  },
];

const reviewMacroMap = new Map(REVIEW_MACROS.map((macro) => [macro.macroId, macro]));

export function getReviewMacroDefinition(macroId: ReviewMacroId): ReviewMacroDefinition {
  return reviewMacroMap.get(macroId) ?? REVIEW_MACROS[0];
}

export function formatReviewMacroActions(actions: ReviewMacroAction[]): string[] {
  return actions.map((action) => {
    switch (action.type) {
      case "set_status":
        return action.value === "ready"
          ? "mark ready"
          : action.value === "needs_edit"
            ? "mark needs edit"
            : "mark skip";
      case "preserve_package":
        return "keep package";
      case "modify_cta":
        return "soften CTA";
      case "modify_tone":
        return "soften tone";
      case "append_note":
        return action.text.replace(/\.$/, "");
      case "route_to_experiment":
        return "route to experiments";
      case "mark_evergreen_later":
        return "mark evergreen later";
      default:
        return "apply macro";
    }
  });
}
