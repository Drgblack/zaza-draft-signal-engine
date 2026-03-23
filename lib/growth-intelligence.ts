import {
  buildContentIntelligenceFromSignal,
  type ContentIntelligence,
  type ContentIntelligenceSource,
  type GrowthIntelligence,
} from "@/lib/strategic-intelligence-types";
import {
  getGrowthLearningAdjustmentSync,
  type GrowthLearningAdjustment,
  inferHookType,
} from "@/lib/learning-loop";
import type { SignalRecord } from "@/types/signal";

export interface GrowthIntelligenceHistoryEntry {
  topicFingerprint?: string | null;
  recommendedFormat?: string | null;
  intendedViewerEffect?: string | null;
}

export interface GrowthIntelligenceInput {
  signal: Partial<SignalRecord> & ContentIntelligenceSource;
  contentIntelligence?: ContentIntelligence | null;
  historicalExecutions?: GrowthIntelligenceHistoryEntry[] | null;
  activeCampaignIds?: string[] | null;
  campaignsExist?: boolean;
  learningAdjustment?: GrowthLearningAdjustment | null;
}

export interface DetermineExecutionPathInput extends GrowthIntelligenceInput {
  executionPriority?: number;
  riskLevel?: GrowthIntelligence["riskLevel"];
  learningValue?: number;
  campaignFit?: number;
  strategicValue?: number;
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeLower(value: string | null | undefined): string {
  return normalizeText(value).toLowerCase();
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function buildSourceText(input: GrowthIntelligenceInput["signal"]): string {
  return [
    input.sourceTitle,
    input.rawExcerpt,
    input.manualSummary,
    input.scenarioAngle,
    input.signalSubtype,
    input.emotionalPattern,
    input.teacherPainPoint,
    input.riskToTeacher,
    input.interpretationNotes,
    input.hookTemplateUsed,
    input.contentAngle,
    input.whySelected,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildTopicFingerprint(input: GrowthIntelligenceInput["signal"]): string {
  const text = [
    input.teacherPainPoint,
    input.contentAngle,
    input.signalSubtype,
    input.sourceTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreImpactPotential(input: GrowthIntelligenceInput["signal"], ci: ContentIntelligence): number {
  const severity = Number(input.severityScore ?? 1);
  const severityScore =
    severity >= 3 ? 90 : severity === 2 ? 65 : 40;
  const stakesScore = clamp((ci.performanceDrivers.stakes ?? 3) * 20);
  const audienceProxyScore = clamp(
    ((ci.performanceDrivers.generalistAppeal ?? 3) * 0.6 +
      (ci.performanceDrivers.viewerConnection ?? 3) * 0.4) *
      20,
  );

  return clamp(severityScore * 0.4 + stakesScore * 0.35 + audienceProxyScore * 0.25);
}

function scoreRiskLevel(input: GrowthIntelligenceInput["signal"], ci: ContentIntelligence): {
  riskLevel: NonNullable<GrowthIntelligence["riskLevel"]>;
  riskScore: number;
} {
  const sourceText = buildSourceText(input);
  let topicSensitivity = 15;
  let toneSensitivity = 10;

  if (input.signalCategory === "Risk" || input.signalCategory === "Conflict") {
    topicSensitivity += 25;
  }

  if (Number(input.severityScore ?? 1) >= 3) {
    topicSensitivity += 20;
  }

  if (
    includesAny(sourceText, [
      "complaint",
      "safeguarding",
      "disciplinary",
      "legal",
      "job",
      "policy",
      "escalate",
      "parent",
    ])
  ) {
    topicSensitivity += 20;
  }

  if (ci.intendedViewerEffect === "caution") {
    toneSensitivity += 20;
  }

  if ((ci.performanceDrivers.stakes ?? 0) >= 4) {
    toneSensitivity += 15;
  }

  if (
    includesAny(sourceText, ["cost you your job", "quiet risk", "escalate", "go wrong"])
  ) {
    toneSensitivity += 15;
  }

  const riskScore = clamp(topicSensitivity * 0.6 + toneSensitivity * 0.4);

  if (riskScore >= 70) {
    return { riskLevel: "high", riskScore };
  }

  if (riskScore >= 45) {
    return { riskLevel: "medium", riskScore };
  }

  return { riskLevel: "low", riskScore };
}

function scoreLearningValue(
  input: GrowthIntelligenceInput,
  ci: ContentIntelligence,
): number {
  const noveltyScore =
    typeof input.signal.signalNoveltyScore === "number"
      ? clamp(input.signal.signalNoveltyScore)
      : 55;
  const similarityPenalty =
    typeof input.signal.similarityToExistingContent === "number"
      ? clamp(input.signal.similarityToExistingContent)
      : 35;
  const baseVariationScore = clamp(100 - similarityPenalty);
  const topicFingerprint = buildTopicFingerprint(input.signal);
  const history = input.historicalExecutions ?? [];

  if (history.length === 0) {
    return clamp(noveltyScore * 0.6 + baseVariationScore * 0.4);
  }

  const matchingTopicCount = history.filter(
    (entry) => normalizeLower(entry.topicFingerprint) === topicFingerprint,
  ).length;
  const matchingFormatCount = history.filter(
    (entry) => normalizeLower(entry.recommendedFormat) === normalizeLower(ci.recommendedFormat),
  ).length;
  const matchingViewerEffectCount = history.filter(
    (entry) =>
      normalizeLower(entry.intendedViewerEffect) === normalizeLower(ci.intendedViewerEffect),
  ).length;

  const repeatedPatternPenalty = clamp(
    matchingTopicCount * 18 + matchingFormatCount * 10 + matchingViewerEffectCount * 8,
  );
  const variationScore = clamp(baseVariationScore + 25 - repeatedPatternPenalty);

  return clamp(noveltyScore * 0.5 + variationScore * 0.5);
}

function scoreCampaignFit(input: GrowthIntelligenceInput["signal"], campaigns: {
  activeCampaignIds: string[];
  campaignsExist: boolean;
}): number | undefined {
  if (!campaigns.campaignsExist) {
    return undefined;
  }

  if (input.campaignId && campaigns.activeCampaignIds.includes(input.campaignId)) {
    return 92;
  }

  if (input.campaignId) {
    return 70;
  }

  return 38;
}

function scoreChannelFit(
  input: GrowthIntelligenceInput["signal"],
  ci: ContentIntelligence,
): Record<string, number> {
  const fit = {
    x: 55,
    linkedin: 55,
    reddit: 55,
  };

  switch (input.platformPriority) {
    case "X First":
      fit.x = 90;
      fit.linkedin = 62;
      fit.reddit = 58;
      break;
    case "LinkedIn First":
      fit.linkedin = 90;
      fit.x = 60;
      fit.reddit = 52;
      break;
    case "Reddit First":
      fit.reddit = 88;
      fit.x = 58;
      fit.linkedin = 60;
      break;
    case "Multi-platform":
      fit.x = 74;
      fit.linkedin = 74;
      fit.reddit = 70;
      break;
    default:
      break;
  }

  if (ci.recommendedFormat === "carousel") {
    fit.linkedin = clamp(fit.linkedin + 8);
  }

  if (ci.recommendedFormat === "short_video") {
    fit.x = clamp(fit.x + 6);
      fit.linkedin = clamp(fit.linkedin + 4);
  }

  if (ci.recommendedFormat === "multi_asset") {
    fit.x = clamp(fit.x + 4);
    fit.linkedin = clamp(fit.linkedin + 4);
    fit.reddit = clamp(fit.reddit + 4);
  }

  return fit;
}

function scoreProductionCostSensitivity(ci: ContentIntelligence): number {
  switch (ci.productionComplexity) {
    case "high":
      return 80;
    case "medium":
      return 45;
    case "low":
    default:
      return 15;
  }
}

function primaryHookType(ci: ContentIntelligence): string | null {
  return inferHookType(ci.selectedHook ?? ci.hookCandidates[0] ?? null);
}

function isContentReadyForVideoFactory(ci: ContentIntelligence): boolean {
  if (ci.recommendedFormat !== "short_video" && ci.recommendedFormat !== "multi_asset") {
    return false;
  }

  return (
    ci.hookCandidates.length > 0 ||
    Boolean(ci.selectedHook) ||
    Object.keys(ci.performanceDrivers).length > 0 ||
    Boolean(ci.suggestedCta) ||
    Boolean(ci.intendedViewerEffect)
  );
}

export function determineExecutionPath(
  input: DetermineExecutionPathInput,
): GrowthIntelligence["executionPath"] {
  const contentIntelligence =
    input.contentIntelligence ?? buildContentIntelligenceFromSignal(input.signal);
  const riskLevel =
    input.riskLevel ??
    scoreRiskLevel(input.signal, contentIntelligence).riskLevel;
  const campaigns = {
    activeCampaignIds: input.activeCampaignIds ?? [],
    campaignsExist:
      input.campaignsExist ??
      Boolean((input.activeCampaignIds ?? []).length || input.signal.campaignId),
  };
  const campaignFit =
    input.campaignFit ?? scoreCampaignFit(input.signal, campaigns);
  const learningValue =
    input.learningValue ?? scoreLearningValue(input, contentIntelligence);
  const impactPotential = scoreImpactPotential(input.signal, contentIntelligence);
  const bestChannelFit = Math.max(
    ...Object.values(scoreChannelFit(input.signal, contentIntelligence)),
  );
  const strategicValue =
    input.strategicValue ??
    clamp(
      impactPotential * 0.65 +
        bestChannelFit * 0.2 +
        (typeof campaignFit === "number" ? campaignFit : 55) * 0.15,
    );
  const productionCostSensitivity = scoreProductionCostSensitivity(contentIntelligence);
  let executionPriority =
    input.executionPriority ??
    (impactPotential * 0.4 +
      strategicValue * 0.2 +
      learningValue * 0.2 +
      bestChannelFit * 0.1 +
      (typeof campaignFit === "number" ? campaignFit : 50) * 0.1);

  if (input.executionPriority === undefined) {
    if (riskLevel === "medium") {
      executionPriority -= 12;
    }

    if (riskLevel === "high") {
      executionPriority -= 28;
    }

    if (productionCostSensitivity >= 75) {
      executionPriority -= 10;
    } else if (productionCostSensitivity >= 40) {
      executionPriority -= 5;
    }

    if (impactPotential >= 75 && riskLevel === "low") {
      executionPriority += 8;
    }

    if (learningValue >= 75) {
      executionPriority += 6;
    }
  }

  executionPriority = clamp(executionPriority);

  if (riskLevel === "high") {
    return "review";
  }

  if (executionPriority < 45) {
    return "hold";
  }

  if (executionPriority >= 72 && isContentReadyForVideoFactory(contentIntelligence)) {
    return "video_factory";
  }

  if (executionPriority >= 55 && typeof campaignFit === "number" && campaignFit >= 70) {
    return "campaigns";
  }

  if (learningValue >= 75 || (learningValue >= 65 && strategicValue >= 70)) {
    return "connect";
  }

  return "hold";
}

function expectedOutcomeLabel(executionPriority: number, riskLevel: NonNullable<GrowthIntelligence["riskLevel"]>) {
  if (riskLevel === "high") {
    return "Promising signal, but sensitivity is high enough that it should be handled carefully.";
  }

  if (executionPriority >= 80) {
    return "Strong execution candidate with clear upside and manageable risk.";
  }

  if (executionPriority >= 60) {
    return "Solid execution candidate worth testing in the near term.";
  }

  return "Useful candidate, but value is more exploratory or constrained right now.";
}

function buildReasoning(input: {
  impactPotential: number;
  riskLevel: NonNullable<GrowthIntelligence["riskLevel"]>;
  learningValue: number;
  campaignFit?: number;
  productionCostSensitivity: number;
  executionPriority: number;
  executionPath: GrowthIntelligence["executionPath"];
  learningReason?: string | null;
}) {
  const parts = [
    `Impact potential ${input.impactPotential}/100`,
    `risk ${input.riskLevel}`,
    `learning value ${input.learningValue}/100`,
  ];

  if (typeof input.campaignFit === "number") {
    parts.push(`campaign fit ${input.campaignFit}/100`);
  }

  parts.push(`cost sensitivity ${input.productionCostSensitivity}/100`);
  parts.push(`execution priority ${input.executionPriority}/100`);
  parts.push(`execution path ${input.executionPath}`);
  if (input.learningReason) {
    parts.push(`learning loop ${input.learningReason}`);
  }

  return parts.join("; ");
}

export function buildGrowthIntelligence(input: GrowthIntelligenceInput): GrowthIntelligence {
  const contentIntelligence =
    input.contentIntelligence ?? buildContentIntelligenceFromSignal(input.signal);
  const impactPotential = scoreImpactPotential(input.signal, contentIntelligence);
  const { riskLevel } = scoreRiskLevel(input.signal, contentIntelligence);
  const campaigns = {
    activeCampaignIds: input.activeCampaignIds ?? [],
    campaignsExist:
      input.campaignsExist ??
      Boolean((input.activeCampaignIds ?? []).length || input.signal.campaignId),
  };
  const campaignFit = scoreCampaignFit(input.signal, campaigns);
  const channelFit = scoreChannelFit(input.signal, contentIntelligence);
  const productionCostSensitivity = scoreProductionCostSensitivity(contentIntelligence);
  const bestChannelFit = Math.max(...Object.values(channelFit));
  const strategicValue = clamp(
    impactPotential * 0.65 +
      bestChannelFit * 0.2 +
      (typeof campaignFit === "number" ? campaignFit : 55) * 0.15,
  );
  const baseLearningValue = scoreLearningValue(input, contentIntelligence);
  const provisionalExecutionPath = determineExecutionPath({
    ...input,
    contentIntelligence,
    riskLevel,
    learningValue: baseLearningValue,
    campaignFit,
    strategicValue,
  });
  const learningAdjustment = getGrowthLearningAdjustmentSync({
    format: contentIntelligence.recommendedFormat,
    hookType: primaryHookType(contentIntelligence),
    executionPath: provisionalExecutionPath ?? null,
  });
  const appliedLearningAdjustment =
    input.learningAdjustment ??
    learningAdjustment;
  const learningValue = clamp(
    baseLearningValue + appliedLearningAdjustment.learningValueDelta,
  );

  let executionPriority =
    impactPotential * 0.4 +
    strategicValue * 0.2 +
    learningValue * 0.2 +
    bestChannelFit * 0.1 +
    (typeof campaignFit === "number" ? campaignFit : 50) * 0.1;

  if (riskLevel === "medium") {
    executionPriority -= 12;
  }

  if (riskLevel === "high") {
    executionPriority -= 28;
  }

  if (productionCostSensitivity >= 75) {
    executionPriority -= 10;
  } else if (productionCostSensitivity >= 40) {
    executionPriority -= 5;
  }

  if (impactPotential >= 75 && riskLevel === "low") {
    executionPriority += 8;
  }

  if (learningValue >= 75) {
    executionPriority += 6;
  }

  executionPriority += appliedLearningAdjustment.priorityDelta;
  executionPriority = clamp(executionPriority);
  const executionPath = determineExecutionPath({
    ...input,
    contentIntelligence,
    executionPriority,
    riskLevel,
    learningValue,
    campaignFit,
    strategicValue,
  });

  return {
    executionPriority,
    strategicValue,
    riskLevel,
    learningValue,
    campaignFit,
    channelFit,
    executionPath,
    expectedOutcome: expectedOutcomeLabel(executionPriority, riskLevel),
    reasoning: buildReasoning({
      impactPotential,
      riskLevel,
      learningValue,
      campaignFit,
      productionCostSensitivity,
      executionPriority,
      executionPath,
      learningReason: appliedLearningAdjustment.reason,
    }),
  };
}
