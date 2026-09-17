# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./

# Copy shared libs
COPY lib/ ./lib/

# Copy frontend
COPY frontend/ ./frontend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Set build-time env vars
ENV PORT=80
ENV BASE_PATH=/

# Build the frontend
RUN pnpm --filter @workspace/ai-bi-studio run build

# ---- Stage 2: Serve with Nginx ----
FROM nginx:alpine AS production

# Nginx renders this template through envsubst at container start
COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template

ENV BACKEND_ORIGIN=http://backend:3000
ENV DNS_RESOLVER=127.0.0.11

# Copy built static assets
COPY --from=builder /app/frontend/dist/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
