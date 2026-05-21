import type { MetadataRoute } from "next";

const SITE_URL = "https://www.signalsharp.ai";

const STATIC_PAGE_PATHS = [
  "/",
  "/campaigns",
  "/connect-bridge",
  "/digest",
  "/director",
  "/exceptions",
  "/execution",
  "/experiments",
  "/factory-inputs",
  "/factory/runs",
  "/follow-up",
  "/influencers",
  "/ingestion",
  "/insights",
  "/optimisation",
  "/overrides",
  "/pattern-bundles",
  "/patterns",
  "/plan",
  "/playbook",
  "/posting",
  "/production-defaults",
  "/recap",
  "/replies",
  "/review",
  "/review/batch",
  "/scorecard",
  "/settings",
  "/signals",
  "/signals/new",
  "/tasks",
  "/weekly-pack",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return STATIC_PAGE_PATHS.map((path) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "daily",
    priority: path === "/" ? 1 : path === "/signals" || path === "/review" ? 0.9 : 0.7,
  }));
}
