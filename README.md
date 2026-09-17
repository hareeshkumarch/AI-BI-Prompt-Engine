# AI BI Prompt Engine

An AI-native Business Intelligence workspace that turns plain-English questions into inspectable, safe SQL analyses and declarative visualizations.

## ✨ Features

- **Natural Language Queries** — Ask questions in plain English; the engine generates safe, read-only SQL
- **SQL Guardrails** — SQL is validated before execution: single `SELECT`/`WITH`, explicit `LIMIT ≤ 500`
- **Schema Contextualization** — Schema context is ranked and pruned for optimal prompt construction
- **Orchestration Pipeline** — Full stage-by-stage trace from question → SQL → results → visualization
- **AI Provider Flexibility** — Supports OpenAI with a deterministic local fallback for demo/testing
- **Interactive Visualizations** — Insight charts powered by Recharts

## 🏗️ Architecture

```
AI-BI-Prompt-Engine/
├── frontend/                # React + Vite + Tailwind CSS (SPA)
│   ├── src/
│   │   ├── components/      # UI components (Radix UI + shadcn)
│   │   ├── pages/           # Application pages
│   │   ├── hooks/           # Custom React hooks
│   │   └── lib/             # Utilities
│   ├── Dockerfile           # Multi-stage: build → Nginx
│   └── vite.config.ts
│
├── backend/                 # Express 5 API server
│   ├── src/
│   │   ├── domain/          # Business logic
│   │   │   └── prompt-engine/
│   │   │       ├── catalog.ts              # Schema catalog
│   │   │       ├── llm-provider.ts         # AI provider adapter
│   │   │       ├── orchestrator.ts         # Pipeline orchestration
│   │   │       ├── schema-contextualizer.ts
│   │   │       ├── sql-guardrails.ts       # SQL safety validation
│   │   │       └── types.ts
│   │   ├── routes/          # API routes
│   │   ├── middlewares/
│   │   └── lib/             # Shared utilities (logger, etc.)
│   ├── Dockerfile           # Multi-stage: build → Node.js
│   └── build.mjs            # esbuild configuration
│
├── lib/                     # Shared workspace packages
│   ├── api-spec/            # OpenAPI spec + Orval codegen
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod schemas
│   └── db/                  # Drizzle ORM + PostgreSQL schema
│
├── docker-compose.yml       # Frontend + Backend + PostgreSQL
├── pnpm-workspace.yaml      # pnpm workspace configuration
└── tsconfig.base.json       # Shared TypeScript config
```

## 🛠️ Tech Stack

| Layer       | Technology                                         |
| ----------- | -------------------------------------------------- |
| Frontend    | React, Vite, Tailwind CSS, TanStack Query, Wouter  |
| Backend     | Express 5, Pino (logging), esbuild                 |
| Database    | PostgreSQL, Drizzle ORM                             |
| Validation  | Zod                                                 |
| API Codegen | Orval (from OpenAPI spec)                           |
| Runtime     | Node.js 22, TypeScript 5.9, pnpm workspaces        |
| DevOps      | Docker, Docker Compose, Nginx                       |

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 22
- **pnpm** ≥ 9
- **Docker** & **Docker Compose** (for containerized deployment)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/hareeshkumarch/AI-BI-Prompt-Engine.git
cd AI-BI-Prompt-Engine

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your database URL and optional OpenAI API key

# 4. Start the frontend (port 5173)
pnpm dev:frontend

# 5. Start the backend (port 3000) — in a separate terminal
pnpm dev:backend
```

### Docker Deployment

```bash
# Build and start all services (frontend, backend, PostgreSQL)
docker compose up --build

# Services will be available at:
#   Frontend → http://localhost:5173
#   Backend  → http://localhost:3000
#   Postgres → localhost:5432
```

### Useful Commands

```bash
# Full typecheck across all packages
pnpm run typecheck

# Build all packages
pnpm run build

# Regenerate API hooks & Zod schemas after changing the OpenAPI spec
pnpm run codegen
```

## 🔧 Environment Variables

| Variable        | Description                                    | Default                  |
| --------------- | ---------------------------------------------- | ------------------------ |
| `PORT`          | Backend server port                            | `3000`                   |
| `DATABASE_URL`  | PostgreSQL connection string                   | —                        |
| `OPENAI_API_KEY`| OpenAI API key (optional — fallback available) | —                        |

## 📄 License

MIT
