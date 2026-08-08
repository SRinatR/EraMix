import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Monorepo-wide .env lives at the repository root, not per-app. Next.js only
// auto-loads a .env colocated with this file, so local dev/test runs of this
// app go through a `dotenvx run -f ../../.env --` wrapper in package.json
// (see ADR-0016) instead of loading it here — by the time this config module
// runs, process.env is already populated. CI/Docker/production never rely on
// a .env file at all; they set real process.env values directly.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces a minimal, self-contained server bundle (.next/standalone) for
  // the production container image (infra/docker/web.Dockerfile) — avoids
  // shipping the full monorepo node_modules tree.
  output: 'standalone',
  experimental: {
    // TS 7 (native compiler) doesn't expose the Program API Next's built-in
    // checker uses; the project's own `tsc -b` typecheck gate already runs
    // before build, so this just needs to invoke the TS CLI instead.
    useTypeScriptCli: true,
  },
  // SEC-003 (SEC headers) applied repository-wide, not per-route. A browser
  // only enforces Strict-Transport-Security when the response was actually
  // received over HTTPS, so it is safe to always send it — plain-HTTP
  // deployments (e.g. the Pi demo) simply have it ignored.
  //
  // Content-Security-Policy is deliberately NOT set here: it must carry a
  // fresh per-request nonce (script-src 'nonce-…') so Next.js's own inline
  // RSC-streaming bootstrap scripts (<script>self.__next_f.push(...)</script>,
  // required for hydration — not optional/decorative) are allowed without
  // 'unsafe-inline'. next.config.ts's headers() is evaluated once, not per
  // request, so it cannot generate that nonce — src/proxy.ts (Next's
  // middleware-equivalent, which runs per-request) sets CSP instead. See
  // proxy.ts for the full policy.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
