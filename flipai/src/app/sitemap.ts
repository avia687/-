import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL || "http://localhost:3000";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, priority: 1 },
    { url: `${base}/pricing`, lastModified: now, priority: 0.8 },
    { url: `${base}/login`, lastModified: now, priority: 0.5 },
    { url: `${base}/signup`, lastModified: now, priority: 0.6 },
  ];
}
