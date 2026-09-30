FROM node:26-alpine AS builder

ENV NODE_ENV=production

WORKDIR /app

RUN npm install --global pnpm@12.8.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY packages/typescript-configs/package.json ./packages/typescript-configs/
COPY packages/drizzle/package.json ./packages/drizzle/
COPY packages/proto/package.json ./packages/proto/
COPY packages/uke-importer/package.json ./packages/uke-importer/
COPY packages/shared/package.json ./packages/shared/
COPY apps/client/package.json ./apps/client/
COPY apps/db-migrate/package.json ./apps/db-migrate/
COPY apps/discord-bot/package.json ./apps/discord-bot/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile

COPY packages/typescript-configs ./packages/typescript-configs
COPY apps/discord-bot ./apps/discord-bot

RUN pnpm --filter @openbts/discord-bot build

FROM node:26-alpine

ENV NODE_ENV=production

WORKDIR /app

RUN npm install --global pnpm@12.8.1

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/typescript-configs/package.json ./packages/typescript-configs/
COPY --from=builder /app/packages/drizzle/package.json ./packages/drizzle/
COPY --from=builder /app/packages/proto/package.json ./packages/proto/
COPY --from=builder /app/packages/uke-importer/package.json ./packages/uke-importer/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/client/package.json ./apps/client/
COPY --from=builder /app/apps/db-migrate/package.json ./apps/db-migrate/
COPY --from=builder /app/apps/discord-bot/package.json ./apps/discord-bot/
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/discord-bot/dist ./apps/discord-bot/dist

RUN pnpm install --frozen-lockfile --prod --filter @openbts/discord-bot...

CMD ["node", "apps/discord-bot/dist/index.js"]
