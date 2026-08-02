import { defineConfig, env } from 'prisma/config';

// Monorepo-wide .env lives at the repository root, not per-package. Local
// dev/test invocations of the `db:*` scripts go through a
// `dotenvx run -f ../../.env --` wrapper in package.json (see ADR-0016)
// instead of loading it here — by the time this config module runs,
// process.env is already populated. CI/Docker/the Pi scripts never rely on a
// .env file; they set DATABASE_URL directly in the job/container/shell env.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
