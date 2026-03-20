import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appendAuditEventsSafe } from "@/lib/audit";
import { buildAttributionRecordsFromInputs } from "@/lib/attribution";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { buildExperimentInsights, type ManualExperiment } from "@/lib/experiments";
import type { PostingOutcome } from "@/lib/outcome-memory";
import { getPostingPlatformLabel, type PostingLogEntry, type PostingPlatform } from "@/lib/posting-memory";
import { getPrimaryLinkVariant, getPublishPrepPackageForPlatform, getSelectedCtaText, parsePublishPrepBundle } from "@/lib/publish-prep";
import { buildRevenueSignalsFromInputs, type RevenueSignal } from "@/lib/revenue-signals";
import type { ReuseMemoryCase } from "@/lib/reuse-memory";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { WeeklyRecap } from "@/lib/weekly-recap";
import type { EditorialMode, SignalRecord } from "@/types/signal";

const PLAYBOOK_PACK_STORE_PATH = path.join(process.cwd(), "data", "playbook-packs.json");

export const playbookPackSchema = z.object({
  packId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  patternType: z.string().trim().min(1),
  platform: z.enum(["x", "linkedin", "reddit"]),
  mode: z.string().trim().nullable(),
  funnelStage: z.string().trim().nullable().optional(),
  ctaStyle: z.string().trim().min(1),
  destinationType: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  whyItWorks: z.string().trim().min(1),
  exampleReferences: z.array(
    z.object({
      label: z.string().trim().min(1),
      href: z.string().trim().min(1),
    }),
  ).max(4),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  strengthScore: z.number(),
  positiveEvidenceCount: z.number().int().min(0),
  weakEvidenceCount: z.number().int().min(0),
  experimentBackedCount: z.number().int().min(0),
  commercialEvidenceCount: z.number().int().min(0),
});

