import { createHash } from "node:crypto";

import { get, head, put } from "@vercel/blob";
import { z } from "zod";

import type { InfluencerGraphRow, InfluencerGraphSummary } from "@/lib/influencer-graph";
import { RELATIONSHIP_STAGES, type RelationshipStage } from "@/lib/influencer-graph-definitions";
import type { NarrativeSequence } from "@/lib/narrative-sequences";
import { buildContentIntelligenceFromSignal } from "@/lib/strategic-intelligence-types";
import type { WeeklyPostingPack } from "@/lib/weekly-posting-pack";
import { getZazaConnectBridgeBlobAccess } from "@/lib/zaza-connect-bridge-config";
import type { SignalRecord } from "@/types/signal";

const ZAZA_CONNECT_BRIDGE_STORE_BLOB_PATHNAME = "zaza-connect-bridge/store.json";
const ZAZA_CONNECT_BRIDGE_MAX_EXPORT_HISTORY = 25;

export const ZAZA_CONNECT_BRIDGE_SCHEMA_VERSION = "2026-03-24.1";
export type ZazaConnectBridgeGenerationDisposition =
  | "created_new"
  | "replaced_latest"
  | "reused_latest";

function getZazaConnectBridgeProducerVersion() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (sha) {
    return sha.slice(0, 12);
  }

  return "dev";
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function asSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function toSearchHaystack(signal: SignalRecord) {
  return [
    signal.sourceTitle,
    normalizeText(signal.manualSummary),
    normalizeText(signal.contentAngle),
    normalizeText(signal.scenarioAngle),
    normalizeText(signal.teacherPainPoint),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function matchesKeywords(haystack: string, keywords: string[]) {
  if (keywords.length === 0) {
    return false;
  }

  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function mapRecommendedFormat(input: {
  platform: string;
  editorialModeLabel: string | null;
  sequenceContext: WeeklyPostingPack["items"][number]["sequenceContext"];
}) {
  const platform = input.platform.trim().toLowerCase();
  const editorialMode = input.editorialModeLabel?.trim().toLowerCase() ?? "";

  if (editorialMode.includes("carousel")) {
    return "carousel" as const;
  }
  if (platform === "instagram" || platform === "tiktok" || platform === "youtube") {
    return "short_video" as const;
  }
  if (input.sequenceContext && input.sequenceContext.totalSteps > 1) {
    return "multi_asset" as const;
  }

  return "text" as const;
}

function mapTrustRisk(input: {
  expectedOutcomeTier: "high" | "medium" | "low";
  keyCaution: string | null;
}) {
  if (!input.keyCaution) {
    return "low" as const;
  }
  if (input.expectedOutcomeTier === "low") {
    return "high" as const;
  }

  return "medium" as const;
}

export interface BridgeFallbackCandidateInput {
  candidateId: string;
  signalId: string;
  sourceTitle: string;
  platform: string;
  expectedOutcomeTier: "high" | "medium" | "low";
  reason: string;
  href: string;
  primaryPainPoint?: string | null;
  teacherLanguage?: string[];
  audienceSegment?: string | null;
  funnelStage?: string | null;
  commercialPotential?: "high" | "medium" | "low";
  trustRisk?: "low" | "medium" | "high";
  recommendedAngle?: string | null;
  recommendedHookDirection?: string | null;
  recommendedFormat?: "text" | "carousel" | "short_video" | "multi_asset";
  recommendedPlatforms?: string[];
  whyNow?: string | null;
  proofPoints?: string[];
  trustNotes?: string[];
  sourceSignalIds?: string[];
}

const relationshipStageHintSchema = z.object({
  hintId: z.string().trim().min(1),
  influencerId: z.string().trim().nullable().default(null),
  name: z.string().trim().nullable().default(null),
  handle: z.string().trim().nullable().default(null),
  relationshipStage: z.enum(RELATIONSHIP_STAGES),
  tags: z.array(z.string().trim().min(1)).max(8).default([]),
  note: z.string().trim().nullable().default(null),
});

const outreachCampaignThemeSchema = z.object({
  themeId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).max(10).default([]),
  campaignLabel: z.string().trim().nullable().default(null),
  note: z.string().trim().nullable().default(null),
});

const creatorRelevanceTagSchema = z.object({
  tagId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).max(10).default([]),
  note: z.string().trim().nullable().default(null),
});

const collaborationOpportunitySchema = z.object({
  opportunityId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).max(10).default([]),
  relatedCampaign: z.string().trim().nullable().default(null),
  note: z.string().trim().nullable().default(null),
});

const replyContextSignalSchema = z.object({
  replySignalId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).max(10).default([]),
  note: z.string().trim().nullable().default(null),
});

