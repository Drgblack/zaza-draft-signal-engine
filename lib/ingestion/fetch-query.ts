import { fetchSourceItems } from "@/lib/ingestion/fetch-feeds";
import { ingestionFeedItemSchema, type IngestionFeedItem, type IngestionSourceDefinition } from "@/lib/ingestion/types";

function buildGoogleNewsQueryUrl(source: IngestionSourceDefinition): string {
  const query = source.query?.trim();
  if (!query) {
    throw new Error(`Query source "${source.name}" is missing query text.`);
  }

  const url = new URL(source.url);
  url.searchParams.set("q", `${query} when:14d`);
  url.searchParams.set("hl", "en-GB");
  url.searchParams.set("gl", "GB");
  url.searchParams.set("ceid", "GB:en");
  return url.toString();
}

export async function fetchQueryItems(source: IngestionSourceDefinition): Promise<IngestionFeedItem[]> {
  const provider = source.provider?.trim().toLowerCase() ?? "google-news-rss";

  if (provider !== "google-news-rss") {
    throw new Error(`Unsupported query provider "${source.provider}".`);
  }

  const adaptedSource: IngestionSourceDefinition = {
    ...source,
    kind: "rss",
    url: buildGoogleNewsQueryUrl(source),
  };

  const items = await fetchSourceItems(adaptedSource);
  return items.map((item) =>
    ingestionFeedItemSchema.parse({
      ...item,
      sourceTypeOverride: item.sourceTypeOverride ?? "Article",
      sourcePublisherOverride: item.sourcePublisherOverride ?? source.publisher,
      whySelectedOverride:
        item.whySelectedOverride ?? `Imported from curated query source "${source.name}" for operator review.`,
    }),
  );
}

export function buildMockQueryItems(source: IngestionSourceDefinition): IngestionFeedItem[] {
  const query = source.query?.trim() ?? source.name;
  const lower = query.toLowerCase();
  const now = Date.now();

  if (lower.includes("parent complaint")) {
    return [
      ingestionFeedItemSchema.parse({
        externalId: `${source.id}-mock-1`,
        title: "School leaders warn teachers about complaint escalation after parent email disputes",
        link: `https://example.com/query/${source.id}/1`,
        publishedAt: new Date(now).toISOString(),
        excerpt: "Recent coverage highlights how quickly ordinary parent email friction can become a formal complaint trail for teachers.",
        contentSnippet: "Parent complaint signals with teacher communication risk.",
        sourceTypeOverride: "Article",
        sourcePublisherOverride: source.publisher,
        whySelectedOverride: `Imported from curated query source "${source.name}" for operator review.`,
      }),
      ingestionFeedItemSchema.parse({
        externalId: `${source.id}-mock-2`,
        title: "Teachers describe regret after responding too quickly to parent complaints",
        link: `https://example.com/query/${source.id}/2`,
        publishedAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
        excerpt: "Discussion and reporting on parent-complaint replies show how wording and speed can raise professional risk.",
        contentSnippet: "Teacher-response wording risk after complaint escalation.",
        sourceTypeOverride: "Article",
        sourcePublisherOverride: source.publisher,
        whySelectedOverride: `Imported from curated query source "${source.name}" for operator review.`,
      }),
    ];
  }

  if (lower.includes("incident") || lower.includes("behaviour")) {
    return [
      ingestionFeedItemSchema.parse({
        externalId: `${source.id}-mock-1`,
        title: "After a classroom incident, teachers say the write-up feels riskier than the event itself",
        link: `https://example.com/query/${source.id}/1`,
        publishedAt: new Date(now).toISOString(),
        excerpt: "Recent reporting focuses on the wording pressure teachers face when documenting behaviour incidents for parents or leadership.",
        contentSnippet: "Behaviour documentation and parent follow-up pressure.",
        sourceTypeOverride: "Article",
        sourcePublisherOverride: source.publisher,
        whySelectedOverride: `Imported from curated query source "${source.name}" for operator review.`,
      }),
      ingestionFeedItemSchema.parse({
        externalId: `${source.id}-mock-2`,
        title: "Leaders call for clearer parent communication after serious student behaviour events",
        link: `https://example.com/query/${source.id}/2`,
        publishedAt: new Date(now - 1000 * 60 * 60 * 10).toISOString(),
        excerpt: "Coverage suggests classroom incidents often become communication and documentation dilemmas rather than purely discipline stories.",
        contentSnippet: "Incident communication and documentation tension.",
        sourceTypeOverride: "Article",
        sourcePublisherOverride: source.publisher,
        whySelectedOverride: `Imported from curated query source "${source.name}" for operator review.`,
      }),
    ];
  }

  return [
    ingestionFeedItemSchema.parse({
      externalId: `${source.id}-mock-1`,
      title: `${source.name}: recent coverage on teacher communication pressure`,
      link: `https://example.com/query/${source.id}/1`,
      publishedAt: new Date(now).toISOString(),
      excerpt: `Curated query results for "${query}" surfaced a recent article with teacher communication and workload pressure.`,
      contentSnippet: `Curated query signal for "${query}".`,
      sourceTypeOverride: "Article",
      sourcePublisherOverride: source.publisher,
      whySelectedOverride: `Imported from curated query source "${source.name}" for operator review.`,
    }),
  ];
}
