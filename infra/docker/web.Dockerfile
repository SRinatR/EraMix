# syntax=docker/dockerfile:1
#
# apps/web production image.
#
# UNVERIFIED locally: no Docker on the authoring laptop (CLAUDE.md/session
# policy) — first built and exercised by CI's docker-build job
# (.github/workflows/ci.yml), not this laptop or the Pi. Run it for the
# first time against a real deployment target in the authorized
# Docker-capable session before relying on it there.
#
# Build from the repository root:
#   docker build -f infra/docker/web.Dockerfile -t eramix-web .

FROM node:24.18.1-alpine AS base
# Prisma's query engine (packages/infrastructure/prisma/schema.prisma
# binaryTargets: linux-musl-openssl-3.0.x) needs OpenSSL 3 on Alpine.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo
# ADR-0011: Corepack has a confirmed, open upstream bug (nodejs/corepack#873)
# fetching pnpm@12 alpha/beta releases (MODULE_NOT_FOUND) — install the
# exact pinned version directly via npm instead of `corepack enable`.
RUN npm install -g pnpm@12.0.0-beta.2

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/application/package.json packages/application/package.json
COPY packages/infrastructure/package.json packages/infrastructure/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NODE_ENV=production
# `prisma generate` needs DATABASE_URL merely resolvable (prisma.config.ts's
# env('DATABASE_URL') throws if entirely unset), never actually reachable —
# the real value is injected at container runtime, not build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @eramix/infrastructure run db:generate
RUN pnpm --filter @eramix/web... run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