export const zazaConnectImportedContextSchema = z.object({
  contextId: z.string().trim().min(1),
  sourceApp: z.literal("zaza_connect").default("zaza_connect"),
  importedAt: z.string().trim().min(1),
  relationshipStageHints: z.array(relationshipStageHintSchema).default([]),
  creatorRelevanceTags: z.array(creatorRelevanceTagSchema).default([]),
  outreachCampaignThemes: z.array(outreachCampaignThemeSchema).default([]),
  collaborationOpportunities: z.array(collaborationOpportunitySchema).default([]),
  replyContextSignals: z.array(replyContextSignalSchema).default([]),
  notes: z.string().trim().nullable().default(null),
});

const strongContentCandidateSchema = z.object({
  candidateId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  expectedOutcomeTier: z.enum(["high", "medium", "low"]),
  reason: z.string().trim().min(1),
  href: z.string().trim().min(1),
  primaryPainPoint: z.string().trim().min(1).default("High-priority teacher pain point worth addressing."),
  teacherLanguage: z.array(z.string().trim().min(1)).default([]),
  audienceSegment: z.string().trim().nullable().default(null),
  funnelStage: z.string().trim().nullable().default(null),
  commercialPotential: z.enum(["high", "medium", "low"]).default("medium"),
  trustRisk: z.enum(["low", "medium", "high"]).default("low"),
  recommendedAngle: z.string().trim().min(1).default("Lead with the strongest teacher-facing value signal."),
  recommendedHookDirection: z.string().trim().min(1).default("Open with the concrete classroom pain or value tension."),
  recommendedFormat: z.enum(["text", "carousel", "short_video", "multi_asset"]).default("text"),
  recommendedPlatforms: z.array(z.string().trim().min(1)).default([]),
  whyNow: z.string().trim().min(1).default("Current weekly ranking surfaced this as a timely opportunity."),
  proofPoints: z.array(z.string().trim().min(1)).default([]),
  trustNotes: z.array(z.string().trim().min(1)).default([]),
  sourceSignalIds: z.array(z.string().trim().min(1)).default([]),
});

const outreachRelevantThemeExportSchema = z.object({
  themeId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  campaignLabel: z.string().trim().nullable().default(null),
});

const influencerRelevantPostSchema = z.object({
  itemId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  href: z.string().trim().min(1),
});

const campaignSupportSignalSchema = z.object({
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  campaignLabel: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  href: z.string().trim().min(1),
});

const distributionOpportunitySchema = z.object({
  opportunityId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  platformSet: z.array(z.string().trim().min(1)).min(1).max(4),
  rationale: z.string().trim().min(1),
  href: z.string().trim().min(1),
});

const relationshipContextHintExportSchema = z.object({
  hintId: z.string().trim().min(1),
  influencerId: z.string().trim().nullable().default(null),
  label: z.string().trim().min(1),
  relationshipStage: z.enum(RELATIONSHIP_STAGES).nullable().default(null),
  note: z.string().trim().min(1),
  href: z.string().trim().nullable().default(null),
});

const bridgeExportMetricsSchema = z.object({
  totalSignalsAvailable: z.number().int().nonnegative().default(0),
  visibleSignalsConsidered: z.number().int().nonnegative().default(0),
  approvalReadySignals: z.number().int().nonnegative().default(0),
  filteredOutSignals: z.number().int().nonnegative().default(0),
  weeklyPostingPackItemCount: z.number().int().nonnegative().default(0),
  fallbackCandidateCount: z.number().int().nonnegative().default(0),
  usedFallbackCandidates: z.boolean().default(false),
  strongContentCandidateCount: z.number().int().nonnegative().default(0),
  connectOpportunityCount: z.number().int().nonnegative().default(0),
  missingProofPointsCount: z.number().int().nonnegative().default(0),
  missingSourceSignalIdsCount: z.number().int().nonnegative().default(0),
  missingTeacherLanguageCount: z.number().int().nonnegative().default(0),
});

const bridgeGenerationStatusSchema = z.object({
  lastAttemptedAt: z.string().trim().nullable().default(null),
  lastAttemptOutcome: z.enum(["success", "failed"]).nullable().default(null),
  lastSuccessfulExportId: z.string().trim().nullable().default(null),
  lastSuccessfulExportAt: z.string().trim().nullable().default(null),
  lastDisposition: z
    .enum(["created_new", "replaced_latest", "reused_latest"])
    .nullable()
    .default(null),
  lastReplacedExportId: z.string().trim().nullable().default(null),
  lastFailedAt: z.string().trim().nullable().default(null),
  lastFailedError: z.string().trim().nullable().default(null),
  consecutiveFailureCount: z.number().int().nonnegative().default(0),
});

