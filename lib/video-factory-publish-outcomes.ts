import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "./serverless-persistence";

const FACTORY_PUBLISH_OUTCOME_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "video-factory-publish-outcomes.json",
);

export const FACTORY_PUBLISH_PLATFORMS = ["x", "linkedin", "reddit"] as const;

export const FACTORY_ATTRIBUTION_SOURCES = [
  "manual_operator",
  "native_platform_analytics",
  "site_analytics",
  "crm",
  "self_reported",
  "other",
] as const;

export const factoryPublishOutcomeSchema = z.object({
  publishOutcomeId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  factoryJobId: z.string().trim().nullable().default(null),
  renderJobId: z.string().trim().min(1),
  renderedAssetId: z.string().trim().min(1),
  assetReviewId: z.string().trim().nullable().default(null),
  published: z.boolean(),
  platform: z.enum(FACTORY_PUBLISH_PLATFORMS).nullable().default(null),
  publishDate: z.string().trim().nullable().default(null),
  publishedUrl: z.string().trim().nullable().default(null),
  impressions: z.number().int().nonnegative().nullable().default(null),
  clicks: z.number().int().nonnegative().nullable().default(null),
  signups: z.number().int().nonnegative().nullable().default(null),
  notes: z.string().trim().nullable().default(null),
  attributionSource: z.enum(FACTORY_ATTRIBUTION_SOURCES).nullable().default(null),
  createdAt: z.string().trim().min(1),
  lastUpdatedAt: z.string().trim().min(1),
});

export const upsertFactoryPublishOutcomeInputSchema = z
  .object({
    opportunityId: z.string().trim().min(1),
    videoBriefId: z.string().trim().min(1),
    factoryJobId: z.string().trim().nullable().optional(),
    renderJobId: z.string().trim().min(1),
    renderedAssetId: z.string().trim().min(1),
    assetReviewId: z.string().trim().nullable().optional(),
    published: z.boolean(),
    platform: z.enum(FACTORY_PUBLISH_PLATFORMS).nullable().optional(),
    publishDate: z.string().trim().nullable().optional(),
    publishedUrl: z.string().trim().nullable().optional(),
    impressions: z.number().int().nonnegative().nullable().optional(),
    clicks: z.number().int().nonnegative().nullable().optional(),
    signups: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().nullable().optional(),
    attributionSource: z.enum(FACTORY_ATTRIBUTION_SOURCES).nullable().optional(),
    updatedAt: z.string().trim().optional(),
  })
  .superRefine((value, context) => {
    if (value.published && !value.platform) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platform"],
        message: "Platform is required when a publish outcome is marked as published.",
      });
    }
  });

const factoryPublishOutcomeStoreSchema = z.record(
  z.string(),
  factoryPublishOutcomeSchema,
);

export type FactoryPublishOutcome = z.infer<typeof factoryPublishOutcomeSchema>;
export type UpsertFactoryPublishOutcomeInput = z.infer<
  typeof upsertFactoryPublishOutcomeInputSchema
>;
export type FactoryAttributionSource =
  (typeof FACTORY_ATTRIBUTION_SOURCES)[number];

let inMemoryFactoryPublishOutcomeStore: Record<string, FactoryPublishOutcome> =
  {};

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function factoryPublishOutcomeId(renderedAssetId: string) {
  return `${renderedAssetId}:publish-outcome`;
}

async function readPersistedStore(): Promise<Record<string, FactoryPublishOutcome>> {
  try {
    const raw = await readFile(FACTORY_PUBLISH_OUTCOME_STORE_PATH, "utf8");
    const parsed = factoryPublishOutcomeStoreSchema.parse(JSON.parse(raw));
    inMemoryFactoryPublishOutcomeStore = parsed;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryFactoryPublishOutcomeStore;
    }

    throw error;
  }
}

async function writeStore(store: Record<string, FactoryPublishOutcome>) {
  const parsed = factoryPublishOutcomeStoreSchema.parse(store);
  inMemoryFactoryPublishOutcomeStore = parsed;

  try {
    await mkdir(path.dirname(FACTORY_PUBLISH_OUTCOME_STORE_PATH), {
      recursive: true,
    });
    await writeFile(
      FACTORY_PUBLISH_OUTCOME_STORE_PATH,
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("video-factory-publish-outcomes", error);
      return;
    }

    throw error;
  }
}

