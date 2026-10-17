FROM node:26-alpine AS builder

ENV NODE_ENV=production

WORKDIR /app

RUN npm install --global pnpm@12.8.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY packages/typescript-configs/package.json ./packages/typescript-configs/
COPY packages/drizzle/package.json ./packages/drizzle/
COPY packages/shared/package.json ./packages/shared/
COPY packages/country-packs/package.json ./packages/country-packs/
COPY apps/client/package.json ./apps/client/
COPY apps/discord-bot/package.json ./apps/discord-bot/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile

COPY packages/typescript-configs ./packages/typescript-configs
COPY packages/drizzle ./packages/drizzle
COPY packages/shared ./packages/shared
COPY packages/country-packs ./packages/country-packs
COPY apps/server ./apps/server

RUN pnpm --filter @openbts/drizzle build && \
    pnpm --filter @openbts/shared build && \
    pnpm --filter @openbts/country-packs build && \
    pnpm --filter @openbts/sora build

FROM node:26-alpine AS production-deps

ENV NODE_ENV=production

WORKDIR /app

RUN npm install --global pnpm@12.8.1

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/typescript-configs/package.json ./packages/typescript-configs/
COPY --from=builder /app/packages/drizzle/package.json ./packages/drizzle/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/country-packs/package.json ./packages/country-packs/
COPY --from=builder /app/apps/client/package.json ./apps/client/
COPY --from=builder /app/apps/discord-bot/package.json ./apps/discord-bot/
COPY --from=builder /app/apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile --prod --filter @openbts/sora...

FROM node:26-alpine

ENV NODE_ENV=production

WORKDIR /app

RUN apk add --no-cache font-noto

COPY --from=oven/bun:alpine /usr/local/bin/bun /usr/local/bin/bun
COPY --from=production-deps /app ./
COPY --from=builder /app/packages/drizzle/dist ./packages/drizzle/dist
COPY --from=builder /app/packages/drizzle/migrations ./packages/drizzle/migrations
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/country-packs/dist ./packages/country-packs/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY apps/server/static ./static
COPY apps/server/docker/docker-entrypoint.sh ./
COPY apps/server/docker/docker-migrate.sh ./

RUN chmod +x docker-entrypoint.sh docker-migrate.sh

EXPOSE 3030 3040
CMD ["./docker-entrypoint.sh"]
