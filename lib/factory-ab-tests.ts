import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { VIDEO_BRIEF_FORMATS, type VideoBrief } from "@/lib/video-briefs";

export const AB_TEST_VARIANTS = ["A", "B"] as const;
export const AB_TEST_DIMENSIONS = [
  "provider_choice",
  "defaults_version",
  "prompt_override",
  "caption_style_variant",
] as const;

export const abTestVariantDefinitionSchema = z.object({
  variant: z.enum(AB_TEST_VARIANTS),
  label: z.string().trim().min(1),
  provider: z.string().trim().nullable().default(null),
  defaultsVersion: z.number().int().positive().nullable().default(null),
  promptOverrideEnabled: z.boolean().nullable().default(null),
  captionStylePreset: z.string().trim().nullable().default(null),
});

export const abTestConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).default(100),
  dimension: z.enum(AB_TEST_DIMENSIONS),
  scope: z
    .object({
      briefFormats: z.array(z.enum(VIDEO_BRIEF_FORMATS)).default([]),
      opportunityIds: z.array(z.string().trim().min(1)).default([]),
    })
    .default({
      briefFormats: [],
      opportunityIds: [],
    }),
  variants: z
    .tuple([
      abTestVariantDefinitionSchema.extend({
        variant: z.literal("A"),
      }),
      abTestVariantDefinitionSchema.extend({
        variant: z.literal("B"),
      }),
    ]),
  assignmentSalt: z.string().trim().min(1),
  changedAt: z.string().trim().min(1),
  changedSource: z.string().trim().min(1),
  changeNote: z.string().trim().nullable().default(null),
});

export const abTestResultSchema = z.object({
  configId: z.string().trim().min(1),
  configName: z.string().trim().min(1),
  dimension: z.enum(AB_TEST_DIMENSIONS),
  scopeKey: z.string().trim().min(1),
  assignmentKey: z.string().trim().min(1),
  variant: z.enum(AB_TEST_VARIANTS),
  label: z.string().trim().min(1),
  expectedProvider: z.string().trim().nullable().default(null),
  expectedDefaultsVersion: z.number().int().positive().nullable().default(null),
  expectedPromptOverrideEnabled: z.boolean().nullable().default(null),
  expectedCaptionStylePreset: z.string().trim().nullable().default(null),
  observedProvider: z.string().trim().nullable().default(null),
  observedDefaultsVersion: z.number().int().positive().nullable().default(null),
  observedPromptOverrideEnabled: z.boolean().nullable().default(null),
  observedCaptionStylePreset: z.string().trim().nullable().default(null),
  assignedAt: z.string().trim().min(1),
});

const abTestStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  configs: z.array(abTestConfigSchema).default([]),
});

export type ABTestConfig = z.infer<typeof abTestConfigSchema>;
export type ABTestResult = z.infer<typeof abTestResultSchema>;

function abTestStorePath() {
  return path.join(process.cwd(), "data", "factory-ab-tests.json");
}

function buildDefaultStore() {
  return abTestStoreSchema.parse({
    updatedAt: null,
    configs: [],
  });
}

function normalizeStore(store: z.infer<typeof abTestStoreSchema>) {
  return abTestStoreSchema.parse({
    updatedAt: store.updatedAt ?? null,
    configs: [...store.configs]
      .map((config) => abTestConfigSchema.parse(config))
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          right.changedAt.localeCompare(left.changedAt) ||
          left.id.localeCompare(right.id),
      ),
  });
}

function readPersistedStoreSync() {
  try {
    return normalizeStore(
      abTestStoreSchema.parse(JSON.parse(readFileSync(abTestStorePath(), "utf8"))),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return buildDefaultStore();
    }

    throw error;
  }
}

async function writePersistedStore(store: z.infer<typeof abTestStoreSchema>) {
  const storePath = abTestStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    `${JSON.stringify(normalizeStore(store), null, 2)}\n`,
    "utf8",
  );
}

