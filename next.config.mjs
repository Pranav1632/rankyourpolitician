/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Several sessions/terminals often run this project at once on one machine;
  // `next dev` and `next build` sharing .next corrupts the build output. Point
  // NEXT_DIST_DIR at a scratch dir to build/start in isolation. Unset (Vercel,
  // normal dev) it is the default .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // We keep our own type checking in `npm run typecheck`; do not let a stray
  // lint config block deploys. Types are still enforced at build time.
  eslint: { ignoreDuringBuilds: true },
  images: {
    // Politician photos come from Wikimedia Commons only (freely licensed).
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'commons.wikimedia.org' },
    ],
  },
  // The local-only data manager must never be bundled into the deployed site.
  outputFileTracingExcludes: {
    '*': ['./tools/**/*', './data/staging/**/*'],
  },
  // The big prebuilt JSONs (search index, rankings, who-data) only change on
  // deploy. Let browsers keep them for an hour and the CDN serve stale while
  // revalidating, instead of re-negotiating ~1MB per session.
  async headers() {
    return [
      {
        source: '/:file(search-index.json|rankings.json)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/who/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
