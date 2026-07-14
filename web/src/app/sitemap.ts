import type { MetadataRoute } from "next";

import { listDocPages, listRuleIds } from "@/lib/docs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://codemore.tech";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/docs/install`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/docs/rules`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/docs/schema`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/docs/contributing`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const docPages: MetadataRoute.Sitemap = listDocPages().map(p => ({
    url: `${SITE}/docs/${p.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // 64 rule pages — the long-tail surface ("codemore sql injection rule" etc.)
  const rulePages: MetadataRoute.Sitemap = listRuleIds().map(id => ({
    url: `${SITE}/docs/rules/${id}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...docPages, ...rulePages];
}
