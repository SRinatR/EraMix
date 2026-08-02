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
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
