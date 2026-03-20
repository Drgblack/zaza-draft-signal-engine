import type { AttributionRecord } from "@/lib/attribution";
import { getAudienceMemorySegment, type AudienceMemoryState } from "@/lib/audience-memory";
import type { CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import type { ConflictAssessment } from "@/lib/conflicts";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { getPrimaryLinkVariant, buildSignalPublishPrepBundle } from "@/lib/publish-prep";
import type { PostingLogEntry, PostingPlatform } from "@/lib/posting-memory";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import type { RevenueSignal } from "@/lib/revenue-signals";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import { getSiteLinkById } from "@/lib/site-links";
import type { SignalRecord } from "@/types/signal";

export const CONVERSION_INTENT_POSTURES = [
  "awareness_first",
  "trust_first",
  "soft_conversion",
  "direct_conversion",
] as const;

export type ConversionIntentPosture = (typeof CONVERSION_INTENT_POSTURES)[number];

export interface ConversionIntentAssessment {
  posture: ConversionIntentPosture;
  whyChosen: string[];
  cautionNotes: string[];
  rankAdjustment: number;
  preferredCtaVariant: "primary" | "soft";
  preferredDestinationIds: string[];
}

export interface ConversionIntentInsights {
  postureRows: Array<{
    posture: ConversionIntentPosture;
    label: string;
    count: number;
    strongCount: number;
    revenueCount: number;
  }>;
  platformRows: Array<{
    label: string;
    posture: ConversionIntentPosture;
    count: number;
  }>;
  summary: string[];
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function getPrimaryPlatform(signal: SignalRecord): PostingPlatform {
  if (signal.platformPriority === "X First") {
    return "x";
  }

  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "linkedin";
}

function getCurrentDestinationId(signal: SignalRecord): string | null {
  const bundle = buildSignalPublishPrepBundle(signal);
  const primaryPackage =
    bundle?.packages.find((pkg) => pkg.platform === getPrimaryPlatform(signal)) ?? bundle?.packages[0] ?? null;
  const primaryLink = primaryPackage ? getPrimaryLinkVariant(primaryPackage) : null;
  return primaryLink?.siteLinkId ?? primaryPackage?.siteLinkId ?? null;
}

function getCurrentDestinationLabel(signal: SignalRecord): string | null {
  const destinationId = getCurrentDestinationId(signal);
  return getSiteLinkById(destinationId)?.label ?? null;
}

function includesAny(value: string, snippets: string[]) {
  const haystack = value.toLowerCase();
  return snippets.some((snippet) => haystack.includes(snippet.toLowerCase()));
}

function getPostureLabel(posture: ConversionIntentPosture): string {
  switch (posture) {
    case "awareness_first":
      return "Awareness-first";
    case "trust_first":
      return "Trust-first";
    case "soft_conversion":
      return "Soft conversion";
    case "direct_conversion":
    default:
      return "Direct conversion";
  }
}

function buildSupportCounts(input: {
  signal: SignalRecord;
  platform: PostingPlatform;
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
}) {
  const destinationLabel = getCurrentDestinationLabel(input.signal);
  const editorialMode = input.signal.editorialMode;

  const attributionSupport = (input.attributionRecords ?? []).filter(
    (record) =>
      record.signalId !== input.signal.recordId &&
      record.platform === input.platform &&
      (destinationLabel ? record.destination === destinationLabel : true) &&
      (editorialMode ? record.editorialMode === editorialMode : true) &&
      (record.outcomeType === "lead" || record.outcomeType === "signup") &&
      (record.outcomeStrength === "medium" || record.outcomeStrength === "strong"),
  ).length;

  const revenueSupport = (input.revenueSignals ?? []).filter(
    (record) =>
      record.signalId !== input.signal.recordId &&
      record.platform === input.platform &&
      (destinationLabel ? record.destination === destinationLabel : true) &&
      (editorialMode ? record.editorialMode === editorialMode : true) &&
      (record.type === "signup" || record.type === "trial" || record.type === "paid") &&
      (record.strength === "medium" || record.strength === "high"),
  ).length;

  return {
    attributionSupport,
    revenueSupport,
    strongBusinessSupport: attributionSupport + revenueSupport >= 2,
  };
}

function getAudienceSignals(
  audienceMemory: AudienceMemoryState | null | undefined,
  signal: SignalRecord,
) {
  const segment = getAudienceMemorySegment(audienceMemory, signal.audienceSegmentId);
  return {
    segment,
    directCtaCaution: segment?.toneCautions.some((note) => note.toLowerCase().includes("direct cta")) ?? false,
    modeSupport:
      signal.editorialMode
        ? (segment?.strongestModes.some((row) => row.id === signal.editorialMode) ?? false)
        : false,
    platformSupport: segment?.strongestPlatforms.some((row) => row.id === getPrimaryPlatform(signal)) ?? false,
  };
}

export function getConversionIntentLabel(posture: ConversionIntentPosture): string {
  return getPostureLabel(posture);
}

export function assessConversionIntent(input: {
  signal: SignalRecord;
  strategy?: CampaignStrategy | null;
  conflicts?: Pick<ConflictAssessment, "highestSeverity" | "summary"> | null;
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
  audienceMemory?: AudienceMemoryState | null;
}): ConversionIntentAssessment {
  const platform = getPrimaryPlatform(input.signal);
  const platformLabel = getPostingPlatformLabel(platform);
  const destinationId = getCurrentDestinationId(input.signal);
  const destinationLabel = getSiteLinkById(destinationId)?.label ?? "current destination";
  const audienceSignals = getAudienceSignals(input.audienceMemory, input.signal);
  const support = buildSupportCounts({
    signal: input.signal,
    platform,
    attributionRecords: input.attributionRecords,
    revenueSignals: input.revenueSignals,
  });
  const contextSummary = input.strategy ? getSignalContentContextSummary(input.signal, input.strategy) : null;
  const contextText = [
    input.signal.sourceTitle,
    input.signal.manualSummary,
    input.signal.scenarioAngle,
    contextSummary?.campaignName,
    contextSummary?.pillarName,
  ]
    .filter(Boolean)
    .join(" ");
  const cautionNotes: string[] = [];
  const whyChosen: string[] = [];

  let posture: ConversionIntentPosture = "awareness_first";

  const earlyFunnel = input.signal.funnelStage === "Awareness";
  const trustFunnel = input.signal.funnelStage === "Trust";
  const considerationFunnel = input.signal.funnelStage === "Consideration";
  const conversionFunnel = input.signal.funnelStage === "Conversion";
  const directGoal = input.signal.ctaGoal === "Sign up" || input.signal.ctaGoal === "Try product";
  const commercialGoal = directGoal || input.signal.ctaGoal === "Visit site";
  const sharpMode =
    input.signal.editorialMode === "risk_warning" ||
    input.signal.editorialMode === "this_could_happen_to_you";
  const calmMode =
    input.signal.editorialMode === "helpful_tip" ||
    input.signal.editorialMode === "professional_guidance" ||
    input.signal.editorialMode === "calm_insight" ||
    input.signal.editorialMode === "reassurance_deescalation";
  const highConflict =
    input.conflicts?.highestSeverity === "high" || input.conflicts?.highestSeverity === "medium";
  const conversionCampaign =
    commercialGoal ||
    includesAny(contextText, ["signup", "trial", "demo", "product", "overview", "pricing", "get started"]);

  if (platform === "reddit") {
    posture = trustFunnel || considerationFunnel ? "trust_first" : "awareness_first";
    uniquePush(whyChosen, "Reddit discussion content should stay low-pressure unless clear commercial proof already exists.");
    uniquePush(cautionNotes, "Avoid direct conversion asks on Reddit unless the commercial path is already clearly justified.");
  } else if (highConflict) {
    posture = "trust_first";
    uniquePush(whyChosen, "Current package conflicts make a trust-first posture safer than escalating conversion pressure.");
    uniquePush(cautionNotes, input.conflicts?.summary[0] ?? "Resolve package conflicts before using a stronger conversion ask.");
  } else if (earlyFunnel || (sharpMode && !support.strongBusinessSupport)) {
    posture = calmMode || audienceSignals.modeSupport ? "trust_first" : "awareness_first";
    uniquePush(
      whyChosen,
      earlyFunnel
        ? "Early-funnel content should build familiarity before asking for a hard next step."
        : "Stronger framing without clear proof should stay awareness-led or trust-led.",
    );
  } else if ((trustFunnel || audienceSignals.directCtaCaution) && !support.strongBusinessSupport) {
    posture = "trust_first";
    uniquePush(whyChosen, "Trust-stage or audience caution signals point to a softer next step.");
    if (audienceSignals.segment) {
      uniquePush(cautionNotes, `${audienceSignals.segment.segmentName} tends to underperform on direct CTA pressure.`);
    }
  } else if ((considerationFunnel || conversionFunnel || conversionCampaign) && support.strongBusinessSupport) {
    posture = directGoal && platform !== "linkedin" ? "direct_conversion" : "soft_conversion";
    uniquePush(
      whyChosen,
      support.revenueSupport > 0
        ? `${platformLabel} and ${destinationLabel} already show business-value support.`
        : `${platformLabel} and ${destinationLabel} already show attributable conversion support.`,
    );
  } else if (considerationFunnel || commercialGoal || calmMode) {
    posture = "soft_conversion";
    uniquePush(whyChosen, "Product-aware context is present, but a softer CTA is safer than a direct ask.");
  } else {
    posture = "awareness_first";
    uniquePush(whyChosen, "Signals are not strong enough yet to justify a stronger conversion posture.");
  }

  if (audienceSignals.platformSupport) {
    uniquePush(whyChosen, `${platformLabel} is already a stronger fit for this audience segment.`);
  }

  if (destinationId === "get_started" && (posture === "awareness_first" || posture === "trust_first")) {
    uniquePush(cautionNotes, "The current destination may be too conversion-forward for the selected posture.");
  }

  if ((destinationId === "resources" || destinationId === "teacher_protection") && posture === "direct_conversion") {
    uniquePush(cautionNotes, "The current destination may be too soft for a direct-conversion posture.");
  }

  if (input.signal.editorialMode) {
    uniquePush(
      whyChosen,
      `${getEditorialModeDefinition(input.signal.editorialMode).label} is being kept inside a ${getPostureLabel(posture).toLowerCase()} frame.`,
    );
  }

  const preferredDestinationIds =
    posture === "awareness_first"
      ? ["resources", "teacher_protection", "home"]
      : posture === "trust_first"
        ? ["resources", "product_overview", "product_education", "home"]
        : posture === "soft_conversion"
          ? ["product_overview", "product_education", "get_started"]
          : ["get_started", "pricing", "product_overview"];

  return {
    posture,
    whyChosen: whyChosen.slice(0, 3),
    cautionNotes: cautionNotes.slice(0, 3),
    rankAdjustment:
      posture === "direct_conversion" || posture === "soft_conversion"
        ? 1
        : posture === "trust_first"
          ? 0
          : 0,
    preferredCtaVariant:
      posture === "soft_conversion" || posture === "direct_conversion" ? "primary" : "soft",
    preferredDestinationIds,
  };
}

export function buildConversionIntentInsights(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  strategicOutcomes: StrategicOutcome[];
  attributionRecords?: AttributionRecord[];
  revenueSignals?: RevenueSignal[];
  strategy?: CampaignStrategy | null;
  audienceMemory?: AudienceMemoryState | null;
}): ConversionIntentInsights {
  const postingIdsBySignalId = new Map<string, string[]>();
  for (const entry of input.postingEntries) {
    postingIdsBySignalId.set(entry.signalId, [...(postingIdsBySignalId.get(entry.signalId) ?? []), entry.id]);
  }

  const strategicByPostingId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const rows = new Map<
    ConversionIntentPosture,
    { posture: ConversionIntentPosture; label: string; count: number; strongCount: number; revenueCount: number }
  >();
  const platformRows = new Map<string, { label: string; posture: ConversionIntentPosture; count: number }>();

  for (const signal of input.signals) {
    if (!(postingIdsBySignalId.get(signal.recordId)?.length ?? 0)) {
      continue;
    }

    const assessment = assessConversionIntent({
      signal,
      strategy: input.strategy,
      attributionRecords: input.attributionRecords,
      revenueSignals: input.revenueSignals,
      audienceMemory: input.audienceMemory,
    });
    const row =
      rows.get(assessment.posture) ??
      {
        posture: assessment.posture,
        label: getPostureLabel(assessment.posture),
        count: 0,
        strongCount: 0,
        revenueCount: 0,
      };
    row.count += 1;

    const postingIds = postingIdsBySignalId.get(signal.recordId) ?? [];
    const strongOutcome = postingIds.some((postingId) => {
      const outcome = strategicByPostingId.get(postingId);
      return outcome?.strategicValue === "high" || (outcome?.leadsOrSignups ?? 0) > 0 || (outcome?.trialsOrConversions ?? 0) > 0;
    });
    if (strongOutcome) {
      row.strongCount += 1;
    }

    const hasRevenue = (input.revenueSignals ?? []).some(
      (revenueSignal) =>
        revenueSignal.signalId === signal.recordId &&
        (revenueSignal.type === "signup" || revenueSignal.type === "trial" || revenueSignal.type === "paid") &&
        (revenueSignal.strength === "medium" || revenueSignal.strength === "high"),
    );
    if (hasRevenue) {
      row.revenueCount += 1;
    }

    rows.set(assessment.posture, row);

    const platformLabel = getPostingPlatformLabel(getPrimaryPlatform(signal));
    const platformKey = `${platformLabel}:${assessment.posture}`;
    const platformRow = platformRows.get(platformKey) ?? {
      label: platformLabel,
      posture: assessment.posture,
      count: 0,
    };
    platformRow.count += 1;
    platformRows.set(platformKey, platformRow);
  }

  const postureRows = [...rows.values()].sort(
    (left, right) => right.revenueCount - left.revenueCount || right.strongCount - left.strongCount || right.count - left.count,
  );
  const sortedPlatformRows = [...platformRows.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );

  const summary: string[] = [];
  if (postureRows[0]) {
    uniquePush(
      summary,
      `${postureRows[0].label} is the strongest current conversion posture by repeated posted evidence.`,
    );
  }
  if (sortedPlatformRows[0]) {
    uniquePush(
      summary,
      `${sortedPlatformRows[0].label} most often supports ${getPostureLabel(sortedPlatformRows[0].posture).toLowerCase()} content.`,
    );
  }
  if (postureRows.find((row) => row.posture === "trust_first" && row.strongCount > 0)) {
    uniquePush(summary, "Trust-first content is still producing enough downstream support to avoid premature CTA escalation.");
  }

  return {
    postureRows,
    platformRows: sortedPlatformRows,
    summary,
  };
}
