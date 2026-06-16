import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const sections = [
    "",
    "#about",
    "#services",
    "#gallery",
    "#team",
    "#booking",
    "#reviews",
    "#contact",
  ];
  const now = new Date();
  return sections.map((hash) => ({
    url: `${site.url}/${hash}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: hash === "" ? 1 : 0.7,
  }));
}
