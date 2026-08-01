import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

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
