import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://codemore.tech";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // authed/app surfaces — no search value, some leak query params
      disallow: ["/dashboard", "/project/", "/api/", "/auth/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
