import type { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import type { SqlDialect } from "../prompt-engine/types";
import { SEED_STATEMENTS } from "./duckdb-seed";
import { QueryExecutionError, type ExecuteOptions, type QueryExecutor, type RawResult } from "./types";

export class DuckDbExecutor implements QueryExecutor {
  readonly name = "duckdb";
  readonly dialect: SqlDialect = "duckdb";

  private instance: DuckDBInstance | null = null;
  private ready: Promise<void> | null = null;

  constructor(private readonly seed: string[] = SEED_STATEMENTS) {}

  private async initialize() {
    if (!this.ready) {
      this.ready = (async () => {
        const { DuckDBInstance } = await import("@duckdb/node-api");
        this.instance = await DuckDBInstance.create(":memory:");
        const connection = await this.instance.connect();
        try {
          for (const statement of this.seed) await connection.run(statement);
        } finally {
          connection.closeSync();
        }
      })();
    }
    await this.ready;
  }

  async execute(sql: string, params: unknown[], options: ExecuteOptions): Promise<RawResult> {
    await this.initialize();
    if (!this.instance) throw new QueryExecutionError("ENGINE_ERROR", this.name, "DuckDB failed to start.");

    const connection = await this.instance.connect();
    const started = performance.now();

    const abort = () => connection.interrupt();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, options.timeoutMs);

    try {
      const reader = await connection.runAndReadAll(sql, params as never[]);
      return {
        columnNames: reader.columnNames(),
        rows: reader.getRowObjects() as Record<string, unknown>[],
        databaseTimeMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      if (options.signal?.aborted) throw new QueryExecutionError("CANCELLED", this.name, "Query cancelled.");
      const elapsed = performance.now() - started;
      if (elapsed >= options.timeoutMs) {
        throw new QueryExecutionError("TIMEOUT", this.name, `Query exceeded ${options.timeoutMs}ms.`);
      }
      throw new QueryExecutionError("ENGINE_ERROR", this.name, error instanceof Error ? error.message : "Query failed.");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      connection.closeSync();
    }
  }

  async close() {
    this.instance?.closeSync();
    this.instance = null;
    this.ready = null;
  }
}

let shared: DuckDbExecutor | null = null;

export function duckDbExecutor() {
  shared ??= new DuckDbExecutor();
  return shared;
}
