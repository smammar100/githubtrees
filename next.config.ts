import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The stylesheet is small (~14 KB gzipped, see scripts/primer-theme.mjs), so sending it with the HTML beats a
    // render-blocking request that competes with the JS downloads. Visitors mostly arrive fresh from shared links.
    inlineCss: true,
  },
  async headers() {
    return [
      {
        // Public GitHub data, identical for every visitor: Netlify's edge serves it and refreshes it in the background.
        source: "/:owner/:repo/branches",
        headers: [
          { key: "Netlify-CDN-Cache-Control", value: "public, durable, s-maxage=300, stale-while-revalidate=86400" },
          // ?branch=, ?pr=, ?tab= and ?fresh= change the page, so every query string is its own cache entry.
          { key: "Netlify-Vary", value: "query" },
        ],
      },
    ];
  },
};

export default nextConfig;
