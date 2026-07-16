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
    const cspHeader = `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://va.vercel-scripts.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' blob: data: https://upload.wikimedia.org https://commons.wikimedia.org;
      font-src 'self' data:;
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-src 'self' https://challenges.cloudflare.com;
      connect-src 'self' https://challenges.cloudflare.com;
      frame-ancestors 'none';
      block-all-mixed-content;
      upgrade-insecure-requests;
    `.replace(/\s{2,}/g, ' ').trim();

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
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
