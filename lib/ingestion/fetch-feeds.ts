import { XMLParser } from "fast-xml-parser";

import { ingestionFeedItemSchema, type IngestionFeedItem, type IngestionSourceDefinition } from "@/lib/ingestion/types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "object" && value && "#text" in value && typeof value["#text"] === "string") {
    const trimmed = value["#text"].trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function getAtomLink(value: unknown): string | null {
  const links = asArray(value as { href?: string; rel?: string } | Array<{ href?: string; rel?: string }>);
  const preferred = links.find((link) => !link.rel || link.rel === "alternate") ?? links[0];
  return preferred?.href?.trim() || null;
}

function parseRssItems(xml: string): IngestionFeedItem[] {
  const parsed = xmlParser.parse(xml);
  const items = asArray(parsed?.rss?.channel?.item);

  return items.map((item) =>
    ingestionFeedItemSchema.parse({
      externalId: getText(item.guid) ?? getText(item.link),
      title: getText(item.title),
      link: getText(item.link),
      publishedAt: getText(item.pubDate) ?? getText(item.isoDate),
      excerpt: getText(item.description),
      contentSnippet: getText(item["content:encoded"]) ?? getText(item.summary),
    }),
  );
}

function parseAtomItems(xml: string): IngestionFeedItem[] {
  const parsed = xmlParser.parse(xml);
  const entries = asArray(parsed?.feed?.entry);

  return entries.map((entry) =>
    ingestionFeedItemSchema.parse({
      externalId: getText(entry.id) ?? getAtomLink(entry.link),
      title: getText(entry.title),
      link: getAtomLink(entry.link),
      publishedAt: getText(entry.updated) ?? getText(entry.published),
      excerpt: getText(entry.summary),
      contentSnippet: getText(entry.content) ?? getText(entry.summary),
    }),
  );
}

function parseJsonItems(json: unknown): IngestionFeedItem[] {
  const items = Array.isArray(json)
    ? json
    : Array.isArray((json as { items?: unknown[] })?.items)
      ? (json as { items: unknown[] }).items
      : [];

  return items.map((item) =>
    ingestionFeedItemSchema.parse({
      externalId: getText((item as { id?: unknown }).id) ?? getText((item as { url?: unknown }).url),
      title: getText((item as { title?: unknown }).title),
      link: getText((item as { url?: unknown }).url) ?? getText((item as { link?: unknown }).link),
      publishedAt:
        getText((item as { publishedAt?: unknown }).publishedAt) ??
        getText((item as { date?: unknown }).date),
      excerpt:
        getText((item as { excerpt?: unknown }).excerpt) ??
        getText((item as { summary?: unknown }).summary),
      contentSnippet:
        getText((item as { contentSnippet?: unknown }).contentSnippet) ??
        getText((item as { content?: unknown }).content),
    }),
  );
}

export async function fetchSourceItems(source: IngestionSourceDefinition): Promise<IngestionFeedItem[]> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "ZazaDraftSignalEngine/1.0",
      Accept: source.kind === "json" ? "application/json" : "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Source returned ${response.status}.`);
  }

  if (source.kind === "json") {
    return parseJsonItems(await response.json());
  }

  const xml = await response.text();
  return source.kind === "atom" ? parseAtomItems(xml) : parseRssItems(xml);
}
