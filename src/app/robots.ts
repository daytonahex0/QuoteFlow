import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/quotes", "/follow-ups", "/settings", "/analytics", "/onboarding", "/notifications"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
