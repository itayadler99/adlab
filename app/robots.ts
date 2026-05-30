import type { MetadataRoute } from "next";

// The product lives behind basic auth; only the marketing landing should be
// crawlable. Disallow the authenticated app + API surfaces.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/", "/autopilot"],
    },
  };
}
