import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import {
  performanceSignalSchema,
  type PerformanceSignal,
} from "@/lib/performance-signals";
import {
  productionPackageSchema,
  type ProductionPackage,
} from "@/lib/production-packages";

const PHASE_E_ORCHESTRATION_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "phase-e-orchestration.json",
);

export const CONNECT_CAMPAIGN_TYPES = [
  "influencer",
  "paid",
  "organic",
  "email",
] as const;

export const CONNECT_OUTCOMES = [
  "influencer_accepted",
  "influencer_declined",
  "campaign_launched",
  "underperformed",
] as const;

export const CONTENT_SERIES_STATUSES = [
  "building",
  "ready",
  "in-distribution",
] as const;

export const PLATFORM_PACKAGE_PLATFORMS = [
  "x",
  "linkedin",
  "reddit",
  "tiktok",
  "instagram",
  "youtube",
  "email",
] as const;

export const platformPackageSchema = z.object({
  platform: z.enum(PLATFORM_PACKAGE_PLATFORMS),
  aspectRatio: z.string().trim().nullable().default(null),
  packagingNotes: z.array(z.string().trim().min(1)).default([]),
});

export const connectHandoffPackageSchema = z.object({
  packageId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  opportunityTitle: z.string().trim().min(1),
  primaryPainPoint: z.string().trim().min(1),
  angle: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  videoUrl: z.string().trim().min(1),
  thumbnailUrl: z.string().trim().min(1),
  publishPackages: z.array(platformPackageSchema).min(1),
  suggestedCampaignType: z.enum(CONNECT_CAMPAIGN_TYPES),
  audienceProfile: z.string().trim().min(1),
  trustGuardrails: z.array(z.string().trim().min(1)).min(1),
  productDestination: z.string().trim().min(1),
  readyAt: z.string().trim().min(1),
});

export const connectPerformanceSignalSchema = performanceSignalSchema.extend({
  source: z.literal("connect").default("connect"),
  campaignType: z.string().trim().min(1),
  connectOutcome: z.enum(CONNECT_OUTCOMES),
  connectNotes: z.string().trim().nullable().default(null),
});

export const creatorBriefSchema = z.object({
  briefId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  campaignName: z.string().trim().min(1),
  painPointSummary: z.string().trim().min(1),
  angle: z.string().trim().min(1),
  suggestedHooks: z.array(z.string().trim().min(1)).min(1).max(4),
  scriptReference: z.string().trim().min(1),
  doNotUse: z.array(z.string().trim().min(1)).min(1),
  brandVoiceNotes: z.string().trim().min(1),
  referenceVideoUrl: z.string().trim().nullable().default(null),
  productLink: z.string().trim().min(1),
  callToAction: z.string().trim().min(1),
  deliverables: z.array(z.string().trim().min(1)).min(1),
  deadline: z.string().trim().nullable().default(null),
  createdAt: z.string().trim().min(1),
});

export const contentSeriesSchema = z.object({
  seriesId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  angle: z.string().trim().min(1),
  contentType: z.string().trim().nullable().default(null),
  assetIds: z.array(z.string().trim().min(1)).default([]),
  opportunityIds: z.array(z.string().trim().min(1)).default([]),
  platforms: z.array(z.enum(PLATFORM_PACKAGE_PLATFORMS)).default([]),
  status: z.enum(CONTENT_SERIES_STATUSES).default("building"),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const phaseEOrchestrationStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  connectHandoffPackages: z.array(connectHandoffPackageSchema).default([]),
  connectPerformanceSignals: z.array(connectPerformanceSignalSchema).default([]),
  creatorBriefs: z.array(creatorBriefSchema).default([]),
  contentSeries: z.array(contentSeriesSchema).default([]),
});

