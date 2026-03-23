import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const PRODUCTION_DEFAULTS_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "production-defaults.json",
);

const PRODUCTION_DEFAULTS_CHANGED_SOURCE_LEGACY = "legacy-import";
const PRODUCTION_DEFAULTS_CHANGED_SOURCE_BOOTSTRAP = "system-bootstrap";
const PRODUCTION_DEFAULTS_CHANGED_SOURCE_OPERATOR = "operator:production-defaults-api";

const productionDefaultsCoreSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  isActive: z.boolean(),
  voiceProvider: z.literal("elevenlabs"),
  voiceId: z.string().trim().min(1),
  voiceSettings: z.object({
    stability: z.number().min(0).max(1).optional(),
    similarityBoost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    speakerBoost: z.boolean().optional(),
  }),
  styleAnchorPrompt: z.string().trim().min(1),
  motionStyle: z.string().trim().min(1),
  negativeConstraints: z.array(z.string().trim().min(1)).min(1),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]),
  resolution: z.enum(["720p", "1080p"]),
  captionStyle: z.object({
    preset: z.string().trim().min(1),
    placement: z.enum(["center", "lower-third"]),
    casing: z.enum(["sentence", "title", "upper"]),
  }),
  compositionDefaults: z.object({
    transitionStyle: z.string().trim().min(1).optional(),
    musicMode: z.enum(["none", "light-bed"]).optional(),
  }),
  reviewDefaults: z.object({
    requireCaptionCheck: z.boolean(),
  }),
  providerFallbacks: z.object({
    narration: z.array(z.string().trim().min(1)).min(1),
    visuals: z.array(z.string().trim().min(1)).min(1),
    captions: z.array(z.string().trim().min(1)).min(1),
    composition: z.array(z.string().trim().min(1)).min(1),
  }),
  updatedAt: z.string().trim().min(1),
});

export const productionDefaultsSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    const profile = value as Record<string, unknown>;
    const id = typeof profile.id === "string" ? profile.id.trim() : "";
    const updatedAt =
      typeof profile.updatedAt === "string" ? profile.updatedAt.trim() : "";
    const changedAt =
      typeof profile.changedAt === "string" && profile.changedAt.trim().length > 0
        ? profile.changedAt.trim()
        : updatedAt;
    const changedSource =
      typeof profile.changedSource === "string" &&
      profile.changedSource.trim().length > 0
        ? profile.changedSource.trim()
        : PRODUCTION_DEFAULTS_CHANGED_SOURCE_LEGACY;
    const profileId =
      typeof profile.profileId === "string" && profile.profileId.trim().length > 0
        ? profile.profileId.trim()
        : id;
    const version =
      typeof profile.version === "number" &&
      Number.isInteger(profile.version) &&
      profile.version > 0
        ? profile.version
        : 1;

    return {
      ...profile,
      profileId,
      version,
      changedAt,
      changedSource,
      changeNote:
        typeof profile.changeNote === "string" ? profile.changeNote : null,
    };
  },
  productionDefaultsCoreSchema.extend({
    profileId: z.string().trim().min(1),
    version: z.number().int().min(1),
    changedAt: z.string().trim().min(1),
    changedSource: z.string().trim().min(1),
    changeNote: z.string().trim().min(1).nullable().default(null),
  }),
);

export type ProductionDefaults = z.infer<typeof productionDefaultsSchema>;

const productionDefaultsStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  profiles: z.array(productionDefaultsSchema).min(1),
});

type ProductionDefaultsStore = z.infer<typeof productionDefaultsStoreSchema>;

export type ProductionDefaultsVersionComparison = {
  profileId: string;
  currentVersion: number;
  previousVersion: number | null;
  changedAt: string;
  changedSource: string;
  changeNote: string | null;
  changedFields: string[];
};

