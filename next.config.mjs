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
    // Defense-in-depth security headers. Note: 'unsafe-inline'/'unsafe-eval'
    // are required by the theme-bootstrap inline script and the AdSense inline
    // push (and Next.js chunk loading), so this CSP mainly hardens transport,
    // framing, and the set of origins we talk to - it is not a strict XSS CSP.
    // The Google ad hosts are allowlisted because AdSense Auto ads ship
    // site-wide from app/[lang]/layout.tsx; without them the CSP would block
    // every ad. VERIFY on a preview deploy (ads render + no console violations)
    // before trusting this in production - Auto ads can pull extra ad domains.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://va.vercel-scripts.com https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com https://www.googletagservices.com https://adservice.google.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://upload.wikimedia.org https://commons.wikimedia.org https://*.googlesyndication.com https://*.g.doubleclick.net https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-src 'self' https://challenges.cloudflare.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://ep2.adtrafficquality.google",
      "connect-src 'self' https://challenges.cloudflare.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://*.google.com https://ep1.adtrafficquality.google https://csi.gstatic.com",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
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
