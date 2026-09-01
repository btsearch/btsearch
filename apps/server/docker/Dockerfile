FROM node:24-alpine AS builder

ENV NODE_ENV=production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY packages/typescript-configs/package.json ./packages/typescript-configs/
COPY packages/drizzle/package.json ./packages/drizzle/
COPY packages/proto/package.json ./packages/proto/
COPY packages/uke-importer/package.json ./packages/uke-importer/
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile

COPY packages/typescript-configs ./packages/typescript-configs
COPY packages/drizzle ./packages/drizzle
COPY packages/proto ./packages/proto
COPY packages/uke-importer ./packages/uke-importer
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

RUN pnpm --filter @openbts/drizzle build && \
    pnpm --filter @openbts/uke-importer build && \
    pnpm --filter @openbts/shared build && \
    pnpm --filter @openbts/proto build && \
    pnpm --filter @openbts/sora build

FROM node:24-alpine AS production-deps

ENV NODE_ENV=production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/drizzle/package.json ./packages/drizzle/
COPY --from=builder /app/packages/proto/package.json ./packages/proto/
COPY --from=builder /app/packages/uke-importer/package.json ./packages/uke-importer/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile --prod

FROM oven/bun:alpine

ENV NODE_ENV=production

WORKDIR /app

RUN apk add --no-cache font-noto

COPY --from=production-deps /app ./
COPY --from=builder /app/packages/drizzle/dist ./packages/drizzle/dist
COPY --from=builder /app/packages/drizzle/migrations ./packages/drizzle/migrations
COPY --from=builder /app/packages/uke-importer/dist ./packages/uke-importer/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/proto/dist ./packages/proto/dist
COPY --from=builder /app/packages/proto/src/gen ./packages/proto/src/gen
COPY --from=builder /app/packages/uke-importer/poland.voivodeships.max.json ./packages/uke-importer/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY apps/server/static ./static
COPY apps/server/docker/docker-entrypoint.sh ./
COPY apps/server/docker/docker-migrate.sh ./

RUN chmod +x docker-entrypoint.sh docker-migrate.sh

EXPOSE 3030 3040
CMD ["./docker-entrypoint.sh"]
