import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  getInteractionTypeLabel,
  getRelationshipStageLabel,
  INFLUENCER_INTERACTION_TYPES,
  INFLUENCER_PLATFORMS,
  influencerInteractionSchema,
  influencerRecordSchema,
  RELATIONSHIP_STAGES,
  type InfluencerInteractionType,
  type InfluencerPlatform,
  type RelationshipStage,
} from "@/lib/influencer-graph-definitions";
import { mockInfluencerGraphSeed } from "@/lib/mock-data";

const INFLUENCER_GRAPH_STORE_PATH = path.join(process.cwd(), "data", "influencer-graph.json");

const influencerGraphStoreSchema = z.object({
  influencers: z.array(influencerRecordSchema).default([]),
  interactions: z.array(influencerInteractionSchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export const influencerGraphActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_influencer"),
    name: z.string().trim().min(1),
    platform: z.enum(INFLUENCER_PLATFORMS),
    handle: z.string().trim().nullable().optional(),
    tags: z.array(z.string().trim().min(1)).max(8).optional(),
    notes: z.string().trim().nullable().optional(),
  }),
  z.object({
    action: z.literal("record_interaction"),
    influencerId: z.string().trim().min(1),
    interactionType: z.enum(INFLUENCER_INTERACTION_TYPES),
    message: z.string().trim().nullable().optional(),
    context: z.string().trim().nullable().optional(),
    signalId: z.string().trim().nullable().optional(),
    timestamp: z.string().trim().nullable().optional(),
  }),
]);

export type InfluencerRecord = z.infer<typeof influencerRecordSchema>;
export type InfluencerInteraction = z.infer<typeof influencerInteractionSchema>;
export type InfluencerGraphActionRequest = z.infer<typeof influencerGraphActionRequestSchema>;

export interface InfluencerGraphRow {
  influencer: InfluencerRecord;
  interactions: InfluencerInteraction[];
  latestInteraction: InfluencerInteraction | null;
  followUpNeeded: boolean;
  newReplyPending: boolean;
}

export interface InfluencerGraphSummary {
  influencerCount: number;
  followUpNeededCount: number;
  newRepliesPendingCount: number;
  relationshipOpportunityCount: number;
  collaboratorCount: number;
}

