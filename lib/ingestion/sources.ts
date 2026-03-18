import { ingestionSourceSchema, type IngestionSourceDefinition } from "@/lib/ingestion/types";

const sourceRegistry = [
  {
    id: "google-news-teachers",
    name: "Google News: Teachers",
    kind: "rss",
    url: "https://news.google.com/rss/search?q=teachers%20when%3A7d&hl=en-GB&gl=GB&ceid=GB:en",
    publisher: "Google News",
    topic: "Teachers",
    enabled: true,
    maxItems: 12,
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
    maxItems: 12,
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
    maxItems: 12,
    notes: "Stress and workload-oriented signals for operator review.",
  },
] satisfies IngestionSourceDefinition[];

export const INGESTION_SOURCES = sourceRegistry.map((source) => ingestionSourceSchema.parse(source));

export function getEnabledIngestionSources(sourceIds?: string[]): IngestionSourceDefinition[] {
  const requestedIds = sourceIds?.length ? new Set(sourceIds) : null;

  return INGESTION_SOURCES.filter((source) => {
    if (!source.enabled) {
      return false;
    }

    if (requestedIds && !requestedIds.has(source.id)) {
      return false;
    }

    return true;
  });
}
