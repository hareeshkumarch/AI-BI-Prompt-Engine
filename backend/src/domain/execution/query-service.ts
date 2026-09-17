import { logger } from "../../lib/logger";
import type { SqlDialect } from "../prompt-engine/types";
import type { CompiledQuery, PlanColumn } from "../semantic/query-plan";
import { duckDbExecutor } from "./duckdb-executor";
import { PostgresExecutor } from "./postgres-executor";
import { estimateBytes, normalizeResult } from "./normalize";
import { QueryExecutionError, type ExecutionResult, type QueryExecutor } from "./types";

const DEFAULT_TIMEOUT_MS = Number(process.env["QUERY_TIMEOUT_MS"] ?? 15_000);
const DEFAULT_MAX_ROWS = Number(process.env["QUERY_MAX_ROWS"] ?? 5_000);

export type RunOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRows?: number;
  cacheHit?: boolean;
};

let executor: QueryExecutor | null = null;

export function activeExecutor(): QueryExecutor {
  if (executor) return executor;
  const engine = process.env["DATA_ENGINE"];
  const connectionString = process.env["DATABASE_URL"];
  executor = engine === "postgres" && connectionString
    ? new PostgresExecutor(connectionString)
    : duckDbExecutor();
  logger.info({ engine: executor.name }, "Query engine selected");
  return executor;
}

export function setExecutor(next: QueryExecutor | null) {
  executor = next;
}

export function engineDialect(): SqlDialect {
  return activeExecutor().dialect;
}

async function run(
  sql: string,
  params: unknown[],
  planColumns: PlanColumn[],
  options: RunOptions,
): Promise<ExecutionResult> {
  const engine = activeExecutor();
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = performance.now();

  const raw = await engine.execute(sql, params, { signal: options.signal, timeoutMs, maxRows });
  const { columns, rows } = normalizeResult(raw, planColumns);
  const truncated = rows.length > maxRows;
  const visible = truncated ? rows.slice(0, maxRows) : rows;

  return {
    columns,
    rows: visible,
    rowCount: visible.length,
    truncated,
    stats: {
      engine: engine.name,
      dialect: engine.dialect,
      queryTimeMs: Math.round(performance.now() - started),
      databaseTimeMs: raw.databaseTimeMs,
      rowsReturned: visible.length,
      bytesReturned: estimateBytes(visible),
      truncated,
      cacheHit: options.cacheHit ?? false,
    },
  };
}

export function runCompiledQuery(compiled: CompiledQuery, options: RunOptions = {}) {
  return run(compiled.sql, compiled.params, compiled.plan.select, options);
}

export function runSql(sql: string, options: RunOptions = {}) {
  return run(sql, [], [], options);
}

export function executionErrorStatus(error: unknown) {
  if (!(error instanceof QueryExecutionError)) return 500;
  if (error.code === "TIMEOUT") return 504;
  if (error.code === "CANCELLED") return 499;
  if (error.code === "NOT_CONFIGURED") return 503;
  return 400;
}
