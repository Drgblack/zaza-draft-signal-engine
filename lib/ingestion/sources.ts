import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  ingestionSourceOverrideSchema,
  ingestionSourceSchema,
  type IngestionSourceDefinition,
  type IngestionSourceOverride,
} from "@/lib/ingestion/types";

const SOURCE_OVERRIDES_PATH = path.join(process.cwd(), "data", "ingestion-source-overrides.json");
const sourceOverridesFileSchema = z.array(ingestionSourceOverrideSchema);

const defaultSourceRegistry = [
  {
    id: "google-news-teachers",
    name: "Google News: Teachers",
    kind: "rss",
    url: "https://news.google.com/rss/search?q=teachers%20when%3A7d&hl=en-GB&gl=GB&ceid=GB:en",
    publisher: "Google News",
    topic: "Teachers",
    enabled: true,
    maxItemsPerRun: 12,
    priority: "normal",
    notes: "Recent education and teaching-related coverage.",
  },
  {
    id: "google-news-school-policy",
    name: "Google News: School Policy",
    kind: "rss",
    url: "https://news.google.com/rss/search?q=schools%20education%20policy%20when%3A7d&hl=en-GB&gl=GB&ceid=GB:en",
    publisher: "Google News",
    topic: "School policy",
    enabled: true,
    maxItemsPerRun: 10,
    priority: "normal",
    notes: "Policy and sector changes affecting schools and teachers.",
  },
  {
    id: "google-news-teacher-burnout",
    name: "Google News: Teacher Burnout",
    kind: "rss",
    url: "https://news.google.com/rss/search?q=teacher%20burnout%20when%3A7d&hl=en-GB&gl=GB&ceid=GB:en",
    publisher: "Google News",
    topic: "Teacher burnout",
    enabled: true,
    maxItemsPerRun: 10,
    priority: "normal",
    notes: "Stress and workload-oriented signals for operator review.",
  },
  {
    id: "reddit-teachers",
    name: "Reddit: r/Teachers",
    kind: "reddit",
    url: "https://www.reddit.com/r/Teachers/new.json?limit=10&raw_json=1",
    subreddit: "Teachers",
    publisher: "Reddit",
    topic: "Teacher discussion",
    enabled: true,
    maxItemsPerRun: 8,
    priority: "high",
    notes: "Bounded recent teacher discussion posts with classroom and parent-communication tension.",
  },
  {
    id: "reddit-teachinguk",
    name: "Reddit: r/TeachingUK",
    kind: "reddit",
    url: "https://www.reddit.com/r/TeachingUK/new.json?limit=10&raw_json=1",
    subreddit: "TeachingUK",
    publisher: "Reddit",
    topic: "UK teacher discussion",
    enabled: true,
    maxItemsPerRun: 8,
    priority: "high",
    notes: "UK-specific teacher situations, policy friction, and communication problems.",
  },
  {
    id: "reddit-education",
    name: "Reddit: r/education",
    kind: "reddit",
    url: "https://www.reddit.com/r/education/new.json?limit=10&raw_json=1",
    subreddit: "education",
    publisher: "Reddit",
    topic: "Education discussion",
    enabled: true,
    maxItemsPerRun: 6,
    priority: "normal",
    notes: "Broader education discussion with occasional teacher-facing workflow and policy signals.",
  },
  {
    id: "reddit-professors",
    name: "Reddit: r/Professors",
    kind: "reddit",
    url: "https://www.reddit.com/r/Professors/new.json?limit=10&raw_json=1",
    subreddit: "Professors",
    publisher: "Reddit",
    topic: "Academic teaching discussion",
    enabled: true,
    maxItemsPerRun: 6,
    priority: "low",
    notes: "Higher-education teaching signals that still surface documentation, student, and communication stress.",
  },
  {
    id: "query-parent-complaint",
    name: "Query: Parent complaint - teacher communication",
    kind: "query",
    url: "https://news.google.com/rss/search",
    query: "\"parent complaint\" teacher communication",
    provider: "google-news-rss",
    publisher: "Google News Query",
    topic: "Parent complaint",
    enabled: true,
    maxItemsPerRun: 8,
    priority: "high",
    notes: "Curated search definition for parent-complaint and reply-risk signals.",
  },
  {
    id: "query-teacher-email-regret",
    name: "Query: Teacher email regret",
    kind: "query",
    url: "https://news.google.com/rss/search",
    query: "\"teacher email\" regret parent",
    provider: "google-news-rss",
    publisher: "Google News Query",
    topic: "Teacher email regret",
    enabled: true,
    maxItemsPerRun: 8,
    priority: "high",
    notes: "Targets articles and reports where teacher email wording or regret is central.",
  },
  {
    id: "query-classroom-incident-parent",
    name: "Query: Classroom incident parent communication",
    kind: "query",
    url: "https://news.google.com/rss/search",
    query: "\"classroom incident\" parent communication teacher",
    provider: "google-news-rss",
    publisher: "Google News Query",
    topic: "Classroom incident communication",
    enabled: true,
    maxItemsPerRun: 8,
    priority: "high",
    notes: "Targets incident follow-up and parent-communication signals.",
  },
  {
    id: "query-behaviour-documentation",
    name: "Query: Behaviour documentation teacher",
    kind: "query",
    url: "https://news.google.com/rss/search",
    query: "\"behaviour incident\" teacher documentation parent leadership",
    provider: "google-news-rss",
    publisher: "Google News Query",
    topic: "Behaviour documentation",
    enabled: true,
    maxItemsPerRun: 8,
    priority: "high",
    notes: "Targets reporting, write-up, and evidence-trail pressure for teachers.",
  },
  {
    id: "query-report-writing-stress",
    name: "Query: Report writing stress teacher",
    kind: "query",
    url: "https://news.google.com/rss/search",
    query: "\"report writing\" stress teacher",
    provider: "google-news-rss",
    publisher: "Google News Query",
    topic: "Report writing stress",
    enabled: true,
    maxItemsPerRun: 8,
    priority: "normal",
    notes: "Targets workload-heavy reporting and documentation signals.",
  },
  {
    id: "query-teacher-under-investigation",
    name: "Query: Teacher under investigation communication",
    kind: "query",
    url: "https://news.google.com/rss/search",
    query: "\"teacher under investigation\" school communication",
    provider: "google-news-rss",
    publisher: "Google News Query",
    topic: "Teacher investigation communication",
    enabled: true,
    maxItemsPerRun: 6,
    priority: "high",
    notes: "Targets higher-stakes teacher-risk and communication fallout signals.",
  },
] satisfies IngestionSourceDefinition[];

