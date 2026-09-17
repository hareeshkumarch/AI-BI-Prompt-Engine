# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./

# Copy shared libs
COPY lib/ ./lib/

# Copy backend
COPY backend/ ./backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the backend
RUN pnpm --filter @workspace/api-server run build

# ---- Stage 2: Production Runtime ----
FROM node:22-alpine AS production

WORKDIR /app

# Copy the built bundle
COPY --from=builder /app/backend/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