function stableHash(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function configApplies(input: {
  config: ABTestConfig;
  opportunityId: string;
  brief: Pick<VideoBrief, "id" | "format">;
}) {
  const { config, opportunityId, brief } = input;
  const scopedFormats = config.scope.briefFormats;
  const scopedOpportunityIds = config.scope.opportunityIds;

  if (scopedFormats.length > 0 && !scopedFormats.includes(brief.format)) {
    return false;
  }

  if (scopedOpportunityIds.length > 0 && !scopedOpportunityIds.includes(opportunityId)) {
    return false;
  }

  return config.isActive;
}

function buildScopeKey(input: {
  config: ABTestConfig;
  opportunityId: string;
  brief: Pick<VideoBrief, "id" | "format">;
}) {
  const formatScope =
    input.config.scope.briefFormats.length > 0
      ? input.config.scope.briefFormats.join(",")
      : "all-formats";
  const opportunityScope =
    input.config.scope.opportunityIds.length > 0
      ? input.config.scope.opportunityIds.join(",")
      : "all-opportunities";

  return [
    input.config.dimension,
    formatScope,
    opportunityScope,
    input.brief.format,
  ].join("|");
}

function buildAssignmentKey(input: {
  config: ABTestConfig;
  opportunityId: string;
  brief: Pick<VideoBrief, "id" | "format">;
}) {
  return [
    input.config.id,
    input.config.assignmentSalt,
    input.opportunityId,
    input.brief.id,
    input.brief.format,
  ].join("|");
}

function variantByLabel(config: ABTestConfig, variant: "A" | "B") {
  return config.variants.find((candidate) => candidate.variant === variant) ?? config.variants[0];
}

export function listABTestConfigs() {
  return readPersistedStoreSync().configs.map((config) => abTestConfigSchema.parse(config));
}

export function getActiveABTestConfig(input: {
  opportunityId: string;
  brief: Pick<VideoBrief, "id" | "format">;
}) {
  return (
    listABTestConfigs().find((config) =>
      configApplies({
        config,
        opportunityId: input.opportunityId,
        brief: input.brief,
      }),
    ) ?? null
  );
}

export async function upsertABTestConfig(config: ABTestConfig) {
  const parsedConfig = abTestConfigSchema.parse(config);
  const store = readPersistedStoreSync();

  await writePersistedStore({
    updatedAt: parsedConfig.changedAt,
    configs: [
      parsedConfig,
      ...store.configs.filter((existing) => existing.id !== parsedConfig.id),
    ],
  });

  return parsedConfig;
}

export function assignABTestVariant(input: {
  config: ABTestConfig;
  opportunityId: string;
  brief: Pick<VideoBrief, "id" | "format">;
  observedProvider?: string | null;
  observedDefaultsVersion?: number | null;
  observedPromptOverrideEnabled?: boolean | null;
  observedCaptionStylePreset?: string | null;
  assignedAt?: string;
}) {
  const assignmentKey = buildAssignmentKey(input);
  const variant = stableHash(assignmentKey) % 2 === 0 ? "A" : "B";
  const variantDefinition = variantByLabel(input.config, variant);

  return abTestResultSchema.parse({
    configId: input.config.id,
    configName: input.config.name,
    dimension: input.config.dimension,
    scopeKey: buildScopeKey(input),
    assignmentKey,
    variant,
    label: variantDefinition.label,
    expectedProvider: variantDefinition.provider,
    expectedDefaultsVersion: variantDefinition.defaultsVersion,
    expectedPromptOverrideEnabled: variantDefinition.promptOverrideEnabled,
    expectedCaptionStylePreset: variantDefinition.captionStylePreset,
    observedProvider: input.observedProvider ?? null,
    observedDefaultsVersion: input.observedDefaultsVersion ?? null,
    observedPromptOverrideEnabled: input.observedPromptOverrideEnabled ?? null,
    observedCaptionStylePreset: input.observedCaptionStylePreset ?? null,
    assignedAt: input.assignedAt ?? new Date().toISOString(),
  });
}

export function resolveActiveABTestResult(input: {
  opportunityId: string;
  brief: Pick<VideoBrief, "id" | "format">;
  observedProvider?: string | null;
  observedDefaultsVersion?: number | null;
  observedPromptOverrideEnabled?: boolean | null;
  observedCaptionStylePreset?: string | null;
  assignedAt?: string;
}) {
  const config = getActiveABTestConfig({
    opportunityId: input.opportunityId,
    brief: input.brief,
  });

  if (!config) {
    return null;
  }

  return assignABTestVariant({
    config,
    opportunityId: input.opportunityId,
    brief: input.brief,
    observedProvider: input.observedProvider ?? null,
    observedDefaultsVersion: input.observedDefaultsVersion ?? null,
    observedPromptOverrideEnabled: input.observedPromptOverrideEnabled ?? null,
    observedCaptionStylePreset: input.observedCaptionStylePreset ?? null,
    assignedAt: input.assignedAt,
  });
}
