FROM node:26-alpine AS builder

WORKDIR /app

RUN npm install --global pnpm@12.8.1

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/typescript-configs/package.json ./packages/typescript-configs/
COPY packages/drizzle/package.json ./packages/drizzle/
COPY packages/uke-importer/package.json ./packages/uke-importer/
COPY packages/shared/package.json ./packages/shared/
COPY apps/client/package.json ./apps/client/
COPY apps/discord-bot/package.json ./apps/discord-bot/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy sources
COPY packages/typescript-configs ./packages/typescript-configs
COPY packages/shared ./packages/shared
COPY apps/client ./apps/client

# Build workspace packages
RUN pnpm --filter @openbts/shared build

WORKDIR /app/apps/client

# Build arguments
ARG VITE_API_URL
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_APP_NAME
ARG VITE_ADSENSE_CLIENT
ARG VITE_ADSENSE_MAP_MOBILE_SLOT
ARG COMMIT_SHA
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_ADSENSE_CLIENT=$VITE_ADSENSE_CLIENT
ENV VITE_ADSENSE_MAP_MOBILE_SLOT=$VITE_ADSENSE_MAP_MOBILE_SLOT
ENV COMMIT_SHA=$COMMIT_SHA

# Build
RUN pnpm run build

# Production Stage
FROM nginx:alpine
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
