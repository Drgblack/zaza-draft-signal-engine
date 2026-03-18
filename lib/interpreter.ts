import { DEFAULT_INTERPRETATION } from "@/types/api";
import type { SignalCategory } from "@/types/signal";

export function buildMockInterpretation(input: {
  sourceTitle?: string;
  rawExcerpt?: string | null;
  manualSummary?: string | null;
  signalCategory?: string | null;
}) {
  const content = `${input.sourceTitle ?? ""} ${input.rawExcerpt ?? ""} ${input.manualSummary ?? ""}`.toLowerCase();
  const seededCategory = input.signalCategory as SignalCategory | null | undefined;

  const category: SignalCategory =
    seededCategory ??
    (content.includes("burnout") || content.includes("overwhelm")
      ? "Stress"
      : content.includes("conflict")
        ? "Conflict"
        : DEFAULT_INTERPRETATION.signalCategory);

  return {
    ...DEFAULT_INTERPRETATION,
    signalCategory: category,
    interpretationNotes:
      "Mock interpretation only. This route is intentionally structured for future model-backed classification without calling an LLM in V1.",
  };
}