export type PlatformPackage = z.infer<typeof platformPackageSchema>;
export type ConnectHandoffPackage = z.infer<typeof connectHandoffPackageSchema>;
export type ConnectPerformanceSignal = z.infer<typeof connectPerformanceSignalSchema>;
export type CreatorBrief = z.infer<typeof creatorBriefSchema>;
export type ContentSeries = z.infer<typeof contentSeriesSchema>;

type PhaseEOrchestrationStore = z.infer<typeof phaseEOrchestrationStoreSchema>;

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeStore(store: PhaseEOrchestrationStore): PhaseEOrchestrationStore {
  return phaseEOrchestrationStoreSchema.parse({
    updatedAt: store.updatedAt,
    connectHandoffPackages: [...store.connectHandoffPackages].sort(
      (left, right) => right.readyAt.localeCompare(left.readyAt),
    ),
    connectPerformanceSignals: [...store.connectPerformanceSignals].sort(
      (left, right) => right.createdAt.localeCompare(left.createdAt),
    ),
    creatorBriefs: [...store.creatorBriefs].sort(
      (left, right) => right.createdAt.localeCompare(left.createdAt),
    ),
    contentSeries: [...store.contentSeries].sort(
      (left, right) => right.updatedAt.localeCompare(left.updatedAt),
    ),
  });
}

function buildDefaultStore(): PhaseEOrchestrationStore {
  return phaseEOrchestrationStoreSchema.parse({
    updatedAt: null,
    connectHandoffPackages: [],
    connectPerformanceSignals: [],
    creatorBriefs: [],
    contentSeries: [],
  });
}

function readPersistedStoreSync(): PhaseEOrchestrationStore {
  try {
    const raw = readFileSync(PHASE_E_ORCHESTRATION_STORE_PATH, "utf8");
    return normalizeStore(phaseEOrchestrationStoreSchema.parse(JSON.parse(raw)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return buildDefaultStore();
    }

    throw error;
  }
}

async function writePersistedStore(store: PhaseEOrchestrationStore): Promise<void> {
  await mkdir(path.dirname(PHASE_E_ORCHESTRATION_STORE_PATH), {
    recursive: true,
  });
  await writeFile(
    PHASE_E_ORCHESTRATION_STORE_PATH,
    `${JSON.stringify(normalizeStore(store), null, 2)}\n`,
    "utf8",
  );
}

function platformPackagingNotes(platform: PlatformPackage["platform"]): string[] {
  switch (platform) {
    case "tiktok":
      return [
        "Burn captions into the asset.",
        "Keep the hook visible within the first 2 seconds.",
        "Keep runtime under 60 seconds.",
      ];
    case "instagram":
      return [
        "Select a strong cover frame before distribution.",
        "Keep caption copy concise enough for Reels context.",
      ];
    case "youtube":
      return [
        "Add a title-card treatment before Shorts publishing.",
        "Reserve room for an end-screen placeholder if adapted.",
      ];
    case "linkedin":
      return [
        "Prefer calmer caption tone and lower hashtag density.",
        "Allow 1:1 or 4:5 adaptation if the platform mix demands it.",
      ];
    case "email":
      return [
        "Pair the asset with a short sender-led intro.",
      ];
    case "reddit":
      return [
        "Keep framing discussion-led rather than polished or sales-heavy.",
      ];
    case "x":
    default:
      return [
        "Keep the hook and caption payload concise.",
      ];
  }
}

function buildPlatformPackages(
  productionPackage: ProductionPackage,
  opportunity: ContentOpportunity,
): PlatformPackage[] {
  const platforms = [
    ...opportunity.recommendedPlatforms,
    ...(productionPackage.connectSummary.publishPlatform
      ? [productionPackage.connectSummary.publishPlatform]
      : []),
  ]
    .map((platform) => normalizeText(platform)?.toLowerCase() ?? null)
    .filter(
      (platform): platform is PlatformPackage["platform"] =>
        Boolean(platform) &&
        PLATFORM_PACKAGE_PLATFORMS.includes(
          platform as PlatformPackage["platform"],
        ),
    );

  const uniquePlatforms = Array.from(new Set(platforms));
  const fallbackPlatforms: PlatformPackage["platform"][] =
    uniquePlatforms.length > 0 ? uniquePlatforms : ["linkedin"];

  return fallbackPlatforms.map((platform) =>
    platformPackageSchema.parse({
      platform,
      aspectRatio:
        platform === "instagram" || platform === "youtube"
          ? "9:16"
          : productionPackage.defaultsSnapshot?.aspectRatio ??
            productionPackage.connectSummary.aspectRatio ??
            null,
      packagingNotes: platformPackagingNotes(platform),
    }),
  );
}

function buildTrustGuardrails(
  opportunity: ContentOpportunity,
  productionPackage: ProductionPackage,
) {
  const guardrails = [
    ...(productionPackage.brief.productionNotes ?? []),
    ...(productionPackage.compiledProductionPlan?.trustAssessment.reasons ?? []),
    ...(productionPackage.compiledProductionPlan?.finalScriptTrustAssessment?.reasons ?? []),
    opportunity.riskSummary,
  ]
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item));

  return guardrails.length > 0
    ? Array.from(new Set(guardrails)).slice(0, 6)
    : ["Keep the asset teacher-real, calm, and free of exaggerated claims."];
}

