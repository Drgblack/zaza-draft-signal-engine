import type {
  ContentOpportunity,
  ContentOpportunityHookRankingItem,
  ContentOpportunityPerformanceDrivers,
} from "@/lib/content-opportunities";
import type {
  SignalRecord,
  SuggestedFormatPriority,
} from "@/types/signal";

export type ContentIntelligence = {
  recommendedFormat: string;
  hookCandidates: string[];
  selectedHook?: string | null;
  performanceDrivers: Record<string, number>;
  intendedViewerEffect?: string | null;
  suggestedCta?: string | null;
  productionComplexity?: "low" | "medium" | "high" | null;
  rationale?: string | null;
};

export type GrowthIntelligence = {
  executionPriority?: number;
  strategicValue?: number;
  riskLevel?: "low" | "medium" | "high";
  learningValue?: number;
  campaignFit?: number;
  channelFit?: Record<string, number>;
  executionPath?: "video_factory" | "campaigns" | "connect" | "hold" | "review";
  expectedOutcome?: string | null;
  reasoning?: string | null;
};

/**
 * StrategicOpportunity is the canonical enriched wrapper.
 *
 * Ownership:
 * - `base` remains the existing signal or opportunity payload and is the source of truth for
 *   operational workflow fields, persistence ids, and execution state.
 * - `contentIntelligence` owns creative decision support only: format, hooks, audience effect,
 *   CTA guidance, production complexity, and content-level rationale.
 * - `growthIntelligence` owns prioritisation and routing only: strategic value, risk, learning
 *   value, channel fit, execution path, and expected outcome.
 *
 * Must not be duplicated:
 * - Creative fields must not also be restated inside `growthIntelligence`.
 * - Priority/risk/routing fields must not also be restated inside `contentIntelligence`.
 * - The same explanation should not be copied into both `rationale` and `reasoning`; the former
 *   is creative/editorial reasoning and the latter is growth/execution reasoning.
 */
export type StrategicOpportunity = {
  id: string;
  base: unknown;
  contentIntelligence?: ContentIntelligence;
  growthIntelligence?: GrowthIntelligence;
};

/**
 * Transitional source shape for the architecture-alignment phase.
 *
 * Today, content-intelligence fields primarily live on `ContentOpportunity`, while some earlier
 * equivalents still exist on `SignalRecord`. This helper accepts either shape so call sites can
 * migrate gradually without forcing a refactor now.
 */
export type ContentIntelligenceSource = {
  recommendedFormat?: ContentOpportunity["recommendedFormat"] | string | null;
  hookOptions?: string[] | null;
  hookRanking?: ContentOpportunityHookRankingItem[] | null;
  performanceDrivers?: ContentOpportunityPerformanceDrivers | null;
  intendedViewerEffect?: string | null;
  suggestedCTA?: string | null;
  productionComplexity?: "low" | "medium" | "high" | null;
  recommendedAngle?: string | null;
  recommendedHookDirection?: string | null;
  whyNow?: string | null;
  riskSummary?: string | null;
  selectedVideoBrief?: ContentOpportunity["selectedVideoBrief"] | null;
} &
  Partial<
    Pick<
      SignalRecord,
      | "suggestedFormatPriority"
      | "hookTemplateUsed"
      | "ctaOrClosingLine"
      | "contentAngle"
      | "interpretationNotes"
      | "whySelected"
    >
  > & {
    selectedHook?: string | null;
    rationale?: string | null;
    suggestedCta?: string | null;
    hookCandidates?: string[] | null;
  };

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeStrings(values: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) {
      continue;
    }

    unique.add(normalized);
  }

  return [...unique];
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function mapSuggestedFormatPriority(
  suggestedFormatPriority: SuggestedFormatPriority | null | undefined,
): string | null {
  switch (suggestedFormatPriority) {
    case "Video":
      return "short_video";
    case "Carousel":
      return "carousel";
    case "Multi-format":
      return "multi_asset";
    case "Text":
    case "Image":
      return "text";
    default:
      return null;
  }
}

function normalizeHookRankingHooks(
  hookRanking: ContentOpportunityHookRankingItem[] | null | undefined,
): string[] {
  if (!hookRanking?.length) {
    return [];
  }

  return normalizeStrings(hookRanking.map((item) => item.hook));
}

function normalizePerformanceDrivers(
  performanceDrivers: ContentOpportunityPerformanceDrivers | null | undefined,
): Record<string, number> {
  if (!performanceDrivers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(performanceDrivers).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function buildContentRationale(signal: ContentIntelligenceSource): string | null {
  return firstNonEmpty(
    signal.rationale,
    signal.recommendedHookDirection,
    signal.whyNow,
    signal.riskSummary,
    signal.contentAngle,
    signal.interpretationNotes,
    signal.whySelected,
  );
}

/**
 * Maps the current scattered content-intelligence fields into the canonical contract.
 *
 * Current field locations:
 * - `ContentOpportunity.recommendedFormat`
 * - `ContentOpportunity.hookOptions`
 * - `ContentOpportunity.hookRanking`
 * - `ContentOpportunity.performanceDrivers`
 * - `ContentOpportunity.intendedViewerEffect`
 * - `ContentOpportunity.suggestedCTA`
 * - `ContentOpportunity.productionComplexity`
 *
 * Transitional/raw signal fallbacks:
 * - `SignalRecord.suggestedFormatPriority`
 * - `SignalRecord.hookTemplateUsed`
 * - `SignalRecord.ctaOrClosingLine`
 * - `SignalRecord.contentAngle`
 * - `SignalRecord.interpretationNotes`
 * - `SignalRecord.whySelected`
 *
 * Important:
 * - This helper is intentionally read-only and architecture-alignment focused.
 * - It does not mutate the source object and does not become the source of truth itself.
 * - It does not infer growth-level fields; those belong to `GrowthIntelligence`.
 */
export function buildContentIntelligenceFromSignal(
  signal: ContentIntelligenceSource,
): ContentIntelligence {
  const hookCandidates = normalizeStrings([
    ...(signal.hookCandidates ?? []),
    ...normalizeHookRankingHooks(signal.hookRanking),
    ...(signal.hookOptions ?? []),
    signal.hookTemplateUsed,
  ]);

  return {
    recommendedFormat:
      firstNonEmpty(
        signal.recommendedFormat,
        mapSuggestedFormatPriority(signal.suggestedFormatPriority),
      ) ?? "text",
    hookCandidates,
    /**
     * Do not infer from `selectedHookId` here.
     * The current opportunity model stores an id, not the selected hook text, so mirroring it
     * would duplicate selection state without preserving the canonical value.
     */
    selectedHook: firstNonEmpty(signal.selectedHook, signal.selectedVideoBrief?.hook),
    performanceDrivers: normalizePerformanceDrivers(signal.performanceDrivers),
    intendedViewerEffect: normalizeText(signal.intendedViewerEffect),
    suggestedCta: firstNonEmpty(signal.suggestedCta, signal.suggestedCTA, signal.ctaOrClosingLine),
    productionComplexity: signal.productionComplexity ?? null,
    rationale: buildContentRationale(signal),
  };
}
