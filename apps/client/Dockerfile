FROM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.0.6 --activate

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/typescript-configs/package.json ./packages/typescript-configs/
COPY packages/shared/package.json ./packages/shared/
COPY packages/proto/package.json ./packages/proto/
COPY apps/client/package.json ./apps/client/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy sources
COPY packages/typescript-configs ./packages/typescript-configs
COPY packages/shared ./packages/shared
COPY packages/proto ./packages/proto
COPY apps/client ./apps/client

# Build workspace packages
RUN pnpm --filter @openbts/shared build && \
    pnpm --filter @openbts/proto build

WORKDIR /app/apps/client

# Build arguments
ARG VITE_API_URL
ARG VITE_MAPBOX_ACCESS_TOKEN
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_APP_NAME
ARG VITE_ADSENSE_CLIENT
ARG COMMIT_SHA
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MAPBOX_ACCESS_TOKEN=$VITE_MAPBOX_ACCESS_TOKEN
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_ADSENSE_CLIENT=$VITE_ADSENSE_CLIENT
ENV COMMIT_SHA=$COMMIT_SHA

# Build
RUN pnpm run build

# Production Stage
FROM nginx:alpine
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
