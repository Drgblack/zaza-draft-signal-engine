import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { mockPatternBundleSeed } from "@/lib/mock-data";
import type { SignalPattern } from "@/lib/pattern-definitions";

const PATTERN_BUNDLE_STORE_PATH = path.join(process.cwd(), "data", "pattern-bundles.json");

export const patternBundleSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(600),
  createdAt: z.string().trim().min(1),
  createdBy: z.string().trim().min(1).max(80),
  patternIds: z.array(z.string().trim().min(1)).max(32),
});

const patternBundleStoreSchema = z.record(z.string(), patternBundleSchema);

export type PatternBundle = z.infer<typeof patternBundleSchema>;

export interface PatternBundleSummary {
  id: string;
  name: string;
  description: string;
}

export interface CreatePatternBundleInput {
  name: string;
  description: string;
  patternIds?: string[] | null;
  createdBy?: string | null;
}

export interface UpdatePatternBundleInput {
  name?: string;
  description?: string;
  patternIds?: string[] | null;
}

export const createPatternBundleRequestSchema = z.object({
  name: z.string().trim().min(1, "Bundle name is required.").max(120),
  description: z.string().trim().min(1, "Bundle description is required.").max(600),
  patternIds: z.array(z.string().trim().min(1)).max(32).optional(),
  createdBy: z.string().trim().min(1).max(80).optional(),
});

export const updatePatternBundleRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(600).optional(),
    patternIds: z.array(z.string().trim().min(1)).max(32).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "Provide at least one bundle field to update.",
  });

export const updatePatternBundleMembershipRequestSchema = z.object({
  bundleId: z.string().trim().min(1),
  action: z.enum(["assign", "remove"]),
});

function sortBundles(bundles: PatternBundle[]): PatternBundle[] {
  return [...bundles].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
      left.name.localeCompare(right.name),
  );
}

function normalizePatternIds(patternIds: string[] | null | undefined): string[] {
  if (!patternIds) {
    return [];
  }

  return Array.from(new Set(patternIds.map((patternId) => patternId.trim()).filter(Boolean))).slice(0, 32);
}

function buildSeedBundleStore(): Record<string, PatternBundle> {
  const store: Record<string, PatternBundle> = {};

  for (const bundle of mockPatternBundleSeed) {
    const parsed = patternBundleSchema.parse(bundle);
    store[parsed.id] = parsed;
  }

  return store;
}

async function readPersistedBundleStore(): Promise<Record<string, PatternBundle>> {
  try {
    const raw = await readFile(PATTERN_BUNDLE_STORE_PATH, "utf8");
    return patternBundleStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function readBundleStore(): Promise<Record<string, PatternBundle>> {
  return {
    ...buildSeedBundleStore(),
    ...(await readPersistedBundleStore()),
  };
}

async function writeBundleStore(store: Record<string, PatternBundle>): Promise<void> {
  await mkdir(path.dirname(PATTERN_BUNDLE_STORE_PATH), { recursive: true });
  await writeFile(PATTERN_BUNDLE_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function buildBundle(input: CreatePatternBundleInput): PatternBundle {
  return patternBundleSchema.parse({
    id: crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description.trim(),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy?.trim() || "operator",
    patternIds: normalizePatternIds(input.patternIds),
  });
}

export async function listPatternBundles(): Promise<PatternBundle[]> {
  const store = await readBundleStore();
  return sortBundles(Object.values(store));
}

export async function getPatternBundle(bundleId: string): Promise<PatternBundle | null> {
  const store = await readBundleStore();
  return store[bundleId] ?? null;
}

export async function appendPatternBundle(input: CreatePatternBundleInput): Promise<PatternBundle> {
  const bundle = buildBundle(input);
  const store = await readPersistedBundleStore();
  store[bundle.id] = bundle;
  await writeBundleStore(store);
  return bundle;
}

export async function updatePatternBundle(
  bundleId: string,
  input: UpdatePatternBundleInput,
): Promise<PatternBundle | null> {
  const store = await readBundleStore();
  const existing = store[bundleId];

  if (!existing) {
    return null;
  }

  const updated = patternBundleSchema.parse({
    ...existing,
    name: input.name?.trim() ?? existing.name,
    description: input.description?.trim() ?? existing.description,
    patternIds: input.patternIds !== undefined ? normalizePatternIds(input.patternIds) : existing.patternIds,
  });

  const persistedStore = await readPersistedBundleStore();
  persistedStore[bundleId] = updated;
  await writeBundleStore(persistedStore);
  return updated;
}

export async function addPatternToBundle(
  bundleId: string,
  patternId: string,
): Promise<PatternBundle | null> {
  const bundle = await getPatternBundle(bundleId);
  if (!bundle) {
    return null;
  }

  return updatePatternBundle(bundleId, {
    patternIds: [...bundle.patternIds, patternId],
  });
}

export async function removePatternFromBundle(
  bundleId: string,
  patternId: string,
): Promise<PatternBundle | null> {
  const bundle = await getPatternBundle(bundleId);
  if (!bundle) {
    return null;
  }

  return updatePatternBundle(bundleId, {
    patternIds: bundle.patternIds.filter((id) => id !== patternId),
  });
}

export function toPatternBundleSummary(bundle: PatternBundle | null | undefined): PatternBundleSummary | null {
  if (!bundle) {
    return null;
  }

  return {
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
  };
}

export function getBundlesForPattern(
  patternId: string,
  bundles: PatternBundle[],
): PatternBundle[] {
  return bundles.filter((bundle) => bundle.patternIds.includes(patternId));
}

export function indexBundleSummariesByPatternId(
  bundles: PatternBundle[],
): Record<string, PatternBundleSummary[]> {
  const entries: Record<string, PatternBundleSummary[]> = {};

  for (const bundle of bundles) {
    const summary = toPatternBundleSummary(bundle);
    if (!summary) {
      continue;
    }

    for (const patternId of bundle.patternIds) {
      entries[patternId] = [...(entries[patternId] ?? []), summary];
    }
  }

  return entries;
}

export interface PatternBundleUsageRow {
  bundleId: string;
  name: string;
  totalPatterns: number;
  activePatternCount: number;
  usedCount: number;
}

export function buildPatternBundleUsageRows(
  bundles: PatternBundle[],
  patterns: SignalPattern[],
  usedCountByPatternId: Record<string, number>,
): PatternBundleUsageRow[] {
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));

  return bundles
    .map((bundle) => {
      const includedPatterns = bundle.patternIds
        .map((patternId) => patternById.get(patternId))
        .filter((pattern): pattern is SignalPattern => Boolean(pattern));

      return {
        bundleId: bundle.id,
        name: bundle.name,
        totalPatterns: includedPatterns.length,
        activePatternCount: includedPatterns.filter((pattern) => pattern.lifecycleState === "active").length,
        usedCount: includedPatterns.reduce((sum, pattern) => sum + (usedCountByPatternId[pattern.id] ?? 0), 0),
      };
    })
    .sort(
      (left, right) =>
        right.usedCount - left.usedCount ||
        right.activePatternCount - left.activePatternCount ||
        left.name.localeCompare(right.name),
    );
}
