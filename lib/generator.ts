export function buildMockDrafts(input: {
  sourceTitle: string;
  signalCategory?: string | null;
  hookTemplateUsed?: string | null;
  contentAngle?: string | null;
}) {
  const hook = input.hookTemplateUsed ?? "Name the hidden friction";
  const angle = input.contentAngle ?? "Operators notice the pattern before the audience does.";

  return {
    xDraft: `${hook}: ${input.sourceTitle}. ${angle} This is the kind of signal worth turning into a clear teacher-facing draft.`,
    linkedInDraft: `One of the most useful internal signals this week sits in the ${(input.signalCategory ?? "Stress").toLowerCase()} category.\n\n${input.sourceTitle}\n\n${angle}\n\nThis mock draft stays intentionally fixed-format for V1 so the editorial workflow can be reviewed before generation logic expands.`,
    redditDraft: `Working through a draft signal and the pattern is pretty clear: ${input.sourceTitle}\n\nCurrent angle: ${angle}\n\nThis is placeholder generation for the internal review workflow, not a live publishing system yet.`,
    imagePrompt:
      "Create a calm editorial-style visual with soft paper textures, a structured desk layout, and subtle planning artifacts that imply an internal operations workflow.",
    videoScript: `Hook: ${hook}.\nBeat 1: Signal spotted - ${input.sourceTitle}.\nBeat 2: Why it matters - ${angle}.\nBeat 3: Close - move this into review, not autopilot.`,
    ctaOrClosingLine: "Review the signal, refine the draft, and schedule only if it still feels true.",
  };
}
