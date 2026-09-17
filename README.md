# AI BI Prompt Engine

An AI-native Business Intelligence workspace that turns plain-English questions into inspectable, safe SQL analyses and declarative visualizations.

## ✨ Features

- **Natural Language Queries** — Ask questions in plain English; the engine generates safe, read-only SQL
- **SQL Guardrails** — SQL is validated before execution: single `SELECT`/`WITH`, explicit `LIMIT ≤ 500`
- **Schema Contextualization** — Schema context is ranked and pruned for optimal prompt construction
- **Orchestration Pipeline** — Full stage-by-stage trace from question → SQL → results → visualization
- **AI Provider Flexibility** — Supports OpenAI with a deterministic local fallback for demo/testing
- **Typed Result Schema** — Every result column is profiled into a semantic type (temporal / quantitative / nominal / ordinal / boolean / identifier) with cardinality, null rate, monotonicity and temporal grain
- **Auto-Mapping Engine** — A declarative catalog of 20 chart types, each stating the field roles it requires; the mapper binds columns to encoding channels, scores the candidates and returns a primary chart plus every viable alternative
- **Interactive Visualizations** — Charts rendered from the server-side encoding with Recharts, switchable in place between the alternatives the data supports

> **Note on execution.** The `execute` stage currently returns a bounded demo result set from the
> in-memory catalog rather than issuing the generated SQL against a live warehouse. Everything
> upstream of it — contextualization, generation, and the guardrails — runs for real.

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
│   ├── nginx.conf.template  # SPA serving + /api reverse proxy (envsubst)
│   └── vite.config.ts       # Dev server proxies /api to the backend
│
├── backend/                 # Express 5 API server
│   ├── src/
│   │   ├── domain/          # Business logic
│   │   │   └── prompt-engine/
│   │   │       ├── catalog.ts              # Schema catalog
│   │   │       ├── chart-catalog.ts         # 20 chart types + data requirements
│   │   │       ├── chart-mapper.ts          # Column → encoding-channel binding
│   │   │       ├── data-profile.ts          # Semantic type inference per column
│   │   │       ├── insight-synthesizer.ts   # Profile → insights + chart choice
│   │   │       ├── llm-provider.ts         # AI provider adapter
│   │   │       ├── orchestrator.ts         # Pipeline orchestration
│   │   │       ├── schema-contextualizer.ts
│   │   │       ├── sql-guardrails.ts       # SQL safety validation
│   │   │       ├── types.ts
│   │   │       └── __tests__/              # Guardrail, profiler, mapper + orchestrator tests
│   │   ├── routes/          # API routes
│   │   ├── middlewares/      # JSON 404 + error handlers
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

## 📊 Chart selection

Chart choice is **derived from the result set, never guessed**. Three stages:

1. **Profile** (`data-profile.ts`) — each column gets a semantic type and statistics:

   | Type | Meaning | Detected from |
   | ---- | ------- | ------------- |
   | `temporal` | a point in time | ISO date patterns (`2026-01`, `2026-Q1`, `2026-W03`, `2026-03-02`), `Date` values, or a year-named integer |
   | `quantitative` | a measure | every non-null value parses as a finite number |
   | `nominal` | unordered category | text with no ordering signal |
   | `ordinal` | ordered category | a known vocabulary (sizes, tiers, weekdays) or an ordering-shaped name (`stage`, `tier`, `band`) |
   | `boolean` | two-state flag | `true`/`false`/`yes`/`no` |
   | `identifier` | a key, not a measure | near-unique values under an id-shaped name — kept out of the measure pool |

2. **Match** (`chart-catalog.ts`) — each chart declares what it needs: how many axis fields, how many of those may be temporal, how many measures, row and category ceilings, and an optional predicate (a funnel requires an ordered stage field *and* a monotonically decreasing measure; a pie requires non-negative values and at most six slices).

3. **Bind and rank** (`chart-mapper.ts`) — every chart whose requirements are met gets its columns bound to encoding channels (`x`, `y`, `series`, `size`), then scored. Effectiveness adjustments run here: long category labels push a bar horizontal, many categories favour a treemap, a dense time axis favours a line.

The pipeline returns the winning encoding **plus every runner-up**, so the UI can offer an in-place switcher that only ever lists charts the data actually supports.

### Supported chart types

| Family | Charts |
| ------ | ------ |
| Summary | `kpi`, `table` |
| Trend | `line`, `multi_line`, `area` |
| Comparison | `bar`, `bar_horizontal`, `grouped_bar`, `heatmap`, `radar` |
| Composition | `stacked_area`, `stacked_bar`, `stacked_bar_100`, `pie`, `donut`, `funnel`, `treemap` |
| Distribution | `histogram` |
| Relationship | `scatter`, `bubble` |

Multi-series charts take their series either from extra measure columns (wide format) or from a second categorical column, which the renderer pivots (long format).

### Chart colour

Series colours come from eight fixed slots (`--series-1` … `--series-8` in `frontend/src/index.css`), assigned in order and never cycled. The order is the colourblind-safety mechanism: it was selected by search and validated in both light and dark modes (worst adjacent CVD ΔE 13.0 against a target of 8; worst normal-vision ΔE 19.3 against a floor of 15). Magnitude encodings — heatmap cells, treemap tiles, funnel stages — use the single-hue `--ramp-1` … `--ramp-5` ramp instead, with `--ramp-N-ink` giving a legible text colour on each step. **Re-run the palette validator before changing any of these values.**

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

# 4. Start the backend (port 3000)
pnpm dev:backend

# 5. Start the frontend (port 5173) — in a separate terminal
pnpm dev:frontend
```

The frontend calls the API on a relative `/api` path. The Vite dev server proxies that to the
backend (`API_PROXY_TARGET`, default `http://localhost:3000`), and in Docker Nginx proxies it to
the `backend` service — so both processes need to be running.

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

# Run the test suites
pnpm run test

# Format (or check formatting) across the workspace
pnpm run format
pnpm run format:check

# Build all packages
pnpm run build

# Regenerate API hooks & Zod schemas after changing the OpenAPI spec
pnpm run codegen
```

## 🔧 Environment Variables

### Backend

| Variable            | Description                                            | Default          |
| ------------------- | ------------------------------------------------------ | ---------------- |
| `PORT`              | Backend server port                                    | `3000`           |
| `DATABASE_URL`      | PostgreSQL connection string                           | —                |
| `OPENAI_API_KEY`    | OpenAI API key (optional — deterministic fallback)     | —                |
| `OPENAI_MODEL`      | Model used for SQL generation                          | `gpt-4.1-mini`   |
| `OPENAI_TIMEOUT_MS` | Abort the generation call after this long              | `20000`          |
| `CORS_ORIGIN`       | Comma-separated allowed origins, or `*`                | `*`              |
| `LOG_LEVEL`         | Pino log level                                         | `info`           |

### Frontend

| Variable            | Description                                            | Default                  |
| ------------------- | ------------------------------------------------------ | ------------------------ |
| `PORT`              | Dev/preview server port                                | `5173`                   |
| `BASE_PATH`         | Public base path for the built SPA                     | `/`                      |
| `API_PROXY_TARGET`  | Where the dev/preview server proxies `/api`            | `http://localhost:3000`  |
| `BACKEND_ORIGIN`    | Where the Nginx container proxies `/api` (runtime)     | `http://backend:3000`    |

## 📄 License

MIT
