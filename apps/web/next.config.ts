import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Monorepo-wide .env lives at the repository root, not per-app (mirrors
// packages/infrastructure/prisma.config.ts) — Next.js only auto-loads a
// .env colocated with this file, so apps/web needs its own explicit load.
loadDotenv({ path: path.join(import.meta.dirname, '..', '..', '.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // TS 7 (native compiler) doesn't expose the Program API Next's built-in
    // checker uses; the project's own `tsc -b` typecheck gate already runs
    // before build, so this just needs to invoke the TS CLI instead.
    useTypeScriptCli: true,
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