export const zazaConnectExportPayloadSchema = z.object({
  schemaVersion: z.string().trim().min(1).default(ZAZA_CONNECT_BRIDGE_SCHEMA_VERSION),
  producerVersion: z.string().trim().min(1).default(getZazaConnectBridgeProducerVersion()),
  exportId: z.string().trim().min(1),
  generatedAt: z.string().trim().min(1),
  weekStartDate: z.string().trim().nullable().default(null),
  contentFingerprint: z.string().trim().min(8),
  metrics: bridgeExportMetricsSchema,
  strongContentCandidates: z.array(strongContentCandidateSchema).default([]),
  outreachRelevantThemes: z.array(outreachRelevantThemeExportSchema).default([]),
  influencerRelevantPosts: z.array(influencerRelevantPostSchema).default([]),
  campaignSupportSignals: z.array(campaignSupportSignalSchema).default([]),
  distributionOpportunities: z.array(distributionOpportunitySchema).default([]),
  relationshipContextHints: z.array(relationshipContextHintExportSchema).default([]),
});

const zazaConnectBridgeStoreSchema = z.object({
  imports: z.array(zazaConnectImportedContextSchema).default([]),
  exports: z.array(zazaConnectExportPayloadSchema).default([]),
  generationStatus: bridgeGenerationStatusSchema.default({
    lastAttemptedAt: null,
    lastAttemptOutcome: null,
    lastSuccessfulExportId: null,
    lastSuccessfulExportAt: null,
    lastDisposition: null,
    lastReplacedExportId: null,
    lastFailedAt: null,
    lastFailedError: null,
    consecutiveFailureCount: 0,
  }),
  updatedAt: z.string().trim().nullable().default(null),
});

type ZazaConnectBridgeStore = z.infer<typeof zazaConnectBridgeStoreSchema>;

export type ZazaConnectImportedContext = z.infer<typeof zazaConnectImportedContextSchema>;
export type ZazaConnectExportPayload = z.infer<typeof zazaConnectExportPayloadSchema>;
export type ZazaConnectBridgeExportMetrics = z.infer<typeof bridgeExportMetricsSchema>;
export type ZazaConnectBridgeGenerationStatus = z.infer<typeof bridgeGenerationStatusSchema>;
export interface ZazaConnectExportSaveResult {
  savedExport: ZazaConnectExportPayload;
  disposition: ZazaConnectBridgeGenerationDisposition;
  replacedExportId: string | null;
}

export interface ZazaConnectSignalHints {
  matchedThemes: string[];
  creatorTags: string[];
  collaborationNotes: string[];
  replySignals: string[];
  relationshipHints: string[];
  summary: string[];
}

export interface ZazaConnectBridgeSummary {
  importCount: number;
  exportCount: number;
  latestImportAt: string | null;
  latestExportAt: string | null;
  importedThemeCount: number;
  collaborationOpportunityCount: number;
  relationshipHintCount: number;
  influencerRelevantExportCount: number;
  topNotes: string[];
}

export interface ZazaConnectBridgeStorageDiagnostics {
  backend: "blob" | "memory";
  blobPathname: string;
  blobAccess: "public" | "private";
  blobConfigured: boolean;
}

let inMemoryBridgeStore: ZazaConnectBridgeStore = zazaConnectBridgeStoreSchema.parse({
  imports: [],
  exports: [],
  generationStatus: {
    lastAttemptedAt: null,
    lastAttemptOutcome: null,
    lastSuccessfulExportId: null,
    lastSuccessfulExportAt: null,
    lastDisposition: null,
    lastReplacedExportId: null,
    lastFailedAt: null,
    lastFailedError: null,
    consecutiveFailureCount: 0,
  },
  updatedAt: null,
});

let inMemoryGenerationStatus: ZazaConnectBridgeGenerationStatus =
  bridgeGenerationStatusSchema.parse({});

function buildEmptyBridgeStore(): ZazaConnectBridgeStore {
  return zazaConnectBridgeStoreSchema.parse({
    imports: [],
    exports: [],
    generationStatus: {
      lastAttemptedAt: null,
      lastAttemptOutcome: null,
      lastSuccessfulExportId: null,
      lastSuccessfulExportAt: null,
      lastDisposition: null,
      lastReplacedExportId: null,
      lastFailedAt: null,
      lastFailedError: null,
      consecutiveFailureCount: 0,
    },
    updatedAt: null,
  });
}