const DEFAULT_PRODUCTION_DEFAULTS = productionDefaultsSchema.parse({
  id: "prod-default:teacher-real-core",
  profileId: "prod-default:teacher-real-core",
  version: 1,
  changedAt: "2026-03-22T00:00:00.000Z",
  changedSource: PRODUCTION_DEFAULTS_CHANGED_SOURCE_BOOTSTRAP,
  changeNote: "Initial founder baseline defaults.",
  name: "Teacher-Real Core",
  isActive: true,
  voiceProvider: "elevenlabs",
  voiceId: "teacher-real-core-v1",
  voiceSettings: {
    stability: 0.48,
    similarityBoost: 0.72,
    style: 0.14,
    speakerBoost: true,
  },
  styleAnchorPrompt:
    "Calm, teacher-real delivery. Plainspoken, grounded, and useful before polished. Keep the message close to real classroom pressure.",
  motionStyle: "Quiet cuts, restrained movement, and readable pacing.",
  negativeConstraints: [
    "No polished ad energy",
    "No hype or clickbait phrasing",
    "No glossy corporate visuals",
    "No exaggerated fear or urgency",
  ],
  aspectRatio: "9:16",
  resolution: "1080p",
  captionStyle: {
    preset: "teacher-real-clean",
    placement: "lower-third",
    casing: "sentence",
  },
  compositionDefaults: {
    transitionStyle: "gentle-cut",
    musicMode: "none",
  },
  reviewDefaults: {
    requireCaptionCheck: true,
  },
  providerFallbacks: {
    narration: ["elevenlabs"],
    visuals: ["runway-gen4", "kling-2"],
    captions: ["local-default"],
    composition: ["local-default"],
  },
  updatedAt: "2026-03-22T00:00:00.000Z",
});

const VERSION_COMPARE_KEYS = [
  "name",
  "voiceProvider",
  "voiceId",
  "voiceSettings",
  "styleAnchorPrompt",
  "motionStyle",
  "negativeConstraints",
  "aspectRatio",
  "resolution",
  "captionStyle",
  "compositionDefaults",
  "reviewDefaults",
  "providerFallbacks",
] as const satisfies Array<keyof ProductionDefaults>;

function compareVersionsDescending(
  left: ProductionDefaults,
  right: ProductionDefaults,
): number {
  if (left.version !== right.version) {
    return right.version - left.version;
  }

  return right.changedAt.localeCompare(left.changedAt);
}

function normalizeProfiles(
  profiles: ProductionDefaults[],
): ProductionDefaults[] {
  if (profiles.length === 0) {
    return [DEFAULT_PRODUCTION_DEFAULTS];
  }

  const activeProfile =
    [...profiles].sort(compareVersionsDescending).find((profile) => profile.isActive) ??
    [...profiles].sort(compareVersionsDescending)[0];

  const normalizedProfiles = [...profiles]
    .sort((left, right) => {
      if (left.profileId !== right.profileId) {
        return left.profileId.localeCompare(right.profileId);
      }

      return compareVersionsDescending(left, right);
    })
    .map((profile) =>
      productionDefaultsSchema.parse({
        ...profile,
        isActive:
          profile.profileId === activeProfile.profileId &&
          profile.version === activeProfile.version,
      }),
    );

  const orderedProfiles = [
    normalizedProfiles.find((profile) => profile.isActive),
    ...normalizedProfiles.filter((profile) => !profile.isActive),
  ].filter((profile): profile is ProductionDefaults => Boolean(profile));

  return orderedProfiles;
}

function buildDefaultStore(): ProductionDefaultsStore {
  return productionDefaultsStoreSchema.parse({
    updatedAt: DEFAULT_PRODUCTION_DEFAULTS.updatedAt,
    profiles: [DEFAULT_PRODUCTION_DEFAULTS],
  });
}

function normalizeStore(store: ProductionDefaultsStore): ProductionDefaultsStore {
  return productionDefaultsStoreSchema.parse({
    updatedAt: store.updatedAt,
    profiles: normalizeProfiles(store.profiles),
  });
}

