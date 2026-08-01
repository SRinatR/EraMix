# apps/web production image.
#
# UNVERIFIED: this file has never been built or run — the laptop this was
# authored on has no Docker available (CLAUDE.md/session policy). Build and
# run it for the first time in the authorized Docker-capable session (the
# Raspberry Pi) before relying on it, per docs/IMPLEMENTATION_ROADMAP.md's
# Phase 7 exit criteria ("CI blocks release... staging smoke and production
# promotion evidence are retained").
#
# Build from the repository root:
#   docker build -f infra/docker/web.Dockerfile -t eramix-web .
syntax=docker/dockerfile:1

FROM node:24.18.1-alpine AS base
# Prisma's query engine (packages/infrastructure/prisma/schema.prisma
# binaryTargets: linux-musl-openssl-3.0.x) needs OpenSSL 3 on Alpine.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo
RUN corepack enable

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
