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
  {
    id: "reddit-teachers",
    name: "Reddit: r/Teachers",
    kind: "reddit",
    url: "https://www.reddit.com/r/Teachers/new.json?limit=10&raw_json=1",
    subreddit: "Teachers",
    publisher: "Reddit",
    topic: "Teacher discussion",
    enabled: true,
    maxItems: 8,
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
    maxItems: 8,
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
    maxItems: 6,
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
    maxItems: 6,
    notes: "Higher-education teaching signals that still surface documentation, student, and communication stress.",
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