function deriveSuggestedCampaignType(input: {
  productionPackage: ProductionPackage;
  opportunity: ContentOpportunity;
}): ConnectHandoffPackage["suggestedCampaignType"] {
  const publishPlatform = input.productionPackage.connectSummary.publishPlatform;
  if (publishPlatform === "email") {
    return "email";
  }

  if (input.opportunity.growthIntelligence?.executionPath === "connect") {
    return "influencer";
  }

  if (input.opportunity.recommendedPlatforms.includes("linkedin")) {
    return "organic";
  }

  return "paid";
}

function contentSeriesId(
  opportunity: ContentOpportunity,
  productionPackage: ProductionPackage,
) {
  return [
    "content-series",
    opportunity.selectedAngleId ?? productionPackage.brief.angleId,
    productionPackage.brief.contentType ?? "unknown",
  ].join(":");
}

export function buildConnectHandoffPackage(input: {
  opportunity: ContentOpportunity;
  productionPackage: ProductionPackage;
}): ConnectHandoffPackage {
  const productionPackage = productionPackageSchema.parse(input.productionPackage);
  const videoUrl = normalizeText(productionPackage.connectSummary.finalVideoUrl);
  const thumbnailUrl = normalizeText(productionPackage.connectSummary.thumbnailUrl);

  if (!videoUrl || !thumbnailUrl) {
    throw new Error(
      "A connect handoff package requires a publish-ready video and thumbnail URL.",
    );
  }

  return connectHandoffPackageSchema.parse({
    packageId: `${productionPackage.id}:connect-handoff`,
    opportunityId: input.opportunity.opportunityId,
    opportunityTitle: input.opportunity.title,
    primaryPainPoint: input.opportunity.primaryPainPoint,
    angle:
      firstNonEmpty(
        input.opportunity.recommendedAngle,
        productionPackage.brief.title,
      ) ?? "Teacher-real messaging angle",
    contentType:
      normalizeText(productionPackage.brief.contentType) ?? "validation",
    videoUrl,
    thumbnailUrl,
    publishPackages: buildPlatformPackages(productionPackage, input.opportunity),
    suggestedCampaignType: deriveSuggestedCampaignType({
      productionPackage,
      opportunity: input.opportunity,
    }),
    audienceProfile:
      firstNonEmpty(
        input.opportunity.memoryContext.audienceCue,
        productionPackage.brief.goal,
      ) ?? "Teachers navigating real communication pressure",
    trustGuardrails: buildTrustGuardrails(input.opportunity, productionPackage),
    productDestination:
      firstNonEmpty(productionPackage.brief.cta, "Zaza Draft") ?? "Zaza Draft",
    readyAt:
      normalizeText(productionPackage.publishOutcome?.lastUpdatedAt) ??
      productionPackage.createdAt,
  });
}

