FROM node:26-alpine AS builder

ENV NODE_ENV=production

WORKDIR /app

RUN npm install --global pnpm@12.3.4

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY packages/typescript-configs/package.json ./packages/typescript-configs/
COPY apps/discord-bot/package.json ./apps/discord-bot/

RUN pnpm install --frozen-lockfile

COPY packages/typescript-configs ./packages/typescript-configs
COPY apps/discord-bot ./apps/discord-bot

RUN pnpm --filter @openbts/discord-bot build

FROM node:26-alpine

ENV NODE_ENV=production

WORKDIR /app

RUN npm install --global pnpm@12.3.4

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/typescript-configs/package.json ./packages/typescript-configs/
COPY --from=builder /app/apps/discord-bot/package.json ./apps/discord-bot/
COPY --from=builder /app/apps/discord-bot/dist ./apps/discord-bot/dist

RUN pnpm install --frozen-lockfile --prod

CMD ["node", "apps/discord-bot/dist/index.js"]