function buildExportFingerprint(input: {
  weekStartDate: string | null;
  metrics: ZazaConnectBridgeExportMetrics;
  strongContentCandidates: z.infer<typeof strongContentCandidateSchema>[];
  outreachRelevantThemes: z.infer<typeof outreachRelevantThemeExportSchema>[];
  influencerRelevantPosts: z.infer<typeof influencerRelevantPostSchema>[];
  campaignSupportSignals: z.infer<typeof campaignSupportSignalSchema>[];
  distributionOpportunities: z.infer<typeof distributionOpportunitySchema>[];
  relationshipContextHints: z.infer<typeof relationshipContextHintExportSchema>[];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        weekStartDate: input.weekStartDate,
        metrics: input.metrics,
        strongContentCandidates: input.strongContentCandidates,
        outreachRelevantThemes: input.outreachRelevantThemes,
        influencerRelevantPosts: input.influencerRelevantPosts,
        campaignSupportSignals: input.campaignSupportSignals,
        distributionOpportunities: input.distributionOpportunities,
        relationshipContextHints: input.relationshipContextHints,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function isBlobBridgeStoreEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function logBlobBridgeStoreFallback(operation: "read" | "write", error: unknown) {
  const diagnostics = getZazaConnectBridgeStorageDiagnostics();
  const message = error instanceof Error ? error.message : "unknown error";
  console.warn(
    `zaza-connect-bridge: blob ${operation} failed, falling back to in-memory state (pathname=${diagnostics.blobPathname}, access=${diagnostics.blobAccess}). ${message}`,
  );
}

export function getZazaConnectBridgeStorageDiagnostics(): ZazaConnectBridgeStorageDiagnostics {
  return {
    backend: isBlobBridgeStoreEnabled() ? "blob" : "memory",
    blobPathname: ZAZA_CONNECT_BRIDGE_STORE_BLOB_PATHNAME,
    blobAccess: getZazaConnectBridgeBlobAccess(),
    blobConfigured: isBlobBridgeStoreEnabled(),
  };
}

function buildSeedImportedContexts(): ZazaConnectImportedContext[] {
  const now = new Date().toISOString();

  return [
    zazaConnectImportedContextSchema.parse({
      contextId: "zaza-connect-seed-1",
      sourceApp: "zaza_connect",
      importedAt: now,
      relationshipStageHints: [
        {
          hintId: "seed-hint-calm-teacher-creator",
          name: "Teacher workflow creator",
          relationshipStage: "contacted" satisfies RelationshipStage,
          tags: ["teacher", "creator", "workflow"],
          note: "Has responded best to calm trust-first product framing.",
        },
      ],
      creatorRelevanceTags: [
        {
          tagId: "seed-tag-parent-trust",
          label: "Parent trust",
          keywords: ["parent", "trust", "complaint", "communication"],
          note: "High relevance for creator and collaborator outreach this month.",
        },
      ],
      outreachCampaignThemes: [
        {
          themeId: "seed-theme-product-trust",
          label: "Product trust",
          keywords: ["trust", "overview", "teacher-first", "communication"],
          campaignLabel: "Trust push",
          note: "Zaza Connect is seeing stronger reply quality around calm product-trust framing.",
        },
      ],
      collaborationOpportunities: [
        {
          opportunityId: "seed-collab-observational",
          label: "Teacher observation collaboration",
          keywords: ["observation", "teacher workload", "communication"],
          relatedCampaign: "Trust push",
          note: "Good fit for collaboration-oriented follow-up content and outreach.",
        },
      ],
      replyContextSignals: [
        {
          replySignalId: "seed-reply-calm-non-hype",
          label: "Calm non-hype replies",
          keywords: ["trust", "calm", "teacher", "protective"],
          note: "Short replies land better when they stay observational and low-pressure.",
        },
      ],
      notes: "Seeded mock bridge context for UI testing and loose cross-app memory.",
    }),
  ];
}

async function readPersistedBridgeStore() {
  if (!isBlobBridgeStoreEnabled()) {
    return inMemoryBridgeStore;
  }

  try {
    const blob = await get(ZAZA_CONNECT_BRIDGE_STORE_BLOB_PATHNAME, {
      access: getZazaConnectBridgeBlobAccess(),
      useCache: false,
    });

    if (!blob || !blob.stream) {
      return buildEmptyBridgeStore();
    }

    const raw = await new Response(blob.stream).text();
    const parsed = zazaConnectBridgeStoreSchema.parse(JSON.parse(raw));
    inMemoryBridgeStore = parsed;
    return parsed;
  } catch (error) {
    logBlobBridgeStoreFallback("read", error);
    return inMemoryBridgeStore;
  }
}

async function writeBridgeStore(store: ZazaConnectBridgeStore) {
  const parsed = zazaConnectBridgeStoreSchema.parse(store);
  inMemoryBridgeStore = parsed;

  if (!isBlobBridgeStoreEnabled()) {
    return;
  }

  try {
    await put(
      ZAZA_CONNECT_BRIDGE_STORE_BLOB_PATHNAME,
      `${JSON.stringify(parsed, null, 2)}\n`,
      {
        access: getZazaConnectBridgeBlobAccess(),
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json; charset=utf-8",
      },
    );

    const persisted = await head(ZAZA_CONNECT_BRIDGE_STORE_BLOB_PATHNAME);

    if (!persisted || persisted.pathname !== ZAZA_CONNECT_BRIDGE_STORE_BLOB_PATHNAME) {
      throw new Error("Blob write completed but the bridge store could not be verified.");
    }
  } catch (error) {
    logBlobBridgeStoreFallback("write", error);
  }
}

function mergeImportedContexts(
  base: ZazaConnectImportedContext[],
  persisted: ZazaConnectImportedContext[],
) {
  const deduped = new Map<string, ZazaConnectImportedContext>();

  for (const context of [...base, ...persisted]) {
    deduped.set(context.contextId, context);
  }

  return [...deduped.values()].sort(
    (left, right) =>
      new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime(),
  );
}

export async function listImportedZazaConnectContexts() {
  const store = await readPersistedBridgeStore();
  return mergeImportedContexts(buildSeedImportedContexts(), store.imports);
}

export async function listZazaConnectExports() {
  const store = await readPersistedBridgeStore();
  return [...store.exports].sort(
    (left, right) =>
      new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime(),
  );
}

export async function getZazaConnectBridgeGenerationStatus() {
  const store = await readPersistedBridgeStore();
  return bridgeGenerationStatusSchema.parse({
    ...store.generationStatus,
    ...inMemoryGenerationStatus,
  });
}

export async function getZazaConnectBridgeRuntimeState() {
  const store = await readPersistedBridgeStore();
  const exports = [...store.exports].sort(
    (left, right) =>
      new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime(),
  );

  return {
    latestExport: exports[0] ?? null,
    exports,
    generationStatus: bridgeGenerationStatusSchema.parse({
      ...store.generationStatus,
      ...inMemoryGenerationStatus,
    }),
  };
}

export async function getLatestZazaConnectImport() {
  const contexts = await listImportedZazaConnectContexts();
  return contexts[0] ?? null;
}

export async function getLatestZazaConnectExport() {
  const exports = await listZazaConnectExports();
  return exports[0] ?? null;
}

export async function importZazaConnectContext(
  context: ZazaConnectImportedContext,
) {
  const parsed = zazaConnectImportedContextSchema.parse(context);
  const store = await readPersistedBridgeStore();
  const imports = [
    ...store.imports.filter((entry) => entry.contextId !== parsed.contextId),
    parsed,
  ].sort(
    (left, right) =>
      new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime(),
  );

  await writeBridgeStore({
    ...store,
    imports,
    updatedAt: parsed.importedAt,
  });

  return parsed;
}

export async function saveZazaConnectExport(payload: ZazaConnectExportPayload) {
  const parsed = zazaConnectExportPayloadSchema.parse(payload);
  const store = await readPersistedBridgeStore();
  const latestExistingExport = [...store.exports].sort(
    (left, right) =>
      new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime(),
  )[0];
  const filteredExisting = store.exports.filter((entry) => entry.exportId !== parsed.exportId);
  const shouldReplaceLatestByFingerprint =
    latestExistingExport?.contentFingerprint === parsed.contentFingerprint;
  const disposition: ZazaConnectBridgeGenerationDisposition = !latestExistingExport
    ? "created_new"
    : shouldReplaceLatestByFingerprint
      ? "reused_latest"
      : "replaced_latest";
  const replacedExportId =
    disposition === "replaced_latest" ? latestExistingExport?.exportId ?? null : null;
  const exports = [
    ...filteredExisting.filter((entry) =>
      shouldReplaceLatestByFingerprint ? entry.exportId !== latestExistingExport?.exportId : true,
    ),
    parsed,
  ]
    .sort(
      (left, right) =>
        new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime(),
    )
    .slice(0, ZAZA_CONNECT_BRIDGE_MAX_EXPORT_HISTORY);

  const generationStatus = bridgeGenerationStatusSchema.parse({
    ...store.generationStatus,
    lastAttemptedAt: parsed.generatedAt,
    lastAttemptOutcome: "success",
    lastSuccessfulExportId: parsed.exportId,
    lastSuccessfulExportAt: parsed.generatedAt,
    lastDisposition: disposition,
    lastReplacedExportId: replacedExportId,
    lastFailedError: null,
    consecutiveFailureCount: 0,
  });

  await writeBridgeStore({
    ...store,
    exports,
    generationStatus,
    updatedAt: parsed.generatedAt,
  });
  inMemoryGenerationStatus = generationStatus;

  return {
    savedExport: parsed,
    disposition,
    replacedExportId,
  } satisfies ZazaConnectExportSaveResult;
}

export async function recordZazaConnectExportFailure(input: {
  attemptedAt?: string;
  error: string;
}) {
  const attemptedAt = input.attemptedAt ?? new Date().toISOString();
  const previousStatus = await getZazaConnectBridgeGenerationStatus();
  const nextStatus = bridgeGenerationStatusSchema.parse({
    ...previousStatus,
    lastAttemptedAt: attemptedAt,
    lastAttemptOutcome: "failed",
    lastFailedAt: attemptedAt,
    lastFailedError: input.error,
    consecutiveFailureCount: previousStatus.consecutiveFailureCount + 1,
  });

  inMemoryGenerationStatus = nextStatus;

  try {
    const store = await readPersistedBridgeStore();
    await writeBridgeStore({
      ...store,
      generationStatus: nextStatus,
      updatedAt: attemptedAt,
    });
  } catch {
    // Keep the failure in memory even if persistence is unavailable.
  }

  return nextStatus;
}

export function buildZazaConnectSignalHints(input: {
  signal: SignalRecord;
  importedContexts: ZazaConnectImportedContext[];
  influencerName?: string | null;
  influencerTags?: string[];
  relationshipStage?: RelationshipStage | null;
}) {
  const haystack = toSearchHaystack(input.signal);
  const lowerInfluencerName = input.influencerName?.toLowerCase() ?? null;
  const lowerInfluencerTags = new Set((input.influencerTags ?? []).map((tag) => tag.toLowerCase()));
  const matchedThemes: string[] = [];
  const creatorTags: string[] = [];
  const collaborationNotes: string[] = [];
  const replySignals: string[] = [];
  const relationshipHints: string[] = [];
  const summary: string[] = [];

  for (const context of input.importedContexts) {
    for (const theme of context.outreachCampaignThemes) {
      if (matchesKeywords(haystack, theme.keywords)) {
        matchedThemes.push(theme.label);
        if (theme.note) {
          summary.push(theme.note);
        }
      }
    }

    for (const tag of context.creatorRelevanceTags) {
      if (
        matchesKeywords(haystack, tag.keywords) ||
        tag.keywords.some((keyword) => lowerInfluencerTags.has(keyword.toLowerCase()))
      ) {
        creatorTags.push(tag.label);
        if (tag.note) {
          summary.push(tag.note);
        }
      }
    }

    for (const opportunity of context.collaborationOpportunities) {
      if (matchesKeywords(haystack, opportunity.keywords)) {
        collaborationNotes.push(opportunity.label);
        if (opportunity.note) {
          summary.push(opportunity.note);
        }
      }
    }

    for (const replySignal of context.replyContextSignals) {
      if (matchesKeywords(haystack, replySignal.keywords)) {
        replySignals.push(replySignal.label);
        if (replySignal.note) {
          summary.push(replySignal.note);
        }
      }
    }

    for (const hint of context.relationshipStageHints) {
      const nameMatches =
        lowerInfluencerName &&
        [hint.name, hint.handle]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(lowerInfluencerName));
      const stageMatches = input.relationshipStage && hint.relationshipStage === input.relationshipStage;
      const tagMatches = hint.tags.some((tag) => lowerInfluencerTags.has(tag.toLowerCase()));

      if (nameMatches || stageMatches || tagMatches) {
        relationshipHints.push(
          hint.note ??
            `${hint.name ?? "Relationship context"} is currently ${hint.relationshipStage}.`,
        );
      }
    }
  }

  const dedupe = (values: string[]) => [...new Set(values)].slice(0, 4);

  return {
    matchedThemes: dedupe(matchedThemes),
    creatorTags: dedupe(creatorTags),
    collaborationNotes: dedupe(collaborationNotes),
    replySignals: dedupe(replySignals),
    relationshipHints: dedupe(relationshipHints),
    summary: dedupe(summary),
  } satisfies ZazaConnectSignalHints;
}

export function buildZazaConnectExportPayload(input: {
  weeklyPostingPack: WeeklyPostingPack;
  sequences: NarrativeSequence[];
  influencerGraph: {
    rows: InfluencerGraphRow[];
    summary: InfluencerGraphSummary;
  };
  metrics: Omit<
    ZazaConnectBridgeExportMetrics,
    | "strongContentCandidateCount"
    | "connectOpportunityCount"
    | "missingProofPointsCount"
    | "missingSourceSignalIdsCount"
    | "missingTeacherLanguageCount"
  >;
  fallbackCandidates?: BridgeFallbackCandidateInput[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const items = input.weeklyPostingPack.items;
  const strongContentCandidates =
    items.length > 0
      ? items.slice(0, 5).map((item) =>
          strongContentCandidateSchema.parse({
            candidateId: item.itemId,
            signalId: item.signalId,
            sourceTitle: item.sourceTitle,
            platform: item.platformLabel,
            expectedOutcomeTier: item.expectedOutcomeTier,
            reason: item.whySelected,
            href: item.href,
            primaryPainPoint: item.strongestValueSignal,
            teacherLanguage: [],
            audienceSegment: item.destinationLabel,
            funnelStage: item.funnelStageLabel ?? item.funnelStage,
            commercialPotential: item.expectedOutcomeTier,
            trustRisk: mapTrustRisk({
              expectedOutcomeTier: item.expectedOutcomeTier,
              keyCaution: item.keyCaution,
            }),
            recommendedAngle: item.strongestValueSignal,
            recommendedHookDirection: item.whySelected,
            recommendedFormat: mapRecommendedFormat({
              platform: item.platform,
              editorialModeLabel: item.editorialModeLabel,
              sequenceContext: item.sequenceContext,
            }),
            recommendedPlatforms: [item.platform],
            whyNow: item.whySelected,
            proofPoints: [...new Set([item.strongestValueSignal, ...item.includedBecause, ...item.strongestReasons])].slice(0, 5),
            trustNotes: item.keyCaution ? [item.keyCaution] : [],
            sourceSignalIds: [item.signalId],
          }),
        )
      : (input.fallbackCandidates ?? []).slice(0, 5).map((candidate) => {
          const ci = buildContentIntelligenceFromSignal(candidate);

          return strongContentCandidateSchema.parse({
            candidateId: candidate.candidateId,
            signalId: candidate.signalId,
            sourceTitle: candidate.sourceTitle,
            platform: candidate.platform,
            expectedOutcomeTier: candidate.expectedOutcomeTier,
            reason: candidate.reason,
            href: candidate.href,
            primaryPainPoint:
              normalizeText(candidate.primaryPainPoint) ??
              "High-priority teacher pain point worth addressing.",
            teacherLanguage: candidate.teacherLanguage ?? [],
            audienceSegment: candidate.audienceSegment ?? null,
            funnelStage: candidate.funnelStage ?? null,
            commercialPotential:
              candidate.commercialPotential ?? candidate.expectedOutcomeTier,
            trustRisk: candidate.trustRisk ?? "medium",
            recommendedAngle:
              normalizeText(candidate.recommendedAngle) ??
              normalizeText(candidate.primaryPainPoint) ??
              "Lead with the strongest teacher-facing value signal.",
            recommendedHookDirection:
              normalizeText(candidate.recommendedHookDirection) ??
              normalizeText(candidate.reason) ??
              "Open with the concrete classroom pain or value tension.",
            recommendedFormat: ci.recommendedFormat || candidate.recommendedFormat || "text",
            recommendedPlatforms: candidate.recommendedPlatforms ?? [],
            whyNow:
              normalizeText(candidate.whyNow) ??
              normalizeText(candidate.reason) ??
              "Current review ranking surfaced this as a timely opportunity.",
            proofPoints: candidate.proofPoints ?? [],
            trustNotes: candidate.trustNotes ?? [],
            sourceSignalIds: candidate.sourceSignalIds ?? [candidate.signalId],
          });
        });

  const outreachRelevantThemes = [...new Map(
    items
      .map((item) => {
        const label =
          item.sequenceContext?.narrativeLabel ??
          item.campaignContext ??
          item.editorialModeLabel;
        if (!label) {
          return null;
        }

        return [
          label,
          outreachRelevantThemeExportSchema.parse({
            themeId: `theme:${asSlug(label)}`,
            label,
            reason:
              item.sequenceContext?.sequenceReason ??
              item.strongestValueSignal,
            campaignLabel: item.campaignContext,
          }),
        ] as const;
      })
      .filter((entry): entry is readonly [string, z.infer<typeof outreachRelevantThemeExportSchema>] => Boolean(entry)),
  ).values()].slice(0, 6);

  const influencerRelevantPosts = items
    .filter(
      (item) =>
        item.founderVoiceMode === "founder_voice_on" ||
        item.sequenceContext?.role === "trust_builder" ||
        item.sequenceContext?.role === "reflection" ||
        item.sequenceContext?.role === "discussion",
    )
    .slice(0, 5)
    .map((item) =>
      influencerRelevantPostSchema.parse({
        itemId: item.itemId,
        signalId: item.signalId,
        sourceTitle: item.sourceTitle,
        platform: item.platformLabel,
        reason:
          item.sequenceContext
            ? `Fits ${item.sequenceContext.roleLabel.toLowerCase()} role in ${item.sequenceContext.narrativeLabel}.`
            : item.whySelected,
        href: item.href,
      }),
    );

  const campaignSupportSignals = items
    .filter((item) => item.campaignContext)
    .slice(0, 5)
    .map((item) =>
      campaignSupportSignalSchema.parse({
        signalId: item.signalId,
        sourceTitle: item.sourceTitle,
        campaignLabel: item.campaignContext,
        summary: item.strongestValueSignal,
        href: item.href,
      }),
    );

  const distributionOpportunities = [
    ...input.sequences.slice(0, 4).map((sequence) =>
      distributionOpportunitySchema.parse({
        opportunityId: sequence.sequenceId,
        label: sequence.narrativeLabel,
        platformSet: sequence.orderedSteps.map((step) => step.platform),
        rationale: sequence.sequenceReason,
        href: "/weekly-pack",
      }),
    ),
    ...items
      .filter((item) => !item.sequenceContext)
      .slice(0, 2)
      .map((item) =>
        distributionOpportunitySchema.parse({
          opportunityId: `distribution:${item.itemId}`,
          label: item.sourceTitle,
          platformSet: [item.platform],
          rationale: item.whySelected,
          href: item.href,
        }),
      ),
  ].slice(0, 6);

  const relationshipContextHints = input.influencerGraph.rows
    .filter((row) => row.followUpNeeded || row.newReplyPending)
    .slice(0, 5)
    .map((row) =>
      relationshipContextHintExportSchema.parse({
        hintId: `relationship:${row.influencer.influencerId}`,
        influencerId: row.influencer.influencerId,
        label: row.influencer.name,
        relationshipStage: row.influencer.relationshipStage,
        note:
          row.latestInteraction?.context ??
          row.influencer.notes ??
          "Relationship memory exists and may shape outreach timing.",
        href: "/influencers",
      }),
    );

  const metrics = bridgeExportMetricsSchema.parse({
    ...input.metrics,
    strongContentCandidateCount: strongContentCandidates.length,
    connectOpportunityCount: strongContentCandidates.length,
    missingProofPointsCount: strongContentCandidates.filter((candidate) => candidate.proofPoints.length === 0).length,
    missingSourceSignalIdsCount: strongContentCandidates.filter((candidate) => candidate.sourceSignalIds.length === 0).length,
    missingTeacherLanguageCount: strongContentCandidates.filter((candidate) => candidate.teacherLanguage.length === 0).length,
  });
  const contentFingerprint = buildExportFingerprint({
    weekStartDate: input.weeklyPostingPack.weekStartDate,
    metrics,
    strongContentCandidates,
    outreachRelevantThemes,
    influencerRelevantPosts,
    campaignSupportSignals,
    distributionOpportunities,
    relationshipContextHints,
  });
  const generatedAt = now.toISOString();

  return zazaConnectExportPayloadSchema.parse({
    schemaVersion: ZAZA_CONNECT_BRIDGE_SCHEMA_VERSION,
    producerVersion: getZazaConnectBridgeProducerVersion(),
    exportId: `connect-export:${generatedAt}:${contentFingerprint.slice(0, 8)}`,
    generatedAt,
    weekStartDate: input.weeklyPostingPack.weekStartDate,
    contentFingerprint,
    metrics,
    strongContentCandidates,
    outreachRelevantThemes,
    influencerRelevantPosts,
    campaignSupportSignals,
    distributionOpportunities,
    relationshipContextHints,
  });
}

export function buildZazaConnectBridgeSummary(input: {
  latestExport: ZazaConnectExportPayload | null;
  importedContexts: ZazaConnectImportedContext[];
  influencerGraphSummary?: InfluencerGraphSummary | null;
}) {
  const importedThemeCount = input.importedContexts.reduce(
    (total, context) => total + context.outreachCampaignThemes.length,
    0,
  );
  const collaborationOpportunityCount = input.importedContexts.reduce(
    (total, context) => total + context.collaborationOpportunities.length,
    0,
  );
  const relationshipHintCount = input.importedContexts.reduce(
    (total, context) => total + context.relationshipStageHints.length,
    0,
  );
  const topNotes: string[] = [];

  if ((input.latestExport?.influencerRelevantPosts.length ?? 0) > 0) {
    topNotes.push(
      `This week’s export includes ${input.latestExport?.influencerRelevantPosts.length} influencer-relevant content item${input.latestExport?.influencerRelevantPosts.length === 1 ? "" : "s"}.`,
    );
  }

  if (input.importedContexts[0]?.outreachCampaignThemes[0]) {
    topNotes.push(
      `Imported outreach theme: ${input.importedContexts[0].outreachCampaignThemes[0].label}.`,
    );
  }

  if (input.importedContexts[0]?.collaborationOpportunities[0]) {
    topNotes.push(
      `Collaboration context: ${input.importedContexts[0].collaborationOpportunities[0].label}.`,
    );
  }

  if ((input.influencerGraphSummary?.followUpNeededCount ?? 0) > 0) {
    topNotes.push(
      `${input.influencerGraphSummary?.followUpNeededCount} relationship follow-up${input.influencerGraphSummary?.followUpNeededCount === 1 ? "" : "s"} may shape outreach timing.`,
    );
  }

  return {
    importCount: input.importedContexts.length,
    exportCount: input.latestExport ? 1 : 0,
    latestImportAt: input.importedContexts[0]?.importedAt ?? null,
    latestExportAt: input.latestExport?.generatedAt ?? null,
    importedThemeCount,
    collaborationOpportunityCount,
    relationshipHintCount,
    influencerRelevantExportCount: input.latestExport?.influencerRelevantPosts.length ?? 0,
    topNotes: topNotes.slice(0, 4),
  } satisfies ZazaConnectBridgeSummary;
}
