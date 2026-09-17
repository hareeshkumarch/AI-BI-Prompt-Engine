import type { Pool } from "pg";
import type { SqlDialect } from "../prompt-engine/types";
import { QueryExecutionError, type ExecuteOptions, type QueryExecutor, type RawResult } from "./types";

export class PostgresExecutor implements QueryExecutor {
  readonly name = "postgres";
  readonly dialect: SqlDialect = "postgresql";

  private pool: Pool | null = null;

  constructor(private readonly connectionString: string) {}

  private async getPool(): Promise<Pool> {
    if (!this.pool) {
      const pg = await import("pg");
      this.pool = new pg.default.Pool({ connectionString: this.connectionString, max: 8 });
    }
    return this.pool;
  }

  async execute(sql: string, params: unknown[], options: ExecuteOptions): Promise<RawResult> {
    const pool = await this.getPool();
    const client = await pool.connect();
    const started = performance.now();

    const abort = () => void client.query("SELECT pg_cancel_backend(pg_backend_pid())").catch(() => undefined);
    options.signal?.addEventListener("abort", abort, { once: true });

    try {
      await client.query(`SET LOCAL statement_timeout = ${Math.max(1, Math.trunc(options.timeoutMs))}`);
      const result = await client.query<Record<string, unknown>>(sql, params);
      return {
        columnNames: result.fields.map((field) => field.name),
        rows: result.rows,
        databaseTimeMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      if (options.signal?.aborted) throw new QueryExecutionError("CANCELLED", this.name, "Query cancelled.");
      const message = error instanceof Error ? error.message : "Query failed.";
      if (/statement timeout|canceling statement/i.test(message)) {
        throw new QueryExecutionError("TIMEOUT", this.name, `Query exceeded ${options.timeoutMs}ms.`);
      }
      throw new QueryExecutionError("ENGINE_ERROR", this.name, message);
    } finally {
      options.signal?.removeEventListener("abort", abort);
      client.release();
    }
  }

  async close() {
    await this.pool?.end();
    this.pool = null;
  }
}