export function buildConnectPerformanceSignal(input: {
  baseSignal: PerformanceSignal;
  campaignType: string;
  connectOutcome: ConnectPerformanceSignal["connectOutcome"];
  connectNotes?: string | null;
}): ConnectPerformanceSignal {
  return connectPerformanceSignalSchema.parse({
    ...input.baseSignal,
    source: "connect",
    campaignType: input.campaignType,
    connectOutcome: input.connectOutcome,
    connectNotes: normalizeText(input.connectNotes) ?? null,
  });
}

export function buildCreatorBrief(input: {
  opportunity: ContentOpportunity;
  productionPackage: ProductionPackage;
  campaignName?: string | null;
  deliverables?: string[];
  deadline?: string | null;
}): CreatorBrief {
  const productionPackage = productionPackageSchema.parse(input.productionPackage);
  const trustGuardrails = buildTrustGuardrails(input.opportunity, productionPackage);
  const suggestedHooks = [
    productionPackage.brief.hook,
    ...(input.opportunity.hookOptions ?? []),
  ]
    .map((hook) => normalizeText(hook))
    .filter((hook): hook is string => Boolean(hook));

  return creatorBriefSchema.parse({
    briefId: `${productionPackage.id}:creator-brief`,
    opportunityId: input.opportunity.opportunityId,
    campaignName:
      firstNonEmpty(
        input.campaignName,
        input.opportunity.title,
        productionPackage.brief.title,
      ) ?? "Zaza Draft creator campaign",
    painPointSummary: input.opportunity.primaryPainPoint,
    angle:
      firstNonEmpty(input.opportunity.recommendedAngle, productionPackage.brief.title) ??
      "Teacher-real angle",
    suggestedHooks: Array.from(new Set(suggestedHooks)).slice(0, 4),
    scriptReference:
      firstNonEmpty(
        productionPackage.narrationSpec?.script,
        productionPackage.brief.hook,
      ) ?? productionPackage.brief.title,
    doNotUse: trustGuardrails,
    brandVoiceNotes:
      firstNonEmpty(
        productionPackage.brief.tone,
        "Calm, grounded, teacher-real, and useful before polished.",
      ) ?? "Calm, grounded, teacher-real.",
    referenceVideoUrl:
      normalizeText(productionPackage.connectSummary.finalVideoUrl) ?? null,
    productLink:
      firstNonEmpty(productionPackage.brief.cta, "Zaza Draft") ?? "Zaza Draft",
    callToAction: productionPackage.brief.cta,
    deliverables:
      input.deliverables && input.deliverables.length > 0
        ? input.deliverables
        : ["1 short-form video cut", "1 caption draft", "1 thumbnail selection"],
    deadline: normalizeText(input.deadline) ?? null,
    createdAt: productionPackage.createdAt,
  });
}

export function buildContentSeries(input: {
  opportunity: ContentOpportunity;
  productionPackage: ProductionPackage;
  existing?: ContentSeries | null;
}): ContentSeries | null {
  const renderedAssetId = normalizeText(input.productionPackage.renderedAsset?.id);
  if (!renderedAssetId) {
    return null;
  }

  const seriesId = contentSeriesId(input.opportunity, input.productionPackage);
  const createdAt = input.existing?.createdAt ?? input.productionPackage.createdAt;
  const nextPlatforms = Array.from(
    new Set([
      ...(input.existing?.platforms ?? []),
      ...buildPlatformPackages(input.productionPackage, input.opportunity).map(
        (pkg) => pkg.platform,
      ),
    ]),
  );
  const nextAssetIds = Array.from(
    new Set([...(input.existing?.assetIds ?? []), renderedAssetId]),
  );
  const nextOpportunityIds = Array.from(
    new Set([
      ...(input.existing?.opportunityIds ?? []),
      input.opportunity.opportunityId,
    ]),
  );
  const status: ContentSeries["status"] =
    nextAssetIds.length >= 2 ? "ready" : "building";

  return contentSeriesSchema.parse({
    seriesId,
    name:
      firstNonEmpty(
        input.existing?.name,
        `${input.productionPackage.brief.contentType ?? "validation"} series`,
      ) ?? "content series",
    angle:
      firstNonEmpty(
        input.opportunity.recommendedAngle,
        input.productionPackage.brief.title,
      ) ?? "Teacher-real angle",
    contentType: input.productionPackage.brief.contentType ?? null,
    assetIds: nextAssetIds,
    opportunityIds: nextOpportunityIds,
    platforms: nextPlatforms,
    status,
    createdAt,
    updatedAt: input.productionPackage.createdAt,
  });
}