const defaultSources = defaultSourceRegistry.map((source) => ingestionSourceSchema.parse(source));
const defaultSourceById = new Map(defaultSources.map((source) => [source.id, source]));
const defaultSourceOrder = new Map(defaultSources.map((source, index) => [source.id, index]));

export const INGESTION_SOURCES = defaultSources;

function normalizeOverrideForStorage(
  sourceId: string,
  value: Partial<Omit<IngestionSourceOverride, "id">>,
): IngestionSourceOverride | null {
  const base = defaultSourceById.get(sourceId);
  if (!base) {
    throw new Error(`Unknown ingestion source "${sourceId}".`);
  }

  const next = ingestionSourceOverrideSchema.parse({
    id: sourceId,
    enabled: value.enabled,
    maxItemsPerRun: value.maxItemsPerRun,
    priority: value.priority,
    query: value.query,
    notes: value.notes,
  });

  const normalized: IngestionSourceOverride = { id: sourceId };

  if (next.enabled !== undefined && next.enabled !== base.enabled) {
    normalized.enabled = next.enabled;
  }

  if (next.maxItemsPerRun !== undefined && next.maxItemsPerRun !== base.maxItemsPerRun) {
    normalized.maxItemsPerRun = next.maxItemsPerRun;
  }

  if (next.priority !== undefined && next.priority !== base.priority) {
    normalized.priority = next.priority;
  }

  if (next.query !== undefined && next.query !== base.query) {
    normalized.query = next.query;
  }

  if (next.notes !== undefined && next.notes !== base.notes) {
    normalized.notes = next.notes;
  }

  return Object.keys(normalized).length > 1 ? normalized : null;
}

export function buildIngestionSourceLabel(source: IngestionSourceDefinition): string {
  return source.kind === "query" ? `Query: ${source.name.replace(/^Query:\s*/i, "")}` : source.name;
}

async function readSourceOverrides(): Promise<IngestionSourceOverride[]> {
  try {
    const raw = await readFile(SOURCE_OVERRIDES_PATH, "utf8");
    return sourceOverridesFileSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeSourceOverrides(overrides: IngestionSourceOverride[]): Promise<void> {
  await mkdir(path.dirname(SOURCE_OVERRIDES_PATH), { recursive: true });
  const ordered = [...overrides].sort(
    (left, right) => (defaultSourceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (defaultSourceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
  await writeFile(SOURCE_OVERRIDES_PATH, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

function mergeSources(overrides: IngestionSourceOverride[]): IngestionSourceDefinition[] {
  const overridesById = new Map(overrides.map((override) => [override.id, override]));

  return defaultSources.map((source) =>
    ingestionSourceSchema.parse({
      ...source,
      ...(overridesById.get(source.id) ?? {}),
    }),
  );
}

export async function listIngestionSources(sourceIds?: string[]): Promise<IngestionSourceDefinition[]> {
  const requestedIds = sourceIds?.length ? new Set(sourceIds) : null;
  const mergedSources = mergeSources(await readSourceOverrides());

  return mergedSources.filter((source) => (requestedIds ? requestedIds.has(source.id) : true));
}

export async function getEnabledIngestionSources(sourceIds?: string[]): Promise<IngestionSourceDefinition[]> {
  const requestedIds = sourceIds?.length ? new Set(sourceIds) : null;
  const mergedSources = mergeSources(await readSourceOverrides());

  return mergedSources.filter((source) => {
    if (!source.enabled) {
      return false;
    }

    return requestedIds ? requestedIds.has(source.id) : true;
  });
}

export async function updateIngestionSource(
  sourceId: string,
  value: Partial<Omit<IngestionSourceOverride, "id">>,
): Promise<IngestionSourceDefinition> {
  if (!defaultSourceById.has(sourceId)) {
    throw new Error(`Unknown ingestion source "${sourceId}".`);
  }

  const existingOverrides = await readSourceOverrides();
  const overridesById = new Map(existingOverrides.map((override) => [override.id, override]));
  const existing = overridesById.get(sourceId);
  const normalized = normalizeOverrideForStorage(sourceId, {
    ...existing,
    ...value,
  });

  if (normalized) {
    overridesById.set(sourceId, normalized);
  } else {
    overridesById.delete(sourceId);
  }

  await writeSourceOverrides([...overridesById.values()]);
  const updated = (await listIngestionSources([sourceId]))[0];

  if (!updated) {
    throw new Error(`Unable to resolve updated source "${sourceId}".`);
  }

  return updated;
}