export function buildFactoryPublishOutcomeRecord(
  input: UpsertFactoryPublishOutcomeInput,
  existing?: FactoryPublishOutcome | null,
): FactoryPublishOutcome {
  const timestamp = input.updatedAt ?? new Date().toISOString();

  return factoryPublishOutcomeSchema.parse({
    publishOutcomeId:
      existing?.publishOutcomeId ?? factoryPublishOutcomeId(input.renderedAssetId),
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId,
    factoryJobId: input.factoryJobId ?? existing?.factoryJobId ?? null,
    renderJobId: input.renderJobId,
    renderedAssetId: input.renderedAssetId,
    assetReviewId: input.assetReviewId ?? existing?.assetReviewId ?? null,
    published: input.published,
    platform:
      input.platform === undefined ? existing?.platform ?? null : input.platform,
    publishDate:
      input.publishDate === undefined
        ? existing?.publishDate ?? null
        : normalizeOptionalText(input.publishDate),
    publishedUrl:
      input.publishedUrl === undefined
        ? existing?.publishedUrl ?? null
        : normalizeOptionalText(input.publishedUrl),
    impressions:
      input.impressions === undefined ? existing?.impressions ?? null : input.impressions,
    clicks: input.clicks === undefined ? existing?.clicks ?? null : input.clicks,
    signups:
      input.signups === undefined ? existing?.signups ?? null : input.signups,
    notes:
      input.notes === undefined
        ? existing?.notes ?? null
        : normalizeOptionalText(input.notes),
    attributionSource:
      input.attributionSource === undefined
        ? existing?.attributionSource ?? null
        : input.attributionSource,
    createdAt: existing?.createdAt ?? timestamp,
    lastUpdatedAt: timestamp,
  });
}

export async function getFactoryPublishOutcome(
  renderedAssetId: string,
): Promise<FactoryPublishOutcome | null> {
  const store = await readPersistedStore();
  return store[factoryPublishOutcomeId(renderedAssetId)] ?? null;
}

export async function listFactoryPublishOutcomes(options?: {
  opportunityId?: string;
  renderedAssetId?: string;
  renderJobId?: string;
}): Promise<FactoryPublishOutcome[]> {
  const store = await readPersistedStore();

  return Object.values(store)
    .filter((entry) =>
      options?.opportunityId ? entry.opportunityId === options.opportunityId : true,
    )
    .filter((entry) =>
      options?.renderedAssetId ? entry.renderedAssetId === options.renderedAssetId : true,
    )
    .filter((entry) =>
      options?.renderJobId ? entry.renderJobId === options.renderJobId : true,
    )
    .sort(
      (left, right) =>
        new Date(right.lastUpdatedAt).getTime() -
          new Date(left.lastUpdatedAt).getTime() ||
        right.publishOutcomeId.localeCompare(left.publishOutcomeId),
    );
}

export async function upsertFactoryPublishOutcome(
  input: UpsertFactoryPublishOutcomeInput,
): Promise<{
  publishOutcome: FactoryPublishOutcome;
  previous: FactoryPublishOutcome | null;
  created: boolean;
}> {
  const parsedInput = upsertFactoryPublishOutcomeInputSchema.parse(input);
  const store = await readPersistedStore();
  const previous = store[factoryPublishOutcomeId(parsedInput.renderedAssetId)] ?? null;
  const publishOutcome = buildFactoryPublishOutcomeRecord(parsedInput, previous);
  store[publishOutcome.publishOutcomeId] = publishOutcome;
  await writeStore(store);

  return {
    publishOutcome,
    previous,
    created: !previous,
  };
}

export async function ensureFactoryPublishOutcomePlaceholder(input: {
  opportunityId: string;
  videoBriefId: string;
  factoryJobId?: string | null;
  renderJobId: string;
  renderedAssetId: string;
  assetReviewId?: string | null;
  createdAt?: string;
}) {
  return upsertFactoryPublishOutcome({
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId,
    factoryJobId: input.factoryJobId ?? null,
    renderJobId: input.renderJobId,
    renderedAssetId: input.renderedAssetId,
    assetReviewId: input.assetReviewId ?? null,
    published: false,
    updatedAt: input.createdAt ?? new Date().toISOString(),
  });
}