function readPersistedStoreSync(): ProductionDefaultsStore {
  try {
    const raw = readFileSync(PRODUCTION_DEFAULTS_STORE_PATH, "utf8");
    return normalizeStore(productionDefaultsStoreSchema.parse(JSON.parse(raw)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return buildDefaultStore();
    }

    throw error;
  }
}

async function writePersistedStore(store: ProductionDefaultsStore): Promise<void> {
  await mkdir(path.dirname(PRODUCTION_DEFAULTS_STORE_PATH), { recursive: true });
  await writeFile(
    PRODUCTION_DEFAULTS_STORE_PATH,
    `${JSON.stringify(normalizeStore(store), null, 2)}\n`,
    "utf8",
  );
}

function getComparableVersionFields(profile: ProductionDefaults) {
  return VERSION_COMPARE_KEYS.reduce<Record<string, unknown>>((snapshot, key) => {
    snapshot[key] = profile[key];
    return snapshot;
  }, {});
}

export function getActiveProductionDefaults(): ProductionDefaults {
  const store = readPersistedStoreSync();

  return productionDefaultsSchema.parse(
    store.profiles.find((profile) => profile.isActive) ?? store.profiles[0],
  );
}

export function listProductionDefaultVersions(
  profileId: string,
): ProductionDefaults[] {
  const store = readPersistedStoreSync();

  return store.profiles
    .filter((profile) => profile.profileId === profileId)
    .sort(compareVersionsDescending)
    .map((profile) => productionDefaultsSchema.parse(profile));
}

export function compareCurrentProductionDefaultsVersion(
  profileId: string,
): ProductionDefaultsVersionComparison | null {
  const versions = listProductionDefaultVersions(profileId);
  const current = versions[0];

  if (!current) {
    return null;
  }

  const previous = versions[1] ?? null;
  const currentComparable = getComparableVersionFields(current);
  const previousComparable = previous
    ? getComparableVersionFields(previous)
    : null;
  const changedFields = VERSION_COMPARE_KEYS.filter((key) => {
    if (!previousComparable) {
      return false;
    }

    return (
      JSON.stringify(currentComparable[key]) !==
      JSON.stringify(previousComparable[key])
    );
  });

  return {
    profileId,
    currentVersion: current.version,
    previousVersion: previous?.version ?? null,
    changedAt: current.changedAt,
    changedSource: current.changedSource,
    changeNote: current.changeNote,
    changedFields,
  };
}

export function productionDefaultsSnapshotEquals(
  left: ProductionDefaults | null | undefined,
  right: ProductionDefaults | null | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    JSON.stringify(productionDefaultsSchema.parse(left)) ===
    JSON.stringify(productionDefaultsSchema.parse(right))
  );
}

export async function updateActiveProductionDefaults(input: {
  voiceId: string;
  styleAnchorPrompt: string;
  motionStyle: string;
  negativeConstraints: string[];
  aspectRatio: ProductionDefaults["aspectRatio"];
  resolution: ProductionDefaults["resolution"];
  captionStyle: ProductionDefaults["captionStyle"];
  compositionDefaults: ProductionDefaults["compositionDefaults"];
  changedSource?: string;
  changeNote?: string | null;
}): Promise<ProductionDefaults> {
  const store = readPersistedStoreSync();
  const current =
    store.profiles.find((profile) => profile.isActive) ?? store.profiles[0];
  const nextUpdatedAt = new Date().toISOString();
  const nextActive = productionDefaultsSchema.parse({
    ...current,
    isActive: true,
    profileId: current.profileId,
    version: current.version + 1,
    voiceId: input.voiceId,
    styleAnchorPrompt: input.styleAnchorPrompt,
    motionStyle: input.motionStyle,
    negativeConstraints: input.negativeConstraints,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    captionStyle: input.captionStyle,
    compositionDefaults: input.compositionDefaults,
    changedAt: nextUpdatedAt,
    changedSource:
      input.changedSource?.trim() || PRODUCTION_DEFAULTS_CHANGED_SOURCE_OPERATOR,
    changeNote: input.changeNote?.trim() || null,
    updatedAt: nextUpdatedAt,
  });

  await writePersistedStore({
    updatedAt: nextUpdatedAt,
    profiles: [
      nextActive,
      ...store.profiles.map((profile) => ({
        ...profile,
        isActive: false,
      })),
    ],
  });

  return nextActive;
}