export function listConnectHandoffPackages(): ConnectHandoffPackage[] {
  return readPersistedStoreSync().connectHandoffPackages;
}

export function listCreatorBriefs(): CreatorBrief[] {
  return readPersistedStoreSync().creatorBriefs;
}

export function listContentSeries(): ContentSeries[] {
  return readPersistedStoreSync().contentSeries;
}

export function listConnectPerformanceSignals(): ConnectPerformanceSignal[] {
  return readPersistedStoreSync().connectPerformanceSignals;
}

export async function upsertConnectPerformanceSignal(
  signal: ConnectPerformanceSignal,
): Promise<ConnectPerformanceSignal> {
  const store = readPersistedStoreSync();
  const nextSignal = connectPerformanceSignalSchema.parse(signal);

  await writePersistedStore({
    updatedAt: nextSignal.createdAt,
    connectHandoffPackages: store.connectHandoffPackages,
    connectPerformanceSignals: [
      nextSignal,
      ...store.connectPerformanceSignals.filter(
        (item) => item.id !== nextSignal.id,
      ),
    ],
    creatorBriefs: store.creatorBriefs,
    contentSeries: store.contentSeries,
  });

  return nextSignal;
}

export async function syncPhaseEArtifactsForProductionPackage(input: {
  opportunity: ContentOpportunity;
  productionPackage: ProductionPackage;
}): Promise<{
  connectHandoffPackage: ConnectHandoffPackage | null;
  creatorBrief: CreatorBrief;
  contentSeries: ContentSeries | null;
}> {
  const productionPackage = productionPackageSchema.parse(input.productionPackage);
  const store = readPersistedStoreSync();
  const creatorBrief = buildCreatorBrief({
    opportunity: input.opportunity,
    productionPackage,
  });
  const existingSeries =
    store.contentSeries.find(
      (series) =>
        series.seriesId === contentSeriesId(input.opportunity, productionPackage),
    ) ?? null;
  const contentSeries = buildContentSeries({
    opportunity: input.opportunity,
    productionPackage,
    existing: existingSeries,
  });
  const connectHandoffPackage =
    productionPackage.connectSummary.isPublishReady
      ? buildConnectHandoffPackage({
          opportunity: input.opportunity,
          productionPackage,
        })
      : null;

  await writePersistedStore({
    updatedAt: productionPackage.createdAt,
    connectHandoffPackages: connectHandoffPackage
      ? [
          connectHandoffPackage,
          ...store.connectHandoffPackages.filter(
            (item) => item.packageId !== connectHandoffPackage.packageId,
          ),
        ]
      : store.connectHandoffPackages,
    connectPerformanceSignals: store.connectPerformanceSignals,
    creatorBriefs: [
      creatorBrief,
      ...store.creatorBriefs.filter((item) => item.briefId !== creatorBrief.briefId),
    ],
    contentSeries: contentSeries
      ? [
          contentSeries,
          ...store.contentSeries.filter(
            (item) => item.seriesId !== contentSeries.seriesId,
          ),
        ]
      : store.contentSeries,
  });

  return {
    connectHandoffPackage,
    creatorBrief,
    contentSeries,
  };
}
