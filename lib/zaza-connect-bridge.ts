import { get, put } from "@vercel/blob";
import { z } from "zod";

import type { InfluencerGraphRow, InfluencerGraphSummary } from "@/lib/influencer-graph";
import { RELATIONSHIP_STAGES, type RelationshipStage } from "@/lib/influencer-graph-definitions";
import type { NarrativeSequence } from "@/lib/narrative-sequences";
import type { WeeklyPostingPack } from "@/lib/weekly-posting-pack";
import type { SignalRecord } from "@/types/signal";

const ZAZA_CONNECT_BRIDGE_STORE_BLOB_PATHNAME = "zaza-connect-bridge/store.json";
const ZAZA_CONNECT_BRIDGE_BLOB_ACCESS =
  process.env.ZAZA_CONNECT_BRIDGE_BLOB_ACCESS === "private"
    ? "private"
    : "public";

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

export const zazaConnectExportPayloadSchema = z.object({
  exportId: z.string().trim().min(1),
  generatedAt: z.string().trim().min(1),
  weekStartDate: z.string().trim().nullable().default(null),
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
  updatedAt: z.string().trim().nullable().default(null),
});

type ZazaConnectBridgeStore = z.infer<typeof zazaConnectBridgeStoreSchema>;

export type ZazaConnectImportedContext = z.infer<typeof zazaConnectImportedContextSchema>;
export type ZazaConnectExportPayload = z.infer<typeof zazaConnectExportPayloadSchema>;

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

let inMemoryBridgeStore: ZazaConnectBridgeStore = zazaConnectBridgeStoreSchema.parse({
  imports: [],
  exports: [],
  updatedAt: null,
});

function buildEmptyBridgeStore(): ZazaConnectBridgeStore {
  return zazaConnectBridgeStoreSchema.parse({
    imports: [],
    exports: [],
    updatedAt: null,
  });
}

function isBlobBridgeStoreEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
      access: ZAZA_CONNECT_BRIDGE_BLOB_ACCESS,
      useCache: false,
    });

    if (!blob || !blob.stream) {
      return buildEmptyBridgeStore();
    }

    const raw = await new Response(blob.stream).text();
    return zazaConnectBridgeStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(
      `Unable to read Zaza Connect bridge store from Vercel Blob: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

async function writeBridgeStore(store: ZazaConnectBridgeStore) {
  const parsed = zazaConnectBridgeStoreSchema.parse(store);

  if (!isBlobBridgeStoreEnabled()) {
    inMemoryBridgeStore = parsed;
    return;
  }

  try {
    await put(
      ZAZA_CONNECT_BRIDGE_STORE_BLOB_PATHNAME,
      `${JSON.stringify(parsed, null, 2)}\n`,
      {
        access: ZAZA_CONNECT_BRIDGE_BLOB_ACCESS,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json; charset=utf-8",
      },
    );
  } catch (error) {
    throw new Error(
      `Unable to write Zaza Connect bridge store to Vercel Blob: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
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
  const exports = [
    ...store.exports.filter((entry) => entry.exportId !== parsed.exportId),
    parsed,
  ].sort(
    (left, right) =>
      new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime(),
  );

  await writeBridgeStore({
    ...store,
    exports,
    updatedAt: parsed.generatedAt,
  });

  return parsed;
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
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const items = input.weeklyPostingPack.items;
  const strongContentCandidates = items.slice(0, 5).map((item) =>
    strongContentCandidateSchema.parse({
      candidateId: item.itemId,
      signalId: item.signalId,
      sourceTitle: item.sourceTitle,
      platform: item.platformLabel,
      expectedOutcomeTier: item.expectedOutcomeTier,
      reason: item.whySelected,
      href: item.href,
    }),
  );

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

  return zazaConnectExportPayloadSchema.parse({
    exportId: `connect-export:${now.toISOString()}`,
    generatedAt: now.toISOString(),
    weekStartDate: input.weeklyPostingPack.weekStartDate,
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
