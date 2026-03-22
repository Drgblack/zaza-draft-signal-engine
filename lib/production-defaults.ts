import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const PRODUCTION_DEFAULTS_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "production-defaults.json",
);

export const productionDefaultsSchema = z.object({
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

export type ProductionDefaults = z.infer<typeof productionDefaultsSchema>;

const productionDefaultsStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  profiles: z.array(productionDefaultsSchema).min(1),
});

type ProductionDefaultsStore = z.infer<typeof productionDefaultsStoreSchema>;

const DEFAULT_PRODUCTION_DEFAULTS = productionDefaultsSchema.parse({
  id: "prod-default:teacher-real-core",
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
    visuals: ["local-default"],
    captions: ["local-default"],
    composition: ["local-default"],
  },
  updatedAt: "2026-03-22T00:00:00.000Z",
});

function buildDefaultStore(): ProductionDefaultsStore {
  return productionDefaultsStoreSchema.parse({
    updatedAt: DEFAULT_PRODUCTION_DEFAULTS.updatedAt,
    profiles: [DEFAULT_PRODUCTION_DEFAULTS],
  });
}

function normalizeStore(store: ProductionDefaultsStore): ProductionDefaultsStore {
  const profiles = store.profiles.map((profile, index) =>
    productionDefaultsSchema.parse({
      ...profile,
      isActive: index === 0,
    }),
  );

  return productionDefaultsStoreSchema.parse({
    updatedAt: store.updatedAt,
    profiles,
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

export function getActiveProductionDefaults(): ProductionDefaults {
  const store = readPersistedStoreSync();

  return productionDefaultsSchema.parse(
    store.profiles.find((profile) => profile.isActive) ?? store.profiles[0],
  );
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
}): Promise<ProductionDefaults> {
  const current = getActiveProductionDefaults();
  const nextUpdatedAt = new Date().toISOString();
  const nextActive = productionDefaultsSchema.parse({
    ...current,
    voiceId: input.voiceId,
    styleAnchorPrompt: input.styleAnchorPrompt,
    motionStyle: input.motionStyle,
    negativeConstraints: input.negativeConstraints,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    captionStyle: input.captionStyle,
    compositionDefaults: input.compositionDefaults,
    updatedAt: nextUpdatedAt,
  });

  await writePersistedStore({
    updatedAt: nextUpdatedAt,
    profiles: [nextActive],
  });

  return nextActive;
}
