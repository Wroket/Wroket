import type { MetadataRoute } from "next";

/**
 * Only marketing/public routes are listed; user-area pages stay out of the sitemap to match
 * `robots.ts` and avoid exposing private surface area.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://wroket.com";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
