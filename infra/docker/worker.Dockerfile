# apps/worker (transactional outbox dispatcher) production image.
#
# UNVERIFIED: never built or run — see infra/docker/web.Dockerfile's header
# for why (no Docker on the authoring laptop). Verify in the authorized
# Docker-capable session before relying on it.
#
# Build from the repository root:
#   docker build -f infra/docker/worker.Dockerfile -t eramix-worker .
syntax=docker/dockerfile:1

FROM node:24.18.1-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo
RUN corepack enable

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
RUN pnpm --filter @eramix/infrastructure run db:generate
RUN pnpm --filter @eramix/worker... run build
RUN pnpm --filter @eramix/worker deploy --prod /repo/out

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 worker
COPY --from=build --chown=worker:nodejs /repo/out ./
USER worker
CMD ["node", "dist/main.js"]
