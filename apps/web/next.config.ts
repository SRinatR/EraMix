import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// SEC-003 ("CSP, безопасный output encoding, ... и запрет unsafe eval
// снижают риск XSS"): 'unsafe-eval' is only ever allowed outside
// production, since Turbopack's dev-mode HMR runtime needs it; the
// production bundle this policy actually protects never gets it.
const isProduction = process.env.NODE_ENV === 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self'${isProduction ? '' : " 'unsafe-eval'"}`,
  // 'unsafe-inline' on style-src only — Next.js injects small inline
  // <style> tags for its own optimizations; no inline <script> is ever
  // allowed regardless of environment.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
  // SEC-003 (CSP/XSS) applied repository-wide, not per-route. A browser only
  // enforces Strict-Transport-Security when the response was actually
  // received over HTTPS, so it is safe to always send it — plain-HTTP
  // deployments (e.g. the Pi demo) simply have it ignored.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
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
