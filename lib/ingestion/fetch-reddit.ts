import { ingestionFeedItemSchema, type IngestionFeedItem, type IngestionSourceDefinition } from "@/lib/ingestion/types";

interface RedditListingChild {
  kind?: string;
  data?: {
    id?: string;
    name?: string;
    title?: string;
    permalink?: string;
    subreddit?: string;
    selftext?: string;
    created_utc?: number;
  };
}

function toIsoDate(value: number | undefined): string | null {
  if (!value || Number.isNaN(value)) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function buildPermalink(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  return `https://www.reddit.com${value}`;
}

export function buildMockRedditItems(source: IngestionSourceDefinition): IngestionFeedItem[] {
  const subreddit = source.subreddit ?? source.name.replace(/^Reddit:\s*/i, "");

  return [
    ingestionFeedItemSchema.parse({
      externalId: `${source.id}-mock-1`,
      title: "How do you document repeated parent complaints without sounding defensive?",
      link: `https://www.reddit.com/r/${subreddit}/comments/mock1`,
      publishedAt: new Date().toISOString(),
      excerpt:
        "I keep rewriting the email because I want to explain the pattern clearly, but I also do not want to sound accusatory or escalate the situation with home.",
      contentSnippet:
        "Teacher is trying to document a repeat complaint pattern while staying calm and professionally protected.",
      sourceTypeOverride: "Forum Post",
      sourcePublisherOverride: `Reddit / r/${subreddit}`,
      whySelectedOverride: "Imported from configured Reddit teacher discussion source for operator review.",
    }),
    ingestionFeedItemSchema.parse({
      externalId: `${source.id}-mock-2`,
      title: "Best way to follow up with leadership after a serious classroom incident?",
      link: `https://www.reddit.com/r/${subreddit}/comments/mock2`,
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
      excerpt:
        "I need to write this up for leadership, but I am worried that if the wording is too emotional it will come back on me later.",
      contentSnippet:
        "Teacher discussion about documenting a difficult incident in a way that is factual, calm, and professionally safe.",
      sourceTypeOverride: "Forum Post",
      sourcePublisherOverride: `Reddit / r/${subreddit}`,
      whySelectedOverride: "Imported from configured Reddit teacher discussion source for operator review.",
    }),
  ];
}

export async function fetchRedditPosts(source: IngestionSourceDefinition): Promise<IngestionFeedItem[]> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "ZazaDraftSignalEngine/1.0",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Reddit source returned ${response.status}.`);
  }

  const json = (await response.json()) as {
    data?: {
      children?: RedditListingChild[];
    };
  };
  const children = Array.isArray(json.data?.children) ? json.data.children : [];

  return children
    .filter((child) => child.kind === "t3" && child.data?.title)
    .map((child) =>
      ingestionFeedItemSchema.parse({
        externalId: child.data?.name ?? child.data?.id ?? null,
        title: child.data?.title?.trim() ?? null,
        link: buildPermalink(child.data?.permalink),
        publishedAt: toIsoDate(child.data?.created_utc),
        excerpt: child.data?.selftext?.trim() || null,
        contentSnippet: child.data?.selftext?.trim() || null,
        sourceTypeOverride: "Forum Post",
        sourcePublisherOverride: `Reddit / r/${child.data?.subreddit ?? source.subreddit ?? source.publisher}`,
        whySelectedOverride: "Imported from configured Reddit teacher discussion source for operator review.",
      }),
    );
}