const playbookPackStoreSchema = z.object({
  packs: z.array(playbookPackSchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export const playbookPackUseRequestSchema = z.object({
  packId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  context: z.enum(["generation", "review", "plan"]),
});

export type PlaybookPack = z.infer<typeof playbookPackSchema>;
export type PlaybookPackUseRequest = z.infer<typeof playbookPackUseRequestSchema>;

export interface PlaybookPackMatch {
  pack: PlaybookPack;
  score: number;
  reason: string;
  matchedOn: string[];
}

type Observation = {
  signalId: string;
  signalTitle: string;
  platform: PostingPlatform;
  editorialMode: EditorialMode | null;
  funnelStage: SignalRecord["funnelStage"];
  ctaGoal: SignalRecord["ctaGoal"];
  ctaStyle: string;
  destinationType: string;
  patternType: string;
  positive: boolean;
  weak: boolean;
  score: number;
  experimentBacked: boolean;
  commercialPositive: boolean;
  reference: {
    label: string;
    href: string;
  };
};

type AggregatedPack = {
  key: string;
  platform: PostingPlatform;
  editorialMode: EditorialMode | null;
  funnelStage: SignalRecord["funnelStage"];
  ctaStyle: string;
  destinationType: string;
  patternType: string;
  score: number;
  positiveEvidenceCount: number;
  weakEvidenceCount: number;
  experimentBackedCount: number;
  commercialEvidenceCount: number;
  signalIds: Set<string>;
  references: Array<{
    label: string;
    href: string;
  }>;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function titleCase(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function classifyCtaStyle(ctaText: string | null | undefined, ctaGoal: SignalRecord["ctaGoal"]): string {
  const normalized = ctaText?.toLowerCase().trim() ?? "";
  if (!normalized) {
    return ctaGoal === "Awareness" ? "No hard CTA" : ctaGoal === "Share / engage" ? "Engagement CTA" : "Low-pressure CTA";
  }

  if (
    /\b(sign up|start free|book|schedule|demo|trial|buy|get started|subscribe)\b/.test(normalized)
  ) {
    return "Direct CTA";
  }

  if (/\b(comment|reply|share|save|follow|join)\b/.test(normalized)) {
    return "Engagement CTA";
  }

  if (/\b(learn more|read more|overview|see how|if helpful|if useful|take a look|visit)\b/.test(normalized)) {
    return "Soft CTA";
  }

  if (ctaGoal === "Sign up" || ctaGoal === "Try product" || ctaGoal === "Visit site") {
    return "Direct CTA";
  }

  return "Soft CTA";
}

function classifyDestinationType(destinationLabel: string | null | undefined, destinationUrl: string | null | undefined): string {
  const normalized = `${destinationLabel ?? ""} ${destinationUrl ?? ""}`.toLowerCase();
  if (!normalized.trim()) {
    return "No destination";
  }

  if (/(product|overview|how it works|why zaza|platform overview)/.test(normalized)) {
    return "Product overview";
  }

  if (/(get started|start|pricing|demo|trial|book)/.test(normalized)) {
    return "Direct conversion";
  }

  if (/(guide|resource|template|checklist|download|kit)/.test(normalized)) {
    return "Resource";
  }

  if (/(blog|article|story|case study)/.test(normalized)) {
    return "Editorial article";
  }

  return "General destination";
}

function buildObservationScore(outcome: PostingOutcome | null, strategicOutcome: StrategicOutcome | null): number {
  let score = 0;

  if (outcome?.outcomeQuality === "strong") {
    score += 3;
  } else if (outcome?.outcomeQuality === "acceptable") {
    score += 1;
  } else if (outcome?.outcomeQuality === "weak") {
    score -= 3;
  }

  if (outcome?.reuseRecommendation === "reuse_this_approach") {
    score += 3;
  } else if (outcome?.reuseRecommendation === "adapt_before_reuse") {
    score += 1;
  } else if (outcome?.reuseRecommendation === "do_not_repeat") {
    score -= 4;
  }

  if (strategicOutcome?.strategicValue === "high") {
    score += 4;
  } else if (strategicOutcome?.strategicValue === "medium") {
    score += 2;
  } else if (strategicOutcome?.strategicValue === "low") {
    score -= 4;
  }

  score += Math.min(3, (strategicOutcome?.leadsOrSignups ?? 0) + (strategicOutcome?.trialsOrConversions ?? 0));
  score += (strategicOutcome?.clicks ?? 0) >= 30 ? 1 : 0;

  return score;
}

function isPositiveEvidence(outcome: PostingOutcome | null, strategicOutcome: StrategicOutcome | null): boolean {
  return (
    outcome?.outcomeQuality === "strong" ||
    outcome?.reuseRecommendation === "reuse_this_approach" ||
    strategicOutcome?.strategicValue === "high" ||
    strategicOutcome?.strategicValue === "medium"
  );
}

function isWeakEvidence(outcome: PostingOutcome | null, strategicOutcome: StrategicOutcome | null): boolean {
  return (
    outcome?.outcomeQuality === "weak" ||
    outcome?.reuseRecommendation === "do_not_repeat" ||
    strategicOutcome?.strategicValue === "low"
  );
}

function derivePatternType(reuseCase: ReuseMemoryCase | undefined, signal: SignalRecord): string {
  const candidate =
    reuseCase?.bundleNames[0] ??
    reuseCase?.patternName ??
    reuseCase?.familyLabels[0] ??
    titleCase(signal.relatedZazaFrameworkTag) ??
    (signal.editorialMode ? getEditorialModeDefinition(signal.editorialMode).label : null) ??
    titleCase(signal.signalSubtype) ??
    "Reusable structure";

  return candidate.trim();
}

function buildLeaderSets(
  experiments: ManualExperiment[],
  postingEntries: PostingLogEntry[],
  postingOutcomes: PostingOutcome[],
  strategicOutcomes: StrategicOutcome[],
): {
  postingIds: Set<string>;
  signalIds: Set<string>;
} {
  const insights = buildExperimentInsights({
    experiments,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
  });
  const postingIds = new Set<string>();
  const signalIds = new Set<string>();

  for (const experiment of insights.completedExperiments) {
    const leader = experiment.variants[0];
    if (!leader) {
      continue;
    }

    for (const postingId of leader.linkedPostingIds) {
      postingIds.add(postingId);
    }
    for (const signalId of leader.linkedSignalIds) {
      signalIds.add(signalId);
    }
  }

  return { postingIds, signalIds };
}

function buildWinnerSet(recap: WeeklyRecap | null | undefined): Set<string> {
  const values = new Set<string>();

  for (const item of [...(recap?.winners ?? []), ...(recap?.reuseCandidates ?? [])]) {
    values.add(item.label.toLowerCase());
  }

  return values;
}

function observationKey(observation: Observation) {
  return [
    observation.platform,
    observation.editorialMode ?? "none",
    observation.funnelStage ?? "none",
    observation.patternType,
    observation.ctaStyle,
    observation.destinationType,
  ].join("::");
}

function buildPackName(input: {
  platform: PostingPlatform;
  patternType: string;
  ctaStyle: string;
  destinationType: string;
}): string {
  const platformLabel = getPostingPlatformLabel(input.platform);
  if (input.ctaStyle === "No hard CTA") {
    return `${platformLabel} ${input.patternType} No Hard CTA Pack`;
  }

  if (input.destinationType === "Product overview" || input.destinationType === "Direct conversion") {
    return `${platformLabel} ${input.patternType} ${input.destinationType} Pack`;
  }

  return `${platformLabel} ${input.patternType} ${input.ctaStyle} Pack`;
}

function buildWhyItWorks(pack: AggregatedPack, recapWinnerBoost: boolean): string {
  const parts = [
    `${pack.positiveEvidenceCount} repeated strong or reusable outcome${pack.positiveEvidenceCount === 1 ? "" : "s"}`,
  ];

  if (pack.commercialEvidenceCount > 0) {
    parts.push(`${pack.commercialEvidenceCount} commercial attribution hit${pack.commercialEvidenceCount === 1 ? "" : "s"}`);
  }

  if (pack.experimentBackedCount > 0) {
    parts.push(`${pack.experimentBackedCount} experiment-backed winner${pack.experimentBackedCount === 1 ? "" : "s"}`);
  }

  if (pack.weakEvidenceCount === 0) {
    parts.push("no clear weak-repeat pattern in the current evidence");
  }

  if (recapWinnerBoost) {
    parts.push("recent weekly recap winners reinforce the same structure");
  }

  return parts.join(" · ");
}

function shouldKeepPack(pack: AggregatedPack): boolean {
  return (
    pack.positiveEvidenceCount >= 2 &&
    pack.signalIds.size >= 2 &&
    pack.score >= 6 &&
    pack.weakEvidenceCount <= Math.max(1, Math.floor(pack.positiveEvidenceCount / 2))
  );
}

async function readPersistedStore(): Promise<z.infer<typeof playbookPackStoreSchema>> {
  try {
    const raw = await readFile(PLAYBOOK_PACK_STORE_PATH, "utf8");
    return playbookPackStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return playbookPackStoreSchema.parse({
        packs: [],
        updatedAt: null,
      });
    }

    throw error;
  }
}

async function writeStore(store: z.infer<typeof playbookPackStoreSchema>): Promise<void> {
  await mkdir(path.dirname(PLAYBOOK_PACK_STORE_PATH), { recursive: true });
  await writeFile(PLAYBOOK_PACK_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function syncPlaybookPacks(input: {
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  experiments: ManualExperiment[];
  reuseMemoryCases: ReuseMemoryCase[];
  recap?: WeeklyRecap | null;
  revenueSignals?: RevenueSignal[];
}): Promise<PlaybookPack[]> {
  const signalsById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  const outcomesByPostingId = new Map(input.postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicOutcomesByPostingId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const attributionByPostingId = new Map(
    buildAttributionRecordsFromInputs({
      signals: input.signals,
      postingEntries: input.postingEntries,
      strategicOutcomes: input.strategicOutcomes,
    }).map((record) => [record.postingId, record]),
  );
  const revenueByPostingId = new Map(
    (input.revenueSignals ??
      buildRevenueSignalsFromInputs({
        signals: input.signals,
        postingEntries: input.postingEntries,
        strategicOutcomes: input.strategicOutcomes,
      })).map((record) => [record.postingId, record]),
  );
  const reuseCasesByPostingId = new Map(input.reuseMemoryCases.map((reuseCase) => [reuseCase.postingLogId, reuseCase]));
  const experimentLeaders = buildLeaderSets(
    input.experiments,
    input.postingEntries,
    input.postingOutcomes,
    input.strategicOutcomes,
  );
  const recapWinners = buildWinnerSet(input.recap);
  const packsByKey = new Map<string, AggregatedPack>();

  for (const entry of input.postingEntries) {
    const signal = signalsById.get(entry.signalId);
    if (!signal) {
      continue;
    }

    const outcome = outcomesByPostingId.get(entry.id) ?? null;
    const strategicOutcome = strategicOutcomesByPostingId.get(entry.id) ?? null;
    if (!outcome && !strategicOutcome) {
      continue;
    }

    const reuseCase = reuseCasesByPostingId.get(entry.id);
    const publishPrepBundle = parsePublishPrepBundle(signal.publishPrepBundleJson);
    const publishPrepPackage = getPublishPrepPackageForPlatform(publishPrepBundle, entry.platform);
    const ctaText = publishPrepPackage ? getSelectedCtaText(publishPrepPackage) : signal.ctaOrClosingLine;
    const destination = publishPrepPackage ? getPrimaryLinkVariant(publishPrepPackage) : null;
    const observation: Observation = {
      signalId: signal.recordId,
      signalTitle: signal.sourceTitle,
      platform: entry.platform,
      editorialMode: signal.editorialMode,
      funnelStage: signal.funnelStage,
      ctaGoal: signal.ctaGoal,
      ctaStyle: classifyCtaStyle(ctaText, signal.ctaGoal),
      destinationType: classifyDestinationType(destination?.label ?? destination?.destinationLabel ?? null, destination?.url ?? null),
      patternType: derivePatternType(reuseCase, signal),
      positive: isPositiveEvidence(outcome, strategicOutcome),
      weak: isWeakEvidence(outcome, strategicOutcome),
      score: buildObservationScore(outcome, strategicOutcome),
      experimentBacked: experimentLeaders.postingIds.has(entry.id) || experimentLeaders.signalIds.has(signal.recordId),
      commercialPositive:
        ["lead", "signup"].includes(attributionByPostingId.get(entry.id)?.outcomeType ?? "") ||
        ["signup", "trial", "paid"].includes(revenueByPostingId.get(entry.id)?.type ?? ""),
      reference: {
        label: signal.sourceTitle,
        href: `/signals/${signal.recordId}`,
      },
    };

    const key = observationKey(observation);
    const current = packsByKey.get(key) ?? {
      key,
      platform: observation.platform,
      editorialMode: observation.editorialMode,
      funnelStage: observation.funnelStage,
      ctaStyle: observation.ctaStyle,
      destinationType: observation.destinationType,
      patternType: observation.patternType,
      score: 0,
      positiveEvidenceCount: 0,
      weakEvidenceCount: 0,
      experimentBackedCount: 0,
      commercialEvidenceCount: 0,
      signalIds: new Set<string>(),
      references: [],
    };

    current.score += observation.score;
    current.signalIds.add(observation.signalId);
    if (observation.positive) {
      current.positiveEvidenceCount += 1;
    }
    if (observation.weak) {
      current.weakEvidenceCount += 1;
    }
    if (observation.experimentBacked) {
      current.experimentBackedCount += 1;
    }
    if (observation.commercialPositive) {
      current.commercialEvidenceCount += 1;
    }
    if (!current.references.some((reference) => reference.href === observation.reference.href)) {
      current.references.push(observation.reference);
    }

    packsByKey.set(key, current);
  }

  const persisted = await readPersistedStore();
  const persistedById = new Map(persisted.packs.map((pack) => [pack.packId, pack]));
  const now = new Date().toISOString();
  const nextPacks = Array.from(packsByKey.values())
    .filter(shouldKeepPack)
    .map((pack) => {
      const recapWinnerBoost =
        recapWinners.has(pack.patternType.toLowerCase()) ||
        recapWinners.has(getPostingPlatformLabel(pack.platform).toLowerCase()) ||
        (pack.editorialMode
          ? recapWinners.has(getEditorialModeDefinition(pack.editorialMode).label.toLowerCase())
          : false);
      const score = pack.score + (recapWinnerBoost ? 2 : 0) + pack.experimentBackedCount;
      const packId = `pack_${slugify([pack.platform, pack.patternType, pack.ctaStyle, pack.destinationType].join("-"))}`;
      const existing = persistedById.get(packId);
      const modeLabel = pack.editorialMode ? getEditorialModeDefinition(pack.editorialMode).label : null;
      const summary = [
        `${getPostingPlatformLabel(pack.platform)} ${pack.patternType}`,
        modeLabel ? `with ${modeLabel}` : null,
        pack.ctaStyle ? `${pack.ctaStyle.toLowerCase()}` : null,
        pack.destinationType !== "No destination" ? `toward ${pack.destinationType.toLowerCase()}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      return playbookPackSchema.parse({
        packId,
        name: buildPackName({
          platform: pack.platform,
          patternType: pack.patternType,
          ctaStyle: pack.ctaStyle,
          destinationType: pack.destinationType,
        }),
        patternType: pack.patternType,
        platform: pack.platform,
        mode: modeLabel,
        funnelStage: titleCase(pack.funnelStage),
        ctaStyle: pack.ctaStyle,
        destinationType: pack.destinationType,
        summary: `${summary}.`,
        whyItWorks: buildWhyItWorks(pack, recapWinnerBoost),
        exampleReferences: pack.references.slice(0, 3),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        strengthScore: score,
        positiveEvidenceCount: pack.positiveEvidenceCount,
        weakEvidenceCount: pack.weakEvidenceCount,
        experimentBackedCount: pack.experimentBackedCount,
        commercialEvidenceCount: pack.commercialEvidenceCount,
      });
    })
    .sort((left, right) =>
      right.strengthScore - left.strengthScore ||
      right.positiveEvidenceCount - left.positiveEvidenceCount ||
      left.name.localeCompare(right.name),
    );

  await writeStore({
    packs: nextPacks,
    updatedAt: now,
  });

  const createdPacks = nextPacks.filter((pack) => !persistedById.has(pack.packId));
  if (createdPacks.length > 0) {
    await appendAuditEventsSafe(
      createdPacks.map((pack) => ({
        signalId: `playbook-pack:${pack.packId}`,
        eventType: "PLAYBOOK_PACK_CREATED" as const,
        actor: "system" as const,
        summary: `Created playbook pack: ${pack.name}.`,
        metadata: {
          packId: pack.packId,
          platform: pack.platform,
          mode: pack.mode,
          strengthScore: pack.strengthScore,
        },
      })),
    );
  }

  return nextPacks;
}

function preferredPlatformForSignal(signal: SignalRecord): PostingPlatform | null {
  switch (signal.platformPriority) {
    case "X First":
      return "x";
    case "Reddit First":
      return "reddit";
    case "LinkedIn First":
    case "Multi-platform":
      return "linkedin";
    default:
      return null;
  }
}

export function matchPlaybookPacksForSignal(
  signal: SignalRecord,
  packs: PlaybookPack[],
  options?: {
    editorialMode?: EditorialMode | null;
    platform?: PostingPlatform | null;
    ctaText?: string | null;
    destinationLabel?: string | null;
    destinationUrl?: string | null;
  },
): PlaybookPackMatch[] {
  const targetPlatform = options?.platform ?? preferredPlatformForSignal(signal);
  const targetMode = options?.editorialMode ?? signal.editorialMode;
  const targetCtaStyle = classifyCtaStyle(options?.ctaText ?? signal.ctaOrClosingLine, signal.ctaGoal);
  const targetDestination = classifyDestinationType(options?.destinationLabel ?? null, options?.destinationUrl ?? null);
  const targetFunnelStage = titleCase(signal.funnelStage);
  const sourceText = `${signal.contentAngle ?? ""} ${signal.scenarioAngle ?? ""} ${signal.relatedZazaFrameworkTag ?? ""}`.toLowerCase();

  return packs
    .map((pack) => {
      let score = 0;
      const matchedOn: string[] = [];

      if (targetPlatform && pack.platform === targetPlatform) {
        score += 3;
        matchedOn.push(getPostingPlatformLabel(pack.platform));
      }

      if (pack.mode && targetMode && pack.mode === getEditorialModeDefinition(targetMode).label) {
        score += 3;
        matchedOn.push(pack.mode);
      }

      if (pack.ctaStyle === targetCtaStyle) {
        score += 2;
        matchedOn.push(pack.ctaStyle);
      }

      if (pack.destinationType === targetDestination && pack.destinationType !== "No destination") {
        score += 2;
        matchedOn.push(pack.destinationType);
      }

      if (pack.funnelStage && targetFunnelStage && pack.funnelStage === targetFunnelStage) {
        score += 1;
        matchedOn.push(pack.funnelStage);
      }

      if (sourceText.includes(pack.patternType.toLowerCase())) {
        score += 1;
        matchedOn.push(pack.patternType);
      }

      if (score <= 0) {
        return null;
      }

      return {
        pack,
        score,
        reason:
          matchedOn.length > 0
            ? `Matches ${matchedOn.slice(0, 3).join(" · ")} with repeated strong evidence.`
            : "Repeated strong evidence suggests this structure is reusable here.",
        matchedOn,
      } satisfies PlaybookPackMatch;
    })
    .filter((match): match is PlaybookPackMatch => Boolean(match))
    .sort((left, right) => right.score - left.score || right.pack.strengthScore - left.pack.strengthScore)
    .slice(0, 3);
}
