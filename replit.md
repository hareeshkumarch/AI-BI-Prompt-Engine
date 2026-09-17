# AI BI Studio

An AI-native BI workspace that turns plain-English questions into inspectable, safe SQL analyses and declarative visualizations.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/ai-bi-studio run dev` — run the frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Validation: Zod
- API codegen: Orval from OpenAPI
- Frontend: React + Vite, TanStack Query, Wouter, Tailwind CSS
- Build: esbuild for the API and Vite for the web app
- AI boundary: optional direct OpenAI support with a deterministic local fallback

## Where things live

- `artifacts/ai-bi-studio/src/` — web workspace, shell, pages, and visual system
- `artifacts/api-server/src/domain/prompt-engine/` — schema contextualization, guardrails, provider adapter, and orchestration pipeline
- `artifacts/api-server/src/routes/studio.ts` — studio API surface
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/api-client-react/` and `lib/api-zod/` — generated client hooks and server validation

## Architecture decisions

- Schema context is ranked and pruned before prompt construction to keep model input bounded and inspectable.
- SQL is rejected before execution unless it is a single read-only `SELECT` or `WITH` statement with an explicit `LIMIT` of 500 or less.
- The provider boundary supports a direct OpenAI key when configured but keeps a deterministic demo fallback so the workspace remains usable without a paid model connection.
- The first vertical slice uses an in-memory Northstar catalog and demo result executor; the adapter boundary is ready for real Postgres, MySQL, Snowflake, SQLite, or DuckDB drivers.

## Product

- Ask natural-language questions in Analyst mode or inspect SQL-only output.
- Review the stage-by-stage orchestration trace, generated SQL, result rows, and insight visualization.
- Explore token-pruned schema context and connection health.
- Repair a failed run with an explicit instruction and preserve the rerun trace.

## User preferences

- Build the frontend and backend with an advanced, production-oriented structure rather than a basic tutorial layout.

## Gotchas

- Regenerate API hooks and Zod schemas with `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- Artifact builds need workflow-provided `PORT` and `BASE_PATH`; use the managed workflow or provide both env vars for a shell build.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details