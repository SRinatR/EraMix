# syntax=docker/dockerfile:1
#
# apps/worker (transactional outbox dispatcher) production image.
#
# UNVERIFIED locally: no Docker on the authoring laptop — see
# infra/docker/web.Dockerfile's header. First built by CI's docker-build
# job, not this laptop or the Pi. Verify against a real deployment target
# in the authorized Docker-capable session before relying on it there.
#
# Build from the repository root:
#   docker build -f infra/docker/worker.Dockerfile -t eramix-worker .

FROM node:24.18.1-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo
# ADR-0011: Corepack has a confirmed, open upstream bug (nodejs/corepack#873)
# fetching pnpm@12 alpha/beta releases (MODULE_NOT_FOUND) — install the
# exact pinned version directly via npm instead of `corepack enable`.
RUN npm install -g pnpm@12.0.0-beta.2

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/application/package.json packages/application/package.json
COPY packages/infrastructure/package.json packages/infrastructure/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NODE_ENV=production
# `prisma generate` needs DATABASE_URL merely resolvable (prisma.config.ts's
# env('DATABASE_URL') throws if entirely unset), never actually reachable —
# the real value is injected at container runtime, not build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @eramix/infrastructure run db:generate
RUN pnpm --filter @eramix/worker... run build
RUN pnpm --filter @eramix/worker deploy --prod /repo/out

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 worker
COPY --from=build --chown=worker:nodejs /repo/out ./
USER worker
CMD ["node", "dist/main.js"]
