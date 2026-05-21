import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://www.signalsharp.ai/sitemap.xml",
    host: "https://www.signalsharp.ai",
  };
}