export interface InfluencerGraphState {
  rows: InfluencerGraphRow[];
  summary: InfluencerGraphSummary;
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeTags(tags: string[] | null | undefined) {
  return Array.from(
    new Set(
      (tags ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 8);
}

function stageWeight(stage: RelationshipStage) {
  switch (stage) {
    case "contacted":
      return 2;
    case "replied":
      return 3;
    case "engaged":
      return 4;
    case "collaborator":
      return 5;
    case "new":
    default:
      return 1;
  }
}

function nextStageFromInteractions(
  influencer: InfluencerRecord | null,
  interactions: InfluencerInteraction[],
): RelationshipStage {
  const currentStage = influencer?.relationshipStage ?? "new";
  if (currentStage === "collaborator") {
    return currentStage;
  }

  const replyCount = interactions.filter((interaction) => interaction.interactionType === "reply_received").length;
  const outboundCount = interactions.filter(
    (interaction) =>
      interaction.interactionType === "message_sent" ||
      interaction.interactionType === "follow_up_sent",
  ).length;
  const collaborationHint =
    normalizeText(influencer?.notes)?.toLowerCase().includes("collab") ||
    interactions.some((interaction) =>
      `${interaction.message ?? ""} ${interaction.context ?? ""}`.toLowerCase().includes("collab"),
    );

  if (collaborationHint && replyCount > 0) {
    return "collaborator";
  }
  if (replyCount >= 2 || (replyCount >= 1 && outboundCount >= 2)) {
    return "engaged";
  }
  if (replyCount >= 1) {
    return "replied";
  }
  if (outboundCount >= 1) {
    return "contacted";
  }
  return currentStage;
}

function sortInteractions(interactions: InfluencerInteraction[]) {
  return [...interactions].sort(
    (left, right) =>
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
      right.interactionId.localeCompare(left.interactionId),
  );
}

function sortInfluencers(influencers: InfluencerRecord[]) {
  return [...influencers].sort(
    (left, right) =>
      new Date(right.lastInteraction ?? right.updatedAt).getTime() -
        new Date(left.lastInteraction ?? left.updatedAt).getTime() ||
      stageWeight(right.relationshipStage) - stageWeight(left.relationshipStage) ||
      left.name.localeCompare(right.name),
  );
}

function buildSeedStore() {
  return influencerGraphStoreSchema.parse(mockInfluencerGraphSeed);
}

async function readPersistedStore() {
  try {
    const raw = await readFile(INFLUENCER_GRAPH_STORE_PATH, "utf8");
    return influencerGraphStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return influencerGraphStoreSchema.parse({
        influencers: [],
        interactions: [],
        updatedAt: null,
      });
    }

    throw error;
  }
}

function mergeStores(
  baseStore: z.infer<typeof influencerGraphStoreSchema>,
  persistedStore: z.infer<typeof influencerGraphStoreSchema>,
) {
  const influencerMap = new Map<string, InfluencerRecord>();
  for (const influencer of [...baseStore.influencers, ...persistedStore.influencers]) {
    influencerMap.set(influencer.influencerId, influencerRecordSchema.parse(influencer));
  }

  const interactionMap = new Map<string, InfluencerInteraction>();
  for (const interaction of [...baseStore.interactions, ...persistedStore.interactions]) {
    interactionMap.set(interaction.interactionId, influencerInteractionSchema.parse(interaction));
  }

  return influencerGraphStoreSchema.parse({
    influencers: sortInfluencers(Array.from(influencerMap.values())),
    interactions: sortInteractions(Array.from(interactionMap.values())),
    updatedAt:
      persistedStore.updatedAt ??
      baseStore.updatedAt ??
      Array.from(influencerMap.values())[0]?.updatedAt ??
      null,
  });
}

async function readStore() {
  return mergeStores(buildSeedStore(), await readPersistedStore());
}

async function writeStore(store: z.infer<typeof influencerGraphStoreSchema>) {
  await mkdir(path.dirname(INFLUENCER_GRAPH_STORE_PATH), { recursive: true });
  await writeFile(INFLUENCER_GRAPH_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildInteractionIndex(interactions: InfluencerInteraction[]) {
  const index = new Map<string, InfluencerInteraction[]>();
  for (const interaction of interactions) {
    index.set(
      interaction.influencerId,
      sortInteractions([...(index.get(interaction.influencerId) ?? []), interaction]),
    );
  }
  return index;
}

function isFollowUpNeeded(influencer: InfluencerRecord, latestInteraction: InfluencerInteraction | null) {
  if (!latestInteraction) {
    return false;
  }
  if (!["contacted", "replied", "engaged"].includes(influencer.relationshipStage)) {
    return false;
  }

  const daysSinceInteraction =
    (Date.now() - new Date(latestInteraction.timestamp).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceInteraction >= 7;
}

function isReplyPending(interactions: InfluencerInteraction[]) {
  const latestReply = sortInteractions(
    interactions.filter((interaction) => interaction.interactionType === "reply_received"),
  )[0];
  if (!latestReply) {
    return false;
  }

  const latestOutbound = sortInteractions(
    interactions.filter(
      (interaction) =>
        interaction.interactionType === "message_sent" ||
        interaction.interactionType === "follow_up_sent",
    ),
  )[0];

  if (!latestOutbound) {
    return true;
  }

  return new Date(latestReply.timestamp).getTime() > new Date(latestOutbound.timestamp).getTime();
}

export async function listInfluencers() {
  const store = await readStore();
  return sortInfluencers(store.influencers);
}

export async function listInfluencerInteractions(influencerId?: string) {
  const store = await readStore();
  const interactions = influencerId
    ? store.interactions.filter((interaction) => interaction.influencerId === influencerId)
    : store.interactions;
  return sortInteractions(interactions);
}

export async function getInfluencerById(influencerId: string) {
  const influencers = await listInfluencers();
  return influencers.find((influencer) => influencer.influencerId === influencerId) ?? null;
}

export async function buildInfluencerGraphState(): Promise<InfluencerGraphState> {
  const store = await readStore();
  const interactionIndex = buildInteractionIndex(store.interactions);
  const rows: InfluencerGraphRow[] = sortInfluencers(store.influencers).map((influencer) => {
    const interactions = interactionIndex.get(influencer.influencerId) ?? [];
    const latestInteraction = interactions[0] ?? null;
    return {
      influencer,
      interactions: interactions.slice(0, 8),
      latestInteraction,
      followUpNeeded: isFollowUpNeeded(influencer, latestInteraction),
      newReplyPending: isReplyPending(interactions),
    };
  });

  return {
    rows,
    summary: {
      influencerCount: rows.length,
      followUpNeededCount: rows.filter((row) => row.followUpNeeded).length,
      newRepliesPendingCount: rows.filter((row) => row.newReplyPending).length,
      relationshipOpportunityCount: rows.filter((row) => row.influencer.relationshipStage === "new").length,
      collaboratorCount: rows.filter((row) => row.influencer.relationshipStage === "collaborator").length,
    } satisfies InfluencerGraphSummary,
  };
}

export async function addInfluencer(input: {
  name: string;
  platform: InfluencerPlatform;
  handle?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}) {
  const persistedStore = await readPersistedStore();
  const now = new Date().toISOString();
  const influencer = influencerRecordSchema.parse({
    influencerId: `influencer:${crypto.randomUUID()}`,
    name: input.name.trim(),
    platform: input.platform,
    handle: normalizeText(input.handle),
    tags: normalizeTags(input.tags),
    relationshipStage: "new",
    lastInteraction: null,
    notes: normalizeText(input.notes),
    createdAt: now,
    updatedAt: now,
  });

  await writeStore(
    influencerGraphStoreSchema.parse({
      influencers: sortInfluencers([influencer, ...persistedStore.influencers]),
      interactions: persistedStore.interactions,
      updatedAt: now,
    }),
  );

  return influencer;
}

export async function recordInfluencerInteraction(input: {
  influencerId: string;
  interactionType: InfluencerInteractionType;
  message?: string | null;
  context?: string | null;
  signalId?: string | null;
  timestamp?: string | null;
}) {
  const store = await readStore();
  const influencer = store.influencers.find(
    (entry) => entry.influencerId === input.influencerId,
  );
  if (!influencer) {
    throw new Error("Influencer not found.");
  }

  const timestamp = normalizeText(input.timestamp) ?? new Date().toISOString();
  const interaction = influencerInteractionSchema.parse({
    interactionId: `interaction:${crypto.randomUUID()}`,
    influencerId: input.influencerId,
    interactionType: input.interactionType,
    message: normalizeText(input.message),
    context: normalizeText(input.context),
    signalId: normalizeText(input.signalId),
    timestamp,
  });

  const nextInteractions = sortInteractions([interaction, ...store.interactions]);
  const interactionsForInfluencer = nextInteractions.filter(
    (entry) => entry.influencerId === input.influencerId,
  );
  const nextInfluencer = influencerRecordSchema.parse({
    ...influencer,
    relationshipStage: nextStageFromInteractions(influencer, interactionsForInfluencer),
    lastInteraction: timestamp,
    updatedAt: new Date().toISOString(),
  });

  await writeStore(
    influencerGraphStoreSchema.parse({
      influencers: sortInfluencers([
        nextInfluencer,
        ...store.influencers.filter((entry) => entry.influencerId !== nextInfluencer.influencerId),
      ]),
      interactions: nextInteractions,
      updatedAt: nextInfluencer.updatedAt,
    }),
  );

  return {
    influencer: nextInfluencer,
    interaction,
  };
}

export async function buildInfluencerOutreachContext(influencerId: string) {
  const store = await readStore();
  const influencer =
    store.influencers.find((entry) => entry.influencerId === influencerId) ?? null;
  if (!influencer) {
    return null;
  }
  const interactions = sortInteractions(
    store.interactions.filter((entry) => entry.influencerId === influencerId),
  );

  return {
    influencer,
    interactions: interactions.slice(0, 5),
    latestInteraction: interactions[0] ?? null,
    newReplyPending: isReplyPending(interactions),
  };
}

export {
  getInteractionTypeLabel,
  getRelationshipStageLabel,
  INFLUENCER_INTERACTION_TYPES,
  INFLUENCER_PLATFORMS,
  RELATIONSHIP_STAGES,
};
