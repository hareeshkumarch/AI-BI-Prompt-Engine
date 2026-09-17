# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root config
COPY package.json pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./

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

# Copy custom nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=builder /app/frontend/dist/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
