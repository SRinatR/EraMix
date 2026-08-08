# syntax=docker/dockerfile:1
#
# One-off `prisma migrate deploy` image — deliberately does NOT build
# apps/web or apps/worker (no Next.js/Turbopack build, which needs far more
# RAM than a small production host may have). Built and pushed by CI
# alongside the web/worker images; the server pulls and runs it as a
# one-shot container before starting web/worker, never as part of the
# default `docker compose up`.
#
# Build from the repository root:
#   docker build -f infra/docker/migrate.Dockerfile -t eramix-migrate .

FROM node:24.18.1-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo
# ADR-0011: Corepack has a confirmed, open upstream bug (nodejs/corepack#873)
# fetching pnpm@12 alpha/beta releases (MODULE_NOT_FOUND) — install the
# exact pinned version directly via npm instead of `corepack enable`.
RUN npm install -g pnpm@12.0.0-beta.2

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/domain/package.json packages/domain/package.json
COPY packages/application/package.json packages/application/package.json
COPY packages/infrastructure/package.json packages/infrastructure/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS runtime
# .dockerignore (ADR-0016) excludes .env/.env.*/.env.keys from this build
# context entirely.
COPY packages/domain packages/domain
COPY packages/application packages/application
COPY packages/infrastructure packages/infrastructure
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @eramix/infrastructure run db:generate
ENV NODE_ENV=production
WORKDIR /repo/packages/infrastructure
# The real DATABASE_URL is injected as a container env var at run time,
# overriding the placeholder above (needed only so `prisma generate` above
# had something resolvable to read).
ENTRYPOINT ["pnpm", "run", "db:migrate:deploy"]
